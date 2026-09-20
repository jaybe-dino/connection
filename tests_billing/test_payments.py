import hashlib
import subprocess
import uuid
from contextlib import contextmanager
from datetime import date
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import dict_row
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api import nicepay, routes_payments as routes, routes_billing
from api.auth import issue_jwt

ROOT = Path(__file__).resolve().parents[1]

@pytest.fixture(scope='module')
def dbname():
    name = 'prlist_test_' + uuid.uuid4().hex[:12]
    subprocess.run(['createdb', name], check=True)
    subprocess.run(['psql','-v','ON_ERROR_STOP=1','-d',name,'-f', str(ROOT/'services/api/tests/sql/signup_billing.sql')],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['psql','-v','ON_ERROR_STOP=1','-d',name,'-f', str(ROOT/'db/migrations/011_monthly_invoices.sql')],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['psql','-v','ON_ERROR_STOP=1','-d',name,'-f', str(ROOT/'db/migrations/012_signup_price_50.sql')],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['psql','-v','ON_ERROR_STOP=1','-d',name,'-c',
        "CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"
        "INSERT INTO schema_migrations (name, applied_at) VALUES ('012_signup_price_50.sql', now() - interval '30 days');"],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['psql','-v','ON_ERROR_STOP=1','-d',name,'-f', str(ROOT/'db/migrations/020_signup_price_5000.sql')],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['psql','-v','ON_ERROR_STOP=1','-d',name,'-c',
        "INSERT INTO schema_migrations (name, applied_at) VALUES ('020_signup_price_5000.sql', now() - interval '1 day');"],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['psql','-v','ON_ERROR_STOP=1','-d',name,'-f', str(ROOT/'db/migrations/022_restore_pre_5000_prices.sql')],check=True,stdout=subprocess.DEVNULL)
    yield name
    subprocess.run(['dropdb',name],check=True)

@pytest.fixture
def setup(dbname, monkeypatch):
    @contextmanager
    def db():
        with psycopg.connect(dbname=dbname,row_factory=dict_row) as conn:
            yield conn
    with db() as conn:
        conn.execute('TRUNCATE signup_usage,signup_invoices,memberships,creators,brands CASCADE')
        conn.execute("INSERT INTO brands VALUES ('real',false,'per_signup'),('other',false,'per_signup')")
        conn.execute("INSERT INTO creators VALUES ('c1',true),('c2',true),('c3',true)")
        conn.execute("UPDATE signup_billing_policy SET effective_at='2020-01-01'")
        conn.execute("INSERT INTO memberships VALUES ('c1','real',now()),('c2','real',now()),('c3','real',now())")
        conn.execute("UPDATE signup_usage SET verified_at='2026-01-15' WHERE creator_id<>'c3'")
    monkeypatch.setattr(routes,'connect',db)
    monkeypatch.setattr(routes_billing,'connect',db)
    events=[]
    monkeypatch.setattr(routes,'ledger_append',lambda *args: events.append(args[2]))
    monkeypatch.setenv('NICEPAY_ENABLED','1')
    monkeypatch.setenv('NICEPAY_CLIENT_KEY','test-client')
    monkeypatch.setenv('NICEPAY_SECRET_KEY','test-secret')
    monkeypatch.setenv('JWT_SECRET','local-test-key')
    monkeypatch.setenv('AUTH_REQUIRED','1')
    app=FastAPI(); app.include_router(routes.router); app.include_router(routes_billing.router)
    token=issue_jwt({'kind':'brand','brand_id':'real','sub':'u1'})
    return TestClient(app),db,{'Authorization':'Bearer '+token},events

def signature(text):
    return hashlib.sha256((text+'test-secret').encode()).hexdigest()

def invoice(client,headers):
    r=client.post('/brands/real/billing/invoices',headers=headers)
    assert r.status_code==200
    return r.json()['invoices'][0]

def form(iid):
    return {'tid':'test-tid','orderId':iid,'amount':'10000','authResultCode':'0000',
            'authToken':'token','signature':signature('tokentest-client10000')}

def paid(iid):
    return {'resultCode':'0000','status':'paid','orderId':iid,'amount':10000,'tid':'test-tid',
            'ediDate':'2026-02-01', 'signature':signature('test-tid100002026-02-01')}

def test_month_close_idempotency_and_current_month_exclusion(setup):
    client,db,h,_=setup
    first=invoice(client,h);second=invoice(client,h)
    assert first==second
    assert first['quantity']==2 and first['amount']==10000
    assert first['period']=='2026-01'
    summary=client.get('/brands/real/billing',headers=h).json()
    assert summary['quantity']==3 and summary['usageAmount']==15000
    assert summary['taxTreatment']=='inclusive'

def test_tenant_and_unauth_denied(setup):
    client,_,h,_=setup
    assert client.post('/brands/real/billing/invoices').status_code==401
    assert client.post('/brands/other/billing/invoices',headers=h).status_code==403
    assert client.get('/brands/other/billing',headers=h).status_code==403

def test_missing_keys_fail_closed(setup,monkeypatch):
    client,_,h,_=setup;i=invoice(client,h)
    monkeypatch.delenv('NICEPAY_SECRET_KEY')
    assert client.post('/brands/real/billing/invoices/'+i['id']+'/checkout',headers=h).status_code==503

def test_signature_and_amount_tampering_never_calls_pg(setup,monkeypatch):
    client,_,h,_=setup;i=invoice(client,h)
    def forbidden(*args): raise AssertionError('Should not contact PG')
    monkeypatch.setattr(nicepay,'request',forbidden)
    bad=form(i['id']);bad['amount']='1'
    assert 'invalid' in client.post('/payments/return',data=bad,follow_redirects=False).headers['location']
    bad=form(i['id']);bad['signature']='0'*64
    assert 'invalid' in client.post('/payments/return',data=bad,follow_redirects=False).headers['location']

def test_approval_replay_captures_once(setup,monkeypatch):
    client,db,h,events=setup;i=invoice(client,h);calls=[]
    def pg(method,*args): calls.append(method);return paid(i['id'])
    monkeypatch.setattr(nicepay,'request',pg)
    for _ in range(2):
        r=client.post('/payments/return',data=form(i['id']),follow_redirects=False)
        assert 'success' in r.headers['location']
    assert calls.count('POST')==1
    assert events==['INVOICE_PAID']
    with db() as c: assert c.execute('SELECT status FROM signup_invoices').fetchone()['status']=='paid'

def test_timeout_does_not_retry_charge_and_reconciles(setup,monkeypatch):
    client,_,h,_=setup;i=invoice(client,h);calls=[]
    def pg(method,*args):
        calls.append(method)
        if method=='POST': raise nicepay.PaymentUnavailable('timeout')
        return paid(i['id'])
    monkeypatch.setattr(nicepay,'request',pg)
    for _ in range(2):
        assert 'review' in client.post('/payments/return',data=form(i['id']),follow_redirects=False).headers['location']
    assert calls.count('POST')==1
    assert client.post('/brands/real/billing/invoices/'+i['id']+'/reconcile',headers=h).json()['paid']

def test_webhook_authentication_and_replay(setup,monkeypatch):
    client,db,h,events=setup;i=invoice(client,h)
    with db() as c: c.execute("UPDATE signup_invoices SET tid='test-tid',status='processing'")
    monkeypatch.setattr(nicepay,'request',lambda *args: paid(i['id']))
    assert client.post('/payments/webhook',json={'tid':'test-tid','orderId':i['id']}).status_code==401
    for _ in range(2):
        r=client.post('/payments/webhook',json=paid(i['id']))
        assert r.status_code==200 and r.text=='OK'
    assert events==['INVOICE_PAID']

def test_pg_order_mismatch_never_captures(setup,monkeypatch):
    client,_,h,_=setup;i=invoice(client,h);calls=[]
    def pg(method,*args):calls.append(method);return paid('different')
    monkeypatch.setattr(nicepay,'request',pg)
    assert 'review' in client.post('/payments/return',data=form(i['id']),follow_redirects=False).headers['location']
    assert calls==['GET']

def test_other_app_and_registration_events_are_noops(setup,monkeypatch):
    client,db,h,events=setup
    i=invoice(client,h)
    def forbidden(*args): raise AssertionError('Unrelated event must not access payments or DB')
    monkeypatch.setattr(nicepay,'request',forbidden)
    monkeypatch.setattr(routes,'connect',forbidden)
    for order_id in ('nicepay-registration-sample', 'GLOVEK_123'):
        r=client.post('/payments/webhook',json={'tid':'sample', 'orderId':order_id})
        assert r.status_code==200 and r.text=='OK'
    assert client.post('/payments/webhook',json={'tid':'sample','orderId':i['id']}).status_code==401
    assert events==[]
    with db() as c:
        assert c.execute('SELECT status FROM signup_invoices').fetchone()['status']=='open'

def test_monthly_invoice_sums_recorded_prices(setup):
    # 과거에 다른 단가로 기록된 사용량은 그 값 그대로 합산 — 소급 인상 없음
    client,db,h,_=setup
    with db() as c:c.execute("UPDATE signup_usage SET unit_price=50 WHERE creator_id='c1'")
    i=invoice(client,h)
    assert i['amount']==5050 and i['quantity']==2
    assert client.get('/brands/real/billing',headers=h).json()['unitPrice']==5000

def test_small_monthly_invoice_is_retained_without_card_checkout(setup):
    # 1,000원 미만 청구서는 보관만 하고 카드 결제는 열지 않는다 (과거 저단가 기록 가정)
    client,db,h,_=setup
    with db() as c:c.execute("UPDATE signup_usage SET unit_price=50")
    i=invoice(client,h)
    assert i['amount']==100 and not i['cardPayable']
    assert client.post('/brands/real/billing/invoices/'+i['id']+'/checkout',headers=h).status_code==409
    with db() as c:assert c.execute('SELECT status FROM signup_invoices').fetchone()['status']=='open'


def test_pre_5000_unbilled_usage_is_preserved_not_raised(setup):
    """소급 인상 금지 — 020 이전(과거 정책기) 미청구 기록은 50원 그대로,
    020 이후 신규 검증 가입만 5,000원. 발행 청구서는 불변."""
    client,db,h,_=setup
    with db() as c:
        # 과거 정책기(도입가 50원)에 기록됐던 미청구 사용량이 020으로 5000이 된 상황 재현
        c.execute("UPDATE signup_usage SET unit_price=5000,"
                  " verified_at=now()-interval '10 days' WHERE creator_id='c1'")
        # 이미 발행된 과거 청구서 금액은 어떤 경우에도 손대지 않는다
        c.execute("INSERT INTO signup_invoices (invoice_id,brand_id,period,quantity,amount,status)"
                  " VALUES ('inv-old','real','2025-12-01',1,50,'paid')")
        c.execute("UPDATE signup_usage SET invoice_id='inv-old', unit_price=5000,"
                  " verified_at=now()-interval '40 days' WHERE creator_id='c2'")
    import subprocess as sp
    with db() as c:
        dbname_row=c.execute('SELECT current_database() d').fetchone()
    sp.run(['psql','-v','ON_ERROR_STOP=1','-d',dbname_row['d'],'-f',
            str(ROOT/'db/migrations/022_restore_pre_5000_prices.sql')],check=True,stdout=sp.DEVNULL)
    with db() as c:
        rows={r['creator_id']:r for r in c.execute(
            "SELECT creator_id,unit_price,invoice_id FROM signup_usage").fetchall()}
        inv=c.execute("SELECT amount,status FROM signup_invoices WHERE invoice_id='inv-old'").fetchone()
    assert rows['c1']['unit_price']==50          # 과거 미청구 → 기록가 복원
    assert rows['c2']['unit_price']==5000 and rows['c2']['invoice_id']=='inv-old'  # 발행분 불변
    assert rows['c3']['unit_price']==5000        # 020 이후 신규 검증 가입 → 5,000원
    assert inv['amount']==50 and inv['status']=='paid'
