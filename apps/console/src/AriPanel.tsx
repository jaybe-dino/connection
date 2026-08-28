import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGates } from "./gateStore";

interface Msg {
  who: "ari" | "me";
  text: string;
  jump?: { label: string; to: string };
}

/** 아리 채팅 패널 — 상시. 대화가 곧 내비게이션 · 툴카드 · 캔버스 점프. */
export default function AriPanel() {
  const nav = useNavigate();
  const { pendingCount } = useGates();
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      who: "ari",
      text: `좋은 아침이에요. 오늘 결정할 것이 ${pendingCount}건 있어요. 태국 셀은 어제 발화 34건으로 건강해요.`,
      jump: { label: "승인함 열기", to: "/approvals" },
    },
  ]);
  const [draft, setDraft] = useState("");

  const send = () => {
    const q = draft.trim();
    if (!q) return;
    setDraft("");
    const reply: Msg = q.includes("캠페인")
      ? { who: "ari", text: "톤업 선세럼 캠페인은 지원 14 · 선정 10 · 배송 중 8이에요. 제출 마감은 9/15.", jump: { label: "캠페인 보기", to: "/campaigns" } }
      : q.includes("셀") || q.includes("커뮤니티")
        ? { who: "ari", text: "태국 셀 침묵 감지 없음 · 이번 주 목요일 미니 챌린지가 예정돼 있어요.", jump: { label: "셀 보기", to: "/cells" } }
        : { who: "ari", text: "확인했어요. 관련 데이터를 정리해 브리핑에 올려둘게요.", jump: { label: "브리핑", to: "/briefing" } };
    setMsgs((m) => [...m, { who: "me", text: q }, reply]);
  };

  return (
    <aside
      style={{
        width: 300,
        borderLeft: "1px solid var(--n150)",
        background: "var(--n0)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--n100)", display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--p50)", display: "grid", placeItems: "center", color: "var(--p500)", fontWeight: 900 }}>
          A
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13 }}>아리</div>
          <div style={{ fontSize: 10, color: "var(--s700)" }}>● L2 · 8명 근무 중</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.who === "me" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
            <div
              style={{
                padding: "9px 12px",
                borderRadius: 12,
                fontSize: 12.5,
                lineHeight: 1.55,
                background: m.who === "me" ? "var(--n800)" : "var(--p50)",
                color: m.who === "me" ? "var(--n0)" : "var(--n800)",
              }}
            >
              {m.text}
            </div>
            {m.jump && (
              <button
                onClick={() => nav(m.jump!.to)}
                style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: "var(--p500)", border: "1px solid var(--p50)", background: "var(--n0)", borderRadius: 999, padding: "3px 10px", cursor: "pointer" }}
              >
                → {m.jump.label}
              </button>
            )}
          </div>
        ))}
      </div>
      <div style={{ padding: 12, borderTop: "1px solid var(--n100)", display: "flex", gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="아리에게 물어보기"
          style={{ flex: 1, padding: "9px 12px", border: "1px solid var(--n200)", borderRadius: 999, fontSize: 12.5 }}
        />
        <button onClick={send} style={{ padding: "9px 14px", border: "none", borderRadius: 999, background: "var(--p500)", color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
          ↑
        </button>
      </div>
    </aside>
  );
}
