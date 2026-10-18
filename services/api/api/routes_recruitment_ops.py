"""Admin operations: read-only cohorts, reply work queue, evidence and reporting.

No external AI calls, contact import, automatic reply, approval, or sending.
"""
import json
import re
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from .auth import require_admin_jwt
from .db import connect, ledger_append
from .routes_recruitment import WORKSPACE, workspace, output
from .routes_products import _latest_fields, _fit_tokens, _norm, _tag_terms

router=APIRouter(prefix='/admin/recruitment')


class CohortIn(BaseModel):
    countries:list[str]=Field(default_factory=list,max_length=20)
    languages:list[str]=Field(default_factory=list,max_length=10)
    categories:list[str]=Field(default_factory=list,max_length=20)
    tags:list[str]=Field(default_factory=list,max_length=20)
    min_followers:int=Field(default=0,ge=0,le=2_000_000_000)
    max_followers:int=Field(default=2_000_000_000,ge=0,le=2_000_000_000)
    limit:int=Field(default=100,ge=1,le=1000)
    allow_unverified:bool=False
    audience:str=Field(default='new',pattern=r'^(new|relationships)$')

    @field_validator('countries','languages','categories','tags')
    @classmethod
    def clean_terms(cls,values):
        if any(not isinstance(x,str) or len(x)>80 or not x.strip() for x in values):
            raise ValueError('필터 값은 1~80자입니다')
        return sorted(set(x.strip().lower() for x in values))


@router.post('/mappings/{mapping_id}/cohort')
def cohort(mapping_id:UUID,body:CohortIn,_admin:dict=Depends(require_admin_jwt)):
    if body.max_followers<body.min_followers:raise HTTPException(400,'팔로워 범위를 확인하세요')
    countries=[s.upper() for s in body.countries]
    if any(not re.fullmatch('[A-Z]{2}',s) for s in countries):raise HTTPException(400,'국가는 ISO 2자리로 입력하세요')
    with connect() as c:
        workspace(c)
        m=c.execute('SELECT * FROM recruitment_mappings WHERE mapping_id=%s AND workspace_id=%s',(mapping_id,WORKSPACE)).fetchone()
        if not m:raise HTTPException(404,'매핑을 찾을 수 없습니다')
        from .auth import check_suspended
        check_suspended(c,m['target_brand_id'])
        p=c.execute("SELECT name FROM brand_products WHERE product_id=%s AND brand_id=%s AND state='active'",(m['product_id'],m['target_brand_id'])).fetchone()
        if not p:raise HTTPException(409,'활성 제품을 확인하세요')
        version,fields=_latest_fields(c,m['product_id'])
        texts=[p['name']]+[str(f.get('value','')) for f in fields.values() if isinstance(f,dict)]
        keywords=set().union(*(_fit_tokens(t) for t in texts))
        product_text=_norm('\n'.join(texts))
        # Explicit hard filters execute before ranking. Unknown follower data
        # cannot satisfy an operator-specified numeric range.
        clauses=["p.email IS NOT NULL","p.email_status=ANY(%s::email_status_t[])","p.state<>'EXCLUDED'",
                 "NOT EXISTS(SELECT 1 FROM outreach_contact_blocks x WHERE x.email=lower(trim(p.email)))",
                 "NOT EXISTS(SELECT 1 FROM outreach_optouts x WHERE x.brand_id=ANY(%s) AND x.email=lower(trim(p.email)) AND x.opted_out_at IS NOT NULL)"]
        args=[['valid','none'] if body.allow_unverified else ['valid'],[WORKSPACE,m['target_brand_id']]]
        for values,sql in [(countries,'p.country=ANY(%s)'),(body.languages,'p.lang && %s::text[]'),(body.categories,'EXISTS(SELECT 1 FROM unnest(p.category) v WHERE lower(v)=ANY(%s))'),(body.tags,'EXISTS(SELECT 1 FROM unnest(p.product_tags) v WHERE lower(v)=ANY(%s))')]:
            if values:clauses.append(sql);args.append(values)
        if body.min_followers or body.max_followers<2_000_000_000:
            clauses.append('p.followers BETWEEN %s AND %s');args.extend([body.min_followers,body.max_followers])
        relationship="EXISTS(SELECT 1 FROM mail_threads t JOIN mail_messages mm USING(thread_id) WHERE t.creator_email=lower(trim(p.email)) AND t.brand_id=%s AND mm.state='sent')"
        clauses.append(('NOT ' if body.audience=='new' else '')+relationship);args.append(WORKSPACE)
        if body.audience=='new':
            clauses.append("NOT EXISTS(SELECT 1 FROM outreach_recipients r JOIN outreach_batches b USING(batch_id) WHERE lower(r.email)=lower(trim(p.email)) AND b.brand_id=%s AND ((r.state IN ('sent','sending','review')) OR (r.state='pending' AND b.state IN ('draft','approved'))))");args.append(WORKSPACE)
        # Fetch all filtered rows so ranking is not biased by the first page.
        rows=c.execute('SELECT p.* FROM creator_pool p WHERE '+' AND '.join(clauses),args).fetchall()
        ranked=[]
        for r in rows:
            phrases,tokens=_tag_terms((r['category'] or [])+(r['product_tags'] or []))
            matched=sorted((keywords&tokens)|{s for s in phrases if s in product_text})
            reasons=[]
            if matched:reasons.append('제품 프로필과 분류 일치: '+', '.join(matched[:6]))
            if not matched:reasons.append('제품 키워드 일치 근거 없음 · 운영자 적합성 검토 필요')
            if r['country']:reasons.append('수집 국가 '+r['country'])
            if r['lang']:reasons.append('수집 언어 '+', '.join(r['lang']))
            if r['followers'] is not None:reasons.append(f"수집 팔로워 {r['followers']:,}")
            if r['email_status']!='valid':reasons.append('이메일 미검증 · 발송 전 검수 필요')
            ranked.append((len(matched),r['contact_score'] or 0,r['influence_score'] or 0,r['followers'] or 0,str(r['creator_id']),r,reasons))
        ranked.sort(key=lambda r:(-r[0],-r[1],-r[2],-r[3],r[4]))
        selected=[];emails=set();identities=set()
        for score,_,__,___,cid,r,reasons in ranked:
            email=r['email'].strip().lower();identity=str(r['identity_group'] or r['creator_id'])
            if email in emails or identity in identities:continue
            emails.add(email);identities.add(identity)
            selected.append({'candidateId':cid,'identityKey':identity,'email':email,'name':r['display_name'] or r['handle'] or '',
                             'platform':r['platform'],'handle':r['handle'],'country':r['country'],'languages':r['lang'],
                             'followers':r['followers'],'emailStatus':r['email_status'],'matchedTerms':score,
                             'reasons':reasons,'reason':'; '.join(reasons)[:1000]})
        total=len(selected);selected=selected[:body.limit]
        with_matches=sum(1 for r in selected if r['matchedTerms'])
    return {'mappingId':str(mapping_id),'mappingRevision':m['revision'],'offerCode':'O-'+str(mapping_id)+'-R'+str(m['revision']),
            'productProfileVersion':version,'filters':body.model_dump(),'matchingPoolRows':len(rows),
            'uniqueCandidateGroups':total,'selectedCount':len(selected),'withProductEvidence':with_matches,'candidates':selected,
            'written':False,'sent':False,'identityCountVerified':False,
            'note':'이메일과 기존 identity_group 중복을 제외한 후보 집군입니다. 실인원 검증 수·발송 적격 보장이 아닙니다. 기존 관계 재제안도 원래 발신자·수신거부·90일 차단 검수를 유지합니다.'}


LABELS=('unreviewed','interested','paid_only','conditional','wrong_country','declined','optout','address_error','question','other')


def suggest_label(text):
    # Read only the new reply, not quoted invitations containing unsubscribe.
    lines=[]
    for line in text.splitlines():
        if line.startswith('>') or re.match(r'(?i)^(on .+wrote:|from:|보낸 사람:|-----original)',line.strip()):break
        lines.append(line)
    t='\n'.join(lines).lower().strip()
    if re.fullmatch(r'(unsubscribe|stop|수신\s?거부|please unsubscribe me)[.! ]*',t):return 'optout'
    if any(s in t for s in ('not interested','no thanks','관심 없','không quan tâm','ไม่สนใจ')):return 'declined'
    if any(s in t for s in ('paid only','paid collaboration','rate card','my rate','sponsorship fee','유료','단가','협업비')):return 'paid_only'
    if any(s in t for s in ('only if','provided that','조건부','조건이 맞','if you can')):return 'conditional'
    if any(s in t for s in ('interested','sounds good','love to','관심 있','좋아요','đồng ý','ได้ค่ะ')):return 'interested'
    if '?' in t or '？' in t:return 'question'
    return 'other'


@router.get('/inbox')
def inbox(label:str='',owner:str='',limit:int=Query(default=100,ge=1,le=200),_admin:dict=Depends(require_admin_jwt)):
    if label and label not in LABELS:raise HTTPException(400,'분류를 확인하세요')
    with connect() as c:
        workspace(c)
        rows=c.execute("""SELECT t.thread_id,t.creator_email,t.subject,t.last_message_at,t.last_direction,
          coalesce(q.label,'unreviewed') label,coalesce(q.owner_name,'') owner_name,
          coalesce(q.next_action,'') next_action,q.due_at,coalesce(q.note,'') note,coalesce(q.revision,0) revision,
          coalesce(m.body,'') latest_reply,m.msg_id AS reply_id,
          g.email AS sender_email,s.gmail_account_id,
          EXISTS(SELECT 1 FROM outreach_contact_blocks x WHERE x.email=t.creator_email) blocked
          FROM mail_threads t LEFT JOIN recruitment_thread_tasks q USING(thread_id)
          LEFT JOIN LATERAL(SELECT body,msg_id FROM mail_messages WHERE thread_id=t.thread_id AND direction='in' ORDER BY created_at DESC,msg_id DESC LIMIT 1)m ON true
          LEFT JOIN LATERAL(SELECT gmail_account_id FROM mail_messages WHERE thread_id=t.thread_id AND direction='out' AND state='sent' AND gmail_account_id IS NOT NULL ORDER BY created_at DESC,msg_id DESC LIMIT 1)s ON true
          LEFT JOIN gmail_accounts g ON g.account_id=s.gmail_account_id
          WHERE t.brand_id=%s AND m.msg_id IS NOT NULL AND (%s='' OR coalesce(q.label,'unreviewed')=%s)
          AND EXISTS(SELECT 1 FROM mail_messages prior WHERE prior.thread_id=t.thread_id AND prior.direction='out' AND prior.state='sent' AND prior.gmail_account_id IS NOT NULL)
          AND (%s='' OR coalesce(q.owner_name,'')=%s)
          ORDER BY q.due_at ASC NULLS LAST,t.last_message_at DESC,t.thread_id LIMIT %s""",(WORKSPACE,label,label,owner,owner,limit)).fetchall()
        unmatched=c.execute("""SELECT count(*) n FROM mail_threads t WHERE t.brand_id=%s
          AND EXISTS(SELECT 1 FROM mail_messages i WHERE i.thread_id=t.thread_id AND i.direction='in')
          AND NOT EXISTS(SELECT 1 FROM mail_messages o WHERE o.thread_id=t.thread_id AND o.direction='out' AND o.state='sent' AND o.gmail_account_id IS NOT NULL)""",(WORKSPACE,)).fetchone()['n']
    return {'threads':[{**output(r),'suggested_label':suggest_label(r['latest_reply'])} for r in rows],'unlinkedInboundThreads':unmatched,'limit':limit,'sent':False,'note':'실제 발신 이력과 연결된 대화만 표시합니다. 규칙 기반 추천 분류는 확정 결과가 아니며 자동 답장은 하지 않습니다.'}


class TaskIn(BaseModel):
    label:str=Field(pattern=r'^(unreviewed|interested|paid_only|conditional|wrong_country|declined|optout|address_error|question|other)$')
    owner_name:str=Field(default='',max_length=100)
    next_action:str=Field(default='',max_length=500)
    due_at:datetime|None=None
    note:str=Field(default='',max_length=2000)
    revision:int=Field(ge=0)


@router.put('/inbox/{thread_id}')
def save_task(thread_id:UUID,body:TaskIn,_admin:dict=Depends(require_admin_jwt)):
    if body.due_at and body.due_at.tzinfo is None:raise HTTPException(400,'기한에 시간대가 필요합니다')
    with connect() as c:
        workspace(c)
        t=c.execute('SELECT creator_email FROM mail_threads WHERE thread_id=%s AND brand_id=%s FOR UPDATE',(thread_id,WORKSPACE)).fetchone()
        if not t:raise HTTPException(404,'공용 모집 대화가 아닙니다')
        old=c.execute('SELECT revision FROM recruitment_thread_tasks WHERE thread_id=%s',(thread_id,)).fetchone()
        if (old['revision'] if old else 0)!=body.revision:raise HTTPException(409,'다른 담당자가 수정했습니다. 새로고침하세요')
        r=c.execute("""INSERT INTO recruitment_thread_tasks(thread_id,label,owner_name,next_action,due_at,note)
          VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(thread_id) DO UPDATE SET label=EXCLUDED.label,owner_name=EXCLUDED.owner_name,
          next_action=EXCLUDED.next_action,due_at=EXCLUDED.due_at,note=EXCLUDED.note,revision=recruitment_thread_tasks.revision+1,updated_at=now() RETURNING *""",(thread_id,body.label,body.owner_name.strip(),body.next_action.strip(),body.due_at,body.note.strip())).fetchone()
        if body.label in ('optout','address_error'):
            if not body.note.strip():raise HTTPException(400,'차단 분류에는 원문 확인 근거를 메모하세요')
            from .mail_safety import add_block
            add_block(c,t['creator_email'],'manual_stop' if body.label=='optout' else 'hard_bounce',body.note,str(_admin['sub']))
        ledger_append(c,str(_admin['sub']),'RECRUITMENT_REPLY_REVIEWED',str(thread_id),{'label':body.label,'revision':r['revision']})
    return {**output(r),'sent':False}


class FeedbackIn(BaseModel):
    recipient_id:UUID
    kind:str=Field(pattern=r'^(delivered|hard_bounce|complaint)$')
    source_key:str=Field(min_length=1,max_length=200)
    evidence:str=Field(min_length=8,max_length=2000)

    @field_validator('source_key','evidence')
    @classmethod
    def meaningful(cls,value,info):
        value=value.strip()
        if len(value)<(8 if info.field_name=='evidence' else 1):raise ValueError('식별자·확인 근거를 입력하세요')
        return value


@router.post('/feedback')
def feedback(body:FeedbackIn,_admin:dict=Depends(require_admin_jwt)):
    from .mail_safety import record_feedback
    with connect() as c:
        workspace(c)
        if not c.execute('SELECT 1 FROM outreach_recipients r JOIN outreach_batches b USING(batch_id) WHERE r.recipient_id=%s AND b.brand_id=%s',(body.recipient_id,WORKSPACE)).fetchone():raise HTTPException(404,'공용 모집의 수신 이력이 아닙니다')
        return record_feedback(c,body.recipient_id,body.kind,body.source_key,body.evidence,str(_admin['sub']))


@router.get('/safety')
def safety(_admin:dict=Depends(require_admin_jwt)):
    with connect() as c:
        workspace(c)
        blocks=c.execute('SELECT email,reason,evidence,created_at FROM outreach_contact_blocks ORDER BY created_at DESC LIMIT 100').fetchall()
        feedback=c.execute("""SELECT f.*,g.email sender_email FROM mail_delivery_feedback f JOIN gmail_accounts g USING(account_id)
          WHERE g.brand_id=%s ORDER BY f.created_at DESC LIMIT 100""",(WORKSPACE,)).fetchall()
    return {'blocks':[output(r) for r in blocks],'feedback':[output(r) for r in feedback],'limit':100,
            'policy':{'complaint':'확인 시 해당 계정 즉시 중지','hardBounce':'24시간 접수 20건 이상·영구 반송 3건 이상·3% 이상이면 계정 중지','resume':'자동 재개 없음'},'sent':False}


def bounds(start,end):
    if end<=start or (end-start).days>366:raise HTTPException(400,'조회 기간은 시작일 이상·종료일 미만, 최대 366일입니다')
    tz=ZoneInfo('Asia/Seoul')
    return datetime.combine(start,time(),tzinfo=tz),datetime.combine(end,time(),tzinfo=tz)


@router.get('/metrics')
def metrics(start:date,end:date,brand:str='',_admin:dict=Depends(require_admin_jwt)):
    lo,hi=bounds(start,end)
    with connect() as c:
        workspace(c)
        if brand and not c.execute('SELECT 1 FROM brands WHERE brand_id=%s AND NOT is_internal',(brand,)).fetchone():raise HTTPException(404,'고객 브랜드를 확인하세요')
        recipients=c.execute("""SELECT r.recipient_id,r.email,r.state,r.sent_at,b.target_brand_id AS brand_id,b.campaign_id,b.created_at
          FROM outreach_recipients r JOIN outreach_batches b USING(batch_id)
          WHERE b.brand_id=%s AND (%s='' OR b.target_brand_id=%s)
          AND ((r.sent_at>=%s AND r.sent_at<%s) OR (b.created_at>=%s AND b.created_at<%s))""",(WORKSPACE,brand,brand,lo,hi,lo,hi)).fetchall()
        apps=c.execute("""SELECT a.*,t.agreed_at,t.shipped_at,t.content_url,t.state AS collaboration_state
          FROM recruitment_applications a JOIN recruitment_application_links l USING(link_id)
          JOIN outreach_recipients r USING(recipient_id) JOIN outreach_batches b USING(batch_id)
          LEFT JOIN campaign_terms t ON t.campaign_id=a.campaign_id AND t.creator_id=a.creator_id
          WHERE b.brand_id=%s AND (%s='' OR a.brand_id=%s) AND a.applied_at>=%s AND a.applied_at<%s""",(WORKSPACE,brand,brand,lo,hi)).fetchall()
        proven=c.execute("""SELECT DISTINCT f.recipient_id,f.kind FROM mail_delivery_feedback f JOIN outreach_recipients r USING(recipient_id)
          JOIN outreach_batches b USING(batch_id) WHERE b.brand_id=%s AND (%s='' OR b.target_brand_id=%s)
          AND r.sent_at>=%s AND r.sent_at<%s""",(WORKSPACE,brand,brand,lo,hi)).fetchall()
        # Attribute a reply only through the exact provider thread and account;
        # one ambiguous reply is never credited to multiple brand campaigns.
        replies=c.execute("""SELECT * FROM (SELECT DISTINCT ON(i.msg_id) i.msg_id,i.created_at,r.email,b.target_brand_id brand_id
          FROM mail_messages i JOIN mail_messages o ON o.gmail_thread_id=i.gmail_thread_id AND o.gmail_account_id=i.gmail_account_id AND o.direction='out' AND o.state='sent'
          JOIN outreach_recipients r ON r.provider_id=o.gmail_message_id AND lower(r.email)=lower(i.from_email)
          JOIN outreach_batches b ON b.batch_id=r.batch_id AND b.gmail_account_id=i.gmail_account_id
          WHERE i.direction='in' AND i.created_at>=%s AND i.created_at<%s AND b.brand_id=%s
          AND o.created_at<=i.created_at
          ORDER BY i.msg_id,o.created_at DESC,r.recipient_id) attributed
          WHERE (%s='' OR attributed.brand_id=%s)""",(lo,hi,WORKSPACE,brand,brand)).fetchall()
        costs=c.execute('SELECT brand_id,category,sum(amount_krw) amount FROM recruitment_cost_entries WHERE period_start>=%s AND period_end<=%s AND (%s=\'\' OR brand_id=%s) GROUP BY brand_id,category',(start,end,brand,brand)).fetchall()
        usage=c.execute("SELECT u.brand_id,count(*) n,sum(u.unit_price) amount FROM signup_usage u JOIN brands b USING(brand_id) WHERE NOT b.is_internal AND NOT b.is_demo AND u.verified_at>=%s AND u.verified_at<%s AND (%s='' OR u.brand_id=%s) GROUP BY u.brand_id",(lo,hi,brand,brand)).fetchall()
    accepted=[r for r in recipients if r['sent_at'] and lo<=r['sent_at'].astimezone(lo.tzinfo)<hi and r['state']=='sent']
    def summary(bid=None):
        ar=[r for r in apps if bid is None or r['brand_id']==bid]
        sr=[r for r in accepted if bid is None or r['brand_id']==bid]
        rr=[r for r in replies if bid is None or r['brand_id']==bid]
        cc=[r for r in costs if bid is None or r['brand_id']==bid]
        recorded_costs=[r['amount'] for r in cc if r['category']!='revenue']
        cost=sum(recorded_costs,Decimal(0)) if recorded_costs else None
        revenues=[r['amount'] for r in cc if r['category']=='revenue']
        return {'brandId':bid,'providerAcceptedMessages':len(sr),'uniqueContactEmails':len({r['email'] for r in sr}),
                'replyMessages':len(rr),'uniqueReplyEmails':len({r['email'] for r in rr}),
                'applications':len(ar),'uniqueApplicants':len({r['creator_id'] for r in ar}),
                'campaignParticipations':len({(r['campaign_id'],r['creator_id']) for r in ar if r['campaign_id']}),
                'confirmedCreators':len({r['creator_id'] for r in ar if r['agreed_at']}),
                'shippedCreators':len({r['creator_id'] for r in ar if r['shipped_at']}),
                'contentLinkSubmittedCreators':len({r['creator_id'] for r in ar if r['content_url']}),
                'deliveryConfirmedCreators':None,'postedCreators':None,'orders':None,
                'recordedCostKRW':float(cost) if cost is not None else None,
                'recordedRevenueKRW':float(sum(revenues)) if revenues else None,
                'costPerApplicantKRW':float(cost/len({r['creator_id'] for r in ar})) if cost is not None and ar else None}
    bids=sorted({r['brand_id'] for r in recipients+apps+replies+costs if r['brand_id']})
    return {'start':start,'endExclusive':end,'timezone':'Asia/Seoul','total':summary(),
            'byBrand':[summary(b) for b in bids],
            'deliveredEvidenceMessages':len({r['recipient_id'] for r in proven if r['kind']=='delivered'}),
            'hardBounceMessages':len({r['recipient_id'] for r in proven if r['kind']=='hard_bounce'}),
            'complaintMessages':len({r['recipient_id'] for r in proven if r['kind']=='complaint'}),
            'processingStateRows':len([r for r in recipients if r['state'] in ('sent','sending','review')]),
            'networkSendAttempts':None,
            'verifiedSignupUsage':[output(r) for r in usage],
            'note':'기간은 KST [시작일, 종료일). 발송은 해당 기간 제공자 접수 상태이며 배달이 아닙니다. 신청·확정·출고·콘텐츠 링크는 기간 내 모집 신청 집군의 현재 상태입니다. 브랜드별 고유 인원 합과 전체 고유 인원은 다를 수 있습니다. 확인되지 않은 배송 완료·게시·주문은 null입니다. 비용·매출은 입력 근거가 있는 완전히 포함된 기간의 기록만 합산합니다. 검증 가입 청구 사용량은 별도이며 실제 수금·아웃리치 매출이 아닙니다.'}


class CostIn(BaseModel):
    brand_id:str=Field(min_length=1,max_length=40)
    period_start:date
    period_end:date
    category:str=Field(pattern=r'^(email|product|shipping|labor|other|revenue)$')
    amount_krw:Decimal=Field(ge=0,max_digits=16,decimal_places=2,allow_inf_nan=False)
    evidence:str=Field(min_length=8,max_length=2000)
    request_id:UUID

    @field_validator('evidence')
    @classmethod
    def meaningful(cls,value):
        if len(value.strip())<8:raise ValueError('비용·매출 확인 근거를 입력하세요')
        return value.strip()


@router.post('/costs')
def cost(body:CostIn,_admin:dict=Depends(require_admin_jwt)):
    bounds(body.period_start,body.period_end)
    with connect() as c:
        workspace(c)
        if not c.execute('SELECT 1 FROM brands WHERE brand_id=%s AND NOT is_internal AND NOT is_demo',(body.brand_id,)).fetchone():raise HTTPException(404,'고객 브랜드를 확인하세요')
        c.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('recruitment-cost:'+str(body.request_id),))
        existing=c.execute('SELECT * FROM recruitment_cost_entries WHERE request_id=%s',(body.request_id,)).fetchone()
        values=body.model_dump(exclude={'request_id'})
        if existing:
            if any(existing[k]!=v for k,v in values.items()):raise HTTPException(409,'동일 요청의 내용이 변경되었습니다. 중복 저장하지 않았습니다')
            return {'entryId':str(existing['entry_id']),'created':False,'sent':False}
        keys=list(values)
        r=c.execute('INSERT INTO recruitment_cost_entries('+','.join(keys)+',request_id,created_by) VALUES('+','.join(['%s']*(len(keys)+2))+') RETURNING entry_id',list(values.values())+[body.request_id,str(_admin['sub'])]).fetchone()
        ledger_append(c,str(_admin['sub']),'RECRUITMENT_COST_RECORDED',str(r['entry_id']),{'brandId':body.brand_id,'category':body.category,'amountKRW':str(body.amount_krw)})
    return {'entryId':str(r['entry_id']),'created':True,'sent':False}
