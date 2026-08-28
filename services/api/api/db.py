"""Postgres 연결 · 마이그레이션 러너 · 원장 append (해시 체인).

DATABASE_URL 예: postgresql://postgres:postgres@localhost:5432/connection
"""

import json
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row

# services/api/api/db.py → 리포 루트/db/migrations
MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "db" / "migrations"

DEFAULT_URL = "postgresql://postgres:postgres@localhost:5432/connection"


def database_url() -> str:
    return os.environ.get("DATABASE_URL", DEFAULT_URL)


@contextmanager
def connect(url: str | None = None) -> Iterator[psycopg.Connection]:
    # 해시 재계산이 ts 문자열에 의존하므로 세션 TZ를 UTC로 고정한다
    conn = psycopg.connect(url or database_url(), row_factory=dict_row,
                           options="-c timezone=UTC")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def run_migrations(url: str | None = None) -> list[str]:
    """미적용 마이그레이션 순서대로 적용 (schema_migrations 추적)."""
    applied: list[str] = []
    with connect(url) as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        done = {r["name"] for r in conn.execute("SELECT name FROM schema_migrations")}
        for f in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if f.name in done:
                continue
            conn.execute(f.read_text(encoding="utf-8"))
            conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (f.name,))
            applied.append(f.name)
    return applied


def ledger_append(conn: psycopg.Connection, actor: str, event_type: str,
                  subject: str, payload: dict[str, Any] | None = None) -> dict:
    """append-only 원장에 해시 체인으로 기록. core.ledger와 동일 해시 규칙."""
    from core.ledger import GENESIS_HASH, LedgerEntry  # services/core

    payload = payload or {}
    row = conn.execute(
        "SELECT seq, hash FROM ledger ORDER BY seq DESC LIMIT 1 FOR UPDATE"
    ).fetchone()
    prev_hash = row["hash"] if row else GENESIS_HASH
    seq = (row["seq"] if row else 0) + 1
    ts_row = conn.execute("SELECT now() AS ts").fetchone()
    ts = ts_row["ts"].isoformat()
    h = LedgerEntry.compute_hash(seq, ts, actor, event_type, subject, payload, prev_hash)
    conn.execute(
        "INSERT INTO ledger (seq, ts, actor, event_type, subject, payload, prev_hash, hash)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        (seq, ts, actor, event_type, subject, json.dumps(payload, ensure_ascii=False),
         prev_hash, h),
    )
    return {"seq": seq, "ts": ts, "actor": actor, "event_type": event_type,
            "subject": subject, "payload": payload, "hash": h}


def ledger_verify(conn: psycopg.Connection) -> bool:
    from core.ledger import GENESIS_HASH, LedgerEntry

    prev = GENESIS_HASH
    for r in conn.execute("SELECT * FROM ledger ORDER BY seq"):
        payload = r["payload"] if isinstance(r["payload"], dict) else json.loads(r["payload"])
        expected = LedgerEntry.compute_hash(
            r["seq"], r["ts"].isoformat(), r["actor"], r["event_type"],
            r["subject"], payload, r["prev_hash"])
        if r["prev_hash"] != prev or r["hash"] != expected:
            return False
        prev = r["hash"]
    return True
