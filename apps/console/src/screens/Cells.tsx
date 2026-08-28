import { useState } from "react";
import { Badge, Card, OriginalChip, SectionTitle } from "@connection/ui";
import { mockCells } from "@connection/shared/mock";

const TABS = ["대화", "활성화", "충원", "규칙"] as const;

/** 커뮤니티 셀 — 대화(동석) · 활성화(요일제) · 충원 · 규칙 */
export default function Cells() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("대화");
  const cell = mockCells[0];

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>{cell.name}</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>
        멤버 {cell.memberCount} · 발화 밀도로 건강 판단 — 인원 상한 없음
      </div>

      <div style={{ display: "flex", gap: 6, margin: "14px 0" }}>
        {TABS.map((t) => (
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

      {tab === "대화" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, color: "var(--n400)" }}>
            브랜드도 같은 방에 멤버로 있어요(관리자 배지 없음) — 브랜드는 본국어로 봐요
          </div>
          {cell.messages.map((m) => (
            <Card key={m.id} style={{ padding: 11 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontWeight: 800, fontSize: 12 }}>
                  {m.authorKind === "ari" ? "아리" : `@${m.author}`}
                </span>
                {m.authorKind === "ari" && <Badge color="plum">운영</Badge>}
                <span style={{ fontSize: 10, color: "var(--n400)" }}>{m.channel}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--n400)" }}>{m.at}</span>
              </div>
              <div style={{ fontSize: 13 }}>
                <OriginalChip original={m.original} translated={m.translations.ko} originalLocale={m.originalLocale} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "활성화" && (
        <Card>
          <SectionTitle>요일제 플랜</SectionTitle>
          {[
            ["월", "주간 피드 — 멤버 콘텐츠 큐레이션", "발행됨"],
            ["화", "스포트라이트 — 작은 계정 우선", "발행됨"],
            ["수", "팁 큐레이션", "초안 → PUBLISH 게이트"],
            ["목", "미니 챌린지 (보상 없음)", "예약"],
            ["금", "브랜드 Q&A", "예약"],
          ].map(([d, plan, st]) => (
            <div key={d} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--n100)", fontSize: 13, alignItems: "center" }}>
              <span style={{ fontWeight: 900, width: 20 }}>{d}</span>
              <span style={{ flex: 1 }}>{plan}</span>
              <Badge color={st === "발행됨" ? "sage" : st === "예약" ? "neutral" : "amber"}>{st}</Badge>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--n400)", marginTop: 8 }}>
            조급함 장치 없음 — 읽음·타이핑·@everyone·출석 보상을 만들지 않아요
          </div>
        </Card>
      )}

      {tab === "충원" && (
        <Card>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            후보 큐 <b>12명</b> — 4축 판정 통과 · 초대 대기
          </div>
          {["@mint.review (TH · micro · 매치 87)", "@sunny_края (TH · nano · 매치 81)", "@bkk.glow (TH · mid · 매치 78)"].map((c) => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--n100)", fontSize: 13 }}>
              {c}
              <button style={{ marginLeft: "auto", padding: "5px 12px", border: "none", borderRadius: 8, background: "var(--t500)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                초대 (게이트)
              </button>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--n400)", marginTop: 8 }}>
            아리 로그: 협찬 과다 2명은 차단이 아니라 과금 제외로 분류했어요
          </div>
        </Card>
      )}

      {tab === "규칙" && (
        <Card>
          <SectionTitle>URL 공개 범위</SectionTitle>
          {[
            ["초대 링크만", false],
            ["신청 후 승인 (권장)", true],
            ["완전 공개", false],
          ].map(([label, on]) => (
            <label key={label as string} style={{ display: "flex", gap: 8, padding: "6px 0", fontSize: 13, cursor: "pointer" }}>
              <input type="radio" name="vis" defaultChecked={on as boolean} /> {label}
            </label>
          ))}
          <SectionTitle>자율 다이얼</SectionTitle>
          <div style={{ fontSize: 12, color: "var(--n600)", lineHeight: 1.7 }}>
            아리 L2 — 초안까지 자동, 실행은 게이트. PII·정산·외부발송·공개게시는
            다이얼과 무관하게 항상 사람 승인이에요.
          </div>
        </Card>
      )}
    </div>
  );
}
