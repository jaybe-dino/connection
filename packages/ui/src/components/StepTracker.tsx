/** 배송 상태 스텝 (P0 배송 추적) 등 단계 표시 */
export function StepTracker({
  steps,
}: {
  steps: { label: string; done: boolean; at?: string }[];
}) {
  return (
    <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
      {steps.map((s, i) => (
        <div key={s.label} style={{ flex: 1, textAlign: "center", position: "relative" }}>
          {i > 0 && (
            <div
              style={{
                position: "absolute",
                left: "-50%",
                right: "50%",
                top: 7,
                height: 2,
                background: s.done ? "var(--s500)" : "var(--n200)",
              }}
            />
          )}
          <div
            style={{
              width: 16,
              height: 16,
              margin: "0 auto",
              borderRadius: "50%",
              position: "relative",
              zIndex: 1,
              background: s.done ? "var(--s500)" : "var(--n0)",
              border: `2px solid ${s.done ? "var(--s500)" : "var(--n300)"}`,
            }}
          />
          <div style={{ fontSize: 10, marginTop: 4, color: s.done ? "var(--n800)" : "var(--n400)" }}>
            {s.label}
          </div>
          {s.at && <div style={{ fontSize: 9, color: "var(--n400)" }}>{s.at}</div>}
        </div>
      ))}
    </div>
  );
}
