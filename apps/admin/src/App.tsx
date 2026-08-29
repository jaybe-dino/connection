import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { adminApi, type Summary } from "./adminApi";
import Dashboard from "./screens/Dashboard";
import Applications from "./screens/Applications";
import Reports from "./screens/Reports";
import Disputes from "./screens/Disputes";
import Submissions from "./screens/Submissions";

const RAIL = [
  { to: "/dashboard", label: "대시보드", icon: "◐" },
  { to: "/applications", label: "브랜드 신청", icon: "▣", badge: "pendingApplications" },
  { to: "/reports", label: "신고 처리함", icon: "⚑", badge: "openReports" },
  { to: "/disputes", label: "분쟁 심판", icon: "⚖", badge: "openDisputes" },
  { to: "/submissions", label: "검수 현황", icon: "◑", badge: "inReviewSubmissions" },
] as const;

export default function App() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [live, setLive] = useState(true);

  const refresh = () =>
    adminApi.summary().then((s) => { setSummary(s); setLive(true); })
      .catch(() => setLive(false));

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ display: "flex", height: "100dvh", background: "var(--n50)" }}>
      <nav style={{
        width: 200, background: "var(--d800)", color: "var(--d400)",
        display: "flex", flexDirection: "column", padding: "16px 10px", flexShrink: 0,
      }}>
        <div style={{ padding: "0 10px 4px", color: "var(--n0)", fontWeight: 900, fontSize: 15 }}>
          커넥션 어드민
        </div>
        <div style={{ padding: "0 10px 14px", fontSize: 10, color: live ? "var(--s300)" : "var(--c300)" }}>
          {live ? "● 서버 연결됨 · jay (총괄)" : "● API 미연결 — 서버를 켜주세요"}
        </div>
        {RAIL.map((r) => {
          const n = summary && "badge" in r ? summary[r.badge as keyof Summary] : 0;
          return (
            <NavLink key={r.to} to={r.to}
              style={({ isActive }) => ({
                display: "flex", alignItems: "center", gap: 9, padding: "9px 10px",
                borderRadius: 9, textDecoration: "none", fontSize: 13, fontWeight: 700,
                color: isActive ? "var(--n0)" : "var(--d400)",
                background: isActive ? "var(--d600)" : "transparent", marginBottom: 2,
              })}>
              <span style={{ width: 16, textAlign: "center" }}>{r.icon}</span>
              {r.label}
              {n > 0 && (
                <span style={{ marginLeft: "auto", background: "var(--t500)", color: "#fff", borderRadius: 999, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>
                  {n}
                </span>
              )}
            </NavLink>
          );
        })}
        <div style={{ marginTop: "auto", padding: "10px", fontSize: 10, color: "var(--d400)", lineHeight: 1.6 }}>
          모든 조치는 원장에 기록됩니다.<br />기획: docs/ADMIN_PLAN.md
        </div>
      </nav>
      <main style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard summary={summary} />} />
          <Route path="/applications" element={<Applications onChange={refresh} />} />
          <Route path="/reports" element={<Reports onChange={refresh} />} />
          <Route path="/disputes" element={<Disputes onChange={refresh} />} />
          <Route path="/submissions" element={<Submissions onChange={refresh} />} />
        </Routes>
      </main>
    </div>
  );
}
