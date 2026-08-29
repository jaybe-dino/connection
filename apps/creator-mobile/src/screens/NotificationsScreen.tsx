import { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import type { AppNotification, NotifType } from "@connection/shared";
import { mockMe, mockNotifications } from "@connection/shared/mock";
import { api } from "../api";
import { Card, SectionTitle } from "../ui";
import { C } from "../theme";

const TYPE_LABEL: Record<NotifType, string> = {
  selected: "캠페인 선정", shipping: "배송", review_result: "검수 결과",
  payout: "정산", deadline_d3: "마감 D-3",
};

export default function NotificationsScreen() {
  const [prefs, setPrefs] = useState<Record<NotifType, boolean>>({
    selected: true, shipping: true, review_result: true, payout: true, deadline_d3: true,
  });
  const [read, setRead] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<AppNotification[]>(mockNotifications);
  const [live, setLive] = useState(false);

  useEffect(() => {
    api.notifications(mockMe.id)
      .then((rows) => {
        setItems(rows.map((r) => ({
          ...r,
          at: new Date(r.at).toLocaleString("ko", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        })));
        setLive(true);
      })
      .catch(() => setLive(false));
  }, []);

  const markRead = (id: string) => {
    setRead((s) => new Set(s).add(id));
    if (live) api.readNotification(id).catch(() => {});
  };

  return (
    <View>
      <Card style={{ backgroundColor: C.t100, borderColor: C.t200 }}>
        <Text style={{ fontWeight: "800", fontSize: 13, color: C.n800 }}>
          홈 화면에 추가하면 푸시를 받아요
        </Text>
        <Text style={{ fontSize: 11, color: C.n600, marginTop: 2 }}>
          같은 주소 그대로 — 앱스토어 없이 설치돼요
        </Text>
      </Card>

      <SectionTitle>알림</SectionTitle>
      {items.map((n) => {
        const isRead = n.read || read.has(n.id);
        return (
          <Card key={n.id} onPress={() => markRead(n.id)} style={{ opacity: isRead ? 0.55 : 1 }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              {!isRead && (
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.t500, marginTop: 5 }} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", fontSize: 13, color: C.n800 }}>{n.title}</Text>
                <Text style={{ fontSize: 12, color: C.n500 }}>{n.body}</Text>
              </View>
              <Text style={{ fontSize: 10, color: C.n400 }}>{n.at}</Text>
            </View>
          </Card>
        );
      })}

      <SectionTitle>푸시 설정</SectionTitle>
      <Card>
        {(Object.keys(TYPE_LABEL) as NotifType[]).map((t) => (
          <View key={t} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.n100 }}>
            <Text style={{ fontSize: 13, color: C.n800 }}>{TYPE_LABEL[t]}</Text>
            <Switch value={prefs[t]} onValueChange={(v) => setPrefs((p) => ({ ...p, [t]: v }))} />
          </View>
        ))}
        <Text style={{ fontSize: 11, color: C.n400, marginTop: 8 }}>꺼도 알림함에는 남아요</Text>
      </Card>
    </View>
  );
}
