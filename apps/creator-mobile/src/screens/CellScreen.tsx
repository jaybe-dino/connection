import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { CellChannel, CellMessage } from "@connection/shared";
import { mockCells } from "@connection/shared/mock";
import { api } from "../api";
import { useAppState } from "../state";
import { Badge, Card, Chip, EmptyState, OriginalChip } from "../ui";
import { C } from "../theme";

const CHANNELS: { id: CellChannel; label: string }[] = [
  { id: "chat", label: "# 잡담" },
  { id: "tips", label: "# 촬영 팁" },
  { id: "notice", label: "◎ 공지" },
];

export default function CellScreen() {
  const { locale, activeBrandId } = useAppState();
  const [channel, setChannel] = useState<CellChannel>("chat");
  const [reporting, setReporting] = useState<string | null>(null);
  const cell = mockCells.find((c) => c.brandId === activeBrandId) ?? mockCells[0];
  const [remote, setRemote] = useState<CellMessage[] | null>(null);

  useEffect(() => {
    api.cellMessages(cell.id).then(setRemote).catch(() => setRemote(null));
  }, [cell.id]);

  const messages = (remote ?? cell.messages).filter((m) => m.channel === channel);

  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <View>
          <Text style={{ fontWeight: "800", fontSize: 15, color: C.n800 }}>{cell.name}</Text>
          <Text style={{ fontSize: 11, color: C.n500 }}>멤버 {cell.memberCount} · 상한 없음</Text>
        </View>
        <Pressable style={{ borderWidth: 1, borderColor: C.n200, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: C.n0 }}>
          <Text style={{ fontSize: 12, color: C.n700 }}>↗ 공유</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", marginBottom: 12 }}>
        {CHANNELS.map((ch) => (
          <Chip key={ch.id} label={ch.label} active={channel === ch.id} onPress={() => setChannel(ch.id)} />
        ))}
      </View>

      {messages.length === 0 && <EmptyState>아직 메시지가 없어요</EmptyState>}
      {messages.map((m) => (
        <Card key={m.id}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 6 }}>
            <Text style={{ fontWeight: "800", fontSize: 12, color: C.n800 }}>
              {m.authorKind === "ari" ? "아리" : `@${m.author}`}
            </Text>
            {m.authorKind === "ari" && <Badge color="plum">운영</Badge>}
            {m.authorKind === "brand" && <Badge color="terra">브랜드</Badge>}
            <Text style={{ marginLeft: "auto", fontSize: 10, color: C.n400 }}>{m.at}</Text>
          </View>
          <OriginalChip original={m.original} translated={m.translations[locale]} originalLocale={m.originalLocale} />
          {channel !== "notice" && (
            <Pressable onPress={() => setReporting(m.id)}>
              <Text style={{ fontSize: 10, color: C.n400, marginTop: 6 }}>신고</Text>
            </Pressable>
          )}
        </Card>
      ))}

      {reporting && (
        <Card style={{ borderColor: C.c300 }}>
          <Text style={{ fontWeight: "800", fontSize: 13, marginBottom: 6, color: C.n800 }}>메시지 신고</Text>
          <Text style={{ fontSize: 12, color: C.n600, marginBottom: 10 }}>
            신고하면 아리가 1차 분류 후 운영자가 검토합니다. 신고자는 익명입니다.
          </Text>
          {["스팸·광고", "괴롭힘·혐오", "기타"].map((r) => (
            <Pressable key={r} onPress={() => setReporting(null)}
              style={{ padding: 10, marginBottom: 4, borderWidth: 1, borderColor: C.n150, borderRadius: 8, backgroundColor: C.n50 }}>
              <Text style={{ fontSize: 12, color: C.n800 }}>{r}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setReporting(null)}>
            <Text style={{ fontSize: 11, color: C.n400 }}>취소</Text>
          </Pressable>
        </Card>
      )}
    </View>
  );
}
