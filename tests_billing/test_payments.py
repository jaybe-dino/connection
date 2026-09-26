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
        "INSERT INTO schema_migrations (name, applied_at) VALUES ('012_signup_price_50.sql', '2020-01-01');"],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['psql','-v','ON_ERROR_STOP=1','-d',name,'-f', str(ROOT/'db/migrations/020_signup_price_5000.sql')],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['psql','-v','ON_ERROR_STOP=1','-d',name,'-c',
        "INSERT INTO schema_migrations (name, applied_at) VALUES ('020_signup_price_5000.sql', '2020-06-01');"],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['psql','-v','ON_ERROR_STOP=1','-d',name,'-f', str(ROOT/'db/migrations/022_restore_pre_5000_prices.sql')],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['psql','-v','ON_ERROR_STOP=1','-d',name,'-f', str(ROOT/'db/migrations/024_signup_usage_audit.sql')],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['psql','-v','ON_ERROR_STOP=1','-d',name,'-f', str(ROOT/'db/migrations/029_invoice_supplements.sql')],check=True,stdout=subprocess.DEVNULL)
    yield name
    subprocess.run(['dropdb',name],check=True)

@pytest.fixture
def setup(dbname, monkeypatch):
    # This isolated billing schema has no auth users table. Session revocation
    # is covered by API integration tests; keep role/tenant checks real here.
    from api import auth
    monkeypatch.setattr(auth, '_session_epoch', lambda user_id: 0)
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


def test_uncertain_price_rows_are_audited_not_changed(setup):
    """검수 반영: 원단가 증거가 불확실한 행은 값 자동 변경 없이 감사 큐로 가고,
    해결 전엔 청구서에 산입되지 않는다. 발행된 청구서는 불변."""
    client,db,h,_=setup
    with db() as c:
        # 020 적용 시각(2020-06-01) 이전에 기록된 미청구 행 재현 — 값은 그대로 5000
        c.execute("UPDATE signup_usage SET verified_at='2020-03-01' WHERE creator_id='c1'")
        dbname_row=c.execute('SELECT current_database() d').fetchone()
    import subprocess as sp
    sp.run(['psql','-v','ON_ERROR_STOP=1','-d',dbname_row['d'],'-f',
            str(ROOT/'db/migrations/024_signup_usage_audit.sql')],check=True,stdout=sp.DEVNULL)
    with db() as c:
        audited=c.execute("SELECT a.*, u.unit_price FROM signup_usage_audit a"
                          " JOIN signup_usage u USING (usage_id)"
                          " WHERE u.creator_id='c1'").fetchone()
    assert audited and audited['resolved_at'] is None
    assert audited['unit_price']==5000            # 값은 건드리지 않음

    # 감사 미해결 행은 월마감 산입 제외 (c2 2026-01만 청구됨)
    i=invoice(client,h)
    assert i['quantity']==1 and i['amount']==5000 and i['period']=='2026-01'

    # 어드민이 증거와 함께 수동 확정 → 다음 월마감에 그 가격으로 산입
    from api.auth import issue_jwt
    ah={'Authorization':'Bearer '+issue_jwt({'kind':'admin','sub':'aud-admin'})}
    q=client.get('/admin/usage-audit',headers=ah).json()
    assert any(x['currentPrice']==5000 for x in q)
    uid=[x for x in q if x['brandId']=='real'][0]['usageId']
    r=client.post(f'/admin/usage-audit/{uid}/resolve',
                  json={'unit_price':50,'evidence':'2020-03 당시 도입가 50원 — 012 마이그레이션 기록 확인'},
                  headers=ah)
    assert r.status_code==200
    out=client.post('/brands/real/billing/invoices',headers=h).json()['invoices']
    old=[x for x in out if x['period']=='2020-03']
    assert old and old[0]['amount']==50 and old[0]['quantity']==1


def _admin_headers():
    from api.auth import issue_jwt
    return {'Authorization': 'Bearer ' + issue_jwt({'kind': 'admin',
                                                    'sub': 'aud-admin'})}


def _hold(db, creator_id):
    """같은 달 사용량 1건을 감사 보류(미해결) 상태로 만든다."""
    with db() as c:
        c.execute("INSERT INTO signup_usage_audit (usage_id, reason, price_at_flag)"
                  " SELECT usage_id, '검수 재현: 원단가 증거 확인 대기', unit_price"
                  " FROM signup_usage WHERE creator_id=%s"
                  " ON CONFLICT (usage_id) DO NOTHING", (creator_id,))
        return c.execute("SELECT usage_id FROM signup_usage WHERE creator_id=%s",
                         (creator_id,)).fetchone()['usage_id']


def test_same_month_late_resolution_creates_supplement(setup):
    """검수 재현(4차): 같은 달(2026-01) 2건 중 1건 감사 보류 → 선청구(1건)
    → 결제(paid) → 보류건 50원 확정 → 재조회. 기존 paid 청구서는 불변으로
    보존되고, 같은 월의 추가 청구서(seq>0)가 생성되며, 반복 호출에도
    중복·누락 과금이 없어야 한다."""
    client, db, h, _ = setup
    uid = _hold(db, 'c1')

    # ① 선청구: 보류건 제외 → 2026-01 본청구 1건 5,000원
    first = invoice(client, h)
    assert first['quantity'] == 1 and first['amount'] == 5000
    assert first['period'] == '2026-01' and not first['supplement']

    # ② 결제 완료 상태 모사(실결제 아님) — 발행·결제분 불변성 검증용
    with db() as c:
        c.execute("UPDATE signup_invoices SET status='paid', paid_at=now()"
                  " WHERE invoice_id=%s", (first['id'],))

    # ③ 보류건을 증거와 함께 50원으로 확정
    r = client.post(f'/admin/usage-audit/{uid}/resolve',
                    json={'unit_price': 50,
                          'evidence': '가입 당시 도입가 50원 — 정책 이력 확인'},
                    headers=_admin_headers())
    assert r.status_code == 200

    # ④ 재조회: UniqueViolation 없이 같은 월 추가 청구서가 생긴다
    out = client.post('/brands/real/billing/invoices', headers=h).json()['invoices']
    jan = [x for x in out if x['period'] == '2026-01']
    assert len(jan) == 2
    orig = next(x for x in jan if x['id'] == first['id'])
    assert (orig['amount'], orig['quantity'], orig['status'],
            orig['seq']) == (5000, 1, 'paid', 0)          # 기존 청구서 불변
    supp = next(x for x in jan if x['id'] != first['id'])
    assert supp['supplement'] and supp['seq'] == 1
    assert supp['quantity'] == 1 and supp['amount'] == 50 and supp['status'] == 'open'
    assert sum(x['amount'] for x in jan) == 5050          # 기존+추가 정확, 중복 없음

    # ⑤ 반복 호출 멱등: 청구서 수·금액 그대로
    for _ in range(2):
        out2 = client.post('/brands/real/billing/invoices',
                           headers=h).json()['invoices']
        jan2 = [x for x in out2 if x['period'] == '2026-01']
        assert len(jan2) == 2
        assert sorted(x['amount'] for x in jan2) == [50, 5000]
    # 모든 사용량이 정확히 한 청구서에 연결됐다
    with db() as c:
        n = c.execute("SELECT count(*) n FROM signup_usage"
                      " WHERE brand_id='real' AND invoice_id IS NULL"
                      " AND verified_at < '2026-02-01'").fetchone()['n']
    assert n == 0


def test_processing_invoice_untouched_by_supplement(setup):
    """processing(결제 진행 중) 청구서도 지연 확정 추가 청구에서 불변."""
    client, db, h, _ = setup
    uid = _hold(db, 'c2')
    first = invoice(client, h)                    # c1만 본청구
    with db() as c:
        c.execute("UPDATE signup_invoices SET status='processing', tid='hold-tid'"
                  " WHERE invoice_id=%s", (first['id'],))
    assert client.post(f'/admin/usage-audit/{uid}/resolve',
                       json={'unit_price': 5000,
                             'evidence': '검증 시점 정책 단가 5,000원 확인'},
                       headers=_admin_headers()).status_code == 200
    out = client.post('/brands/real/billing/invoices', headers=h).json()['invoices']
    jan = [x for x in out if x['period'] == '2026-01']
    assert len(jan) == 2
    orig = next(x for x in jan if x['id'] == first['id'])
    assert orig['status'] == 'processing' and orig['amount'] == 5000
    supp = next(x for x in jan if x['id'] != first['id'])
    assert supp['seq'] == 1 and supp['amount'] == 5000
    with db() as c:
        row = c.execute("SELECT status, tid FROM signup_invoices"
                        " WHERE invoice_id=%s", (first['id'],)).fetchone()
    assert row == {'status': 'processing', 'tid': 'hold-tid'}


def test_concurrent_resolve_during_close_no_lost_billing(setup):
    """검수 재현(5차, 2연결+Event barrier): close_months가 집계를 마친 순간
    별도 연결에서 보류건을 50원 확정 → 재개. 잠금 순서 통일로 확정이 마감
    커밋 뒤로 밀리고, 청구서에는 집계에 포함된 행만 정확히 연결돼
    금액=연결합계가 항상 일치하며 50원은 다음 마감의 추가 청구로 잡힌다."""
    import threading
    import time as _time

    from api import routes_payments as rp
    client, db, h, _ = setup
    uid = _hold(db, 'c1')

    orig = rp._collect_billable
    collected, proceed = threading.Event(), threading.Event()

    def paused(conn, brand, cutoff):
        rows = orig(conn, brand, cutoff)
        collected.set()               # 집계 완료 — 이 시점에 경쟁 확정 시도
        proceed.wait(timeout=10)
        return rows

    results = {}

    def close_call():
        results['close'] = client.post('/brands/real/billing/invoices',
                                       headers=h).status_code

    def resolve_call():
        collected.wait(timeout=10)
        results['resolve'] = client.post(
            f'/admin/usage-audit/{uid}/resolve',
            json={'unit_price': 50,
                  'evidence': '경합 재현: 마감 집계 직후 별도 연결 확정'},
            headers=_admin_headers()).status_code

    rp._collect_billable = paused
    try:
        ta = threading.Thread(target=close_call)
        tb = threading.Thread(target=resolve_call)
        ta.start(); tb.start()
        assert collected.wait(timeout=10)
        _time.sleep(0.5)              # resolve가 billing 잠금에 블록될 시간
        proceed.set()
        ta.join(timeout=15); tb.join(timeout=15)
    finally:
        rp._collect_billable = orig
    assert results['close'] == 200 and results['resolve'] == 200

    with db() as c:
        inv = c.execute("SELECT * FROM signup_invoices WHERE brand_id='real'"
                        " ORDER BY seq").fetchall()
        assert len(inv) == 1
        assert (inv[0]['quantity'], inv[0]['amount'], inv[0]['seq']) == (1, 5000, 0)
        linked = c.execute(
            'SELECT count(*) n, COALESCE(sum(unit_price),0) s FROM signup_usage'
            ' WHERE invoice_id=%s', (inv[0]['invoice_id'],)).fetchone()
        assert linked == {'n': 1, 's': 5000}      # 금액 = 연결 합계 (불일치 없음)

    # 확정된 50원은 누락되지 않고 재조회에서 추가 청구로 발행된다
    out = client.post('/brands/real/billing/invoices', headers=h).json()['invoices']
    jan = [x for x in out if x['period'] == '2026-01']
    assert sorted(x['amount'] for x in jan) == [50, 5000]
    with db() as c:
        left = c.execute("SELECT count(*) n FROM signup_usage"
                         " WHERE brand_id='real' AND invoice_id IS NULL"
                         " AND verified_at < '2026-02-01'").fetchone()['n']
        pair = c.execute(
            "SELECT i.invoice_id, i.amount, count(u.usage_id) n,"
            " COALESCE(sum(u.unit_price),0) s FROM signup_invoices i"
            " LEFT JOIN signup_usage u ON u.invoice_id=i.invoice_id"
            " WHERE i.brand_id='real' GROUP BY 1,2").fetchall()
    assert left == 0
    assert all(p['amount'] == p['s'] and p['n'] > 0 for p in pair)


def test_concurrent_month_close_single_invoice(setup):
    """일반 동시 월마감: 두 연결이 동시에 마감해도 청구서는 한 번만,
    금액·연결 모두 정확하다 (advisory lock 직렬화)."""
    import threading
    client, db, h, _ = setup
    codes = []
    threads = [threading.Thread(
        target=lambda: codes.append(client.post(
            '/brands/real/billing/invoices', headers=h).status_code))
        for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=15)
    assert codes == [200, 200]
    with db() as c:
        inv = c.execute("SELECT * FROM signup_invoices WHERE brand_id='real'").fetchall()
        assert len(inv) == 1
        assert (inv[0]['quantity'], inv[0]['amount']) == (2, 10000)
        linked = c.execute(
            'SELECT count(*) n, COALESCE(sum(unit_price),0) s FROM signup_usage'
            ' WHERE invoice_id=%s', (inv[0]['invoice_id'],)).fetchone()
    assert linked == {'n': 2, 's': 10000}


def test_decimal_unit_prices_summed_exactly(setup):
    # 기록된 단가 그대로 합산(소급 인상 없음) 확인용 보조 검증
    client,db,h,_=setup
    with db() as c:c.execute("UPDATE signup_usage SET unit_price=50 WHERE creator_id='c1'")
    i=invoice(client,h)
    assert i['amount']==5050 and i['quantity']==2


def cancelled(iid,status='cancelled'):
    return {'resultCode':'0000','status':status,'orderId':iid,'amount':10000,'tid':'test-tid',
            'ediDate':'2026-02-02','signature':signature('test-tid100002026-02-02')}

def test_signed_cancel_notice_moves_paid_to_review_once(setup,monkeypatch):
    """paid 이후 서명 검증된 PG 취소 통지(웹훅) — 유료 유지가 아니라 review로
    전환하고, 통지 재생(replay)에도 원장 기록은 한 번, 상태는 안정적."""
    client,db,h,events=setup;i=invoice(client,h)
    monkeypatch.setattr(nicepay,'request',lambda *a: paid(i['id']))
    client.post('/payments/return',data=form(i['id']),follow_redirects=False)
    assert events==['INVOICE_PAID']
    monkeypatch.setattr(nicepay,'request',lambda *a: cancelled(i['id']))
    for _ in range(2):                     # 취소 통지 재생
        r=client.post('/payments/webhook',json=cancelled(i['id']))
        assert r.status_code==409          # settle False → 대사 필요 응답
    with db() as c:
        assert c.execute('SELECT status FROM signup_invoices').fetchone()['status']=='review'
    assert events==['INVOICE_PAID','INVOICE_CANCEL_REPORTED']

def test_partial_cancel_via_reconcile_and_idempotent(setup,monkeypatch):
    client,db,h,events=setup;i=invoice(client,h)
    monkeypatch.setattr(nicepay,'request',lambda *a: paid(i['id']))
    client.post('/payments/return',data=form(i['id']),follow_redirects=False)
    monkeypatch.setattr(nicepay,'request',
                        lambda *a: cancelled(i['id'],'partialCancelled'))
    for _ in range(2):                     # 수동 대사 반복도 멱등
        r=client.post('/brands/real/billing/invoices/'+i['id']+'/reconcile',headers=h)
        assert r.status_code==200 and r.json()['paid'] is False
    with db() as c:
        assert c.execute('SELECT status FROM signup_invoices').fetchone()['status']=='review'
    assert events==['INVOICE_PAID','INVOICE_CANCEL_REPORTED']

def test_forged_or_unsigned_cancel_never_demotes_paid(setup,monkeypatch):
    """status 필드만 cancelled인 무서명/위조 응답은 paid를 절대 강등하지
    못한다 — 웹훅은 401, 대사는 paid 유지·원장 무기록."""
    client,db,h,events=setup;i=invoice(client,h)
    monkeypatch.setattr(nicepay,'request',lambda *a: paid(i['id']))
    client.post('/payments/return',data=form(i['id']),follow_redirects=False)
    forged=cancelled(i['id']);forged['signature']='0'*64
    assert client.post('/payments/webhook',json=forged).status_code==401
    monkeypatch.setattr(nicepay,'request',lambda *a: dict(forged))
    r=client.post('/brands/real/billing/invoices/'+i['id']+'/reconcile',headers=h)
    assert r.status_code==200 and r.json()['paid'] is False
    with db() as c:
        assert c.execute('SELECT status FROM signup_invoices').fetchone()['status']=='paid'
    assert events==['INVOICE_PAID']
