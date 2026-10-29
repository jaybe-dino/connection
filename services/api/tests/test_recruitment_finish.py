"""Owner, customer, operator, creator and security QA — synthetic, no external delivery."""
from datetime import datetime, UTC, timedelta
import httpx
import pytest
from api import auth, routes_gmail as gmail, routes_outreach as outreach
from api.db import connect

@pytest.fixture
def internal(client):
    headers={'Authorization':'Bearer '+auth.issue_jwt({'sub':'qa-internal-admin','kind':'admin'})}
    r=client.post('/admin/recruitment/workspace',headers=headers)
    assert r.status_code==200,r.text
    with connect() as c:c.execute("INSERT INTO brands(brand_id,name) VALUES('finish-customer','Dedicated customer') ON CONFLICT DO NOTHING")
    yield headers
    with connect() as c:
        c.execute("UPDATE outreach_batches SET state='cancelled' WHERE brand_id='dino-recruitment'")


def test_owner_internal_creation_idempotent_and_no_credentials(client,internal):
    r=client.post('/admin/recruitment/workspace',headers=internal)
    assert r.json()['created'] is False and r.json()['emailSent'] is False
    assert client.get('/admin/recruitment/workspace',headers=internal).json()['workspace']['internal']
    with connect() as c:
        assert c.execute("SELECT count(*) n FROM users WHERE brand_id='dino-recruitment'").fetchone()['n']==0
        assert c.execute("SELECT count(*) n FROM cells WHERE brand_id='dino-recruitment'").fetchone()['n']==1


def test_customer_cannot_create_company_workspace(client):
    h={'Authorization':'Bearer '+auth.issue_jwt({'sub':'qa-brand','kind':'brand','brand_id':'glowlab'})}
    assert client.post('/admin/recruitment/workspace',headers=h).status_code==401


def test_creator_company_membership_not_billed_customer_still_billed(client,internal):
    with connect() as c:
        c.execute("INSERT INTO creators(creator_id,handle,platform,verified) VALUES('internal-creator-qa','qa','tiktok',true)")
        c.execute("INSERT INTO brands(brand_id,name) VALUES('paid-creator-qa','Customer')")
        c.execute("INSERT INTO memberships(creator_id,brand_id) VALUES('internal-creator-qa','dino-recruitment'),('internal-creator-qa','paid-creator-qa')")
        rows=c.execute("SELECT brand_id,unit_price FROM signup_usage WHERE creator_id='internal-creator-qa'").fetchall()
    assert rows==[{'brand_id':'paid-creator-qa','unit_price':5000}]
    r=client.get('/brands/dino-recruitment/billing',headers=internal).json()
    assert r['model']=='internal' and r['collectionEnabled'] is False and r['usageAmount']==0
    assert client.post('/brands/dino-recruitment/billing/invoices',headers=internal).json()['invoices']==[]


def test_operator_200_recipient_batch_paused_queue_makes_no_provider_call(client,internal,monkeypatch):
    with connect() as c:
        account=str(c.execute("INSERT INTO gmail_accounts(brand_id,email) VALUES('dino-recruitment','batch@qa.example') RETURNING account_id").fetchone()['account_id'])
    draft={'target_brand_id':'finish-customer','gmail_account_id':account,'recipients':[f'c{i}@qa.example' for i in range(200)],'subject':'Review','body':'Only synthetic QA'}
    r=client.post('/brands/dino-recruitment/outreach',headers=internal,json=draft)
    assert r.status_code==200,r.text
    bid=r.json()['id'];assert len(r.json()['recipients'])==200
    with connect() as c:c.execute("UPDATE outreach_batches SET state='approved' WHERE batch_id=%s",(bid,))
    assert client.post(f'/brands/dino-recruitment/outreach/{bid}/control',headers=internal,json={'paused':True}).status_code==200
    called=[];monkeypatch.setattr(gmail,'send_via_brand_gmail',lambda *a,**k:called.append(k))
    assert outreach.deliver_pending('dino-recruitment',bid)==0 and called==[]
    draft['recipients'].append('extra@qa.example')
    assert client.post('/brands/dino-recruitment/outreach',headers=internal,json=draft).status_code==422


def test_operator_rolling_24h_and_spacing_block_network(client,internal,monkeypatch):
    calls=[];monkeypatch.setattr(httpx,'post',lambda *a,**k:calls.append(a))
    with connect() as c:
        row=c.execute("INSERT INTO gmail_accounts(brand_id,email,last_send_at) VALUES('dino-recruitment','pace@qa.example',now()) RETURNING *").fetchone()
        assert gmail.send_via_brand_gmail(c,'dino-recruitment','c@qa.example','QA','Mock',account_id=row['account_id']) is None
        c.execute('UPDATE gmail_accounts SET last_send_at=NULL,sent_today=0,sent_date=%s WHERE account_id=%s',(datetime.now(UTC).date()-timedelta(days=1),row['account_id']))
        for i in range(200):c.execute('INSERT INTO gmail_delivery_events(account_id,provider_message_id,accepted_at) VALUES(%s,%s,now()-interval \'2 hours\')',(row['account_id'],f'synthetic-{i}'))
        assert gmail.send_via_brand_gmail(c,'dino-recruitment','c@qa.example','QA','Mock',account_id=row['account_id']) is None
        refreshed=c.execute('SELECT * FROM gmail_accounts WHERE account_id=%s',(row['account_id'],)).fetchone()
        state=gmail._acct_out(gmail._with_delivery_usage(c,refreshed))
    assert state['sentLast24Hours']==200 and state['remainingToday']==0 and calls==[]


def test_security_preview_is_readonly_and_distinguishes_email_count(client,internal):
    with connect() as c:
        aid=str(c.execute("INSERT INTO gmail_accounts(brand_id,email) VALUES('dino-recruitment','preview@qa.example') RETURNING account_id").fetchone()['account_id'])
        c.execute("INSERT INTO outreach_optouts(brand_id,email,opted_out_at) VALUES('dino-recruitment','no@qa.example',now()) ON CONFLICT(brand_id,email) DO UPDATE SET opted_out_at=now()")
        before=c.execute('SELECT count(*) n FROM outreach_batches').fetchone()['n']
    r=client.post('/brands/dino-recruitment/outreach/preview',headers=internal,json={'target_brand_id':'finish-customer','gmail_account_id':aid,'recipients':[' Yes@qa.example ','yes@qa.example','no@qa.example']})
    assert r.status_code==200,r.text
    result=r.json();assert result['uniqueEmailCount']==2 and result['eligibleCount']==1
    assert result['excluded']==[{'email':'no@qa.example','reason':'opted_out'}]
    assert result['written'] is False and result['sent'] is False and result['identityCountVerified'] is False
    with connect() as c:assert c.execute('SELECT count(*) n FROM outreach_batches').fetchone()['n']==before


def test_operator_pause_between_recipients_stops_next_attempt(client,internal,monkeypatch):
    with connect() as c:
        aid=str(c.execute("INSERT INTO gmail_accounts(brand_id,email) VALUES('dino-recruitment','mid-pause@qa.example') RETURNING account_id").fetchone()['account_id'])
    r=client.post('/brands/dino-recruitment/outreach',headers=internal,json={'target_brand_id':'finish-customer','gmail_account_id':aid,'recipients':['mid-a@qa.example','mid-b@qa.example'],'subject':'QA','body':'Synthetic'}).json()
    with connect() as c:c.execute("UPDATE outreach_batches SET state='approved' WHERE batch_id=%s",(r['id'],))
    calls=[]
    def mocked_provider(*args,**kwargs):
        calls.append(args[2])
        with connect() as c:c.execute('UPDATE outreach_batches SET sending_paused=true WHERE batch_id=%s',(r['id'],))
        return {'via':'gmail','fromEmail':'mid-pause@qa.example','messageId':'pause-result','threadId':'pause-thread'}
    monkeypatch.setattr(gmail,'send_via_brand_gmail',mocked_provider)
    assert outreach.deliver_pending('dino-recruitment',r['id'])==1
    assert calls==['mid-a@qa.example']
    with connect() as c:
        states=c.execute('SELECT state FROM outreach_recipients WHERE batch_id=%s ORDER BY email',(r['id'],)).fetchall()
    assert [x['state'] for x in states]==['sent','pending']


def test_creator_explicit_stop_blocks_reply_and_quoted_link_does_not(client,internal,monkeypatch):
    with connect() as c:
        assert gmail.record_explicit_optout(c,'dino-recruitment','stop@qa.example','Please stop emailing me.')
        assert not gmail.record_explicit_optout(c,'dino-recruitment','normal@qa.example','Interested\n\n> Unsubscribe')
        tid=str(c.execute("INSERT INTO mail_threads(brand_id,creator_email,subject) VALUES('dino-recruitment','stop@qa.example','QA') RETURNING thread_id").fetchone()['thread_id'])
    calls=[];monkeypatch.setattr(gmail,'_demo_mode',lambda:False)
    monkeypatch.setattr(gmail,'send_via_brand_gmail',lambda *a,**k:calls.append(a))
    r=client.post(f'/inbox/threads/{tid}/messages/999/send',headers=internal)
    assert r.status_code==409 and '수신거부' in r.text and calls==[]


def test_owner_company_sender_keeps_customer_target_and_respects_customer_optout(client,internal,monkeypatch):
    with connect() as c:
        c.execute("INSERT INTO brands(brand_id,name) VALUES('target-qa','Customer Target') ON CONFLICT DO NOTHING")
        aid=str(c.execute("INSERT INTO gmail_accounts(brand_id,email) VALUES('dino-recruitment','target@qa.example') RETURNING account_id").fetchone()['account_id'])
        c.execute("INSERT INTO outreach_optouts(brand_id,email,opted_out_at) VALUES('target-qa','declined@qa.example',now())")
    payload={'gmail_account_id':aid,'target_brand_id':'target-qa','recipients':['declined@qa.example'],'subject':'Offer','body':'Manual review'}
    preview=client.post('/brands/dino-recruitment/outreach/preview',headers=internal,json=payload)
    assert preview.status_code==200 and preview.json()['eligibleCount']==0
    r=client.post('/brands/dino-recruitment/outreach',headers=internal,json=payload)
    assert r.status_code==200 and r.json()['targetBrandId']=='target-qa'
    assert '?brand=target-qa' in r.json()['body']
    bid=r.json()['id']
    with connect() as c:c.execute("UPDATE outreach_batches SET state='approved' WHERE batch_id=%s",(bid,))
    calls=[];monkeypatch.setattr(gmail,'send_via_brand_gmail',lambda *a,**kw:calls.append(a))
    assert outreach.deliver_pending('dino-recruitment',bid)==0 and calls==[]
    payload['target_brand_id']='paid-creator-qa'
    assert client.post('/brands/target-qa/outreach',headers=internal,json=payload).status_code==403


def test_company_ai_proposal_uses_customer_profile_and_join_link(client,internal,monkeypatch):
    import json
    from types import SimpleNamespace
    with connect() as c:
        c.execute("INSERT INTO brands(brand_id,name) VALUES('join-target-qa','Join Target')")
        c.execute("INSERT INTO brand_profile_versions(brand_id,version,fields,note) VALUES('join-target-qa',1,%s,'QA')",(json.dumps({'brand_one_liner':{'value':'customer verified facts'}}),))
    seen=[]
    def mocked_ai(**kwargs):
        seen.append(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(type='text',text=json.dumps({'subject':'Offer','body':'Review customer proposal'}))])
    monkeypatch.setattr(outreach.ai,'_client',lambda:SimpleNamespace(messages=SimpleNamespace(create=mocked_ai)))
    r=client.post('/brands/dino-recruitment/outreach/compose',headers=internal,json={'target_brand_id':'join-target-qa','brief':'Only use supplied facts'})
    assert r.status_code==200,r.text
    assert r.json()['joinUrl'].endswith('?brand=join-target-qa') and r.json()['sent'] is False
    assert 'customer verified facts' in seen[0]['messages'][0]['content']
    assert '디노스튜디오 공용 크리에이터 모집' not in seen[0]['messages'][0]['content']
