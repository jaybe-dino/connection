"""운영자 후보 풀 관리 (/admin/pool/*) — 수동/CSV 등록·미리보기·현황.

모집 실사용 경로: harvest 수집 파이프라인이 운영에 연결되기 전까지,
운영자가 공개 비즈니스 연락처 기반 후보를 직접 등록하는 유일한 경로다.

정직성 원칙:
- 이메일은 형식 검사만 통과해도 절대 'valid'로 저장하지 않는다 — 항상
  'none'(미검증). 'valid'는 검증 벤더를 거친 harvest 경로 전용이다.
- 출처(sources)에 등록 방식·운영자·시각을 기록한다.
- 수신거부(outreach_optouts)는 건드리지 않으며 추천 단계에서 계속 제외된다.

보안:
- 관리자 전용(routes_ops.require_admin).
- CSV 셀은 수식 주입 문자(=, @, +, - 시작)를 거부하고, 크기·행수 제한.
- 오류 응답에 셀 원문(이메일 등)을 그대로 반향하지 않는다(행 번호+사유만).
"""

import csv
import io
import json
import re
from datetime import UTC, datetime

from fastapi import APIRouter, Header, HTTPException, Request

from .db import connect, ledger_append
from .routes_ops import require_admin

router = APIRouter(prefix="/admin/pool")

MAX_CSV_CHARS = 262_144          # 256KB
MAX_REQUEST_BYTES = 1_048_576
MAX_ROWS = 500                   # 한 번에 처리하는 행 수
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,24}$")
PLATFORMS = ("tiktok", "instagram", "youtube", "manual")
COLUMNS = ("platform", "platform_uid", "handle", "display_name", "email",
           "country", "lang", "category", "product_tags", "followers", "bio")


def _formula_risk(v: str) -> bool:
    """스프레드시트 수식 주입 위험 셀 — '=', '@', 탭/CR 시작, 모든
    '+'/'-' 시작 값을 거부한다(내보내기·재가공 시 실행 위험)."""
    if not v:
        return False
    return v[0] in ("=", "@", "+", "-", "\t", "\r")



def _split_list(v: str) -> list[str]:
    return [t.strip() for t in re.split(r"[;|,]", v) if t.strip()][:20]


def _normalize_row(raw: dict, line: int) -> tuple[dict | None, str]:
    """한 행 검증·정규화 — (candidate, '') 또는 (None, 사유)."""
    vals = {k: str(raw.get(k, "") or "").strip() for k in COLUMNS}
    for k, v in vals.items():
        if _formula_risk(v):
            return None, f"{k}: 수식/제어 문자로 시작하는 값은 받을 수 없습니다"
        if len(v) > 500:
            return None, f"{k}: 값이 너무 깁니다(500자 제한)"
    handle = vals["handle"].lstrip("@").lower()
    if not re.fullmatch(r"[a-z0-9._-]{2,60}", handle):
        return None, "handle: 2-60자의 영문/숫자/._- 만 허용"
    platform = (vals["platform"] or "tiktok").lower()
    if platform not in PLATFORMS:
        return None, f"platform: {'/'.join(PLATFORMS)} 중 하나"
    uid = (vals["platform_uid"] or handle).lower()
    email = vals["email"].lower()
    if email and not EMAIL_RE.fullmatch(email):
        return None, "email: 형식 오류"
    country = vals["country"].upper()
    if country and not re.fullmatch(r"[A-Z]{2}", country):
        return None, "country: ISO 2자리 코드"
    followers = None
    if vals["followers"]:
        if not vals["followers"].isdigit():
            return None, "followers: 0 이상의 정수"
        followers = min(int(vals["followers"]), 2_000_000_000)
    return {"platform": platform, "platform_uid": uid, "handle": handle,
            "display_name": vals["display_name"][:120] or None,
            "email": email or None, "country": country or None,
            "lang": _split_list(vals["lang"].lower()),
            "category": _split_list(vals["category"]),
            "product_tags": _split_list(vals["product_tags"]),
            "followers": followers, "bio": vals["bio"][:500] or None}, ""


async def _parse_payload(request: Request) -> list[dict]:
    """{csv: "..."} 또는 {rows: [{...}]} — 검증 실패 시 원문 비반향 400."""
    try:
        chunks = bytearray()
        async for chunk in request.stream():
            chunks.extend(chunk)
            if len(chunks) > MAX_REQUEST_BYTES:
                raise HTTPException(413, "요청이 너무 큽니다")
        body = json.loads(chunks)
        if not isinstance(body, dict):
            raise ValueError()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "요청 형식을 확인해 주세요 (JSON)")
    rows = body.get("rows")
    text = body.get("csv")
    if isinstance(text, str) and text.strip():
        if len(text.encode('utf-8')) > MAX_CSV_CHARS:
            raise HTTPException(413, f"CSV가 너무 큽니다 — {MAX_CSV_CHARS // 1024}KB 이하")
        reader = csv.DictReader(io.StringIO(text))
        try:
            fieldnames = reader.fieldnames
        except csv.Error:
            raise HTTPException(400, "CSV 필드 형식 또는 길이를 확인하세요") from None
        if not fieldnames:
            raise HTTPException(400, "CSV 헤더가 필요합니다 (handle,email,country,…)")
        unknown = [f for f in fieldnames
                   if f and f.strip().lower() not in COLUMNS]
        if unknown:
            raise HTTPException(400, "알 수 없는 CSV 컬럼: "
                                + ", ".join(sorted(unknown)[:5])
                                + f" — 허용: {', '.join(COLUMNS)}")
        headers = [(k or "").strip().lower() for k in fieldnames]
        if len(headers) != len(set(headers)) or "" in headers:
            raise HTTPException(400, "CSV 헤더는 비어 있거나 중복될 수 없습니다")
        try:
            rows = []
            for r in reader:
                if None in r:
                    raise HTTPException(400, "CSV 행의 컬럼 수가 헤더와 다릅니다")
                rows.append({k.strip().lower(): v for k, v in r.items()})
                if len(rows) > MAX_ROWS:
                    raise HTTPException(413, f"한 번에 {MAX_ROWS}행까지 처리합니다")
        except csv.Error:
            raise HTTPException(400, "CSV 필드 형식 또는 길이를 확인하세요") from None
    if not isinstance(rows, list) or not rows:
        raise HTTPException(400, "rows 배열 또는 csv 텍스트가 필요합니다")
    if len(rows) > MAX_ROWS:
        raise HTTPException(413, f"한 번에 {MAX_ROWS}행까지 처리합니다")
    if not all(isinstance(r, dict) for r in rows):
        raise HTTPException(400, "각 행은 객체여야 합니다")
    return rows


def _plan(conn, rows: list[dict]) -> list[dict]:
    """행별 실행 계획 — insert / skip(사유) / error(사유). DB 변경 없음."""
    seen_keys: set[tuple] = set()
    seen_emails: set[str] = set()
    plan = []
    for i, raw in enumerate(rows, start=1):
        cand, err = _normalize_row(raw, i)
        if not cand:
            plan.append({"line": i, "action": "error", "reason": err})
            continue
        key = (cand["platform"], cand["platform_uid"])
        if key in seen_keys:
            plan.append({"line": i, "action": "skip",
                         "reason": "파일 내 중복(platform+uid)"})
            continue
        seen_keys.add(key)
        if cand["email"]:
            if cand["email"] in seen_emails:
                plan.append({"line": i, "action": "skip",
                             "reason": "파일 내 중복(email)"})
                continue
            seen_emails.add(cand["email"])
        exists = conn.execute(
            "SELECT 1 FROM creator_pool WHERE platform=%s::platform_t"
            " AND platform_uid=%s", key).fetchone()
        if exists:
            plan.append({"line": i, "action": "skip",
                         "reason": "이미 등록된 후보(platform+uid)"})
            continue
        if cand["email"] and conn.execute(
                "SELECT 1 FROM creator_pool WHERE lower(email)=%s",
                (cand["email"],)).fetchone():
            plan.append({"line": i, "action": "skip",
                         "reason": "이미 등록된 이메일"})
            continue
        plan.append({"line": i, "action": "insert", "candidate": cand})
    return plan


def _summary(plan: list[dict]) -> dict:
    return {"insert": sum(1 for p in plan if p["action"] == "insert"),
            "skip": sum(1 for p in plan if p["action"] == "skip"),
            "error": sum(1 for p in plan if p["action"] == "error")}


def _plan_out(plan: list[dict]) -> list[dict]:
    out = []
    for p in plan:
        row = {"line": p["line"], "action": p["action"],
               "reason": p.get("reason", "")}
        if p["action"] == "insert":
            c = p["candidate"]
            row["preview"] = {"platform": c["platform"], "handle": c["handle"],
                              "email": c["email"], "country": c["country"],
                              "followers": c["followers"],
                              "emailStatus": "none(미검증)" if c["email"]
                                             else "(이메일 없음)"}
        out.append(row)
    return out


@router.post("/candidates/preview")
async def preview_candidates(request: Request,
                             authorization: str = Header(default=""),
                             x_admin_id: str = Header(default=""),
                             x_admin_key: str = Header(default="")) -> dict:
    require_admin(x_admin_id, x_admin_key, authorization)
    rows = await _parse_payload(request)
    with connect() as conn:                   # 미리보기는 SELECT만 — 변경 없음
        plan = _plan(conn, rows)
    return {"rows": _plan_out(plan), "counts": _summary(plan),
            "note": "등록 시 이메일은 전부 '미검증(none)'으로 저장됩니다 — "
                    "형식 검사는 검증이 아닙니다. 실존하지 않는 인물/임의"
                    " 이메일을 등록하지 마세요."}


@router.post("/candidates")
async def import_candidates(request: Request,
                            authorization: str = Header(default=""),
                            x_admin_id: str = Header(default=""),
                            x_admin_key: str = Header(default="")) -> dict:
    info = require_admin(x_admin_id, x_admin_key, authorization)
    admin = str(info.get("admin_id") or "admin")
    rows = await _parse_payload(request)
    now = datetime.now(UTC).isoformat()
    source = {"vendor": f"manual:{admin}", "seen_at": now}
    inserted = 0
    with connect() as conn:
        # Serialize manual imports before their email deduplication query.
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                     ("manual-pool-import",))
        plan = _plan(conn, rows)
        for p in plan:
            if p["action"] != "insert":
                continue
            c = p["candidate"]
            r = conn.execute(
                "INSERT INTO creator_pool (platform, platform_uid, handle,"
                " display_name, country, lang, category, product_tags,"
                " followers, bio, email, email_status, state, sources)"
                " VALUES (%s::platform_t,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,"
                "         'none','POOL',%s)"
                " ON CONFLICT (platform, platform_uid) DO NOTHING"
                " RETURNING creator_id",
                (c["platform"], c["platform_uid"], c["handle"],
                 c["display_name"], c["country"], c["lang"], c["category"],
                 c["product_tags"], c["followers"], c["bio"], c["email"],
                 json.dumps([source]))).fetchone()
            if r:
                inserted += 1
            else:
                p["action"], p["reason"] = "skip", "이미 등록된 후보(경합)"
        if inserted:
            ledger_append(conn, f"admin:{admin}", "POOL_CANDIDATES_IMPORTED",
                          "creator_pool", {"inserted": inserted,
                                           "skipped": _summary(plan)["skip"],
                                           "errors": _summary(plan)["error"]})
    return {"inserted": inserted, "rows": _plan_out(plan),
            "counts": _summary(plan)}


@router.get("/status")
def pool_status(authorization: str = Header(default=""),
                x_admin_id: str = Header(default=""),
                x_admin_key: str = Header(default="")) -> dict:
    """후보 풀 현황 — 후보 수 · 추천 가능 수 · 제외 사유 분해.

    '추천 가능'은 브랜드 추천 API의 필터(이메일 보유, risky 아님,
    EXCLUDED 아님)와 같은 기준이다. 수신거부는 브랜드 단위라 여기서는
    '어느 브랜드든 수신거부한 이메일 수'만 참고로 보여준다."""
    require_admin(x_admin_id, x_admin_key, authorization)
    with connect() as conn:
        g = conn.execute(
            "SELECT count(*) AS total,"
            " count(*) FILTER (WHERE email IS NOT NULL) AS with_email,"
            " count(*) FILTER (WHERE email_status='valid') AS verified,"
            " count(*) FILTER (WHERE email IS NOT NULL AND"
            "                  email_status='none') AS unverified,"
            " count(*) FILTER (WHERE email_status='risky') AS risky,"
            " count(*) FILTER (WHERE email IS NULL) AS no_email,"
            " count(*) FILTER (WHERE state='EXCLUDED') AS excluded,"
            " count(*) FILTER (WHERE email IS NOT NULL"
            "   AND email_status IN ('valid','none')"
            "   AND state <> 'EXCLUDED') AS recommendable"
            " FROM creator_pool").fetchone()
        opted = conn.execute(
            "SELECT count(DISTINCT o.email) AS n FROM outreach_optouts o"
            " WHERE o.opted_out_at IS NOT NULL AND EXISTS"
            " (SELECT 1 FROM creator_pool cp WHERE lower(cp.email)=o.email)"
        ).fetchone()["n"]
        by_country = conn.execute(
            "SELECT COALESCE(country,'??') AS c, count(*) AS n"
            " FROM creator_pool GROUP BY 1 ORDER BY n DESC LIMIT 10"
        ).fetchall()
    return {
        "total": g["total"],
        "recommendable": g["recommendable"],
        "verifiedEmail": g["verified"],
        "unverifiedEmail": g["unverified"],
        "exclusions": {
            "noEmail": g["no_email"],
            "riskyEmail": g["risky"],
            "excludedState": g["excluded"],
            "optedOutEmails": opted,
        },
        "byCountry": [{"country": r["c"], "count": r["n"]}
                      for r in by_country],
        "note": "verified(검증 통과)만 '발송 적합'이며, unverified(미검증)"
                " 후보는 추천에 미검증 표시와 함께 포함됩니다. 수신거부"
                " 이메일은 해당 브랜드 추천·발송에서 제외됩니다.",
    }
