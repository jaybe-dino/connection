"""어드민: 고객 브랜드 직접 등록 + 브랜드 로그인 계정 관리.

원칙:
- 인증은 require_admin_jwt(실계정 JWT + OTP 완료)만 — 간이 키 대체 불가.
- 등록은 원자적(단일 트랜잭션) + 감사 로그. 약관 동의·학습 확인을 실제
  사용자가 한 것처럼 기록하지 않는다(termsConfirmed:false, confirmed:false).
- 초기 설정(72h)·재설정(30m) 링크는 "준비"만 한다 — 자동 메일 발송 없음,
  원문 토큰은 응답으로만 전달하고 로그/감사 payload에는 넣지 않는다.
  같은 종류 토큰은 새로 발급할 때 이전 것을 전부 폐기한다.
- 비밀번호 원문 조회·관리자 임의 설정 금지 — 사용자가 링크로 직접 설정.
- 중지/역할 변경/세션 철회는 session_epoch 상승 + 미사용 토큰 폐기로
  기존 JWT·링크를 즉시 무효화한다. 다른 브랜드/어드민/크리에이터 계정은
  이 라우터로 조작할 수 없다. 마지막 활성 owner는 중지·강등 불가.
- 계정 이메일 이전/삭제는 범위 밖.

기존 recruitment setup(JSON 반입, chief+theprlist 회사 관리 주소)은
routes_recruitment_setup에 그대로 보존된다 — 이 라우터는 일반 담당자
이메일용 일반 등록 경로다.
"""
import os
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import auth
from .auth import require_admin_jwt
from .db import connect, ledger_append

router = APIRouter(dependencies=[Depends(require_admin_jwt)])

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,39}$")
RESERVED_SLUGS = {"www", "api", "admin", "app", "console", "signup",
                  "privacy", "terms", "dino-recruitment"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
COUNTRY_RE = re.compile(r"^[A-Z]{2}$")
SETUP_TTL_MIN = 60 * 72          # 초기 설정 72시간
RESET_TTL_MIN = 30               # 재설정 30분


def _console_url() -> str:
    return os.environ.get("BRAND_CONSOLE_URL", "https://console.theprlist.net")


def brand_account_lock(conn, brand_id: str) -> None:
    """브랜드 단위 직렬화 — 동시 역할 변경/중지로 마지막 owner 보호가
    깨지지 않게 모든 계정 변이 경로(어드민·콘솔 team/role)가 같은 키를 잡는다."""
    conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                 ("brand-accounts:" + brand_id,))


def _brand_accounts(conn, brand_id: str) -> list[dict]:
    """브랜드 계정 + 유효 역할(legacy fallback: 최초 생성 계정 = owner)."""
    rows = conn.execute(
        "SELECT u.user_id, u.email, u.state, u.created_at, u.last_login_at,"
        " u.password_hash IS NOT NULL AS pw_set, r.role"
        " FROM users u LEFT JOIN brand_team_roles r"
        "   ON r.brand_id=u.brand_id AND r.user_id=u.user_id"
        " WHERE u.brand_id=%s AND u.kind='brand'"
        " ORDER BY u.created_at", (brand_id,)).fetchall()
    out = []
    for i, r in enumerate(rows):
        out.append({"userId": str(r["user_id"]), "email": r["email"],
                    "state": r["state"],
                    "role": r["role"] or ("owner" if i == 0 else "manager"),
                    "passwordSet": r["pw_set"],
                    "lastLoginAt": (r["last_login_at"].isoformat()
                                    if r["last_login_at"] else None),
                    "createdAt": r["created_at"].isoformat()})
    return out


def _target_account(conn, brand_id: str, user_id: str) -> dict:
    """이 브랜드의 brand 계정만 조작 가능 — 타 브랜드/어드민/크리에이터 차단."""
    accounts = _brand_accounts(conn, brand_id)
    for a in accounts:
        if a["userId"] == str(user_id):
            return a
    raise HTTPException(404, "이 브랜드의 로그인 계정이 아닙니다")


def _assert_not_last_active_owner(conn, brand_id: str, user_id: str,
                                  action: str) -> None:
    accounts = _brand_accounts(conn, brand_id)
    owners = [a for a in accounts
              if a["role"] == "owner" and a["state"] == "active"]
    if len(owners) == 1 and owners[0]["userId"] == str(user_id):
        raise HTTPException(409, f"마지막 활성 소유자(owner)는 {action}할 수"
                                 " 없습니다 — 먼저 다른 소유자를 지정하세요")


def invalidate_sessions(conn, user_id) -> int:
    """역할 변경/중지/전체 로그아웃 공통 — session_epoch 상승 + 미사용
    1회용 토큰(invite/reset/magic) 전부 폐기. 기존 JWT와 떠 있는 링크가
    즉시 무효화된다(콘솔 team/role 경로도 이 헬퍼를 공유)."""
    auth.bump_session_epoch(conn, user_id)
    return _revoke_tokens(conn, user_id, ("invite", "reset", "magic"))


def _revoke_tokens(conn, user_id, kinds: tuple[str, ...]) -> int:
    rows = conn.execute(
        "UPDATE auth_tokens SET used_at=now()"
        " WHERE user_id=%s AND kind=ANY(%s) AND used_at IS NULL"
        " RETURNING token_id", (user_id, list(kinds))).fetchall()
    return len(rows)


# ── (1) 브랜드 직접 등록 ─────────────────────────────────────────

class BrandRegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    slug: str = Field(min_length=3, max_length=40)
    category: str = Field(default="", max_length=60)
    countries: list[str] = Field(default_factory=list, max_length=10)
    manager_email: str = Field(min_length=5, max_length=200)


@router.post("/admin/brands")
def register_brand(body: BrandRegisterIn,
                   admin: dict = Depends(require_admin_jwt)) -> dict:
    slug = body.slug.lower().strip()
    name = body.name.strip()
    email = body.manager_email.strip().lower()
    countries = [c.strip().upper() for c in body.countries if c.strip()]
    if len(name) < 2:
        raise HTTPException(400, "브랜드 이름을 2자 이상 입력해 주세요")
    if not SLUG_RE.fullmatch(slug) or slug in RESERVED_SLUGS \
            or slug.startswith("qa-"):
        raise HTTPException(400, "slug는 소문자/숫자/하이픈 3~40자이며 예약어"
                                 "(www/api/admin/app/console/signup 등)는 쓸 수 없습니다")
    if not EMAIL_RE.fullmatch(email):
        raise HTTPException(400, "담당자 이메일 형식을 확인해 주세요")
    if any(not COUNTRY_RE.fullmatch(c) for c in countries):
        raise HTTPException(400, "타깃 국가는 ISO 2자리 코드입니다 (예: KR, TH)")
    with connect() as conn:
        # 가입 신청(/applications)과 같은 잠금 키로 직렬화 — 동시 중복 방지
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                     ("application:" + slug,))
        # 같은 이메일 동시 등록/계정 추가 직렬화 (검사-후-삽입 경합 방지)
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                     ("account-email:" + email,))
        if conn.execute("SELECT 1 FROM brands WHERE brand_id=%s",
                        (slug,)).fetchone():
            raise HTTPException(409, "이미 등록된 브랜드 주소(slug)입니다")
        if conn.execute("SELECT 1 FROM brand_applications WHERE slug=%s"
                        " AND status='pending'", (slug,)).fetchone():
            raise HTTPException(409, "같은 주소(slug)의 가입 신청이 검토 대기"
                                     " 중입니다 — 신청 승인/반려를 먼저 처리하세요")
        existing = conn.execute(
            "SELECT kind, brand_id FROM users WHERE email=%s",
            (email,)).fetchone()
        if existing:
            who = {"creator": "크리에이터", "admin": "어드민"}.get(
                existing["kind"], f"브랜드({existing['brand_id']})")
            raise HTTPException(409, f"담당자 이메일이 이미 {who} 계정으로 사용"
                                     " 중입니다 — 기존 계정 전환은 지원하지 않으니"
                                     " 다른 이메일을 사용하세요")
        conn.execute(
            "INSERT INTO brands (brand_id, name, category, locale, plan)"
            " VALUES (%s,%s,%s,'ko','per_signup')",
            (slug, name, body.category.strip()))
        from .routes_community import ensure_default_cell
        ensure_default_cell(conn, slug, name)
        # 운영자 참고 프로필 v1 — 실제 사용자가 확인한 것처럼 기록하지 않는다
        import json as _json
        fields = {}
        if countries:
            fields["countries"] = {"value": ",".join(countries),
                                   "source": "operator_reference",
                                   "confirmed": False}
        if body.category.strip():
            fields["category"] = {"value": body.category.strip(),
                                  "source": "operator_reference",
                                  "confirmed": False}
        conn.execute(
            "INSERT INTO brand_profile_versions (brand_id, version, fields,"
            " note) VALUES (%s, 1, %s, 'admin_registered')",
            (slug, _json.dumps(fields)))
        u = conn.execute(
            "INSERT INTO users (kind, email, brand_id)"
            " VALUES ('brand',%s,%s) ON CONFLICT (email) DO NOTHING"
            " RETURNING user_id", (email, slug)).fetchone()
        if not u:   # 경합 백스톱 — 유니크 충돌을 500이 아니라 409로, 전체 롤백
            raise HTTPException(409, "담당자 이메일이 방금 다른 계정에 사용"
                                     "되었습니다 — 다른 이메일을 사용하세요")
        conn.execute(
            "INSERT INTO brand_team_roles (brand_id, user_id, role)"
            " VALUES (%s,%s,'owner')", (slug, u["user_id"]))
        ledger_append(conn, f"admin:{admin.get('sub','')}",
                      "ADMIN_BRAND_REGISTERED", slug,
                      {"name": name, "category": body.category.strip(),
                       "countries": countries, "managerEmail": email,
                       "plan": "per_signup", "termsConfirmed": False})
    return {"brandId": slug, "managerUserId": str(u["user_id"]),
            "plan": "per_signup", "passwordSet": False}


# ── (2) 브랜드 로그인 계정 관리 ──────────────────────────────────

def _brand_or_404(conn, brand_id: str) -> dict:
    b = conn.execute("SELECT brand_id, name FROM brands WHERE brand_id=%s",
                     (brand_id,)).fetchone()
    if not b:
        raise HTTPException(404, "브랜드를 찾을 수 없습니다")
    return b


@router.get("/admin/brands/{brand_id}/accounts")
def list_accounts(brand_id: str) -> list[dict]:
    with connect() as conn:
        _brand_or_404(conn, brand_id)
        return _brand_accounts(conn, brand_id)


class AccountIn(BaseModel):
    email: str = Field(min_length=5, max_length=200)
    role: str = Field(default="manager", pattern="^(owner|manager)$")


@router.post("/admin/brands/{brand_id}/accounts")
def add_account(brand_id: str, body: AccountIn,
                admin: dict = Depends(require_admin_jwt)) -> dict:
    email = body.email.strip().lower()
    if not EMAIL_RE.fullmatch(email):
        raise HTTPException(400, "이메일 형식을 확인해 주세요")
    with connect() as conn:
        _brand_or_404(conn, brand_id)
        brand_account_lock(conn, brand_id)
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                     ("account-email:" + email,))
        existing = conn.execute(
            "SELECT kind, brand_id FROM users WHERE email=%s",
            (email,)).fetchone()
        if existing:
            who = ("이미 이 브랜드의 계정"
                   if existing["kind"] == "brand"
                   and existing["brand_id"] == brand_id else
                   {"creator": "크리에이터", "admin": "어드민"}.get(
                       existing["kind"], f"다른 브랜드({existing['brand_id']})")
                   + " 계정으로 사용 중")
            raise HTTPException(409, f"이 이메일은 {who}입니다 — 기존 계정"
                                     " 전환은 지원하지 않습니다")
        u = conn.execute(
            "INSERT INTO users (kind, email, brand_id)"
            " VALUES ('brand',%s,%s) ON CONFLICT (email) DO NOTHING"
            " RETURNING user_id", (email, brand_id)).fetchone()
        if not u:   # 경합 백스톱 — 500 대신 409로 정상 롤백
            raise HTTPException(409, "이 이메일이 방금 다른 계정에 사용"
                                     "되었습니다 — 다른 이메일을 사용하세요")
        conn.execute(
            "INSERT INTO brand_team_roles (brand_id, user_id, role)"
            " VALUES (%s,%s,%s)", (brand_id, u["user_id"], body.role))
        ledger_append(conn, f"admin:{admin.get('sub','')}",
                      "BRAND_ACCOUNT_CREATED", str(u["user_id"]),
                      {"brand": brand_id, "email": email, "role": body.role})
    return {"userId": str(u["user_id"]), "email": email, "role": body.role,
            "state": "active", "passwordSet": False}


@router.post("/admin/brands/{brand_id}/accounts/{user_id}/setup-link")
def prepare_setup_link(brand_id: str, user_id: str,
                       admin: dict = Depends(require_admin_jwt)) -> dict:
    """초기 비밀번호 설정 링크(72h) 준비 — 발송 없음, 기존 비밀번호 보호."""
    with connect() as conn:
        brand_account_lock(conn, brand_id)
        a = _target_account(conn, brand_id, user_id)
        if a["state"] != "active":
            raise HTTPException(409, "중지된 계정입니다 — 먼저 재개하세요")
        if a["passwordSet"]:
            raise HTTPException(409, "이미 비밀번호가 설정된 계정입니다 —"
                                     " 재설정 링크를 사용하세요")
        _revoke_tokens(conn, user_id, ("invite",))   # 새 발급 = 이전 동종 폐기
        raw = auth.one_time_token(conn, user_id, "invite", SETUP_TTL_MIN)
        # 감사 payload에 토큰 원문을 넣지 않는다
        ledger_append(conn, f"admin:{admin.get('sub','')}",
                      "BRAND_ACCOUNT_SETUP_LINK", str(user_id),
                      {"brand": brand_id, "ttlHours": 72})
    return {"link": f"{_console_url()}/?invite={raw}", "ttlHours": 72,
            "note": "자동 발송되지 않습니다 — 담당자에게 직접 전달하세요."}


@router.post("/admin/brands/{brand_id}/accounts/{user_id}/reset-link")
def prepare_reset_link(brand_id: str, user_id: str,
                       admin: dict = Depends(require_admin_jwt)) -> dict:
    """기존 계정 비밀번호 재설정 링크(30분) 준비 — 발송 없음."""
    with connect() as conn:
        brand_account_lock(conn, brand_id)
        a = _target_account(conn, brand_id, user_id)
        if a["state"] != "active":
            raise HTTPException(409, "중지된 계정입니다 — 먼저 재개하세요")
        if not a["passwordSet"]:
            raise HTTPException(409, "아직 비밀번호가 없는 계정입니다 —"
                                     " 초기 설정 링크를 사용하세요")
        _revoke_tokens(conn, user_id, ("reset",))
        raw = auth.one_time_token(conn, user_id, "reset", RESET_TTL_MIN)
        ledger_append(conn, f"admin:{admin.get('sub','')}",
                      "BRAND_ACCOUNT_RESET_LINK", str(user_id),
                      {"brand": brand_id, "ttlMinutes": RESET_TTL_MIN})
    return {"link": f"{_console_url()}/?reset={raw}",
            "ttlMinutes": RESET_TTL_MIN,
            "note": "자동 발송되지 않습니다 — 담당자에게 직접 전달하세요."}


class StateIn(BaseModel):
    active: bool


@router.post("/admin/brands/{brand_id}/accounts/{user_id}/state")
def set_account_state(brand_id: str, user_id: str, body: StateIn,
                      admin: dict = Depends(require_admin_jwt)) -> dict:
    with connect() as conn:
        brand_account_lock(conn, brand_id)
        a = _target_account(conn, brand_id, user_id)
        if body.active:
            conn.execute("UPDATE users SET state='active' WHERE user_id=%s",
                         (user_id,))
        else:
            _assert_not_last_active_owner(conn, brand_id, user_id, "중지")
            conn.execute("UPDATE users SET state='disabled' WHERE user_id=%s",
                         (user_id,))
            invalidate_sessions(conn, user_id)          # 기존 JWT·링크 즉시 무효
        ledger_append(conn, f"admin:{admin.get('sub','')}",
                      "BRAND_ACCOUNT_" + ("RESUMED" if body.active
                                          else "SUSPENDED"),
                      str(user_id), {"brand": brand_id, "email": a["email"]})
    return {"ok": True, "state": "active" if body.active else "disabled"}


class RoleChangeIn(BaseModel):
    role: str = Field(pattern="^(owner|manager)$")


@router.post("/admin/brands/{brand_id}/accounts/{user_id}/role")
def set_account_role(brand_id: str, user_id: str, body: RoleChangeIn,
                     admin: dict = Depends(require_admin_jwt)) -> dict:
    with connect() as conn:
        brand_account_lock(conn, brand_id)
        a = _target_account(conn, brand_id, user_id)
        if a["role"] == body.role:
            return {"ok": True, "role": body.role, "changed": False}
        if body.role == "manager":
            _assert_not_last_active_owner(conn, brand_id, user_id, "강등")
        conn.execute(
            "INSERT INTO brand_team_roles (brand_id, user_id, role)"
            " VALUES (%s,%s,%s) ON CONFLICT (brand_id, user_id)"
            " DO UPDATE SET role=EXCLUDED.role",
            (brand_id, user_id, body.role))
        invalidate_sessions(conn, user_id)              # 권한 변경 → 재로그인 + 링크 폐기
        ledger_append(conn, f"admin:{admin.get('sub','')}",
                      "BRAND_ACCOUNT_ROLE_SET", str(user_id),
                      {"brand": brand_id, "email": a["email"],
                       "role": body.role})
    return {"ok": True, "role": body.role, "changed": True}


@router.post("/admin/brands/{brand_id}/accounts/{user_id}/revoke-sessions")
def revoke_sessions(brand_id: str, user_id: str,
                    admin: dict = Depends(require_admin_jwt)) -> dict:
    with connect() as conn:
        brand_account_lock(conn, brand_id)
        a = _target_account(conn, brand_id, user_id)
        revoked = invalidate_sessions(conn, user_id)
        ledger_append(conn, f"admin:{admin.get('sub','')}",
                      "BRAND_ACCOUNT_SESSIONS_REVOKED", str(user_id),
                      {"brand": brand_id, "email": a["email"],
                       "openTokensRevoked": revoked})
    return {"ok": True, "openTokensRevoked": revoked}
