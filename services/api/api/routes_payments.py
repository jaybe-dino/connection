"""Monthly arrears invoices. A customer confirms each NICEpay card payment."""
import re
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from . import nicepay
from .auth import current_user, require_brand
from .db import connect, ledger_append

router = APIRouter()
RESULT_URL = 'https://console.theprlist.net/?payment='
RETURN_URL = 'https://api.theprlist.net/payments/return'


def guard(brand, authorization, key):
    user = current_user(authorization)
    if not user:
        raise HTTPException(401, '로그인 후 결제 내역을 확인하세요')
    if user.get('otp') == 'pending':
        raise HTTPException(401, '2단계 인증을 완료하세요')
    require_brand(brand, authorization, key)


def invoice_out(row):
    return {'id': row['invoice_id'], 'period': row['period'].strftime('%Y-%m'),
            'quantity': row['quantity'], 'amount': row['amount'], 'status': row['status']}


def close_months(conn, brand):
    """Lazy month close; only completed Asia/Seoul months. No charges here."""
    conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))', ('billing:' + brand,))
    cutoff = datetime.now(ZoneInfo('Asia/Seoul')).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    groups = conn.execute(
        "SELECT date_trunc('month', verified_at AT TIME ZONE 'Asia/Seoul')::date AS period, "
        "count(*) AS quantity FROM signup_usage WHERE brand_id=%s AND invoice_id IS NULL "
        "AND verified_at < %s GROUP BY 1 ORDER BY 1", (brand, cutoff)).fetchall()
    for group in groups:
        iid = 'PRLIST_' + uuid.uuid4().hex[:24]
        conn.execute('INSERT INTO signup_invoices(invoice_id,brand_id,period,quantity,amount) '
                     'VALUES(%s,%s,%s,%s,%s)',
                     (iid, brand, group['period'], group['quantity'], group['quantity'] * 5000))
        conn.execute("UPDATE signup_usage SET invoice_id=%s WHERE brand_id=%s AND invoice_id IS NULL "
                     "AND date_trunc('month',verified_at AT TIME ZONE 'Asia/Seoul')::date=%s",
                     (iid, brand, group['period']))


@router.post('/brands/{brand_id}/billing/invoices')
def invoices(brand_id: str, authorization: str = Header(default=''),
             x_admin_key: str = Header(default='')):
    guard(brand_id, authorization, x_admin_key)
    with connect() as conn:
        brand = conn.execute('SELECT is_demo FROM brands WHERE brand_id=%s', (brand_id,)).fetchone()
        if not brand:
            raise HTTPException(404, '브랜드 없음')
        if not brand['is_demo']:
            close_months(conn, brand_id)
        rows = conn.execute('SELECT * FROM signup_invoices WHERE brand_id=%s ORDER BY period DESC',
                            (brand_id,)).fetchall()
    return {'invoices': [invoice_out(row) for row in rows], 'configured': nicepay.configured()}


@router.post('/brands/{brand_id}/billing/invoices/{invoice_id}/checkout')
def checkout(brand_id: str, invoice_id: str, authorization: str = Header(default=''),
             x_admin_key: str = Header(default='')):
    guard(brand_id, authorization, x_admin_key)
    if not nicepay.configured():
        raise HTTPException(503, '결제사 설정 중입니다. 이용 내역은 보관됩니다.')
    with connect() as conn:
        row = conn.execute('SELECT i.*, b.is_demo FROM signup_invoices i JOIN brands b USING(brand_id) '
                           'WHERE invoice_id=%s AND brand_id=%s', (invoice_id, brand_id)).fetchone()
    if not row or row['is_demo']:
        raise HTTPException(404, '결제할 청구서 없음')
    if row['status'] != 'open':
        raise HTTPException(409, '이미 처리 중이거나 결제된 청구서입니다')
    return {'clientId': nicepay.client_key(), 'method': 'card', 'orderId': invoice_id,
            'amount': row['amount'], 'goodsName': 'The PR List ' + row['period'].strftime('%Y-%m') + ' 가입 이용료',
            'returnUrl': RETURN_URL}


def settle(tid, invoice_id, data):
    with connect() as conn:
        row = conn.execute('SELECT * FROM signup_invoices WHERE invoice_id=%s FOR UPDATE',
                           (invoice_id,)).fetchone()
        if not row or row['tid'] != tid:
            return False
        if not nicepay.payment_valid(data, invoice_id, row['amount'], tid):
            conn.execute("UPDATE signup_invoices SET status='review' WHERE invoice_id=%s AND status<>'paid'", (invoice_id,))
            return False
        if row['status'] != 'paid':
            conn.execute("UPDATE signup_invoices SET status='paid',paid_at=now() WHERE invoice_id=%s", (invoice_id,))
            ledger_append(conn, 'nicepay', 'INVOICE_PAID', invoice_id,
                          {'brand': row['brand_id'], 'amount': row['amount'], 'tid': tid})
    return True


@router.post('/payments/return')
async def payment_return(request: Request):
    if not nicepay.configured():
        return RedirectResponse(RESULT_URL + 'unavailable', status_code=303)
    form = dict(await request.form())
    tid, iid = str(form.get('tid', '')), str(form.get('orderId', ''))
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', tid) or not re.fullmatch(r'PRLIST_[a-f0-9]{24}', iid):
        return RedirectResponse(RESULT_URL + 'invalid', status_code=303)
    with connect() as conn:
        row = conn.execute('SELECT * FROM signup_invoices WHERE invoice_id=%s FOR UPDATE', (iid,)).fetchone()
        if not row or not nicepay.auth_valid(form, row['amount']):
            return RedirectResponse(RESULT_URL + 'invalid', status_code=303)
        if row['status'] == 'paid':
            return RedirectResponse(RESULT_URL + 'success', status_code=303)
        if row['status'] != 'open':
            return RedirectResponse(RESULT_URL + 'review', status_code=303)
        # Commit before external approval. A timeout cannot trigger a second approval.
        conn.execute("UPDATE signup_invoices SET status='processing',tid=%s WHERE invoice_id=%s", (tid, iid))
    try:
        # Bind PG transaction to its original invoice before capturing money.
        original = nicepay.request('GET', tid)
        if original.get('orderId') != iid or original.get('amount') != row['amount']:
            raise nicepay.PaymentUnavailable('Order mismatch')
        result = nicepay.request('POST', tid, row['amount'])
        status = 'success' if settle(tid, iid, result) else 'review'
    except nicepay.PaymentUnavailable:
        status = 'review'
    return RedirectResponse(RESULT_URL + status, status_code=303)


@router.post('/payments/webhook')
async def payment_webhook(request: Request):
    if not nicepay.configured():
        raise HTTPException(503, 'Payments unavailable')
    try:
        data = await request.json()
    except ValueError:
        raise HTTPException(400, 'Invalid JSON')
    if not isinstance(data, dict):
        raise HTTPException(400, 'Invalid event')
    tid, iid = data.get('tid'), data.get('orderId')
    if not isinstance(tid, str) or not isinstance(iid, str):
        raise HTTPException(400, 'Invalid transaction')
    # The merchant also serves other apps. Acknowledge their events and NICEpay's
    # registration samples without any database access or payment processing.
    if not iid.startswith('PRLIST_'):
        return HTMLResponse('OK')
    # Signed event plus authenticated PG lookup, never trust a status alone.
    if not nicepay._signature([tid, data.get('amount'), data.get('ediDate')], data.get('signature')):
        raise HTTPException(401, 'Invalid signature')
    try:
        confirmed = nicepay.request('GET', tid)
    except nicepay.PaymentUnavailable:
        raise HTTPException(503, 'Retry later')
    if not settle(tid, iid, confirmed):
        raise HTTPException(409, 'Requires reconciliation')
    return HTMLResponse('OK')


@router.post('/brands/{brand_id}/billing/invoices/{invoice_id}/reconcile')
def reconcile(brand_id: str, invoice_id: str, authorization: str = Header(default=''),
              x_admin_key: str = Header(default='')):
    guard(brand_id, authorization, x_admin_key)
    with connect() as conn:
        row = conn.execute('SELECT * FROM signup_invoices WHERE brand_id=%s AND invoice_id=%s',
                           (brand_id, invoice_id)).fetchone()
    if not row or not row['tid']:
        raise HTTPException(404, '확인할 거래 없음')
    try:
        data = nicepay.request('GET', row['tid'])
    except nicepay.PaymentUnavailable:
        raise HTTPException(503, 'PG 거래 조회를 완료하지 못했습니다')
    return {'paid': settle(row['tid'], invoice_id, data)}
