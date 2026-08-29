import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { mockCampaigns, mockSubmissions } from "@connection/shared/mock";
import { Badge, Card, SectionTitle } from "../ui";
import { C } from "../theme";

export default function SubmitScreen() {
  const [url, setUrl] = useState("");
  const [fixed, setFixed] = useState(false);
  const sub = mockSubmissions[0];
  const campaign = mockCampaigns.find((c) => c.id === sub.campaignId);
  const checks = sub.autoChecks.map((c) =>
    fixed && c.label === "#ad 표기" ? { ...c, pass: true } : c);
  const allPass = checks.every((c) => c.pass);

  return (
    <View>
      <SectionTitle>새 제출</SectionTitle>
      <Card>
        <TextInput
          value={url} onChangeText={setUrl}
          placeholder="영상 링크 붙여넣기 (TikTok · Instagram)"
          placeholderTextColor={C.n400}
          style={{ borderWidth: 1, borderColor: C.n200, borderRadius: 10, padding: 11, fontSize: 13, backgroundColor: C.n50, color: C.n800 }}
        />
        <Text style={{ fontSize: 11, color: C.n400, marginTop: 6 }}>
          붙여넣으면 길이 · 노출 · #ad · 금지어를 자동 체크해요
        </Text>
      </Card>

      <SectionTitle>진행 중</SectionTitle>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Text style={{ fontSize: 22 }}>{campaign?.imageEmoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "800", fontSize: 13, color: C.n800 }}>{campaign?.name}</Text>
            <Text style={{ fontSize: 11, color: C.n500 }}>{sub.url}</Text>
          </View>
          {allPass ? <Badge color="sage">검수 대기</Badge> : <Badge color="amber">보완 필요</Badge>}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {checks.map((c) => (
            <View key={c.label} style={{
              flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 7,
              borderRadius: 8, backgroundColor: c.pass ? C.s50 : C.a50, minWidth: "47%",
            }}>
              <Text style={{ fontWeight: "900", color: c.pass ? C.s700 : C.a700 }}>
                {c.pass ? "✓" : "!"}
              </Text>
              <Text style={{ fontSize: 12, color: C.n800 }}>{c.label}</Text>
            </View>
          ))}
        </View>
        {!allPass && (
          <Pressable onPress={() => setFixed(true)}
            style={{ marginTop: 10, padding: 11, borderRadius: 10, backgroundColor: C.a500, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
              원클릭 보정 — 캡션에 #ad 추가
            </Text>
          </Pressable>
        )}
        {allPass && (
          <View style={{ marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: C.s50 }}>
            <Text style={{ fontSize: 12, color: C.s700 }}>
              체크 통과 — 검수는 통과/보완요청 두 가지뿐이에요 (반려 없음)
            </Text>
          </View>
        )}
      </Card>
    </View>
  );
}
