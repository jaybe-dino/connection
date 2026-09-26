"""카드 자동청구(빌링키) — glovek 이식분의 격리 회귀. 실PG/실카드 없음(전부 모사).

동의·테넌트·시크릿 비노출·중복 청구 0·응답 유실 대사·해지 경합·0원 스킵·
현재월 제외·5,000원 월집계, fail-closed 암호화까지 검증한다.
"""
import hashlib
import subprocess
import uuid
from contextlib import contextmanager
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import dict_row
from fastapi import FastAPI
from fastapi.testclient import TestClient
from cryptography.fernet import Fernet

from api import nicepay, nicepay_billing, routes_payments as routes, routes_billing
from api.auth import issue_jwt

ROOT = Path(__file__).resolve().parents[1]
FERNET_KEY = Fernet.generate_key().decode()


@pytest.fixture(scope='module')
def dbname():
    name = 'prlist_auto_' + uuid.uuid4().hex[:12]
    subprocess.run(['createdb', name], check=True)
    for f in ['services/api/tests/sql/signup_billing.sql',
              'db/migrations/011_monthly_invoices.sql',
              'db/migrations/012_signup_price_50.sql']:
        subprocess.run(['psql', '-v', 'ON_ERROR_STOP=1', '-d', name, '-f',
                        str(ROOT / f)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['psql', '-v', 'ON_ERROR_STOP=1', '-d', name, '-c',
        "CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"
        "INSERT INTO schema_migrations (name, applied_at) VALUES ('012_signup_price_50.sql', '2020-01-01');"],
        check=True, stdout=subprocess.DEVNULL)
    for f in ['db/migrations/020_signup_price_5000.sql',
              'db/migrations/022_restore_pre_5000_prices.sql',
              'db/migrations/024_signup_usage_audit.sql',
              'db/migrations/029_invoice_supplements.sql',
              'db/migrations/033_invoice_cancel_marker.sql',
              'db/migrations/034_brand_billing_keys.sql']:
        subprocess.run(['psql', '-v', 'ON_ERROR_STOP=1', '-d', name, '-f',
                        str(ROOT / f)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['psql', '-v', 'ON_ERROR_STOP=1', '-d', name, '-c',
        "INSERT INTO schema_migrations (name) VALUES ('020_signup_price_5000.sql') ON CONFLICT DO NOTHING;"],
        check=True, stdout=subprocess.DEVNULL)
    yield name
    subprocess.run(['dropdb', name], check=True)


@pytest.fixture
def setup(dbname, monkeypatch):
    from api import auth
    monkeypatch.setattr(auth, '_session_epoch', lambda user_id: 0)

    @contextmanager
    def db():
        with psycopg.connect(dbname=dbname, row_factory=dict_row) as conn:
            yield conn
    with db() as conn:
        conn.execute('TRUNCATE invoice_charge_attempts, brand_billing_keys,'
                     ' signup_usage, signup_invoices, memberships, creators,'
                     ' brands CASCADE')
        conn.execute("INSERT INTO brands VALUES ('real',false,'per_signup'),"
                     "('other',false,'per_signup'),('demo1',true,'per_signup')")
        conn.execute("INSERT INTO creators VALUES ('c1',true),('c2',true)")
        conn.execute("UPDATE signup_billing_policy SET effective_at='2020-01-01'")
        conn.execute("INSERT INTO memberships VALUES ('c1','real',now()),"
                     "('c2','real',now())")
        conn.execute("UPDATE signup_usage SET verified_at='2026-01-15'")
    monkeypatch.setattr(routes, 'connect', db)
    monkeypatch.setattr(routes_billing, 'connect', db)
    events = []
    monkeypatch.setattr(routes, 'ledger_append',
                        lambda *args: events.append(args[2]))
    monkeypatch.setenv('NICEPAY_ENABLED', '1')
    monkeypatch.setenv('NICEPAY_CLIENT_KEY', 'test-client')
    monkeypatch.setenv('NICEPAY_SECRET_KEY', 'test-secret-32byte-padding-abcd!')
    monkeypatch.setenv('NICEPAY_BILLING_ENABLED', '1')
    monkeypatch.setenv('NICEPAY_AUTOCHARGE_ENABLED', '1')
    monkeypatch.setenv('TOKEN_ENC_KEY', FERNET_KEY)
    monkeypatch.setenv('JWT_SECRET', 'local-test-key')
    monkeypatch.setenv('AUTH_REQUIRED', '1')
    app = FastAPI()
    app.include_router(routes.router)
    app.include_router(routes_billing.router)
    token = issue_jwt({'kind': 'brand', 'brand_id': 'real', 'sub': 'u1'})
    other = issue_jwt({'kind': 'brand', 'brand_id': 'other', 'sub': 'u2'})
    admin = issue_jwt({'kind': 'admin', 'sub': 'adm'})
    return (TestClient(app), db,
            {'Authorization': 'Bearer ' + token},
            {'Authorization': 'Bearer ' + other},
            {'Authorization': 'Bearer ' + admin}, events)


def signature(text):
    return hashlib.sha256(
        (text + 'test-secret-32byte-padding-abcd!').encode()).hexdigest()


CARD = {'cardNo': '4111-1111-1111-1111', 'expYear': '28', 'expMonth': '12',
        'idNo': '900101', 'cardPw': '12',
        'consent': True, 'consentVersion': 'autocharge-v1'}


def regist_ok(*a, **k):
    return {'resultCode': '0000', 'resultMsg': 'ok', 'bid': 'BIKY-test-1',
            'cardName': '[신한]'}


def paid_resp(iid, amount=10000, tid='auto-tid-1'):
    return {'resultCode': '0000', 'status': 'paid', 'orderId': iid,
            'amount': amount, 'tid': tid, 'ediDate': '2026-02-01',
            'signature': signature(f'{tid}{amount}2026-02-01')}


def invoice(client, h):
    r = client.post('/brands/real/billing/invoices', headers=h)
    assert r.status_code == 200
    return r.json()['invoices'][0]


def register(client, h, monkeypatch):
    monkeypatch.setattr(nicepay_billing, 'regist', regist_ok)
    r = client.post('/brands/real/billing/card', json=CARD, headers=h)
    assert r.status_code == 200 and r.json()['charged'] is False
    return r.json()


# ── 암호화 규격 (공식 encData) ────────────────────────────────────

def test_encdata_aes128_ecb_pkcs7_hex(monkeypatch):
    monkeypatch.setenv('NICEPAY_SECRET_KEY', '2dcc2a0d63bf4694' + 'x' * 16)
    monkeypatch.delenv('NICEPAY_BILLING_ENC_MODE', raising=False)
    out = nicepay_billing.encrypt_card('1234567890123456', '25', '12',
                                       '800101', '12')
    # 공식 매뉴얼 AES-128 예시 벡터와 동일해야 한다
    assert out == ('7c4b12eb43324290bd0e522900a892343f57e0d176cdadae757132c7'
                   'f3cd442f023ef5c3ffa254ed04b6d47624d4c7847e8061f3be0d67ad'
                   'f1b463b46a542052cf47a5206bfd23945fc1851d426468f4')


def test_encdata_a2_aes256_cbc(monkeypatch):
    monkeypatch.setenv('NICEPAY_SECRET_KEY', '2dcc2a0d63bf469490bb19a201be3735')
    monkeypatch.setenv('NICEPAY_BILLING_ENC_MODE', 'A2')
    out = nicepay_billing.encrypt_card('1234567890123456', '25', '12',
                                       '800101', '12')
    assert out == ('6ecfe97e521bc67c3053d74a9dbdba53033d343fc9e8e38e730964b2'
                   '2ef2e4a59607171b00a9da977141b3f79fffa1e80a16c08bc58666b4'
                   '79f554a966a363414347e62f2621f8df220c7a4a545592d0')


# ── 등록: 동의·테넌트·시크릿 비노출·fail-closed ───────────────────

def test_register_requires_explicit_consent(setup, monkeypatch):
    client, db, h, _, _, _ = setup
    calls = []
    monkeypatch.setattr(nicepay_billing, 'regist',
                        lambda *a: calls.append(a) or regist_ok())
    r = client.post('/brands/real/billing/card',
                    json={**CARD, 'consent': False}, headers=h)
    assert r.status_code == 400 and calls == []          # PG 미호출
    r2 = client.post('/brands/real/billing/card',
                     json={k: v for k, v in CARD.items() if k != 'consent'},
                     headers=h)
    assert r2.status_code == 400 and calls == []
    # 어떤 오류 응답에도 카드번호가 반향되지 않는다
    assert '4111' not in r.text and '4111' not in r2.text


def test_register_tenant_and_admin_denied(setup, monkeypatch):
    client, db, h, other, admin, _ = setup
    monkeypatch.setattr(nicepay_billing, 'regist', regist_ok)
    assert client.post('/brands/real/billing/card', json=CARD,
                       headers=other).status_code == 403   # 타 브랜드
    assert client.post('/brands/real/billing/card', json=CARD,
                       headers=admin).status_code == 403   # 관리자 등록 금지
    assert client.post('/brands/real/billing/card',
                       json=CARD).status_code == 401
    # 관리자 조회는 허용
    assert client.get('/brands/real/billing/card',
                      headers=admin).status_code == 200


def test_register_stores_encrypted_bid_and_no_card_data(setup, monkeypatch):
    client, db, h, _, _, events = setup
    out = register(client, h, monkeypatch)
    assert out['cardLabel'] == '[신한]'
    assert '4111' not in str(out) and '900101' not in str(out)
    with db() as c:
        row = c.execute('SELECT * FROM brand_billing_keys').fetchone()
    dump = str(row)
    assert 'BIKY-test-1' not in dump                       # 평문 bid 미저장
    assert '4111' not in dump and '900101' not in dump     # 카드 원문 미저장
    assert nicepay_billing.dec_bid(row['bid_enc']) == 'BIKY-test-1'
    assert row['consent_version'] == 'autocharge-v1'
    assert row['consent_user_id'] == 'u1' and row['consent_at']
    assert 'BILLING_CARD_REGISTERED' in events
    # 중복 등록은 409 (해지 후에만 재등록)
    monkeypatch.setattr(nicepay_billing, 'regist', regist_ok)
    assert client.post('/brands/real/billing/card', json=CARD,
                       headers=h).status_code == 409


def test_register_fail_closed_without_valid_fernet_key(setup, monkeypatch):
    client, db, h, _, _, _ = setup
    calls = []
    monkeypatch.setattr(nicepay_billing, 'regist',
                        lambda *a: calls.append(a) or regist_ok())
    monkeypatch.delenv('TOKEN_ENC_KEY')
    r = client.get('/brands/real/billing/card', headers=h)
    assert r.json()['configured'] is False                 # 입력창 숨김 신호
    assert client.post('/brands/real/billing/card', json=CARD,
                       headers=h).status_code == 503
    monkeypatch.setenv('TOKEN_ENC_KEY', 'not-a-valid-fernet-key')
    assert client.post('/brands/real/billing/card', json=CARD,
                       headers=h).status_code == 503
    assert calls == []                                     # 평문 저장 경로 없음


def test_flags_off_hides_and_blocks(setup, monkeypatch):
    client, db, h, _, _, _ = setup
    monkeypatch.delenv('NICEPAY_BILLING_ENABLED')
    r = client.get('/brands/real/billing/card', headers=h)
    assert r.json()['configured'] is False
    assert client.post('/brands/real/billing/card', json=CARD,
                       headers=h).status_code == 503
    # 수동 결제 경로는 그대로 살아 있다(청구서 생성/조회)
    assert client.post('/brands/real/billing/invoices',
                       headers=h).status_code == 200


# ── 자동청구 tick ────────────────────────────────────────────────

def test_autocharge_paid_once_and_no_duplicate(setup, monkeypatch):
    client, db, h, _, _, events = setup
    register(client, h, monkeypatch)
    i = invoice(client, h)                                 # 2026-01, 10000원
    charges = []

    def charge(bid, order_id, amount, goods):
        assert bid == 'BIKY-test-1' and order_id == i['id'] and amount == 10000
        assert '가입 이용료' in goods
        charges.append(order_id)
        return paid_resp(i['id'])
    monkeypatch.setattr(nicepay_billing, 'charge', charge)
    r1 = routes.autocharge_tick()
    assert r1 == {'scanned': 1, 'paid': 1, 'failed': 0, 'review': 0}
    for _ in range(3):                                     # 반복 tick 중복 0
        assert routes.autocharge_tick()['scanned'] == 0
    assert charges == [i['id']]
    with db() as c:
        inv = c.execute('SELECT status, tid FROM signup_invoices'
                        ' WHERE invoice_id=%s', (i['id'],)).fetchone()
        att = c.execute('SELECT * FROM invoice_charge_attempts').fetchone()
    assert inv['status'] == 'paid' and inv['tid'] == 'auto-tid-1'
    assert att['outcome'] == 'paid' and att['order_date'].isdigit()
    assert events.count('INVOICE_PAID') == 1


def test_autocharge_flag_off_never_charges(setup, monkeypatch):
    client, db, h, _, _, _ = setup
    register(client, h, monkeypatch)
    invoice(client, h)
    monkeypatch.setattr(nicepay_billing, 'charge',
                        lambda *a: (_ for _ in ()).throw(AssertionError('no')))
    monkeypatch.delenv('NICEPAY_AUTOCHARGE_ENABLED')
    assert routes.autocharge_tick()['scanned'] == 0


def test_autocharge_skips_manual_race_and_demo_and_current_month(setup, monkeypatch):
    client, db, h, _, _, _ = setup
    register(client, h, monkeypatch)
    i = invoice(client, h)
    with db() as c:                                        # 수동 결제 선행 모사
        c.execute("UPDATE signup_invoices SET status='processing'"
                  " WHERE invoice_id=%s", (i['id'],))
        # 현재월 open 청구서(비정상 시드)도 절대 청구되지 않는다
        c.execute("INSERT INTO signup_invoices (invoice_id, brand_id, period,"
                  " quantity, amount, seq) VALUES"
                  " ('PRLIST_' || repeat('c', 24), 'real',"
                  "  date_trunc('month', now())::date, 2, 10000, 0)")
    monkeypatch.setattr(nicepay_billing, 'charge',
                        lambda *a: (_ for _ in ()).throw(AssertionError('no')))
    assert routes.autocharge_tick()['scanned'] == 0
    with db() as c:
        assert c.execute('SELECT count(*) n FROM invoice_charge_attempts'
                         ).fetchone()['n'] == 0


def test_autocharge_timeout_goes_review_and_never_reapproves(setup, monkeypatch):
    """응답 유실(타임아웃): review + 영구 attempt(원주문일 보관), 자동 재승인
    금지. find(orderId, orderDate) 대사로 tid를 복구해 paid 확정한다."""
    client, db, h, _, _, events = setup
    register(client, h, monkeypatch)
    i = invoice(client, h)
    calls = []

    def timeout(*a):
        calls.append(a)
        raise nicepay.PaymentUnavailable('timeout')
    monkeypatch.setattr(nicepay_billing, 'charge', timeout)
    r = routes.autocharge_tick()
    assert r['review'] == 1 and len(calls) == 1
    for _ in range(3):                                     # 재승인 절대 금지
        routes.autocharge_tick()
    assert len(calls) == 1
    with db() as c:
        inv = c.execute('SELECT status FROM signup_invoices WHERE invoice_id=%s',
                        (i['id'],)).fetchone()
        att = c.execute('SELECT * FROM invoice_charge_attempts').fetchone()
    assert inv['status'] == 'review'
    assert att['outcome'] == 'review' and len(att['order_date']) == 8
    # 대사: find가 성공 거래를 돌려주면 검증 후 paid 확정
    monkeypatch.setattr(nicepay_billing, 'find',
                        lambda oid, od: paid_resp(i['id']))
    rec = client.post(f"/brands/real/billing/invoices/{i['id']}/reconcile",
                      headers=h)
    assert rec.status_code == 200 and rec.json()['paid'] is True
    with db() as c:
        assert c.execute('SELECT status FROM signup_invoices WHERE invoice_id=%s',
                         (i['id'],)).fetchone()['status'] == 'paid'
        assert c.execute('SELECT outcome FROM invoice_charge_attempts'
                         ).fetchone()['outcome'] == 'paid'


def test_autocharge_decline_requires_reconciliation_without_retry(setup, monkeypatch):
    client, db, h, _, _, events = setup
    register(client, h, monkeypatch)
    i = invoice(client, h)
    calls = []
    monkeypatch.setattr(nicepay_billing, 'charge',
                        lambda *a: calls.append(a) or
                        {'resultCode': '3011', 'resultMsg': '한도초과'})
    assert routes.autocharge_tick()['review'] == 1
    routes.autocharge_tick()
    assert len(calls) == 1                                 # 무한 재시도 금지
    with db() as c:
        inv = c.execute('SELECT status FROM signup_invoices WHERE invoice_id=%s',
                        (i['id'],)).fetchone()
        att = c.execute('SELECT * FROM invoice_charge_attempts').fetchone()
    assert inv['status'] == 'review'                       # 확인 전 재결제 금지
    assert att['outcome'] == 'review' and att['fail_code'] == '3011'
    assert 'INVOICE_AUTOCHARGE_REVIEW' in events
    # 사용자 안내: 카드 상태 응답에 실패 attempt가 노출된다
    got = client.get('/brands/real/billing/card', headers=h).json()
    assert any(a['outcome'] == 'review' for a in got['attempts'])


def test_autocharge_rejects_invalid_signature_response(setup, monkeypatch):
    """0000 + tid여도 서명·금액 검증 실패면 paid로 확정하지 않는다(glovek의
    단순 0000 판정 미복사)."""
    client, db, h, _, _, _ = setup
    register(client, h, monkeypatch)
    i = invoice(client, h)
    bad = paid_resp(i['id'])
    bad['signature'] = '0' * 64
    monkeypatch.setattr(nicepay_billing, 'charge', lambda *a: bad)
    r = routes.autocharge_tick()
    assert r['paid'] == 0 and r['review'] == 1
    with db() as c:
        assert c.execute('SELECT status FROM signup_invoices WHERE invoice_id=%s',
                         (i['id'],)).fetchone()['status'] == 'review'


def test_autocharge_amount_5000_per_signup_monthly_aggregate(setup, monkeypatch):
    """검증가입 2명 → 10,000원 청구서 1장 — 자동청구 금액이 월집계와 일치."""
    client, db, h, _, _, _ = setup
    register(client, h, monkeypatch)
    i = invoice(client, h)
    assert i['quantity'] == 2 and i['amount'] == 10000
    seen = []
    monkeypatch.setattr(nicepay_billing, 'charge',
                        lambda bid, oid, amount, goods:
                        seen.append(amount) or paid_resp(i['id']))
    routes.autocharge_tick()
    assert seen == [10000]


def test_autocharge_skips_below_minimum_amount(setup, monkeypatch):
    """0원/1,000원 미만 청구서는 PG 호출 자체가 없다(카드 최소금액)."""
    client, db, h, _, _, _ = setup
    register(client, h, monkeypatch)
    with db() as c:
        c.execute("ALTER TABLE signup_invoices DROP CONSTRAINT IF EXISTS"
                  " signup_invoices_amount_check")
        c.execute("INSERT INTO signup_invoices (invoice_id, brand_id, period,"
                  " quantity, amount, seq) VALUES"
                  " ('PRLIST_' || repeat('a', 24), 'real', '2025-11-01', 1, 0, 0),"
                  " ('PRLIST_' || repeat('b', 24), 'real', '2025-12-01', 1, 50, 0)")
    monkeypatch.setattr(nicepay_billing, 'charge',
                        lambda *a: (_ for _ in ()).throw(AssertionError('no')))
    assert routes.autocharge_tick()['scanned'] == 0
    with db() as c:                                        # 청구서는 보관 유지
        assert c.execute("SELECT count(*) n FROM signup_invoices"
                         " WHERE status='open' AND amount<1000"
                         ).fetchone()['n'] == 2


def test_cancel_marker_blocks_autocharge(setup, monkeypatch):
    client, db, h, _, _, _ = setup
    register(client, h, monkeypatch)
    i = invoice(client, h)
    with db() as c:
        c.execute("UPDATE signup_invoices SET cancel_reported_at=now()"
                  " WHERE invoice_id=%s", (i['id'],))
    monkeypatch.setattr(nicepay_billing, 'charge',
                        lambda *a: (_ for _ in ()).throw(AssertionError('no')))
    assert routes.autocharge_tick()['scanned'] == 0


# ── 해지 ─────────────────────────────────────────────────────────

def test_expire_stops_charging_immediately_and_retries_safely(setup, monkeypatch):
    client, db, h, other, _, events = setup
    register(client, h, monkeypatch)
    i = invoice(client, h)
    # 타 브랜드/관리자는 해지 불가
    assert client.delete('/brands/real/billing/card',
                         headers=other).status_code == 403
    # 1차 해지: PG 통신 실패 — 그래도 로컬 자동청구는 즉시 중단
    monkeypatch.setattr(nicepay_billing, 'expire',
                        lambda *a: (_ for _ in ()).throw(
                            nicepay.PaymentUnavailable('down')))
    r1 = client.delete('/brands/real/billing/card', headers=h)
    assert r1.status_code == 200 and r1.json()['state'] == 'expire_pending'
    monkeypatch.setattr(nicepay_billing, 'charge',
                        lambda *a: (_ for _ in ()).throw(AssertionError('no')))
    assert routes.autocharge_tick()['scanned'] == 0        # 청구 즉시 중단
    # 2차 해지(재시도): PG 성공 → expired, bid 제거
    expired = []
    monkeypatch.setattr(nicepay_billing, 'expire',
                        lambda bid, oid: expired.append(bid) or
                        {'resultCode': '0000'})
    r2 = client.delete('/brands/real/billing/card', headers=h)
    assert r2.json()['state'] == 'expired' and expired == ['BIKY-test-1']
    with db() as c:
        row = c.execute('SELECT state, bid_enc FROM brand_billing_keys'
                        ).fetchone()
        n_open = c.execute("SELECT count(*) n FROM signup_invoices"
                           " WHERE status='open'").fetchone()['n']
    assert row['state'] == 'expired' and row['bid_enc'] == ''
    assert n_open >= 1                                     # 미청구 invoice 유지
    assert 'BILLING_CARD_EXPIRED' in events
    # 멱등: 다시 눌러도 안전
    assert client.delete('/brands/real/billing/card',
                         headers=h).json()['state'] == 'expired'
    # 해지 후 새 카드 재등록 가능
    monkeypatch.setattr(nicepay_billing, 'regist', regist_ok)
    assert client.post('/brands/real/billing/card', json=CARD,
                       headers=h).status_code == 200
