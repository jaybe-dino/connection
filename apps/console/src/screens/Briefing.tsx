import { useNavigate } from "react-router-dom";
import { Card, SectionTitle } from "@connection/ui";
import { useGates } from "../gateStore";

/** 브리핑 — 지표 4 · 오늘 결정할 것 · 아리 노트 */
export default function Briefing() {
  const nav = useNavigate();
  const { gates, pendingCount } = useGates();

  const stats = [
    { label: "셀 발화 (어제)", value: "34건", note: "건강 · 침묵 없음" },
    { label: "캠페인 진행", value: "3개", note: "지원 27 · 선정 10" },
    { label: "母 DB 후보 큐", value: "128명", note: "판정 대기 12" },
    { label: "이번 달 완주 CAC", value: "₩8,400", note: "리퍼럴이 최저" },
  ];

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>브리핑</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>하루 10분 — 결정과 대화가 전부예요</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 16 }}>
        {stats.map((s) => (
          <Card key={s.label} style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: "var(--n500)", fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, margin: "4px 0 2px" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "var(--n400)" }}>{s.note}</div>
          </Card>
        ))}
      </div>

      <SectionTitle right={<span style={{ fontSize: 11, color: "var(--n400)" }}>{pendingCount}건 대기</span>}>
        오늘 결정할 것
      </SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {gates.filter((g) => g.state === "PENDING" || g.state === "HELD").slice(0, 3).map((g) => (
          <Card key={g.id} onClick={() => nav("/approvals")}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--t500)" }}>{g.kind}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{g.summary}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--n400)" }}>{g.at} ›</span>
            </div>
          </Card>
        ))}
      </div>

      <SectionTitle>아리 노트</SectionTitle>
      <Card style={{ background: "var(--p50)", borderColor: "transparent" }}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
          <li>틱톡샵 아웃바운드 수락률 41% — 3일 평균 상승세, 초대권 20장 유지 제안.</li>
          <li>@glow.linh 첫 제출 완료 — 리퍼럴 코드 보상 지급이 PAYOUT 게이트에 있어요.</li>
          <li>수요일 팁 큐레이션 초안 준비됨 — PUBLISH 게이트에서 확인해 주세요.</li>
        </ul>
      </Card>
    </div>
  );
}
