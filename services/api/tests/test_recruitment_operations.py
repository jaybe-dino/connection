"""Owner / operator / creator / customer / deliverability / finance acceptance.

Synthetic local DB only. Provider calls must never be made by these workflows.
"""
import base64
import json
from datetime import datetime, timedelta, UTC
from uuid import uuid4
import pytest
from api import auth, mail_safety
from api.db import connect


@pytest.fixture
def ops(client):
    h={'Authorization':'Bearer '+auth.issue_jwt({'sub':'ops-admin','kind':'admin'})}
    assert client.post('/admin/recruitment/workspace',headers=h).status_code==200
    suffix=uuid4().hex[:10];brand='ops-'+suffix
    with connect() as c:
        c.execute('INSERT INTO brands(brand_id,name) VALUES(%s,%s)',(brand,'Operations '+suffix))
        p=str(c.execute('INSERT INTO brand_products(brand_id,name) VALUES(%s,%s) RETURNING product_id',(brand,'Skincare serum')).fetchone()['product_id'])
        aid=str(c.execute('INSERT INTO gmail_accounts(brand_id,email) VALUES(%s,%s) RETURNING account_id',('dino-recruitment','ops-'+suffix+'@qa.example')).fetchone()['account_id'])
    r=client.post('/admin/recruitment/mappings',headers=h,json={'name':'Synthetic '+suffix,'target_brand_id':brand,'product_id':p,'gmail_account_id':aid,'state':'active','subject':'{{brand}} {{name}}','body':'{{reason}}'} )
    assert r.status_code==200,r.text
    yield h,brand,p,aid,r.json()['mapping_id'],suffix
    with connect() as c:
        c.execute("UPDATE creator_pool SET state='EXCLUDED' WHERE handle LIKE %s",('candidate-'+suffix+'%',))


def pool(suffix,email,*,country='US',status='valid',identity=None,category=None,followers=20000):
    with connect() as c:
        return str(c.execute("""INSERT INTO creator_pool(platform,platform_uid,handle,email,email_status,country,lang,category,followers,identity_group)
          VALUES('tiktok',%s,%s,%s,%s,%s,ARRAY['en'],%s,%s,%s) RETURNING creator_id""",(str(uuid4()),'candidate-'+suffix,email,status,country,category or ['skincare'],followers,identity)).fetchone()['creator_id'])


def sent(ops,email,*,brand=None,at=None):
    h,own,product,aid,mapping,suffix=ops
    at=at or datetime.now(UTC)
    with connect() as c:
        batch=str(c.execute("INSERT INTO outreach_batches(brand_id,target_brand_id,subject,body,created_by,gmail_account_id,state) VALUES('dino-recruitment',%s,'QA','Synthetic','qa',%s,'approved') RETURNING batch_id",(brand or own,aid)).fetchone()['batch_id'])
        provider='msg-'+uuid4().hex
        r=str(c.execute("INSERT INTO outreach_recipients(batch_id,email,state,sent_at,provider_id) VALUES(%s,%s,'sent',%s,%s) RETURNING recipient_id",(batch,email,at,provider)).fetchone()['recipient_id'])
        thread=str(c.execute("INSERT INTO mail_threads(brand_id,creator_email,subject) VALUES('dino-recruitment',%s,'QA') ON CONFLICT(brand_id,creator_email) DO UPDATE SET subject='QA' RETURNING thread_id",(email,)).fetchone()['thread_id'])
        tid='thread-'+uuid4().hex
        c.execute("INSERT INTO mail_messages(thread_id,direction,from_email,to_email,body,state,gmail_account_id,gmail_message_id,gmail_thread_id,created_at) VALUES(%s,'out','sender@qa.example',%s,'QA','sent',%s,%s,%s,%s)",(thread,email,aid,provider,tid,at))
        c.execute('INSERT INTO gmail_delivery_events(account_id,provider_message_id,accepted_at) VALUES(%s,%s,%s)',(aid,provider,at))
    return r,thread,tid,batch


def test_customer_creator_and_pending_admin_cannot_access_operations(client,ops):
    h,b,p,a,m,s=ops
    for claims in ({'sub':'brand','kind':'brand','brand_id':b},{'sub':'creator','kind':'creator'},{'sub':'admin','kind':'admin','otp':'pending'}):
        no={'Authorization':'Bearer '+auth.issue_jwt(claims)}
        for path in ('/admin/recruitment/inbox','/admin/recruitment/safety','/admin/recruitment/metrics?start=2026-01-01&end=2026-02-01'):
            assert client.get(path,headers=no).status_code in (401,403)
        assert client.post(f'/admin/recruitment/mappings/{m}/cohort',headers=no,json={}).status_code in (401,403)


def test_owner_cohort_filters_identity_dedup_and_no_writes(client,ops):
    h,b,p,a,m,s=ops;group=uuid4();email='cohort-'+s+'@qa.example'
    first=pool(s,email,identity=group)
    pool(s+'2','alt-'+email,identity=group)
    pool(s+'3','wrong-'+email,country='TH')
    pool(s+'4','unverified-'+email,status='none')
    with connect() as c:before=c.execute('SELECT count(*) n FROM outreach_batches').fetchone()['n']
    body={'countries':['us'],'languages':['en'],'categories':['skincare'],'min_followers':10000,'max_followers':30000,'limit':100}
    r=client.post(f'/admin/recruitment/mappings/{m}/cohort',headers=h,json=body)
    assert r.status_code==200,r.text
    d=r.json();ours=[x for x in d['candidates'] if s in x['email']]
    assert len(ours)==1 and ours[0]['emailStatus']=='valid' and ours[0]['matchedTerms']>0
    assert d['written'] is False and d['identityCountVerified'] is False and d['sent'] is False
    assert d['offerCode'].endswith(m+'-R1')
    with connect() as c:assert c.execute('SELECT count(*) n FROM outreach_batches').fetchone()['n']==before
    body['allow_unverified']=True
    d=client.post(f'/admin/recruitment/mappings/{m}/cohort',headers=h,json=body).json()
    assert any(x['email']=='unverified-'+email and x['emailStatus']=='none' for x in d['candidates'])
    assert client.post(f'/admin/recruitment/mappings/{m}/cohort',headers=h,json={'countries':['USA']}).status_code==400
    assert client.post(f'/admin/recruitment/mappings/{m}/cohort',headers=h,json={'min_followers':100,'max_followers':50}).status_code==400


def test_operator_relationship_cohort_keeps_original_sender_and_suppression(client,ops):
    h,b,p,a,m,s=ops;email='relationship-'+s+'@qa.example'
    pool(s,email);sent(ops,email)
    path=f'/admin/recruitment/mappings/{m}/cohort'
    assert email not in [r['email'] for r in client.post(path,headers=h,json={}).json()['candidates']]
    d=client.post(path,headers=h,json={'audience':'relationships'}).json()
    assert any(r['email']==email for r in d['candidates'])
    with connect() as c:mail_safety.add_block(c,email,'manual_stop','Synthetic optout evidence','qa')
    assert not any(r['email']==email for r in client.post(path,headers=h,json={'audience':'relationships'}).json()['candidates'])


def test_operator_reply_review_concurrency_drafts_and_explicit_block(client,ops,monkeypatch):
    h,b,p,a,m,s=ops;email='reply-'+s+'@qa.example';r,thread,tid,_=sent(ops,email)
    with connect() as c:
        c.execute("INSERT INTO mail_messages(thread_id,direction,from_email,to_email,body,state,gmail_account_id,gmail_thread_id) VALUES(%s,'in',%s,'sender@qa.example',%s,'sent',%s,%s)",(thread,email,'Interested!\n\nOn Tuesday wrote:\n> unsubscribe',a,tid))
    data=client.get('/admin/recruitment/inbox',headers=h).json()['threads']
    item=next(x for x in data if x['thread_id']==thread)
    assert item['suggested_label']=='interested' and item['label']=='unreviewed'
    task={'label':'interested','owner_name':'QA reviewer','next_action':'Review conditions','revision':0}
    assert client.put('/admin/recruitment/inbox/'+thread,headers=h,json=task).status_code==200
    assert client.put('/admin/recruitment/inbox/'+thread,headers=h,json=task).status_code==409
    d=client.post('/inbox/threads/'+thread+'/reply',headers=h,json={'body':'Synthetic draft only'}).json()
    assert d['state']=='pending_gate'
    with connect() as c:assert str(c.execute('SELECT gmail_account_id FROM mail_messages WHERE msg_id=%s',(d['msgId'],)).fetchone()['gmail_account_id'])==a
    # A human-confirmed global stop needs actual evidence, with atomic rollback.
    task.update(label='optout',revision=1,note='')
    assert client.put('/admin/recruitment/inbox/'+thread,headers=h,json=task).status_code==400
    task['note']='Creator explicitly requested no further messages.'
    assert client.put('/admin/recruitment/inbox/'+thread,headers=h,json=task).status_code==200
    with connect() as c:assert mail_safety.blocked(c,email)
    from api.routes_recruitment_ops import suggest_label
    assert suggest_label('My rate card for paid collaboration is attached.')=='paid_only'
    assert suggest_label('Not interested')=='declined'
    assert suggest_label('Please tell me more\n> unsubscribe')=='other'


def test_deliverability_feedback_blocks_all_senders_and_complaint_pauses(client,ops,monkeypatch):
    h,b,p,a,m,s=ops;email='bounce-'+s+'@qa.example';r,_,_,_=sent(ops,email)
    payload={'recipient_id':r,'kind':'complaint','source_key':'synthetic-complaint','evidence':'Synthetic provider complaint event for this exact message.'}
    d=client.post('/admin/recruitment/feedback',headers=h,json=payload)
    assert d.status_code==200,d.text
    assert d.json()['accountPaused'] and d.json()['contactBlocked']
    assert client.post('/admin/recruitment/feedback',headers=h,json=payload).status_code==200
    with connect() as c:
        assert c.execute('SELECT count(*) n FROM mail_delivery_feedback WHERE recipient_id=%s',(r,)).fetchone()['n']==1
        assert mail_safety.blocked(c,email)
        assert c.execute('SELECT sending_paused FROM gmail_accounts WHERE account_id=%s',(a,)).fetchone()['sending_paused']
    from api import routes_gmail as gmail
    called=[];monkeypatch.setattr('httpx.post',lambda *a,**k:called.append(a))
    with connect() as c:
        with pytest.raises(Exception):gmail.send_via_brand_gmail(c,'dino-recruitment',email,'QA','Synthetic',account_id=a)
    assert called==[]


def test_delivery_dsn_needs_structured_permanent_failure_exact_thread(client,ops):
    h,b,p,a,m,s=ops;email='dsn-'+s+'@qa.example';r,_,tid,_=sent(ops,email)
    raw=f'Final-Recipient: rfc822; {email}\r\nAction: failed\r\nStatus: 5.1.1\r\n'
    status={'mimeType':'message/delivery-status','body':{'data':base64.urlsafe_b64encode(raw.encode()).decode().rstrip('=')}}
    msg={'id':'dsn-'+s,'threadId':'wrong-thread','payload':{'mimeType':'multipart/report','parts':[status]}}
    with connect() as c:
        assert mail_safety.verified_dsn(c,{'account_id':a},msg,'') is False
        assert not mail_safety.blocked(c,email)
        msg['threadId']=tid
        assert mail_safety.verified_dsn(c,{'account_id':a},msg,'') is True
        assert mail_safety.blocked(c,email)
        fake={'id':'text-'+s,'threadId':tid,'payload':{'mimeType':'text/plain','body':{'data':status['body']['data']}}}
        assert mail_safety.verified_dsn(c,{'account_id':a},fake,raw) is False


def test_finance_global_unique_people_differs_from_brand_sum_and_unknown_is_null(client,ops):
    h,b,p,a,m,s=ops;other='ops-second-'+s;creator='ops-person-'+s
    with connect() as c:
        c.execute('INSERT INTO brands(brand_id,name) VALUES(%s,%s)',(other,'Other '+s))
        c.execute("INSERT INTO creators(creator_id,handle,platform) VALUES(%s,'qa','tiktok')",(creator,))
    for i,target in enumerate((b,other)):
        r,_,_,_=sent(ops,'metrics-'+str(i)+s+'@qa.example',brand=target)
        with connect() as c:
            link=c.execute("INSERT INTO recruitment_application_links(token_hash,recipient_id) VALUES(%s,%s) RETURNING link_id",(uuid4().hex,r)).fetchone()['link_id']
            c.execute('INSERT INTO recruitment_applications(link_id,creator_id,brand_id) VALUES(%s,%s,%s)',(link,creator,target))
    start=(datetime.now(UTC)-timedelta(days=1)).date().isoformat();end=(datetime.now(UTC)+timedelta(days=2)).date().isoformat()
    url=f'/admin/recruitment/metrics?start={start}&end={end}'
    d=client.get(url,headers=h)
    assert d.status_code==200,d.text
    d=d.json();selected=[x for x in d['byBrand'] if x['brandId'] in (b,other)]
    assert sum(x['uniqueApplicants'] for x in selected)==2
    assert d['total']['uniqueApplicants']>=1
    for row in selected:
        assert row['deliveryConfirmedCreators'] is None and row['orders'] is None and row['postedCreators'] is None
        assert row['recordedCostKRW'] is None
    cost={'brand_id':b,'period_start':start,'period_end':end,'category':'shipping','amount_krw':'10000','evidence':'Synthetic shipping invoice for QA only.','request_id':str(uuid4())}
    assert client.post('/admin/recruitment/costs',headers=h,json=cost).json()['created']
    assert client.post('/admin/recruitment/costs',headers=h,json=cost).json()['created'] is False
    cost['amount_krw']='20000'
    assert client.post('/admin/recruitment/costs',headers=h,json=cost).status_code==409
    row=client.get(url+'&brand='+b,headers=h).json()['total']
    assert row['uniqueApplicants']==1 and row['recordedCostKRW']==10000 and row['costPerApplicantKRW']==10000
    assert client.get('/admin/recruitment/metrics?start=2026-01-01&end=2028-01-01',headers=h).status_code==400


def test_unstarted_feedback_and_foreign_brand_thread_cannot_be_used(client,ops):
    h,b,p,a,m,s=ops
    with connect() as c:
        t=str(c.execute("INSERT INTO mail_threads(brand_id,creator_email) VALUES(%s,%s) RETURNING thread_id",(b,'private-'+s+'@qa.example')).fetchone()['thread_id'])
    assert client.put('/admin/recruitment/inbox/'+t,headers=h,json={'label':'other','revision':0}).status_code==404
    assert client.post('/admin/recruitment/feedback',headers=h,json={'recipient_id':str(uuid4()),'kind':'hard_bounce','source_key':'unknown','evidence':'No actual sending record exists.'}).status_code==404


def test_operator_system_mail_without_sent_conversation_is_not_a_creator_reply(client,ops):
    h,b,p,a,m,s=ops;email='security-notice-'+s+'@qa.example'
    with connect() as c:
        thread=c.execute("INSERT INTO mail_threads(brand_id,creator_email) VALUES('dino-recruitment',%s) RETURNING thread_id",(email,)).fetchone()['thread_id']
        c.execute("INSERT INTO mail_messages(thread_id,direction,from_email,body,state,gmail_account_id) VALUES(%s,'in',%s,'New sign-in security notice','sent',%s)",(thread,email,a))
    result=client.get('/admin/recruitment/inbox',headers=h).json()
    assert str(thread) not in {t['thread_id'] for t in result['threads']}
    assert result['unlinkedInboundThreads']>=1


def test_finance_reply_is_attributed_once_to_latest_exact_thread_offer(client,ops):
    h,b,p,a,m,s=ops;other='ops-latest-'+s;email='same-thread-'+s+'@qa.example'
    with connect() as c:c.execute('INSERT INTO brands(brand_id,name) VALUES(%s,%s)',(other,'Latest '+s))
    _,thread,tid,_=sent(ops,email,at=datetime.now(UTC)-timedelta(minutes=10))
    _,_,tid2,_=sent(ops,email,brand=other,at=datetime.now(UTC)-timedelta(minutes=2))
    with connect() as c:
        c.execute('UPDATE mail_messages SET gmail_thread_id=%s WHERE gmail_thread_id=%s',(tid,tid2))
        c.execute("INSERT INTO mail_messages(thread_id,direction,from_email,to_email,body,state,gmail_account_id,gmail_thread_id) VALUES(%s,'in',%s,'sender@qa.example','QA reply','sent',%s,%s)",(thread,email,a,tid))
    start=(datetime.now(UTC)-timedelta(days=1)).date();end=(datetime.now(UTC)+timedelta(days=2)).date()
    path=f'/admin/recruitment/metrics?start={start}&end={end}'
    for brand,expected in ((b,0),(other,1)):
        r=client.get(path+'&brand='+brand,headers=h)
        assert r.status_code==200,r.text
        assert r.json()['total']['replyMessages']==expected


def test_deliverability_bounce_rate_needs_real_denominator_and_never_auto_resumes(client,ops):
    h,b,p,a,m,s=ops
    recipients=[sent(ops,f'rate-{i}-{s}@qa.example')[0] for i in range(20)]
    for i,rid in enumerate(recipients[:3]):
        r=client.post('/admin/recruitment/feedback',headers=h,json={'recipient_id':rid,'kind':'hard_bounce','source_key':f'qa-rate-{i}','evidence':'Synthetic DSN evidence, exact test message.'})
        assert r.status_code==200,r.text
        assert r.json()['accountPaused'] is (i==2)
    client.post('/admin/recruitment/feedback',headers=h,json={'recipient_id':recipients[-1],'kind':'delivered','source_key':'qa-delivered','evidence':'Synthetic positive delivery evidence.'})
    with connect() as c:assert c.execute('SELECT sending_paused FROM gmail_accounts WHERE account_id=%s',(a,)).fetchone()['sending_paused']


def test_creator_conversation_stays_on_outgoing_sender_after_reply_to_other_mailbox(client,ops,monkeypatch):
    h,b,p,a,m,s=ops;email='pin-'+s+'@qa.example';_,thread,_,_=sent(ops,email)
    with connect() as c:
        other=str(c.execute("INSERT INTO gmail_accounts(brand_id,email) VALUES('dino-recruitment',%s) RETURNING account_id",('other-'+s+'@qa.example',)).fetchone()['account_id'])
        c.execute("INSERT INTO mail_messages(thread_id,direction,from_email,to_email,body,state,gmail_account_id) VALUES(%s,'in',%s,'other@qa.example','Forwarded conversation','sent',%s)",(thread,email,other))
    r=client.post('/inbox/threads/'+thread+'/reply',headers=h,json={'body':'Synthetic draft must use original sender.'})
    assert r.status_code==200,r.text
    msg=r.json()['msgId']
    with connect() as c:
        assert str(c.execute('SELECT gmail_account_id FROM mail_messages WHERE msg_id=%s',(msg,)).fetchone()['gmail_account_id'])==a
        # Simulate a draft created by older code before the sender fix.
        c.execute('UPDATE mail_messages SET gmail_account_id=%s WHERE msg_id=%s',(other,msg))
    from api import routes_gmail as gmail
    monkeypatch.setattr(gmail,'_demo_mode',lambda:False)
    called=[];monkeypatch.setattr(gmail,'send_via_brand_gmail',lambda *a,**k:called.append(k))
    r=client.post(f'/inbox/threads/{thread}/messages/{msg}/send',headers=h)
    assert r.status_code==409 and called==[]
    with connect() as c:assert c.execute('SELECT state FROM mail_messages WHERE msg_id=%s',(msg,)).fetchone()['state']=='pending_gate'
    r=client.post(f'/admin/recruitment/mappings/{m}/distributed/preview',headers=h,json={'revision':1,'sender_ids':[other],'rows':[{'email':email,'mapping_key':m}]})
    assert r.status_code==409


def test_operator_offer_code_is_frozen_per_saved_mapping_revision(client,ops):
    h,b,p,a,m,s=ops
    def draft(revision,email):
        payload={'revision':revision,'rows':[{'email':email,'mapping_key':m,'name':'Synthetic reviewer'}]}
        preview=client.post(f'/admin/recruitment/mappings/{m}/preview',headers=h,json=payload)
        assert preview.status_code==200,preview.text
        r=client.post(f'/admin/recruitment/mappings/{m}/drafts',headers=h,json={**payload,'request_id':str(uuid4()),'review_hash':preview.json()['reviewHash']})
        assert r.status_code==200,r.text
        return r.json()['batchIds'][0]
    first=draft(1,'offer-first-'+s+'@qa.example')
    r=client.put('/admin/recruitment/mappings/'+m,headers=h,json={'revision':1,'name':'Updated synthetic proposal','target_brand_id':b,'product_id':p,'gmail_account_id':a,'state':'active','subject':'Updated {{brand}}','body':'Reviewed {{reason}}'})
    assert r.status_code==200,r.text
    second=draft(2,'offer-second-'+s+'@qa.example')
    rows=client.get(f'/admin/recruitment/mappings/{m}/batches',headers=h).json()['batches']
    codes={x['batch_id']:x['offer_code'] for x in rows}
    assert codes[first]=='O-'+m+'-R1' and codes[second]=='O-'+m+'-R2'
    assert client.get('/brands/dino-recruitment/outreach/'+first+'/review',headers=h).json()['offerCode']==codes[first]
