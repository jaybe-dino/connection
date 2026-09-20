"""브랜드 아이덴티티(로고·태그라인) + 크리에이터 멤버십 가입 완주.

가입 과금 사슬: 크리에이터 로그인(매직링크 JWT) → POST /me/join →
memberships INSERT → (검증 완료 시) signup_usage 트리거가 5,000원 사용량 기록.
검증(verified)은 어드민이 확인 후 켠다 — SNS OAuth 승인 전까지 사람 검증.
같은 (브랜드, 크리에이터) 중복 가입은 PK·UNIQUE가 무과금을 보장한다.
"""

import logging
import re
import uuid

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from . import auth
from .db import connect, ledger_append

log = logging.getLogger(__name__)
router = APIRouter()

_LOGO_RE = re.compile(r"^(https://|data:image/(png|jpeg|webp|svg\+xml);base64,)")
LOGO_MAX = 200_000   # data URI 상한 (~200KB)


# ── 아이덴티티 ───────────────────────────────────────────────────

@router.get("/brands/{brand_id}/identity")
def get_identity(brand_id: str) -> dict:
    """공개 표시 정보 — 가입/커뮤니티 화면이 브랜드명·로고를 그릴 때 사용."""
    with connect() as conn:
        b = conn.execute(
            "SELECT brand_id, name, category, logo_url, tagline, is_demo"
            " FROM brands WHERE brand_id=%s", (brand_id,)).fetchone()
    if not b:
        raise HTTPException(404, "brand not found")
    return {"brandId": b["brand_id"], "name": b["name"],
            "category": b["category"], "logoUrl": b["logo_url"],
            "tagline": b["tagline"], "isDemo": b["is_demo"]}


class IdentityIn(BaseModel):
    logo_url: str = ""
    tagline: str = ""


@router.put("/brands/{brand_id}/identity")
def put_identity(brand_id: str, body: IdentityIn,
                 authorization: str = Header(default=""),
                 x_admin_key: str = Header(default="")) -> dict:
    auth.require_brand(brand_id, authorization, x_admin_key)
    logo = body.logo_url.strip()
    if logo and (not _LOGO_RE.match(logo) or len(logo) > LOGO_MAX):
        raise HTTPException(
            400, "로고는 https URL 또는 200KB 이하 data:image/…(png·jpeg·webp·svg)")
    tagline = body.tagline.strip()[:120]
    with connect() as conn:
        b = conn.execute(
            "UPDATE brands SET logo_url=%s, tagline=%s WHERE brand_id=%s"
            " RETURNING brand_id", (logo, tagline, brand_id)).fetchone()
        if not b:
            raise HTTPException(404, "brand not found")
        ledger_append(conn, f"brand:{brand_id}", "BRAND_IDENTITY_UPDATED",
                      brand_id, {"hasLogo": bool(logo)})
    return get_identity(brand_id)


# ── 멤버십 가입 완주 (크리에이터 JWT) ────────────────────────────

def _require_creator(authorization: str) -> dict:
    u = auth.current_user(authorization)
    if not u or u.get("kind") != "creator":
        raise HTTPException(401, "크리에이터 로그인이 필요합니다 (이메일 매직링크)")
    return u


def _ensure_creator_row(conn, claims: dict) -> str:
    """users(kind=creator) ↔ creators 행 연결 — 없으면 만든다 (미검증 상태)."""
    if claims.get("creator_id"):
        row = conn.execute("SELECT creator_id FROM creators WHERE creator_id=%s",
                           (claims["creator_id"],)).fetchone()
        if row:
            return row["creator_id"]
    u = conn.execute("SELECT * FROM users WHERE user_id=%s",
                     (claims["sub"],)).fetchone()
    if not u:
        raise HTTPException(401, "계정을 찾을 수 없습니다")
    if u["creator_id"]:
        return u["creator_id"]
    handle = (u["email"].split("@")[0] or "creator")[:40]
    cid = f"c-{uuid.uuid4().hex[:10]}"
    conn.execute(
        "INSERT INTO creators (creator_id, handle, platform, verified)"
        " VALUES (%s,%s,'tiktok',false)", (cid, handle))
    conn.execute("UPDATE users SET creator_id=%s WHERE user_id=%s",
                 (cid, u["user_id"]))
    ledger_append(conn, f"creator:{u['email']}", "CREATOR_PROFILE_CREATED",
                  cid, {"handle": handle})
    return cid


class JoinIn(BaseModel):
    brand_id: str


@router.post("/me/join")
def join_brand(body: JoinIn,
               authorization: str = Header(default="")) -> dict:
    claims = _require_creator(authorization)
    with connect() as conn:
        b = conn.execute("SELECT brand_id, name, is_demo FROM brands"
                         " WHERE brand_id=%s", (body.brand_id,)).fetchone()
        if not b:
            raise HTTPException(404, "brand not found")
        cid = _ensure_creator_row(conn, claims)
        ins = conn.execute(
            "INSERT INTO memberships (creator_id, brand_id) VALUES (%s,%s)"
            " ON CONFLICT DO NOTHING RETURNING creator_id",
            (cid, body.brand_id)).fetchone()
        c = conn.execute("SELECT verified FROM creators WHERE creator_id=%s",
                         (cid,)).fetchone()
        billed = conn.execute(
            "SELECT 1 FROM signup_usage WHERE brand_id=%s AND creator_id=%s",
            (body.brand_id, cid)).fetchone()
        if ins:
            ledger_append(conn, f"creator:{cid}", "MEMBERSHIP_JOINED",
                          body.brand_id, {"verified": c["verified"],
                                          "demo": b["is_demo"]})
    return {"creatorId": cid, "brandId": body.brand_id,
            "joined": bool(ins), "alreadyMember": not bool(ins),
            "verified": c["verified"], "billable": bool(billed),
            "note": ("검증 완료 후 과금 대상이 됩니다" if not c["verified"]
                     else "중복 가입은 재과금되지 않습니다" if not ins else "")}


@router.get("/me/memberships")
def my_memberships(authorization: str = Header(default="")) -> list[dict]:
    claims = _require_creator(authorization)
    with connect() as conn:
        cid = _ensure_creator_row(conn, claims)
        rows = conn.execute(
            "SELECT m.brand_id, m.joined_at, b.name, b.logo_url, b.tagline"
            " FROM memberships m JOIN brands b USING (brand_id)"
            " WHERE m.creator_id=%s ORDER BY m.joined_at", (cid,)).fetchall()
    return [{"brandId": r["brand_id"], "name": r["name"],
             "logoUrl": r["logo_url"], "tagline": r["tagline"],
             "joinedAt": r["joined_at"].isoformat()} for r in rows]


# ── 어드민: 크리에이터 검증 (검증 = 과금 트리거 발화 조건) ───────

@router.post("/admin/creators/{creator_id}/verify")
def verify_creator(creator_id: str,
                   authorization: str = Header(default=""),
                   x_admin_id: str = Header(default=""),
                   x_admin_key: str = Header(default="")) -> dict:
    from .routes_ops import require_admin
    admin_user = require_admin(x_admin_id, x_admin_key, authorization)
    with connect() as conn:
        c = conn.execute(
            "UPDATE creators SET verified=true WHERE creator_id=%s"
            " RETURNING creator_id, verified", (creator_id,)).fetchone()
        if not c:
            raise HTTPException(404, "creator not found")
        usage = conn.execute(
            "SELECT brand_id, unit_price FROM signup_usage WHERE creator_id=%s",
            (creator_id,)).fetchall()
        ledger_append(conn, f"admin:{admin_user.get('admin_id', 'jwt')}",
                      "CREATOR_VERIFIED", creator_id,
                      {"billedBrands": [u["brand_id"] for u in usage]})
    return {"creatorId": creator_id, "verified": True,
            "billed": [{"brandId": u["brand_id"], "unitPrice": u["unit_price"]}
                       for u in usage]}
