import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { mockNotifications } from "@connection/shared/mock";
import { AppStateProvider } from "./state";
import CellScreen from "./screens/CellScreen";
import ManagerScreen from "./screens/ManagerScreen";
import CampaignsScreen from "./screens/CampaignsScreen";
import SubmitScreen from "./screens/SubmitScreen";
import PayoutScreen from "./screens/PayoutScreen";
import PassScreen from "./screens/PassScreen";
import NotificationsScreen from "./screens/NotificationsScreen";

const TABS = [
  { to: "/cell", label: "셀", icon: "◎" },
  { to: "/manager", label: "담당자", icon: "◈" },
  { to: "/campaigns", label: "캠페인", icon: "▤" },
  { to: "/submit", label: "제출", icon: "↥" },
  { to: "/payout", label: "정산", icon: "₿" },
  { to: "/pass", label: "내 패스", icon: "●" },
];

export default function App() {
  return (
    <AppStateProvider>
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--n50)" }}>
        <Header />
        <main style={{ flex: 1, padding: "0 14px 84px" }}>
          <Routes>
            <Route path="/" element={<Navigate to="/cell" replace />} />
            <Route path="/cell" element={<CellScreen />} />
            <Route path="/manager" element={<ManagerScreen />} />
            <Route path="/campaigns" element={<CampaignsScreen />} />
            <Route path="/campaigns/:id" element={<CampaignsScreen />} />
            <Route path="/submit" element={<SubmitScreen />} />
            <Route path="/payout" element={<PayoutScreen />} />
            <Route path="/pass" element={<PassScreen />} />
            <Route path="/notifications" element={<NotificationsScreen />} />
          </Routes>
        </main>
        <nav
          style={{
            position: "fixed",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "100%",
            maxWidth: 480,
            display: "flex",
            background: "var(--n0)",
            borderTop: "1px solid var(--n150)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              style={({ isActive }) => ({
                flex: 1,
                textAlign: "center",
                padding: "9px 0 7px",
                textDecoration: "none",
                fontSize: 10,
                fontWeight: 700,
                color: isActive ? "var(--t500)" : "var(--n400)",
              })}
            >
              <div style={{ fontSize: 16, lineHeight: 1.2 }}>{t.icon}</div>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </AppStateProvider>
  );
}

function Header() {
  const nav = useNavigate();
  const unread = mockNotifications.filter((n) => !n.read).length;
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 16px 10px",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em" }}>
        커넥션
      </div>
      <button
        onClick={() => nav("/notifications")}
        style={{
          position: "relative",
          border: "1px solid var(--n200)",
          background: "var(--n0)",
          borderRadius: 999,
          padding: "5px 12px",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        알림
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "var(--t500)",
              color: "#fff",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              padding: "1px 5px",
            }}
          >
            {unread}
          </span>
        )}
      </button>
    </header>
  );
}
