"""Explicit brand/product/sender mapping. Preview is readonly; saving never approves or sends."""
import hashlib
import json
import os
import re
from collections import Counter, defaultdict
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from .db import connect
from . import routes_gmail as gmail
from .routes_outreach import EMAIL, batch_out, guard, proposal_brand

router = APIRouter()
PLACEHOLDER = re.compile(r"{{\s*([a-z_]+)\s*}}")


class Mapping(BaseModel):
    key: str = Field(min_length=1, max_length=60, pattern=r'^[A-Za-z0-9_-]+$')
    target_brand_id: str = Field(min_length=1, max_length=40)
    product_id: UUID
    gmail_account_id: UUID
    campaign_id: str | None = Field(default=None,max_length=100)
    subject: str = Field(min_length=1, max_length=150)
    body: str = Field(min_length=1, max_length=10000)


class Candidate(BaseModel):
    email: str = Field(min_length=1, max_length=254)
    mapping_key: str = Field(min_length=1, max_length=60)
    name: str = Field(default='', max_length=100)
    reason: str = Field(default='', max_length=1000)


class Plan(BaseModel):
    mappings: list[Mapping] = Field(min_length=1, max_length=500)
    rows: list[Candidate] = Field(min_length=1, max_length=10000)


class SavePlan(Plan):
    request_id: UUID
    review_hash: str = Field(pattern=r'^[a-f0-9]{64}$')


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def plan_input(body):
    return {'mappings':[m.model_dump(mode='json') for m in body.mappings],
            'rows':[r.model_dump(mode='json') for r in body.rows]}


def render_text(template, values):
    unknown = set(PLACEHOLDER.findall(template)) - set(values)
    if unknown:
        raise HTTPException(400, '지원하지 않는 맞춤 필드: '+', '.join(sorted(unknown)))
    result = PLACEHOLDER.sub(lambda m:values[m.group(1)], template)
    # Unknown syntax must not silently turn into a sent placeholder.
    if '{{' in result or '}}' in result:
        raise HTTPException(400, '맞춤 필드 형식을 확인하세요')
    return result


def prepare(conn, brand, body, authorization):
    definitions = {}
    for mapping in body.mappings:
        if mapping.key in definitions:
            raise HTTPException(400, '매핑 키가 중복됩니다')
        target = proposal_brand(conn, brand, mapping.target_brand_id, authorization)
        product = conn.execute("SELECT p.name,b.name AS brand_name FROM brand_products p JOIN brands b USING(brand_id) WHERE p.product_id=%s AND p.brand_id=%s AND p.state='active'",(mapping.product_id,target)).fetchone()
        if not product:
            raise HTTPException(409, mapping.key+': 브랜드에 속한 활성 제품을 선택하세요')
        account = conn.execute("SELECT * FROM gmail_accounts WHERE account_id=%s AND brand_id=%s AND state='connected'",(mapping.gmail_account_id,brand)).fetchone()
        if not account:
            raise HTTPException(409, mapping.key+': 모집 공간에 연결된 발신 계정을 선택하세요')
        if account['sending_paused']:
            raise HTTPException(409, mapping.key+': 발송 중지된 계정입니다')
        from .routes_recruitment_links import validate_campaign
        validate_campaign(conn,target,mapping.campaign_id,mapping.product_id)
        definitions[mapping.key] = {'mapping':mapping, 'target':target, 'product':product,
                                    'account':gmail._acct_out(gmail._with_delivery_usage(conn,account))}

    normalized = []
    assignments = defaultdict(set)
    for i, row in enumerate(body.rows,1):
        if row.mapping_key not in definitions:
            raise HTTPException(400, f'{i}행: 등록되지 않은 매핑 키입니다')
        email = row.email.strip().lower()
        if not EMAIL.fullmatch(email):
            raise HTTPException(400, f'{i}행: 이메일 형식을 확인하세요')
        if any(c in row.name for c in '\r\n'):
            raise HTTPException(400, f'{i}행: 이름에 줄바꿈을 넣을 수 없습니다')
        normalized.append((i,email,row))
        assignments[email].add(row.mapping_key)
    emails = list(assignments)
    targets = sorted({brand} | {d['target'] for d in definitions.values()})
    suppressed = {(r['brand_id'],r['email']) for r in conn.execute("SELECT brand_id,email FROM outreach_optouts WHERE brand_id=ANY(%s) AND email=ANY(%s) AND opted_out_at IS NOT NULL",(targets,emails))}
    global_blocks={r['email'] for r in conn.execute('SELECT email FROM outreach_contact_blocks WHERE email=ANY(%s)',(emails,))}
    history = conn.execute("SELECT DISTINCT r.email,b.brand_id,COALESCE(b.target_brand_id,b.brand_id) AS target,r.state,b.state AS batch_state FROM outreach_recipients r JOIN outreach_batches b USING(batch_id) WHERE (b.brand_id=ANY(%s) OR b.target_brand_id=ANY(%s)) AND r.email=ANY(%s) AND ((r.state IN ('sent','sending','review') AND b.created_at>now()-interval '90 days') OR (r.state='pending' AND b.state IN ('draft','approved')))",(targets,targets,emails)).fetchall()
    history_by_email = defaultdict(list)
    for record in history:history_by_email[record['email']].append(record)
    prior_senders={}
    for record in conn.execute("SELECT t.creator_email,m.gmail_account_id FROM mail_threads t JOIN mail_messages m USING(thread_id) WHERE t.brand_id=%s AND t.creator_email=ANY(%s) AND m.gmail_account_id IS NOT NULL AND m.state='sent' AND m.direction='out' ORDER BY m.created_at DESC,m.msg_id DESC",(brand,emails)):
        prior_senders.setdefault(record['creator_email'],str(record['gmail_account_id']))
    excluded, eligible, seen = [], defaultdict(list), set()
    for number,email,row in normalized:
        definition = definitions[row.mapping_key]
        scope = {brand,definition['target']}
        relevant = [h for h in history_by_email[email] if h['brand_id'] in scope or h['target'] in scope]
        reason = ('mapping_conflict' if len(assignments[email])>1 else
                  'duplicate_row' if email in seen else
                  'contact_blocked' if email in global_blocks else
                  'opted_out' if any((s,email) in suppressed for s in scope) else
                  'sender_mismatch' if email in prior_senders and prior_senders[email]!=str(definition['mapping'].gmail_account_id) else
                  'recent_contact' if any(h['state'] in ('sent','sending','review') for h in relevant) else
                  'reserved_draft_or_queue' if relevant else None)
        seen.add(email)
        if reason:
            excluded.append({'row':number,'email':email,'mappingKey':row.mapping_key,'reason':reason})
            continue
        values = {'name':row.name.strip(), 'reason':row.reason.strip(),
                  'brand':definition['product']['brand_name'], 'product':definition['product']['name']}
        mapping = definition['mapping']
        subject = render_text(mapping.subject,values).strip()
        text = render_text(mapping.body,values).strip()
        from .routes_recruitment_links import validate_ctas
        validate_ctas(text,definition['target'])
        join_url = os.environ.get('CREATOR_APP_URL','https://app.theprlist.net').rstrip('/')+'/?brand='+definition['target']
        if join_url not in text:
            text += '\n\n▶ 브랜드 PR 리스트 합류(무료): '+join_url
        if not subject or not text or len(subject)>150 or len(text)>10000 or any(c in subject for c in '\r\n'):
            raise HTTPException(400, f'{number}행: 맞춤 적용 후 제목·본문 길이와 줄바꿈을 확인하세요')
        eligible[row.mapping_key].append({'email':email,'subject':subject,'body':text})

    groups, planned = [], Counter()
    for key, definition in definitions.items():
        records = eligible[key]
        account = definition['account']
        planned[account['accountId']] += len(records)
        mapping = definition['mapping']
        groups.append({'key':key,'targetBrandId':definition['target'],'brandName':definition['product']['brand_name'],
                       'productId':str(mapping.product_id),'productName':definition['product']['name'],'campaignId':mapping.campaign_id,
                       'gmailAccountId':str(mapping.gmail_account_id),'senderEmail':account['email'],
                       'eligibleCount':len(records),'batchCount':(len(records)+199)//200,
                       'samples':records[:3]})
    capacities = {d['account']['accountId']:d['account'] for d in definitions.values()}
    result = {'inputCount':len(body.rows),'uniqueEmailCount':len(emails),'eligibleCount':sum(len(r) for r in eligible.values()),
              'excluded':excluded,'groups':groups,'batchCount':sum(g['batchCount'] for g in groups),
              'senders':[{'accountId':aid,'email':capacities[aid]['email'],'plannedRecipients':n,
                          'remainingSystemCapacity':capacities[aid]['remainingToday'],
                          'overCurrentCapacity':max(0,n-capacities[aid]['remainingToday'])} for aid,n in planned.items()],
              'identityCountVerified':False,'written':False,'sent':False}
    result['reviewHash'] = digest({'input':plan_input(body),'review':result})
    return result, definitions, eligible


@router.post('/brands/{brand}/outreach/bulk/preview')
def preview(brand: str, body: Plan, authorization: str = Header(default='')):
    guard(brand,authorization)
    with connect() as conn:
        return prepare(conn,brand,body,authorization)[0]


@router.post('/brands/{brand}/outreach/bulk/drafts')
def save(brand: str, body: SavePlan, authorization: str = Header(default='')):
    actor = guard(brand,authorization)
    with connect() as conn:
        return save_plan_in_conn(conn, brand, body, actor, authorization)


def save_plan_in_conn(conn, brand: str, body: SavePlan, actor: str, authorization: str):
    input_hash = digest(plan_input(body))
    # Serializes plans for the same recruitment workspace; atomic, no partial save.
    conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('bulk-outreach:'+brand,))
    prior = conn.execute('SELECT * FROM outreach_bulk_saves WHERE brand_id=%s AND request_id=%s',(brand,body.request_id)).fetchone()
    if prior:
        if prior['input_hash'] != input_hash:
            raise HTTPException(409,'같은 저장 요청을 다른 내용으로 사용할 수 없습니다')
        return {'batchIds':prior['batch_ids'],'replayed':True,'written':False,'sent':False}
    result, definitions, eligible = prepare(conn,brand,body,authorization)
    if result['reviewHash'] != body.review_hash:
        raise HTTPException(409,'명단·매핑·수신거부·연결·잔여 한도가 바뀌었습니다. 다시 사전 검수하세요')
    if not result['eligibleCount']:
        raise HTTPException(409,'저장할 대상이 없습니다')
    ids = []
    for key, definition in definitions.items():
        mapping = definition['mapping']
        records = eligible[key]
        context=conn.execute('SELECT mapping_id,revision FROM recruitment_mappings WHERE mapping_id::text=%s AND workspace_id=%s AND target_brand_id=%s AND product_id=%s',(key.split('_',1)[0],brand,definition['target'],mapping.product_id)).fetchone()
        offer_code='O-'+str(context['mapping_id'])+'-R'+str(context['revision']) if context else ''
        for start in range(0,len(records),200):
            chunk = records[start:start+200]
            batch = conn.execute('INSERT INTO outreach_batches(brand_id,subject,body,created_by,gmail_account_id,target_brand_id,product_id,product_name,mapping_key,campaign_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING batch_id',(brand,mapping.subject,mapping.body,actor,mapping.gmail_account_id,definition['target'],mapping.product_id,definition['product']['name'],key,mapping.campaign_id)).fetchone()
            bid = batch['batch_id']; ids.append(str(bid))
            conn.execute('UPDATE outreach_batches SET offer_code=%s WHERE batch_id=%s',(offer_code or 'B-'+str(bid),bid))
            for record in chunk:
                conn.execute('INSERT INTO outreach_optouts(brand_id,email) VALUES(%s,%s) ON CONFLICT DO NOTHING',(brand,record['email']))
                recipient=conn.execute('INSERT INTO outreach_recipients(batch_id,email,personalized_subject,personalized_body) VALUES(%s,%s,%s,%s) RETURNING recipient_id',(bid,record['email'],record['subject'],record['body'])).fetchone()
                from .routes_recruitment_links import append_link
                personal=append_link(conn,bid,recipient['recipient_id'],record['body'])
                conn.execute('UPDATE outreach_recipients SET personalized_body=%s WHERE recipient_id=%s',(personal,recipient['recipient_id']))
    conn.execute('INSERT INTO outreach_bulk_saves(brand_id,request_id,input_hash,batch_ids) VALUES(%s,%s,%s,%s)',(brand,body.request_id,input_hash,json.dumps(ids)))
    return {'batchIds':ids,'replayed':False,'written':True,'sent':False,'eligibleCount':result['eligibleCount']}


@router.get('/brands/{brand}/outreach/{batch_id}/review')
def review_batch(brand: str, batch_id: UUID, authorization: str = Header(default='')):
    guard(brand,authorization)
    with connect() as conn:
        batch = conn.execute('SELECT * FROM outreach_batches WHERE batch_id=%s AND brand_id=%s',(batch_id,brand)).fetchone()
        if not batch:raise HTTPException(404,'배치 없음')
        result = batch_out(conn,batch)
        result['messages'] = [{'email':r['email'],'subject':r['personalized_subject'] or batch['subject'],'body':r['personalized_body'] or batch['body']} for r in conn.execute('SELECT * FROM outreach_recipients WHERE batch_id=%s ORDER BY email',(batch_id,))]
    return result
