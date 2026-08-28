"""Store — 母 DB(creator_pool) upsert (구현상세 명세 §2 멱등성 규칙).

같은 handle 재유입 시 upsert. psycopg는 선택 의존성 —
테스트·MVP는 InMemoryPool로 대체한다.
"""

from datetime import UTC, datetime, timedelta
from typing import Any, Protocol
from uuid import uuid4

from .models import CreatorProfile, PoolState

# 리프레시 주기(§10): 상위 7일 / 하위 30일 — freshness 판단 기본값은 보수적으로 7일
FRESH_TTL = timedelta(days=7)


class Pool(Protocol):
    def exists(self, platform: str, handle: str) -> bool: ...
    def is_fresh(self, platform: str, handle: str) -> bool: ...
    def upsert(self, profile: CreatorProfile, source: str) -> str: ...
    def set_state(self, creator_id: str, state: PoolState) -> None: ...


class InMemoryPool:
    """단일 프로세스 MVP·테스트용 母 DB."""

    def __init__(self) -> None:
        self._by_handle: dict[tuple[str, str], dict[str, Any]] = {}
        self._by_id: dict[str, dict[str, Any]] = {}

    def exists(self, platform: str, handle: str) -> bool:
        return (platform, handle) in self._by_handle

    def is_fresh(self, platform: str, handle: str) -> bool:
        rec = self._by_handle.get((platform, handle))
        if not rec:
            return False
        return datetime.now(UTC) - rec["last_refreshed"] < FRESH_TTL

    def upsert(self, profile: CreatorProfile, source: str) -> str:
        key = (profile.platform.value, profile.handle)
        now = datetime.now(UTC)
        rec = self._by_handle.get(key)
        if rec is None:
            rec = {
                "creator_id": str(uuid4()),
                "state": PoolState.POOL,
                "first_seen": now,
                "sources": [],
            }
            self._by_handle[key] = rec
            self._by_id[rec["creator_id"]] = rec
        rec.update(
            platform=profile.platform.value,
            platform_uid=profile.platform_uid,
            handle=profile.handle,
            display_name=profile.display_name,
            followers=profile.followers,
            bio=profile.bio,
            links=list(profile.links),
            account_region=profile.account_region,
            last_refreshed=now,
        )
        rec["sources"].append({"vendor": source, "seen_at": now.isoformat()})
        return rec["creator_id"]

    def set_state(self, creator_id: str, state: PoolState) -> None:
        self._by_id[creator_id]["state"] = state

    def get(self, creator_id: str) -> dict[str, Any]:
        return self._by_id[creator_id]

    def __len__(self) -> int:
        return len(self._by_id)


UPSERT_SQL = """
INSERT INTO creator_pool
    (platform, platform_uid, handle, display_name, followers, bio, links,
     sources, last_refreshed)
VALUES
    (%(platform)s, %(platform_uid)s, %(handle)s, %(display_name)s,
     %(followers)s, %(bio)s, %(links)s,
     jsonb_build_array(jsonb_build_object('vendor', %(source)s, 'seen_at', now())),
     now())
ON CONFLICT (platform, platform_uid) DO UPDATE SET
    handle         = EXCLUDED.handle,
    handle_history = CASE
        WHEN creator_pool.handle IS DISTINCT FROM EXCLUDED.handle
        THEN creator_pool.handle_history
             || jsonb_build_object('handle', creator_pool.handle, 'until', now())
        ELSE creator_pool.handle_history END,
    display_name   = EXCLUDED.display_name,
    followers      = EXCLUDED.followers,
    bio            = EXCLUDED.bio,
    links          = EXCLUDED.links,
    sources        = creator_pool.sources || EXCLUDED.sources,
    last_refreshed = now()
RETURNING creator_id;
"""


class PostgresPool:
    """프로덕션 어댑터 — psycopg 연결을 주입받는다 (pip install '.[db]')."""

    def __init__(self, conn: Any) -> None:
        self.conn = conn

    def exists(self, platform: str, handle: str) -> bool:
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM creator_pool WHERE platform=%s AND handle=%s",
                (platform, handle),
            )
            return cur.fetchone() is not None

    def is_fresh(self, platform: str, handle: str) -> bool:
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT last_refreshed > now() - interval '7 days' "
                "FROM creator_pool WHERE platform=%s AND handle=%s",
                (platform, handle),
            )
            row = cur.fetchone()
            return bool(row and row[0])

    def upsert(self, profile: CreatorProfile, source: str) -> str:
        import json

        with self.conn.cursor() as cur:
            cur.execute(
                UPSERT_SQL,
                {
                    "platform": profile.platform.value,
                    "platform_uid": profile.platform_uid,
                    "handle": profile.handle,
                    "display_name": profile.display_name,
                    "followers": profile.followers,
                    "bio": profile.bio,
                    "links": json.dumps(profile.links),
                    "source": source,
                },
            )
            return str(cur.fetchone()[0])

    def set_state(self, creator_id: str, state: PoolState) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE creator_pool SET state=%s WHERE creator_id=%s",
                (state.value, creator_id),
            )
