import { useState } from "react";
import { Badge, Card, SectionTitle } from "@connection/ui";
import { mockCampaigns, mockSubmissions } from "@connection/shared/mock";

/** 제출 — 업로드/링크 붙여넣기 → 자동 체크 4종 → 원클릭 보정 → 검수 상태 */
export default function SubmitScreen() {
  const [url, setUrl] = useState("");
  const [fixed, setFixed] = useState(false);
  const sub = mockSubmissions[0];
  const campaign = mockCampaigns.find((c) => c.id === sub.campaignId);
  const checks = sub.autoChecks.map((c) =>
    fixed && c.label === "#ad 표기" ? { ...c, pass: true } : c
  );
  const allPass = checks.every((c) => c.pass);

  return (
    <div>
      <SectionTitle>새 제출</SectionTitle>
      <Card>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="영상 링크 붙여넣기 (TikTok · Instagram)"
          style={{ width: "100%", padding: "11px 12px", border: "1px solid var(--n200)", borderRadius: 10, fontSize: 13, background: "var(--n50)" }}
        />
        <div style={{ fontSize: 11, color: "var(--n400)", marginTop: 6 }}>
          붙여넣으면 길이 · 노출 · #ad · 금지어를 자동 체크해요
        </div>
      </Card>

      <SectionTitle>진행 중</SectionTitle>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 22 }}>{campaign?.imageEmoji}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>{campaign?.name}</div>
            <div style={{ fontSize: 11, color: "var(--n500)", fontFamily: "var(--mono)" }}>{sub.url}</div>
          </div>
          <span style={{ marginLeft: "auto" }}>
            {allPass ? <Badge color="sage">검수 대기</Badge> : <Badge color="amber">보완 필요</Badge>}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {checks.map((c) => (
            <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, background: c.pass ? "var(--s50)" : "var(--a50)", fontSize: 12 }}>
              <span style={{ color: c.pass ? "var(--s700)" : "var(--a700)", fontWeight: 900 }}>
                {c.pass ? "✓" : "!"}
              </span>
              {c.label}
            </div>
          ))}
        </div>
        {!allPass && (
          <button
            onClick={() => setFixed(true)}
            style={{ width: "100%", marginTop: 10, padding: 11, border: "none", borderRadius: 10, background: "var(--a500)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
          >
            원클릭 보정 — 캡션에 #ad 추가
          </button>
        )}
        {allPass && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--s700)", background: "var(--s50)", padding: "9px 12px", borderRadius: 8 }}>
            체크 통과 — 검수는 통과/보완요청 두 가지뿐이에요 (반려 없음)
          </div>
        )}
      </Card>
    </div>
  );
}
