"""Fetch — 벤더 라우터 (구현상세 명세 §4).

우선순위 순회 + 폴백:
  RateLimited → 감속하고 다음 벤더
  QuotaExceeded → 벤더 비활성 후 다음 벤더
  NotFound → 즉시 EXCLUDED (재시도·폴백 없음)
  전 벤더 실패 → dead_letter
"""

import logging
from dataclasses import dataclass, field
from enum import StrEnum

from .models import CreatorProfile
from .vendors.base import NotFound, QuotaExceeded, RateLimited, Vendor, VendorError

log = logging.getLogger(__name__)


class FetchOutcome(StrEnum):
    OK = "ok"
    EXCLUDED = "excluded"        # 404/삭제 계정
    DEAD_LETTER = "dead_letter"  # 전 벤더 실패


@dataclass
class FetchResult:
    outcome: FetchOutcome
    profile: CreatorProfile | None = None
    vendor: str | None = None
    errors: list[str] = field(default_factory=list)


class VendorRouter:
    """우선순위 목록을 돌며 첫 성공을 반환한다."""

    def __init__(self, vendors: list[Vendor]) -> None:
        if not vendors:
            raise ValueError("벤더가 최소 1개 필요")
        self.vendors = list(vendors)
        self._disabled: set[str] = set()

    def fetch_profile(self, handle: str) -> FetchResult:
        errors: list[str] = []
        for v in self.vendors:
            if v.name in self._disabled:
                continue
            try:
                profile = v.user_info(handle)
                return FetchResult(FetchOutcome.OK, profile=profile, vendor=v.name)
            except NotFound:
                # 재시도 없이 state=EXCLUDED — 다른 벤더도 묻지 않는다
                return FetchResult(FetchOutcome.EXCLUDED, vendor=v.name)
            except RateLimited as e:
                errors.append(f"{v.name}: rate_limited")
                log.warning("429 from %s — 감속 후 폴백: %s", v.name, e)
            except QuotaExceeded as e:
                errors.append(f"{v.name}: quota")
                self._disabled.add(v.name)
                log.error("쿼터 소진 — %s 비활성: %s", v.name, e)
            except (VendorError, NotImplementedError) as e:
                errors.append(f"{v.name}: {e}")
        return FetchResult(FetchOutcome.DEAD_LETTER, errors=errors)

    def reactivate(self, vendor_name: str) -> None:
        self._disabled.discard(vendor_name)
