"""Monthly arrears invoices. A customer confirms each NICEpay card payment."""
import os
import re
import uuid
from contextlib import contextmanager
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from starlette.concurrency import run_in_threadpool

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


# 단가 감사 미해결 행은 산입 제외 — 사람이 확정하기 전엔 청구하지 않는다.
AUDIT_FILTER = ("AND NOT EXISTS (SELECT 1 FROM signup_usage_audit a "
                "WHERE a.usage_id=signup_usage.usage_id AND a.resolved_at IS NULL) ")


def billing_lock(conn, brand):
    """브랜드 과금 직렬화 잠금 — 월마감과 가격 확정(resolve)이 같은 잠금을
    같은 순서(advisory → 행)로 잡아 스냅샷 불일치·교착을 막는다."""
    conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',
                 ('billing:' + brand,))


def _collect_billable(conn, brand, cutoff):
    """청구 대상 행을 FOR UPDATE로 잠가서 가져온다. 이후의 청구서 발행·연결은
    정확히 이 usage_id들에만 적용된다(집계-연결 사이 경합 유입 차단)."""
    return conn.execute(
        "SELECT usage_id, unit_price,"
        " date_trunc('month', verified_at AT TIME ZONE 'Asia/Seoul')::date AS period"
        " FROM signup_usage WHERE brand_id=%s AND invoice_id IS NULL"
        " AND verified_at < %s " + AUDIT_FILTER +
        "ORDER BY usage_id FOR UPDATE", (brand, cutoff)).fetchall()


def close_months(conn, brand):
    """Lazy month close; only completed Asia/Seoul months. No charges here."""
    billing_lock(conn, brand)
    cutoff = datetime.now(ZoneInfo('Asia/Seoul')).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    rows = _collect_billable(conn, brand, cutoff)
    by_month: dict = {}
    for r in rows:
        by_month.setdefault(r['period'], []).append(r)
    for period in sorted(by_month):
        month_rows = by_month[period]
        quantity, amount = len(month_rows), sum(r['unit_price'] for r in month_rows)
        # 같은 월에 이미 발행분이 있으면(감사 보류 후 확정 등) 기존 청구서는
        # 절대 수정하지 않고 '추가 청구'(seq>0)로 발행한다. billing_lock
        # 아래라 max(seq) 경쟁이 없다.
        seq = conn.execute(
            'SELECT COALESCE(MAX(seq),-1)+1 AS s FROM signup_invoices '
            'WHERE brand_id=%s AND period=%s', (brand, period)).fetchone()['s']
        iid = 'PRLIST_' + uuid.uuid4().hex[:24]
        conn.execute('INSERT INTO signup_invoices(invoice_id,brand_id,period,quantity,amount,seq) '
                     'VALUES(%s,%s,%s,%s,%s,%s)',
                     (iid, brand, period, quantity, amount, seq))
        # 조건 재평가가 아니라 집계에 포함된 바로 그 행들만 연결한다 —
        # 청구서 금액과 연결 사용량 합계가 항상 일치한다.
        conn.execute('UPDATE signup_usage SET invoice_id=%s WHERE usage_id = ANY(%s)',
                     (iid, [r['usage_id'] for r in month_rows]))
        if seq > 0:
            ledger_append(conn, 'system', 'INVOICE_SUPPLEMENT_CREATED', iid,
                          {'brand': brand, 'period': period.strftime('%Y-%m'),
                           'quantity': quantity, 'amount': amount, 'seq': seq})


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


def _bind_verified_tid(invoice_id, data):
    """Bind only a verified response; malformed find results must remain recoverable."""
    tid = data.get('tid')
    if not isinstance(tid, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', tid):
        return None
    with connect() as conn:
        row = conn.execute('SELECT * FROM signup_invoices WHERE invoice_id=%s FOR UPDATE',
                           (invoice_id,)).fetchone()
        if not row or (row['tid'] and row['tid'] != tid):
            return None
        valid = nicepay.payment_valid(data, invoice_id, row['amount'], tid)
        cancelled = (type(data.get('amount')) is int and data['amount'] == row['amount']
                     and nicepay.cancellation_reported(data, invoice_id, tid))
        if not (valid or cancelled):
            return None
        if not row['tid']:
            if row['status'] not in ('processing', 'review'):
                return None
            conn.execute('UPDATE signup_invoices SET tid=%s WHERE invoice_id=%s',
                         (tid, invoice_id))
    return tid


def settle(tid, invoice_id, data):
    with connect() as conn:
        row = conn.execute('SELECT * FROM signup_invoices WHERE invoice_id=%s FOR UPDATE',
                           (invoice_id,)).fetchone()
        if not row or row['tid'] != tid:
            return False
        if not nicepay.payment_valid(data, invoice_id, row['amount'], tid):
            if nicepay.cancellation_reported(data, invoice_id, tid):
                # Signed cancel notice: a paid invoice must not stay 'paid'.
                # Move to review for human confirmation; we never call any
                # refund API, and repeated notices record the ledger once.
                moved = conn.execute(
                    "UPDATE signup_invoices SET status='review',cancel_reported_at=now()"
                    " WHERE invoice_id=%s AND cancel_reported_at IS NULL"
                    " RETURNING invoice_id", (invoice_id,)).fetchone()
                if moved:
                    ledger_append(conn, 'nicepay', 'INVOICE_CANCEL_REPORTED',
                                  invoice_id,
                                  {'brand': row['brand_id'], 'tid': tid,
                                   'pgStatus': data.get('status'),
                                   'cancelledAmt': data.get('cancelledAmt')})
                return False
            # Unverified mismatch never demotes a paid invoice.
            conn.execute("UPDATE signup_invoices SET status='review' WHERE invoice_id=%s AND status<>'paid'", (invoice_id,))
            return False
        # A delayed approval/status response cannot undo a signed cancellation.
        # Keep the invoice in review, including when cancellation arrived first.
        if row['cancel_reported_at'] is not None:
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
        attempt = conn.execute(
            'SELECT * FROM invoice_charge_attempts WHERE invoice_id=%s',
            (invoice_id,)).fetchone() if row else None
    if not row or (not row['tid'] and not attempt):
        raise HTTPException(404, '확인할 거래 없음')
    try:
        if row['tid']:
            data = nicepay.request('GET', row['tid'])
        else:
            # 자동청구 승인 응답 유실(tid 미확보) — 영구 attempt에 보관한
            # 원주문일로 orderId 거래조회(find) 후 대사한다.
            data = nicepay_billing.find(attempt['order_id'],
                                        attempt['order_date'])
    except nicepay.PaymentUnavailable:
        raise HTTPException(503, 'PG 거래 조회를 완료하지 못했습니다')
    tid = row['tid'] or _bind_verified_tid(invoice_id, data)
    if not tid:
        return {'paid': False, 'hint': '승인 여부를 확인하지 못했습니다. 거래 확인이 필요합니다.'}
    paid = settle(tid, invoice_id, data)
    if attempt and paid:
        with connect() as conn:
            conn.execute("UPDATE invoice_charge_attempts SET outcome='paid',"
                         " finished_at=COALESCE(finished_at, now())"
                         " WHERE invoice_id=%s AND outcome<>'paid'",
                         (invoice_id,))
    return {'paid': paid}


# ── 카드 자동청구 (빌링키) — glovek service2 설계 이식, 후불 청구서 전용 ──
#
# theprlist에는 정액 플랜/무료체험/첫달 즉시청구가 없다: 등록 시 청구 0원,
# 기존 달력월 후불 청구서(open)의 금액만 등록 카드로 자동 청구한다.
# 수동 카드 결제(checkout/payments/return)는 그대로 유지되며 독립 동작한다.

from . import nicepay_billing  # noqa: E402  (아래 표면 전용)

CONSENT_VERSION = 'autocharge-v1'
CONSENT_TEXT = ('월별 청구서 금액(검증 가입 건당 5,000원 · VAT 포함 · 고정료 0원)을 '
                '등록한 카드로 자동 결제하는 데 동의합니다. 카드 등록 시에는 결제가 '
                '발생하지 않으며, 언제든 해지할 수 있습니다.')


@contextmanager
def _card_operation(brand_id):
    """Serialize card registration/revocation/charge across processes.

    Separate from invoice locks: the lock connection holds no invoice rows.
    An already submitted charge may finish before revocation, never after a
    completed revocation. PostgreSQL releases this lock if the worker dies.
    """
    with connect() as lock:
        lock.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                     ('billing-card:' + brand_id,))
        yield


def _brand_owner(brand_id: str, authorization: str) -> dict:
    """카드 등록/해지는 브랜드 소유 계정 본인만 — 관리자·admin key로도 불가."""
    u = current_user(authorization)
    if not u:
        raise HTTPException(401, '로그인이 필요합니다')
    if u.get('otp') == 'pending':
        raise HTTPException(401, '2단계 인증을 완료하세요')
    if u.get('kind') != 'brand' or u.get('brand_id') != brand_id:
        raise HTTPException(403, '카드 등록/해지는 브랜드 소유 계정만 할 수 있습니다')
    return u


@router.get('/brands/{brand_id}/billing/card')
def billing_card_status(brand_id: str, authorization: str = Header(default=''),
                        x_admin_key: str = Header(default='')):
    guard(brand_id, authorization, x_admin_key)   # 조회는 관리자도 가능
    out = {'configured': nicepay_billing.billing_enabled()
                         and nicepay_billing.crypto_ready(),
           'autochargeFlag': nicepay_billing.autocharge_enabled(),
           'consentVersion': CONSENT_VERSION, 'consentText': CONSENT_TEXT,
           'card': None, 'attempts': []}
    with connect() as conn:
        row = conn.execute('SELECT * FROM brand_billing_keys WHERE brand_id=%s',
                           (brand_id,)).fetchone()
        if row:
            out['card'] = {
                'state': row['state'], 'cardLabel': row['card_label'],
                'consentVersion': row['consent_version'],
                'consentAt': row['consent_at'].isoformat(),
                'expireRequestedAt': (row['expire_requested_at'].isoformat()
                                      if row['expire_requested_at'] else None)}
        out['attempts'] = [
            {'invoiceId': a['invoice_id'], 'outcome': a['outcome'],
             'failMsg': a['fail_msg'],
             'finishedAt': (a['finished_at'].isoformat()
                            if a['finished_at'] else None)}
            for a in conn.execute(
                'SELECT * FROM invoice_charge_attempts WHERE brand_id=%s'
                ' ORDER BY started_at DESC LIMIT 12', (brand_id,)).fetchall()]
    return out


@router.post('/brands/{brand_id}/billing/card')
async def billing_card_register(brand_id: str, request: Request,
                                authorization: str = Header(default='')):
    """카드 등록 → 빌키 발급. 등록 시 청구 없음(glovek의 첫달 즉시청구 미이식).

    카드 원문은 encData 생성에만 쓰고 저장·로깅하지 않는다. pydantic 검증을
    쓰지 않고 직접 파싱하는 이유: 422 자동 응답이 입력 원문(카드번호)을
    되돌려주는 것을 원천 차단하기 위해서다."""
    u = _brand_owner(brand_id, authorization)
    if not nicepay_billing.billing_enabled():
        raise HTTPException(503, '자동청구 준비 중입니다 — 청구서 수동 카드 결제는'
                                 ' 계속 이용할 수 있습니다.')
    if not nicepay_billing.crypto_ready():
        raise HTTPException(503, '보안 저장 설정이 완료되지 않아 카드를 등록할 수'
                                 ' 없습니다. 운영팀에 문의해 주세요.')
    try:
        body = await request.json()
        if not isinstance(body, dict):
            raise ValueError()
    except Exception:
        raise HTTPException(400, '요청 형식을 확인해 주세요')
    return await run_in_threadpool(_register_card, brand_id, body, u)


def _register_card(brand_id, body, u):
    with _card_operation(brand_id):
        return _register_card_locked(brand_id, body, u)


def _register_card_locked(brand_id, body, u):
    if body.get('consent') is not True \
            or body.get('consentVersion') != CONSENT_VERSION:
        raise HTTPException(400, '자동청구 동의(체크박스) 확인이 필요합니다')
    card_no = re.sub(r'\D', '', str(body.get('cardNo', '')))
    exp_year = str(body.get('expYear', '')).strip()
    exp_month = str(body.get('expMonth', '')).strip()
    id_no = re.sub(r'\D', '', str(body.get('idNo', '')))
    card_pw = str(body.get('cardPw', '')).strip()
    if (not 15 <= len(card_no) <= 16 or not re.fullmatch(r'\d{2}', exp_year)
            or not re.fullmatch(r'0[1-9]|1[0-2]', exp_month)
            or len(id_no) not in (6, 10)
            or not re.fullmatch(r'\d{2}', card_pw)):
        raise HTTPException(400, '카드 정보를 확인해 주세요 — 카드번호, 유효기간'
                                 ' YY/MM, 생년월일 6자리(법인은 사업자번호 10자리),'
                                 ' 카드 비밀번호 앞 2자리.')
    with connect() as conn:
        existing = conn.execute('SELECT state FROM brand_billing_keys'
                                ' WHERE brand_id=%s', (brand_id,)).fetchone()
    if existing and existing['state'] != 'expired':
        raise HTTPException(409, '이미 등록된 카드가 있습니다 — 해지 후 새 카드를'
                                 ' 등록해 주세요.')
    enc_data = nicepay_billing.encrypt_card(card_no, exp_year, exp_month,
                                            id_no, card_pw)
    del card_no, id_no, card_pw               # 원문 참조 제거 — 이후 사용 금지
    order_id = 'BIDREG_' + uuid.uuid4().hex[:24]
    try:
        r = nicepay_billing.regist(enc_data, order_id)
    except nicepay.PaymentUnavailable:
        raise HTTPException(502, '결제사 통신에 실패했습니다 — 잠시 후 다시 시도해'
                                 ' 주세요. 등록 시 결제는 발생하지 않습니다.')
    bid = str(r.get('bid') or r.get('BID') or '')
    if r.get('resultCode') != '0000' or not bid:
        raise HTTPException(402, '카드 등록에 실패했습니다. 카드 정보와 이용 가능 여부를 확인해 주세요.')
    label = str(r.get('cardName') or r.get('CardName') or '등록 카드')[:40]
    if not re.fullmatch(r'[가-힣A-Za-z \[\]()-]{1,40}', label):
        label = '등록 카드'
    with connect() as conn:
        conn.execute(
            "INSERT INTO brand_billing_keys (brand_id, bid_enc, card_label,"
            " state, consent_version, consent_at, consent_user_id)"
            " VALUES (%s,%s,%s,'active',%s,now(),%s)"
            " ON CONFLICT (brand_id) DO UPDATE SET bid_enc=EXCLUDED.bid_enc,"
            " card_label=EXCLUDED.card_label, state='active',"
            " consent_version=EXCLUDED.consent_version, consent_at=now(),"
            " consent_user_id=EXCLUDED.consent_user_id,"
            " expire_requested_at=NULL, updated_at=now()",
            (brand_id, nicepay_billing.enc_bid(bid), label,
             CONSENT_VERSION, str(u.get('sub', ''))))
        ledger_append(conn, f'brand:{brand_id}', 'BILLING_CARD_REGISTERED',
                      brand_id, {'cardLabel': label,
                                 'consentVersion': CONSENT_VERSION,
                                 'by': str(u.get('sub', ''))})
    return {'ok': True, 'cardLabel': label, 'state': 'active',
            'charged': False}


@router.delete('/brands/{brand_id}/billing/card')
def billing_card_expire(brand_id: str,
                        authorization: str = Header(default='')):
    """해지 — 로컬 자동청구를 즉시 중단(expire_pending 커밋)한 뒤 PG 빌키를
    삭제한다. PG 삭제가 실패해도 청구는 이미 멈춰 있고, 같은 요청으로 안전하게
    재시도한다. 미결제 청구서는 그대로 유지된다."""
    u = _brand_owner(brand_id, authorization)
    with _card_operation(brand_id):
        return _expire_card_locked(brand_id, u)


def _expire_card_locked(brand_id, u):
    with connect() as conn:
        row = conn.execute('SELECT * FROM brand_billing_keys WHERE brand_id=%s'
                           ' FOR UPDATE', (brand_id,)).fetchone()
        if not row:
            raise HTTPException(404, '등록된 카드가 없습니다')
        if row['state'] == 'expired':
            return {'ok': True, 'state': 'expired'}
        conn.execute("UPDATE brand_billing_keys SET state='expire_pending',"
                     " expire_requested_at=COALESCE(expire_requested_at, now()),"
                     " updated_at=now() WHERE brand_id=%s", (brand_id,))
    try:
        bid = nicepay_billing.dec_bid(row['bid_enc'])
    except nicepay_billing.BillingCryptoUnavailable:
        return {'ok': False, 'state': 'expire_pending',
                'hint': '자동청구는 즉시 중단되었습니다. 보안 키 문제로 결제사'
                        ' 빌키 삭제는 완료하지 못했습니다 — 설정 확인 후 해지를'
                        ' 다시 눌러 주세요.'}
    try:
        r = nicepay_billing.expire(bid, 'BIDEXP_' + uuid.uuid4().hex[:24])
    except nicepay.PaymentUnavailable:
        return {'ok': False, 'state': 'expire_pending',
                'hint': '자동청구는 즉시 중단되었습니다. 결제사 통신 실패로 빌키'
                        ' 삭제는 대기 중입니다 — 잠시 후 해지를 다시 눌러 주세요.'}
    if r.get('resultCode') == '0000':
        with connect() as conn:
            conn.execute("UPDATE brand_billing_keys SET state='expired',"
                         " bid_enc='', updated_at=now() WHERE brand_id=%s",
                         (brand_id,))
            ledger_append(conn, f'brand:{brand_id}', 'BILLING_CARD_EXPIRED',
                          brand_id, {'by': str(u.get('sub', ''))})
        return {'ok': True, 'state': 'expired'}
    return {'ok': False, 'state': 'expire_pending',
            'hint': '자동청구는 중단되었습니다. 결제사 빌키 삭제는 미완료입니다. 해지를 다시 눌러 주세요.'}


def _finish_attempt(invoice_id: str, outcome: str, code: str, msg: str) -> None:
    with connect() as conn:
        conn.execute("UPDATE invoice_charge_attempts SET outcome=%s,"
                     " fail_code=%s, fail_msg=%s, finished_at=now()"
                     " WHERE invoice_id=%s AND outcome='pending'",
                     (outcome, code, msg, invoice_id))


def _autocharge_review(invoice_id: str, brand: str, reason: str) -> None:
    with connect() as conn:
        conn.execute("UPDATE signup_invoices SET status='review'"
                     " WHERE invoice_id=%s AND status='processing'",
                     (invoice_id,))
        ledger_append(conn, 'nicepay', 'INVOICE_AUTOCHARGE_REVIEW', invoice_id,
                      {'brand': brand, 'reason': reason})


def autocharge_tick(limit: int = 10) -> dict:
    """활성 카드 브랜드의 지난달 open 청구서를 자동 청구한다(러너 잡).

    안전 규칙(glovek의 익일 재시도·0000 단독 판정은 복사하지 않음):
    - 청구서당 시도는 평생 1회 — invoice_charge_attempts PK가 반복 tick·다중
      워커·수동 결제와의 경쟁에서도 중복 청구를 구조적으로 차단한다.
    - orderId=invoice_id: 결제된 orderId는 PG가 재호출을 거부하므로 PG측
      이중 승인도 불가.
    - 모호 응답(타임아웃)은 review + 자동 재승인 금지, find(orderId,
      원주문일)로 사람이 대사한다. 실패 응답도 review 유지: 미승인이 확인되기 전 수동 재결제 금지.
    - paid 확정은 기존 settle(서명·금액·orderId·tid·취소표식 검증) 그대로.
    """
    out = {'scanned': 0, 'paid': 0, 'failed': 0, 'review': 0}
    if not nicepay_billing.autocharge_enabled():
        return out
    if not nicepay_billing.crypto_ready():
        return out                              # fail-closed: bid 복호화 불가
    with connect() as conn:
        rows = conn.execute(
            "SELECT i.invoice_id, i.brand_id, i.amount, i.period, i.seq,"
            " k.bid_enc FROM signup_invoices i"
            " JOIN brand_billing_keys k ON k.brand_id=i.brand_id"
            "  AND k.state='active'"
            " JOIN brands b ON b.brand_id=i.brand_id AND NOT b.is_demo"
            " WHERE i.status='open' AND i.amount>=1000"
            "  AND i.cancel_reported_at IS NULL"
            "  AND i.period < date_trunc('month',"
            "        now() AT TIME ZONE 'Asia/Seoul')::date"
            "  AND NOT EXISTS (SELECT 1 FROM invoice_charge_attempts a"
            "                  WHERE a.invoice_id=i.invoice_id)"
            " ORDER BY i.period LIMIT %s", (limit,)).fetchall()
    for r in rows:
        with _card_operation(r['brand_id']):
            out['scanned'] += 1
            with connect() as conn:
                card = conn.execute('SELECT state, bid_enc FROM brand_billing_keys WHERE brand_id=%s',
                                    (r['brand_id'],)).fetchone()
            if not card or card['state'] != 'active' or not nicepay_billing.autocharge_enabled():
                continue
            r['bid_enc'] = card['bid_enc']
            with connect() as conn:
                inv = conn.execute(
                    'SELECT status, cancel_reported_at FROM signup_invoices'
                    ' WHERE invoice_id=%s FOR UPDATE',
                    (r['invoice_id'],)).fetchone()
                if (not inv or inv['status'] != 'open'
                        or inv['cancel_reported_at'] is not None):
                    continue                        # 수동 결제/취소와 경쟁 — 양보
                claimed = conn.execute(
                    "INSERT INTO invoice_charge_attempts"
                    " (invoice_id, brand_id, order_id, order_date)"
                    " VALUES (%s,%s,%s,%s) ON CONFLICT (invoice_id) DO NOTHING"
                    " RETURNING invoice_id",
                    (r['invoice_id'], r['brand_id'], r['invoice_id'],
                     datetime.now(ZoneInfo('Asia/Seoul')).strftime('%Y%m%d'))
                ).fetchone()
                if not claimed:
                    continue                        # 다른 워커가 이미 선점
                conn.execute("UPDATE signup_invoices SET status='processing'"
                             " WHERE invoice_id=%s", (r['invoice_id'],))
            try:
                bid = nicepay_billing.dec_bid(r['bid_enc'])
            except nicepay_billing.BillingCryptoUnavailable:
                _finish_attempt(r['invoice_id'], 'review', 'CRYPTO',
                                '보안 키 문제 — 청구 미실행, 대사 필요')
                _autocharge_review(r['invoice_id'], r['brand_id'], '보안 키 문제')
                out['review'] += 1
                continue
            goods = ('theprlist ' + r['period'].strftime('%Y-%m') + ' 가입 이용료'
                     + (' 추가분' if r['seq'] else ''))
            try:
                data = nicepay_billing.charge(bid, r['invoice_id'], r['amount'],
                                              goods)
            except nicepay.PaymentUnavailable:
                # 승인 여부 미확인 — 자동 재승인 금지. 영구 attempt의 원주문일로
                # reconcile(find)에서 사람이 복구한다.
                _finish_attempt(r['invoice_id'], 'review', 'TIMEOUT',
                                'PG 응답 미확인 — 청구 여부 대사 필요')
                _autocharge_review(r['invoice_id'], r['brand_id'], 'PG 응답 미확인')
                out['review'] += 1
                continue
            tid = _bind_verified_tid(r['invoice_id'], data)
            if tid:
                if settle(tid, r['invoice_id'], data):
                    _finish_attempt(r['invoice_id'], 'paid', '', '')
                    out['paid'] += 1
                else:
                    _finish_attempt(r['invoice_id'], 'review',
                                    str(data.get('resultCode', '')),
                                    '승인 응답 검증 실패 — 대사 필요')
                    _autocharge_review(r['invoice_id'], r['brand_id'],
                                       '승인 응답 검증 실패')
                    out['review'] += 1
            else:
                code = str(data.get('resultCode', ''))
                safe_code = code if re.fullmatch(r'[A-Za-z0-9]{1,12}', code) else 'UNKNOWN'
                _finish_attempt(r['invoice_id'], 'review', safe_code,
                                'PG 승인 여부 미확인 — 거래 확인 필요')
                _autocharge_review(r['invoice_id'], r['brand_id'], 'PG 승인 여부 미확인')
                out['review'] += 1
    return out


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
        target = conn.execute('SELECT brand_id FROM signup_usage WHERE usage_id=%s',
                              (usage_id,)).fetchone()
        if not target:
            raise HTTPException(404, '미해결 감사 항목이 없습니다')
        # 월마감과 같은 잠금 순서(브랜드 billing advisory → 행 잠금) —
        # 마감의 집계-발행 사이에 확정이 끼어들어 금액-연결이 어긋나는 경합과
        # 교착을 모두 막는다. 진행 중인 마감이 있으면 그 커밋 후에 확정된다.
        billing_lock(conn, target['brand_id'])
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
