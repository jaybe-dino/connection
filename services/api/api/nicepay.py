"""NICEpay Server Approval adapter. Secrets and raw responses are not logged."""
import hashlib
import hmac
import os
from urllib.parse import quote

import httpx


class PaymentUnavailable(Exception):
    pass


def configured():
    return (os.getenv('NICEPAY_ENABLED') == '1' and bool(os.getenv('NICEPAY_CLIENT_KEY'))
            and bool(os.getenv('NICEPAY_SECRET_KEY')))


def client_key():
    return os.environ['NICEPAY_CLIENT_KEY']


def _signature(parts, supplied):
    secret = os.getenv('NICEPAY_SECRET_KEY', '')
    if not secret or not isinstance(supplied, str) or len(supplied) != 64:
        return False
    expected = hashlib.sha256((''.join(str(x) for x in parts) + secret).encode()).hexdigest()
    return hmac.compare_digest(expected, supplied.lower())


def auth_valid(data, amount):
    return (data.get('authResultCode') == '0000' and str(data.get('amount')) == str(amount)
            and bool(data.get('authToken')) and _signature(
                [data['authToken'], client_key(), amount], data.get('signature')))


def payment_valid(data, order_id, amount, tid):
    return (data.get('resultCode') == '0000' and data.get('status') == 'paid'
            and data.get('orderId') == order_id and data.get('tid') == tid
            and type(data.get('amount')) is int and data['amount'] == amount
            and bool(data.get('ediDate')) and _signature(
                [tid, amount, data['ediDate']], data.get('signature')))


def request(method, tid, amount=None):
    if not configured():
        raise PaymentUnavailable('Payment configuration is incomplete')
    base = os.getenv('NICEPAY_API_BASE', 'https://api.nicepay.co.kr').rstrip('/')
    if base not in ('https://api.nicepay.co.kr', 'https://sandbox-api.nicepay.co.kr'):
        raise PaymentUnavailable('Invalid NICEpay API host')
    try:
        response = httpx.request(method, base + '/v1/payments/' + quote(tid, safe=''),
            auth=(client_key(), os.environ['NICEPAY_SECRET_KEY']),
            json={'amount': amount} if method == 'POST' else None, timeout=20)
        if response.status_code != 200:
            raise PaymentUnavailable('PG result must be reconciled')
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError()
        return data
    except (httpx.HTTPError, ValueError) as exc:
        raise PaymentUnavailable('PG result must be reconciled') from exc
