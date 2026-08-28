import { useState } from "react";
import { Badge, Card, SectionTitle } from "@connection/ui";
import { mockCampaigns, mockPayouts } from "@connection/shared/mock";

/** 정산 — 셀별 분리 정산 + P0 정산 수단 온보딩 (PingPong) */
export default function PayoutScreen() {
  const [onboarded, setOnboarded] = useState(false);

  return (
    <div>
      {!onboarded && (
        <Card style={{ borderColor: "var(--a300)", background: "var(--a50)" }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>정산 수단을 연결하세요</div>
          <div style={{ fontSize: 12, color: "var(--n600)", lineHeight: 1.6 }}>
            PingPong 계정 연결 · 최소 인출 ฿500 · 수수료 1% · 실패 시 자동 재시도 3회
          </div>
          <button
            onClick={() => setOnboarded(true)}
            style={{ marginTop: 10, padding: "9px 16px", border: "none", borderRadius: 10, background: "var(--n800)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
          >
            PingPong 연결
          </button>
        </Card>
      )}
      {onboarded && (
        <Card style={{ borderColor: "var(--s300)", background: "var(--s50)" }}>
          <div style={{ fontSize: 12, color: "var(--s700)", fontWeight: 700 }}>
            ✓ PingPong 연결됨 — mai****@pingpong
          </div>
        </Card>
      )}

      <SectionTitle>지급 예정</SectionTitle>
      {mockPayouts.filter((p) => p.status === "scheduled").map((p) => (
        <PayoutCard key={p.id} p={p} />
      ))}

      <SectionTitle>지급 완료</SectionTitle>
      {mockPayouts.filter((p) => p.status === "paid").map((p) => (
        <PayoutCard key={p.id} p={p} />
      ))}

      <div style={{ marginTop: 16, fontSize: 11, color: "var(--n400)", textAlign: "center" }}>
        연간 소득 문서 다운로드는 준비 중이에요 (P1)
      </div>
    </div>
  );
}

function PayoutCard({ p }: { p: (typeof mockPayouts)[number] }) {
  const campaign = mockCampaigns.find((c) => c.id === p.campaignId);
  return (
    <Card style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13 }}>
            {campaign?.name ?? p.campaignId}
          </div>
          <div style={{ fontSize: 11, color: "var(--n500)" }}>
            {p.brandId.toUpperCase()} 셀 · {p.at}
          </div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontWeight: 900, fontSize: 15 }}>
            ฿{p.amount.toLocaleString()}
          </div>
          {p.status === "scheduled"
            ? <Badge color="amber">예정</Badge>
            : <Badge color="sage">완료</Badge>}
        </div>
      </div>
    </Card>
  );
}
