"""내부 디스코드형 커뮤니티 — 멤버십 검사가 있는 공개 경로 (/community/*).

기존 자산 재사용: cells/cell_messages 스키마(003)와 원문 보존 + 언어별
translations 구조, ai.translate. 레거시 /cells/* 는 검사가 없어 관리자
전용으로 잠겨 있고, 이 라우터가 그 대체 공개 표면이다.

주의: 이것은 서비스 내부 커뮤니티이며 실제 Discord 서버 연동이 아니다.
"""

import json
import logging
import re
import uuid

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from . import ai, auth
from .db import connect, ledger_append

log = logging.getLogger(__name__)

router = APIRouter(prefix="/community")

ALL_LOCALES = ["ko", "th", "en", "vi", "ja"]
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


def _reaction_actor(claims: dict, who: str, cell: dict) -> str:
    """리액션 소유자 키 — 같은 사람의 중복 리액션을 막는 단위."""
    kind = claims.get("kind")
    if kind == "creator":
        return f"creator:{who}"
    if kind == "brand":
        return f"brand:{cell['brand_id']}"
    return "admin"


IMAGE_URL_RE = None  # 아래에서 컴파일 (import 순서 유지)


def _member_or_owner(conn, claims: dict, cell: dict) -> str:
    """접근 자격: 그 브랜드의 멤버 크리에이터 / 그 브랜드 계정 / 어드민."""
    kind = claims.get("kind")
    if kind == "admin":
        return "admin"
    auth.check_suspended(conn, cell["brand_id"])  # 정지 브랜드는 운영만 접근
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
    # 멤버 수는 저장된 cells.member_count(레거시 데모 고정값)가 아니라
    # 실시간 집계다(검수 반영): memberCount = 그 브랜드 PR 리스트 멤버십 수,
    # verifiedCount = 그중 본인 확인(verified) 완료 크리에이터 수.
    counts = (", (SELECT count(*) FROM memberships mm"
              "   WHERE mm.brand_id=c.brand_id) AS live_members"
              ", (SELECT count(*) FROM memberships mm"
              "   JOIN creators cr USING (creator_id)"
              "   WHERE mm.brand_id=c.brand_id AND cr.verified)"
              "   AS live_verified")
    with connect() as conn:
        if claims.get("kind") == "creator":
            from .routes_identity import _ensure_creator_row
            cid = _ensure_creator_row(conn, claims)
            rows = conn.execute(
                "SELECT c.*, b.name AS brand_name, b.logo_url" + counts
                + " FROM cells c"
                " JOIN brands b USING (brand_id)"
                " JOIN memberships m ON m.brand_id=c.brand_id"
                " WHERE m.creator_id=%s"
                "   AND (c.visibility<>'dm'"
                "        OR c.cell_id = 'dm-'||c.brand_id||'--'||m.creator_id)"
                " ORDER BY c.cell_id", (cid,)).fetchall()
        elif claims.get("kind") == "brand":
            rows = conn.execute(
                "SELECT c.*, b.name AS brand_name, b.logo_url" + counts
                + " FROM cells c"
                " JOIN brands b USING (brand_id)"
                " WHERE c.brand_id=%s ORDER BY c.cell_id",
                (claims.get("brand_id"),)).fetchall()
        else:
            rows = conn.execute(
                "SELECT c.*, b.name AS brand_name, b.logo_url" + counts
                + " FROM cells c"
                " JOIN brands b USING (brand_id) ORDER BY c.cell_id").fetchall()
    return [{"cellId": r["cell_id"], "brandId": r["brand_id"],
             "name": r["name"], "brandName": r["brand_name"],
             "logoUrl": r["logo_url"], "memberCount": r["live_members"],
             "verifiedCount": r["live_verified"],
             "kind": "dm" if r["visibility"] == "dm" else "lounge"}
            for r in rows]


@router.get("/cells/{cell_id}/messages")
def messages(cell_id: str, channel: str = "", limit: int = 50,
             campaign_posts: bool = False,
             authorization: str = Header(default="")) -> list[dict]:
    """원문 + 언어별 번역을 함께 반환 — 표시 언어 선택은 클라이언트가,
    원문은 항상 보존·동봉된다."""
    claims = _actor(authorization)
    limit = max(1, min(limit, 200))
    with connect() as conn:
        cell = _cell(conn, cell_id)
        who = _member_or_owner(conn, claims, cell)
        actor = _reaction_actor(claims, who, cell)
        # 스레드 답글은 기본 목록에서 제외(스레드 API로 조회),
        # 고정/답글 수/리액션 수/내 리액션/이미지 동봉
        q = ("SELECT m.*, (SELECT count(*) FROM cell_messages t"
             "  WHERE t.thread_parent=m.msg_id) AS reply_count,"
             " (SELECT count(*) FROM message_reactions rr"
             "  WHERE rr.msg_id=m.msg_id) AS reaction_count,"
             " EXISTS(SELECT 1 FROM message_reactions rr"
             "  WHERE rr.msg_id=m.msg_id AND rr.actor=%s) AS my_reaction"
             " FROM cell_messages m WHERE m.cell_id=%s"
             " AND m.thread_parent IS NULL"
             + (" AND m.channel=%s" if channel else "")
             + (" AND m.campaign_id IS NOT NULL" if campaign_posts else "")
             + " ORDER BY m.pinned_at DESC NULLS LAST, m.at DESC LIMIT %s")
        args = ((actor, cell_id, channel, limit) if channel
                else (actor, cell_id, limit))
        rows = conn.execute(q, args).fetchall()
    return [{"msgId": r["msg_id"], "channel": r["channel"],
             "author": r["author"], "authorKind": r["author_kind"],
             "original": r["original"], "originalLocale": r["original_locale"],
             "translations": r["translations"],
             "translationState": r["translation_state"],
             "campaignId": r["campaign_id"],
             "imageUrl": r["image_url"] or "",
             "reactionCount": r["reaction_count"],
             "myReaction": bool(r["my_reaction"]),
             "pinnedAt": r["pinned_at"].isoformat() if r["pinned_at"] else None,
             "replyCount": r["reply_count"],
             "at": r["at"].isoformat()} for r in reversed(rows)]


CREATOR_CHANNELS = ("chat", "tips", "products", "qna")
BRAND_CHANNELS = ("chat", "tips", "products", "qna", "notice")
# 기본 채널 — brand_channels 에 행이 없으면 이 값 그대로. 기본 채널은 보관할 수 없다.
BASE_CHANNELS = [("notice", "공지사항", "브랜드의 새 소식", "readonly"),
                 ("chat", "자유대화", "멤버 누구나 이야기해요", "public"),
                 ("products", "제품후기", "사용 후기를 나눠요", "public"),
                 ("qna", "질문", "협업·배송 질문", "public"),
                 ("tips", "콘텐츠팁", "촬영·편집 팁을 나눠요", "public")]


def channels_of(conn, cell_id: str, include_archived: bool = False) -> list[dict]:
    """이 셀의 채널 목록(기본 + 브랜드 수정/추가). 크리에이터 메뉴와 콘솔 채널 관리가 같은 목록을 쓴다."""
    rows = {r["key"]: r for r in conn.execute(
        "SELECT b.*, c.name AS campaign_name FROM brand_channels b"
        " LEFT JOIN campaigns c ON c.campaign_id=b.campaign_id"
        " WHERE b.cell_id=%s", (cell_id,)).fetchall()}
    out = []
    for i, (key, name, desc, vis) in enumerate(BASE_CHANNELS):
        r = rows.pop(key, None)
        out.append({"key": key, "name": r["name"] if r else name,
                    "description": r["description"] if r else desc,
                    "visibility": "readonly" if key == "notice" else (r["visibility"] if r else vis),
                    "campaignId": r["campaign_id"] if r else None,
                    "campaignName": r["campaign_name"] if r else None,
                    "archived": False, "base": True, "position": i})
    for r in sorted(rows.values(), key=lambda x: (x["position"], x["created_at"])):
        if r["archived_at"] and not include_archived:
            continue
        out.append({"key": r["key"], "name": r["name"], "description": r["description"],
                    "visibility": r["visibility"], "campaignId": r["campaign_id"],
                    "campaignName": r["campaign_name"],
                    "archived": bool(r["archived_at"]), "base": False, "position": r["position"]})
    return out


def _channel_for_post(conn, cell: dict, channel: str, creator: bool, thread: bool) -> None:
    if cell.get("visibility") == "dm":
        if channel != "chat":
            raise HTTPException(400, "DM 은 chat 채널만 씁니다")
        return
    ch = next((c for c in channels_of(conn, cell["cell_id"]) if c["key"] == channel), None)
    if not ch:
        raise HTTPException(400, "없는 채널이거나 보관된 채널입니다")
    if creator and ch["visibility"] == "readonly" and not thread:
        raise HTTPException(403, "이 채널은 브랜드만 글을 쓸 수 있습니다")


class PostIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    channel: str = "chat"        # chat | tips | products | qna (브랜드는 notice 가능)
    locale: str = "ko"
    thread_parent: int | None = None       # 스레드 답글이면 부모 msg_id
    image_url: str = Field(default="", max_length=500)   # 공개 HTTPS 이미지만


@router.post("/cells/{cell_id}/messages")
def post_message(cell_id: str, body: PostIn,
                 authorization: str = Header(default="")) -> dict:
    claims = _actor(authorization)
    if body.locale not in ALL_LOCALES:
        raise HTTPException(400, "지원 언어: ko/th/en/vi/ja")
    image = (body.image_url or "").strip()
    if image and not re.fullmatch(r"https://[^\s\"'<>]{8,480}", image):
        raise HTTPException(400, "이미지는 공개 https:// 주소만 첨부할 수 있습니다")
    with connect() as conn:
        cell = _cell(conn, cell_id)
        who = _member_or_owner(conn, claims, cell)
        parent = None
        if body.thread_parent:
            parent = conn.execute(
                "SELECT msg_id, thread_parent, channel FROM cell_messages WHERE"
                " msg_id=%s AND cell_id=%s",
                (body.thread_parent, cell_id)).fetchone()
            if not parent:
                raise HTTPException(404, "스레드 원문을 찾을 수 없습니다")
            if parent["thread_parent"]:
                raise HTTPException(400, "답글에는 스레드를 달 수 없습니다 —"
                                         " 원문 스레드에 남겨 주세요")
            # 답글은 원문과 같은 채널에만. 이전 클라이언트는 공지 답글을 'chat' 으로 보냈으므로 공지로 맞춘다
            if parent["channel"] == "notice" and body.channel == "chat":
                body.channel = "notice"
            if parent["channel"] != body.channel:
                raise HTTPException(400, "답글은 원문과 같은 채널에만 달 수 있습니다")
        if claims.get("kind") == "creator":
            _channel_for_post(conn, cell, body.channel, True, bool(body.thread_parent))
            from .routes_service import require_onboarded
            require_onboarded(conn, who, "커뮤니티 글 작성")
            author = conn.execute("SELECT handle FROM creators WHERE creator_id=%s",
                                  (who,)).fetchone()["handle"]
            author_kind = "creator"
        else:
            _channel_for_post(conn, cell, body.channel, False, bool(body.thread_parent))
            author = cell["brand_id"] if claims.get("kind") == "brand" else "admin"
            author_kind = "brand" if claims.get("kind") == "brand" else "ari"
        # 원문 선저장(pending) — 번역 API 장애에도 메시지는 잃지 않는다.
        # 이 블록이 커밋된 뒤에야 번역을 시도하고, 실패하면 러너가 재시도한다.
        m = conn.execute(
            "INSERT INTO cell_messages (cell_id, channel, author, author_kind,"
            " original, original_locale, translations, translation_state,"
            " thread_parent, image_url)"
            " VALUES (%s,%s,%s,%s,%s,%s,'{}','pending',%s,%s)"
            " RETURNING msg_id, at",
            (cell_id, body.channel, author, author_kind, body.text,
             body.locale, body.thread_parent, image)).fetchone()
        if author_kind == "creator":
            from .routes_service import award_xp
            award_xp(conn, who, cell["brand_id"], "first_message",
                     cell["brand_id"])
        if body.channel == "notice" and not body.thread_parent:
            # 공지 발행 → 브랜드 멤버 전원 알림(배지+카드, 강제 이동 없음)
            from .routes_service import notify_brand_members
            notify_brand_members(conn, cell["brand_id"], "notice",
                                 "새 공지: " + body.text[:60],
                                 "커뮤니티 공지 채널에서 전체 내용을 확인"
                                 "하세요.", {"cellId": cell_id,
                                             "msgId": m["msg_id"],
                                             "channel": "notice"})
        ledger_append(conn, f"{author_kind}:{author}", "CELL_MESSAGE_POSTED",
                      cell_id, {"channel": body.channel,
                                "msgId": m["msg_id"],
                                "thread": bool(body.thread_parent)})
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


class ReactionIn(BaseModel):
    on: bool = True


@router.post("/cells/{cell_id}/messages/{msg_id}/reaction")
def toggle_reaction(cell_id: str, msg_id: int, body: ReactionIn,
                    authorization: str = Header(default="")) -> dict:
    """메시지 ♡ 리액션 — 사람당 1개 토글. 멤버십/브랜드 가드 동일."""
    claims = _actor(authorization)
    with connect() as conn:
        cell = _cell(conn, cell_id)
        who = _member_or_owner(conn, claims, cell)
        actor = _reaction_actor(claims, who, cell)
        msg = conn.execute(
            "SELECT 1 FROM cell_messages WHERE msg_id=%s AND cell_id=%s",
            (msg_id, cell_id)).fetchone()
        if not msg:
            raise HTTPException(404, "메시지를 찾을 수 없습니다")
        if body.on:
            conn.execute(
                "INSERT INTO message_reactions (msg_id, actor)"
                " VALUES (%s,%s) ON CONFLICT DO NOTHING", (msg_id, actor))
        else:
            conn.execute(
                "DELETE FROM message_reactions WHERE msg_id=%s AND actor=%s",
                (msg_id, actor))
        count = conn.execute(
            "SELECT count(*) c FROM message_reactions WHERE msg_id=%s",
            (msg_id,)).fetchone()["c"]
    return {"msgId": msg_id, "count": count, "mine": body.on}


@router.post("/cells/{cell_id}/messages/{msg_id}/translation-retry")
def retry_failed_translation(cell_id: str, msg_id: int,
                             authorization: str = Header(default="")) -> dict:
    """failed 확정 메시지의 번역 수동 재시도 — 브랜드(자기 셀)·운영 전용.

    크레딧 소진 등으로 MAX_TRANSLATION_ATTEMPTS를 다 쓴 메시지는 러너가
    다시 집지 않으므로, 충전 후 이 경로로 재큐한다. failed→pending 전환을
    조건부 UPDATE로 원자화해 중복 클릭/중복 작업을 막고, 원문은 절대
    수정하지 않는다. 즉시 1회 시도하고, 미완이면 러너가 이어서 재시도한다."""
    claims = _actor(authorization)
    with connect() as conn:
        cell = _cell(conn, cell_id)
        _member_or_owner(conn, claims, cell)     # 타 브랜드 403 포함
        if claims.get("kind") not in ("brand", "admin"):
            raise HTTPException(403, "번역 재시도는 브랜드·운영만 할 수 있습니다")
        row = conn.execute(
            "SELECT translation_state FROM cell_messages"
            " WHERE msg_id=%s AND cell_id=%s", (msg_id, cell_id)).fetchone()
        if not row:
            raise HTTPException(404, "메시지를 찾을 수 없습니다")
        if row["translation_state"] == "done":
            raise HTTPException(409, "이미 번역이 완료된 메시지입니다")
        if row["translation_state"] == "pending":
            raise HTTPException(409, "자동 재시도 대기 중입니다 — 잠시 후 확인하세요")
        claimed = conn.execute(
            "UPDATE cell_messages SET translation_state='pending',"
            " translation_attempts=0"
            " WHERE msg_id=%s AND cell_id=%s AND translation_state='failed'"
            " RETURNING original, original_locale, translations",
            (msg_id, cell_id)).fetchone()
        if not claimed:                          # 동시 클릭 — 한쪽만 집는다
            raise HTTPException(409, "이미 재시도가 진행 중입니다")
        ledger_append(conn, f"{claims.get('kind')}:{claims.get('email', '')}",
                      "TRANSLATION_RETRY_REQUESTED", cell_id,
                      {"msgId": msg_id})
        # Hold the row lock through the immediate attempt so the runner skips it.
        # On process failure the transaction rolls back to failed, safe to retry.
        merged, state = dict(claimed["translations"] or {}), "pending"
        try:
            tr = ai.translate(claimed["original"], claimed["original_locale"],
                              ALL_LOCALES) or {}
            merged.update(tr)
            if translation_complete(merged, claimed["original_locale"]):
                state = "done"
        except Exception:
            log.exception("수동 재시도 즉시 번역 실패 — 러너 재시도로 이어짐"
                          " (msg %s)", msg_id)
        conn.execute(
            "UPDATE cell_messages SET translations=%s, translation_state=%s,"
            " translation_attempts=1"
            " WHERE msg_id=%s AND translation_state='pending'",
            (json.dumps(merged, ensure_ascii=False), state, msg_id))
        final = conn.execute(
            "SELECT translation_state, translations FROM cell_messages"
            " WHERE msg_id=%s", (msg_id,)).fetchone()
    out = {"msgId": msg_id, "translationState": final["translation_state"],
           "translations": final["translations"]}
    if final["translation_state"] != "done":
        out["hint"] = ("이번 시도는 완료되지 않았습니다 — 원문은 보존되며"
                       " 자동 재시도가 이어집니다. API 크레딧/키 상태를"
                       " 확인하세요.")
    return out


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


# ── 채널 관리 (v8.1 B11/C11) — 브랜드가 추가·이름 변경·공개 범위·캠페인 연결·보관,
#    크리에이터 메뉴는 GET channels 로 같은 목록을 그린다 ──────────────

def _clean_name(v):
    if v is None:
        return v
    return str(v).strip()


class ChannelIn(BaseModel):
    name: str = Field(max_length=40)
    _n = field_validator("name", mode="before")(_clean_name)
    description: str = Field(default="", max_length=120)
    visibility: str = Field(default="public", pattern="^(public|readonly)$")
    campaign_id: str | None = Field(default=None, max_length=100)


class ChannelPatch(BaseModel):
    name: str | None = Field(default=None, max_length=40)
    _n = field_validator("name", mode="before")(_clean_name)
    description: str | None = Field(default=None, max_length=120)
    visibility: str | None = Field(default=None, pattern="^(public|readonly)$")
    campaign_id: str | None = Field(default=None, max_length=100)
    clear_campaign: bool = False
    archived: bool | None = None


def _lounge_owner(conn, claims: dict, cell_id: str) -> dict:
    cell = _cell(conn, cell_id)
    if cell.get("visibility") == "dm":
        raise HTTPException(400, "DM 에는 채널이 없습니다")
    if _member_or_owner(conn, claims, cell) not in ("brand", "admin"):
        raise HTTPException(403, "채널 관리는 브랜드·운영만 할 수 있습니다")
    return cell


def _campaign_of_cell(conn, cell: dict, campaign_id: str | None) -> str | None:
    if not campaign_id:
        return None
    if not conn.execute("SELECT 1 FROM campaigns WHERE campaign_id=%s AND brand_id=%s",
                        (campaign_id, cell["brand_id"])).fetchone():
        raise HTTPException(404, "이 브랜드의 캠페인이 아닙니다")
    return campaign_id


def _name_taken(conn, cell_id: str, name: str, except_key: str = "") -> bool:
    return any(c["key"] != except_key and c["name"].strip().lower() == name.strip().lower()
               for c in channels_of(conn, cell_id))


@router.get("/cells/{cell_id}/channels")
def list_channels(cell_id: str, authorization: str = Header(default="")) -> list[dict]:
    claims = _actor(authorization)
    with connect() as conn:
        cell = _cell(conn, cell_id)
        who = _member_or_owner(conn, claims, cell)
        if cell.get("visibility") == "dm":
            return []
        return channels_of(conn, cell_id, include_archived=who in ("brand", "admin"))


@router.post("/cells/{cell_id}/channels")
def add_channel(cell_id: str, body: ChannelIn, authorization: str = Header(default="")) -> dict:
    claims = _actor(authorization)
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", ("channels:" + cell_id,))
        cell = _lounge_owner(conn, claims, cell_id)
        if not body.name:
            raise HTTPException(400, "채널 이름을 적어 주세요 (공백만은 안 돼요)")
        if _name_taken(conn, cell_id, body.name):
            raise HTTPException(409, "같은 이름의 채널이 이미 있습니다")
        if conn.execute("SELECT count(*) n FROM brand_channels WHERE cell_id=%s AND archived_at IS NULL"
                        " AND key NOT IN ('chat','products','qna','tips','notice')", (cell_id,)).fetchone()["n"] >= 20:
            raise HTTPException(409, "추가 채널은 20개까지 만들 수 있습니다")
        key = "ch-" + uuid.uuid4().hex[:8]
        conn.execute("INSERT INTO brand_channels (cell_id, key, name, description, visibility, campaign_id)"
                     " VALUES (%s,%s,%s,%s,%s,%s)",
                     (cell_id, key, body.name.strip(), body.description.strip(), body.visibility,
                      _campaign_of_cell(conn, cell, body.campaign_id)))
        ledger_append(conn, f"{claims.get('kind')}:{claims.get('brand_id') or claims.get('sub')}",
                      "CHANNEL_ADDED", cell_id, {"key": key, "name": body.name.strip()})
        return next(c for c in channels_of(conn, cell_id) if c["key"] == key)


@router.patch("/cells/{cell_id}/channels/{key}")
def edit_channel(cell_id: str, key: str, body: ChannelPatch, authorization: str = Header(default="")) -> dict:
    claims = _actor(authorization)
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", ("channels:" + cell_id,))
        cell = _lounge_owner(conn, claims, cell_id)
        if body.name is not None and not body.name:
            raise HTTPException(400, "채널 이름을 적어 주세요 (공백만은 안 돼요)")
        cur = next((c for c in channels_of(conn, cell_id, include_archived=True) if c["key"] == key), None)
        if not cur:
            raise HTTPException(404, "채널을 찾을 수 없습니다")
        if body.archived is not None and cur["base"]:
            raise HTTPException(409, "기본 채널은 보관할 수 없습니다")
        if key == "notice" and body.visibility == "public":
            raise HTTPException(409, "공지사항 채널은 읽기 전용입니다")
        name = body.name.strip() if body.name is not None else cur["name"]
        if body.name is not None and _name_taken(conn, cell_id, name, key):
            raise HTTPException(409, "같은 이름의 채널이 이미 있습니다")
        if body.archived is False and _name_taken(conn, cell_id, name, key):
            raise HTTPException(409, "같은 이름의 사용 중 채널이 있어 다시 사용할 수 없습니다")
        campaign = None if body.clear_campaign else (
            _campaign_of_cell(conn, cell, body.campaign_id) if body.campaign_id else cur["campaignId"])
        vals = (name, body.description.strip() if body.description is not None else cur["description"],
                body.visibility or cur["visibility"], campaign)
        archived_sql = ("now()" if body.archived else "NULL") if body.archived is not None else (
            "now()" if cur["archived"] else "NULL")
        conn.execute("INSERT INTO brand_channels (cell_id, key, name, description, visibility, campaign_id, position)"
                     f" VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (cell_id, key) DO UPDATE SET"
                     f" name=EXCLUDED.name, description=EXCLUDED.description, visibility=EXCLUDED.visibility,"
                     f" campaign_id=EXCLUDED.campaign_id, archived_at={archived_sql}, updated_at=now()",
                     (cell_id, key) + vals + (cur["position"],))
        ledger_append(conn, f"{claims.get('kind')}:{claims.get('brand_id') or claims.get('sub')}",
                      "CHANNEL_EDITED", cell_id, {"key": key, "archived": body.archived})
        return next(c for c in channels_of(conn, cell_id, include_archived=True) if c["key"] == key)
