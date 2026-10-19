"""Opaque recipient invitation context: no mail, no implicit enrollment on GET/login."""
import hashlib
import json
import os
import re
import secrets
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Header, HTTPException, Response
from .outreach_locale import proposal_locale
from . import auth
from .db import connect, ledger_append

router = APIRouter(prefix='/recruitment-links')


def validate_campaign(conn, target, campaign_id, product_id=None):
    if not campaign_id:
        return
    r = conn.execute('SELECT brand_id,status,deadline,product_id FROM campaigns WHERE campaign_id=%s FOR SHARE', (campaign_id,)).fetchone()
    if not r or r['brand_id'] != target:
        raise HTTPException(409, '제안 브랜드에 속한 캠페인을 선택하세요')
    if not product_id:
        raise HTTPException(409,'캠페인 신청 제안에는 연결 제품이 필요합니다')
    if product_id and (not r['product_id'] or str(r['product_id'])!=str(product_id)):
        raise HTTPException(409,'캠페인에 연결된 제품과 제안 제품이 다릅니다. 제품 연결을 먼저 확인하세요')
    if r['status'] != 'open' or (r['deadline'] and r['deadline'] < datetime.now(ZoneInfo('Asia/Seoul')).date()):
        raise HTTPException(409, '모집이 종료된 캠페인입니다')


def validate_ctas(text, target):
    from urllib.parse import urlsplit,parse_qs
    base=urlsplit(os.environ.get('CREATOR_APP_URL','https://app.theprlist.net'))
    for url in re.findall(r'https?://[^\s<>"\']+',text):
        parsed=urlsplit(url);query=parse_qs(parsed.query)
        if parsed.netloc==base.netloc and (('brand' in query and query['brand']!=[target]) or 'application' in query):
            raise HTTPException(409,'본문에 다른 브랜드 또는 이미 발급된 신청 링크가 있습니다. 자동 생성 링크를 사용하세요')


def append_link(conn, batch_id, recipient_id, text):
    token = secrets.token_urlsafe(32)
    conn.execute('INSERT INTO recruitment_application_links(token_hash,recipient_id) VALUES(%s,%s)',
                 (hashlib.sha256(token.encode()).hexdigest(),recipient_id))
    b = conn.execute('SELECT COALESCE(target_brand_id,brand_id) AS target,body,proposal_locale FROM outreach_batches WHERE batch_id=%s',(batch_id,)).fetchone()
    base = os.environ.get('CREATOR_APP_URL','https://app.theprlist.net').rstrip('/')
    legacy = base+'/?brand='+b['target']
    # Replace the canonical CTA rather than adding a second conflicting join action.
    from .outreach_locale import proposal_locale
    locale=b['proposal_locale'] or proposal_locale(b['body'])
    text=text.replace(legacy, legacy+'&lang='+locale+'&application='+token)
    if len(text)>10000:raise HTTPException(400,'신청 링크를 포함한 본문이 너무 깁니다')
    return text


def resolve(conn, token, lock=False):
    if not re.fullmatch(r'[A-Za-z0-9_-]{40,60}',token):
        raise HTTPException(404,'모집 링크를 찾을 수 없습니다')
    r = conn.execute('''SELECT l.link_id,l.expires_at,r.email,r.state AS recipient_state,
        b.batch_id,b.brand_id AS workspace_id,COALESCE(b.target_brand_id,b.brand_id) AS target,
        b.product_id,b.product_name,b.campaign_id,b.mapping_key,b.state AS batch_state,b.proposal_locale,b.body AS proposal_body,
        br.name AS brand_name,br.is_internal,br.is_demo,br.suspended_at,p.state AS product_state,c.name AS campaign_name
        FROM recruitment_application_links l JOIN outreach_recipients r USING(recipient_id)
        JOIN outreach_batches b USING(batch_id) JOIN brands br ON br.brand_id=COALESCE(b.target_brand_id,b.brand_id)
        LEFT JOIN brand_products p USING(product_id) LEFT JOIN campaigns c ON c.campaign_id=b.campaign_id
        WHERE l.token_hash=%s'''+(' FOR UPDATE OF l,b,r' if lock else ''),
        (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
    if not r:raise HTTPException(404,'모집 링크를 찾을 수 없습니다')
    if r['expires_at'] < datetime.now(r['expires_at'].tzinfo) or r['batch_state']=='cancelled' or r['recipient_state']=='blocked':
        raise HTTPException(410,'만료되었거나 중지된 모집 링크입니다')
    if r['is_internal'] or r['is_demo']:
        raise HTTPException(409,'고객 브랜드 신청 링크가 아닙니다')
    if r['suspended_at']:
        raise HTTPException(410,'모집이 중지된 브랜드입니다')
    if r['product_id'] and r['product_state']!='active':
        raise HTTPException(409,'제품 모집이 중지되었습니다')
    validate_campaign(conn,r['target'],r['campaign_id'],r['product_id'])
    if conn.execute('SELECT 1 FROM outreach_optouts WHERE brand_id=ANY(%s) AND email=%s AND opted_out_at IS NOT NULL',([r['workspace_id'],r['target']],r['email'])).fetchone():
        raise HTTPException(410,'수신거부한 모집 링크입니다')
    return r


def record_event(conn, link_id, kind, detail=None):
    """전환 이벤트 — append-only, (link,kind) 유니크로 멱등 (OUTREACH_CONTRACT §3)."""
    conn.execute(
        'INSERT INTO recruitment_link_events(link_id,kind,detail)'
        ' VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',
        (link_id, kind, json.dumps(detail or {})))


def public_context(r):
    return {'brandId':r['target'],'brandName':r['brand_name'],
            'productId':str(r['product_id']) if r['product_id'] else None,'productName':r['product_name'],
            'campaignId':r['campaign_id'],'campaignName':r['campaign_name'],
            'locale':r.get('proposal_locale') or proposal_locale(r.get('proposal_body','')),
            'communityUrl':'https://app.theprlist.net/?brand='+r['target']}


@router.get('/{token}')
def context(token: str,response:Response):
    response.headers['Cache-Control']='no-store'
    response.headers['Referrer-Policy']='no-referrer'
    try:
        with connect() as c:
            r=resolve(c,token)
            record_event(c,r['link_id'],'click')
            result=public_context(r)
            if r['product_id']:
                from .invitation_product import public_product
                result['product']=public_product(c,r['target'],r['product_id'])
            return result
    except HTTPException as e:
        # 만료/취소/수신거부는 blocked로 기록(계약 §3) — 거부 트랜잭션과 분리 커밋.
        if e.status_code==410:
            with connect() as c:
                row=c.execute('SELECT link_id FROM recruitment_application_links WHERE token_hash=%s',
                              (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
                if row:record_event(c,row['link_id'],'blocked',{'status':e.status_code})
        raise


@router.post('/{token}/apply')
def apply(token: str, authorization: str=Header(default='')):
    from .routes_identity import _require_creator, _ensure_creator_row
    claims=_require_creator(authorization)
    with connect() as c:
        r=resolve(c,token,lock=True)
        if r['batch_state']!='approved':raise HTTPException(409,'아직 승인되지 않은 모집 제안입니다')
        user=c.execute("SELECT email FROM users WHERE user_id=%s AND kind='creator' AND state='active'",(claims['sub'],)).fetchone()
        if not user or user['email'].strip().lower()!=r['email'].strip().lower():
            raise HTTPException(403,'이 제안을 받은 이메일 계정으로 로그인하세요')
        cid=_ensure_creator_row(c,claims)
        prior=c.execute('SELECT application_id FROM recruitment_applications WHERE link_id=%s AND creator_id=%s',(r['link_id'],cid)).fetchone()
        if prior:return {**public_context(r),'applicationId':str(prior['application_id']),'alreadyApplied':True,'status':'applied'}
        # 초대 신청도 입장 경로 — 신규 크리에이터는 온보딩 완료가 선행된다.
        from .routes_service import require_onboarded
        require_onboarded(c,cid,'모집 신청')
        # Same existing membership + verification billing triggers; no membership for workspace.
        member=c.execute('INSERT INTO memberships(creator_id,brand_id) VALUES(%s,%s) ON CONFLICT DO NOTHING RETURNING creator_id',(cid,r['target'])).fetchone()
        if member:
            ledger_append(c,'creator:'+cid,'MEMBERSHIP_JOINED',r['target'],{'source':'recruitment_link'})
            record_event(c,r['link_id'],'join',{'creatorId':cid})
        if r['campaign_id']:
            c.execute('INSERT INTO campaign_applications(campaign_id,creator_id) VALUES(%s,%s) ON CONFLICT DO NOTHING',(r['campaign_id'],cid))
        a=c.execute('INSERT INTO recruitment_applications(link_id,creator_id,brand_id,product_id,campaign_id) VALUES(%s,%s,%s,%s,%s) RETURNING application_id',(r['link_id'],cid,r['target'],r['product_id'],r['campaign_id'])).fetchone()
        record_event(c,r['link_id'],'apply',{'creatorId':cid,'applicationId':str(a['application_id'])})
        ledger_append(c,'creator:'+cid,'RECRUITMENT_APPLIED',str(a['application_id']),{'brandId':r['target'],'batchId':str(r['batch_id']),'campaignId':r['campaign_id']})
        return {**public_context(r),'applicationId':str(a['application_id']),'alreadyApplied':False,'status':'applied'}

@router.get('/brands/{brand}/applications')
def applications(brand: str, authorization: str=Header(default='')):
    auth.require_brand(brand,authorization,'')
    with connect() as c:
        rows=c.execute("""SELECT a.application_id,a.creator_id,a.product_id,a.campaign_id,a.status,a.applied_at,
            b.batch_id,b.brand_id AS workspace_id,b.mapping_key,b.gmail_account_id
            FROM recruitment_applications a JOIN recruitment_application_links l USING(link_id)
            JOIN outreach_recipients r USING(recipient_id) JOIN outreach_batches b USING(batch_id)
            WHERE a.brand_id=%s ORDER BY a.applied_at DESC LIMIT 200""",(brand,)).fetchall()
    return {'brandId':brand,'applications':[{k:(v.isoformat() if hasattr(v,'isoformat') else str(v) if v is not None else None) for k,v in r.items()} for r in rows]}
