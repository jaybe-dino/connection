"""Explicit single-message company tests. Same Gmail safety; no recruitment/billing."""
import hashlib
import json
import os
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from .auth import require_admin_jwt
from .db import connect, ledger_append
from .routes_recruitment import WORKSPACE, output
from .routes_outreach_bulk import render_text
from . import routes_gmail as gmail

router=APIRouter(prefix='/admin/recruitment/test-mail',dependencies=[Depends(require_admin_jwt)])

class Preview(BaseModel):
    mapping_id: UUID
    account_id: UUID
    recipient: str=Field(min_length=3,max_length=254)
    name: str=Field(default='테스트 크리에이터',max_length=100)
    reason: str=Field(default='제품과 신청 링크를 확인하는 내부 테스트입니다.',max_length=1000)

class Send(Preview):
    request_id: UUID
    review_hash: str=Field(pattern=r'^[a-f0-9]{64}$')
    confirmed: bool=False


def prepare(c,b):
    email=b.recipient.strip().lower()
    allowed={'chief@dinostudio.kr'}
    allowed.update(r['email'].lower() for r in c.execute("SELECT email FROM gmail_accounts WHERE brand_id=%s AND state='connected'",(WORKSPACE,)))
    if email not in allowed:raise HTTPException(400,'테스트 수신자는 chief@dinostudio.kr 또는 공용 모집에 연결된 회사 메일을 선택하세요')
    m=c.execute("SELECT m.*,p.name AS product_name,p.state AS product_state,b.name AS brand_name,b.suspended_at FROM recruitment_mappings m JOIN brand_products p ON p.product_id=m.product_id AND p.brand_id=m.target_brand_id JOIN brands b ON b.brand_id=m.target_brand_id WHERE m.mapping_id=%s",(b.mapping_id,)).fetchone()
    if not m or m['state'] not in ('draft','active') or m['product_state']!='active' or m['suspended_at']:raise HTTPException(409,'사용 가능한 브랜드·제품 제안을 선택하세요')
    a=c.execute("SELECT * FROM gmail_accounts WHERE account_id=%s AND brand_id=%s AND state='connected' FOR UPDATE",(b.account_id,WORKSPACE)).fetchone()
    if not a:raise HTTPException(409,'연결된 회사 발신 계정을 선택하세요')
    from .mail_safety import blocked
    if blocked(c,email) or c.execute('SELECT 1 FROM outreach_optouts WHERE lower(email)=%s AND brand_id=ANY(%s) AND opted_out_at IS NOT NULL',(email,[WORKSPACE,m['target_brand_id']])).fetchone():raise HTTPException(409,'수신거부·반송·연락 중지 주소입니다')
    quota=gmail._acct_out(gmail._with_delivery_usage(c,a))
    reserved=c.execute("SELECT count(*) n FROM outreach_recipients r JOIN outreach_batches b USING(batch_id) WHERE b.gmail_account_id=%s AND b.state IN ('draft','approved') AND r.state IN ('pending','sending')",(b.account_id,)).fetchone()['n']
    if quota['sendingPaused'] or quota['remainingToday']<=reserved:raise HTTPException(409,'발신 계정이 중지되었거나 초안 예약분을 제외한 잔여량이 없습니다')
    values={'name':b.name.strip(),'reason':b.reason.strip(),'brand':m['brand_name'],'product':m['product_name']}
    subject='[TEST] '+render_text(m['subject'],values).strip()
    body=render_text(m['body'],values).strip()
    from .routes_recruitment_links import validate_ctas, validate_campaign
    validate_ctas(body,m['target_brand_id']);validate_campaign(c,m['target_brand_id'],m['campaign_id'],m['product_id'])
    if not m['subject'].strip() or not body or len(subject)>160 or any(x in subject for x in '\r\n'):raise HTTPException(400,'메일 제목·본문을 확인하세요')
    from urllib.parse import urlencode
    url=os.environ.get('CREATOR_APP_URL','https://app.theprlist.net').rstrip('/')+'/?'+urlencode({'brand':m['target_brand_id'],'product':str(m['product_id']),**({'campaign':m['campaign_id']} if m['campaign_id'] else {})})
    body+='\n\n▶ 브랜드 신청 페이지: '+url+'\n\n[내부 테스트] 실제 모집 대상이 아닙니다. 이 메일에는 수신자별 신청 추적 토큰이 없으며 발송·신청 실적에 포함하지 않습니다.'
    result={'fromEmail':a['email'],'to':email,'subject':subject,'body':body,'brandId':m['target_brand_id'],'productId':str(m['product_id']),'campaignId':m['campaign_id'],'communityUrl':url,'mappingRevision':m['revision'],'sent':False}
    result['reviewHash']=hashlib.sha256(json.dumps(result,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    return result


@router.post('/preview')
def preview(b:Preview):
    with connect() as c:return prepare(c,b)


@router.get('/history')
def history():
    with connect() as c:
        rows=c.execute('SELECT t.request_id,t.recipient,t.subject,t.state,t.provider_id,t.created_at,a.email AS sender_email FROM recruitment_test_mail t JOIN gmail_accounts a USING(account_id) ORDER BY t.created_at DESC LIMIT 50').fetchall()
        return {'tests':[output(r) for r in rows]}


@router.post('/send')
def send(b:Send,actor:dict=Depends(require_admin_jwt)):
    if not b.confirmed:raise HTTPException(400,'테스트 수신자·문안 확인이 필요합니다')
    payload=b.model_dump(mode='json');payload.pop('request_id')
    digest=hashlib.sha256(json.dumps(payload,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    # Durable claim precedes provider request. Unknown outcome must never resend.
    with connect() as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtextextended('recruitment:test:'||%s,0))",(str(b.request_id),))
        old=c.execute('SELECT * FROM recruitment_test_mail WHERE request_id=%s',(b.request_id,)).fetchone()
        if old:
            if old['input_hash']!=digest:raise HTTPException(409,'같은 테스트 ID의 내용이 다릅니다')
            return {'state':old['state'],'requestId':str(b.request_id),'providerId':old['provider_id'],'replayed':True,'sent':old['state']=='accepted'}
        if os.environ.get('GMAIL_OPS_ENABLED')!='1':raise HTTPException(409,'Gmail 운영 기능이 꺼져 있습니다')
        p=prepare(c,b)
        if p['reviewHash']!=b.review_hash:raise HTTPException(409,'제안이 변경됐습니다. 다시 미리보기하세요')
        c.execute("INSERT INTO recruitment_test_mail(request_id,input_hash,mapping_id,account_id,recipient,subject,body,state,created_by) VALUES(%s,%s,%s,%s,%s,%s,%s,'sending',%s)",(b.request_id,digest,b.mapping_id,b.account_id,p['to'],p['subject'],p['body'],str(actor['sub'])))
    state='review';provider=None
    try:
        with connect() as c:
            c.execute("SELECT pg_advisory_xact_lock(hashtextextended('recruitment:'||%s,0))",(WORKSPACE,))
            # Recheck suspension, opt-outs and queue reservations at actual send.
            current=prepare(c,b)
            if current['reviewHash']!=b.review_hash:raise HTTPException(409,'제안 변경')
            result=gmail.send_via_brand_gmail(c,WORKSPACE,p['to'],p['subject'],p['body'],account_id=b.account_id)
            state='not_sent' if not result else 'accepted' if result.get('via')=='gmail' and result.get('messageId') else 'demo'
            provider=(result or {}).get('messageId')
            c.execute('UPDATE recruitment_test_mail SET state=%s,provider_id=%s,updated_at=now() WHERE request_id=%s',(state,provider,b.request_id))
            ledger_append(c,str(actor['sub']),'RECRUITMENT_TEST_MAIL',str(b.request_id),{'state':state,'accountId':str(b.account_id),'recruitmentRecipients':0})
    except Exception:
        # Even HTTP/network failures may follow provider acceptance. Do not retry.
        with connect() as c:
            c.execute("UPDATE recruitment_test_mail SET state='review',updated_at=now() WHERE request_id=%s",(b.request_id,))
            c.execute("UPDATE gmail_accounts SET sending_paused=true,pause_reason='테스트 발송 결과 불명 · 보낸편지함 확인 필요' WHERE account_id=%s",(b.account_id,))
        return {'state':'review','requestId':str(b.request_id),'sent':False,'needsReconciliation':True}
    return {'state':state,'providerId':provider,'requestId':str(b.request_id),'sent':state=='accepted'}
