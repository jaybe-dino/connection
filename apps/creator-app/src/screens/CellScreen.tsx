import { useState } from "react";
import { Badge, Card, EmptyState, OriginalChip } from "@connection/ui";
import type { CellChannel } from "@connection/shared";
import { mockCells } from "@connection/shared/mock";
import { useAppState } from "../state";

const CHANNELS: { id: CellChannel; label: string; readonly?: boolean }[] = [
  { id: "chat", label: "# 잡담" },
  { id: "tips", label: "# 촬영 팁" },
  { id: "notice", label: "◎ 공지", readonly: true },
];

export default function CellScreen() {
  const { locale, activeBrandId } = useAppState();
  const [channel, setChannel] = useState<CellChannel>("chat");
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const cell = mockCells.find((c) => c.brandId === activeBrandId) ?? mockCells[0];
  const messages = cell.messages.filter((m) => m.channel === channel);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 2px 10px" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{cell.name}</div>
          <div style={{ fontSize: 11, color: "var(--n500)" }}>
            멤버 {cell.memberCount} · 상한 없음
          </div>
        </div>
        <button
          onClick={() => navigator.clipboard?.writeText(`https://connection.app/${cell.brandId}`)}
          style={{ border: "1px solid var(--n200)", background: "var(--n0)", borderRadius: 999, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}
          title="링크는 숨기고 공유는 버튼"
        >
          ↗ 공유
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {CHANNELS.map((ch) => (
          <button
            key={ch.id}
            onClick={() => setChannel(ch.id)}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid",
              borderColor: channel === ch.id ? "var(--n800)" : "var(--n200)",
              background: channel === ch.id ? "var(--n800)" : "var(--n0)",
              color: channel === ch.id ? "var(--n0)" : "var(--n600)",
            }}
          >
            {ch.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.length === 0 && <EmptyState>아직 메시지가 없어요</EmptyState>}
        {messages.map((m) => (
          <Card key={m.id} style={{ padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 12 }}>
                {m.authorKind === "ari" ? "아리" : `@${m.author}`}
              </span>
              {m.authorKind === "ari" && <Badge color="plum">운영</Badge>}
              {m.authorKind === "brand" && <Badge color="terra">브랜드</Badge>}
              <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--n400)" }}>{m.at}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              <OriginalChip
                original={m.original}
                translated={m.translations[locale]}
                originalLocale={m.originalLocale}
              />
            </div>
            {channel !== "notice" && (
              <button
                onClick={() => setReportTarget(m.id)}
                style={{ marginTop: 6, border: "none", background: "none", fontSize: 10, color: "var(--n400)", cursor: "pointer", padding: 0 }}
              >
                신고
              </button>
            )}
          </Card>
        ))}
      </div>

      {reportTarget && (
        <Card style={{ marginTop: 12, borderColor: "var(--c300)" }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>메시지 신고</div>
          <div style={{ fontSize: 12, color: "var(--n600)", marginBottom: 10 }}>
            신고하면 아리가 1차 분류 후 운영자가 검토합니다. 신고자는 익명입니다.
          </div>
          {["스팸·광고", "괴롭힘·혐오", "기타"].map((r) => (
            <button
              key={r}
              onClick={() => setReportTarget(null)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", marginBottom: 4, border: "1px solid var(--n150)", borderRadius: 8, background: "var(--n50)", fontSize: 12, cursor: "pointer" }}
            >
              {r}
            </button>
          ))}
          <button onClick={() => setReportTarget(null)} style={{ border: "none", background: "none", fontSize: 11, color: "var(--n400)", cursor: "pointer" }}>
            취소
          </button>
        </Card>
      )}
    </div>
  );
}
