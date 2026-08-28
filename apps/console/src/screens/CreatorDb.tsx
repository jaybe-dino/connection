import { useState } from "react";
import { Badge, Card, SectionTitle } from "@connection/ui";
import type { Segment } from "@connection/shared";
import { mockDbRows } from "@connection/shared/mock";

const SEGMENTS: { id: Segment | "all"; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "active", label: "활성" },
  { id: "new", label: "신규" },
  { id: "invited", label: "초대됨" },
  { id: "dormant", label: "휴면" },
  { id: "churned", label: "이탈" },
  { id: "billing_excluded", label: "과금 제외" },
];

/** 크리에이터 DB — 세그먼트 · 검색 · 레코드 카드(보유 필드와 근거) · 위생 스트립 */
export default function CreatorDb() {
  const [segment, setSegment] = useState<Segment | "all">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const rows = mockDbRows.filter(
    (r) =>
      (segment === "all" || r.segment === segment) &&
      (q === "" || r.handle.includes(q.toLowerCase()))
  );
  const detail = mockDbRows.find((r) => r.id === selected);

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>크리에이터 DB</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>
        전원 OAuth 검증 — 수기 행이 없어 가짜·중복이 구조적으로 안 생겨요
      </div>

      <div style={{ display: "flex", gap: 6, margin: "14px 0", flexWrap: "wrap" }}>
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSegment(s.id)}
            style={{
              padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
              border: "1px solid", borderColor: segment === s.id ? "var(--n800)" : "var(--n200)",
              background: segment === s.id ? "var(--n800)" : "var(--n0)",
              color: segment === s.id ? "var(--n0)" : "var(--n600)",
            }}
          >
            {s.label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="핸들 검색"
          style={{ marginLeft: "auto", padding: "6px 12px", border: "1px solid var(--n200)", borderRadius: 999, fontSize: 12 }}
        />
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--n100)", fontSize: 11, color: "var(--n500)" }}>
              {["핸들", "플랫폼", "국가", "등급", "영향력", "세그먼트"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setSelected(r.id)} style={{ borderTop: "1px solid var(--n100)", cursor: "pointer", background: selected === r.id ? "var(--t100)" : undefined }}>
                <td style={{ padding: "9px 12px", fontWeight: 700 }}>@{r.handle} <Badge color="sage">✓</Badge></td>
                <td style={{ padding: "9px 12px" }}>{r.platform}</td>
                <td style={{ padding: "9px 12px" }}>{r.country}</td>
                <td style={{ padding: "9px 12px" }}>{r.grade}</td>
                <td style={{ padding: "9px 12px", fontFamily: "var(--mono)" }}>{r.influence}</td>
                <td style={{ padding: "9px 12px" }}>
                  <Badge color={r.segment === "billing_excluded" ? "amber" : r.segment === "active" ? "sage" : "neutral"}>
                    {SEGMENTS.find((s) => s.id === r.segment)?.label}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {detail && (
        <>
          <SectionTitle>레코드 카드 — @{detail.handle}</SectionTitle>
          <Card>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>보유 필드와 근거</div>
            {detail.fieldsWithBasis.map((f) => (
              <div key={f.field} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--n100)", fontSize: 13 }}>
                <span>{f.field}</span>
                <span style={{ color: "var(--n500)", fontSize: 12 }}>{f.basis}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button style={{ padding: "7px 14px", border: "1px solid var(--n200)", borderRadius: 9, background: "var(--n0)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                CSV 내보내기 — 연락처 포함 시 PII 게이트
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--n400)", marginTop: 10 }}>
              위생: 본인 수정 실시간 반영 · SNS 90일 재검증 · 필드 파기 예약
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
