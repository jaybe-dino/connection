"""Evidence-backed global contact stops. Never sends, unblocks, or raises quotas."""
import re
from .db import ledger_append


def blocked(conn, email):
    return bool(conn.execute('SELECT 1 FROM outreach_contact_blocks WHERE email=%s',
                             (email.strip().lower(),)).fetchone())


def add_block(conn, email, reason, evidence, actor):
    email = email.strip().lower()
    row = conn.execute('INSERT INTO outreach_contact_blocks(email,reason,evidence,created_by)'
                       ' VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING email',
                       (email, reason, evidence, actor)).fetchone()
    # Block pending recipients in all workspaces. Already sending/uncertain rows
    # are preserved for reconciliation and checked again immediately at send.
    conn.execute("UPDATE outreach_recipients SET state='blocked' WHERE lower(email)=%s AND state='pending'", (email,))
    if row:
        ledger_append(conn, actor, 'OUTREACH_CONTACT_BLOCKED', email, {'reason': reason})


def record_feedback(conn, recipient, kind, source, evidence, actor):
    r = conn.execute("SELECT r.*,b.gmail_account_id FROM outreach_recipients r JOIN outreach_batches b USING(batch_id) WHERE r.recipient_id=%s", (recipient,)).fetchone()
    if not r or not r['gmail_account_id'] or r['state'] not in ('sent','review','sending'):
        from fastapi import HTTPException
        raise HTTPException(409, '실제 발송 처리 이력이 있는 수신자를 선택하세요')
    conn.execute('INSERT INTO mail_delivery_feedback(recipient_id,account_id,email,kind,source_key,evidence,created_by)'
                 ' VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING',
                 (recipient,r['gmail_account_id'],r['email'].strip().lower(),kind,source,evidence,actor))
    if kind in ('hard_bounce','complaint'):
        add_block(conn,r['email'],kind,evidence,actor)
    # Complaints stop immediately; hard bounce threshold requires a meaningful
    # denominator. Never automatically resume or rotate to another sender.
    counts=conn.execute("""SELECT count(DISTINCT f.recipient_id) FILTER(WHERE f.kind='hard_bounce') AS bounced,
        count(DISTINCT f.recipient_id) FILTER(WHERE f.kind='complaint') AS complaints
        FROM mail_delivery_feedback f JOIN outreach_recipients r USING(recipient_id)
        WHERE f.account_id=%s AND f.created_at>now()-interval '24 hours'
        AND r.sent_at>now()-interval '24 hours'""",(r['gmail_account_id'],)).fetchone()
    sent=conn.execute("SELECT count(*) n FROM gmail_delivery_events WHERE account_id=%s AND accepted_at>now()-interval '24 hours'",(r['gmail_account_id'],)).fetchone()['n']
    pause=kind=='complaint' or (sent>=20 and counts['bounced']>=3 and counts['bounced']/sent>=.03)
    if pause:
        reason='수신자 불만 확인 · 운영 검토 필요' if kind=='complaint' else '확인된 영구 반송 증가 · 운영 검토 필요'
        conn.execute('UPDATE gmail_accounts SET sending_paused=true,pause_reason=%s WHERE account_id=%s',(reason,r['gmail_account_id']))
        ledger_append(conn,actor,'OUTREACH_SAFETY_PAUSED',str(r['gmail_account_id']),{'kind':kind,'acceptedLast24h':sent,'hardBouncesLast24h':counts['bounced']})
    return {'recorded':True,'contactBlocked':kind in ('hard_bounce','complaint'),'accountPaused':pause,'sent':False}


def verified_dsn(conn, account, message, content):
    """Only a structured permanent failure tied to our exact outgoing thread.

    Free-text bounces or a mismatched Gmail thread remain for manual review.
    No fuzzy address extraction or complaint inference from ordinary replies.
    """
    def parts(p):
        yield p
        for child in p.get('parts',[]):
            yield from parts(child)
    payload=message.get('payload',{})
    if not any(p.get('mimeType')=='message/delivery-status' for p in parts(payload)):
        return False
    from .gmail_sync import text_body
    for p in parts(payload):
        if p.get('mimeType')!='message/delivery-status':continue
        text=text_body(p)
        for block in re.split(r'\r?\n\s*\r?\n',text):
            fields={m.group(1).lower():m.group(2).strip() for m in re.finditer(r'^([A-Za-z-]+):\s*(.+)$',block,re.M)}
            if fields.get('action','').lower()!='failed' or not re.fullmatch(r'5\.\d{1,3}\.\d{1,3}',fields.get('status','')):continue
            email=fields.get('final-recipient','').split(';')[-1].strip().lower()
            if not re.fullmatch(r'[^\s@;]+@[^\s@;]+\.[^\s@;]+',email):continue
            # A provider thread is evidence only when an actual outgoing record
            # for the same account and recipient has that exact thread ID.
            thread=message.get('threadId')
            if not thread:continue
            recipient=conn.execute("""SELECT r.recipient_id FROM outreach_recipients r
              JOIN outreach_batches b USING(batch_id) JOIN mail_messages m ON m.gmail_message_id=r.provider_id AND m.gmail_account_id=b.gmail_account_id
              WHERE b.gmail_account_id=%s AND lower(r.email)=%s AND m.direction='out'
              AND m.gmail_thread_id=%s AND r.state='sent' ORDER BY r.sent_at DESC LIMIT 1""",(account['account_id'],email,thread)).fetchone()
            if recipient:
                record_feedback(conn,recipient['recipient_id'],'hard_bounce','gmail:'+message['id'],
                                'Gmail structured DSN; exact account/recipient/thread; status '+fields['status'],'system:dsn')
                return True
    return False
