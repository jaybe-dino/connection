"""Reusable multi-brand preparation plans. No mail, queues or recipients written."""
import json
import re
from datetime import date
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from .auth import require_admin_jwt
from .db import connect, ledger_append

router=APIRouter(prefix='/admin/recruitment/repeat-plans',dependencies=[Depends(require_admin_jwt)])


class Definition(BaseModel):
    mapping_ids:list[UUID]=Field(min_length=1,max_length=30)
    sender_ids:list[UUID]=Field(default_factory=list,max_length=200)
    count_per_brand:int=Field(default=100,ge=1,le=1000)
    countries:str=Field(default='',max_length=100)
    categories:str=Field(default='',max_length=300)
    tags:str=Field(default='',max_length=300)
    min_followers:int=Field(default=10000,ge=0,le=2_000_000_000)
    max_followers:int=Field(default=1000000,ge=0,le=2_000_000_000)
    audience:str=Field(default='new',pattern=r'^(new|relationships)$')
    allow_unverified:bool=False
    evidence_only:bool=True


class PlanIn(BaseModel):
    name:str=Field(min_length=1,max_length=100)
    definition:Definition
    cadence:str=Field(pattern=r'^(weekly|monthly)$')
    next_prepare_on:date
    revision:int=Field(default=1,ge=1)


def validate(c,b):
    d=b.definition
    countries=[x.strip().upper() for x in d.countries.split(',') if x.strip()]
    if not b.name.strip() or any(not re.fullmatch('[A-Z]{2}',x) for x in countries):raise HTTPException(400,'계획 이름·국가 코드를 확인하세요')
    if len(set(d.mapping_ids))!=len(d.mapping_ids) or len(set(d.sender_ids))!=len(d.sender_ids):raise HTTPException(400,'브랜드 제안·발신 계정이 중복됩니다')
    if d.max_followers<d.min_followers:raise HTTPException(400,'팔로워 범위를 확인하세요')
    n=c.execute("SELECT count(*) AS n FROM recruitment_mappings m JOIN brands b ON b.brand_id=m.target_brand_id WHERE m.mapping_id=ANY(%s::uuid[]) AND m.workspace_id='dino-recruitment' AND m.state IN ('draft','active') AND b.suspended_at IS NULL",(d.mapping_ids,)).fetchone()['n']
    if n!=len(d.mapping_ids):raise HTTPException(409,'사용 가능한 공용 모집 제안을 선택하세요')
    if d.sender_ids:
        n=c.execute("SELECT count(*) AS n FROM gmail_accounts WHERE account_id=ANY(%s::uuid[]) AND brand_id='dino-recruitment' AND state='connected'",(d.sender_ids,)).fetchone()['n']
        if n!=len(d.sender_ids):raise HTTPException(409,'공용 모집에 연결된 발신 계정을 선택하세요')


@router.get('')
def list_plans():
    with connect() as c:return {'plans':c.execute('SELECT * FROM recruitment_repeat_plans WHERE archived_at IS NULL ORDER BY next_prepare_on,created_at DESC LIMIT 100').fetchall(),'automaticSending':False}


@router.post('')
def save_plan(b:PlanIn,actor:dict=Depends(require_admin_jwt)):
    with connect() as c:
        validate(c,b)
        r=c.execute('INSERT INTO recruitment_repeat_plans(name,definition,cadence,next_prepare_on,created_by) VALUES(%s,%s,%s,%s,%s) RETURNING *',(b.name.strip(),json.dumps(b.definition.model_dump(mode='json')),b.cadence,b.next_prepare_on,str(actor['sub']))).fetchone()
        ledger_append(c,str(actor['sub']),'RECRUITMENT_REPEAT_PREPARATION_SAVED',str(r['plan_id']),{'automaticSending':False})
        return r


@router.put('/{plan_id}')
def update_plan(plan_id:UUID,b:PlanIn,actor:dict=Depends(require_admin_jwt)):
    with connect() as c:
        validate(c,b)
        old=c.execute('SELECT * FROM recruitment_repeat_plans WHERE plan_id=%s AND archived_at IS NULL FOR UPDATE',(plan_id,)).fetchone()
        if not old:raise HTTPException(404,'반복 준비 계획 없음')
        if old['revision']!=b.revision:raise HTTPException(409,'다른 담당자가 수정했습니다. 다시 불러오세요')
        r=c.execute('UPDATE recruitment_repeat_plans SET name=%s,definition=%s,cadence=%s,next_prepare_on=%s,revision=revision+1,updated_at=now() WHERE plan_id=%s RETURNING *',(b.name.strip(),json.dumps(b.definition.model_dump(mode='json')),b.cadence,b.next_prepare_on,plan_id)).fetchone()
        ledger_append(c,str(actor['sub']),'RECRUITMENT_REPEAT_PREPARATION_UPDATED',str(plan_id),{'revision':r['revision'],'automaticSending':False})
        return r


@router.post('/{plan_id}/archive')
def archive_plan(plan_id:UUID,actor:dict=Depends(require_admin_jwt)):
    with connect() as c:
        r=c.execute('UPDATE recruitment_repeat_plans SET archived_at=now() WHERE plan_id=%s AND archived_at IS NULL RETURNING plan_id',(plan_id,)).fetchone()
        if not r:raise HTTPException(404,'반복 준비 계획 없음')
        ledger_append(c,str(actor['sub']),'RECRUITMENT_REPEAT_PREPARATION_ARCHIVED',str(plan_id),{'sendingChanged':False})
        return {'archived':True,'sendingChanged':False}


class MultiGroup(BaseModel):
    mapping_id:UUID
    revision:int=Field(ge=1)
    # Bound the complete operation to 10,000 below.
    rows:list[dict]=Field(min_length=1,max_length=1000)


class MultiPreview(BaseModel):
    groups:list[MultiGroup]=Field(min_length=1,max_length=30)
    sender_ids:list[UUID]=Field(min_length=1,max_length=200)


class MultiSave(MultiPreview):
    request_id:UUID
    review_hash:str=Field(pattern=r'^[a-f0-9]{64}$')


def multi_plan(c,b):
    from collections import Counter
    from . import routes_outreach_bulk as bulk, routes_recruitment as r
    if sum(len(g.rows) for g in b.groups)>10000:raise HTTPException(413,'한 번에 10,000행까지 검수합니다')
    if len({g.mapping_id for g in b.groups})!=len(b.groups):raise HTTPException(400,'제품 제안이 중복되었습니다')
    offsets=Counter();mappings=[];rows=[];unassigned=[]
    for g in b.groups:
        try:values={'revision':g.revision,'sender_ids':b.sender_ids,'rows':[bulk.Candidate(**{**x,'mapping_key':str(g.mapping_id)}) for x in g.rows]}
        except ValueError:raise HTTPException(422,'대상의 이메일·이름·선정 이유 형식을 확인하세요') from None
        if isinstance(b,MultiSave):values.update(request_id=b.request_id,review_hash=b.review_hash)
        args=(r.DistributedDrafts if isinstance(b,MultiSave) else r.DistributedRows)(**values)
        plan,missing=r.distributed_plan(c,g.mapping_id,args,offsets,allow_empty=True)
        unassigned.extend({'mappingId':str(g.mapping_id),**x} for x in missing)
        if plan:
            accounts={m.key:str(m.gmail_account_id) for m in plan.mappings}
            for key,email in {(x.mapping_key,x.email.strip().lower()) for x in plan.rows}:offsets[accounts[key]]+=1
            mappings.extend(plan.mappings);rows.extend(plan.rows)
    if not rows:raise HTTPException(409,'발신 잔여량 또는 원래 대화 계정을 확인하세요. 배정 가능한 대상이 없습니다.')
    if len(mappings)>500:raise HTTPException(413,'브랜드·발신 계정 조합이 너무 많습니다. 나눠서 준비하세요')
    return bulk.Plan(mappings=mappings,rows=rows),unassigned


from fastapi import Header


@router.post('/multi/preview')
def preview_multi(b:MultiPreview,authorization:str=Header(default='')):
    from . import routes_outreach_bulk as bulk
    with connect() as c:
        plan,missing=multi_plan(c,b)
        result=bulk.prepare(c,'dino-recruitment',plan,authorization)[0]
        result.update(unassigned=missing,submittedCount=sum(len(g.rows) for g in b.groups))
        # Include original mapping revisions and missing assignments in the reviewed contract.
        result['multiReviewHash']=bulk.digest({'input':b.model_dump(mode='json'),'review':result})
        return result


@router.post('/multi/drafts')
def save_multi(b:MultiSave,authorization:str=Header(default=''),actor:dict=Depends(require_admin_jwt)):
    from . import routes_outreach_bulk as bulk
    original=MultiPreview(**b.model_dump(exclude={'request_id','review_hash'}))
    caller_hash=bulk.digest(original.model_dump(mode='json'))
    with connect() as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtextextended('distributed-recruitment:dino-recruitment',0))")
        prior=c.execute('SELECT * FROM recruitment_multi_saves WHERE request_id=%s',(b.request_id,)).fetchone()
        if prior:
            if prior['input_hash']!=caller_hash:raise HTTPException(409,'동일 저장 요청의 내용이 바뀌었습니다')
            return {**prior['result'],'replayed':True,'written':False}
        plan,missing=multi_plan(c,b)
        result=bulk.prepare(c,'dino-recruitment',plan,authorization)[0]
        result.update(unassigned=missing,submittedCount=sum(len(g.rows) for g in b.groups))
        if bulk.digest({'input':original.model_dump(mode='json'),'review':result})!=b.review_hash:
            raise HTTPException(409,'제안·대상·발신 잔여량이 변경됐습니다. 다시 검수해 주세요.')
        saved=bulk.save_plan_in_conn(c,'dino-recruitment',bulk.SavePlan(**plan.model_dump(),request_id=b.request_id,review_hash=result['reviewHash']),str(actor['sub']),authorization)
        c.execute('INSERT INTO recruitment_multi_saves(request_id,input_hash,result) VALUES(%s,%s,%s)',(b.request_id,caller_hash,json.dumps(saved)))
        ledger_append(c,str(actor['sub']),'MULTI_BRAND_DRAFTS_SAVED',str(b.request_id),{'batchCount':len(saved['batchIds']),'sent':False})
        return saved
