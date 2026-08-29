import { useEffect, useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { LOCALE_LABEL, type Locale } from "@connection/shared";
import { mockMe } from "@connection/shared/mock";
import { api } from "../api";
import { useAppState } from "../state";
import { Badge, Card, SectionTitle } from "../ui";
import { C } from "../theme";

const FIELDS = [
  ["address", "배송 주소"], ["phone", "연락처"],
  ["skinType", "피부 타입"], ["bank", "계좌"],
] as const;

export default function PassScreen() {
  const { locale, setLocale } = useAppState();
  const [crossReco, setCrossReco] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({
    address: "123/45 Sukhumvit Rd, Bangkok", phone: "+66 81 234 5678",
    skinType: "복합성 · 민감", bank: "PingPong 연결됨",
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    api.me(mockMe.id)
      .then((me) => {
        setFields((f) => {
          const next = { ...f };
          for (const [k] of FIELDS) if (me.fields[k]) next[k] = me.fields[k].value;
          return next;
        });
        setLive(true);
      })
      .catch(() => setLive(false));
  }, []);

  const save = (key: string, value: string) => {
    setSavedAt(new Date().toLocaleTimeString("ko", { hour: "2-digit", minute: "2-digit" }));
    if (live) api.updateField(mockMe.id, key, value).catch(() => {});
  };

  const changeLocale = (l: Locale) => {
    setLocale(l);
    if (live) api.updateLocale(mockMe.id, l).catch(() => {});
  };

  return (
    <View>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.t100, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 22, fontWeight: "900", color: C.t500 }}>M</Text>
          </View>
          <View>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Text style={{ fontWeight: "900", fontSize: 16, color: C.n800 }}>@{mockMe.handle}</Text>
              {mockMe.verified && <Badge color="sage">✓ 검증</Badge>}
            </View>
            <Text style={{ fontSize: 12, color: C.n500 }}>
              완주율 {Math.round(mockMe.completionRate * 100)}% · {mockMe.grade} · 브랜드 {mockMe.memberships.length}곳
            </Text>
          </View>
        </View>
        <Text style={{ marginTop: 10, fontSize: 11, color: C.n400 }}>
          기록은 본인 소유예요 — 브랜드가 바뀌어도 따라갑니다
        </Text>
      </Card>

      <SectionTitle>언어</SectionTitle>
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {(Object.keys(LOCALE_LABEL) as Locale[]).map((l) => {
            const active = locale === l;
            return (
              <Pressable key={l} onPress={() => changeLocale(l)}
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: active ? C.t500 : C.n200, backgroundColor: active ? C.t100 : C.n0 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: active ? C.t500 : C.n600 }}>
                  {LOCALE_LABEL[l]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ fontSize: 11, color: C.n400, marginTop: 8 }}>
          IP로 자동 설정된 초기값이에요 — 언제든 바꿀 수 있어요
        </Text>
      </Card>

      <SectionTitle right={savedAt ? (
        <Text style={{ fontSize: 11, color: C.s700 }}>✓ {savedAt} 저장 · 브랜드 DB 실시간 반영</Text>
      ) : undefined}>
        내 정보 관리
      </SectionTitle>
      <Card>
        {FIELDS.map(([key, label]) => (
          <View key={key} style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: C.n500, marginBottom: 3 }}>{label}</Text>
            <TextInput
              value={fields[key]}
              onChangeText={(v) => setFields((f) => ({ ...f, [key]: v }))}
              onBlur={() => save(key, fields[key])}
              style={{ borderWidth: 1, borderColor: C.n200, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, backgroundColor: C.n50, color: C.n800 }}
            />
          </View>
        ))}
      </Card>

      <SectionTitle>동의 설정</SectionTitle>
      <Card>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Switch value={crossReco} onValueChange={setCrossReco} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700", fontSize: 13, color: C.n800 }}>교차 브랜드 추천 받기</Text>
            <Text style={{ fontSize: 11, color: C.n500, lineHeight: 16 }}>
              담당자 대화로만 · 월 1회 이하 · 같은 카테고리 브랜드는 제외돼요
            </Text>
          </View>
        </View>
        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.n100 }}>
          <Text style={{ fontWeight: "700", fontSize: 12, color: C.n800, marginBottom: 4 }}>초대 링크 입장</Text>
          <Text style={{ fontSize: 11, color: C.n500 }}>
            셀 탐색 기능은 없어요 — 초대 링크로만 새 브랜드에 합류합니다
          </Text>
        </View>
      </Card>

      <Text style={{ marginVertical: 16, fontSize: 11, color: C.n400, textAlign: "center" }}>
        탈퇴 · 데이터 내보내기 (준비 중 · P1)
      </Text>
    </View>
  );
}
