"""Verified signup usage. Payment collection is configured separately."""

from fastapi import APIRouter, Header, HTTPException

from .auth import current_user, require_brand
from . import nicepay
from .db import connect

router = APIRouter()


@router.get('/brands/{brand_id}/billing')
def billing_summary(brand_id: str, authorization: str = Header(default=''),
                    x_admin_key: str = Header(default='')) -> dict:
    user = current_user(authorization)
    if user and user.get('otp') == 'pending':
        raise HTTPException(401, '2단계 인증을 완료하세요')
    require_brand(brand_id, authorization, x_admin_key)
    with connect() as conn:
        brand = conn.execute('SELECT is_demo FROM brands WHERE brand_id=%s',
                             (brand_id,)).fetchone()
        if not brand:
            raise HTTPException(404, '브랜드를 찾을 수 없습니다')
        totals = conn.execute(
            'SELECT count(*) AS quantity, COALESCE(sum(unit_price),0) AS amount '
            'FROM signup_usage WHERE brand_id=%s', (brand_id,)).fetchone()
        policy = conn.execute('SELECT effective_at, unit_price FROM signup_billing_policy').fetchone()
    return {'model': 'per_signup', 'unitPrice': policy['unit_price'], 'fixedFee': 0,
            'quantity': totals['quantity'], 'usageAmount': totals['amount'],
            'currency': 'KRW', 'demo': brand['is_demo'],
            'effectiveAt': policy['effective_at'].isoformat(),
            'collectionEnabled': bool(nicepay.configured()), 'taxTreatment': 'inclusive',
            'collection': 'monthly_invoice',
            'message': f"가입당 {policy['unit_price']:,}원 (부가세 포함) · 월말 합산 결제"}
