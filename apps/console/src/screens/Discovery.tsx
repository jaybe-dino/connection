import { Badge, Card, SectionTitle } from "@connection/ui";

/** 발굴 · 수집 — 에이전트 8명 근무 현황 (기획안 §4.3) */
const AGENTS = [
  { name: "틱톡샵 아웃바운드", status: "근무", note: "일 20장 초대권 · 수락률 41%", gate: "발송 = 승인" },
  { name: "커뮤니티 씨딩", status: "근무", note: "커뮤니티 5곳 · 규범 메모리 v12", gate: "게시 = 승인 · 주 1회" },
  { name: "메일 리서치·발송", status: "근무", note: "3단 시퀀스 · 스팸 0.4", gate: "OUTBOUND · 일 80건" },
  { name: "인스타 DM", status: "대기", note: "반응 있던 계정만 · 일 30건", gate: "상한 자동 준수" },
  { name: "인바운드 판정", status: "근무", note: "평균 판정 62초", gate: "L2 자동" },
  { name: "소싱 스윕", status: "예약", note: "주 1회 · 다음 일요일", gate: "공개 데이터만" },
  { name: "리퍼럴 운영", status: "근무", note: "이번 달 가입의 22%", gate: "지급 = 승인" },
  { name: "재접촉·정리", status: "근무", note: "수신거부 0건 대기", gate: "L2 고정" },
];

const FUNNEL = [
  { label: "후보 큐", value: 128 },
  { label: "4축 판정 통과", value: 74 },
  { label: "초대 발송", value: 40 },
  { label: "가입 완료", value: 17 },
];

export default function Discovery() {
  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>발굴 · 수집</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>
        담당자 8명 — 목표·KPI·실패 조건을 가진 에이전트. 모든 판단은 30일 뒤 채점돼요.
      </div>

      <SectionTitle>이번 주 파이프라인</SectionTitle>
      <Card>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {FUNNEL.map((f, i) => (
            <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 900 }}>{f.value}</div>
                <div style={{ fontSize: 11, color: "var(--n500)" }}>{f.label}</div>
              </div>
              {i < FUNNEL.length - 1 && <span style={{ color: "var(--n300)" }}>→</span>}
            </div>
          ))}
        </div>
      </Card>

      <SectionTitle>근무 현황</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {AGENTS.map((a) => (
          <Card key={a.name} style={{ padding: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>{a.name}</span>
              <span style={{ marginLeft: "auto" }}>
                <Badge color={a.status === "근무" ? "sage" : a.status === "대기" ? "amber" : "neutral"}>
                  {a.status}
                </Badge>
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--n600)" }}>{a.note}</div>
            <div style={{ fontSize: 10, color: "var(--n400)", marginTop: 4 }}>게이트: {a.gate}</div>
          </Card>
        ))}
      </div>

      <SectionTitle>수집엔진 (母 DB)</SectionTitle>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, fontSize: 12 }}>
          <div><div style={{ fontSize: 18, fontWeight: 900 }}>412,380</div><div style={{ color: "var(--n500)" }}>TH 母 DB 계정</div></div>
          <div><div style={{ fontSize: 18, fontWeight: 900 }}>2.4%</div><div style={{ color: "var(--n500)" }}>신규 발견률 (수렴 근접)</div></div>
          <div><div style={{ fontSize: 18, fontWeight: 900 }}>63%</div><div style={{ color: "var(--n500)" }}>mid+ 이메일 커버리지</div></div>
          <div><div style={{ fontSize: 18, fontWeight: 900 }}>41원</div><div style={{ color: "var(--n500)" }}>계정당 원가 (목표 30~120)</div></div>
        </div>
      </Card>
    </div>
  );
}
