"""Monthly arrears invoices. A customer confirms each NICEpay card payment."""
import os
import re
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from pydantic import BaseModel, Field

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
            'quantity': row['quantity'], 'amount': row['amount'], 'status': row['status'],
            'seq': row['seq'], 'supplement': row['seq'] > 0,
            'cardPayable': row['amount'] >= 1000}


def close_months(conn, brand):
    """Lazy month close; only completed Asia/Seoul months. No charges here."""
    conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))', ('billing:' + brand,))
    cutoff = datetime.now(ZoneInfo('Asia/Seoul')).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # 단가 감사 미해결 행은 산입 제외 — 사람이 확정하기 전엔 청구하지 않는다.
    audit_filter = ("AND NOT EXISTS (SELECT 1 FROM signup_usage_audit a "
                    "WHERE a.usage_id=signup_usage.usage_id AND a.resolved_at IS NULL) ")
    groups = conn.execute(
        "SELECT date_trunc('month', verified_at AT TIME ZONE 'Asia/Seoul')::date AS period, "
        "count(*) AS quantity, sum(unit_price) AS amount FROM signup_usage WHERE brand_id=%s AND invoice_id IS NULL "
        "AND verified_at < %s " + audit_filter + "GROUP BY 1 ORDER BY 1", (brand, cutoff)).fetchall()
    for group in groups:
        # 같은 월에 이미 발행분이 있으면(감사 보류 후 확정 등) 기존 청구서는
        # 절대 수정하지 않고 '추가 청구'(seq>0)로 발행한다. brand 단위
        # advisory lock 아래라 max(seq) 경쟁이 없고, 사용량 행에 invoice_id를
        # 같은 트랜잭션에서 채우므로 반복 호출에도 중복 청구가 없다.
        seq = conn.execute(
            'SELECT COALESCE(MAX(seq),-1)+1 AS s FROM signup_invoices '
            'WHERE brand_id=%s AND period=%s',
            (brand, group['period'])).fetchone()['s']
        iid = 'PRLIST_' + uuid.uuid4().hex[:24]
        conn.execute('INSERT INTO signup_invoices(invoice_id,brand_id,period,quantity,amount,seq) '
                     'VALUES(%s,%s,%s,%s,%s,%s)',
                     (iid, brand, group['period'], group['quantity'], group['amount'], seq))
        conn.execute("UPDATE signup_usage SET invoice_id=%s WHERE brand_id=%s AND invoice_id IS NULL "
                     "AND date_trunc('month',verified_at AT TIME ZONE 'Asia/Seoul')::date=%s "
                     + audit_filter,
                     (iid, brand, group['period']))
        if seq > 0:
            ledger_append(conn, 'system', 'INVOICE_SUPPLEMENT_CREATED', iid,
                          {'brand': brand,
                           'period': group['period'].strftime('%Y-%m'),
                           'quantity': group['quantity'],
                           'amount': group['amount'], 'seq': seq})


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
    if row['amount'] < 1000:
        raise HTTPException(409, '카드 결제 최소 금액은 1,000원입니다. 청구 내역은 보관됩니다.')
    if row['status'] != 'open':
        raise HTTPException(409, '이미 처리 중이거나 결제된 청구서입니다')
    return {'clientId': nicepay.client_key(), 'method': 'card', 'orderId': invoice_id,
            'amount': row['amount'],
            'goodsName': ('theprlist ' + row['period'].strftime('%Y-%m') + ' 가입 이용료'
                          + (' 추가분' if row['seq'] else '')),
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


# ── 단가 감사 큐 (어드민) — 자동 변경 금지, 증거 확인 후 수동 확정 ──

def _require_admin_like(authorization: str, x_admin_key: str) -> str:
    from . import auth as _auth
    u = _auth.current_user(authorization)
    if u and u.get('kind') == 'admin' and u.get('otp') != 'pending':
        return str(u.get('sub'))
    if not _auth.auth_required():
        required = os.environ.get('ADMIN_KEY', '')
        if not required or x_admin_key == required:
            return 'legacy-key'
    raise HTTPException(401, '어드민 권한이 필요합니다')


@router.get('/admin/usage-audit')
def usage_audit_list(authorization: str = Header(default=''),
                     x_admin_key: str = Header(default='')):
    _require_admin_like(authorization, x_admin_key)
    with connect() as conn:
        rows = conn.execute(
            'SELECT a.usage_id, a.reason, a.price_at_flag, a.created_at,'
            '       u.brand_id, u.creator_id, u.verified_at, u.unit_price'
            ' FROM signup_usage_audit a JOIN signup_usage u USING (usage_id)'
            ' WHERE a.resolved_at IS NULL ORDER BY u.verified_at').fetchall()
    return [{'usageId': r['usage_id'], 'brandId': r['brand_id'],
             'creatorId': r['creator_id'],
             'verifiedAt': r['verified_at'].isoformat(),
             'currentPrice': r['unit_price'], 'reason': r['reason']}
            for r in rows]


class AuditResolve(BaseModel):
    unit_price: int = Field(ge=0)
    evidence: str = Field(min_length=5, max_length=1000)


@router.post('/admin/usage-audit/{usage_id}/resolve')
def usage_audit_resolve(usage_id: int, body: AuditResolve,
                        authorization: str = Header(default=''),
                        x_admin_key: str = Header(default='')):
    actor = _require_admin_like(authorization, x_admin_key)
    with connect() as conn:
        a = conn.execute(
            'SELECT * FROM signup_usage_audit WHERE usage_id=%s'
            ' AND resolved_at IS NULL FOR UPDATE', (usage_id,)).fetchone()
        if not a:
            raise HTTPException(404, '미해결 감사 항목이 없습니다')
        u = conn.execute('SELECT invoice_id FROM signup_usage WHERE usage_id=%s'
                         ' FOR UPDATE', (usage_id,)).fetchone()
        if u['invoice_id']:
            raise HTTPException(409, '이미 청구된 행은 변경할 수 없습니다')
        conn.execute('UPDATE signup_usage SET unit_price=%s WHERE usage_id=%s',
                     (body.unit_price, usage_id))
        conn.execute('UPDATE signup_usage_audit SET resolved_at=now(),'
                     ' resolved_price=%s, resolved_by=%s WHERE usage_id=%s',
                     (body.unit_price, actor, usage_id))
        ledger_append(conn, f'admin:{actor}', 'USAGE_PRICE_RESOLVED',
                      str(usage_id), {'unitPrice': body.unit_price,
                                      'evidence': body.evidence[:500]})
    return {'resolved': True, 'usageId': usage_id,
            'unitPrice': body.unit_price}
