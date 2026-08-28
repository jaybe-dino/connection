"""이메일 검증 파이프 — 구현상세 명세 §5.2.

candidate → syntax_ok? → MX_exists? → verify_api(ZeroBounce류)
  valid   → 저장, email_status=valid
  risky   → 저장, email_status=risky (발송 제외 기본)
  invalid → 드롭, email_status=none

발송 전 필수 — 반송률이 도메인 평판을 죽인다.
"""

import re
from typing import Callable, Protocol

from ..models import EmailStatus

_RE_SYNTAX = re.compile(r"^[\w.+-]+@[\w-]+(\.[\w-]+)+$")


class VerifyApi(Protocol):
    """외부 검증 API (ZeroBounce·NeverBounce·Bouncer) 계약."""

    def verify(self, email: str) -> str:
        """'valid' | 'risky' | 'invalid' 반환."""
        ...


EmailVerdict = EmailStatus  # 별칭 — 파이프 결과가 곧 저장 상태


def syntax_ok(email: str) -> bool:
    return bool(_RE_SYNTAX.fullmatch(email))


def _default_mx_lookup(domain: str) -> bool:
    """DNS MX 조회 — 오프라인·테스트에서는 주입으로 대체한다."""
    try:
        import socket

        socket.getaddrinfo(domain, 25)
        return True
    except OSError:
        return False


def verify_email(
    email: str,
    verify_api: VerifyApi | None = None,
    mx_lookup: Callable[[str], bool] | None = None,
) -> EmailVerdict:
    """검증 파이프. 외부 API가 없으면 MX 통과분을 risky로 보수 처리한다."""
    if not syntax_ok(email):
        return EmailStatus.NONE

    domain = email.rsplit("@", 1)[1]
    mx = mx_lookup or _default_mx_lookup
    if not mx(domain):
        return EmailStatus.NONE

    if verify_api is None:
        # 외부 검증 전 — 발송 제외 기본값
        return EmailStatus.RISKY

    verdict = verify_api.verify(email)
    if verdict == "valid":
        return EmailStatus.VALID
    if verdict == "risky":
        return EmailStatus.RISKY
    return EmailStatus.NONE
