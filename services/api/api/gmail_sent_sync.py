"""Import already-sent Gmail mail only for previously known creator conversations.
No send operation, no new creator discovery, and no unrelated mailbox history.
"""
from datetime import datetime,UTC
from email.utils import parseaddr,getaddresses
import httpx

def import_sent(conn,brand,account,token):
    from .gmail_sync import text_body
    params={'q':'in:sent newer_than:30d','maxResults':10}
    added=0
    with httpx.Client(timeout=12,headers={'Authorization':'Bearer '+token}) as client:
        response=client.get('https://gmail.googleapis.com/gmail/v1/users/me/messages',params=params);response.raise_for_status()
        page=response.json();pages=[page]
        if account.get('sent_sync_page_token'):
            response=client.get('https://gmail.googleapis.com/gmail/v1/users/me/messages',params={**params,'pageToken':account['sent_sync_page_token']})
            if response.status_code!=400:response.raise_for_status();page=response.json();pages.append(page)
        for item in (x for p in pages for x in p.get('messages',[])):
            mid=item['id']
            if conn.execute('SELECT 1 FROM mail_messages WHERE gmail_account_id=%s AND gmail_message_id=%s',(account['account_id'],mid)).fetchone():continue
            response=client.get('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+mid,params={'format':'full'})
            if response.status_code==404:continue
            response.raise_for_status();m=response.json()
            if 'SENT' not in m.get('labelIds',[]) or 'INBOX' in m.get('labelIds',[]):continue
            payload=m.get('payload',{});headers={h['name'].lower():h['value'] for h in payload.get('headers',[])}
            sender=parseaddr(headers.get('from',''))[1].strip().lower()
            recipients={email.strip().lower() for _,email in getaddresses([headers[k] for k in ('to','cc','bcc') if headers.get(k)]) if '@' in email}
            # Multi-recipient mail cannot be attributed to one creator automatically.
            if sender!=account['email'].lower() or len(recipients)!=1:continue
            email=next(iter(recipients))
            thread=conn.execute('SELECT t.thread_id FROM mail_threads t JOIN recruitment_contacts p ON p.email=lower(trim(t.creator_email)) WHERE t.brand_id=%s AND p.email=%s',(brand,email)).fetchone()
            if not thread:continue
            at=datetime.fromtimestamp(int(m['internalDate'])/1000,UTC)
            subject=headers.get('subject','').replace('\r',' ').replace('\n',' ')[:500]
            content=text_body(payload) or '(본문이 없거나 지원하지 않는 형식입니다. Gmail에서 확인하세요.)'
            row=conn.execute("INSERT INTO mail_messages(thread_id,direction,from_email,to_email,body,state,sent_via,created_at,sent_at,subject,gmail_account_id,gmail_message_id,gmail_thread_id,rfc_message_id) VALUES(%s,'out',%s,%s,%s,'sent','gmail',%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING msg_id",(thread['thread_id'],sender,email,content,at,at,subject,account['account_id'],mid,m.get('threadId'),headers.get('message-id',''))).fetchone()
            if row:added+=1
    return added,page.get('nextPageToken','')
