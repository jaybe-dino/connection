import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { adminApi, authApi, setJwt, clearJwt, type Summary } from "./adminApi";
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

/** 실인증 게이트 — 최초 1회 부트스트랩 → 이후 이메일+비밀번호(+OTP) 로그인.
 *  AUTH_REQUIRED 전이면 "키 모드로 계속" 우회가 남는다 (전환기 호환). */
function AuthGate({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"loading" | "login" | "bootstrap" | "otp">("loading");
  const [allowSkip, setAllowSkip] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    authApi.status()
      .then((s) => {
        setAllowSkip(!s.authRequired);
        setMode(s.hasAdmin ? "login" : "bootstrap");
      })
      .catch(() => { setAllowSkip(true); setMode("login"); });
  }, []);

  const submit = async () => {
    setErr("");
    try {
      if (mode === "bootstrap") {
        const r = await authApi.bootstrap(email.trim(), pw);
        setJwt(r.token); onDone(); return;
      }
      if (mode === "otp") {
        const r = await authApi.otpVerify(pending, code.trim());
        setJwt(r.token); onDone(); return;
      }
      const r = await authApi.login(email.trim(), pw);
      if (r.needOtp) { setPending(r.token); setMode("otp"); return; }
      setJwt(r.token); onDone();
    } catch (e) {
      setErr(mode === "otp" ? "OTP 코드가 일치하지 않습니다"
        : mode === "bootstrap" ? "생성 실패 — 비밀번호 10자 이상, 어드민 키 확인"
        : "이메일 또는 비밀번호가 올바르지 않습니다");
    }
  };

  if (mode === "loading") return null;
  const S = { width: "100%", padding: "10px 12px", borderRadius: 9, marginBottom: 8,
    border: "1px solid var(--n300)", fontSize: 13, boxSizing: "border-box" as const };
  return (
    <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: "var(--d800)" }}>
      <div style={{ width: 330, background: "var(--n0)", borderRadius: 14, padding: "26px 26px 20px" }}>
        <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 2 }}>The PR List 어드민</div>
        <div style={{ fontSize: 11.5, color: "var(--n600)", marginBottom: 16 }}>
          {mode === "bootstrap" ? "최초 어드민 계정을 만듭니다 (1회)"
            : mode === "otp" ? "OTP 앱의 6자리 코드를 입력하세요"
            : "이메일과 비밀번호로 로그인하세요"}
        </div>
        {mode !== "otp" && (<>
          <input style={S} placeholder="이메일" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} />
          <input style={S} placeholder={mode === "bootstrap" ? "비밀번호 (10자 이상)" : "비밀번호"}
            type="password" value={pw} autoComplete="current-password"
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </>)}
        {mode === "otp" && (
          <input style={S} placeholder="123456" value={code} inputMode="numeric"
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        )}
        {err && <div style={{ color: "var(--c500,#b00)", fontSize: 11.5, marginBottom: 8 }}>{err}</div>}
        <button onClick={submit} style={{ width: "100%", padding: "10px 0", borderRadius: 9,
          border: "none", background: "var(--d800)", color: "#fff", fontWeight: 800,
          fontSize: 13, cursor: "pointer" }}>
          {mode === "bootstrap" ? "어드민 만들기" : mode === "otp" ? "확인" : "로그인"}
        </button>
        {allowSkip && (
          <div onClick={onDone} style={{ marginTop: 12, fontSize: 11, color: "var(--n600)",
            textAlign: "center", cursor: "pointer", textDecoration: "underline" }}>
            나중에 — 키 모드로 계속 (실인증 강제 전까지만)
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [live, setLive] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("CONNECTION_JWT");
    if (!t) { setAuthed(false); return; }
    authApi.me().then(() => setAuthed(true))
      .catch(() => { clearJwt(); setAuthed(false); });
  }, []);

  const refresh = () =>
    adminApi.summary().then((s) => { setSummary(s); setLive(true); })
      .catch(() => setLive(false));

  useEffect(() => {
    if (!authed) return;
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [authed]);

  if (authed === null) return null;
  if (authed === false) return <AuthGate onDone={() => setAuthed(true)} />;

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
