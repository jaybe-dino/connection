import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { mockBrand } from "@connection/shared/mock";
import { GateProvider, useGates } from "./gateStore";
import AriPanel from "./AriPanel";
import Briefing from "./screens/Briefing";
import Approvals from "./screens/Approvals";
import Discovery from "./screens/Discovery";
import Cells from "./screens/Cells";
import CreatorDb from "./screens/CreatorDb";
import Campaigns from "./screens/Campaigns";
import Review from "./screens/Review";
import Ledger from "./screens/Ledger";
import Settings from "./screens/Settings";

const RAIL = [
  { to: "/briefing", label: "브리핑", icon: "◐" },
  { to: "/approvals", label: "승인함", icon: "✓" },
  { to: "/discovery", label: "발굴 · 수집", icon: "◎" },
  { to: "/cells", label: "커뮤니티 셀", icon: "▣" },
  { to: "/db", label: "크리에이터 DB", icon: "≡" },
  { to: "/campaigns", label: "캠페인", icon: "▤" },
  { to: "/review", label: "검수", icon: "◔" },
  { to: "/ledger", label: "정산 · 원장", icon: "₿" },
];

export default function App() {
  return (
    <GateProvider>
      <div style={{ display: "flex", height: "100dvh", background: "var(--n50)" }}>
        <Rail />
        <main style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <Routes>
            <Route path="/" element={<Navigate to="/briefing" replace />} />
            <Route path="/briefing" element={<Briefing />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/discovery" element={<Discovery />} />
            <Route path="/cells" element={<Cells />} />
            <Route path="/db" element={<CreatorDb />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/review" element={<Review />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <AriPanel />
      </div>
    </GateProvider>
  );
}

function Rail() {
  const { pendingCount } = useGates();
  return (
    <nav
      style={{
        width: 190,
        background: "var(--d800)",
        color: "var(--d400)",
        display: "flex",
        flexDirection: "column",
        padding: "16px 10px",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: "0 10px 16px", color: "var(--n0)", fontWeight: 900, fontSize: 15 }}>
        {mockBrand.name}
        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--d400)", marginTop: 2 }}>
          connection.app/{mockBrand.id} · {mockBrand.plan}
        </div>
      </div>
      {RAIL.map((r) => (
        <NavLink
          key={r.to}
          to={r.to}
          style={({ isActive }) => ({
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "9px 10px",
            borderRadius: 9,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 700,
            color: isActive ? "var(--n0)" : "var(--d400)",
            background: isActive ? "var(--d600)" : "transparent",
            marginBottom: 2,
          })}
        >
          <span style={{ width: 16, textAlign: "center" }}>{r.icon}</span>
          {r.label}
          {r.to === "/approvals" && pendingCount > 0 && (
            <span style={{ marginLeft: "auto", background: "var(--t500)", color: "#fff", borderRadius: 999, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>
              {pendingCount}
            </span>
          )}
        </NavLink>
      ))}
      <div style={{ marginTop: "auto" }}>
        <NavLink
          to="/settings"
          style={({ isActive }) => ({
            display: "block",
            padding: "9px 10px",
            borderRadius: 9,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 700,
            color: isActive ? "var(--n0)" : "var(--d400)",
            background: isActive ? "var(--d600)" : "transparent",
          })}
        >
          ⚙ 설정 · 팀
        </NavLink>
      </div>
    </nav>
  );
}
