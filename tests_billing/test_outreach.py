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
