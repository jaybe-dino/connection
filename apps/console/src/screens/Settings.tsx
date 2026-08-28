import { useState } from "react";
import { Badge, Card, SectionTitle } from "@connection/ui";
import { GATE_LABEL, type GateKind } from "@connection/shared";

interface Member {
  name: string;
  role: "approver" | "operator" | "viewer";
  gates: GateKind[];
}

const ROLE_LABEL = { approver: "승인자", operator: "운영자", viewer: "뷰어" } as const;
const ALL_GATES: GateKind[] = ["PII", "PAYOUT", "OUTBOUND", "PUBLISH"];

/** 설정 — P0 팀 멤버 · 역할 · 게이트별 승인 권한 + 브랜드 프로필 버전 */
export default function Settings() {
  const [members, setMembers] = useState<Member[]>([
    { name: "김대표", role: "approver", gates: ALL_GATES },
    { name: "이마케터", role: "approver", gates: ["OUTBOUND", "PUBLISH"] },
    { name: "박인턴", role: "viewer", gates: [] },
  ]);

  const toggleGate = (mi: number, g: GateKind) =>
    setMembers((ms) =>
      ms.map((m, i) =>
        i === mi
          ? { ...m, gates: m.gates.includes(g) ? m.gates.filter((x) => x !== g) : [...m.gates, g] }
          : m
      )
    );

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>설정 · 팀</h1>

      <SectionTitle>팀 멤버 · 게이트별 승인 권한 (P0)</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {members.map((m, i) => (
          <Card key={m.name}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>{m.name}</span>
              <Badge color={m.role === "approver" ? "terra" : m.role === "operator" ? "amber" : "neutral"}>
                {ROLE_LABEL[m.role]}
              </Badge>
            </div>
            {m.role === "approver" && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ALL_GATES.map((g) => (
                  <button
                    key={g}
                    onClick={() => toggleGate(i, g)}
                    style={{
                      padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                      border: "1px solid", borderColor: m.gates.includes(g) ? "var(--s500)" : "var(--n200)",
                      background: m.gates.includes(g) ? "var(--s100)" : "var(--n0)",
                      color: m.gates.includes(g) ? "var(--s700)" : "var(--n400)",
                    }}
                  >
                    {g} · {GATE_LABEL[g]}
                  </button>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      <SectionTitle>브랜드 프로필 버전</SectionTitle>
      <Card>
        {[
          ["v3", "운영 피드백 — 금지어 '미백' 추가 (검수 반려 3건)", "08-25"],
          ["v2", "5문항 답변 수정 — 맞는 크리에이터像 구체화", "08-12"],
          ["v1", "사이트 학습 + 온보딩 5문항 (가입 시)", "08-01"],
        ].map(([v, note, at]) => (
          <div key={v} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--n100)", fontSize: 13 }}>
            <span style={{ fontFamily: "var(--mono)", fontWeight: 800, width: 28 }}>{v}</span>
            <span style={{ flex: 1 }}>{note}</span>
            <span style={{ color: "var(--n400)", fontSize: 11 }}>{at}</span>
          </div>
        ))}
        <div style={{ fontSize: 11, color: "var(--n400)", marginTop: 8 }}>
          소비처 4곳 — 4축 판정 적합도 · 초대문/공고 개인화 · 채널 우선순위 · 금지어 필터
        </div>
      </Card>
    </div>
  );
}
