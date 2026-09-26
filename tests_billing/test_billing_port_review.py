"""Independent regressions for untrusted PG responses and stale card snapshots."""
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from tests_billing.test_autocharge import (dbname, setup, register, invoice,
    paid_resp, CARD, regist_ok, nicepay_billing, routes)

@pytest.mark.parametrize('response', [{}, {'resultCode':'0000'}, {'status':'paid'},
    {'resultCode':'9999','status':'paid','tid':'unverified'}])
def test_incomplete_approval_cannot_enable_second_manual_charge(setup, monkeypatch, response):
    client, db, h, *_ = setup
    register(client,h,monkeypatch); i=invoice(client,h)
    monkeypatch.setattr(nicepay_billing,'charge',lambda *a: response)
    assert routes.autocharge_tick()['review'] == 1
    assert client.post(f"/brands/real/billing/invoices/{i['id']}/checkout",headers=h).status_code == 409

@pytest.mark.parametrize('bad_field', ['signature','orderId','amount'])
def test_unverified_tid_never_poison_lookup_recovery(setup,monkeypatch,bad_field):
    client,db,h,*_=setup
    register(client,h,monkeypatch); i=invoice(client,h)
    bad=paid_resp(i['id'],tid='wrong-tid')
    bad[bad_field]={'signature':'0'*64,'orderId':'foreign-order','amount':999}[bad_field]
    monkeypatch.setattr(nicepay_billing,'charge',lambda *a: bad)
    routes.autocharge_tick()
    with db() as c:
        assert c.execute('SELECT tid FROM signup_invoices').fetchone()['tid'] is None
    monkeypatch.setattr(nicepay_billing,'find',lambda *a: bad)
    assert client.post(f"/brands/real/billing/invoices/{i['id']}/reconcile",headers=h).json()['paid'] is False
    with db() as c:
        assert c.execute('SELECT tid FROM signup_invoices').fetchone()['tid'] is None
    monkeypatch.setattr(nicepay_billing,'find',lambda *a: paid_resp(i['id'],tid='correct-tid'))
    assert client.post(f"/brands/real/billing/invoices/{i['id']}/reconcile",headers=h).json()['paid'] is True


def test_revocation_after_candidate_scan_prevents_charge(setup,monkeypatch):
    client,db,h,*_=setup
    register(client,h,monkeypatch); invoice(client,h)
    count=0
    @contextmanager
    def after_scan():
        nonlocal count
        count += 1
        with db() as c:
            yield c
        if count == 1:
            with db() as c:
                c.execute("UPDATE brand_billing_keys SET state='expire_pending'")
    monkeypatch.setattr(routes,'connect',after_scan)
    charges=[]
    monkeypatch.setattr(nicepay_billing,'charge',lambda *a: charges.append(a) or {})
    routes.autocharge_tick()
    assert charges == []
    with db() as c:
        assert c.execute('SELECT count(*) n FROM invoice_charge_attempts').fetchone()['n'] == 0


def test_parallel_card_registration_issues_only_one_bid(setup,monkeypatch):
    client,db,h,*_=setup
    entered=Event(); release=Event(); calls=[]
    def slow(*args):
        calls.append(1); entered.set()
        assert release.wait(5)
        return regist_ok()
    monkeypatch.setattr(nicepay_billing,'regist',slow)
    with ThreadPoolExecutor(2) as pool:
        first=pool.submit(client.post,'/brands/real/billing/card',json=CARD,headers=h)
        assert entered.wait(5)
        second=pool.submit(client.post,'/brands/real/billing/card',json=CARD,headers=h)
        release.set()
        assert sorted([first.result().status_code,second.result().status_code]) == [200,409]
    assert calls == [1]


def test_pg_error_cannot_echo_card_data(setup,monkeypatch):
    client,db,h,*_=setup
    monkeypatch.setattr(nicepay_billing,'regist',lambda *a: {
        'resultCode':'1234', 'resultMsg':str(CARD)})
    r=client.post('/brands/real/billing/card',json=CARD,headers=h)
    assert r.status_code == 402
    assert '4111' not in r.text and '900101' not in r.text
