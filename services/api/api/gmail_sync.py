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


def sync(brand):
    with gmail.connect() as conn:
        if not conn.execute('SELECT pg_try_advisory_xact_lock(hashtextextended(%s,0)) AS locked',('gmail-sync:'+brand,)).fetchone()['locked']:
            raise HTTPException(409,'이미 동기화 중입니다.')
        account=conn.execute("SELECT * FROM gmail_accounts WHERE brand_id=%s AND state='connected' ORDER BY connected_at,account_id LIMIT 1 FOR UPDATE",(brand,)).fetchone()
        if not account:raise HTTPException(409,'Google 이메일을 먼저 연결하세요.')
        if gmail.READ_SCOPE not in account['scopes'].split():raise HTTPException(409,'받은 메일 권한이 필요합니다. Google 계정을 다시 연결하세요.')
        token=gmail._refresh_if_needed(conn,account)
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
            more=page.get('nextPageToken','')
            conn.execute("UPDATE gmail_accounts SET sync_page_token=%s,synced_at=now(),sync_error='' WHERE account_id=%s",(more,account['account_id']))
    return {'imported':added,'hasMore':bool(more),'windowDays':30}
