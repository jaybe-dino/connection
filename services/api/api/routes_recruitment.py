"""Admin-owned reusable product mappings. These routes never approve or send mail."""
import os
from uuid import UUID
from typing import Literal
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from .auth import require_admin_jwt as require_admin
from .db import connect, ledger_append
from . import routes_outreach_bulk as bulk

router = APIRouter(prefix='/admin/recruitment')
WORKSPACE = 'dino-recruitment'


class CatalogIn(BaseModel):
    brand_id: str = Field(pattern=r'^[a-z][a-z0-9-]{1,39}$')
    brand_name: str = Field(min_length=1,max_length=120)
    product_name: str = Field(min_length=1,max_length=120)
    commission_pct: float = Field(ge=0,le=80)
    source_note: str = Field(min_length=1,max_length=2000)


@router.post('/catalog')
def create_catalog(body:CatalogIn,_admin:dict=Depends(require_admin)):
    """Register operating inventory only: no customer login, contract, payment or mail."""
    from .routes_community import ensure_default_cell
    import json
    name=body.brand_name.strip();product=body.product_name.strip();note=body.source_note.strip()
    if not name or not product or not note:
        raise HTTPException(400,'브랜드·제품 이름과 출처 메모를 입력하세요')
    if body.brand_id.startswith('qa-') or body.brand_id==WORKSPACE:
        raise HTTPException(400,'실제 고객 브랜드의 고유 주소를 입력하세요')
    with connect() as c:
        workspace(c)
        c.execute("SELECT pg_advisory_xact_lock(hashtextextended('recruitment:catalog',0))")
        brand=c.execute('SELECT name,is_internal,is_demo FROM brands WHERE brand_id=%s',(body.brand_id,)).fetchone()
        if brand and (brand['is_internal'] or brand['is_demo'] or brand['name']!=name):
            raise HTTPException(409,'해당 주소의 기존 브랜드와 일치하지 않습니다. 기존 자료를 변경하지 않았습니다.')
        if not brand:
            if c.execute('SELECT 1 FROM brands WHERE lower(name)=lower(%s)',(name,)).fetchone():
                raise HTTPException(409,'같은 이름의 브랜드가 있습니다. 기존 브랜드 주소를 사용하세요.')
            c.execute('INSERT INTO brands(brand_id,name) VALUES(%s,%s)',(body.brand_id,name))
            ensure_default_cell(c,body.brand_id,name)
            ledger_append(c,str(_admin['sub']),'RECRUITMENT_BRAND_REGISTERED',body.brand_id,{'source':note})
        p=c.execute('SELECT product_id,commission_pct,state FROM brand_products WHERE brand_id=%s AND name=%s',(body.brand_id,product)).fetchone()
        if p:
            if p['state']!='active' or float(p['commission_pct'])!=body.commission_pct:
                raise HTTPException(409,'기존 제품의 상태·커미션과 다릅니다. 기존 제품은 변경하지 않았습니다.')
            return {'brandId':body.brand_id,'productId':str(p['product_id']),'created':False,'emailSent':False}
        p=c.execute('INSERT INTO brand_products(brand_id,name,commission_pct) VALUES(%s,%s,%s) RETURNING product_id',(body.brand_id,product,body.commission_pct)).fetchone()
        c.execute('INSERT INTO product_profile_versions(product_id,version,fields,note) VALUES(%s,1,%s,%s)',(p['product_id'],json.dumps({'hero_product':{'value':product,'source':'operator_reference','confirmed':False,'evidence':note}}),note))
        ledger_append(c,str(_admin['sub']),'RECRUITMENT_PRODUCT_REGISTERED',str(p['product_id']),{'brandId':body.brand_id,'source':note,'commissionPct':body.commission_pct,'termsConfirmed':False})
    return {'brandId':body.brand_id,'productId':str(p['product_id']),'created':True,'emailSent':False}


class MappingIn(BaseModel):
    name: str = Field(min_length=1,max_length=120)
    target_brand_id: str = Field(min_length=1,max_length=40)
    product_id: UUID
    gmail_account_id: UUID | None = None
    owner_name: str = Field(default='',max_length=100)
    campaign_id: str | None = Field(default=None,max_length=100)
    country: str = Field(default='',max_length=80)
    language: str = Field(default='',max_length=80)
    state: Literal['draft','active','paused','archived'] = 'draft'
    subject: str = Field(default='',max_length=150)
    body: str = Field(default='',max_length=9500)
    note: str = Field(default='',max_length=3000)
    revision: int = Field(default=1,ge=1)


class RowsIn(BaseModel):
    rows: list[bulk.Candidate] = Field(min_length=1,max_length=10000)
    revision: int = Field(ge=1)


class DraftRows(RowsIn):
    request_id: UUID
    review_hash: str = Field(pattern=r'^[a-f0-9]{64}$')


class DistributedRows(RowsIn):
    sender_ids: list[UUID] = Field(min_length=1,max_length=50)


class DistributedDrafts(DistributedRows):
    request_id: UUID
    review_hash: str = Field(pattern=r'^[a-f0-9]{64}$')


def workspace(conn):
    r=conn.execute('SELECT is_internal FROM brands WHERE brand_id=%s',(WORKSPACE,)).fetchone()
    if not r or not r['is_internal']:
        raise HTTPException(409,'먼저 어드민에서 디노 공용 모집 공간을 생성하세요')


def output(r):
    return {k:(str(v) if isinstance(v,UUID) else v.isoformat() if hasattr(v,'isoformat') else v) for k,v in r.items()}


def validate(conn,b):
    workspace(conn)
    if not b.name.strip():raise HTTPException(400,'매핑 이름을 입력하세요')
    from .routes_recruitment_links import validate_campaign
    validate_campaign(conn,b.target_brand_id,b.campaign_id,b.product_id)
    target=conn.execute("SELECT 1 FROM brands WHERE brand_id=%s AND NOT is_internal AND NOT is_demo AND brand_id NOT LIKE 'qa-%%'",(b.target_brand_id,)).fetchone()
    if not target:raise HTTPException(409,'실제 고객 브랜드를 선택하세요')
    if not conn.execute("SELECT 1 FROM brand_products WHERE product_id=%s AND brand_id=%s AND state='active'",(b.product_id,b.target_brand_id)).fetchone():
        raise HTTPException(409,'선택 브랜드의 활성 제품이 아닙니다')
    account=None
    if b.gmail_account_id:
        account=conn.execute("SELECT state,sending_paused FROM gmail_accounts WHERE account_id=%s AND brand_id=%s",(b.gmail_account_id,WORKSPACE)).fetchone()
        if not account:raise HTTPException(409,'공용 모집 공간에 연결된 발신 계정이 아닙니다')
    if b.state=='active' and (not account or account['state']!='connected' or account['sending_paused'] or not b.subject.strip() or not b.body.strip()):
        raise HTTPException(409,'활성화하려면 연결된 발신 계정과 제목·본문이 필요합니다')
    if '\n' in b.subject or '\r' in b.subject:raise HTTPException(400,'제목에 줄바꿈을 넣을 수 없습니다')
    values={k:'' for k in ('name','reason','brand','product')}
    bulk.render_text(b.subject,values);bulk.render_text(b.body,values)


@router.get('/options')
def options(_admin:dict=Depends(require_admin)):
    with connect() as c:
        workspace(c)
        brands=c.execute("SELECT brand_id,name FROM brands WHERE NOT is_internal AND NOT is_demo AND brand_id NOT LIKE 'qa-%%' ORDER BY name").fetchall()
        products=c.execute("SELECT p.product_id,p.brand_id,p.name FROM brand_products p JOIN brands b USING(brand_id) WHERE p.state='active' AND NOT b.is_internal AND NOT b.is_demo AND b.brand_id NOT LIKE 'qa-%%' ORDER BY b.name,p.name").fetchall()
        from . import routes_gmail as gmail
        accounts=[]
        for a in c.execute('SELECT * FROM gmail_accounts WHERE brand_id=%s ORDER BY email',(WORKSPACE,)).fetchall():
            usage=gmail._acct_out(gmail._with_delivery_usage(c,a))
            reserved=c.execute("SELECT count(*) AS n FROM outreach_recipients r JOIN outreach_batches b USING(batch_id) WHERE b.gmail_account_id=%s AND b.state IN ('draft','approved') AND r.state IN ('pending','sending')",(a['account_id'],)).fetchone()['n']
            accounts.append({'account_id':a['account_id'],'email':a['email'],'state':a['state'],'sending_paused':a['sending_paused'],
                'today_cap':usage['todayCap'],'sent_last_24h':usage['sentLast24Hours'],'reserved':reserved,
                'available':max(0,usage['remainingToday']-reserved) if a['state']=='connected' else 0,
                'can_read':usage['canRead'],'pause_reason':usage['pauseReason']})
        campaigns=c.execute("SELECT campaign_id,brand_id,product_id,name FROM campaigns WHERE status='open' AND product_id IS NOT NULL ORDER BY name").fetchall()
    from . import runner_daemon
    queue=runner_daemon.status()['jobs']['sendResume']
    return {'creatorEntryReady':bool(os.environ.get('TIKTOK_CLIENT_KEY') and os.environ.get('TIKTOK_CLIENT_SECRET')),'queue':{'enabled':queue['enabled'],'reason':queue['reason']},'campaigns':[output(r) for r in campaigns],'brands':[output(r) for r in brands],'products':[output(r) for r in products],'accounts':[output(r) for r in accounts]}


@router.get('/mappings')
def mappings(_admin:dict=Depends(require_admin)):
    with connect() as c:
        workspace(c)
        rows=c.execute("""SELECT m.*,b.name AS brand_name,p.name AS product_name,g.email AS sender_email,
           (SELECT count(*) FROM outreach_batches x WHERE x.brand_id=m.workspace_id AND split_part(x.mapping_key,'_',1)=m.mapping_id::text) AS batch_count
           FROM recruitment_mappings m JOIN brands b ON b.brand_id=m.target_brand_id
           JOIN brand_products p USING(product_id) LEFT JOIN gmail_accounts g ON g.account_id=m.gmail_account_id
           WHERE m.workspace_id=%s ORDER BY m.updated_at DESC,m.mapping_id""",(WORKSPACE,)).fetchall()
    return {'mappings':[output(r) for r in rows]}


@router.post('/mappings')
def create(body:MappingIn,_admin:dict=Depends(require_admin)):
    with connect() as c:
        validate(c,body)
        data=body.model_dump(exclude={'revision'});data['name']=data['name'].strip()
        keys=list(data)
        row=c.execute('INSERT INTO recruitment_mappings(workspace_id,'+','.join(keys)+') VALUES(%s,'+','.join(['%s']*len(keys))+') RETURNING *',[WORKSPACE]+list(data.values())).fetchone()
        ledger_append(c,str(_admin['sub']),'RECRUITMENT_MAPPING_CREATED',str(row['mapping_id']),{'productId':str(body.product_id),'state':body.state})
    return output(row)


@router.put('/mappings/{mapping_id}')
def update(mapping_id:UUID,body:MappingIn,_admin:dict=Depends(require_admin)):
    with connect() as c:
        validate(c,body)
        old=c.execute('SELECT * FROM recruitment_mappings WHERE mapping_id=%s AND workspace_id=%s FOR UPDATE',(mapping_id,WORKSPACE)).fetchone()
        if not old:raise HTTPException(404,'매핑을 찾을 수 없습니다')
        if old['revision']!=body.revision:raise HTTPException(409,'다른 관리자가 수정했습니다. 새로고침 후 다시 검토하세요')
        data=body.model_dump(exclude={'revision'});data['name']=data['name'].strip()
        row=c.execute('UPDATE recruitment_mappings SET '+','.join(k+'=%s' for k in data)+',revision=revision+1,updated_at=now() WHERE mapping_id=%s RETURNING *',list(data.values())+[mapping_id]).fetchone()
        ledger_append(c,str(_admin['sub']),'RECRUITMENT_MAPPING_UPDATED',str(mapping_id),{'revision':row['revision'],'state':body.state})
    return output(row)


def saved_plan(c,mapping_id,body):
    workspace(c)
    r=c.execute('SELECT * FROM recruitment_mappings WHERE mapping_id=%s AND workspace_id=%s FOR UPDATE',(mapping_id,WORKSPACE)).fetchone()
    if not r:raise HTTPException(404,'매핑을 찾을 수 없습니다')
    if r['revision']!=body.revision:raise HTTPException(409,'매핑이 변경되었습니다. 다시 미리보기 하세요')
    if r['state']!='active':raise HTTPException(409,'활성 매핑에서만 초안을 만들 수 있습니다')
    definition=bulk.Mapping(key=str(mapping_id),target_brand_id=r['target_brand_id'],product_id=r['product_id'],gmail_account_id=r['gmail_account_id'],subject=r['subject'],body=r['body'],campaign_id=r['campaign_id'])
    rows=[bulk.Candidate(email=x.email,name=x.name,reason=x.reason,mapping_key=str(mapping_id)) for x in body.rows]
    return bulk.Plan(mappings=[definition],rows=rows)


@router.post('/mappings/{mapping_id}/preview')
def preview(mapping_id:UUID,body:RowsIn,authorization:str=Header(default=''),_admin:dict=Depends(require_admin)):
    with connect() as c:
        plan=saved_plan(c,mapping_id,body)
        return bulk.prepare(c,WORKSPACE,plan,authorization)[0]


@router.post('/mappings/{mapping_id}/drafts')
def drafts(mapping_id:UUID,body:DraftRows,authorization:str=Header(default=''),_admin:dict=Depends(require_admin)):
    # Keep mapping revision/state locked until draft transaction completes.
    with connect() as c:
        plan=saved_plan(c,mapping_id,body)
        result=bulk.save(WORKSPACE,bulk.SavePlan(**plan.model_dump(),request_id=body.request_id,review_hash=body.review_hash),authorization)
    return result


@router.get('/mappings/{mapping_id}/batches')
def batches(mapping_id:UUID,_admin:dict=Depends(require_admin)):
    with connect() as c:
        workspace(c)
        if not c.execute('SELECT 1 FROM recruitment_mappings WHERE mapping_id=%s AND workspace_id=%s',(mapping_id,WORKSPACE)).fetchone():raise HTTPException(404,'매핑을 찾을 수 없습니다')
        rows=c.execute("""SELECT b.batch_id,b.target_brand_id,b.product_name,b.subject,b.state,b.sending_paused,b.created_at,g.email AS sender_email,
          count(r.recipient_id) AS recipient_count,
          count(*) FILTER(WHERE r.state='sent') AS sent_count,
          count(*) FILTER(WHERE r.state='review') AS review_count,
          count(*) FILTER(WHERE r.state='pending') AS pending_count,
          count(*) FILTER(WHERE r.state='blocked') AS blocked_count
          FROM outreach_batches b LEFT JOIN outreach_recipients r USING(batch_id)
          LEFT JOIN gmail_accounts g ON g.account_id=b.gmail_account_id
          WHERE b.brand_id=%s AND split_part(b.mapping_key,'_',1)=%s GROUP BY b.batch_id,g.email ORDER BY b.created_at DESC,b.batch_id DESC LIMIT 100""",(WORKSPACE,str(mapping_id))).fetchall()
    return {'batches':[output(r) for r in rows],'limit':100,'note':'최근 100개 배치. 수신 주소·발송 상태 기준이며 배달·고유 인원·회신·신청·판매 성과가 아닙니다.'}


def distributed_plan(c,mapping_id,body):
    """Stable, capacity bounded allocation. Existing conversations never rotate senders."""
    from . import routes_gmail as gmail
    base=saved_plan(c,mapping_id,body).mappings[0]
    ids=sorted(set(body.sender_ids),key=str)
    if len(ids)!=len(body.sender_ids):raise HTTPException(400,'발신 계정이 중복되었습니다')
    old=[]
    if getattr(body,'request_id',None):
        prior=c.execute('SELECT batch_ids FROM outreach_bulk_saves WHERE brand_id=%s AND request_id=%s',(WORKSPACE,body.request_id)).fetchone()
        if prior:old=prior['batch_ids']
    senders={}
    for aid in ids:
        a=c.execute("SELECT * FROM gmail_accounts WHERE account_id=%s AND brand_id=%s AND state='connected' AND NOT sending_paused",(aid,WORKSPACE)).fetchone()
        if not a:raise HTTPException(409,'공용 공간의 연결·중지 상태를 확인하고 발신 계정을 다시 선택하세요')
        remaining=gmail._acct_out(gmail._with_delivery_usage(c,a))['remainingToday']
        reserved=c.execute("SELECT count(*) AS n FROM outreach_recipients r JOIN outreach_batches b USING(batch_id) WHERE b.gmail_account_id=%s AND b.state IN ('draft','approved') AND r.state IN ('pending','sending') AND NOT (b.batch_id=ANY(%s::uuid[]))",(aid,old)).fetchone()['n']
        senders[str(aid)]=max(0,remaining-reserved)
    emails=list({r.email.strip().lower() for r in body.rows})
    history=c.execute("SELECT t.creator_email,m.gmail_account_id FROM mail_threads t JOIN mail_messages m USING(thread_id) WHERE t.brand_id=%s AND t.creator_email=ANY(%s) AND m.gmail_account_id IS NOT NULL AND m.state='sent' ORDER BY m.created_at DESC,m.msg_id DESC",(WORKSPACE,emails)).fetchall()
    pinned={}
    for r in history:pinned.setdefault(r['creator_email'],str(r['gmail_account_id']))
    assigned={};rows=[];unassigned=[];allocated={k:0 for k in senders}
    for number,r in enumerate(body.rows,1):
        email=r.email.strip().lower()
        if email in assigned:aid=assigned[email]
        else:
            aid=pinned.get(email)
            if aid and (aid not in senders or senders[aid]<=0):
                unassigned.append({'row':number,'reason':'original_sender_unavailable'});continue
            if not aid:aid=min((k for k in senders if senders[k]>0),key=lambda k:allocated[k],default=None)
            if not aid:
                unassigned.append({'row':number,'reason':'sender_capacity_exhausted'});continue
            assigned[email]=aid;senders[aid]-=1;allocated[aid]+=1
        rows.append(bulk.Candidate(email=r.email,name=r.name,reason=r.reason,mapping_key=str(mapping_id)+'_'+str(ids.index(UUID(aid)))))
    if not rows:raise HTTPException(409,'배정 가능한 발신 잔여량이 없습니다. 기존 대기열·원래 발신자·계정 연결을 확인하세요')
    mappings=[bulk.Mapping(**{**base.model_dump(),'key':str(mapping_id)+'_'+str(i),'gmail_account_id':aid}) for i,aid in enumerate(ids) if any(r.mapping_key==str(mapping_id)+'_'+str(i) for r in rows)]
    return bulk.Plan(mappings=mappings,rows=rows),unassigned


@router.post('/mappings/{mapping_id}/distributed/preview')
def distributed_preview(mapping_id:UUID,body:DistributedRows,authorization:str=Header(default=''),_admin:dict=Depends(require_admin)):
    with connect() as c:
        plan,unassigned=distributed_plan(c,mapping_id,body)
        result=bulk.prepare(c,WORKSPACE,plan,authorization)[0]
        return {**result,'unassigned':unassigned,'submittedCount':len(body.rows)}


@router.post('/mappings/{mapping_id}/distributed/drafts')
def distributed_drafts(mapping_id:UUID,body:DistributedDrafts,authorization:str=Header(default=''),_admin:dict=Depends(require_admin)):
    with connect() as c:
        c.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('distributed-recruitment:'+WORKSPACE,))
        plan,_=distributed_plan(c,mapping_id,body)
        return bulk.save(WORKSPACE,bulk.SavePlan(**plan.model_dump(),request_id=body.request_id,review_hash=body.review_hash),authorization)
