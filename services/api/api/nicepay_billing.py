"""NICEpay 빌링키(정기결제) 어댑터 — glovek service2의 카드등록→빌키→청구
설계를 theprlist 후불 청구서 모델에 맞게 이식.

공식 규격(nicepayments/nicepay-manual api/payment-subscribe.md):
- 빌키발급  POST /v1/subscribe/regist   {encData, orderId[, encMode]}
- 빌키승인  POST /v1/subscribe/{bid}/payments {orderId, amount, goodsName,
            cardQuota:"0", useShopInterest:false} — 결제된 orderId 재호출 불가
- 빌키삭제  POST /v1/subscribe/{bid}/expire   {orderId}
- 거래조회  GET  /v1/payments/find/{orderId}?orderDate=YYYYMMDD
            (승인 응답 유실 시 tid 복구·대사용)
- encData: 기본 AES128/ECB/PKCS5(=PKCS7) hex, key=SecretKey 앞 16자.
  encMode "A2": AES256/CBC/PKCS5 hex, key=SecretKey(32byte), IV=앞 16자.

원본에서 의도적으로 복사하지 않은 것: 자체 HMAC 웹훅, resultCode '0000'
단독 성공 판정(여기서는 기존 nicepay.payment_valid의 서명·금액·orderId·tid
검증을 그대로 사용), 실패 익일 자동 재승인, 평문 bid 저장.

카드 원문(cardNo/idNo/cardPw)은 encData 생성에만 쓰고 이 모듈은 절대
저장·로깅하지 않는다. 시크릿/원문은 예외 메시지에도 싣지 않는다.
"""

import hashlib
import logging
import os
from datetime import UTC, datetime
from urllib.parse import quote

import httpx

from . import nicepay
from .nicepay import PaymentUnavailable

log = logging.getLogger(__name__)


class BillingCryptoUnavailable(Exception):
    """TOKEN_ENC_KEY 미설정/불량 — bid는 평문으로 저장할 수 없다(fail-closed)."""


def billing_enabled() -> bool:
    """카드 등록/해지 표면 활성 — 기본 off. 수동 결제와 독립."""
    return (os.getenv("NICEPAY_BILLING_ENABLED") == "1"
            and nicepay.configured())


def autocharge_enabled() -> bool:
    """월 청구서 자동청구 활성 — 기본 off. 등록만 켜고 청구는 끌 수 있다."""
    return (billing_enabled()
            and os.getenv("NICEPAY_AUTOCHARGE_ENABLED") == "1")


# ── bid 암호화 — fail-closed (기존 gmail _enc의 평문 폴백을 쓰지 않는다) ──

def _require_fernet():
    key = os.environ.get("TOKEN_ENC_KEY", "")
    if not key:
        raise BillingCryptoUnavailable("TOKEN_ENC_KEY 미설정")
    try:
        from cryptography.fernet import Fernet
        return Fernet(key.encode())
    except Exception as exc:
        raise BillingCryptoUnavailable("TOKEN_ENC_KEY 형식 오류") from exc


def crypto_ready() -> bool:
    try:
        _require_fernet()
        return True
    except BillingCryptoUnavailable:
        return False


def enc_bid(bid: str) -> str:
    return _require_fernet().encrypt(bid.encode()).decode()


def dec_bid(v: str) -> str:
    from cryptography.fernet import InvalidToken
    try:
        return _require_fernet().decrypt(v.encode()).decode()
    except InvalidToken as exc:
        raise BillingCryptoUnavailable("bid 복호화 실패 — 키 교체 여부 확인") from exc


# ── encData — 카드정보 암호화 (공식 규격) ─────────────────────────

def enc_mode() -> str:
    return "A2" if os.getenv("NICEPAY_BILLING_ENC_MODE", "").upper() == "A2" else ""


def encrypt_card(card_no: str, exp_year: str, exp_month: str,
                 id_no: str, card_pw: str) -> str:
    """평문 cardNo=..&expYear=YY&expMonth=MM&idNo=..&cardPw=.. → hex.
    입력값은 여기서 즉시 암호화만 하고 반환 후 참조를 남기지 않는다."""
    from cryptography.hazmat.primitives import padding
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    secret = os.environ.get("NICEPAY_SECRET_KEY", "")
    if len(secret) < 32:
        raise PaymentUnavailable("Payment configuration is incomplete")
    plain = (f"cardNo={card_no}&expYear={exp_year}&expMonth={exp_month}"
             f"&idNo={id_no}&cardPw={card_pw}").encode()
    padder = padding.PKCS7(128).padder()          # PKCS5padding == PKCS7(128)
    data = padder.update(plain) + padder.finalize()
    if enc_mode() == "A2":
        cipher = Cipher(algorithms.AES(secret[:32].encode()),
                        modes.CBC(secret[:16].encode()))
    else:
        cipher = Cipher(algorithms.AES(secret[:16].encode()), modes.ECB())
    enc = cipher.encryptor()
    return (enc.update(data) + enc.finalize()).hex()


# ── REST 호출 (기존 nicepay.request와 동일한 보수적 규칙) ──────────

def _base() -> str:
    base = os.getenv("NICEPAY_API_BASE", "https://api.nicepay.co.kr").rstrip("/")
    if base not in ("https://api.nicepay.co.kr",
                    "https://sandbox-api.nicepay.co.kr"):
        raise PaymentUnavailable("Invalid NICEpay API host")
    return base


def _call(method: str, path: str, body: dict | None) -> dict:
    if not nicepay.configured():
        raise PaymentUnavailable("Payment configuration is incomplete")
    try:
        response = httpx.request(
            method, _base() + path,
            auth=(nicepay.client_key(), os.environ["NICEPAY_SECRET_KEY"]),
            json=body, timeout=20)
        if response.status_code != 200:
            raise PaymentUnavailable("PG result must be reconciled")
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError()
        return data
    except (httpx.HTTPError, ValueError) as exc:
        raise PaymentUnavailable("PG result must be reconciled") from exc


def _sign(*parts) -> str:
    secret = os.environ.get("NICEPAY_SECRET_KEY", "")
    return hashlib.sha256(
        ("".join(str(p) for p in parts) + secret).encode()).hexdigest()


def _edi_date() -> str:
    return datetime.now(UTC).isoformat()


def regist(enc_data: str, order_id: str) -> dict:
    """빌키 발급 — 청구 없음. signData = sha256(orderId+ediDate+secret)."""
    edi = _edi_date()
    body = {"encData": enc_data, "orderId": order_id, "ediDate": edi,
            "signData": _sign(order_id, edi)}
    if enc_mode():
        body["encMode"] = enc_mode()
    return _call("POST", "/v1/subscribe/regist", body)


def charge(bid: str, order_id: str, amount: int, goods_name: str) -> dict:
    """빌키 승인 — 응답 검증은 호출측이 nicepay.payment_valid로 수행.
    signData = sha256(orderId+bid+ediDate+secret)."""
    edi = _edi_date()
    return _call("POST", f"/v1/subscribe/{quote(bid, safe='')}/payments", {
        "orderId": order_id, "amount": amount, "goodsName": goods_name,
        "cardQuota": "0", "useShopInterest": False,
        "ediDate": edi, "signData": _sign(order_id, bid, edi)})


def expire(bid: str, order_id: str) -> dict:
    edi = _edi_date()
    return _call("POST", f"/v1/subscribe/{quote(bid, safe='')}/expire", {
        "orderId": order_id, "ediDate": edi,
        "signData": _sign(order_id, bid, edi)})


def find(order_id: str, order_date: str) -> dict:
    """orderId 기준 거래 조회 — 승인 응답 유실(타임아웃) 시 tid 복구·대사.
    order_date: 주문일 YYYYMMDD (영구 attempt 기록에서 가져온다)."""
    if not order_date.isdigit() or len(order_date) != 8:
        raise PaymentUnavailable("orderDate must be YYYYMMDD")
    return _call("GET", f"/v1/payments/find/{quote(order_id, safe='')}"
                        f"?orderDate={order_date}", None)
