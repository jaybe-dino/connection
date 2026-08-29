/** 커넥션 크리에이터 앱 — 앱-퍼스트 코드베이스 (Expo · iOS/Android/Web 단일 코드).
 *
 * 지금은 웹으로만 서비스(expo export -p web → Vercel), 스토어가 필요해지면
 * 같은 코드로 eas build만 켠다. 하단 6탭 — 셀·담당자·캠페인·제출·정산·내 패스.
 */

import { useState } from "react";
import { Pressable, ScrollView, StatusBar, Text, View } from "react-native";
import { useSafeAreaInsets, SafeAreaProvider } from "react-native-safe-area-context";
import { mockNotifications } from "@connection/shared/mock";
import { AppStateProvider } from "./src/state";
import { C } from "./src/theme";
import CellScreen from "./src/screens/CellScreen";
import ManagerScreen from "./src/screens/ManagerScreen";
import CampaignsScreen from "./src/screens/CampaignsScreen";
import SubmitScreen from "./src/screens/SubmitScreen";
import PayoutScreen from "./src/screens/PayoutScreen";
import PassScreen from "./src/screens/PassScreen";
import NotificationsScreen from "./src/screens/NotificationsScreen";

const TABS = [
  { id: "cell", label: "셀", icon: "◎", screen: CellScreen },
  { id: "manager", label: "담당자", icon: "◈", screen: ManagerScreen },
  { id: "campaigns", label: "캠페인", icon: "▤", screen: CampaignsScreen },
  { id: "submit", label: "제출", icon: "↥", screen: SubmitScreen },
  { id: "payout", label: "정산", icon: "฿", screen: PayoutScreen },
  { id: "pass", label: "내 패스", icon: "●", screen: PassScreen },
] as const;

export default function App() {
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <Root />
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<string>("cell");
  const [showNotif, setShowNotif] = useState(false);
  const unread = mockNotifications.filter((n) => !n.read).length;
  const Active = showNotif
    ? NotificationsScreen
    : (TABS.find((t) => t.id === tab)?.screen ?? CellScreen);

  return (
    <View style={{ flex: 1, backgroundColor: C.n50, maxWidth: 480, width: "100%", alignSelf: "center" }}>
      <StatusBar barStyle="dark-content" />
      <View style={{
        paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 10,
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      }}>
        <Pressable onPress={() => setShowNotif(false)}>
          <Text style={{ fontWeight: "900", fontSize: 16, color: C.n800 }}>커넥션</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowNotif((v) => !v)}
          style={{ borderWidth: 1, borderColor: C.n200, backgroundColor: C.n0, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}
        >
          <Text style={{ fontSize: 12, color: C.n800 }}>
            알림{unread > 0 ? ` ${unread}` : ""}
          </Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 90 }}>
        <Active />
      </ScrollView>

      <View style={{
        flexDirection: "row", backgroundColor: C.n0,
        borderTopWidth: 1, borderTopColor: C.n150, paddingBottom: insets.bottom,
      }}>
        {TABS.map((t) => {
          const active = !showNotif && tab === t.id;
          return (
            <Pressable key={t.id} onPress={() => { setTab(t.id); setShowNotif(false); }}
              style={{ flex: 1, alignItems: "center", paddingVertical: 8 }}>
              <Text style={{ fontSize: 16, color: active ? C.t500 : C.n400 }}>{t.icon}</Text>
              <Text style={{ fontSize: 10, fontWeight: "700", color: active ? C.t500 : C.n400 }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
