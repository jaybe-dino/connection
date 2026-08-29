import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Campaign } from "@connection/shared";
import { mockCampaigns, mockMe } from "@connection/shared/mock";
import { api } from "../api";
import { Badge, Card, PrimaryButton, RewardBadge, SectionTitle, StepTracker } from "../ui";
import { C } from "../theme";

const MY_STATUS: Record<string, [string, string]> = {
  applied: ["지원 완료", "amber"], selected: ["선정됨", "sage"],
  shipping: ["배송 준비", "terra"], submitted: ["제출됨", "neutral"], passed: ["검수 통과", "sage"],
};

export default function CampaignsScreen() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(mockCampaigns);
  const [live, setLive] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    api.campaigns(mockMe.id)
      .then((rows) => { setCampaigns(rows); setLive(true); })
      .catch(() => setLive(false));
  }, []);

  const apply = (id: string) => {
    setCampaigns((cs) => cs.map((c) => (c.id === id ? { ...c, myStatus: "applied" } : c)));
    if (live) api.applyCampaign(id, mockMe.id).catch(() => {});
  };

  const detail = detailId ? campaigns.find((c) => c.id === detailId) : null;

  if (detail) {
    const st = detail.myStatus && detail.myStatus !== "none" ? MY_STATUS[detail.myStatus] : null;
    return (
      <View>
        <Pressable onPress={() => setDetailId(null)}>
          <Text style={{ fontSize: 12, color: C.n500, paddingVertical: 4 }}>← 목록</Text>
        </Pressable>
        <Card>
          <Text style={{ fontSize: 34 }}>{detail.imageEmoji}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginVertical: 6 }}>
            <RewardBadge type={detail.rewardType} />
            {st && <Badge color={st[1]}>{st[0]}</Badge>}
          </View>
          <Text style={{ fontWeight: "900", fontSize: 17, color: C.n800 }}>{detail.name}</Text>
          <Text style={{ fontSize: 12, color: C.n500, marginTop: 2 }}>{detail.product}</Text>
          <Text style={{ marginTop: 8, fontSize: 13, color: C.t500, fontWeight: "700" }}>“{detail.usp}”</Text>
          <SectionTitle>조건</SectionTitle>
          {detail.conditions.map((c) => (
            <Text key={c} style={{ fontSize: 13, lineHeight: 22, color: C.n800 }}>· {c}</Text>
          ))}
          {detail.rewardType === "paid" && (
            <Text style={{ fontSize: 13, lineHeight: 22, color: C.n800 }}>
              · 보상 ฿{detail.rewardAmount?.toLocaleString()} — 검수 통과 시 지급
            </Text>
          )}
          {detail.rewardType === "affiliate" && (
            <Text style={{ fontSize: 13, lineHeight: 22, color: C.n800 }}>· 판매액 {detail.affiliatePct}% · 전용 링크</Text>
          )}
          <Text style={{ fontSize: 11, color: C.n400, marginTop: 8 }}>
            정원 {detail.capacity} · 마감 {detail.deadline} · 원문 KO
          </Text>
        </Card>

        {detail.tracking && (
          <>
            <SectionTitle>배송 추적</SectionTitle>
            <Card>
              <Text style={{ fontSize: 12, marginBottom: 12, color: C.n800 }}>
                {detail.tracking.carrier} · {detail.tracking.trackingNo}
              </Text>
              <StepTracker steps={detail.tracking.steps} />
            </Card>
          </>
        )}

        {detail.myStatus === "none" && <PrimaryButton label="지원하기" onPress={() => apply(detail.id)} />}
      </View>
    );
  }

  return (
    <View>
      <SectionTitle right={<Text style={{ fontSize: 11, color: C.n400 }}>내 언어로 표시 · 원문 칩</Text>}>
        캠페인
      </SectionTitle>
      {campaigns.map((c) => {
        const st = c.myStatus && c.myStatus !== "none" ? MY_STATUS[c.myStatus] : null;
        return (
          <Card key={c.id} onPress={() => setDetailId(c.id)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={{ fontSize: 30 }}>{c.imageEmoji}</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 3 }}>
                  <RewardBadge type={c.rewardType} />
                  {st && <Badge color={st[1]}>{st[0]}</Badge>}
                </View>
                <Text style={{ fontWeight: "800", fontSize: 14, color: C.n800 }}>{c.name}</Text>
                <Text style={{ fontSize: 11, color: C.n500 }}>{c.usp} · 마감 {c.deadline}</Text>
              </View>
              <Text style={{ color: C.n300 }}>›</Text>
            </View>
          </Card>
        );
      })}
    </View>
  );
}
