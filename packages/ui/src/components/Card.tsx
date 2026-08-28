import type { CSSProperties, ReactNode } from "react";

export function Card({
  children,
  style,
  onClick,
}: {
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--n0)",
        border: "1px solid var(--n150)",
        borderRadius: "var(--radius)",
        padding: 14,
        boxShadow: "var(--shadow)",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        margin: "18px 2px 8px",
      }}
    >
      <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: "var(--n700)" }}>
        {children}
      </h2>
      {right}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "28px 16px",
        textAlign: "center",
        color: "var(--n500)",
        fontSize: 13,
        background: "var(--n100)",
        borderRadius: "var(--radius)",
      }}
    >
      {children}
    </div>
  );
}
