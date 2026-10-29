"""Synthetic five-role QA: owner, brand, operator, creator, security. No network."""
import base64
import json
from types import SimpleNamespace
import httpx
import pytest
from api import routes_gmail as g, routes_outreach as o
from api.db import connect

@pytest.fixture
def setup(client, monkeypatch):
    monkeypatch.setattr(o, 'guard', lambda *a: 'qa-operator')
    monkeypatch.setattr(g, '_guard', lambda *a: None)
    monkeypatch.setattr(g, '_demo_mode', lambda: False)
    with connect() as c:
        c.execute("INSERT INTO brands(brand_id,name) VALUES('sender-qa','QA') ON CONFLICT DO NOTHING")
        ids=[str(c.execute("INSERT INTO gmail_accounts(brand_id,email,scopes) VALUES('sender-qa',%s,%s) ON CONFLICT(brand_id,email) DO UPDATE SET state='connected',sending_paused=false RETURNING account_id",(f'qa{i}@sender.example',g.SCOPES)).fetchone()['account_id']) for i in range(5)]
    yield ids
    with connect() as c:
        c.execute("UPDATE outreach_batches SET state='cancelled' WHERE brand_id='sender-qa'")
        c.execute("DELETE FROM gmail_accounts WHERE email='foreign@qa.example'")

def draft(client, aid=None):
    payload={'recipients':['creator@qa.example'],'subject':'Offer','body':'QA proposal'}
    if aid: payload['gmail_account_id']=aid
    return client.post('/brands/sender-qa/outreach',json=payload)

def test_owner_five_accounts_visible_and_batch_pins_sender(client,setup):
    accounts=client.get('/brands/sender-qa/gmail').json()['accounts']
    assert len(accounts)==5
    r=draft(client,setup[3]); assert r.status_code==200,r.text
    assert r.json()['gmailAccountId']==setup[3]

def test_brand_cannot_assign_other_brand_mailbox(client,setup):
    with connect() as c:
        aid=str(c.execute("INSERT INTO gmail_accounts(brand_id,email) VALUES('glowlab','foreign@qa.example') RETURNING account_id").fetchone()['account_id'])
    assert draft(client,aid).status_code==409

def test_operator_multiple_accounts_requires_choice(client,setup):
    r=draft(client)
    assert client.post('/brands/sender-qa/outreach/'+r.json()['id']+'/send').status_code==409

def test_operator_revoked_sender_does_not_rotate(client,setup,monkeypatch):
    r=draft(client,setup[2]).json()
    with connect() as c:
        c.execute("UPDATE gmail_accounts SET state='revoked' WHERE account_id=%s",(setup[2],))
    called=[]
    monkeypatch.setattr(o,'deliver_pending',lambda *a:called.append(a))
    assert client.post('/brands/sender-qa/outreach/'+r['id']+'/send').status_code==409
    assert called==[]

def test_operator_queue_passes_pinned_account_and_preserves_pending(client,setup,monkeypatch):
    r=draft(client,setup[4]).json()
    with connect() as c:c.execute("UPDATE outreach_batches SET state='approved' WHERE batch_id=%s",(r['id'],))
    calls=[]
    monkeypatch.setattr(g,'send_via_brand_gmail',lambda *a,**k:calls.append(k['account_id']))
    assert o.deliver_pending('sender-qa',r['id'])==0
    assert str(calls[0])==setup[4]
    with connect() as c:assert c.execute('SELECT state FROM outreach_recipients WHERE batch_id=%s',(r['id'],)).fetchone()['state']=='pending'

def test_creator_optout_blocks_before_provider_call(client,setup,monkeypatch):
    r=draft(client,setup[0]).json()
    with connect() as c:
        c.execute("UPDATE outreach_batches SET state='approved' WHERE batch_id=%s",(r['id'],))
        c.execute("UPDATE outreach_optouts SET opted_out_at=now() WHERE brand_id='sender-qa' AND email='creator@qa.example'")
    calls=[];monkeypatch.setattr(g,'send_via_brand_gmail',lambda *a,**k:calls.append(k))
    assert o.deliver_pending('sender-qa',r['id'])==0 and calls==[]
    with connect() as c:
        assert c.execute('SELECT state FROM outreach_recipients WHERE batch_id=%s',(r['id'],)).fetchone()['state']=='blocked'
        c.execute("UPDATE outreach_optouts SET opted_out_at=NULL WHERE brand_id='sender-qa'")

def test_creator_reply_draft_keeps_original_account(client,setup):
    with connect() as c:
        tid=str(c.execute("INSERT INTO mail_threads(brand_id,creator_email,subject) VALUES('sender-qa','reply@qa.example','QA') RETURNING thread_id").fetchone()['thread_id'])
        c.execute("INSERT INTO mail_messages(thread_id,direction,from_email,to_email,body,gmail_account_id,gmail_thread_id,rfc_message_id) VALUES(%s,'in','reply@qa.example','qa2@sender.example','Interested',%s,'original-thread','<qa@example>')",(tid,setup[2]))
    r=client.post(f'/inbox/threads/{tid}/reply',json={'body':'QA answer'})
    assert r.status_code==200,r.text
    with connect() as c:
        m=c.execute('SELECT * FROM mail_messages WHERE msg_id=%s',(r.json()['msgId'],)).fetchone()
        assert str(m['gmail_account_id'])==setup[2] and m['gmail_thread_id']=='original-thread'

def test_security_live_oauth_allows_second_account_but_not_other_brand(client,setup,monkeypatch):
    monkeypatch.setenv('GOOGLE_CLIENT_ID','synthetic')
    claims=base64.urlsafe_b64encode(json.dumps({'email':'qa-new@sender.example','email_verified':True}).encode()).decode().rstrip('=')
    monkeypatch.setattr(httpx,'post',lambda *a,**k:SimpleNamespace(json=lambda:{'access_token':'fake','refresh_token':'fake','id_token':'h.'+claims+'.s','scope':g.SCOPES}))
    r=client.get('/gmail/callback',params={'code':'fake','state':g._new_oauth_state('sender-qa')})
    assert r.status_code==200,r.text
    r=client.get('/gmail/callback',params={'code':'fake','state':g._new_oauth_state('glowlab')})
    assert r.status_code==409,r.text

def test_creator_later_mailbox_does_not_change_approved_reply(client,setup,monkeypatch):
    from api import auth
    monkeypatch.setattr(auth,'current_user',lambda *a:{'sub':'qa'})
    with connect() as c:
        tid=str(c.execute("INSERT INTO mail_threads(brand_id,creator_email,subject) VALUES('sender-qa','stable@qa.example','Original offer') RETURNING thread_id").fetchone()['thread_id'])
        c.execute("INSERT INTO mail_messages(thread_id,direction,body,subject,gmail_account_id,gmail_thread_id,rfc_message_id) VALUES(%s,'in','First reply','Original offer',%s,'thread-a','<first@qa.example>')",(tid,setup[0]))
    r=client.post(f'/inbox/threads/{tid}/reply',json={'body':'Draft answer'}).json()
    with connect() as c:
        c.execute("INSERT INTO mail_messages(thread_id,direction,body,subject,gmail_account_id,gmail_thread_id) VALUES(%s,'in','Another mailbox','Other offer',%s,'thread-b')",(tid,setup[1]))
    calls=[]
    def provider(conn,brand,to,subject,body,**kw):
        calls.append((subject,kw))
        return {'via':'gmail','fromEmail':'qa0@sender.example','messageId':'fake-result','threadId':'thread-a'}
    monkeypatch.setattr(g,'send_via_brand_gmail',provider)
    path=f"/inbox/threads/{tid}/messages/{r['msgId']}/send"
    assert client.post(path).status_code==200
    assert str(calls[0][1]['account_id'])==setup[0]
    assert calls[0][1]['reply_headers']['gmail_thread_id']=='thread-a'
    assert calls[0][0]=='Re: Original offer'
    assert client.post(path).status_code==409 and len(calls)==1

def test_transport_returns_selected_mailbox_and_provider_thread(client,setup,monkeypatch):
    monkeypatch.setattr(g,'_refresh_if_needed',lambda *a:'fake-token')
    calls=[]
    def mocked_post(*args,**kwargs):
        calls.append(args[0])
        return SimpleNamespace(status_code=200,json=lambda:{'id':'mock-id','threadId':'mock-thread'})
    monkeypatch.setattr(httpx,'post',mocked_post)
    with connect() as c:
        result=g.send_via_brand_gmail(c,'sender-qa','transport@qa.example','QA','Mock only',account_id=setup[4])
    assert result['fromEmail']=='qa4@sender.example'
    assert result['accountId']==setup[4] and result['threadId']=='mock-thread'
    assert len(calls)==1

def test_200_daily_limit_enforced_without_rotating(client,setup,monkeypatch):
    from datetime import datetime, UTC
    with connect() as c:
        c.execute("UPDATE gmail_accounts SET sent_today=200,sent_date=%s WHERE account_id=%s",(datetime.now(UTC).date(),setup[0]))
    calls=[]
    monkeypatch.setattr(httpx,'post',lambda *a,**k:calls.append(a))
    with connect() as c:
        assert g.send_via_brand_gmail(c,'sender-qa','quota@qa.example','QA','Mock',account_id=setup[0]) is None
    assert calls==[]

def test_invalid_or_higher_daily_cap_fails_closed_or_clamps(client,setup,monkeypatch):
    with connect() as c: row=c.execute('SELECT * FROM gmail_accounts WHERE account_id=%s',(setup[1],)).fetchone()
    monkeypatch.setenv('GMAIL_DAILY_CAP','invalid');assert g._acct_out(row)['todayCap']==0
    monkeypatch.setenv('GMAIL_DAILY_CAP','2000');assert g._acct_out(row)['todayCap']==200
    monkeypatch.setenv('GMAIL_DAILY_CAP','100');assert g._acct_out(row)['todayCap']==100
