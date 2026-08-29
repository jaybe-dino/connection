"""운영 라우트 — 브랜드 신청·신고·분쟁·제출/검수 + 어드민 (ADMIN_PLAN.md).

어드민 인증은 X-Admin-Id 헤더 스텁 — 오픈 전 실인증(2FA) 필수(기획 §6).
모든 조치는 원장(ledger)에 이벤트로 남는다.
"""

import json
from datetime import timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from .compliance import check_content
from .db import connect, ledger_append

public = APIRouter()
admin = APIRouter(prefix="/admin")

SEVERE_SLA_H, NORMAL_SLA_H = 24, 72


def _j(v) -> str:
    return json.dumps(v, ensure_ascii=False)


def require_admin(x_admin_id: str = Header(default=""),
                  x_admin_key: str = Header(default="")) -> dict:
    """간이 인증 — ADMIN_KEY 환경변수를 설정하면 X-Admin-Key 헤더까지 검사.
    오픈 전 실인증(2FA)으로 교체 필수 (ADMIN_PLAN §6)."""
    import os

    required_key = os.environ.get("ADMIN_KEY", "")
    if required_key and x_admin_key != required_key:
        raise HTTPException(401, "어드민 키 불일치 (X-Admin-Key)")
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM admin_users WHERE admin_id=%s AND active",
            (x_admin_id,)).fetchone()
    if not row:
        raise HTTPException(401, "어드민 인증 필요 (X-Admin-Id)")
    return row


# ════════════════ 브랜드 가입 신청 ════════════════

class ApplicationIn(BaseModel):
    slug: str
    name: str
    biz_no: str = ""
    category: str = ""
    countries: list[str] = []
    plan: str = "growth"
    site_url: str = ""
    answers: dict[str, str] = {}
    contact: str = ""


@public.post("/applications")
def submit_application(body: ApplicationIn) -> dict:
    slug = body.slug.lower().strip()
    with connect() as conn:
        taken = conn.execute(
            "SELECT 1 FROM brands WHERE brand_id=%s"
            " UNION SELECT 1 FROM brand_applications WHERE slug=%s AND status='pending'",
            (slug, slug)).fetchone()
        if taken:
            raise HTTPException(409, f"슬러그 '{slug}' 사용 불가 (사용 중이거나 심사 중)")
        row = conn.execute(
            "INSERT INTO brand_applications (slug, name, biz_no, category, countries,"
            " plan, site_url, answers, contact)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING app_id",
            (slug, body.name, body.biz_no, body.category, body.countries,
             body.plan, body.site_url, _j(body.answers), body.contact)).fetchone()
        ledger_append(conn, "system", "BRAND_APPLIED", slug,
                      {"app_id": str(row["app_id"]), "plan": body.plan})
    return {"app_id": str(row["app_id"]), "status": "pending",
            "message": "신청이 접수됐어요 — 운영팀 승인 후 콘솔이 열립니다"}


@public.get("/applications/{slug}/status")
def application_status(slug: str) -> dict:
    with connect() as conn:
        row = conn.execute(
            "SELECT status, reject_reason FROM brand_applications WHERE slug=%s"
            " ORDER BY created_at DESC LIMIT 1", (slug.lower(),)).fetchone()
    if not row:
        raise HTTPException(404, "신청 없음")
    return {"status": row["status"], "reject_reason": row["reject_reason"]}


@admin.get("/applications")
def list_applications(status: str = "pending",
                      _admin: dict = Depends(require_admin)) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM brand_applications WHERE status=%s ORDER BY created_at",
            (status,)).fetchall()
    return [
        {"appId": str(r["app_id"]), "slug": r["slug"], "name": r["name"],
         "bizNo": r["biz_no"], "category": r["category"], "countries": r["countries"],
         "plan": r["plan"], "siteUrl": r["site_url"], "answers": r["answers"],
         "contact": r["contact"], "at": r["created_at"].isoformat()}
        for r in rows
    ]


def _decidable_app(conn, app_id: str) -> dict:
    row = conn.execute(
        "SELECT * FROM brand_applications WHERE app_id=%s FOR UPDATE",
        (app_id,)).fetchone()
    if not row:
        raise HTTPException(404, "신청 없음")
    if row["status"] != "pending":
        raise HTTPException(409, f"이미 {row['status']}")
    return row


@admin.post("/applications/{app_id}/approve")
def approve_application(app_id: str, admin_user: dict = Depends(require_admin)) -> dict:
    with connect() as conn:
        app_row = _decidable_app(conn, app_id)
        conn.execute(
            "INSERT INTO brands (brand_id, name, category, locale, plan)"
            " VALUES (%s,%s,%s,'ko',%s)",
            (app_row["slug"], app_row["name"], app_row["category"], app_row["plan"]))
        # 아리 학습 답변 → 브랜드 프로필 v1 (확인됨 처리 — 모집 시작 가능)
        answers = app_row["answers"] or {}
        fields = {k: {"value": v, "source": "onboarding_qa", "confirmed": True}
                  for k, v in answers.items()}
        conn.execute(
            "INSERT INTO brand_profile_versions (brand_id, version, fields, note)"
            " VALUES (%s, 1, %s, 'onboarding')",
            (app_row["slug"], _j(fields)))
        conn.execute(
            "UPDATE brand_applications SET status='approved', decided_by=%s,"
            " decided_at=now() WHERE app_id=%s", (admin_user["admin_id"], app_id))
        ledger_append(conn, f"admin:{admin_user['admin_id']}", "BRAND_APPROVED",
                      app_row["slug"], {"app_id": app_id, "plan": app_row["plan"]})
    return {"ok": True, "brandId": app_row["slug"]}


class Reject(BaseModel):
    reason: str


@admin.post("/applications/{app_id}/reject")
def reject_application(app_id: str, body: Reject,
                       admin_user: dict = Depends(require_admin)) -> dict:
    with connect() as conn:
        app_row = _decidable_app(conn, app_id)
        conn.execute(
            "UPDATE brand_applications SET status='rejected', decided_by=%s,"
            " decided_at=now(), reject_reason=%s WHERE app_id=%s",
            (admin_user["admin_id"], body.reason, app_id))
        ledger_append(conn, f"admin:{admin_user['admin_id']}", "BRAND_REJECTED",
                      app_row["slug"], {"reason": body.reason})
    return {"ok": True}


# ════════════════ 신고 ════════════════

class ReportIn(BaseModel):
    cell_id: str
    msg_id: str = ""
    reporter: str
    reason: str            # spam | harassment | other
    detail: str = ""


@public.post("/reports")
def file_report(body: ReportIn) -> dict:
    severity = "severe" if body.reason == "harassment" else "normal"
    ai_class = {"spam": "스팸·광고", "harassment": "괴롭힘·혐오"}.get(body.reason, "기타")
    sla_h = SEVERE_SLA_H if severity == "severe" else NORMAL_SLA_H
    with connect() as conn:
        row = conn.execute(
            "INSERT INTO reports (cell_id, msg_id, reporter, reason, detail,"
            " ai_class, severity, sla_due)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s, now() + %s) RETURNING report_id",
            (body.cell_id, body.msg_id, body.reporter, body.reason, body.detail,
             ai_class, severity, timedelta(hours=sla_h))).fetchone()
        ledger_append(conn, f"user:{body.reporter}", "REPORT_FILED",
                      str(row["report_id"]),
                      {"cell": body.cell_id, "reason": body.reason,
                       "severity": severity})
    return {"reportId": str(row["report_id"]), "slaHours": sla_h}


@admin.get("/reports")
def list_reports(status: str = "open",
                 _admin: dict = Depends(require_admin)) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT r.*, m.original AS msg_text FROM reports r"
            " LEFT JOIN cell_messages m ON m.msg_id::text = r.msg_id"
            " WHERE r.status=%s ORDER BY r.sla_due", (status,)).fetchall()
    return [
        {"reportId": str(r["report_id"]), "cellId": r["cell_id"],
         "msgText": r["msg_text"], "reason": r["reason"], "detail": r["detail"],
         "aiClass": r["ai_class"], "severity": r["severity"],
         "slaDue": r["sla_due"].isoformat(), "at": r["created_at"].isoformat()}
        for r in rows
    ]


class ReportAction(BaseModel):
    action: str    # dismiss | warn | hide | suspend_7d | suspend


@admin.post("/reports/{report_id}/action")
def action_report(report_id: str, body: ReportAction,
                  admin_user: dict = Depends(require_admin)) -> dict:
    status = "dismissed" if body.action == "dismiss" else "actioned"
    with connect() as conn:
        row = conn.execute(
            "UPDATE reports SET status=%s, action=%s, handled_by=%s"
            " WHERE report_id=%s AND status='open' RETURNING report_id",
            (status, body.action, admin_user["admin_id"], report_id)).fetchone()
        if not row:
            raise HTTPException(409, "이미 처리됐거나 없는 신고")
        ledger_append(conn, f"admin:{admin_user['admin_id']}", "REPORT_ACTIONED",
                      report_id, {"action": body.action})
    return {"ok": True, "status": status}


# ════════════════ 분쟁 ════════════════

class DisputeIn(BaseModel):
    kind: str            # review | payout | selection
    brand_id: str
    creator_id: str
    campaign_id: str | None = None
    claim: str


@public.post("/disputes")
def open_dispute(body: DisputeIn) -> dict:
    with connect() as conn:
        row = conn.execute(
            "INSERT INTO disputes (kind, brand_id, creator_id, campaign_id, claim,"
            " first_response_due, verdict_due)"
            " VALUES (%s,%s,%s,%s,%s, now() + interval '24 hours',"
            " now() + interval '72 hours') RETURNING dispute_id",
            (body.kind, body.brand_id, body.creator_id, body.campaign_id,
             body.claim)).fetchone()
        ledger_append(conn, f"user:{body.creator_id}", "DISPUTE_OPENED",
                      str(row["dispute_id"]),
                      {"kind": body.kind, "brand": body.brand_id})
    return {"disputeId": str(row["dispute_id"])}


@admin.get("/disputes")
def list_disputes(_admin: dict = Depends(require_admin)) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM disputes WHERE state NOT IN ('final','resolved')"
            " ORDER BY verdict_due").fetchall()
    return [
        {"disputeId": str(r["dispute_id"]), "kind": r["kind"],
         "brandId": r["brand_id"], "creatorId": r["creator_id"],
         "campaignId": r["campaign_id"], "claim": r["claim"], "state": r["state"],
         "verdictDue": r["verdict_due"].isoformat(),
         "at": r["created_at"].isoformat()}
        for r in rows
    ]


class Verdict(BaseModel):
    verdict: str


@admin.post("/disputes/{dispute_id}/resolve")
def resolve_dispute(dispute_id: str, body: Verdict,
                    admin_user: dict = Depends(require_admin)) -> dict:
    with connect() as conn:
        row = conn.execute(
            "UPDATE disputes SET state='resolved', verdict=%s, decided_by=%s,"
            " resolved_at=now() WHERE dispute_id=%s AND state IN ('open','responded')"
            " RETURNING creator_id", (body.verdict, admin_user["admin_id"],
                                      dispute_id)).fetchone()
        if not row:
            raise HTTPException(409, "이미 판정됐거나 없는 분쟁")
        ledger_append(conn, f"admin:{admin_user['admin_id']}", "DISPUTE_RESOLVED",
                      dispute_id, {"verdict": body.verdict})
        conn.execute(
            "INSERT INTO notifications (user_id, type, title, body)"
            " VALUES (%s,'review_result','분쟁 판정이 나왔어요',%s)",
            (row["creator_id"], body.verdict[:200]))
    return {"ok": True}


# ════════════════ 제출 · 검수 ════════════════

class SubmissionIn(BaseModel):
    campaign_id: str
    creator_id: str
    url: str
    caption: str = ""


COUNTRY_BY_LOCALE = {"th": "TH", "vi": "VN", "ko": "KR", "en": "US"}


@public.post("/submissions")
def create_submission(body: SubmissionIn) -> dict:
    with connect() as conn:
        creator = conn.execute(
            "SELECT locale FROM creators WHERE creator_id=%s",
            (body.creator_id,)).fetchone()
        camp = conn.execute(
            "SELECT brand_id FROM campaigns WHERE campaign_id=%s",
            (body.campaign_id,)).fetchone()
        if not creator or not camp:
            raise HTTPException(404, "campaign/creator not found")
        profile = conn.execute(
            "SELECT fields FROM brand_profile_versions WHERE brand_id=%s"
            " ORDER BY version DESC LIMIT 1", (camp["brand_id"],)).fetchone()

    fields = (profile or {}).get("fields") or {}
    banned_raw = fields.get("banned_words", {})
    banned = [w.strip() for w in
              (banned_raw.get("value", "") if isinstance(banned_raw, dict) else "")
              .split(",") if w.strip()]
    country = COUNTRY_BY_LOCALE.get(creator["locale"], "US")

    violations = check_content(body.caption, country, banned)
    url_ok = body.url.startswith("http")
    checks = [{"label": "링크 형식", "pass": url_ok}]
    kinds = {v.kind for v in violations}
    checks.append({"label": "광고 표기(#ad)", "pass": "missing_disclosure" not in kinds,
                   "fix": next((v.fix for v in violations
                                if v.kind == "missing_disclosure"), None)})
    checks.append({"label": "금지 표현 없음",
                   "pass": not (kinds & {"medical_claim", "functional_claim",
                                         "absolute_claim"}),
                   "fix": next((v.fix for v in violations
                                if v.kind in ("medical_claim", "functional_claim",
                                              "absolute_claim")), None)})
    checks.append({"label": "브랜드 금지어 없음", "pass": "banned_word" not in kinds,
                   "fix": next((v.fix for v in violations
                                if v.kind == "banned_word"), None)})
    status = "in_review" if all(c["pass"] for c in checks) else "needs_fix"

    with connect() as conn:
        row = conn.execute(
            "INSERT INTO submissions (campaign_id, creator_id, url, caption,"
            " auto_checks, status) VALUES (%s,%s,%s,%s,%s,%s) RETURNING submission_id",
            (body.campaign_id, body.creator_id, body.url, body.caption,
             _j(checks), status)).fetchone()
        ledger_append(conn, f"user:{body.creator_id}", "SUBMISSION_CREATED",
                      str(row["submission_id"]),
                      {"campaign": body.campaign_id, "status": status})
    return {"submissionId": str(row["submission_id"]), "status": status,
            "autoChecks": checks}


@public.get("/submissions")
def list_submissions(creator: str | None = None, brand: str | None = None,
                     status: str | None = None) -> list[dict]:
    q = ("SELECT s.*, c.brand_id, c.name AS campaign_name, cr.handle"
         " FROM submissions s"
         " JOIN campaigns c ON c.campaign_id = s.campaign_id"
         " JOIN creators cr ON cr.creator_id = s.creator_id WHERE true")
    params: list = []
    if creator:
        q += " AND s.creator_id=%s"
        params.append(creator)
    if brand:
        q += " AND c.brand_id=%s"
        params.append(brand)
    if status:
        q += " AND s.status=%s"
        params.append(status)
    with connect() as conn:
        rows = conn.execute(q + " ORDER BY s.created_at DESC", params).fetchall()
    return [
        {"submissionId": str(r["submission_id"]), "campaignId": r["campaign_id"],
         "campaignName": r["campaign_name"], "handle": r["handle"],
         "url": r["url"], "caption": r["caption"], "autoChecks": r["auto_checks"],
         "status": r["status"], "at": r["created_at"].isoformat()}
        for r in rows
    ]


class ReviewIn(BaseModel):
    result: str       # passed | needs_fix
    reviewer: str
    note: str = ""


@public.post("/submissions/{submission_id}/review")
def review_submission(submission_id: str, body: ReviewIn) -> dict:
    if body.result not in ("passed", "needs_fix"):
        raise HTTPException(400, "결과는 통과/보완요청 두 가지뿐 (반려 없음)")
    with connect() as conn:
        row = conn.execute(
            "UPDATE submissions SET status=%s, reviewed_by=%s, reviewed_at=now()"
            " WHERE submission_id=%s AND status='in_review'"
            " RETURNING creator_id, campaign_id",
            (body.result, body.reviewer, submission_id)).fetchone()
        if not row:
            raise HTTPException(409, "검수 대기 상태가 아님")
        ledger_append(conn, f"user:{body.reviewer}",
                      "REVIEW_PASSED" if body.result == "passed" else "REVIEW_FIX",
                      submission_id, {"campaign": row["campaign_id"],
                                      "note": body.note})
        if body.result == "passed":
            conn.execute(
                "UPDATE campaign_applications SET status='passed'"
                " WHERE campaign_id=%s AND creator_id=%s",
                (row["campaign_id"], row["creator_id"]))
            conn.execute(
                "INSERT INTO notifications (user_id, type, title, body) VALUES"
                " (%s,'review_result','검수를 통과했어요 🎉','정산이 예약됐어요 — PAYOUT 승인 후 지급됩니다')",
                (row["creator_id"],))
        else:
            conn.execute(
                "INSERT INTO notifications (user_id, type, title, body) VALUES"
                " (%s,'review_result','보완 요청이 있어요',%s)",
                (row["creator_id"], body.note or "제출 탭에서 확인해 주세요"))
    return {"ok": True, "status": body.result}


# ════════════════ 어드민 대시보드 ════════════════

@admin.get("/summary")
def admin_summary(_admin: dict = Depends(require_admin)) -> dict:
    with connect() as conn:
        def count(sql: str) -> int:
            return conn.execute(sql).fetchone()["n"]

        return {
            "pendingApplications": count(
                "SELECT count(*) n FROM brand_applications WHERE status='pending'"),
            "openReports": count("SELECT count(*) n FROM reports WHERE status='open'"),
            "openDisputes": count(
                "SELECT count(*) n FROM disputes WHERE state IN ('open','responded')"),
            "inReviewSubmissions": count(
                "SELECT count(*) n FROM submissions WHERE status='in_review'"),
            "brands": count("SELECT count(*) n FROM brands"),
            "creators": count("SELECT count(*) n FROM creators"),
            "pendingGates": count(
                "SELECT count(*) n FROM gate_requests WHERE state IN ('PENDING','HELD')"),
            "ledgerEvents": count("SELECT count(*) n FROM ledger"),
        }
