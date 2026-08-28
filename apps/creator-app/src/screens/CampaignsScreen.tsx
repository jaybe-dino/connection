import { useNavigate, useParams } from "react-router-dom";
import { Badge, Card, RewardBadge, SectionTitle, StepTracker } from "@connection/ui";
import { mockCampaigns } from "@connection/shared/mock";

const MY_STATUS_LABEL: Record<string, [string, string]> = {
  applied: ["지원 완료", "amber"],
  selected: ["선정됨", "sage"],
  shipping: ["배송 준비", "terra"],
  submitted: ["제출됨", "neutral"],
  passed: ["검수 통과", "sage"],
};

export default function CampaignsScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const detail = id ? mockCampaigns.find((c) => c.id === id) : undefined;

  if (detail) {
    const st = detail.myStatus && MY_STATUS_LABEL[detail.myStatus];
    return (
      <div>
        <button onClick={() => nav("/campaigns")} style={{ border: "none", background: "none", fontSize: 12, color: "var(--n500)", cursor: "pointer", padding: "4px 0" }}>
          ← 목록
        </button>
        <Card>
          <div style={{ fontSize: 34 }}>{detail.imageEmoji}</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "6px 0" }}>
            <RewardBadge type={detail.rewardType} />
            {st && <Badge color={st[1]}>{st[0]}</Badge>}
          </div>
          <div style={{ fontWeight: 900, fontSize: 17 }}>{detail.name}</div>
          <div style={{ fontSize: 12, color: "var(--n500)", marginTop: 2 }}>{detail.product}</div>
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--t500)", fontWeight: 700 }}>
            “{detail.usp}”
          </div>
          <SectionTitle>조건</SectionTitle>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
            {detail.conditions.map((c) => <li key={c}>{c}</li>)}
            {detail.rewardType === "paid" && <li>보상 ฿{detail.rewardAmount?.toLocaleString()} — 검수 통과 시 지급</li>}
            {detail.rewardType === "affiliate" && <li>판매액 {detail.affiliatePct}% · 전용 링크</li>}
          </ul>
          <div style={{ fontSize: 11, color: "var(--n400)", marginTop: 8 }}>
            정원 {detail.capacity} · 마감 {detail.deadline} · 원문 KO
          </div>
        </Card>

        {detail.tracking && (
          <>
            <SectionTitle>배송 추적</SectionTitle>
            <Card>
              <div style={{ fontSize: 12, marginBottom: 12 }}>
                {detail.tracking.carrier} · <span style={{ fontFamily: "var(--mono)" }}>{detail.tracking.trackingNo}</span>
              </div>
              <StepTracker steps={detail.tracking.steps} />
            </Card>
          </>
        )}

        {detail.myStatus === "none" && (
          <button style={{ width: "100%", marginTop: 14, padding: 13, border: "none", borderRadius: "var(--radius)", background: "var(--t500)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            지원하기
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <SectionTitle right={<span style={{ fontSize: 11, color: "var(--n400)" }}>내 언어로 표시 · 원문 칩</span>}>
        캠페인
      </SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {mockCampaigns.map((c) => {
          const st = c.myStatus && c.myStatus !== "none" ? MY_STATUS_LABEL[c.myStatus] : null;
          return (
            <Card key={c.id} onClick={() => nav(`/campaigns/${c.id}`)}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 30 }}>{c.imageEmoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 3 }}>
                    <RewardBadge type={c.rewardType} />
                    {st && <Badge color={st[1]}>{st[0]}</Badge>}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "var(--n500)" }}>
                    {c.usp} · 마감 {c.deadline}
                  </div>
                </div>
                <div style={{ color: "var(--n300)" }}>›</div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
