"""A delayed paid response must not undo an authenticated cancellation notice."""
from tests_billing.test_payments import dbname, setup, invoice, paid, form
from api import nicepay, routes_payments as routes


def test_delayed_paid_response_cannot_restore_cancelled_invoice(setup, monkeypatch):
    client, db, headers, events = setup
    row = invoice(client, headers)
    initial = paid(row['id'])
    monkeypatch.setattr(nicepay, 'request', lambda *args: initial)
    client.post('/payments/return', data=form(row['id']), follow_redirects=False)
    cancellation = {**initial, 'status': 'cancelled', 'balanceAmt': 0}
    assert routes.settle('test-tid', row['id'], cancellation) is False
    with db() as conn:
        before = conn.execute('SELECT status,paid_at FROM signup_invoices WHERE invoice_id=%s',
                              (row['id'],)).fetchone()
    assert before['status'] == 'review'
    assert before['paid_at'] is not None

    # Simulate an approval lookup started before the cancellation, finishing later.
    assert routes.settle('test-tid', row['id'], initial) is False
    assert routes.settle('test-tid', row['id'], cancellation) is False
    with db() as conn:
        after = conn.execute('SELECT status,paid_at FROM signup_invoices WHERE invoice_id=%s',
                             (row['id'],)).fetchone()
    assert after == before
    assert events.count('INVOICE_PAID') == 1
    assert events.count('INVOICE_CANCEL_REPORTED') == 1


def test_cancellation_before_approval_response_stays_in_review(setup):
    client, db, headers, events = setup
    row = invoice(client, headers)
    with db() as conn:
        conn.execute("UPDATE signup_invoices SET status='processing',tid='test-tid' WHERE invoice_id=%s", (row['id'],))
    initial = paid(row['id'])
    cancellation = {**initial, 'status': 'partialCancelled', 'balanceAmt': 5000}
    assert routes.settle('test-tid', row['id'], cancellation) is False
    assert routes.settle('test-tid', row['id'], initial) is False
    with db() as conn:
        after = conn.execute('SELECT status,paid_at,cancel_reported_at FROM signup_invoices WHERE invoice_id=%s', (row['id'],)).fetchone()
    assert after['status'] == 'review'
    assert after['paid_at'] is None
    assert after['cancel_reported_at'] is not None
    assert events == ['INVOICE_CANCEL_REPORTED']
