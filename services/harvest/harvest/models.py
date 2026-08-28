"""母 DB 레코드 · 상태 모델 — db/migrations/001_creator_pool.sql 과 짝."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum


class Platform(StrEnum):
    TIKTOK = "tiktok"
    INSTAGRAM = "instagram"


class EmailStatus(StrEnum):
    VALID = "valid"
    RISKY = "risky"    # 저장하되 발송 제외 기본
    NONE = "none"


class Grade(StrEnum):
    MEGA = "mega"
    MACRO = "macro"
    MID = "mid"
    MICRO = "micro"
    NANO = "nano"


class PoolState(StrEnum):
    POOL = "POOL"
    DORMANT = "DORMANT"
    INVITED = "INVITED"
    MEMBER = "MEMBER"
    EXCLUDED = "EXCLUDED"


@dataclass
class CreatorProfile:
    """Fetch 단계가 벤더 응답을 normalize한 결과 (벤더 중립)."""

    platform: Platform
    platform_uid: str
    handle: str
    display_name: str | None = None
    followers: int | None = None
    following: int | None = None
    post_count: int | None = None
    bio: str | None = None
    links: list[str] = field(default_factory=list)
    account_region: str | None = None      # 플랫폼 공개 region (ISO2)
    verified: bool = False
    last_post_at: datetime | None = None
    avg_views: int | None = None
    engagement_rate: float | None = None
    post_freq_30d: int | None = None
    gmv_signal: int | None = None
    sponsor_ratio_90d: float | None = None
    top_video_ids: list[str] = field(default_factory=list)
    raw: dict | None = None                # 원본 응답 스냅샷 (S3 감사 추적용)
