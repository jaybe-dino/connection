import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, SectionTitle } from "@connection/ui";
import { adminApi, type Submission } from "../adminApi";

/** 검수 현황 — 컴플라이언스 자동 체크 결과 열람 + 처리 (본 검수는 브랜드 콘솔 몫). */
export default function Submissions({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Submission[]>([]);
  const load = () => adminApi.submissions().then(setRows).catch(() => {});
  useEffect(() => { void load(); }, []);

  const review = async (id: string, result: "passed" | "needs_fix") => {
    await adminApi.reviewSubmission(id, result).catch(() => {});
    await load();
    onChange();
  };

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>검수 현황</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>
        결과는 통과 / 보완요청 두 가지뿐 (반려 없음). 자동 체크는 컴플라이언스 엔진
        (광고 표기 · 의약품 표현 · 금지어)이 이미 돌렸습니다.
      </div>
      <SectionTitle>검수 대기 {rows.length}건</SectionTitle>
      {rows.length === 0 && <EmptyState>검수 대기 제출물이 없어요</EmptyState>}
      {rows.map((s) => (
        <Card key={s.submissionId}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 13 }}>@{s.handle}</span>
            <Badge>{s.campaignName}</Badge>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--n400)" }}>
              {new Date(s.at).toLocaleString("ko")}
            </span>
          </div>
          <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--n500)", marginBottom: 6 }}>
            {s.url}
          </div>
          {s.caption && (
            <div style={{ fontSize: 13, background: "var(--n50)", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
              {s.caption}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {s.autoChecks.map((c) => (
              <Badge key={c.label} color={c.pass ? "sage" : "amber"}>
                {c.pass ? "✓" : "!"} {c.label}
              </Badge>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => void review(s.submissionId, "passed")}
              style={{ padding: "8px 18px", border: "none", borderRadius: 9, background: "var(--s500)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              통과 → 정산 대상
            </button>
            <button onClick={() => void review(s.submissionId, "needs_fix")}
              style={{ padding: "8px 18px", border: "1px solid var(--a300)", borderRadius: 9, background: "var(--a50)", color: "var(--a700)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              보완요청
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
