import { useState } from "react";
import { Badge, Card, RewardBadge, SectionTitle } from "@connection/ui";
import { mockCampaigns } from "@connection/shared/mock";

const APPLICANTS = [
  { handle: "beauty.mai", grade: "mid", match: 87, status: "선정" },
  { handle: "nong.skin", grade: "micro", match: 82, status: "선정" },
  { handle: "mint.review", grade: "micro", match: 74, status: "대기" },
  { handle: "bkk.glow", grade: "mid", match: 69, status: "대기" },
];

/** 캠페인 — 진행 현황 · 등록(번역 미리보기) · 지원자/선정 + P0 배송 관리 */
export default function Campaigns() {
  const [tab, setTab] = useState<"진행" | "등록" | "지원자" | "배송">("진행");

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>캠페인</h1>
      <div style={{ display: "flex", gap: 6, margin: "14px 0" }}>
        {(["진행", "등록", "지원자", "배송"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "5px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
              border: "1px solid", borderColor: tab === t ? "var(--n800)" : "var(--n200)",
              background: tab === t ? "var(--n800)" : "var(--n0)",
              color: tab === t ? "var(--n0)" : "var(--n600)",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "진행" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mockCampaigns.map((c) => (
            <Card key={c.id}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 26 }}>{c.imageEmoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <RewardBadge type={c.rewardType} />
                    <Badge>{c.status}</Badge>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, marginTop: 3 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "var(--n500)" }}>
                    정원 {c.capacity} · 마감 {c.deadline}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--n500)", textAlign: "right" }}>
                  지원 14 → 선정 10<br />배송 8 → 제출 1
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "등록" && (
        <Card>
          <SectionTitle>새 캠페인</SectionTitle>
          <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
            <input placeholder="캠페인 이름" style={inp} />
            <input placeholder="제품" style={inp} />
            <div style={{ display: "flex", gap: 6 }}>
              {["유가", "무가", "어필리에이트"].map((t, i) => (
                <label key={t} style={{ display: "flex", gap: 4, fontSize: 12 }}>
                  <input type="radio" name="rw" defaultChecked={i === 0} />{t}
                </label>
              ))}
            </div>
            <select style={inp}>
              <option>USP 선택 — 브랜드 프로필 '고객의 언어'에서</option>
              <option>백탁 없이 한 톤 환하게</option>
              <option>속당김 잡는 수분막</option>
            </select>
            <input placeholder="구체 조건 (길이·노출·표기)" style={inp} />
          </div>
          <div style={{ marginTop: 12, padding: 12, background: "var(--n100)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--n500)", marginBottom: 6 }}>
              번역 미리보기 (게시 시 일괄 생성 · th / en / vi)
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--n600)" }}>
              th — รีวิวโทนอัพซันเซรั่ม …<br />en — Tone-up sun serum review …<br />vi — Đánh giá serum chống nắng …
            </div>
          </div>
          <button style={{ marginTop: 12, padding: "10px 20px", border: "none", borderRadius: 10, background: "var(--t500)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            게시 — 캠페인 목록 + 셀 공지 동시
          </button>
        </Card>
      )}

      {tab === "지원자" && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--n100)", fontSize: 11, color: "var(--n500)" }}>
                {["핸들", "등급", "매치 점수", "상태", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {APPLICANTS.map((a) => (
                <tr key={a.handle} style={{ borderTop: "1px solid var(--n100)" }}>
                  <td style={{ padding: "9px 12px", fontWeight: 700 }}>@{a.handle}</td>
                  <td style={{ padding: "9px 12px" }}>{a.grade}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "var(--mono)" }}>{a.match}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <Badge color={a.status === "선정" ? "sage" : "neutral"}>{a.status}</Badge>
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <button style={{ padding: "4px 10px", fontSize: 11, border: "1px solid var(--n200)", borderRadius: 8, background: "var(--n0)", cursor: "pointer" }}>
                      1:1 (자동 번역)
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "배송" && (
        <Card>
          <SectionTitle>배송 관리 (P0)</SectionTitle>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            PII 승인 완료 10건 — CSV 내보내기 후 송장을 일괄 업로드하면 크리에이터 앱 배송 추적에 반영돼요.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ padding: "8px 16px", border: "1px solid var(--n200)", borderRadius: 9, background: "var(--n0)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              주소 CSV 내보내기 (PII 게이트 승인됨)
            </button>
            <button style={{ padding: "8px 16px", border: "none", borderRadius: 9, background: "var(--n800)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              송장 일괄 업로드
            </button>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--n600)" }}>
            배송 중 8 · 배송 완료 1 · 실패 0 — 상태는 크리에이터 앱과 동기화
          </div>
        </Card>
      )}
    </div>
  );
}

const inp = {
  padding: "9px 11px",
  border: "1px solid var(--n200)",
  borderRadius: 9,
  fontSize: 13,
  background: "var(--n50)",
} as const;
