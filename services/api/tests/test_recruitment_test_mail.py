from uuid import uuid4
import pytest
from api import auth, routes_gmail as gmail
from api.db import connect

@pytest.fixture
def setup(client,monkeypatch):
    monkeypatch.setenv('GMAIL_OPS_ENABLED','1');monkeypatch.setenv('GMAIL_DAILY_CAP','200')
    h={'Authorization':'Bearer '+auth.issue_jwt({'sub':'test-mail-admin','kind':'admin'})}
    assert client.post('/admin/recruitment/workspace',headers=h).status_code==200
    suffix=uuid4().hex[:10];bid='test-mail-'+suffix
    with connect() as c:
        c.execute('INSERT INTO brands(brand_id,name) VALUES(%s,%s)',(bid,'Mail QA'))
        pid=str(c.execute('INSERT INTO brand_products(brand_id,name) VALUES(%s,%s) RETURNING product_id',(bid,'Serum')).fetchone()['product_id'])
        aid=str(c.execute("INSERT INTO gmail_accounts(brand_id,email,scopes) VALUES('dino-recruitment',%s,%s) RETURNING account_id",(suffix+'@example.test',gmail.SCOPES)).fetchone()['account_id'])
    m=client.post('/admin/recruitment/mappings',headers=h,json={'name':bid,'target_brand_id':bid,'product_id':pid,'gmail_account_id':aid,'subject':'{{brand}} / {{name}}','body':'{{product}} / {{reason}}'});assert m.status_code==200,m.text
    return h,{'mapping_id':m.json()['mapping_id'],'account_id':aid,'recipient':'chief@dinostudio.kr'},bid


def test_test_preview_is_readonly_owned_destination_and_role_scoped(client,setup,monkeypatch):
    h,b,bid=setup
    monkeypatch.setattr(gmail,'send_via_brand_gmail',lambda *a,**k:pytest.fail('preview must not send'))
    url='/admin/recruitment/test-mail/preview'
    assert client.post(url,json=b).status_code==401
    customer={'Authorization':'Bearer '+auth.issue_jwt({'sub':'brand','kind':'brand','brand_id':bid})}
    assert client.post(url,headers=customer,json=b).status_code==401
    assert client.post(url,headers=h,json={**b,'recipient':'outsider@example.test'}).status_code==400
    r=client.post(url,headers=h,json=b);assert r.status_code==200,r.text
    p=r.json();assert p['subject'].startswith('[TEST]') and 'brand='+bid in p['body'] and 'product=' in p['body']
    assert p['sent'] is False and 'application=' not in p['body']


def test_test_send_is_explicit_idempotent_and_not_a_recruitment_or_bill(client,setup,monkeypatch):
    h,b,bid=setup;url='/admin/recruitment/test-mail'
    p=client.post(url+'/preview',headers=h,json=b).json()
    req={**b,'request_id':str(uuid4()),'review_hash':p['reviewHash'],'confirmed':False}
    calls=[]
    def send(*a,**k):calls.append(k);return {'via':'gmail','messageId':'synthetic-id'}
    monkeypatch.setattr(gmail,'send_via_brand_gmail',send)
    assert client.post(url+'/send',headers=h,json=req).status_code==400
    req['confirmed']=True
    with connect() as c:before=c.execute('SELECT count(*) n FROM outreach_batches').fetchone()['n']
    r=client.post(url+'/send',headers=h,json=req);assert r.status_code==200,r.text
    assert r.json()['state']=='accepted'
    assert client.post(url+'/send',headers=h,json=req).json()['replayed'] is True
    assert len(calls)==1 and str(calls[0]['account_id'])==b['account_id']
    with connect() as c:assert c.execute('SELECT count(*) n FROM outreach_batches').fetchone()['n']==before
    history=client.get(url+'/history',headers=h);assert history.status_code==200,history.text
    assert any(x['request_id']==req['request_id'] for x in history.json()['tests'])


def test_unknown_provider_outcome_is_never_resent_and_pauses_account(client,setup,monkeypatch):
    h,b,_=setup;url='/admin/recruitment/test-mail'
    p=client.post(url+'/preview',headers=h,json=b).json();calls=[]
    def fail(*a,**k):calls.append(1);raise TimeoutError('synthetic')
    monkeypatch.setattr(gmail,'send_via_brand_gmail',fail)
    req={**b,'request_id':str(uuid4()),'review_hash':p['reviewHash'],'confirmed':True}
    assert client.post(url+'/send',headers=h,json=req).json()['state']=='review'
    assert client.post(url+'/send',headers=h,json=req).json()['replayed'] is True
    assert len(calls)==1
    with connect() as c:assert c.execute('SELECT sending_paused FROM gmail_accounts WHERE account_id=%s',(b['account_id'],)).fetchone()['sending_paused']


def test_changed_mapping_and_optout_are_blocked_before_provider(client,setup,monkeypatch):
    h,b,bid=setup;url='/admin/recruitment/test-mail'
    monkeypatch.setattr(gmail,'send_via_brand_gmail',lambda *a,**k:pytest.fail('must not send'))
    p=client.post(url+'/preview',headers=h,json=b).json()
    with connect() as c:c.execute('UPDATE recruitment_mappings SET revision=revision+1 WHERE mapping_id=%s',(b['mapping_id'],))
    assert client.post(url+'/send',headers=h,json={**b,'request_id':str(uuid4()),'review_hash':p['reviewHash'],'confirmed':True}).status_code==409
    with connect() as c:c.execute("INSERT INTO outreach_optouts(brand_id,email,opted_out_at) VALUES(%s,%s,now()) ON CONFLICT(brand_id,email) DO UPDATE SET opted_out_at=now()",(bid,b['recipient']))
    assert client.post(url+'/preview',headers=h,json=b).status_code==409
    with connect() as c:c.execute('DELETE FROM outreach_optouts WHERE brand_id=%s AND email=%s',(bid,b['recipient']))


def test_community_setup_is_idempotent_and_never_changes_membership(client,setup):
    h,b,bid=setup;url='/admin/recruitment/setup'
    assert client.put(url+'/brands/'+bid+'/community',json={'name':'QA Lounge'}).status_code==401
    for i in range(2):
        r=client.put(url+'/brands/'+bid+'/community',headers=h,json={'name':'QA Lounge'});assert r.status_code==200,r.text
    result=client.get(url+'/communities',headers=h);assert result.status_code==200,result.text
    row=next(x for x in result.json()['brands'] if x['brand_id']==bid)
    assert row['community_name']=='QA Lounge' and row['members']==0
    with connect() as c:
        assert c.execute('SELECT count(*) n FROM cells WHERE brand_id=%s',(bid,)).fetchone()['n']==1
        c.execute('UPDATE brands SET suspended_at=now() WHERE brand_id=%s',(bid,))
    assert client.put(url+'/brands/'+bid+'/community',headers=h,json={'name':'x'}).status_code==409


def test_quota_and_paused_sender_do_not_bypass_test_path(client,setup,monkeypatch):
    h,b,_=setup;url='/admin/recruitment/test-mail/preview'
    monkeypatch.setattr(gmail,'send_via_brand_gmail',lambda *a,**k:pytest.fail('must not send'))
    with connect() as c:c.execute("UPDATE gmail_accounts SET sending_paused=true WHERE account_id=%s",(b['account_id'],))
    assert client.post(url,headers=h,json=b).status_code==409
    with connect() as c:c.execute("UPDATE gmail_accounts SET sending_paused=false WHERE account_id=%s",(b['account_id'],))
    monkeypatch.setattr(gmail,'_acct_out',lambda a:{'sendingPaused':False,'remainingToday':0})
    assert client.post(url,headers=h,json=b).status_code==409


def test_brand_approval_provisions_real_room_owner_and_console_link(client,setup):
    h,_,_=setup;bid='approval-'+uuid4().hex[:10]
    r=client.post('/applications',json={'slug':bid,'name':'Approval QA','contact':bid+'@example.test','answers':{'voice':'Friendly'}})
    assert r.status_code==200,r.text
    approved=client.post('/admin/applications/'+r.json()['app_id']+'/approve',headers=h)
    assert approved.status_code==200,approved.text
    assert approved.json()['inviteLink'].startswith('https://console.theprlist.net/?invite=')
    with connect() as c:
        assert c.execute('SELECT 1 FROM cells WHERE brand_id=%s',(bid,)).fetchone()
        assert c.execute("SELECT 1 FROM brand_team_roles WHERE brand_id=%s AND role='owner'",(bid,)).fetchone()
