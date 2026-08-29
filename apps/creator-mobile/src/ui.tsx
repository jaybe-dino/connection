/** 공용 컴포넌트 — packages/ui의 RN 판. 웹·iOS·Android 동일 렌더링. */

import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { C, radius } from "./theme";

const tone: Record<string, { bg: string; fg: string }> = {
  neutral: { bg: C.n100, fg: C.n700 },
  terra: { bg: C.t100, fg: C.t500 },
  sage: { bg: C.s100, fg: C.s700 },
  amber: { bg: C.a100, fg: C.a700 },
  clay: { bg: C.c50, fg: C.c500 },
  plum: { bg: C.p50, fg: C.p500 },
};

export function Badge({ children, color = "neutral" }: { children: ReactNode; color?: string }) {
  const t = tone[color] ?? tone.neutral;
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: t.fg }}>{children}</Text>
    </View>
  );
}

const rewardLabel: Record<string, [string, string]> = {
  paid: ["유가", "terra"], gifted: ["무가", "sage"], affiliate: ["어필리에이트", "amber"],
};

export function RewardBadge({ type }: { type: string }) {
  const [label, color] = rewardLabel[type] ?? [type, "neutral"];
  return <Badge color={color}>{label}</Badge>;
}

export function Card({ children, style, onPress }: {
  children: ReactNode; style?: ViewStyle; onPress?: () => void;
}) {
  const body = <View style={[styles.card, style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 18, marginBottom: 8, marginHorizontal: 2 }}>
      <Text style={{ fontSize: 14, fontWeight: "800", color: C.n700 }}>{children}</Text>
      {right}
    </View>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <View style={{ padding: 24, alignItems: "center", backgroundColor: C.n100, borderRadius: radius }}>
      <Text style={{ fontSize: 13, color: C.n500 }}>{children}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
        borderColor: active ? C.n800 : C.n200,
        backgroundColor: active ? C.n800 : C.n0, marginRight: 6,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: active ? C.n0 : C.n600 }}>{label}</Text>
    </Pressable>
  );
}

/** 번역 레이어 — 시청자 언어 자동 표시 + 원문 칩 토글 */
export function OriginalChip({ original, translated, originalLocale }: {
  original: string; translated?: string; originalLocale: string;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const hasTranslation = translated !== undefined && translated !== original;
  return (
    <View>
      <Text style={{ fontSize: 13, lineHeight: 19, color: C.n800 }}>
        {showOriginal || !hasTranslation ? original : translated}
      </Text>
      {hasTranslation && (
        <Pressable
          onPress={() => setShowOriginal((v) => !v)}
          style={{
            alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 7, paddingVertical: 1,
            borderRadius: 999, borderWidth: 1, borderColor: C.n200,
            backgroundColor: showOriginal ? C.n800 : C.n0,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "700", color: showOriginal ? C.n0 : C.n500 }}>
            {showOriginal ? "번역" : `원문 ${originalLocale.toUpperCase()}`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** 배송 상태 스텝 (P0 배송 추적) */
export function StepTracker({ steps }: { steps: { label: string; done: boolean; at?: string }[] }) {
  return (
    <View style={{ flexDirection: "row" }}>
      {steps.map((s, i) => (
        <View key={s.label} style={{ flex: 1, alignItems: "center" }}>
          {i > 0 && (
            <View style={{
              position: "absolute", left: "-50%", right: "50%", top: 7, height: 2,
              backgroundColor: s.done ? C.s500 : C.n200,
            }} />
          )}
          <View style={{
            width: 16, height: 16, borderRadius: 8, borderWidth: 2, zIndex: 1,
            backgroundColor: s.done ? C.s500 : C.n0,
            borderColor: s.done ? C.s500 : C.n300,
          }} />
          <Text style={{ fontSize: 10, marginTop: 4, color: s.done ? C.n800 : C.n400 }}>{s.label}</Text>
          {s.at ? <Text style={{ fontSize: 9, color: C.n400 }}>{s.at}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function PrimaryButton({ label, onPress, color = C.t500 }: {
  label: string; onPress?: () => void; color?: string;
}) {
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: color, borderRadius: radius, padding: 13, alignItems: "center", marginTop: 12 }}>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.n0, borderWidth: 1, borderColor: C.n150,
    borderRadius: radius, padding: 14, marginBottom: 8,
  },
});
