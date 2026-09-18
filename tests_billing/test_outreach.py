import subprocess
import uuid
from contextlib import contextmanager
from pathlib import Path
import psycopg
import pytest
from psycopg.rows import dict_row
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api import routes_outreach as routes, routes_gmail as gmail
from api.auth import issue_jwt
REAL_GMAIL_SEND = gmail.send_via_brand_gmail

ROOT=Path(__file__).resolve().parents[1]

@pytest.fixture(scope='module')
def outreach_db():
    name='prlist_outreach_'+uuid.uuid4().hex[:12]
    subprocess.run(['createdb',name],check=True)
    try:
        for p in sorted((ROOT/'db/migrations').glob('*.sql')):
            subprocess.run(['psql','-v','ON_ERROR_STOP=1','-d',name,'-f',str(p)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        yield name
    finally: subprocess.run(['dropdb',name],check=True)

@pytest.fixture
def setup(outreach_db,monkeypatch):
    @contextmanager
    def db():
        with psycopg.connect(dbname=outreach_db,row_factory=dict_row) as conn:yield conn
    with db() as c:
        c.execute('TRUNCATE outreach_batches,outreach_optouts,gmail_accounts,mail_threads,gate_requests CASCADE')
        c.execute("INSERT INTO brands(brand_id,name) VALUES('real','Real'),('other','Other') ON CONFLICT DO NOTHING")
        c.execute("INSERT INTO gmail_accounts(brand_id,email) VALUES('real','sender@example.com')")
    monkeypatch.setattr(routes,'connect',db);monkeypatch.setattr(gmail,'connect',db)
    monkeypatch.setenv('JWT_SECRET','local-test-secret');monkeypatch.setenv('GOOGLE_CLIENT_ID','test')
    app=FastAPI();app.include_router(routes.router);app.include_router(gmail.router)
    h={'Authorization':'Bearer '+issue_jwt({'kind':'brand','brand_id':'real','sub':'u1'})}
    calls=[]
    def send(*args):calls.append(args[2]);return {'via':'gmail','fromEmail':'sender@example.com','messageId':'provider-id'}
    monkeypatch.setattr(gmail,'send_via_brand_gmail',send)
    return TestClient(app),db,h,calls

def draft(c,h,emails=None):
    r=c.post('/brands/real/outreach',headers=h,json={'subject':'Hello','body':'Collaboration invitation','recipients':emails or ['creator@example.com']})
    assert r.status_code==200
    return r.json()['id']

def test_auth_validation_and_tenant_isolation(setup):
    c,db,h,calls=setup
    assert c.get('/brands/real/outreach').status_code==401
    assert c.get('/brands/other/outreach',headers=h).status_code==403
    assert c.post('/brands/real/outreach',headers=h,json={'subject':'Hello\r\nBcc: bad@example.com','body':'Hi','recipients':['x@example.com']}).status_code==400
    assert c.post('/brands/real/outreach',headers=h,json={'subject':'Hello','body':'Hi','recipients':['not-an-email']}).status_code==400
    i=draft(c,h)
    assert c.post('/brands/other/outreach/'+i+'/send',headers=h).status_code==403
    assert calls==[]

def test_explicit_send_idempotency_and_persistence(setup):
    c,db,h,calls=setup;i=draft(c,h,['creator@example.com','CREATOR@example.com'])
    assert calls==[]
    c.get('/brands/real/outreach',headers=h)
    assert calls==[]
    for _ in range(2):
        r=c.post('/brands/real/outreach/'+i+'/send',headers=h)
        assert r.status_code==200 and r.json()['recipients'][0]['state']=='sent'
    assert calls==['creator@example.com']
    with db() as conn:
        assert conn.execute('SELECT count(*) AS n FROM mail_messages').fetchone()['n']==1
        assert conn.execute('SELECT provider_id FROM outreach_recipients').fetchone()['provider_id']=='provider-id'

def test_uncertain_delivery_never_replays(setup,monkeypatch):
    c,db,h,calls=setup;i=draft(c,h)
    def timeout(*args):calls.append(args[2]);raise TimeoutError()
    monkeypatch.setattr(gmail,'send_via_brand_gmail',timeout)
    for _ in range(2):
        r=c.post('/brands/real/outreach/'+i+'/send',headers=h)
        assert r.json()['recipients'][0]['state']=='review'
    assert len(calls)==1

def test_quota_is_pending_not_fake_success(setup,monkeypatch):
    c,db,h,calls=setup;i=draft(c,h)
    monkeypatch.setattr(gmail,'send_via_brand_gmail',lambda *args:None)
    r=c.post('/brands/real/outreach/'+i+'/send',headers=h)
    assert r.json()['recipients'][0]['state']=='pending'
    with db() as conn:assert conn.execute('SELECT count(*) AS n FROM mail_messages').fetchone()['n']==0

def test_optout_and_90_day_suppression(setup):
    c,db,h,calls=setup;i=draft(c,h)
    c.post('/brands/real/outreach/'+i+'/send',headers=h)
    j=draft(c,h)
    assert c.post('/brands/real/outreach/'+j+'/send',headers=h).json()['recipients'][0]['state']=='blocked'
    k=draft(c,h,['optout@example.com'])
    with db() as conn:token=conn.execute("SELECT token FROM outreach_optouts WHERE email='optout@example.com'").fetchone()['token']
    assert c.get('/outreach/unsubscribe/'+str(token)).status_code==200
    with db() as conn:assert conn.execute("SELECT opted_out_at FROM outreach_optouts WHERE email='optout@example.com'").fetchone()['opted_out_at'] is None
    c.post('/outreach/unsubscribe/'+str(token))
    assert c.post('/brands/real/outreach/'+k+'/send',headers=h).json()['recipients'][0]['state']=='blocked'
    assert len(calls)==1

def test_inbox_read_does_not_send_and_inbound_requires_secret(setup):
    c,db,h,calls=setup
    with db() as conn:
        t=conn.execute("INSERT INTO mail_threads(brand_id,creator_email,subject) VALUES('real','creator@example.com','Subject') RETURNING thread_id").fetchone()['thread_id']
        g=conn.execute("INSERT INTO gate_requests(brand_id,kind,summary,payload,requested_by,state) VALUES('real','OUTBOUND','reply','{}','test','APPROVED') RETURNING gate_id").fetchone()['gate_id']
        m=conn.execute("INSERT INTO mail_messages(thread_id,direction,body,state,gate_id) VALUES(%s,'out','reply','pending_gate',%s) RETURNING msg_id",(t,g)).fetchone()['msg_id']
    c.get('/brands/real/inbox',headers=h);c.get('/inbox/threads/'+str(t),headers=h)
    assert calls==[]
    assert c.post('/inbound/reply',json={'from_email':'fake@example.com','brand_id':'real','text':'yes'}).status_code==401
    assert c.post(f'/inbox/threads/{t}/messages/{m}/send',headers=h).json()['state']=='sent'
    assert c.post(f'/inbox/threads/{t}/messages/{m}/send',headers=h).status_code==409
    assert len(calls)==1


def test_warmup_ignores_account_age_and_counts_sending_days():
    from datetime import datetime,UTC,timedelta
    now=datetime.now(UTC)
    row={'account_id':'test','brand_id':'real','email':'sender@example.com','state':'connected','connected_at':now-timedelta(days=300),'sent_date':now.date(),'sent_today':0,'warmup_days':0}
    assert gmail._acct_out(row)['todayCap']==2
    row.update(warmup_days=1,warmup_last_date=now.date(),sent_today=1)
    assert gmail._acct_out(row)['todayCap']==2
    assert gmail._acct_out(row)['remainingToday']==1
    row['warmup_last_date']=(now-timedelta(days=1)).date()
    assert gmail._acct_out(row)['todayCap']==4
    row.update(sending_paused=True)
    assert gmail._acct_out(row)['remainingToday']==0
    assert gmail._acct_out(row)['deliveryVerified'] is False


def test_pause_blocks_provider_and_wrong_brand_cannot_resume(setup,monkeypatch):
    c,db,h,calls=setup
    with db() as conn:aid=str(conn.execute("SELECT account_id FROM gmail_accounts WHERE brand_id='real'").fetchone()['account_id'])
    assert c.post('/gmail/accounts/'+aid+'/sending',headers=h,json={'paused':True}).status_code==200
    other={'Authorization':'Bearer '+issue_jwt({'kind':'brand','brand_id':'other'})}
    assert c.post('/gmail/accounts/'+aid+'/sending',headers=other,json={'paused':False}).status_code==403
    with db() as conn:
        assert REAL_GMAIL_SEND(conn,'real','test@example.test','QA','Paused') is None
    assert c.post('/gmail/accounts/'+aid+'/sending',headers=h,json={'paused':False}).json()['sendingPaused'] is False


def test_actual_sender_headers_and_daily_quota(setup,monkeypatch):
    import base64,httpx
    from email import message_from_bytes
    from types import SimpleNamespace
    c,db,h,calls=setup
    observed=[]
    monkeypatch.setattr(gmail,'_refresh_if_needed',lambda *a:'test-token')
    monkeypatch.setenv('INBOUND_REPLY','0')
    def post(url,**kw):
        observed.append(message_from_bytes(base64.urlsafe_b64decode(kw['json']['raw'])))
        return SimpleNamespace(status_code=200,json=lambda:{'id':'accepted-id'})
    monkeypatch.setattr(httpx,'post',post)
    for i in range(3):
        with db() as conn:
            result=REAL_GMAIL_SEND(conn,'real','recipient@example.test','QA','Test message')
        assert bool(result)==(i<2)
    assert len(observed)==2
    assert observed[0]['From']=='sender@example.com'
    assert observed[0]['Reply-To']=='sender@example.com'
    with db() as conn:
        row=conn.execute("SELECT * FROM gmail_accounts WHERE brand_id='real'").fetchone()
        assert row['sent_today']==2 and row['warmup_days']==1


def test_ai_draft_uses_saved_profile_and_never_sends(setup,monkeypatch):
    import json
    from types import SimpleNamespace
    c,db,h,calls=setup
    seen=[]
    def create(**kwargs):
        seen.append(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(type='text',text=json.dumps({'subject':'협업 제안','body':'QA 크림을 소개합니다.'}))])
    monkeypatch.setattr(routes.ai,'_client',lambda:SimpleNamespace(messages=SimpleNamespace(create=create)))
    with db() as conn:
        conn.execute("INSERT INTO brand_profile_versions(brand_id,version,fields) VALUES('real',123,%s) ON CONFLICT DO NOTHING",(json.dumps({'hero_product':{'value':'QA 크림'}}),))
    r=c.post('/brands/real/outreach/compose',headers=h,json={'brief':'한국어 협업 제안 작성'})
    assert r.status_code==200 and r.json()['sent'] is False
    assert 'QA 크림' in seen[0]['messages'][0]['content']
    assert calls==[]
    assert c.post('/brands/other/outreach/compose',headers=h,json={'brief':'한국어 협업 제안 작성'}).status_code==403
    with db() as conn:assert conn.execute('SELECT count(*) AS n FROM outreach_batches').fetchone()['n']==0


def test_gmail_sync_requires_read_grant_and_brand_access(setup):
    c,db,h,calls=setup
    assert c.post('/brands/other/gmail/sync',headers=h).status_code==403
    assert c.post('/brands/real/gmail/sync',headers=h).status_code==409
    assert c.post('/brands/real/gmail/sync').status_code==401


def test_gmail_import_is_idempotent_and_tenant_private(setup,monkeypatch):
    import base64,httpx
    from types import SimpleNamespace
    c,db,h,calls=setup
    with db() as conn:conn.execute("UPDATE gmail_accounts SET scopes=%s WHERE brand_id='real'",(gmail.SCOPES,))
    monkeypatch.setattr(gmail,'_refresh_if_needed',lambda *a:'test')
    body=base64.urlsafe_b64encode('Hello, interested in your brand'.encode()).decode()
    data={'id':'gm1','threadId':'gt1','internalDate':'1789742726000','labelIds':['INBOX'],'payload':{'mimeType':'text/plain','headers':[{'name':'From','value':'Creator <creator@example.com>'},{'name':'Subject','value':'Reply subject'},{'name':'Message-ID','value':'<one@example.com>'}],'body':{'data':body}}}
    class Client:
        def __init__(self,**kw):pass
        def __enter__(self):return self
        def __exit__(self,*a):pass
        def get(self,url,**kw):return SimpleNamespace(status_code=200,raise_for_status=lambda:None,json=lambda: data if url.endswith('/gm1') else {'messages':[{'id':'gm1'}]})
    monkeypatch.setattr(httpx,'Client',Client)
    assert c.post('/brands/real/gmail/sync',headers=h).json()['imported']==1
    assert c.post('/brands/real/gmail/sync',headers=h).json()['imported']==0
    with db() as conn:
        row=conn.execute("SELECT * FROM mail_messages WHERE gmail_message_id='gm1'").fetchone()
        assert row['body']=='Hello, interested in your brand'
        assert row['gmail_thread_id']=='gt1' and row['rfc_message_id']=='<one@example.com>'
    other={'Authorization':'Bearer '+issue_jwt({'kind':'brand','brand_id':'other'})}
    assert c.get('/inbox/threads/'+str(row['thread_id']),headers=other).status_code==403
    assert calls==[]


def test_oauth_nonce_is_single_use_and_brand_bound(setup):
    from fastapi import HTTPException
    c,db,h,calls=setup
    nonce=gmail._new_oauth_state('real')
    assert gmail._consume_oauth_state(nonce)=='real'
    with pytest.raises(HTTPException):gmail._consume_oauth_state(nonce)
    with pytest.raises(HTTPException):gmail._consume_oauth_state('tampered')


def test_callback_stores_granted_scope_and_blocks_shared_brand_mailbox(setup,monkeypatch):
    import base64,json,httpx
    from types import SimpleNamespace
    c,db,h,calls=setup
    claims=base64.urlsafe_b64encode(json.dumps({'email':'sender@example.com','email_verified':True}).encode()).decode().rstrip('=')
    token={'access_token':'test','id_token':'header.'+claims+'.signature','scope':'https://www.googleapis.com/auth/gmail.send openid email'}
    monkeypatch.setattr(httpx,'post',lambda *a,**kw:SimpleNamespace(json=lambda:token))
    with db() as conn:conn.execute("UPDATE gmail_accounts SET refresh_token='original-refresh' WHERE brand_id='real'")
    nonce=gmail._new_oauth_state('real')
    assert c.get('/gmail/callback',params={'code':'test','state':nonce}).status_code==200
    with db() as conn:
        row=conn.execute("SELECT * FROM gmail_accounts WHERE brand_id='real'").fetchone()
        assert row['refresh_token']=='original-refresh'
        assert gmail._acct_out(row)['canRead'] is False
    nonce=gmail._new_oauth_state('other')
    assert c.get('/gmail/callback',params={'code':'test','state':nonce}).status_code==409


def test_reply_provider_payload_is_bound_to_receiving_account(setup,monkeypatch):
    import base64,httpx
    from email import message_from_bytes
    from types import SimpleNamespace
    c,db,h,calls=setup
    with db() as conn:aid=conn.execute("SELECT account_id FROM gmail_accounts WHERE brand_id='real'").fetchone()['account_id']
    observed=[]
    monkeypatch.setattr(gmail,'_refresh_if_needed',lambda *a:'test-token')
    def post(url,**kw):
        observed.append(kw['json'])
        return SimpleNamespace(status_code=200,json=lambda:{'id':'reply-id'})
    monkeypatch.setattr(httpx,'post',post)
    with db() as conn:
        assert REAL_GMAIL_SEND(conn,'other','creator@example.com','Re: Hello','reply',account_id=aid) is None
        assert REAL_GMAIL_SEND(conn,'real','creator@example.com','Re: Hello','reply',account_id=aid,reply_headers={'rfc_message_id':'<in@example.com>','gmail_thread_id':'thread-1'})
    assert len(observed)==1 and observed[0]['threadId']=='thread-1'
    msg=message_from_bytes(base64.urlsafe_b64decode(observed[0]['raw']))
    assert msg['In-Reply-To']==msg['References']=='<in@example.com>'


def test_inbox_html_and_attachments_are_not_executed():
    import base64
    from api.gmail_sync import text_body
    def payload(text,**extra):return dict(mimeType='text/html',body={'data':base64.urlsafe_b64encode(text.encode()).decode()},**extra)
    assert text_body(payload('<script>bad()</script><p>Hello</p>')).strip()=='Hello'
    assert text_body(payload('secret',filename='attachment.html'))==''
