import { Card } from "@connection/ui";
import type { Summary } from "../adminApi";

/** 총괄 대시보드 — ADMIN_PLAN §2-① */
export default function Dashboard({ summary }: { summary: Summary | null }) {
  const s = summary;
  const tiles: [string, number | string, string][] = [
    ["브랜드 신청 대기", s?.pendingApplications ?? "—", "승인해야 콘솔이 열립니다"],
    ["신고 대기", s?.openReports ?? "—", "심각 24h · 일반 72h SLA"],
    ["분쟁 대기", s?.openDisputes ?? "—", "1차 응답 24h · 판정 72h"],
    ["검수 대기", s?.inReviewSubmissions ?? "—", "통과 = 정산 대상 편입"],
    ["브랜드", s?.brands ?? "—", "활성 브랜드 수"],
    ["크리에이터", s?.creators ?? "—", "전원 OAuth 검증"],
    ["게이트 대기", s?.pendingGates ?? "—", "브랜드 콘솔 승인함"],
    ["원장 이벤트", s?.ledgerEvents ?? "—", "append-only · 해시 체인"],
  ];
  return (
    <div style={{ maxWidth: 880 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>대시보드</h1>
      <div style={{ fontSize: 12, color: "var(--n500)", marginBottom: 16 }}>
        아리가 못 푸는 일은 결국 사람에게 옵니다 — 여기가 그 사람의 작업대예요.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {tiles.map(([label, value, note]) => (
          <Card key={label} style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: "var(--n500)", fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, margin: "4px 0 2px" }}>{value}</div>
            <div style={{ fontSize: 10.5, color: "var(--n400)" }}>{note}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
