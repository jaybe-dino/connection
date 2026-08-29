import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { mockCampaigns, mockPayouts } from "@connection/shared/mock";
import { Badge, Card, SectionTitle } from "../ui";
import { C } from "../theme";

export default function PayoutScreen() {
  const [onboarded, setOnboarded] = useState(false);

  return (
    <View>
      {!onboarded ? (
        <Card style={{ borderColor: C.a300, backgroundColor: C.a50 }}>
          <Text style={{ fontWeight: "800", fontSize: 13, marginBottom: 4, color: C.n800 }}>
            정산 수단을 연결하세요
          </Text>
          <Text style={{ fontSize: 12, color: C.n600, lineHeight: 19 }}>
            PingPong 계정 연결 · 최소 인출 ฿500 · 수수료 1% · 실패 시 자동 재시도 3회
          </Text>
          <Pressable onPress={() => setOnboarded(true)}
            style={{ marginTop: 10, alignSelf: "flex-start", backgroundColor: C.n800, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>PingPong 연결</Text>
          </Pressable>
        </Card>
      ) : (
        <Card style={{ borderColor: C.s300, backgroundColor: C.s50 }}>
          <Text style={{ fontSize: 12, color: C.s700, fontWeight: "700" }}>
            ✓ PingPong 연결됨 — mai****@pingpong
          </Text>
        </Card>
      )}

      <SectionTitle>지급 예정</SectionTitle>
      {mockPayouts.filter((p) => p.status === "scheduled").map((p) => <Row key={p.id} p={p} />)}
      <SectionTitle>지급 완료</SectionTitle>
      {mockPayouts.filter((p) => p.status === "paid").map((p) => <Row key={p.id} p={p} />)}
      <Text style={{ marginTop: 16, fontSize: 11, color: C.n400, textAlign: "center" }}>
        연간 소득 문서 다운로드는 준비 중이에요 (P1)
      </Text>
    </View>
  );
}

function Row({ p }: { p: (typeof mockPayouts)[number] }) {
  const campaign = mockCampaigns.find((c) => c.id === p.campaignId);
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "800", fontSize: 13, color: C.n800 }}>
            {campaign?.name ?? p.campaignId}
          </Text>
          <Text style={{ fontSize: 11, color: C.n500 }}>{p.brandId.toUpperCase()} 셀 · {p.at}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 3 }}>
          <Text style={{ fontWeight: "900", fontSize: 15, color: C.n800 }}>
            ฿{p.amount.toLocaleString()}
          </Text>
          {p.status === "scheduled" ? <Badge color="amber">예정</Badge> : <Badge color="sage">완료</Badge>}
        </View>
      </View>
    </Card>
  );
}
