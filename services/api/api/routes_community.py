"""내부 디스코드형 커뮤니티 — 멤버십 검사가 있는 공개 경로 (/community/*).

기존 자산 재사용: cells/cell_messages 스키마(003)와 원문 보존 + 언어별
translations 구조, ai.translate. 레거시 /cells/* 는 검사가 없어 관리자
전용으로 잠겨 있고, 이 라우터가 그 대체 공개 표면이다.

주의: 이것은 서비스 내부 커뮤니티이며 실제 Discord 서버 연동이 아니다.
"""

import json
import uuid

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from . import ai, auth
from .db import connect, ledger_append

router = APIRouter(prefix="/community")

ALL_LOCALES = ["ko", "th", "en", "vi"]


def _actor(authorization: str) -> dict:
    u = auth.current_user(authorization)
    if not u or u.get("otp") == "pending":
        raise HTTPException(401, "로그인이 필요합니다")
    return u


def _cell(conn, cell_id: str) -> dict:
    c = conn.execute("SELECT * FROM cells WHERE cell_id=%s", (cell_id,)).fetchone()
    if not c:
        raise HTTPException(404, "셀을 찾을 수 없습니다")
    return c


def _member_or_owner(conn, claims: dict, cell: dict) -> str:
    """접근 자격: 그 브랜드의 멤버 크리에이터 / 그 브랜드 계정 / 어드민."""
    kind = claims.get("kind")
    if kind == "admin":
        return "admin"
    if kind == "brand":
        if claims.get("brand_id") == cell["brand_id"]:
            return "brand"
        raise HTTPException(403, "이 브랜드의 셀이 아닙니다")
    if kind == "creator":
        from .routes_identity import _ensure_creator_row
        cid = _ensure_creator_row(conn, claims)
        m = conn.execute(
            "SELECT 1 FROM memberships WHERE creator_id=%s AND brand_id=%s",
            (cid, cell["brand_id"])).fetchone()
        if not m:
            raise HTTPException(403, "이 브랜드 멤버십이 필요합니다 — 먼저 PR 리스트에 합류하세요")
        return cid
    raise HTTPException(403, "접근 권한이 없습니다")


@router.get("/my-cells")
def my_cells(authorization: str = Header(default="")) -> list[dict]:
    claims = _actor(authorization)
    with connect() as conn:
        if claims.get("kind") == "creator":
            from .routes_identity import _ensure_creator_row
            cid = _ensure_creator_row(conn, claims)
            rows = conn.execute(
                "SELECT c.*, b.name AS brand_name, b.logo_url FROM cells c"
                " JOIN brands b USING (brand_id)"
                " JOIN memberships m ON m.brand_id=c.brand_id"
                " WHERE m.creator_id=%s ORDER BY c.cell_id", (cid,)).fetchall()
        elif claims.get("kind") == "brand":
            rows = conn.execute(
                "SELECT c.*, b.name AS brand_name, b.logo_url FROM cells c"
                " JOIN brands b USING (brand_id)"
                " WHERE c.brand_id=%s ORDER BY c.cell_id",
                (claims.get("brand_id"),)).fetchall()
        else:
            rows = conn.execute(
                "SELECT c.*, b.name AS brand_name, b.logo_url FROM cells c"
                " JOIN brands b USING (brand_id) ORDER BY c.cell_id").fetchall()
    return [{"cellId": r["cell_id"], "brandId": r["brand_id"],
             "name": r["name"], "brandName": r["brand_name"],
             "logoUrl": r["logo_url"], "memberCount": r["member_count"]}
            for r in rows]


@router.get("/cells/{cell_id}/messages")
def messages(cell_id: str, channel: str = "", limit: int = 50,
             authorization: str = Header(default="")) -> list[dict]:
    """원문 + 언어별 번역을 함께 반환 — 표시 언어 선택은 클라이언트가,
    원문은 항상 보존·동봉된다."""
    claims = _actor(authorization)
    limit = max(1, min(limit, 200))
    with connect() as conn:
        cell = _cell(conn, cell_id)
        _member_or_owner(conn, claims, cell)
        q = ("SELECT * FROM cell_messages WHERE cell_id=%s"
             + (" AND channel=%s" if channel else "")
             + " ORDER BY at DESC LIMIT %s")
        args = (cell_id, channel, limit) if channel else (cell_id, limit)
        rows = conn.execute(q, args).fetchall()
    return [{"msgId": r["msg_id"], "channel": r["channel"],
             "author": r["author"], "authorKind": r["author_kind"],
             "original": r["original"], "originalLocale": r["original_locale"],
             "translations": r["translations"], "campaignId": r["campaign_id"],
             "at": r["at"].isoformat()} for r in reversed(rows)]


class PostIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    channel: str = "chat"                  # chat | tips (브랜드는 notice 가능)
    locale: str = "ko"


@router.post("/cells/{cell_id}/messages")
def post_message(cell_id: str, body: PostIn,
                 authorization: str = Header(default="")) -> dict:
    claims = _actor(authorization)
    if body.locale not in ALL_LOCALES:
        raise HTTPException(400, "지원 언어: ko/th/en/vi")
    with connect() as conn:
        cell = _cell(conn, cell_id)
        who = _member_or_owner(conn, claims, cell)
        if claims.get("kind") == "creator":
            if body.channel not in ("chat", "tips"):
                raise HTTPException(403, "공지는 브랜드·운영만 게시할 수 있습니다")
            author = conn.execute("SELECT handle FROM creators WHERE creator_id=%s",
                                  (who,)).fetchone()["handle"]
            author_kind = "creator"
        else:
            if body.channel not in ("chat", "tips", "notice"):
                raise HTTPException(400, "channel은 chat/tips/notice")
            author = cell["brand_id"] if claims.get("kind") == "brand" else "admin"
            author_kind = "brand" if claims.get("kind") == "brand" else "ari"
        tr = ai.translate(body.text, body.locale, ALL_LOCALES)
        m = conn.execute(
            "INSERT INTO cell_messages (cell_id, channel, author, author_kind,"
            " original, original_locale, translations)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING msg_id, at",
            (cell_id, body.channel, author, author_kind, body.text,
             body.locale, json.dumps(tr, ensure_ascii=False))).fetchone()
        ledger_append(conn, f"{author_kind}:{author}", "CELL_MESSAGE_POSTED",
                      cell_id, {"channel": body.channel,
                                "msgId": m["msg_id"]})
    return {"msgId": m["msg_id"], "at": m["at"].isoformat(),
            "translations": tr, "original": body.text}
