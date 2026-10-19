"""Admin CRM: exact contact records, full correspondence and explicit reply approvals."""
import json
import os
from uuid import UUID
from datetime import datetime
from fastapi import APIRouter,Depends,Header,HTTPException,Query
from pydantic import BaseModel,Field
from .auth import require_admin_jwt
from .db import connect,ledger_append
from .routes_recruitment import WORKSPACE,output
from .recruitment_crm import register_known_threads
from . import routes_gmail as gmail
from . import recruitment_mailboxes as boxes

router=APIRouter(prefix='/admin/recruitment/contacts',dependencies=[Depends(require_admin_jwt)])

def contact(c,cid,lock=False):
    p=c.execute('SELECT * FROM recruitment_contacts WHERE contact_id=%s'+(' FOR UPDATE' if lock else ''),(cid,)).fetchone()
    if not p:raise HTTPException(404,'크리에이터 연락처가 없습니다')
    return p

def stopped(c,email):
    return bool(c.execute('SELECT 1 FROM outreach_contact_blocks WHERE email=%s',(email,)).fetchone() or c.execute("SELECT 1 FROM outreach_optouts o WHERE lower(o.email)=%s AND o.opted_out_at IS NOT NULL AND (o.brand_id=%s OR o.brand_id IN (SELECT COALESCE(b.target_brand_id,b.brand_id) FROM outreach_batches b JOIN outreach_recipients r USING(batch_id) WHERE b.brand_id=%s AND r.email=%s))",(email,WORKSPACE,WORKSPACE,email)).fetchone())

def owned_message(c,p,mid):
    r=c.execute('SELECT m.*,t.brand_id,t.creator_email FROM mail_messages m JOIN mail_threads t USING(thread_id) WHERE m.msg_id=%s AND t.brand_id=%s AND lower(trim(t.creator_email))=%s',(mid,WORKSPACE,p['email'])).fetchone()
    if not r:raise HTTPException(404,'이 크리에이터의 공용 모집 메일이 아닙니다')
    return r

@router.post('/refresh-records')
def refresh_records():
    with connect() as c:return {'created':register_known_threads(c),'sent':False}

@router.get('/mailboxes')
def mailboxes():
    with connect() as c:
        rows=c.execute("SELECT account_id,email,state,scopes,synced_at,sync_error,sent_sync_error,sending_paused,pause_reason FROM gmail_accounts WHERE brand_id=%s ORDER BY email",(WORKSPACE,)).fetchall()
        out=[]
        for a in rows:
            _,counts=boxes.listing(c,'','','',0,1,a['account_id'],'all')
            out.append({**output({k:v for k,v in a.items() if k!='scopes'}),'canRead':gmail.READ_SCOPE in a['scopes'].split(),'counts':dict(counts)})
        return {'accounts':out,'readStateScope':'operations_team'}

@router.get('')
def listing(q:str=Query(default='',max_length=120),status:str='',owner:str=Query(default='',max_length=100),offset:int=Query(default=0,ge=0,le=100000),limit:int=Query(default=50,ge=1,le=100),account_id:UUID|None=None,folder:str='all'):
    if status and status not in ('new','in_progress','waiting_creator','waiting_internal','complete','on_hold'):raise HTTPException(400,'상태 확인 필요')
    with connect() as c:
        rows,counts=boxes.listing(c,q,status,owner,offset,limit,account_id,folder)
        return {'contacts':[output(r) for r in rows[:limit]],'counts':dict(counts),'hasMore':len(rows)>limit,'offset':offset,'limit':limit,'identityVerified':False}

@router.post('/sync')
def sync_mailbox(account_id:UUID|None=None):
    from . import gmail_sync
    with connect() as c:boxes.account(c,account_id)
    if gmail._demo_mode():raise HTTPException(503,'실제 Google 계정 연결이 필요합니다')
    return gmail_sync.sync(WORKSPACE,account_id=account_id,include_sent=True)

@router.get('/unlinked')
def unlinked(account_id:UUID|None=None,offset:int=Query(default=0,ge=0,le=100000)):
    with connect() as c:
        boxes.account(c,account_id)
        rows=c.execute("""SELECT t.thread_id,t.creator_email,t.subject,t.last_message_at FROM mail_threads t
          WHERE t.brand_id=%s AND NOT EXISTS(SELECT 1 FROM recruitment_contacts p WHERE p.email=lower(trim(t.creator_email)))
          AND EXISTS(SELECT 1 FROM mail_messages m WHERE m.thread_id=t.thread_id AND m.direction='in' AND m.gmail_account_id IS NOT NULL AND (%s::uuid IS NULL OR m.gmail_account_id=%s))
          ORDER BY t.last_message_at DESC,t.thread_id LIMIT 51 OFFSET %s""",(WORKSPACE,account_id,account_id,offset)).fetchall()
        return {'threads':[output(r) for r in rows[:50]],'limit':50,'hasMore':len(rows)>50,'offset':offset}

class Register(BaseModel):
    thread_id:UUID
    confirmed_creator:bool=False

@router.post('/register-thread')
def register_thread(b:Register,actor:dict=Depends(require_admin_jwt)):
    if not b.confirmed_creator:raise HTTPException(400,'실제 크리에이터의 모집 대화인지 확인하세요')
    with connect() as c:
        t=c.execute("SELECT * FROM mail_threads WHERE thread_id=%s AND brand_id=%s AND EXISTS(SELECT 1 FROM mail_messages m WHERE m.thread_id=mail_threads.thread_id AND m.direction='in' AND m.gmail_account_id IS NOT NULL)",(b.thread_id,WORKSPACE)).fetchone()
        if not t:raise HTTPException(404,'공용 Gmail 수신 대화가 아닙니다')
        p=c.execute('INSERT INTO recruitment_contacts(email) VALUES(lower(trim(%s))) ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING contact_id',(t['creator_email'],)).fetchone()
        ledger_append(c,str(actor['sub']),'CRM_CREATOR_THREAD_CONFIRMED',str(p['contact_id']),{'threadId':str(b.thread_id),'sent':False})
        return {'contactId':str(p['contact_id']),'sent':False}

def message_page(c,p,before_at=None,before_id=None,account_id=None):
    args=[WORKSPACE,p['email']]
    boxes.account(c,account_id)
    extra=''
    if account_id is not None:
        extra+=' AND m.gmail_account_id=%s';args.append(account_id)
    if before_at is not None and before_id is not None:
        extra=' AND (COALESCE(m.sent_at,m.created_at),m.msg_id)<(%s,%s)';args.extend([before_at,before_id])
    rows=c.execute("SELECT m.msg_id,m.thread_id,m.direction,m.from_email,m.to_email,m.subject,m.body,m.state,COALESCE(m.sent_at,m.created_at) AS created_at,m.created_at AS draft_created_at,m.sent_at,m.gmail_account_id,m.gmail_thread_id,g.email AS account_email,u.email AS authored_by FROM mail_messages m JOIN mail_threads t USING(thread_id) LEFT JOIN gmail_accounts g ON g.account_id=m.gmail_account_id LEFT JOIN mail_reply_draft_requests d USING(msg_id) LEFT JOIN users u ON u.user_id::text=d.created_by WHERE t.brand_id=%s AND lower(trim(t.creator_email))=%s"+extra+' ORDER BY COALESCE(m.sent_at,m.created_at) DESC,m.msg_id DESC LIMIT 101',args).fetchall()
    more=len(rows)>100;rows=rows[:100];last=rows[-1] if rows else None
    return {'messages':[output(r) for r in reversed(rows)],'hasMore':more,'next':{'before_at':last['created_at'].isoformat(),'before_id':last['msg_id']} if more else None}

@router.get('/{cid}/messages')
def messages(cid:UUID,before_at:datetime|None=None,before_id:int|None=None,account_id:UUID|None=None):
    if (before_at is None)!=(before_id is None):raise HTTPException(400,'이전 기록 커서 확인 필요')
    if before_at and before_at.tzinfo is None:raise HTTPException(400,'커서에 시간대 필요')
    with connect() as c:return message_page(c,contact(c,cid),before_at,before_id,account_id)

@router.get('/{cid}')
def detail(cid:UUID,account_id:UUID|None=None):
    with connect() as c:
        p=contact(c,cid)
        boxes.account(c,account_id)
        candidates=c.execute("SELECT creator_id,platform,handle,display_name,country,identity_group FROM creator_pool WHERE lower(trim(email))=%s AND state<>'EXCLUDED' ORDER BY creator_id LIMIT 20",(p['email'],)).fetchall()
        offers=c.execute("SELECT b.batch_id,b.offer_code,COALESCE(b.target_brand_id,b.brand_id) AS target_brand_id,b.product_name,b.campaign_id,r.state,r.sent_at,r.recipient_id FROM outreach_recipients r JOIN outreach_batches b USING(batch_id) WHERE b.brand_id=%s AND r.email=%s ORDER BY b.created_at DESC LIMIT 100",(WORKSPACE,p['email'])).fetchall()
        applications=c.execute("SELECT a.application_id,a.brand_id AS target_brand_id,a.product_id,a.campaign_id,a.status,a.applied_at AS created_at FROM recruitment_applications a JOIN recruitment_application_links l USING(link_id) JOIN outreach_recipients r USING(recipient_id) JOIN outreach_batches b USING(batch_id) WHERE b.brand_id=%s AND r.email=%s ORDER BY a.applied_at DESC LIMIT 100",(WORKSPACE,p['email'])).fetchall()
        notes=c.execute('SELECT n.*,u.email AS author_email FROM recruitment_contact_notes n LEFT JOIN users u ON u.user_id::text=n.created_by WHERE n.contact_id=%s ORDER BY n.created_at DESC LIMIT 100',(cid,)).fetchall()
        tasks=c.execute('SELECT q.* FROM recruitment_thread_tasks q JOIN mail_threads t USING(thread_id) WHERE t.brand_id=%s AND lower(trim(t.creator_email))=%s',(WORKSPACE,p['email'])).fetchall()
        events=c.execute('SELECT e.*,u.email AS author_email FROM recruitment_contact_events e LEFT JOIN users u ON u.user_id::text=e.created_by WHERE e.contact_id=%s ORDER BY e.event_id DESC LIMIT 100',(cid,)).fetchall()
        return {'mailboxAccountId':str(account_id) if account_id else None,'events':[output(e) for e in events],'contact':output(p),'blocked':stopped(c,p['email']),'candidateProfiles':[output(x) for x in candidates],'identityVerified':False,'correspondence':message_page(c,p,account_id=account_id),'offers':[output(x) for x in offers],'applications':[output(x) for x in applications],'notes':[output(x) for x in notes],'threadTasks':[output(x) for x in tasks]}

class Profile(BaseModel):
    revision:int=Field(ge=1)
    owner_name:str=Field(default='',max_length=100)
    status:str=Field(pattern=r'^(new|in_progress|waiting_creator|waiting_internal|complete|on_hold)$')
    next_action:str=Field(default='',max_length=500)
    due_at:datetime|None=None

@router.put('/{cid}')
def save(cid:UUID,b:Profile,actor:dict=Depends(require_admin_jwt)):
    if b.due_at and b.due_at.tzinfo is None:raise HTTPException(400,'기한에 시간대 필요')
    with connect() as c:
        p=contact(c,cid,True)
        if p['revision']!=b.revision:raise HTTPException(409,'다른 담당자가 수정했습니다. 새로 불러오세요')
        r=c.execute('UPDATE recruitment_contacts SET owner_name=%s,status=%s,next_action=%s,due_at=%s,revision=revision+1,updated_at=now() WHERE contact_id=%s RETURNING *',(b.owner_name.strip(),b.status,b.next_action.strip(),b.due_at,cid)).fetchone()
        c.execute('INSERT INTO recruitment_contact_events(contact_id,kind,detail,created_by) VALUES(%s,%s,%s,%s)',(cid,'profile_updated',json.dumps({'before':{k:p[k].isoformat() if hasattr(p[k],'isoformat') else p[k] for k in ('owner_name','status','next_action','due_at')},'after':b.model_dump(mode='json')}),str(actor['sub'])))
        ledger_append(c,str(actor['sub']),'CRM_CONTACT_UPDATED',str(cid),{'revision':r['revision'],'status':b.status,'owner':b.owner_name})
        return output(r)

class Note(BaseModel):
    request_id:UUID
    body:str=Field(min_length=1,max_length=4000)

@router.post('/{cid}/notes')
def note(cid:UUID,b:Note,actor:dict=Depends(require_admin_jwt)):
    if not b.body.strip():raise HTTPException(400,'메모를 입력하세요')
    with connect() as c:
        contact(c,cid,True)
        old=c.execute('SELECT * FROM recruitment_contact_notes WHERE request_id=%s',(b.request_id,)).fetchone()
        if old:
            if str(old['contact_id'])!=str(cid) or old['body']!=b.body.strip():raise HTTPException(409,'같은 메모 요청의 내용이 다릅니다')
            return output(old)
        n=c.execute('INSERT INTO recruitment_contact_notes(contact_id,request_id,body,created_by) VALUES(%s,%s,%s,%s) RETURNING *',(cid,b.request_id,b.body.strip(),str(actor['sub']))).fetchone()
        ledger_append(c,str(actor['sub']),'CRM_NOTE_ADDED',str(cid),{'noteId':str(n['note_id'])})
        return output(n)

class Draft(BaseModel):
    request_id:UUID
    reply_to_msg_id:int
    expected_account_id:UUID
    body:str=Field(min_length=1,max_length=20000)

@router.post('/{cid}/drafts')
def draft(cid:UUID,b:Draft,authorization:str=Header(default='')):
    with connect() as c:
        p=contact(c,cid);m=owned_message(c,p,b.reply_to_msg_id)
        if stopped(c,p['email']):raise HTTPException(409,'차단·수신거부한 연락처입니다')
        if m['direction']!='in':raise HTTPException(409,'받은 메일을 선택하세요')
    return gmail.reply_thread(str(m['thread_id']),gmail.ReplyIn(**b.model_dump()),authorization=authorization)

class Approval(BaseModel):
    confirmed:bool=False

@router.post('/{cid}/drafts/{mid}/send')
def send(cid:UUID,mid:int,b:Approval,authorization:str=Header(default='')):
    if not b.confirmed:raise HTTPException(400,'수신자·발신 계정·본문을 확인하세요')
    if os.environ.get('GMAIL_OPS_ENABLED')!='1':raise HTTPException(409,'Gmail 운영 기능이 꺼져 있습니다')
    with connect() as c:
        p=contact(c,cid);m=owned_message(c,p,mid)
        if stopped(c,p['email']):raise HTTPException(409,'차단·수신거부한 연락처입니다')
        if m['direction']!='out':raise HTTPException(409,'답장 초안이 아닙니다')
    return gmail.send_reply(str(m['thread_id']),mid,authorization)

@router.post('/{cid}/drafts/{mid}/cancel')
def cancel(cid:UUID,mid:int,actor:dict=Depends(require_admin_jwt)):
    with connect() as c:
        p=contact(c,cid);m=owned_message(c,p,mid)
        r=c.execute("UPDATE mail_messages SET state='cancelled' WHERE msg_id=%s AND direction='out' AND state='pending_gate' RETURNING gate_id",(mid,)).fetchone()
        if not r:raise HTTPException(409,'대기 초안만 취소할 수 있습니다')
        c.execute("UPDATE gate_requests SET state='REJECTED',decided_by=%s,decided_at=now() WHERE gate_id=%s",(str(actor['sub']),r['gate_id']))
        ledger_append(c,str(actor['sub']),'CRM_REPLY_DRAFT_CANCELLED',str(mid),{'contactId':str(cid)})
        return {'state':'cancelled','sent':False}

@router.get('/unlinked/{thread_id}')
def preview_unlinked(thread_id:UUID,account_id:UUID|None=None):
    with connect() as c:
        t=c.execute('SELECT creator_email FROM mail_threads WHERE thread_id=%s AND brand_id=%s',(thread_id,WORKSPACE)).fetchone()
        if not t:raise HTTPException(404,'공용 모집 수신 대화가 아닙니다')
        return message_page(c,{'email':t['creator_email'].strip().lower()},account_id=account_id)

class Read(BaseModel):
    account_id:UUID
    through_msg_id:int=Field(ge=1)

@router.post('/{cid}/read')
def mark_read(cid:UUID,b:Read,actor:dict=Depends(require_admin_jwt)):
    with connect() as c:
        boxes.account(c,b.account_id)
        p=contact(c,cid);m=owned_message(c,p,b.through_msg_id)
        if str(m['gmail_account_id'])!=str(b.account_id) or m['direction']!='in':raise HTTPException(409,'선택한 계정의 받은 메일만 읽음 처리할 수 있습니다')
        c.execute("INSERT INTO recruitment_mailbox_reads(account_id,email,last_read_msg_id,updated_by) VALUES(%s,%s,%s,%s) ON CONFLICT(account_id,email) DO UPDATE SET last_read_msg_id=GREATEST(recruitment_mailbox_reads.last_read_msg_id,EXCLUDED.last_read_msg_id),updated_by=EXCLUDED.updated_by,updated_at=now()",(b.account_id,p['email'],b.through_msg_id,str(actor['sub'])))
        return {'read':True,'scope':'operations_team','gmailChanged':False}
