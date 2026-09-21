"""Bounded, idempotent Gmail inbox import, scoped to one authorized brand."""
import base64
from datetime import datetime, UTC
from email.utils import parseaddr
import httpx
from fastapi import HTTPException
from . import routes_gmail as gmail


def text_body(payload):
    if payload.get('filename'):return ''
    parts=payload.get('parts',[])
    if parts:
        plain=[p for p in parts if p.get('mimeType')=='text/plain']
        return '\n'.join(filter(None,(text_body(p) for p in (plain or parts))))[:20000]
    raw=payload.get('body',{}).get('data','')
    if not raw or len(raw)>300000:return ''
    try:text=base64.urlsafe_b64decode(raw+'='*(-len(raw)%4)).decode('utf-8',errors='replace')
    except (ValueError,TypeError):return ''
    if payload.get('mimeType')=='text/html':
        from .brand_learning import VisibleText
        parser=VisibleText();parser.feed(text);text='\n'.join(parser.parts)
    return text[:20000]


def _import_account(conn, brand, account, token):
    """한 계정의 받은편지함 한 페이지를 가져온다 — 커서(sync_page_token)는
    계정별로 저장·재개된다. (added, next_page_token) 반환."""
    with httpx.Client(timeout=12,headers={'Authorization':'Bearer '+token}) as client:
        params={'q':'in:inbox newer_than:30d','maxResults':10}
        if account['sync_page_token']:params['pageToken']=account['sync_page_token']
        result=client.get('https://gmail.googleapis.com/gmail/v1/users/me/messages',params=params)
        if result.status_code==400 and account['sync_page_token']:
            params.pop('pageToken');result=client.get('https://gmail.googleapis.com/gmail/v1/users/me/messages',params=params)
        result.raise_for_status()
        page=result.json();added=0
        for item in page.get('messages',[]):
            mid=item['id']
            if conn.execute('SELECT 1 FROM mail_messages WHERE gmail_account_id=%s AND gmail_message_id=%s',(account['account_id'],mid)).fetchone():continue
            response=client.get('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+mid,params={'format':'full'})
            if response.status_code==404:continue
            response.raise_for_status();message=response.json()
            if 'INBOX' not in message.get('labelIds',[]) or 'SENT' in message.get('labelIds',[]):continue
            payload=message.get('payload',{})
            headers={h['name'].lower():h['value'] for h in payload.get('headers',[])}
            sender=parseaddr(headers.get('from',''))[1].lower()
            if '@' not in sender:continue
            content=text_body(payload) or '(본문이 없거나 지원하지 않는 형식입니다. Gmail에서 확인하세요.)'
            at=datetime.fromtimestamp(int(message['internalDate'])/1000,UTC)
            subject=headers.get('subject','').replace('\r',' ').replace('\n',' ')[:500]
            thread=conn.execute("INSERT INTO mail_threads(brand_id,creator_email,subject,ari_label,last_direction,last_message_at) VALUES(%s,%s,%s,%s,'in',%s) ON CONFLICT(brand_id,creator_email) DO UPDATE SET subject=CASE WHEN EXCLUDED.last_message_at>=mail_threads.last_message_at THEN EXCLUDED.subject ELSE mail_threads.subject END,ari_label=CASE WHEN EXCLUDED.last_message_at>=mail_threads.last_message_at THEN EXCLUDED.ari_label ELSE mail_threads.ari_label END,last_direction=CASE WHEN EXCLUDED.last_message_at>=mail_threads.last_message_at THEN 'in' ELSE mail_threads.last_direction END,last_message_at=GREATEST(mail_threads.last_message_at,EXCLUDED.last_message_at) RETURNING thread_id",(brand,sender,subject,gmail._ari_label(content),at)).fetchone()
            conn.execute("INSERT INTO mail_messages(thread_id,direction,from_email,to_email,body,state,sent_via,created_at,subject,gmail_account_id,gmail_message_id,gmail_thread_id,rfc_message_id) VALUES(%s,'in',%s,%s,%s,'sent','gmail',%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",(thread['thread_id'],sender,account['email'],content,at,subject,account['account_id'],mid,message.get('threadId'),headers.get('message-id','')))
            added+=1
        return added,page.get('nextPageToken','')


def sync(brand):
    """브랜드의 '읽기 동의(gmail.readonly)가 있는 모든 연결 계정'을 동기화.

    검수 반영: 발송 전용(gmail.send) 계정이 먼저 연결돼 있어도 그 계정을
    고르지 않는다 — 읽기 계정만 대상으로 하고, 커서·성공/오류 기록을 계정별로
    격리한다. 한 계정의 토큰 만료·오류는 그 계정에만 기록되고 나머지 계정
    동기화는 계속된다. 발송 계정 선택 로직(send_via_brand_gmail)은 그대로이며
    읽기 스코프를 추가로 요구하거나 우회하지 않는다."""
    with gmail.connect() as conn:
        if not conn.execute('SELECT pg_try_advisory_xact_lock(hashtextextended(%s,0)) AS locked',('gmail-sync:'+brand,)).fetchone()['locked']:
            raise HTTPException(409,'이미 동기화 중입니다.')
        accounts=conn.execute("SELECT * FROM gmail_accounts WHERE brand_id=%s AND state='connected' ORDER BY connected_at,account_id FOR UPDATE",(brand,)).fetchall()
        if not accounts:raise HTTPException(409,'Google 이메일을 먼저 연결하세요.')
        readable=[a for a in accounts if gmail.READ_SCOPE in a['scopes'].split()]
        if not readable:raise HTTPException(409,'받은 메일 권한이 필요합니다. Google 계정을 다시 연결하세요.')
        total,has_more,per=0,False,[]
        for account in readable:
            try:
                # 토큰 갱신은 savepoint 밖 — 갱신 실패의 state='error' 기록이
                # savepoint 롤백에 휩쓸리지 않는다.
                token=gmail._refresh_if_needed(conn,account)
                # 계정별 SAVEPOINT — 이 계정 처리 중 DB 오류가 나면 이 계정의
                # 부분 삽입만 롤백되고, 바깥 트랜잭션은 살아 있어 오류 기록과
                # 다음 계정 진행이 가능하다(검수 재현: SELECT 1/0 주입).
                with conn.transaction():
                    added,more=_import_account(conn,brand,account,token)
                    conn.execute("UPDATE gmail_accounts SET sync_page_token=%s,synced_at=now(),sync_error='' WHERE account_id=%s",(more,account['account_id']))
                total+=added;has_more=has_more or bool(more)
                per.append({'email':account['email'],'imported':added,'error':''})
            except Exception as e:
                # 이 계정만 오류 기록 — 다른 읽기 계정은 계속 진행 (계정별 격리)
                msg=e.detail if isinstance(e,HTTPException) else f'동기화 실패({type(e).__name__}) — 연결 상태를 확인하세요'
                conn.execute("UPDATE gmail_accounts SET sync_error=%s WHERE account_id=%s",(msg,account['account_id']))
                per.append({'email':account['email'],'imported':0,'error':msg})
    # 여기서부터는 connect 블록 밖 = 트랜잭션 커밋 완료 — 전 계정 실패라도
    # 계정별 sync_error 기록은 영속화된 뒤에 실패를 응답한다(검수 반영).
    if all(p['error'] for p in per):
        raise HTTPException(502,'읽기 계정 동기화에 모두 실패했습니다: '+per[-1]['error'])
    return {'imported':total,'hasMore':has_more,'windowDays':30,'accounts':per}
