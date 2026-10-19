"""Per-recipient sent evidence and exact-provider-conversation reply browsing."""
from uuid import UUID
from fastapi import APIRouter,Depends,HTTPException,Query
from .auth import require_admin_jwt
from .db import connect
from .routes_recruitment import WORKSPACE,output

router=APIRouter(prefix='/admin/recruitment/mail',dependencies=[Depends(require_admin_jwt)])

def batch(c,bid):
    b=c.execute('SELECT b.*,g.email AS sender_email,br.name AS brand_name FROM outreach_batches b LEFT JOIN gmail_accounts g ON g.account_id=b.gmail_account_id LEFT JOIN brands br ON br.brand_id=COALESCE(b.target_brand_id,b.brand_id) WHERE b.batch_id=%s AND b.brand_id=%s',(bid,WORKSPACE)).fetchone()
    if not b:raise HTTPException(404,'공용 모집 발송 묶음이 아닙니다')
    return b

EVIDENCE=""" FROM outreach_recipients r JOIN outreach_batches b USING(batch_id)
 LEFT JOIN recruitment_contacts p ON p.email=lower(trim(r.email))
 LEFT JOIN LATERAL(SELECT m.* FROM mail_messages m JOIN mail_threads t USING(thread_id)
   WHERE m.gmail_account_id=b.gmail_account_id AND m.gmail_message_id=r.provider_id
    AND m.direction='out' AND m.state='sent' AND t.brand_id=b.brand_id AND lower(trim(t.creator_email))=lower(trim(r.email)) LIMIT 1) sent ON true
 LEFT JOIN LATERAL(SELECT count(*) AS reply_count,max(m.created_at) AS last_reply_at FROM mail_messages m JOIN mail_threads t USING(thread_id)
   WHERE sent.gmail_thread_id IS NOT NULL AND m.gmail_thread_id=sent.gmail_thread_id
    AND m.gmail_account_id=sent.gmail_account_id AND m.direction='in' AND m.state='sent'
    AND m.created_at>=sent.created_at AND t.brand_id=b.brand_id AND lower(trim(t.creator_email))=lower(trim(r.email))) reply ON true
 WHERE b.batch_id=%s AND b.brand_id=%s """

@router.get('/batches/{bid}')
def recipients(bid:UUID,q:str=Query(default='',max_length=120),view:str='all',offset:int=Query(default=0,ge=0,le=100000),limit:int=Query(default=50,ge=1,le=100)):
    views={'all':'true','replied':'reply.reply_count>0','pending':"r.state='pending'",'review':"r.state IN ('review','sending')"}
    if view not in views:raise HTTPException(400,'발송 목록 분류를 확인하세요')
    with connect() as c:
        b=batch(c,bid)
        rows=c.execute("SELECT r.recipient_id,r.email,r.state,r.sent_at,p.contact_id,sent.msg_id AS sent_message_id,COALESCE(sent.subject,r.personalized_subject,b.subject) AS subject,reply.reply_count,reply.last_reply_at"+EVIDENCE+" AND ("+views[view]+") AND (%s='' OR r.email ILIKE %s) ORDER BY r.email,r.recipient_id LIMIT %s OFFSET %s",(bid,WORKSPACE,q,'%'+q+'%',limit+1,offset)).fetchall()
        counts=c.execute("SELECT count(*) AS total,count(*) FILTER(WHERE r.state='sent') AS sent,count(*) FILTER(WHERE reply.reply_count>0) AS replied,count(*) FILTER(WHERE r.state='pending') AS pending,count(*) FILTER(WHERE r.state IN ('review','sending')) AS review,count(*) FILTER(WHERE r.state='blocked') AS blocked"+EVIDENCE,(bid,WORKSPACE)).fetchone()
        return {'batch':{'batch_id':str(bid),'brand_name':b['brand_name'],'target_brand_id':b['target_brand_id'] or b['brand_id'],'product_name':b['product_name'],'sender_email':b['sender_email'],'account_id':str(b['gmail_account_id']) if b['gmail_account_id'] else None,'offer_code':b['offer_code']},'counts':dict(counts),'recipients':[output(r) for r in rows[:limit]],'hasMore':len(rows)>limit,'offset':offset,'limit':limit,'replyAttribution':'same_gmail_conversation_not_proven_offer_causality'}

@router.get('/batches/{bid}/recipients/{rid}')
def recipient(bid:UUID,rid:UUID,before_at:str|None=None,before_id:int|None=None):
    from datetime import datetime
    if (before_at is None)!=(before_id is None):raise HTTPException(400,'회신 페이지 커서를 확인하세요')
    if before_at:
        try:
            at=datetime.fromisoformat(before_at)
            if at.tzinfo is None:raise ValueError()
        except ValueError:raise HTTPException(400,'회신 커서의 시간대를 확인하세요')
    with connect() as c:
        b=batch(c,bid)
        r=c.execute('SELECT * FROM outreach_recipients WHERE recipient_id=%s AND batch_id=%s',(rid,bid)).fetchone()
        if not r:raise HTTPException(404,'이 발송 묶음의 수신자가 아닙니다')
        m=c.execute("SELECT m.* FROM mail_messages m JOIN mail_threads t USING(thread_id) WHERE m.gmail_account_id=%s AND m.gmail_message_id=%s AND m.direction='out' AND m.state='sent' AND t.brand_id=%s AND lower(trim(t.creator_email))=%s",(b['gmail_account_id'],r['provider_id'],WORKSPACE,r['email'].strip().lower())).fetchone() if r['provider_id'] else None
        p=c.execute('SELECT contact_id FROM recruitment_contacts WHERE email=lower(trim(%s))',(r['email'],)).fetchone()
        replies=[]
        if m and m['gmail_thread_id']:
            extra=' AND (m.created_at,m.msg_id)<(%s,%s)' if before_at else ''
            args=[WORKSPACE,r['email'].strip().lower(),m['gmail_account_id'],m['gmail_thread_id'],m['created_at']]+([at,before_id] if before_at else [])
            replies=c.execute("SELECT m.msg_id,m.subject,m.body,m.from_email,m.to_email,m.created_at,m.gmail_account_id FROM mail_messages m JOIN mail_threads t USING(thread_id) WHERE t.brand_id=%s AND lower(trim(t.creator_email))=%s AND m.gmail_account_id=%s AND m.gmail_thread_id=%s AND m.direction='in' AND m.state='sent' AND m.created_at>=%s"+extra+' ORDER BY m.created_at DESC,m.msg_id DESC LIMIT 51',args).fetchall()
        more=len(replies)>50;replies=replies[:50];last=replies[-1] if replies else None
        return {'recipient':{'recipient_id':str(rid),'email':r['email'],'state':r['state'],'sent_at':r['sent_at'].isoformat() if r['sent_at'] else None,'contact_id':str(p['contact_id']) if p else None},'accountId':str(b['gmail_account_id']) if b['gmail_account_id'] else None,'senderEmail':b['sender_email'],'original':{'recorded':bool(m),'subject':m['subject'] if m else r['personalized_subject'] or b['subject'],'body':m['body'] if m else r['personalized_body'] or b['body'],'messageId':m['msg_id'] if m else None},'replies':[output(x) for x in replies],'hasMore':more,'next':{'before_at':last['created_at'].isoformat(),'before_id':last['msg_id']} if more else None,'replyAttribution':'same_gmail_conversation_not_proven_offer_causality'}
