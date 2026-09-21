"""내부 디스코드형 커뮤니티 — 멤버십 검사가 있는 공개 경로 (/community/*).

기존 자산 재사용: cells/cell_messages 스키마(003)와 원문 보존 + 언어별
translations 구조, ai.translate. 레거시 /cells/* 는 검사가 없어 관리자
전용으로 잠겨 있고, 이 라우터가 그 대체 공개 표면이다.

주의: 이것은 서비스 내부 커뮤니티이며 실제 Discord 서버 연동이 아니다.
"""

import json
import logging
import uuid

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from . import ai, auth
from .db import connect, ledger_append

log = logging.getLogger(__name__)

router = APIRouter(prefix="/community")

ALL_LOCALES = ["ko", "th", "en", "vi"]
MAX_TRANSLATION_ATTEMPTS = 5


def translation_complete(tr: dict, source_locale: str) -> bool:
    """번역 완료 판정 — 즉시 경로와 러너가 같은 기준을 쓴다(검수 반영).

    모든 대상 언어가 비어 있지 않게 존재해야 하고, 키 미설정 폴백 태그
    ("[xx·번역대기] …")는 완료로 치지 않는다. 부분·빈 결과는 pending."""
    for t in ALL_LOCALES:
        if t == source_locale:
            continue
        v = (tr or {}).get(t)
        if not v or not str(v).strip():
            return False
        if str(v).startswith(f"[{t}·번역대기]"):
            return False
    return True


def ensure_default_cell(conn, brand_id: str, brand_name: str) -> str:
    """브랜드 기본 커뮤니티 셀을 멱등 생성 — 승인 직후·백필(026) 공용."""
    cell_id = f"cell-{brand_id}-main"
    conn.execute(
        "INSERT INTO cells (cell_id, brand_id, name, visibility, member_count)"
        " VALUES (%s,%s,%s,'apply_approve',0)"
        " ON CONFLICT (cell_id) DO NOTHING",
        (cell_id, brand_id, f"{brand_name} 라운지"))
    return cell_id


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


def _dm_cell_id(brand_id: str, creator_id: str) -> str:
    return f"dm-{brand_id}--{creator_id}"


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
        # 담당자 1:1 DM 셀은 그 크리에이터 본인만 (같은 브랜드 멤버라도 차단)
        if cell["visibility"] == "dm" and cell["cell_id"] != _dm_cell_id(
                cell["brand_id"], cid):
            raise HTTPException(403, "본인 DM만 열람할 수 있습니다")
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
                " WHERE m.creator_id=%s"
                "   AND (c.visibility<>'dm'"
                "        OR c.cell_id = 'dm-'||c.brand_id||'--'||m.creator_id)"
                " ORDER BY c.cell_id", (cid,)).fetchall()
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
             "logoUrl": r["logo_url"], "memberCount": r["member_count"],
             "kind": "dm" if r["visibility"] == "dm" else "lounge"}
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
             "translations": r["translations"],
             "translationState": r["translation_state"],
             "campaignId": r["campaign_id"],
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
        # 원문 선저장(pending) — 번역 API 장애에도 메시지는 잃지 않는다.
        # 이 블록이 커밋된 뒤에야 번역을 시도하고, 실패하면 러너가 재시도한다.
        m = conn.execute(
            "INSERT INTO cell_messages (cell_id, channel, author, author_kind,"
            " original, original_locale, translations, translation_state)"
            " VALUES (%s,%s,%s,%s,%s,%s,'{}','pending') RETURNING msg_id, at",
            (cell_id, body.channel, author, author_kind, body.text,
             body.locale)).fetchone()
        ledger_append(conn, f"{author_kind}:{author}", "CELL_MESSAGE_POSTED",
                      cell_id, {"channel": body.channel,
                                "msgId": m["msg_id"]})
    tr, state = {}, "pending"
    try:
        tr = ai.translate(body.text, body.locale, ALL_LOCALES) or {}
        # 빈 결과·대상 언어 누락·번역대기 폴백은 완료가 아니다 — 러너가 재시도
        if translation_complete(tr, body.locale):
            state = "done"
    except Exception:
        log.exception("번역 실패 — 원문은 저장됨, 러너가 재시도 (msg %s)",
                      m["msg_id"])
    with connect() as conn:
        conn.execute(
            "UPDATE cell_messages SET translations = translations || %s::jsonb,"
            " translation_state=%s, translation_attempts=1 WHERE msg_id=%s",
            (json.dumps(tr, ensure_ascii=False), state, m["msg_id"]))
    return {"msgId": m["msg_id"], "at": m["at"].isoformat(),
            "translations": tr, "translationState": state,
            "original": body.text}


def retry_pending_translations(limit: int = 10) -> dict:
    """러너 틱 — pending 메시지 번역 재시도. FOR UPDATE SKIP LOCKED로
    다중 워커 중복 처리를 막고, 시도 한도 초과 시 'failed'로 확정한다."""
    done = failed = 0
    with connect() as conn:
        rows = conn.execute(
            "SELECT msg_id, original, original_locale, translations,"
            " translation_attempts"
            " FROM cell_messages WHERE translation_state='pending'"
            " ORDER BY at LIMIT %s FOR UPDATE SKIP LOCKED", (limit,)).fetchall()
        for r in rows:
            terminal = r["translation_attempts"] + 1 >= MAX_TRANSLATION_ATTEMPTS
            try:
                tr = ai.translate(r["original"], r["original_locale"],
                                  ALL_LOCALES) or {}
                # 부분 결과는 병합해 보존하되, 완료 판정은 즉시 경로와 동일 기준
                merged = {**(r["translations"] or {}), **tr}
                complete = translation_complete(merged, r["original_locale"])
                state = ("done" if complete
                         else "failed" if terminal else "pending")
                conn.execute(
                    "UPDATE cell_messages SET translations=%s,"
                    " translation_state=%s,"
                    " translation_attempts=translation_attempts+1"
                    " WHERE msg_id=%s",
                    (json.dumps(merged, ensure_ascii=False), state,
                     r["msg_id"]))
                if complete:
                    done += 1
                elif terminal:
                    failed += 1
                    log.warning("번역 %s회 미완 — failed 확정 (msg %s, 원문 보존)",
                                MAX_TRANSLATION_ATTEMPTS, r["msg_id"])
            except Exception:
                conn.execute(
                    "UPDATE cell_messages SET translation_attempts="
                    " translation_attempts+1, translation_state=%s"
                    " WHERE msg_id=%s",
                    ("failed" if terminal else "pending", r["msg_id"]))
                if terminal:
                    failed += 1
                    log.warning("번역 %s회 실패 — failed 확정 (msg %s, 원문 보존)",
                                MAX_TRANSLATION_ATTEMPTS, r["msg_id"])
    return {"scanned": len(rows), "done": done, "failed": failed}


# ── 담당자 1:1 DM — 크리에이터 ↔ 브랜드 담당자 (셀 인프라 재사용) ──

@router.post("/dm/{brand_id}")
def open_dm(brand_id: str, authorization: str = Header(default="")) -> dict:
    """크리에이터가 자기 멤버십 브랜드 담당자와의 DM 셀을 연다(멱등)."""
    claims = _actor(authorization)
    if claims.get("kind") != "creator":
        raise HTTPException(403, "크리에이터만 DM을 시작할 수 있습니다")
    with connect() as conn:
        b = conn.execute("SELECT name FROM brands WHERE brand_id=%s",
                         (brand_id,)).fetchone()
        if not b:
            raise HTTPException(404, "브랜드를 찾을 수 없습니다")
        from .routes_identity import _ensure_creator_row
        cid = _ensure_creator_row(conn, claims)
        m = conn.execute(
            "SELECT 1 FROM memberships WHERE creator_id=%s AND brand_id=%s",
            (cid, brand_id)).fetchone()
        if not m:
            raise HTTPException(403, "이 브랜드 멤버십이 필요합니다")
        dm_id = _dm_cell_id(brand_id, cid)
        created = conn.execute(
            "INSERT INTO cells (cell_id, brand_id, name, visibility,"
            " member_count) VALUES (%s,%s,%s,'dm',1)"
            " ON CONFLICT (cell_id) DO NOTHING RETURNING cell_id",
            (dm_id, brand_id, f"{b['name']} 담당자 DM")).fetchone()
        if created:
            ledger_append(conn, f"creator:{cid}", "DM_OPENED", dm_id,
                          {"brand": brand_id})
    return {"cellId": dm_id, "brandId": brand_id, "kind": "dm"}


@router.get("/dm")
def list_dms(authorization: str = Header(default="")) -> list[dict]:
    """브랜드: 내 브랜드로 열린 DM 목록 / 크리에이터: 내가 연 DM 목록."""
    claims = _actor(authorization)
    with connect() as conn:
        if claims.get("kind") == "brand":
            rows = conn.execute(
                "SELECT c.*, b.name AS brand_name FROM cells c"
                " JOIN brands b USING (brand_id)"
                " WHERE c.brand_id=%s AND c.visibility='dm'"
                " ORDER BY c.cell_id", (claims.get("brand_id"),)).fetchall()
        elif claims.get("kind") == "creator":
            from .routes_identity import _ensure_creator_row
            cid = _ensure_creator_row(conn, claims)
            rows = conn.execute(
                "SELECT c.*, b.name AS brand_name FROM cells c"
                " JOIN brands b USING (brand_id)"
                " WHERE c.visibility='dm'"
                "   AND c.cell_id = 'dm-'||c.brand_id||'--'||%s"
                " ORDER BY c.cell_id", (cid,)).fetchall()
        else:
            rows = conn.execute(
                "SELECT c.*, b.name AS brand_name FROM cells c"
                " JOIN brands b USING (brand_id) WHERE c.visibility='dm'"
                " ORDER BY c.cell_id").fetchall()
    out = []
    for r in rows:
        counterpart = r["cell_id"].split("--", 1)[-1]
        out.append({"cellId": r["cell_id"], "brandId": r["brand_id"],
                    "brandName": r["brand_name"], "name": r["name"],
                    "creatorId": counterpart})
    return out
