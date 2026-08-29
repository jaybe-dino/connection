import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { mockMe } from "@connection/shared/mock";
import { useAppState } from "../state";
import { Badge, Card, OriginalChip } from "../ui";
import { C } from "../theme";

const THREADS: Record<string, { author: "ari" | "me" | "brand"; original: string; originalLocale: string; ko?: string; th?: string; at: string }[]> = {
  glowlab: [
    { author: "ari", original: "ยินดีด้วยค่ะ! ได้รับเลือกแคมเปญโทนอัพซันเซรั่มแล้ว 🎉", originalLocale: "th", ko: "축하해요! 톤업 선세럼 캠페인에 선정됐어요 🎉", at: "10:02" },
    { author: "brand", original: "메이님 콘텐츠 톤이 저희 브랜드랑 잘 맞아요. 잘 부탁드려요!", originalLocale: "ko", th: "โทนคอนเทนต์ของคุณเมเข้ากับแบรนด์เรามาก ฝากด้วยนะคะ!", at: "10:15" },
    { author: "ari", original: "กำลังจัดส่งค่ะ — เช็คสถานะได้ที่แท็บแคมเปญ", originalLocale: "th", ko: "배송 중이에요 — 캠페인 탭에서 상태를 확인할 수 있어요", at: "10:21" },
  ],
  aura: [
    { author: "ari", original: "สัปดาห์นี้มีธีม 'ผิวโกลว์รับซัมเมอร์' ลองดูไหมคะ?", originalLocale: "th", ko: "이번 주 '여름맞이 글로우 피부' 테마가 있어요, 참여해볼래요?", at: "어제" },
  ],
};

export default function ManagerScreen() {
  const { locale, activeBrandId, setActiveBrandId } = useAppState();
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const thread = THREADS[activeBrandId] ?? [];

  return (
    <View>
      <View style={{ flexDirection: "row", marginBottom: 12, gap: 6 }}>
        {mockMe.memberships.map((b) => {
          const active = activeBrandId === b;
          return (
            <Pressable key={b} onPress={() => setActiveBrandId(b)}
              style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: active ? C.t500 : C.n200, backgroundColor: active ? C.t100 : C.n0 }}>
              <Text style={{ fontSize: 12, fontWeight: "800", color: active ? C.t500 : C.n600 }}>
                {b.toUpperCase()} 담당
              </Text>
            </Pressable>
          );
        })}
      </View>

      {thread.map((m, i) => (
        <Card key={i} style={{
          maxWidth: "85%",
          alignSelf: m.author === "me" ? "flex-end" : "flex-start",
          backgroundColor: m.author === "me" ? C.t100 : C.n0,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <Text style={{ fontWeight: "800", fontSize: 11, color: C.n800 }}>
              {m.author === "ari" ? "아리" : m.author === "brand" ? "브랜드 담당자" : "나"}
            </Text>
            {m.author === "ari" && <Badge color="plum">운영</Badge>}
            <Text style={{ marginLeft: "auto", fontSize: 10, color: C.n400 }}>{m.at}</Text>
          </View>
          <OriginalChip original={m.original}
            translated={(m as Record<string, string | undefined>)[locale]}
            originalLocale={m.originalLocale} />
        </Card>
      ))}
      {sent.map((s, i) => (
        <Card key={`s${i}`} style={{ maxWidth: "85%", alignSelf: "flex-end", backgroundColor: C.t100 }}>
          <Text style={{ fontSize: 13, color: C.n800 }}>{s}</Text>
        </Card>
      ))}

      <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="담당자에게 메시지 (자동 번역돼요)"
          placeholderTextColor={C.n400}
          style={{ flex: 1, borderWidth: 1, borderColor: C.n200, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, backgroundColor: C.n0, color: C.n800 }}
        />
        <Pressable
          onPress={() => { if (draft.trim()) { setSent((v) => [...v, draft.trim()]); setDraft(""); } }}
          style={{ backgroundColor: C.t500, borderRadius: 999, paddingHorizontal: 16, justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>전송</Text>
        </Pressable>
      </View>
    </View>
  );
}
