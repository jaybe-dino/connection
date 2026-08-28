"""벤더별 HTTP 어댑터 — 기술스택 명세 §2~§3·§8.

엔드포인트 경로·응답 필드는 2026-08 공개 문서 기준의 계약 초안이다.
키 발급 후 실제 응답으로 캘리브레이션할 것 (normalize 함수만 고치면 된다).

라우팅 원칙 (구현상세 §4.1):
  대량 프로필(그래프)  → ScrapeCreators ($0.99/1K) → Apify → EnsembleData
  정밀 필드·bio 확실   → EnsembleData → Lamatok
  커머스 실적          → TikTok Shop API
"""

import os
from typing import Any, Iterator, Mapping

from ..http import HttpResponse, Transport, UrllibTransport
from ..models import CreatorProfile, Platform
from .base import NotFound, QuotaExceeded, RateLimited, VendorError


def _raise_for_status(vendor: str, resp: HttpResponse) -> None:
    if resp.status == 429:
        raise RateLimited(f"{vendor}: 429")
    if resp.status in (402, 403):
        raise QuotaExceeded(f"{vendor}: {resp.status}")
    if resp.status == 404:
        raise NotFound(f"{vendor}: 404")
    if resp.status >= 400:
        raise VendorError(f"{vendor}: HTTP {resp.status}")


class _HttpVendor:
    """공통 골격 — 키가 없으면 즉시 실패해 라우터가 폴백하게 한다."""

    name = "base"
    env_key = ""

    def __init__(self, api_key: str | None = None,
                 transport: Transport | None = None) -> None:
        self.api_key = api_key or os.environ.get(self.env_key, "")
        self.transport = transport or UrllibTransport()

    def _get(self, url: str, params: Mapping[str, Any] | None = None,
             headers: Mapping[str, str] | None = None) -> Any:
        if not self.api_key:
            raise VendorError(f"{self.name}: API 키 미설정 ({self.env_key})")
        resp = self.transport.get(url, params=params, headers=headers)
        _raise_for_status(self.name, resp)
        return resp.json()


class ScrapeCreators(_HttpVendor):
    """대량 fetch·검색 주력 — 볼륨 구간 최저가."""

    name = "scrapecreators"
    env_key = "SCRAPECREATORS_API_KEY"
    base = "https://api.scrapecreators.com/v1"

    def _headers(self) -> dict[str, str]:
        return {"x-api-key": self.api_key}

    def user_info(self, handle: str) -> CreatorProfile:
        data = self._get(f"{self.base}/tiktok/profile",
                         params={"handle": handle}, headers=self._headers())
        return self.normalize(data)

    @staticmethod
    def normalize(data: dict) -> CreatorProfile:
        user = data.get("user", data)
        stats = data.get("stats", user.get("stats", {}))
        return CreatorProfile(
            platform=Platform.TIKTOK,
            platform_uid=str(user.get("id") or user.get("uid") or ""),
            handle=user.get("uniqueId") or user.get("unique_id") or "",
            display_name=user.get("nickname"),
            followers=stats.get("followerCount") or stats.get("follower_count"),
            following=stats.get("followingCount"),
            post_count=stats.get("videoCount"),
            bio=user.get("signature"),
            links=[u for u in [user.get("bioLink", {}).get("link")
                               if isinstance(user.get("bioLink"), dict) else None] if u],
            account_region=user.get("region"),
            verified=bool(user.get("verified")),
            raw=data,
        )

    def hashtag_posts(self, tag: str, pages: int = 1) -> Iterator[dict]:
        """D1 — 해시태그 → 영상+작성자. {author_handle, video_id, stats} yield."""
        cursor: Any = None
        for _ in range(pages):
            data = self._get(f"{self.base}/tiktok/hashtag",
                             params={"hashtag": tag, "cursor": cursor},
                             headers=self._headers())
            posts = data.get("posts") or data.get("items") or []
            for p in posts:
                author = p.get("author") or {}
                yield {
                    "author_handle": author.get("uniqueId") or author.get("unique_id"),
                    "video_id": str(p.get("id") or p.get("video_id") or ""),
                    "stats": p.get("stats", {}),
                }
            cursor = data.get("cursor") or data.get("next_cursor")
            if not cursor or not posts:
                break


class EnsembleData(_HttpVendor):
    """정밀 필드·bio — clean JSON · 멀티플랫폼. user/info 계약은 구현상세 §4.2."""

    name = "ensembledata"
    env_key = "ENSEMBLEDATA_TOKEN"
    base = "https://ensembledata.com/apis"

    def _get_ed(self, path: str, params: dict[str, Any]) -> Any:
        return self._get(f"{self.base}{path}", params={**params, "token": self.api_key})

    def user_info(self, handle: str) -> CreatorProfile:
        data = self._get_ed("/tt/user/info", {"username": handle})
        return self.normalize(data.get("data", data))

    @staticmethod
    def normalize(resp: dict) -> CreatorProfile:
        """§4.2 응답 필드 → CreatorProfile."""
        user = resp.get("user", resp)
        return CreatorProfile(
            platform=Platform.TIKTOK,
            platform_uid=str(user.get("uid") or user.get("id") or ""),
            handle=user.get("unique_id") or "",
            display_name=user.get("nickname"),
            followers=user.get("follower_count"),
            following=user.get("following_count"),
            post_count=user.get("aweme_count"),
            bio=user.get("signature"),
            links=[u for u in [user.get("bio_url")] if u],
            account_region=user.get("region"),
            verified=bool(user.get("verification_type")),
            raw=resp,
        )

    def hashtag_posts(self, tag: str, pages: int = 1) -> Iterator[dict]:
        cursor = 0
        for _ in range(pages):
            data = self._get_ed("/tt/hashtag/posts", {"name": tag, "cursor": cursor})
            posts = (data.get("data") or {}).get("posts") or data.get("posts") or []
            for p in posts:
                author = p.get("author") or {}
                yield {
                    "author_handle": author.get("unique_id"),
                    "video_id": str(p.get("aweme_id") or p.get("id") or ""),
                    "stats": p.get("statistics", {}),
                }
            nxt = (data.get("data") or {}).get("nextCursor") or data.get("nextCursor")
            if not nxt or not posts:
                break
            cursor = nxt

    def post_comments(self, video_id: str, limit: int = 200) -> Iterator[str]:
        """D2 — 영상 댓글러 핸들. 관심 신호 강한 계정."""
        data = self._get_ed("/tt/post/comments", {"aweme_id": video_id})
        comments = (data.get("data") or {}).get("comments") or data.get("comments") or []
        seen: set[str] = set()
        for c in comments[:limit]:
            u = (c.get("user") or {}).get("unique_id")
            if u and u not in seen:
                seen.add(u)
                yield u

    def suggested_users(self, handle: str, limit: int = 30) -> Iterator[str]:
        """D2 — 추천/유사 유저 BFS 확장."""
        data = self._get_ed("/tt/user/suggested", {"username": handle})
        users = (data.get("data") or {}).get("users") or data.get("users") or []
        for u in users[:limit]:
            uid = u.get("unique_id")
            if uid:
                yield uid


class Apify(_HttpVendor):
    """액터 기반 폴백 — link-in-bio·이메일 전용 액터도 유용."""

    name = "apify"
    env_key = "APIFY_TOKEN"
    base = "https://api.apify.com/v2"
    profile_actor = "clockworks~tiktok-profile-scraper"

    def user_info(self, handle: str) -> CreatorProfile:
        # run-sync-get-dataset-items: 동기 실행 후 결과 반환 (POST 필요 시 확장)
        data = self._get(
            f"{self.base}/acts/{self.profile_actor}/runs/last/dataset/items",
            params={"token": self.api_key, "clean": "true"},
        )
        items = data if isinstance(data, list) else data.get("items", [])
        for item in items:
            if (item.get("authorMeta") or {}).get("name") == handle:
                return self.normalize(item)
        raise NotFound(f"apify: {handle} not in last run dataset")

    @staticmethod
    def normalize(item: dict) -> CreatorProfile:
        meta = item.get("authorMeta") or item
        return CreatorProfile(
            platform=Platform.TIKTOK,
            platform_uid=str(meta.get("id") or ""),
            handle=meta.get("name") or "",
            display_name=meta.get("nickName"),
            followers=meta.get("fans"),
            following=meta.get("following"),
            post_count=meta.get("video"),
            bio=meta.get("signature"),
            verified=bool(meta.get("verified")),
            raw=item,
        )


class Lamatok(_HttpVendor):
    name = "lamatok"
    env_key = "LAMATOK_KEY"
    base = "https://api.lamatok.com/v1"

    def user_info(self, handle: str) -> CreatorProfile:
        data = self._get(f"{self.base}/user/by/username",
                         params={"username": handle, "access_key": self.api_key})
        return EnsembleData.normalize(data)
