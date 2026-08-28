import { Badge, Card, SectionTitle } from "@connection/ui";
import { mockSubmissions } from "@connection/shared/mock";

/** 검수 — 자동 체크 4종 → 통과 / 보완요청 (반려 아님) */
export default function Review() {
  const sub = mockSubmissions[0];
  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>검수</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>
        결과는 통과 또는 보완요청 두 가지 — 반려는 없어요
      </div>

      <SectionTitle>대기 1건</SectionTitle>
      <Card>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>@beauty.mai · 톤업 선세럼 리뷰</span>
          <Badge color="amber">보완 필요</Badge>
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--n500)", marginBottom: 10 }}>
          {sub.url}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
          {sub.autoChecks.map((c) => (
            <div key={c.label} style={{ display: "flex", gap: 6, padding: "7px 10px", borderRadius: 8, fontSize: 12, background: c.pass ? "var(--s50)" : "var(--a50)" }}>
              <span style={{ fontWeight: 900, color: c.pass ? "var(--s700)" : "var(--a700)" }}>
                {c.pass ? "✓" : "!"}
              </span>
              {c.label}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ padding: "8px 18px", border: "none", borderRadius: 9, background: "var(--s500)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            통과 → 정산 예약
          </button>
          <button style={{ padding: "8px 18px", border: "1px solid var(--a300)", borderRadius: 9, background: "var(--a50)", color: "var(--a700)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            보완 요청 — #ad 표기 추가
          </button>
        </div>
      </Card>
    </div>
  );
}
