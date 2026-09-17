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
    ["브랜드", s?.brands ?? "—", "저장된 브랜드 수"],
    ["크리에이터", s?.creators ?? "—", "저장된 계정 수 · SNS 검증 여부와 별개"],
    ["게이트 대기", s?.pendingGates ?? "—", "기존 운영 데이터 · 공개 콘솔 승인 기능 준비 중"],
    ["원장 이벤트", s?.ledgerEvents ?? "—", "append-only · 해시 체인"],
  ];
  return (
    <div style={{ maxWidth: 880 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>대시보드</h1>
      <div style={{ fontSize: 12, color: "var(--n500)", marginBottom: 16 }}>
        저장된 운영 데이터 기준입니다. 기존 테스트 데이터가 포함될 수 있으며, 실제 검증 가입·결제 실적을 의미하지 않습니다.
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
