"""벤더 어댑터 계약 — 기술스택 명세 §3·§8.

상업 벤더가 프록시·차단 리스크를 대신 지게 하는 게 1순위.
각 어댑터는 벤더 응답을 CreatorProfile로 normalize해 반환한다.
"""

from typing import Protocol

from ..models import CreatorProfile


class VendorError(Exception):
    """벤더 호출 실패 공통."""


class RateLimited(VendorError):
    """429 — 토큰버킷 감속 + 다음 벤더 폴백."""


class QuotaExceeded(VendorError):
    """402/쿼터 소진 — 해당 벤더 비활성 → 폴백 → 알림."""


class NotFound(VendorError):
    """404/삭제 계정 — 재시도 없이 state=EXCLUDED."""


class Vendor(Protocol):
    """벤더 라우터가 의존하는 최소 계약."""

    name: str

    def user_info(self, handle: str) -> CreatorProfile:
        """프로필 상세 조회. 실패는 위 예외로 던진다."""
        ...
