import { useState } from "react";
import { Badge, Card, EmptyState, GateBadge, SectionTitle } from "@connection/ui";
import { GATE_LABEL, type GateKind } from "@connection/shared";
import { useGates } from "../gateStore";

const KINDS: (GateKind | "ALL")[] = ["ALL", "PII", "PAYOUT", "OUTBOUND", "PUBLISH"];

/** 승인함 — 게이트 4종. 누르기 전엔 아무 일도 일어나지 않는다. */
export default function Approvals() {
  const { gates, decide } = useGates();
  const [filter, setFilter] = useState<GateKind | "ALL">("ALL");
  const open = gates.filter(
    (g) =>
      (g.state === "PENDING" || g.state === "HELD") &&
      (filter === "ALL" || g.kind === filter)
  );
  const decided = gates.filter((g) => g.state === "APPROVED" || g.state === "REJECTED");

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>승인함</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>
        자율 등급과 무관하게 — 밖으로 나가는 건 전부 여기서 사람이 승인해요
      </div>

      <div style={{ display: "flex", gap: 6, margin: "14px 0" }}>
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
              border: "1px solid", borderColor: filter === k ? "var(--n800)" : "var(--n200)",
              background: filter === k ? "var(--n800)" : "var(--n0)",
              color: filter === k ? "var(--n0)" : "var(--n600)",
            }}
          >
            {k === "ALL" ? "전체" : k}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {open.length === 0 && <EmptyState>대기 중인 승인이 없어요</EmptyState>}
        {open.map((g) => (
          <Card key={g.id}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <GateBadge kind={g.kind} />
              <span style={{ fontSize: 11, color: "var(--n500)" }}>{GATE_LABEL[g.kind]}</span>
              {g.state === "HELD" && <Badge color="amber">보류 중</Badge>}
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--n400)" }}>
                아리 · {g.at}
              </span>
            </div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{g.summary}</div>
            <div style={{ fontSize: 12, color: "var(--n500)", margin: "3px 0 12px" }}>{g.detail}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => decide(g.id, "APPROVED")}
                style={{ padding: "8px 18px", border: "none", borderRadius: 9, background: "var(--s500)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
              >
                승인 · 실행
              </button>
              <button
                onClick={() => decide(g.id, "HELD")}
                style={{ padding: "8px 18px", border: "1px solid var(--n200)", borderRadius: 9, background: "var(--n0)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                title="보류해도 크리에이터에게는 아무 안내도 나가지 않아요"
              >
                보류
              </button>
              <button
                onClick={() => decide(g.id, "REJECTED")}
                style={{ padding: "8px 18px", border: "none", borderRadius: 9, background: "var(--c50)", color: "var(--c500)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                거절
              </button>
            </div>
          </Card>
        ))}
      </div>

      {decided.length > 0 && (
        <>
          <SectionTitle>처리됨</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {decided.map((g) => (
              <Card key={g.id} style={{ opacity: 0.6, padding: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                  <GateBadge kind={g.kind} />
                  {g.summary}
                  <span style={{ marginLeft: "auto" }}>
                    {g.state === "APPROVED"
                      ? <Badge color="sage">승인 · 실행됨</Badge>
                      : <Badge color="clay">거절</Badge>}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 16, fontSize: 11, color: "var(--n400)" }}>
        P0 예정: 메일·카카오·슬랙 승인 대기 알림 + 모바일 승인
      </div>
    </div>
  );
}
