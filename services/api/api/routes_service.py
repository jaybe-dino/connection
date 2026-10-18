"""서비스 전환 핵심 라우터 — 크리에이터 온보딩/TikTok 상태, 인증형 알림,
읽음·스레드·고정·검색, XP/랭킹/미션, 캠페인 라이프사이클, 브랜드 팀,
어드민 정지·감사.

원칙(docs/THEPRLIST_SERVICE_ACCEPTANCE_2026-10-17.md):
- 이메일 로그인 / TikTok 소유 인증 / Shop 자격 / 운영 검증은 **별개 상태**.
  TikTok은 provider 키(TIKTOK_CLIENT_KEY 등)가 없으면 연결 시작이 불가하고
  어떤 경로로도 connected 가 되지 않는다 — 성공 가장 금지.
- XP는 서버가 검증한 이벤트에만, (creator,brand,kind,subject) 유니크로
  1회 지급. 클릭·발송량·중복 제출은 보상하지 않는다.
- 모든 브랜드 데이터는 require_brand / 멤버십 가드로 소속 검증.
"""

import json
import os
import re
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from . import auth
from .auth import require_brand
from .db import connect, ledger_append
from .routes_community import _actor, _cell, _member_or_owner
from .routes_identity import _ensure_creator_row
from .routes_ops import require_admin

router = APIRouter()

CONSENT_VERSION = "creator-v1"
CONSENT_TEXT = ("이용약관·개인정보 처리방침에 동의하고, 브랜드 협업 진행을"
                " 위한 연락(커뮤니티·DM·이메일)에 동의합니다.")

# XP — 서버 검증 이벤트별 1회 포인트 (클릭/발송량 보상 없음)
XP_POINTS = {"join": 50, "first_message": 20, "application": 30,
             "agreement": 60, "content_submitted": 80, "completed": 120}
MISSIONS = [
    ("join", "브랜드 PR 리스트 합류", 50),
    ("first_message", "커뮤니티에 첫 인사 남기기", 20),
    ("application", "캠페인에 신청하기", 30),
    ("agreement", "선정 후 조건 확인(수수료 합의)", 60),
    ("content_submitted", "콘텐츠 제출", 80),
    ("completed", "협업 완료", 120),
]
COUNTRY_RE = re.compile(r"^[A-Z]{2}$")
LANG_RE = re.compile(r"^[a-z]{2}$")


def award_xp(conn, creator_id: str, brand_id: str, kind: str,
             subject: str) -> bool:
    """검증된 이벤트 1회 지급 — 유니크 충돌이면 지급 없음(중복 차단)."""
    pts = XP_POINTS.get(kind)
    if not pts:
        return False
    row = conn.execute(
        "INSERT INTO xp_events (creator_id, brand_id, kind, subject, points)"
        " VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING xp_id",
        (creator_id, brand_id, kind, str(subject), pts)).fetchone()
    return bool(row)


def notify_brand_members(conn, brand_id: str, ntype: str, title: str,
                         body: str = "", target: dict | None = None) -> int:
    """브랜드 멤버 전원에게 알림 — 현재 대화 강제 이동 없음(배지+카드).

    target: 딥링크 정보({brandId, campaignId?, cellId?, msgId?}) — 클릭 시
    이동하는 상세 API가 멤버십/브랜드 가드로 열람 권한을 다시 검증한다."""
    t = {"brandId": brand_id}
    t.update(target or {})
    rows = conn.execute(
        "INSERT INTO notifications (user_id, type, title, body, target)"
        " SELECT DISTINCT u.user_id::text, %s, %s, %s, %s::jsonb"
        " FROM memberships m JOIN users u ON u.creator_id = m.creator_id"
        " WHERE m.brand_id = %s RETURNING notif_id",
        (ntype, title, body, json.dumps(t), brand_id)).fetchall()
    return len(rows)


def _profile(conn, creator_id: str):
    return conn.execute("SELECT * FROM creator_profiles WHERE creator_id=%s",
                        (creator_id,)).fetchone()


def _profile_complete(p) -> bool:
    """온보딩 실데이터 검사 — 과거 onboarded_at만으로는 통과하지 않는다."""
    return bool(p and p["onboarded_at"] and p["country"]
                and (p["ship_countries"] or []) and p["consent_version"])


def _tiktok_verified(p) -> bool:
    """TikTok 소유 인증 — provider 콜백이 저장한 불변 open_id까지 확인."""
    return bool(p and p["tiktok_owner_state"] == "connected"
                and p["tiktok_open_id"])


def require_onboarded(conn, creator_id: str, action: str) -> dict:
    """입장 게이트: 프로필 온보딩(국가·배송국가·필수동의) + TikTok 소유 인증.

    legacy(045 시점 기존 회원)는 차단하지 않고 재연결 안내 대상으로
    통과시킨다 — 신규는 두 조건을 서버에서 모두 충족해야 가입/신청/쓰기가
    가능하다. provider 키 미구성 운영에서는 신규가 인증을 완료할 수 없으며
    이는 외부 승인 대기 blocker로, 수동 확인으로 대체하지 않는다."""
    p = _profile(conn, creator_id)
    # legacy 자격은 045 마이그레이션 시점에 고정(legacy_creators) — 이후의
    # 신규 가입은 멤버십이 생겨도 legacy가 되지 않는다(가입 1회 우회 차단).
    legacy = conn.execute("SELECT 1 FROM legacy_creators WHERE creator_id=%s",
                          (creator_id,)).fetchone()
    if legacy:
        return {"onboarded": _profile_complete(p) and _tiktok_verified(p),
                "legacy": True}
    if not _profile_complete(p):
        raise HTTPException(403, f"{action} 전에 프로필 온보딩(국가·배송 가능"
                                 " 국가·필수 동의)을 완료해 주세요")
    if not _tiktok_verified(p):
        raise HTTPException(403, f"{action} 전에 TikTok 계정 소유 인증을"
                                 " 완료해 주세요 — 인증 전에는 입장이"
                                 " 제한됩니다")
    return {"onboarded": True, "legacy": False}


def check_brand_suspended(conn, brand_id: str) -> None:
    row = conn.execute("SELECT suspended_at FROM brands WHERE brand_id=%s",
                       (brand_id,)).fetchone()
    if row and row["suspended_at"]:
        raise HTTPException(403, "운영팀이 정지한 브랜드입니다 — 문의해 주세요")


# ── 크리에이터 온보딩·프로필 ─────────────────────────────────────

def _me_creator(conn, authorization: str) -> tuple[dict, str]:
    claims = _actor(authorization)
    if claims.get("kind") != "creator":
        raise HTTPException(403, "크리에이터 계정 전용입니다")
    return claims, _ensure_creator_row(conn, claims)


@router.get("/me/profile")
def my_profile(authorization: str = Header(default="")) -> dict:
    with connect() as conn:
        claims, cid = _me_creator(conn, authorization)
        p = _profile(conn, cid)
        verified = conn.execute("SELECT verified FROM creators WHERE"
                                " creator_id=%s", (cid,)).fetchone()["verified"]
        has_membership = bool(conn.execute(
            "SELECT 1 FROM legacy_creators WHERE creator_id=%s",
            (cid,)).fetchone())
        tiktok_configured = _tiktok_available_for(conn, claims["sub"])
    out = {
        "creatorId": cid,
        "country": p["country"] if p else None,
        "languages": p["languages"] if p else [],
        "shipCountries": p["ship_countries"] if p else [],
        "tiktokHandle": p["tiktok_handle"] if p else "",
        "consentVersion": CONSENT_VERSION, "consentText": CONSENT_TEXT,
        "consentedVersion": p["consent_version"] if p else "",
        "onboarded": _profile_complete(p),
        # 입장(합류·신청·쓰기) 준비: 신규는 TikTok 소유 인증까지 필요
        "entryReady": bool(has_membership
                           or (_profile_complete(p) and _tiktok_verified(p))),
        # 별개 상태 4종 — 서로를 대체하지 않는다
        "states": {
            "emailLogin": True,                       # 매직링크 로그인 자체
            "tiktokOwner": p["tiktok_owner_state"] if p else "none",
            "tiktokShop": p["tiktok_shop_state"] if p else "none",
            "opsVerified": bool(verified),
        },
        "tiktokConfigured": tiktok_configured,
        "legacyMember": has_membership and not (p and p["onboarded_at"]),
    }
    return out


class ProfileIn(BaseModel):
    country: str = ""
    languages: list[str] = Field(default_factory=list, max_length=5)
    ship_countries: list[str] = Field(default_factory=list, max_length=10)
    tiktok_handle: str = Field(default="", max_length=60)
    consent_terms: bool = False
    consent_privacy: bool = False


@router.put("/me/profile")
def save_profile(body: ProfileIn,
                 authorization: str = Header(default="")) -> dict:
    country = body.country.strip().upper()
    if country and not COUNTRY_RE.fullmatch(country):
        raise HTTPException(400, "국가는 ISO 2자리 코드입니다")
    langs = [l.strip().lower() for l in body.languages if l.strip()]
    if any(not LANG_RE.fullmatch(l) for l in langs):
        raise HTTPException(400, "언어는 2자리 코드입니다 (예: ko, en, th)")
    ships = [c.strip().upper() for c in body.ship_countries if c.strip()]
    if any(not COUNTRY_RE.fullmatch(c) for c in ships):
        raise HTTPException(400, "배송 국가는 ISO 2자리 코드입니다")
    handle = body.tiktok_handle.strip().lstrip("@")
    if handle and not re.fullmatch(r"[A-Za-z0-9._]{2,60}", handle):
        raise HTTPException(400, "TikTok 핸들 형식을 확인해 주세요")
    complete = bool(country and ships and body.consent_terms
                    and body.consent_privacy)
    now = datetime.now(UTC).isoformat()
    consents = ({"terms": now, "privacy": now}
                if body.consent_terms and body.consent_privacy else {})
    with connect() as conn:
        claims, cid = _me_creator(conn, authorization)
        prev = _profile(conn, cid)
        # 핸들 저장은 소유 인증이 아니다 — 핸들이 바뀌면 소유 상태를 리셋해
        # '입력만으로 인증 완료'가 될 수 없게 한다.
        reset_owner = bool(prev and handle
                           and prev["tiktok_handle"] not in ("", handle))
        conn.execute(
            "INSERT INTO creator_profiles (creator_id, country, languages,"
            " ship_countries, tiktok_handle, consents, consent_version,"
            " onboarded_at, updated_at)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s, CASE WHEN %s THEN now() END, now())"
            " ON CONFLICT (creator_id) DO UPDATE SET"
            "  country=NULLIF(EXCLUDED.country,''),"
            "  languages=EXCLUDED.languages,"
            "  ship_countries=EXCLUDED.ship_countries,"
            "  tiktok_handle=EXCLUDED.tiktok_handle,"
            "  consents=CASE WHEN EXCLUDED.consent_version<>'' THEN"
            "    EXCLUDED.consents ELSE creator_profiles.consents END,"
            "  consent_version=CASE WHEN EXCLUDED.consent_version<>'' THEN"
            "    EXCLUDED.consent_version ELSE creator_profiles.consent_version END,"
            "  tiktok_owner_state=CASE WHEN %s THEN 'none' ELSE"
            "    creator_profiles.tiktok_owner_state END,"
            "  tiktok_open_id=CASE WHEN %s THEN '' ELSE"
            "    creator_profiles.tiktok_open_id END,"
            "  onboarded_at=COALESCE(creator_profiles.onboarded_at,"
            "    CASE WHEN %s THEN now() END),"
            "  updated_at=now()",
            (cid, country or None, langs, ships, handle,
             json.dumps(consents),
             CONSENT_VERSION if consents else "",
             complete, reset_owner, reset_owner, complete))
        ledger_append(conn, f"creator:{cid}", "CREATOR_ONBOARDED" if complete
                      else "CREATOR_PROFILE_UPDATED", cid,
                      {"country": country, "ship": ships,
                       "consent": CONSENT_VERSION if consents else ""})
    return {"ok": True, "onboarded": complete,
            "hint": None if complete else
            "국가·배송 가능 국가·필수 동의를 모두 입력해야 온보딩이 완료됩니다"}


# ── TikTok 소유 인증 (provider 키 없으면 실제 미연결로만 표시) ────

def _tiktok_configured() -> bool:
    return bool(os.environ.get("TIKTOK_CLIENT_KEY")
                and os.environ.get("TIKTOK_CLIENT_SECRET")
                and os.environ.get("TIKTOK_MODE", "production")
                in ("production", "sandbox"))


def _tiktok_available_for(conn, user_id) -> bool:
    """Sandbox keys never open onboarding for ordinary users.

    The allowlist is checked when starting AND consuming OAuth, so removing a
    reviewer immediately blocks an already issued, unfinished authorization.
    Empty allowlists and unknown modes fail closed.
    """
    if not _tiktok_configured():
        return False
    if os.environ.get("TIKTOK_MODE", "production") == "production":
        return True
    allowed = {s.strip().lower() for s in
               os.environ.get("TIKTOK_SANDBOX_ALLOWED_EMAILS", "").split(",")
               if s.strip()}
    row = conn.execute("SELECT email FROM users WHERE user_id=%s AND"
                       " kind='creator' AND state='active'", (user_id,)).fetchone()
    return bool(row and row["email"].strip().lower() in allowed)


@router.get("/me/tiktok")
def tiktok_status(authorization: str = Header(default="")) -> dict:
    with connect() as conn:
        claims, cid = _me_creator(conn, authorization)
        p = _profile(conn, cid)
        configured = _tiktok_available_for(conn, claims["sub"])
    state = p["tiktok_owner_state"] if p else "none"
    return {"configured": configured, "ownerState": state,
            "shopState": p["tiktok_shop_state"] if p else "none",
            "checkedAt": (p["tiktok_owner_checked_at"].isoformat()
                          if p and p["tiktok_owner_checked_at"] else None),
            "hint": (None if configured else
                     "TikTok 공식 연동이 아직 승인 대기 상태입니다 — 연결"
                     " 전까지 신규 계정의 브랜드 가입·캠페인 신청은"
                     " 제한됩니다.")}


@router.post("/me/tiktok/connect-start")
def tiktok_connect_start(authorization: str = Header(default="")) -> dict:
    """소유 인증 시작 — provider OAuth로만 connected 가능.

    키 미설정이면 503: 어떤 임의 입력으로도 인증 완료가 되지 않는다."""
    with connect() as conn:
        claims, cid = _me_creator(conn, authorization)
        if not _tiktok_available_for(conn, claims["sub"]):
            raise HTTPException(503, "TikTok 연동 승인 대기 중 — 지금은"
                                     " 연결할 수 없고 '미연결'로 표시됩니다.")
        state_token = uuid.uuid4().hex
        conn.execute(
            "INSERT INTO creator_profiles (creator_id, tiktok_owner_state,"
            " tiktok_owner_checked_at) VALUES (%s,'pending', now())"
            " ON CONFLICT (creator_id) DO UPDATE SET"
            " tiktok_owner_state='pending', tiktok_owner_checked_at=now(),"
            " updated_at=now()", (cid,))
        row = auth.one_time_token(conn, claims["sub"], "tiktok", 30)
    redirect = os.environ.get("TIKTOK_REDIRECT_URI",
                              "https://api.theprlist.net/tiktok/callback")
    from urllib.parse import urlencode
    q = urlencode({"client_key": os.environ["TIKTOK_CLIENT_KEY"],
                   "response_type": "code", "scope": "user.info.basic",
                   "redirect_uri": redirect, "state": row})
    return {"authUrl": f"https://www.tiktok.com/v2/auth/authorize/?{q}",
            "ownerState": "pending"}


@router.get("/tiktok/callback")
def tiktok_callback(code: str = "", state: str = "", error: str = ""):
    """provider 콜백 — 교환 실패/취소/만료는 그대로 failed/expired.

    성공 판정은 provider 토큰 교환과 사용자 정보 확인을 통과했을 때만."""
    from fastapi.responses import HTMLResponse
    from html import escape
    if not _tiktok_configured():
        raise HTTPException(503, "TikTok 연동 미구성")
    with connect() as conn:
        try:
            u = auth.consume_token(conn, state, "tiktok")
        except HTTPException:
            return HTMLResponse("<h3>연결 만료</h3><p>연결 요청이 만료되었"
                                "습니다 — 앱에서 다시 시도해 주세요.</p>", 400)
        cid = u.get("creator_id")
        if not cid:
            return HTMLResponse("<h3>연결 실패</h3><p>크리에이터 계정이"
                                " 아닙니다.</p>", 400)
        if not _tiktok_available_for(conn, u["user_id"]):
            return HTMLResponse("<h3>연결 제한</h3><p>현재 이 계정은"
                                " TikTok 연결 대상이 아닙니다.</p>", 403)
        if error or not code:
            conn.execute("UPDATE creator_profiles SET tiktok_owner_state="
                         "'failed', tiktok_owner_checked_at=now(),"
                         " updated_at=now() WHERE creator_id=%s", (cid,))
            return HTMLResponse(f"<h3>연결 취소/실패</h3><p>{escape(error or '코드 없음')}"
                                " — 앱에서 다시 연결할 수 있습니다.</p>", 400)
    # 최소 권한 user.info.basic — 소유 검증·저장 키는 provider의 불변
    # open_id. username은 user.info.profile 스코프이므로 요구하지 않고,
    # provider가 함께 주는 경우에만 핸들로 반영한다.
    import httpx
    tok, info = None, None
    try:
        tok = httpx.post("https://open.tiktokapis.com/v2/oauth/token/", data={
            "client_key": os.environ["TIKTOK_CLIENT_KEY"],
            "client_secret": os.environ["TIKTOK_CLIENT_SECRET"],
            "code": code, "grant_type": "authorization_code",
            "redirect_uri": os.environ.get("TIKTOK_REDIRECT_URI",
                "https://api.theprlist.net/tiktok/callback")},
            timeout=15).json()
        if isinstance(tok, dict) and tok.get("access_token") \
                and not tok.get("error"):
            info = httpx.get(
                "https://open.tiktokapis.com/v2/user/info/"
                "?fields=open_id,display_name,avatar_url",
                headers={"Authorization": f"Bearer {tok['access_token']}"},
                timeout=15).json()
    except Exception:
        tok, info = None, None
    user = (((info or {}).get("data") or {}).get("user") or {})
    err_code = str(((info or {}).get("error") or {}).get("code", "ok"))
    open_id = str(user.get("open_id") or "")
    username = str(user.get("username") or "")  # profile 스코프 승인 시에만
    ok = bool(isinstance(tok, dict) and tok.get("access_token") and open_id
              and err_code in ("ok", "", "0"))
    conflict = False
    with connect() as conn:
        if ok:
            other = conn.execute(
                "SELECT creator_id FROM creator_profiles WHERE"
                " tiktok_open_id=%s AND creator_id<>%s",
                (open_id, cid)).fetchone()
            if other:  # 같은 TikTok 계정의 다중 소유 주장 — 충돌로 거절
                ok, conflict = False, True
        conn.execute(
            "UPDATE creator_profiles SET tiktok_owner_state=%s,"
            " tiktok_open_id=CASE WHEN %s THEN %s ELSE tiktok_open_id END,"
            " tiktok_handle=CASE WHEN %s THEN %s ELSE tiktok_handle END,"
            " tiktok_owner_checked_at=now(), updated_at=now()"
            " WHERE creator_id=%s",
            ("connected" if ok else "failed", ok, open_id,
             bool(ok and username), username, cid))
        ledger_append(conn, f"creator:{cid}",
                      "TIKTOK_OWNER_" + ("CONNECTED" if ok else "FAILED"),
                      cid, ({"openId": open_id, "handle": username} if ok else
                            {"conflict": True} if conflict else {}))
    if conflict:
        return HTMLResponse("<h3>확인 실패</h3><p>이 TikTok 계정은 이미 다른"
                            " 크리에이터 계정에 연결되어 있습니다 — 운영팀에"
                            " 문의해 주세요.</p>", 409)
    return HTMLResponse("<h3>✅ TikTok 계정 소유 확인 완료</h3><p>앱으로"
                        " 돌아가 새로고침하세요.</p>" if ok else
                        "<h3>확인 실패</h3><p>TikTok에서 계정 정보를 확인"
                        "하지 못했습니다 — 다시 시도해 주세요.</p>",
                        200 if ok else 400)


@router.post("/me/tiktok/disconnect")
def tiktok_disconnect(authorization: str = Header(default="")) -> dict:
    with connect() as conn:
        claims, cid = _me_creator(conn, authorization)
        conn.execute("UPDATE creator_profiles SET tiktok_owner_state='revoked',"
                     " tiktok_open_id='', updated_at=now()"
                     " WHERE creator_id=%s", (cid,))
    return {"ok": True, "ownerState": "revoked"}


# ── 알림 (인증형) ────────────────────────────────────────────────

@router.get("/me/notifications")
def my_notifications(limit: int = 30,
                     authorization: str = Header(default="")) -> dict:
    claims = _actor(authorization)
    limit = max(1, min(limit, 100))
    with connect() as conn:
        rows = conn.execute(
            "SELECT notif_id, type, title, body, read, created_at, target"
            " FROM notifications WHERE user_id=%s"
            " ORDER BY created_at DESC LIMIT %s",
            (str(claims["sub"]), limit)).fetchall()
        unread = conn.execute(
            "SELECT count(*) n FROM notifications WHERE user_id=%s AND"
            " NOT read", (str(claims["sub"]),)).fetchone()["n"]
    return {"unreadCount": unread,
            "items": [{"id": str(r["notif_id"]), "type": r["type"],
                       "title": r["title"], "body": r["body"],
                       "read": r["read"], "target": r["target"] or {},
                       "at": r["created_at"].isoformat()} for r in rows]}


class NotifReadIn(BaseModel):
    ids: list[str] = Field(default_factory=list, max_length=100)
    all: bool = False


@router.post("/me/notifications/read")
def read_notifications(body: NotifReadIn,
                       authorization: str = Header(default="")) -> dict:
    claims = _actor(authorization)
    with connect() as conn:
        if body.all:
            conn.execute("UPDATE notifications SET read=true WHERE"
                         " user_id=%s", (str(claims["sub"]),))
        elif body.ids:
            conn.execute("UPDATE notifications SET read=true WHERE"
                         " user_id=%s AND notif_id::text = ANY(%s)",
                         (str(claims["sub"]), body.ids))
    return {"ok": True}


# ── 읽음/미읽음·스레드·고정·검색 ─────────────────────────────────

class ReadIn(BaseModel):
    last_msg_id: int = 0


@router.post("/community/cells/{cell_id}/read")
def mark_read(cell_id: str, body: ReadIn,
              authorization: str = Header(default="")) -> dict:
    claims = _actor(authorization)
    with connect() as conn:
        cell = _cell(conn, cell_id)
        _member_or_owner(conn, claims, cell)
        conn.execute(
            "INSERT INTO cell_reads (cell_id, user_id, last_read_msg, read_at)"
            " VALUES (%s,%s,%s,now()) ON CONFLICT (cell_id, user_id) DO UPDATE"
            " SET last_read_msg=GREATEST(cell_reads.last_read_msg,"
            " EXCLUDED.last_read_msg), read_at=now()",
            (cell_id, str(claims["sub"]), max(0, body.last_msg_id)))
    return {"ok": True}


@router.get("/me/unread")
def my_unread(authorization: str = Header(default="")) -> list[dict]:
    """내가 접근 가능한 셀별 미읽음 수 — 배지용. 강제 이동 없음."""
    claims = _actor(authorization)
    uid = str(claims["sub"])
    with connect() as conn:
        if claims.get("kind") == "creator":
            cid = _ensure_creator_row(conn, claims)
            cells = conn.execute(
                "SELECT c.cell_id FROM cells c JOIN memberships m ON"
                " m.brand_id=c.brand_id AND m.creator_id=%s"
                " WHERE c.visibility<>'dm' OR c.cell_id ="
                " 'dm-'||c.brand_id||'--'||m.creator_id", (cid,)).fetchall()
        elif claims.get("kind") == "brand":
            cells = conn.execute("SELECT cell_id FROM cells WHERE brand_id=%s",
                                 (claims.get("brand_id"),)).fetchall()
        else:
            cells = conn.execute("SELECT cell_id FROM cells").fetchall()
        ids = [r["cell_id"] for r in cells]
        if not ids:
            return []
        rows = conn.execute(
            "SELECT m.cell_id, count(*) AS unread, max(m.msg_id) AS last_id"
            " FROM cell_messages m LEFT JOIN cell_reads r ON"
            " r.cell_id=m.cell_id AND r.user_id=%s"
            " WHERE m.cell_id = ANY(%s) AND m.thread_parent IS NULL"
            "   AND m.msg_id > COALESCE(r.last_read_msg, 0)"
            " GROUP BY m.cell_id", (uid, ids)).fetchall()
    return [{"cellId": r["cell_id"], "unread": r["unread"],
             "lastMsgId": r["last_id"]} for r in rows]


@router.get("/community/cells/{cell_id}/messages/{msg_id}/thread")
def thread(cell_id: str, msg_id: int,
           authorization: str = Header(default="")) -> list[dict]:
    claims = _actor(authorization)
    with connect() as conn:
        cell = _cell(conn, cell_id)
        _member_or_owner(conn, claims, cell)
        rows = conn.execute(
            "SELECT * FROM cell_messages WHERE cell_id=%s AND"
            " (msg_id=%s OR thread_parent=%s) ORDER BY msg_id",
            (cell_id, msg_id, msg_id)).fetchall()
    if not rows:
        raise HTTPException(404, "메시지를 찾을 수 없습니다")
    return [{"msgId": r["msg_id"], "author": r["author"],
             "authorKind": r["author_kind"], "original": r["original"],
             "originalLocale": r["original_locale"],
             "translations": r["translations"],
             "translationState": r["translation_state"],
             "threadParent": r["thread_parent"],
             "at": r["at"].isoformat()} for r in rows]


def _team_role(conn, claims: dict, brand_id: str) -> str:
    if claims.get("kind") == "admin":
        return "admin"
    row = conn.execute("SELECT role FROM brand_team_roles WHERE brand_id=%s"
                       " AND user_id=%s::uuid",
                       (brand_id, str(claims.get("sub")))).fetchone()
    if row:
        return row["role"]
    first = conn.execute(
        "SELECT user_id FROM users WHERE brand_id=%s AND kind='brand'"
        " ORDER BY created_at LIMIT 1", (brand_id,)).fetchone()
    return ("owner" if first and str(first["user_id"]) ==
            str(claims.get("sub")) else "manager")


def _pin(cell_id: str, msg_id: int, authorization: str, pin: bool) -> dict:
    claims = _actor(authorization)
    if claims.get("kind") not in ("brand", "admin"):
        raise HTTPException(403, "공지 고정은 브랜드·운영만 할 수 있습니다")
    with connect() as conn:
        cell = _cell(conn, cell_id)
        _member_or_owner(conn, claims, cell)
        row = conn.execute(
            "UPDATE cell_messages SET pinned_at=CASE WHEN %s THEN now() END,"
            " pinned_by=CASE WHEN %s THEN %s ELSE '' END"
            " WHERE cell_id=%s AND msg_id=%s RETURNING msg_id",
            (pin, pin, str(claims.get("sub")), cell_id, msg_id)).fetchone()
        if not row:
            raise HTTPException(404, "메시지를 찾을 수 없습니다")
    return {"ok": True, "pinned": pin}


@router.post("/community/cells/{cell_id}/messages/{msg_id}/pin")
def pin_on(cell_id: str, msg_id: int,
           authorization: str = Header(default="")) -> dict:
    return _pin(cell_id, msg_id, authorization, True)


@router.post("/community/cells/{cell_id}/messages/{msg_id}/unpin")
def pin_off(cell_id: str, msg_id: int,
            authorization: str = Header(default="")) -> dict:
    return _pin(cell_id, msg_id, authorization, False)


@router.get("/community/cells/{cell_id}/search")
def search_messages(cell_id: str, q: str = "",
                    authorization: str = Header(default="")) -> list[dict]:
    claims = _actor(authorization)
    q = q.strip()
    if len(q) < 2:
        raise HTTPException(400, "검색어는 2자 이상")
    with connect() as conn:
        cell = _cell(conn, cell_id)
        _member_or_owner(conn, claims, cell)
        rows = conn.execute(
            "SELECT msg_id, author, author_kind, original, original_locale,"
            " at, thread_parent FROM cell_messages WHERE cell_id=%s AND"
            " (original ILIKE %s OR translations::text ILIKE %s)"
            " ORDER BY msg_id DESC LIMIT 30",
            (cell_id, f"%{q}%", f"%{q}%")).fetchall()
    return [{"msgId": r["msg_id"], "author": r["author"],
             "authorKind": r["author_kind"], "original": r["original"],
             "threadParent": r["thread_parent"],
             "at": r["at"].isoformat()} for r in rows]


# ── XP·랭킹·미션 ────────────────────────────────────────────────

@router.get("/me/xp")
def my_xp(brand: str = "", authorization: str = Header(default="")) -> dict:
    with connect() as conn:
        claims, cid = _me_creator(conn, authorization)
        cond, args = "creator_id=%s", [cid]
        if brand:
            cond += " AND brand_id=%s"
            args.append(brand)
        total = conn.execute(f"SELECT COALESCE(sum(points),0) t FROM xp_events"
                             f" WHERE {cond}", args).fetchone()["t"]
        rows = conn.execute(
            f"SELECT brand_id, kind, subject, points, created_at FROM"
            f" xp_events WHERE {cond} ORDER BY created_at DESC LIMIT 50",
            args).fetchall()
    return {"total": total,
            "events": [{"brandId": r["brand_id"], "kind": r["kind"],
                        "points": r["points"],
                        "at": r["created_at"].isoformat()} for r in rows]}


@router.get("/brands/{brand_id}/ranking")
def brand_ranking(brand_id: str,
                  authorization: str = Header(default="")) -> list[dict]:
    """브랜드별 XP 랭킹 — 그 브랜드 멤버/담당자/운영만 조회."""
    claims = _actor(authorization)
    with connect() as conn:
        if claims.get("kind") == "creator":
            cid = _ensure_creator_row(conn, claims)
            if not conn.execute("SELECT 1 FROM memberships WHERE creator_id=%s"
                                " AND brand_id=%s", (cid, brand_id)).fetchone():
                raise HTTPException(403, "이 브랜드 멤버만 랭킹을 볼 수 있습니다")
        elif claims.get("kind") == "brand":
            if claims.get("brand_id") != brand_id:
                raise HTTPException(403, "이 브랜드에 대한 권한이 없습니다")
        elif claims.get("kind") != "admin":
            raise HTTPException(403, "접근 권한이 없습니다")
        rows = conn.execute(
            "SELECT x.creator_id, c.handle, sum(x.points) AS total"
            " FROM xp_events x JOIN creators c USING (creator_id)"
            " WHERE x.brand_id=%s GROUP BY 1,2 ORDER BY total DESC LIMIT 20",
            (brand_id,)).fetchall()
    return [{"handle": r["handle"], "total": r["total"],
             "rank": i + 1} for i, r in enumerate(rows)]


@router.get("/me/missions")
def my_missions(brand: str = "",
                authorization: str = Header(default="")) -> list[dict]:
    if not brand:
        raise HTTPException(400, "brand 파라미터가 필요합니다")
    with connect() as conn:
        claims, cid = _me_creator(conn, authorization)
        done = {r["kind"] for r in conn.execute(
            "SELECT DISTINCT kind FROM xp_events WHERE creator_id=%s AND"
            " brand_id=%s", (cid, brand)).fetchall()}
    return [{"kind": k, "label": label, "points": pts, "done": k in done}
            for k, label, pts in MISSIONS]


# ── 캠페인 라이프사이클 (브랜드) ─────────────────────────────────

class CampaignIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    product: str = Field(default="", max_length=200)
    usp: str = Field(default="", max_length=500)
    reward_type: str = Field(default="affiliate", pattern="^(paid|gifted|affiliate)$")
    affiliate_pct: float | None = Field(default=None, ge=0, le=90)
    capacity: int = Field(default=0, ge=0, le=10000)
    deadline: str = ""
    countries: list[str] = Field(default_factory=list, max_length=10)


def _parse_deadline(v: str):
    if not v:
        return None
    try:
        return datetime.strptime(v, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "deadline은 YYYY-MM-DD")


def _countries(v: list[str]) -> list[str]:
    out = [c.strip().upper() for c in v if c.strip()]
    if any(not COUNTRY_RE.fullmatch(c) for c in out):
        raise HTTPException(400, "countries는 ISO 2자리 코드 목록")
    return out


@router.post("/brands/{brand_id}/campaigns")
def create_campaign(brand_id: str, body: CampaignIn,
                    authorization: str = Header(default=""),
                    x_admin_key: str = Header(default="")) -> dict:
    require_brand(brand_id, authorization, x_admin_key)
    with connect() as conn:
        check_brand_suspended(conn, brand_id)
        cid = "cmp-" + uuid.uuid4().hex[:12]
        conn.execute(
            "INSERT INTO campaigns (campaign_id, brand_id, name, product,"
            " usp, reward_type, affiliate_pct, capacity, deadline, status,"
            " lifecycle, countries, updated_at)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'open','draft',%s,now())",
            (cid, brand_id, body.name.strip(), body.product.strip(),
             body.usp.strip(), body.reward_type, body.affiliate_pct,
             body.capacity, _parse_deadline(body.deadline),
             _countries(body.countries)))
        ledger_append(conn, f"brand:{brand_id}", "CAMPAIGN_DRAFTED", cid,
                      {"name": body.name.strip()})
    return {"campaignId": cid, "lifecycle": "draft"}


class CampaignPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    product: str | None = Field(default=None, max_length=200)
    usp: str | None = Field(default=None, max_length=500)
    affiliate_pct: float | None = Field(default=None, ge=0, le=90)
    capacity: int | None = Field(default=None, ge=0, le=10000)
    deadline: str | None = None
    countries: list[str] | None = None


@router.patch("/brands/{brand_id}/campaigns/{campaign_id}")
def edit_campaign(brand_id: str, campaign_id: str, body: CampaignPatch,
                  authorization: str = Header(default=""),
                  x_admin_key: str = Header(default="")) -> dict:
    require_brand(brand_id, authorization, x_admin_key)
    sets, args = [], []
    for col, val in [("name", body.name), ("product", body.product),
                     ("usp", body.usp), ("affiliate_pct", body.affiliate_pct),
                     ("capacity", body.capacity)]:
        if val is not None:
            sets.append(f"{col}=%s")
            args.append(val.strip() if isinstance(val, str) else val)
    if body.deadline is not None:
        sets.append("deadline=%s")
        args.append(_parse_deadline(body.deadline))
    if body.countries is not None:
        sets.append("countries=%s")
        args.append(_countries(body.countries))
    if not sets:
        raise HTTPException(400, "변경할 항목이 없습니다")
    with connect() as conn:
        row = conn.execute(
            "SELECT lifecycle FROM campaigns WHERE campaign_id=%s AND"
            " brand_id=%s FOR UPDATE", (campaign_id, brand_id)).fetchone()
        if not row:
            raise HTTPException(404, "캠페인을 찾을 수 없습니다")
        if row["lifecycle"] == "closed":
            raise HTTPException(409, "마감된 캠페인은 수정할 수 없습니다")
        conn.execute("UPDATE campaigns SET " + ", ".join(sets)
                     + ", updated_at=now() WHERE campaign_id=%s",
                     args + [campaign_id])
        ledger_append(conn, f"brand:{brand_id}", "CAMPAIGN_EDITED",
                      campaign_id, {"fields": [s.split("=")[0] for s in sets]})
    return {"ok": True}


@router.post("/brands/{brand_id}/campaigns/{campaign_id}/publish")
def publish_campaign(brand_id: str, campaign_id: str,
                     authorization: str = Header(default=""),
                     x_admin_key: str = Header(default="")) -> dict:
    require_brand(brand_id, authorization, x_admin_key)
    with connect() as conn:
        check_brand_suspended(conn, brand_id)
        row = conn.execute(
            "UPDATE campaigns SET lifecycle='published', status='open',"
            " updated_at=now() WHERE campaign_id=%s AND brand_id=%s AND"
            " lifecycle='draft' RETURNING name", (campaign_id, brand_id)
        ).fetchone()
        if not row:
            cur = conn.execute("SELECT lifecycle FROM campaigns WHERE"
                               " campaign_id=%s AND brand_id=%s",
                               (campaign_id, brand_id)).fetchone()
            if not cur:
                raise HTTPException(404, "캠페인을 찾을 수 없습니다")
            raise HTTPException(409, f"현재 상태({cur['lifecycle']})에서는"
                                     " 발행할 수 없습니다")
        n = notify_brand_members(conn, brand_id, "campaign",
                                 f"새 캠페인: {row['name']}",
                                 "캠페인 탭에서 상세를 확인하고 신청할 수"
                                 " 있어요.", {"campaignId": campaign_id})
        ledger_append(conn, f"brand:{brand_id}", "CAMPAIGN_PUBLISHED",
                      campaign_id, {"notified": n})
    return {"ok": True, "lifecycle": "published", "notified": n}


@router.post("/brands/{brand_id}/campaigns/{campaign_id}/close")
def close_campaign(brand_id: str, campaign_id: str,
                   authorization: str = Header(default=""),
                   x_admin_key: str = Header(default="")) -> dict:
    require_brand(brand_id, authorization, x_admin_key)
    with connect() as conn:
        row = conn.execute(
            "UPDATE campaigns SET lifecycle='closed', status='closed',"
            " updated_at=now() WHERE campaign_id=%s AND brand_id=%s"
            " RETURNING campaign_id", (campaign_id, brand_id)).fetchone()
        if not row:
            raise HTTPException(404, "캠페인을 찾을 수 없습니다")
        ledger_append(conn, f"brand:{brand_id}", "CAMPAIGN_CLOSED",
                      campaign_id, {})
    return {"ok": True, "lifecycle": "closed"}


class RejectIn(BaseModel):
    reason: str = Field(default="", max_length=300)


@router.post("/brands/{brand_id}/campaigns/{campaign_id}/applicants/{creator_id}/reject")
def reject_applicant(brand_id: str, campaign_id: str, creator_id: str,
                     body: RejectIn,
                     authorization: str = Header(default=""),
                     x_admin_key: str = Header(default="")) -> dict:
    require_brand(brand_id, authorization, x_admin_key)
    with connect() as conn:
        camp = conn.execute("SELECT 1 FROM campaigns WHERE campaign_id=%s AND"
                            " brand_id=%s", (campaign_id, brand_id)).fetchone()
        if not camp:
            raise HTTPException(404, "캠페인을 찾을 수 없습니다")
        row = conn.execute(
            "UPDATE campaign_applications SET status='rejected',"
            " rejected_at=now(), reject_reason=%s"
            " WHERE campaign_id=%s AND creator_id=%s AND status='applied'"
            " RETURNING creator_id",
            (body.reason.strip(), campaign_id, creator_id)).fetchone()
        if not row:
            cur = conn.execute(
                "SELECT status FROM campaign_applications WHERE"
                " campaign_id=%s AND creator_id=%s",
                (campaign_id, creator_id)).fetchone()
            if not cur:
                raise HTTPException(404, "지원 내역이 없습니다")
            raise HTTPException(409, f"현재 상태({cur['status']})에서는"
                                     " 반려할 수 없습니다")
        ledger_append(conn, f"brand:{brand_id}", "APPLICATION_REJECTED",
                      campaign_id, {"creator": creator_id})
    return {"ok": True, "status": "rejected"}


# ── 브랜드 팀 ────────────────────────────────────────────────────

@router.get("/brands/{brand_id}/team")
def team_list(brand_id: str, authorization: str = Header(default=""),
              x_admin_key: str = Header(default="")) -> list[dict]:
    claims = require_brand(brand_id, authorization, x_admin_key)
    with connect() as conn:
        rows = conn.execute(
            "SELECT u.user_id, u.email, u.created_at, u.state, r.role"
            " FROM users u LEFT JOIN brand_team_roles r ON"
            " r.brand_id=u.brand_id AND r.user_id=u.user_id"
            " WHERE u.brand_id=%s AND u.kind='brand'"
            " ORDER BY u.created_at", (brand_id,)).fetchall()
    out = []
    for i, r in enumerate(rows):
        out.append({"userId": str(r["user_id"]), "email": r["email"],
                    "state": r["state"],
                    "role": r["role"] or ("owner" if i == 0 else "manager"),
                    "joinedAt": r["created_at"].isoformat()})
    return out


class RoleIn(BaseModel):
    user_id: str
    role: str = Field(pattern="^(owner|manager)$")


@router.post("/brands/{brand_id}/team/role")
def set_team_role(brand_id: str, body: RoleIn,
                  authorization: str = Header(default=""),
                  x_admin_key: str = Header(default="")) -> dict:
    claims = require_brand(brand_id, authorization, x_admin_key)
    with connect() as conn:
        if _team_role(conn, claims, brand_id) not in ("owner", "admin"):
            raise HTTPException(403, "역할 변경은 소유자(owner)만 할 수 있습니다")
        target = conn.execute(
            "SELECT 1 FROM users WHERE user_id=%s::uuid AND brand_id=%s AND"
            " kind='brand'", (body.user_id, brand_id)).fetchone()
        if not target:
            raise HTTPException(404, "이 브랜드의 팀원이 아닙니다")
        conn.execute(
            "INSERT INTO brand_team_roles (brand_id, user_id, role)"
            " VALUES (%s,%s::uuid,%s) ON CONFLICT (brand_id, user_id)"
            " DO UPDATE SET role=EXCLUDED.role",
            (brand_id, body.user_id, body.role))
        ledger_append(conn, f"brand:{brand_id}", "TEAM_ROLE_SET",
                      body.user_id, {"role": body.role,
                                     "by": str(claims.get("sub"))})
    return {"ok": True}


# ── 어드민: 브랜드 정지·감사 로그 ────────────────────────────────

class SuspendIn(BaseModel):
    reason: str = Field(default="", max_length=300)


@router.post("/admin/brands/{brand_id}/suspend")
def suspend_brand(brand_id: str, body: SuspendIn,
                  x_admin_id: str = Header(default=""),
                  x_admin_key: str = Header(default=""),
                  authorization: str = Header(default="")) -> dict:
    info = require_admin(x_admin_id, x_admin_key, authorization)
    with connect() as conn:
        row = conn.execute("UPDATE brands SET suspended_at=now() WHERE"
                           " brand_id=%s AND suspended_at IS NULL"
                           " RETURNING brand_id", (brand_id,)).fetchone()
        if not row:
            exists = conn.execute("SELECT suspended_at FROM brands WHERE"
                                  " brand_id=%s", (brand_id,)).fetchone()
            if not exists:
                raise HTTPException(404, "브랜드 없음")
            return {"ok": True, "suspended": True, "already": True}
        ledger_append(conn, f"admin:{info.get('admin_id', '')}",
                      "BRAND_SUSPENDED", brand_id,
                      {"reason": body.reason.strip()})
    return {"ok": True, "suspended": True}


@router.post("/admin/brands/{brand_id}/resume")
def resume_brand(brand_id: str,
                 x_admin_id: str = Header(default=""),
                 x_admin_key: str = Header(default=""),
                 authorization: str = Header(default="")) -> dict:
    info = require_admin(x_admin_id, x_admin_key, authorization)
    with connect() as conn:
        row = conn.execute("UPDATE brands SET suspended_at=NULL WHERE"
                           " brand_id=%s RETURNING brand_id",
                           (brand_id,)).fetchone()
        if not row:
            raise HTTPException(404, "브랜드 없음")
        ledger_append(conn, f"admin:{info.get('admin_id', '')}",
                      "BRAND_RESUMED", brand_id, {})
    return {"ok": True, "suspended": False}


@router.get("/admin/brands")
def admin_brands(x_admin_id: str = Header(default=""),
                 x_admin_key: str = Header(default=""),
                 authorization: str = Header(default="")) -> list[dict]:
    require_admin(x_admin_id, x_admin_key, authorization)
    with connect() as conn:
        rows = conn.execute(
            "SELECT b.brand_id, b.name, b.is_demo, b.suspended_at,"
            " (SELECT count(*) FROM memberships m WHERE m.brand_id=b.brand_id)"
            "  AS members,"
            " (SELECT count(*) FROM users u WHERE u.brand_id=b.brand_id"
            "  AND u.kind='brand') AS team"
            " FROM brands b ORDER BY b.brand_id").fetchall()
    return [{"brandId": r["brand_id"], "name": r["name"],
             "demo": r["is_demo"], "members": r["members"], "team": r["team"],
             "suspendedAt": (r["suspended_at"].isoformat()
                             if r["suspended_at"] else None)} for r in rows]


@router.get("/admin/audit")
def admin_audit(limit: int = 50, actor: str = "", event: str = "",
                x_admin_id: str = Header(default=""),
                x_admin_key: str = Header(default=""),
                authorization: str = Header(default="")) -> list[dict]:
    require_admin(x_admin_id, x_admin_key, authorization)
    limit = max(1, min(limit, 200))
    cond, args = "TRUE", []
    if actor:
        cond += " AND actor ILIKE %s"
        args.append(f"%{actor}%")
    if event:
        cond += " AND event_type ILIKE %s"
        args.append(f"%{event}%")
    with connect() as conn:
        rows = conn.execute(
            f"SELECT actor, event_type, subject, payload, ts FROM ledger"
            f" WHERE {cond} ORDER BY ts DESC LIMIT %s",
            args + [limit]).fetchall()
    return [{"actor": r["actor"], "event": r["event_type"],
             "subject": r["subject"], "payload": r["payload"],
             "at": r["ts"].isoformat()} for r in rows]
