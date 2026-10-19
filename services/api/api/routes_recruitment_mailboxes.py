"""Account-specific message folders over synced recruitment correspondence."""
from uuid import UUID
from fastapi import APIRouter,Depends,Query,HTTPException
from .auth import require_admin_jwt
from .db import connect
from .recruitment_mailboxes import account
from .routes_recruitment import WORKSPACE,output
router=APIRouter(prefix='/admin/recruitment/mailboxes',dependencies=[Depends(require_admin_jwt)])
FOLDERS={'inbox':"m.direction='in' AND m.state='sent'",'sent':"m.direction='out' AND m.state='sent'",'drafts':"m.direction='out' AND m.state='pending_gate'",'review':"m.state IN ('sending','review')",'all':'true'}
@router.get('/{aid}/messages')
def listing(aid:UUID,folder:str='inbox',q:str=Query(default='',max_length=120),offset:int=Query(default=0,ge=0,le=100000)):
    if folder not in FOLDERS:raise HTTPException(400,'메일함 폴더 확인 필요')
    with connect() as c:
        a=account(c,aid)
        base=' FROM mail_messages m JOIN mail_threads t USING(thread_id) LEFT JOIN recruitment_contacts p ON p.email=lower(trim(t.creator_email)) WHERE t.brand_id=%s AND m.gmail_account_id=%s'
        counts=c.execute('SELECT '+','.join('count(*) FILTER(WHERE '+v+') AS "'+k+'"' for k,v in FOLDERS.items())+base,(WORKSPACE,aid)).fetchone()
        rows=c.execute('SELECT m.msg_id,m.thread_id,m.direction,m.subject,m.body,m.state,COALESCE(m.sent_at,m.created_at) AS created_at,t.creator_email,p.contact_id'+base+' AND ('+FOLDERS[folder]+") AND (%s='' OR t.creator_email ILIKE %s OR m.subject ILIKE %s) ORDER BY COALESCE(m.sent_at,m.created_at) DESC,m.msg_id DESC LIMIT 51 OFFSET %s",(WORKSPACE,aid,q,'%'+q+'%','%'+q+'%',offset)).fetchall()
        return {'account':output(a),'messages':[output(r) for r in rows[:50]],'counts':dict(counts),'hasMore':len(rows)>50,'offset':offset,'limit':50,'scope':'synced_recruitment_correspondence','sent':False}


def dns_txt(name):
    import httpx
    r=httpx.get('https://dns.google/resolve',params={'name':name,'type':'TXT'},timeout=5)
    r.raise_for_status();data=r.json()
    if data.get('Status') not in (0,3):raise ValueError('DNS unavailable')
    return [x['data'].replace('" "','').strip('"') for x in data.get('Answer',[]) if x.get('type')==16]

@router.get('/{aid}/authentication')
def authentication(aid:UUID):
    import re
    from datetime import datetime,timezone
    with connect() as c:domain=account(c,aid)['email'].rsplit('@',1)[-1].lower()
    if not re.fullmatch(r'[a-z0-9.-]+\.[a-z]{2,}',domain):raise HTTPException(400,'발신 도메인 확인 필요')
    checks={}
    for key,name,prefix in [('spf',domain,'v=spf1'),('dmarc','_dmarc.'+domain,'v=DMARC1'),('googleDkim','google._domainkey.'+domain,'v=DKIM1')]:
        try:
            records=[x for x in dns_txt(name) if x.lower().startswith(prefix.lower())]
            checks[key]={'status':'present' if len(records)==1 else 'multiple' if len(records)>1 else 'not_found','records':records if key!='googleDkim' else [],'selector':'google' if key=='googleDkim' else None}
        except Exception:checks[key]={'status':'lookup_failed','records':[]}
    return {'domain':domain,'checkedAt':datetime.now(timezone.utc).isoformat(),'checks':checks,'actualMessageAuthentication':'unverified','note':'공개 DNS 설정 조회이며 SPF/DKIM/DMARC 실제 통과 판정이 아닙니다. DKIM은 다른 선택자일 수 있습니다. Gmail 원본 보기로 검증하세요.','sent':False,'dnsChanged':False}


def authentication_summary(headers):
    import re
    auth=[x['value'] for x in headers if x.get('name','').lower()=='authentication-results' and re.match(r'^\s*mx\.google\.com\s*;',x.get('value',''),re.I)]
    signatures=[x['value'] for x in headers if x.get('name','').lower()=='dkim-signature']
    values={key:re.findall(r'\b'+key+r'=([a-z]+)', '\n'.join(auth),re.I) for key in ('spf','dkim','dmarc')}
    def tag(s,k):
        m=re.search(r'(?:^|;)\s*'+k+r'=([^;]+)',s,re.I)
        return m.group(1).strip() if m else ''
    return {'results':{k:sorted(set(v)) or ['not_reported'] for k,v in values.items()},'googleAuthenticationResults':auth,'dkimSignatures':[{'domain':tag(s,'d'),'selector':tag(s,'s'),'signedHeaders':tag(s,'h').replace('\r','').replace('\n','')} for s in signatures],'note':'Gmail 수신 헤더의 인증 결과입니다. 인증 통과가 스팸 아님이나 받은편지함 도착을 보장하지 않습니다. 전달 메일에는 여러 결과가 있을 수 있습니다.'}

@router.get('/{aid}/messages/{mid}/authentication')
def message_authentication(aid:UUID,mid:int):
    import httpx
    from urllib.parse import quote
    from . import routes_gmail as gmail
    with connect() as c:
        account(c,aid)
        m=c.execute("SELECT m.gmail_message_id FROM mail_messages m JOIN mail_threads t USING(thread_id) WHERE m.msg_id=%s AND m.gmail_account_id=%s AND t.brand_id=%s AND m.direction='in' AND m.state='sent'",(mid,aid,WORKSPACE)).fetchone()
        if not m:raise HTTPException(404,'이 계정의 받은 메일이 아닙니다')
        if not m['gmail_message_id']:raise HTTPException(409,'원본 Gmail 식별자가 없는 이전 기록입니다. 받은편지함에서 원본 보기를 확인하세요.')
        a=c.execute("SELECT * FROM gmail_accounts WHERE account_id=%s AND brand_id=%s AND state='connected'",(aid,WORKSPACE)).fetchone()
        if not a or gmail.READ_SCOPE not in a['scopes'].split():raise HTTPException(409,'Google 계정의 읽기 연결을 확인하세요')
        if gmail._demo_mode():raise HTTPException(503,'실제 Gmail 연결이 필요합니다')
        token=gmail._refresh_if_needed(c,a)
        try:
            r=httpx.get('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+quote(m['gmail_message_id'],safe=''),headers={'Authorization':'Bearer '+token},params=[('format','metadata'),('metadataHeaders','Authentication-Results'),('metadataHeaders','DKIM-Signature')],timeout=15)
            r.raise_for_status();headers=r.json().get('payload',{}).get('headers',[])
        except Exception:raise HTTPException(502,'Gmail 원본 헤더를 읽지 못했습니다. 연결을 확인하세요.') from None
    return {**authentication_summary(headers),'source':'gmail_received_metadata','msgId':mid,'accountId':str(aid),'sent':False,'gmailChanged':False}
