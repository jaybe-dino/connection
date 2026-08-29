import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, SectionTitle } from "@connection/ui";
import { adminApi, type Report } from "../adminApi";

const ACTIONS: [string, string, string][] = [
  ["dismiss", "기각", "var(--n200)"],
  ["warn", "경고", "var(--a500)"],
  ["hide", "메시지 숨김", "var(--t500)"],
  ["suspend_7d", "7일 정지", "var(--c500)"],
];

/** 신고 처리함 — 아리 1차 분류 → 운영자 조치. SLA 심각 24h · 일반 72h */
export default function Reports({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Report[]>([]);
  const load = () => adminApi.reports().then(setRows).catch(() => {});
  useEffect(() => { void load(); }, []);

  const act = async (id: string, action: string) => {
    await adminApi.actionReport(id, action).catch(() => {});
    await load();
    onChange();
  };

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>신고 처리함</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>
        신고자는 익명으로 처리됩니다. 조치는 원장에 기록되고 되돌림도 기록됩니다.
      </div>
      <SectionTitle>대기 {rows.length}건 · SLA 순</SectionTitle>
      {rows.length === 0 && <EmptyState>대기 중인 신고가 없어요</EmptyState>}
      {rows.map((r) => {
        const overdue = new Date(r.slaDue) < new Date();
        return (
          <Card key={r.reportId} style={overdue ? { borderColor: "var(--c300)" } : undefined}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <Badge color={r.severity === "severe" ? "clay" : "amber"}>
                {r.severity === "severe" ? "심각 · 24h" : "일반 · 72h"}
              </Badge>
              <Badge>{r.aiClass}</Badge>
              <span style={{ fontSize: 11, color: "var(--n500)" }}>{r.cellId}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: overdue ? "var(--c500)" : "var(--n400)", fontWeight: overdue ? 800 : 400 }}>
                SLA {new Date(r.slaDue).toLocaleString("ko")} {overdue && "· 초과!"}
              </span>
            </div>
            {r.msgText && (
              <div style={{ fontSize: 13, background: "var(--n50)", borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
                “{r.msgText}”
              </div>
            )}
            {r.detail && <div style={{ fontSize: 12, color: "var(--n600)" }}>신고 내용: {r.detail}</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {ACTIONS.map(([action, label, bg]) => (
                <button key={action} onClick={() => void act(r.reportId, action)}
                  style={{ padding: "7px 14px", border: "none", borderRadius: 8, background: bg, color: action === "dismiss" ? "var(--n700)" : "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
