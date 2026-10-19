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
