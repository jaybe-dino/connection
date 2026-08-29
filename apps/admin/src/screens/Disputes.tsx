import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, SectionTitle } from "@connection/ui";
import { adminApi, type Dispute } from "../adminApi";

const KIND_LABEL: Record<string, string> = {
  review: "검수 이의", payout: "정산 불일치", selection: "선정 번복",
};

/** 분쟁 심판 — 접수 → 24h 1차 응답 → 72h 판정. append-only 원장이 증거. */
export default function Disputes({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Dispute[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, string>>({});
  const load = () => adminApi.disputes().then(setRows).catch(() => {});
  useEffect(() => { void load(); }, []);

  const resolve = async (id: string) => {
    const v = (verdicts[id] ?? "").trim();
    if (!v) return;
    await adminApi.resolveDispute(id, v).catch(() => {});
    await load();
    onChange();
  };

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>분쟁 심판</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>
        원 조건(원문 우선)과 원장 기록을 근거로 판정합니다. 판정은 크리에이터에게 알림으로 전달되고, 이의는 1회·총괄이 최종입니다.
      </div>
      <SectionTitle>대기 {rows.length}건 · 판정 기한 순</SectionTitle>
      {rows.length === 0 && <EmptyState>대기 중인 분쟁이 없어요</EmptyState>}
      {rows.map((d) => (
        <Card key={d.disputeId}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <Badge color="terra">{KIND_LABEL[d.kind] ?? d.kind}</Badge>
            <span style={{ fontSize: 12, fontWeight: 700 }}>
              {d.brandId} ↔ {d.creatorId}
            </span>
            {d.campaignId && <Badge>{d.campaignId}</Badge>}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--n400)" }}>
              판정 기한 {new Date(d.verdictDue).toLocaleString("ko")}
            </span>
          </div>
          <div style={{ fontSize: 13, background: "var(--n50)", borderRadius: 8, padding: "8px 12px" }}>
            주장: {d.claim}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <input
              value={verdicts[d.disputeId] ?? ""}
              onChange={(e) => setVerdicts((v) => ({ ...v, [d.disputeId]: e.target.value }))}
              placeholder="판정문 — 근거와 함께 (크리에이터에게 알림으로 전달됩니다)"
              style={{ flex: 1, padding: "9px 12px", border: "1px solid var(--n200)", borderRadius: 9, fontSize: 13, background: "var(--n0)" }}
            />
            <button onClick={() => void resolve(d.disputeId)}
              style={{ padding: "9px 18px", border: "none", borderRadius: 9, background: "var(--n800)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              판정 확정
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
