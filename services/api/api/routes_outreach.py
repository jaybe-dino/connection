"""Reviewed Gmail outreach. Network attempts are committed before sending; never replay uncertain delivery."""
import re
from uuid import UUID
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from .auth import current_user, require_brand
from .db import connect
from . import routes_gmail as gmail

router = APIRouter()
EMAIL = re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")


def guard(brand, authorization):
    u = current_user(authorization)
    if not u or u.get('otp') == 'pending':
        raise HTTPException(401, '로그인이 필요합니다')
    require_brand(brand, authorization, '')
    return str(u.get('sub') or u.get('user_id') or u.get('kind'))


class Draft(BaseModel):
    recipients: list[str] = Field(min_length=1, max_length=20)
    subject: str = Field(min_length=1, max_length=150)
    body: str = Field(min_length=1, max_length=10000)


def batch_out(conn, row):
    recipients = conn.execute('SELECT recipient_id,email,state,sent_at FROM outreach_recipients WHERE batch_id=%s ORDER BY email', (row['batch_id'],)).fetchall()
    return {'id': str(row['batch_id']), 'subject': row['subject'], 'body': row['body'],
            'state': row['state'], 'recipients': [{'id': str(r['recipient_id']), 'email': r['email'], 'state': r['state']} for r in recipients]}


@router.get('/brands/{brand}/outreach')
def list_batches(brand: str, authorization: str = Header(default='')):
    guard(brand, authorization)
    with connect() as conn:
        rows = conn.execute('SELECT * FROM outreach_batches WHERE brand_id=%s ORDER BY created_at DESC LIMIT 30', (brand,)).fetchall()
        return {'batches': [batch_out(conn, r) for r in rows], 'inboundReady': gmail._inbound_ready()}


@router.post('/brands/{brand}/outreach')
def create_batch(brand: str, body: Draft, authorization: str = Header(default='')):
    actor = guard(brand, authorization)
    emails = sorted(set(e.strip().lower() for e in body.recipients))
    if any(len(e)>254 or not EMAIL.fullmatch(e) for e in emails):
        raise HTTPException(400, '이메일 형식을 확인하세요')
    if not body.subject.strip() or not body.body.strip() or any(c in body.subject for c in '\r\n'):
        raise HTTPException(400, '제목과 본문을 확인하세요')
    with connect() as conn:
        b = conn.execute('SELECT brand_id FROM brands WHERE brand_id=%s', (brand,)).fetchone()
        if not b: raise HTTPException(404, '브랜드 없음')
        r = conn.execute('INSERT INTO outreach_batches(brand_id,subject,body,created_by) VALUES(%s,%s,%s,%s) RETURNING *', (brand,body.subject.strip(),body.body.strip(),actor)).fetchone()
        for e in emails:
            conn.execute('INSERT INTO outreach_optouts(brand_id,email) VALUES(%s,%s) ON CONFLICT DO NOTHING',(brand,e))
            conn.execute('INSERT INTO outreach_recipients(batch_id,email) VALUES(%s,%s)',(r['batch_id'],e))
        return batch_out(conn,r)


@router.post('/brands/{brand}/outreach/{batch_id}/cancel')
def cancel_batch(brand: str, batch_id: UUID, authorization: str = Header(default='')):
    guard(brand,authorization)
    with connect() as conn:
        r=conn.execute("UPDATE outreach_batches SET state='cancelled' WHERE batch_id=%s AND brand_id=%s AND state='draft' RETURNING *",(batch_id,brand)).fetchone()
        if not r: raise HTTPException(409,'발송 승인 전 초안만 취소할 수 있습니다')
    return {'ok': True}


@router.post('/brands/{brand}/outreach/{batch_id}/send')
def send_batch(brand: str, batch_id: UUID, authorization: str = Header(default='')):
    actor=guard(brand,authorization)
    if gmail._demo_mode(): raise HTTPException(503,'실제 Gmail 연결이 필요합니다')
    with connect() as conn:
        b=conn.execute('SELECT * FROM outreach_batches WHERE batch_id=%s AND brand_id=%s FOR UPDATE',(batch_id,brand)).fetchone()
        if not b: raise HTTPException(404,'초안 없음')
        if b['state']=='cancelled': raise HTTPException(409,'취소된 초안입니다')
        account=conn.execute("SELECT account_id FROM gmail_accounts WHERE brand_id=%s AND state='connected' LIMIT 1",(brand,)).fetchone()
        if not account: raise HTTPException(409,'Gmail을 먼저 연결하세요')
        conn.execute("UPDATE outreach_batches SET state='approved',approved_by=%s,approved_at=COALESCE(approved_at,now()) WHERE batch_id=%s",(actor,batch_id))
        ids=conn.execute("SELECT recipient_id FROM outreach_recipients WHERE batch_id=%s AND state='pending' ORDER BY email",(batch_id,)).fetchall()
    for item in ids:
        # A brand-wide lock also prevents two batches racing the same recipient.
        with connect() as conn:
            conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('outreach:'+brand,))
            r=conn.execute("SELECT * FROM outreach_recipients WHERE recipient_id=%s AND state='pending' FOR UPDATE",(item['recipient_id'],)).fetchone()
            if not r: continue
            opt=conn.execute('SELECT * FROM outreach_optouts WHERE brand_id=%s AND email=%s',(brand,r['email'])).fetchone()
            duplicate=conn.execute("SELECT 1 FROM outreach_recipients r JOIN outreach_batches b USING(batch_id) WHERE b.brand_id=%s AND r.email=%s AND r.recipient_id<>%s AND r.state IN ('sending','sent','review') AND b.created_at>now()-interval '90 days' LIMIT 1",(brand,r['email'],r['recipient_id'])).fetchone()
            if opt['opted_out_at'] or duplicate:
                conn.execute("UPDATE outreach_recipients SET state='blocked' WHERE recipient_id=%s",(r['recipient_id'],));continue
            conn.execute("UPDATE outreach_recipients SET state='sending' WHERE recipient_id=%s",(r['recipient_id'],))
        try:
            message=b['body']+'\n\n수신 거부 / Unsubscribe: https://api.theprlist.net/outreach/unsubscribe/'+str(opt['token'])
            with connect() as conn:
                sent=gmail.send_via_brand_gmail(conn,brand,r['email'],b['subject'],message)
                if sent and sent['via']=='gmail':
                    conn.execute("UPDATE outreach_recipients SET state='sent',sent_at=now(),provider_id=%s WHERE recipient_id=%s",(sent.get('messageId'),r['recipient_id']))
                    thread=conn.execute("INSERT INTO mail_threads(brand_id,creator_email,subject) VALUES(%s,%s,%s) ON CONFLICT(brand_id,creator_email) DO UPDATE SET subject=EXCLUDED.subject,last_direction='out',last_message_at=now() RETURNING thread_id",(brand,r['email'],b['subject'])).fetchone()
                    conn.execute("INSERT INTO mail_messages(thread_id,direction,from_email,to_email,subject,body,state,sent_via) VALUES(%s,'out',%s,%s,%s,%s,'sent','gmail')",(thread['thread_id'],sent['fromEmail'],r['email'],b['subject'],message))
                else:
                    # No network call was made: safe to resume after reconnect/quota reset.
                    conn.execute("UPDATE outreach_recipients SET state='pending' WHERE recipient_id=%s",(r['recipient_id'],))
                    break
        except Exception:
            with connect() as conn:
                conn.execute("UPDATE outreach_recipients SET state='review' WHERE recipient_id=%s",(r['recipient_id'],))
            break
    with connect() as conn:
        return batch_out(conn,conn.execute('SELECT * FROM outreach_batches WHERE batch_id=%s',(batch_id,)).fetchone())


@router.get('/outreach/unsubscribe/{token}',response_class=HTMLResponse)
def unsubscribe_page(token: UUID):
    return HTMLResponse('<html lang="ko"><meta charset="utf-8"><title>수신 거부</title><h1>이 브랜드의 메일 수신 거부</h1><form method="post"><button type="submit">수신 거부 / Unsubscribe</button></form></html>')


@router.post('/outreach/unsubscribe/{token}',response_class=HTMLResponse)
def unsubscribe(token: UUID):
    with connect() as conn:
        r=conn.execute('UPDATE outreach_optouts SET opted_out_at=now() WHERE token=%s RETURNING email',(token,)).fetchone()
        if not r: raise HTTPException(404,'유효하지 않은 링크')
    return HTMLResponse('<meta charset="utf-8"><p>수신 거부가 완료되었습니다.</p>')
