"""벤더별 HTTP 어댑터 골격 — API 키 계약 후 엔드포인트를 채운다.

라우팅 원칙 (구현상세 §4.1):
  대량 프로필(그래프)  → ScrapeCreators ($0.99/1K) → Apify → EnsembleData
  정밀 필드·bio 확실   → EnsembleData → Lamatok
  커머스 실적          → TikTok Shop API
  이미 L2 스냅샷 존재  → fetch 스킵
"""

import os

from ..models import CreatorProfile, Platform
from .base import VendorError


class _HttpVendor:
    """공통 골격 — 키가 없으면 즉시 실패해 라우터가 폴백하게 한다."""

    name = "base"
    env_key = ""

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or os.environ.get(self.env_key, "")

    def _require_key(self) -> None:
        if not self.api_key:
            raise VendorError(f"{self.name}: API 키 미설정 ({self.env_key})")


class ScrapeCreators(_HttpVendor):
    """대량 fetch·검색 주력 — $0.99~1.88/1K (2026-08 공개, 협상 전)."""

    name = "scrapecreators"
    env_key = "SCRAPECREATORS_API_KEY"

    def user_info(self, handle: str) -> CreatorProfile:
        self._require_key()
        raise NotImplementedError("계약 후 구현: GET /v1/tiktok/profile?handle=...")


class EnsembleData(_HttpVendor):
    """정밀 필드·bio — user/info 계약은 구현상세 §4.2 참조."""

    name = "ensembledata"
    env_key = "ENSEMBLEDATA_TOKEN"

    def user_info(self, handle: str) -> CreatorProfile:
        self._require_key()
        raise NotImplementedError("계약 후 구현: /tt/user/info?username=...")

    @staticmethod
    def normalize(resp: dict) -> CreatorProfile:
        """§4.2 응답 필드 → CreatorProfile."""
        return CreatorProfile(
            platform=Platform.TIKTOK,
            platform_uid=str(resp["uid"]),
            handle=resp["unique_id"],
            display_name=resp.get("nickname"),
            followers=resp.get("follower_count"),
            following=resp.get("following_count"),
            post_count=resp.get("aweme_count"),
            bio=resp.get("signature"),
            links=[u for u in [resp.get("bio_url")] if u],
            account_region=resp.get("region"),
            verified=bool(resp.get("verification_type")),
            raw=resp,
        )


class Apify(_HttpVendor):
    name = "apify"
    env_key = "APIFY_TOKEN"

    def user_info(self, handle: str) -> CreatorProfile:
        self._require_key()
        raise NotImplementedError("계약 후 구현: 프로필 액터 호출")


class Lamatok(_HttpVendor):
    name = "lamatok"
    env_key = "LAMATOK_KEY"

    def user_info(self, handle: str) -> CreatorProfile:
        self._require_key()
        raise NotImplementedError("계약 후 구현")
