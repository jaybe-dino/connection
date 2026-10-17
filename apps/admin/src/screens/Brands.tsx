import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, SectionTitle } from "@connection/ui";
import { adminApi, type AdminBrand, type AuditRow } from "../adminApi";

/** 브랜드 운영 — 정지/재개 + 감사 로그. 정지 중에는 그 브랜드 계정의
 *  콘솔·커뮤니티·모집 링크가 서버에서 차단된다(운영만 접근). */
export default function Brands() {
  const [rows, setRows] = useState<AdminBrand[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditEvent, setAuditEvent] = useState("");
  const [auditActor, setAuditActor] = useState("");

  const load = () =>
    adminApi.brands().then((r) => { setRows(r); setErr(""); })
      .catch((e) => setErr(e.message || "브랜드 목록을 불러오지 못했습니다"));
  const loadAudit = () =>
    adminApi.audit(auditActor, auditEvent).then(setAudit)
      .catch((e) => { setAudit([]); setErr(e.message || "감사 로그 조회 실패"); });
  useEffect(() => { void load(); }, []);

  const suspend = async (id: string) => {
    if (busy) return;
    setBusy(id);
    try {
      await adminApi.suspendBrand(id, reason[id] || "");
      await load();
      if (audit) await loadAudit();
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };
  const resume = async (id: string) => {
    if (busy) return;
    setBusy(id);
    try {
      await adminApi.resumeBrand(id);
      await load();
      if (audit) await loadAudit();
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>브랜드 운영</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>
        정지하면 그 브랜드 계정의 콘솔 접근·커뮤니티(공지 포함)·신규 가입·모집
        링크가 즉시 차단됩니다. 모든 조치는 감사 로그(원장)에 남습니다.
      </div>
      {err && <div role="alert" style={{ color: "var(--c500)", fontSize: 12, margin: "8px 0" }}>{err}</div>}
      <SectionTitle>브랜드 {rows.length}곳</SectionTitle>
      {rows.length === 0 && <EmptyState>표시할 브랜드가 없어요</EmptyState>}
      {rows.map((b) => (
        <Card key={b.brandId} style={b.suspendedAt ? { borderColor: "var(--c300)" } : undefined}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b>{b.name}</b>
            <span style={{ fontSize: 12, color: "var(--n500)" }}>{b.brandId}</span>
            {b.demo && <Badge>데모</Badge>}
            <Badge color={b.suspendedAt ? "clay" : undefined}>
              {b.suspendedAt ? `정지됨 · ${b.suspendedAt.slice(0, 10)}` : "운영 중"}
            </Badge>
            <span style={{ fontSize: 12, color: "var(--n500)" }}>
              멤버 {b.members} · 팀 {b.team}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {b.suspendedAt ? (
              <button onClick={() => void resume(b.brandId)} disabled={busy === b.brandId}>
                {busy === b.brandId ? "처리 중…" : "정지 해제(재개)"}
              </button>
            ) : (
              <>
                <input
                  placeholder="정지 사유 (감사 로그 기록)"
                  value={reason[b.brandId] || ""}
                  onChange={(e) => setReason({ ...reason, [b.brandId]: e.target.value })}
                  style={{ flex: 1, minWidth: 180 }}
                />
                <button onClick={() => void suspend(b.brandId)} disabled={busy === b.brandId}>
                  {busy === b.brandId ? "처리 중…" : "정지"}
                </button>
              </>
            )}
          </div>
        </Card>
      ))}

      <SectionTitle>감사 로그</SectionTitle>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
        <input placeholder="행위자 필터 (예: admin:)" value={auditActor}
          onChange={(e) => setAuditActor(e.target.value)} style={{ minWidth: 160 }} />
        <input placeholder="이벤트 필터 (예: BRAND_SUSPENDED)" value={auditEvent}
          onChange={(e) => setAuditEvent(e.target.value)} style={{ minWidth: 200 }} />
        <button onClick={() => void loadAudit()}>조회</button>
      </div>
      {audit === null && <EmptyState>조회를 누르면 최근 기록을 불러와요</EmptyState>}
      {audit !== null && audit.length === 0 && <EmptyState>일치하는 기록이 없어요</EmptyState>}
      {(audit || []).map((a, i) => (
        <Card key={i}>
          <div style={{ fontSize: 12 }}>
            <b>{a.event}</b> · {a.actor} → {a.subject}
            <span style={{ color: "var(--n500)" }}> · {a.at.slice(0, 19).replace("T", " ")}</span>
          </div>
          {Object.keys(a.payload || {}).length > 0 && (
            <pre style={{ fontSize: 11, margin: "6px 0 0", whiteSpace: "pre-wrap", color: "var(--n500)" }}>
              {JSON.stringify(a.payload)}
            </pre>
          )}
        </Card>
      ))}
    </div>
  );
}
