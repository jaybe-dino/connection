import type { CSSProperties, ReactNode } from "react";

const tone: Record<string, CSSProperties> = {
  neutral: { background: "var(--n100)", color: "var(--n700)" },
  terra: { background: "var(--t100)", color: "var(--t500)" },
  sage: { background: "var(--s100)", color: "var(--s700)" },
  amber: { background: "var(--a100)", color: "var(--a700)" },
  clay: { background: "var(--c50)", color: "var(--c500)" },
  plum: { background: "var(--p50)", color: "var(--p500)" },
};

export function Badge({
  children,
  color = "neutral",
}: {
  children: ReactNode;
  color?: keyof typeof tone | string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.02em",
        ...(tone[color] ?? tone.neutral),
      }}
    >
      {children}
    </span>
  );
}

const gateColor: Record<string, string> = {
  PII: "clay",
  PAYOUT: "amber",
  OUTBOUND: "terra",
  PUBLISH: "plum",
};

export function GateBadge({ kind }: { kind: string }) {
  return <Badge color={gateColor[kind] ?? "neutral"}>{kind}</Badge>;
}

const rewardLabel: Record<string, [string, string]> = {
  paid: ["유가", "terra"],
  gifted: ["무가", "sage"],
  affiliate: ["어필리에이트", "amber"],
};

export function RewardBadge({ type }: { type: string }) {
  const [label, color] = rewardLabel[type] ?? [type, "neutral"];
  return <Badge color={color}>{label}</Badge>;
}
