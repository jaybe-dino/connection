import { useState } from "react";
import { Badge, Card, OriginalChip } from "@connection/ui";
import { mockMe } from "@connection/shared/mock";
import { useAppState } from "../state";

/** 담당자 탭 — 셀 스위처 + 1:1 스레드 (대화는 셀끼리 섞이지 않음) */
const THREADS: Record<string, { author: "ari" | "me" | "brand"; original: string; originalLocale: string; ko?: string; th?: string; at: string }[]> = {
  glowlab: [
    { author: "ari", original: "ยินดีด้วยค่ะ! ได้รับเลือกแคมเปญโทนอัพซันเซรั่มแล้ว 🎉", originalLocale: "th", ko: "축하해요! 톤업 선세럼 캠페인에 선정됐어요 🎉", at: "10:02" },
    { author: "brand", original: "메이님 콘텐츠 톤이 저희 브랜드랑 잘 맞아요. 잘 부탁드려요!", originalLocale: "ko", th: "โทนคอนเทนต์ของคุณเมเข้ากับแบรนด์เรามาก ฝากด้วยนะคะ!", at: "10:15" },
    { author: "me", original: "ขอบคุณค่ะ! ตัวอย่างจะถึงเมื่อไหร่คะ?", originalLocale: "th", ko: "감사해요! 샘플은 언제 도착하나요?", at: "10:20" },
    { author: "ari", original: "กำลังจัดส่งค่ะ — เช็คสถานะได้ที่แท็บแคมเปญ (Flash Express)", originalLocale: "th", ko: "배송 중이에요 — 캠페인 탭에서 상태를 확인할 수 있어요 (Flash Express)", at: "10:21" },
  ],
  aura: [
    { author: "ari", original: "สัปดาห์นี้มีธีม 'ผิวโกลว์รับซัมเมอร์' ลองดูไหมคะ?", originalLocale: "th", ko: "이번 주 '여름맞이 글로우 피부' 테마가 있어요, 참여해볼래요?", at: "어제" },
  ],
};

export default function ManagerScreen() {
  const { locale, activeBrandId, setActiveBrandId } = useAppState();
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const thread = THREADS[activeBrandId] ?? [];

  return (
    <div>
      <div style={{ display: "flex", gap: 6, margin: "4px 0 12px" }}>
        {mockMe.memberships.map((b) => (
          <button
            key={b}
            onClick={() => setActiveBrandId(b)}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              border: "1px solid",
              borderColor: activeBrandId === b ? "var(--t500)" : "var(--n200)",
              background: activeBrandId === b ? "var(--t100)" : "var(--n0)",
              color: activeBrandId === b ? "var(--t500)" : "var(--n600)",
            }}
          >
            {b.toUpperCase()} 담당
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {thread.map((m, i) => (
          <Card
            key={i}
            style={{
              padding: 11,
              maxWidth: "85%",
              alignSelf: m.author === "me" ? "flex-end" : "flex-start",
              background: m.author === "me" ? "var(--t100)" : "var(--n0)",
            }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
              <span style={{ fontWeight: 800, fontSize: 11 }}>
                {m.author === "ari" ? "아리" : m.author === "brand" ? "브랜드 담당자" : "나"}
              </span>
              {m.author === "ari" && <Badge color="plum">운영</Badge>}
              <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--n400)" }}>{m.at}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              <OriginalChip
                original={m.original}
                translated={(m as Record<string, string | undefined>)[locale]}
                originalLocale={m.originalLocale}
              />
            </div>
          </Card>
        ))}
        {sent.map((s, i) => (
          <Card key={`s${i}`} style={{ padding: 11, maxWidth: "85%", alignSelf: "flex-end", background: "var(--t100)" }}>
            <div style={{ fontSize: 13 }}>{s}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="담당자에게 메시지 (자동 번역돼요)"
          style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--n200)", borderRadius: 999, fontSize: 13, background: "var(--n0)" }}
        />
        <button
          onClick={() => {
            if (draft.trim()) {
              setSent((v) => [...v, draft.trim()]);
              setDraft("");
            }
          }}
          style={{ padding: "10px 16px", border: "none", borderRadius: 999, background: "var(--t500)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
        >
          전송
        </button>
      </div>
    </div>
  );
}
