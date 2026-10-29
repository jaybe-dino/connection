import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { adminApi, authApi, setJwt, clearJwt, type Summary } from "./adminApi";
import Dashboard from "./screens/Dashboard";
import Applications from "./screens/Applications";
import Reports from "./screens/Reports";
import Disputes from "./screens/Disputes";
import Submissions from "./screens/Submissions";
import GmailOps from "./screens/GmailOps";
import Recruitment from "./screens/RecruitmentWorkspace";
import AccountMailboxes from "./screens/AccountMailboxes";
import Pool from "./screens/Pool";
import Brands from "./screens/Brands";
import People from "./screens/People";
import Finance from "./screens/Finance";
import { Icon } from "./v8/kit";



/** 실인증 게이트 — 최초 1회 부트스트랩 → 이후 이메일+비밀번호(+OTP) 로그인.
 *  AUTH_REQUIRED 전이면 "키 모드로 계속" 우회가 남는다 (전환기 호환). */
function AuthGate({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"loading" | "login" | "bootstrap" | "otp" | "forgot" | "reset">("loading");
  const resetToken = new URLSearchParams(location.search).get("reset") || "";
  const [allowSkip, setAllowSkip] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (resetToken) { setMode("reset"); return; }
    authApi.status()
      .then((s) => {
        setAllowSkip(!s.authRequired);
        setMode(s.hasAdmin ? "login" : "bootstrap");
      })
      .catch(() => { setAllowSkip(false); setMode("login"); });
  }, []);

  const submit = async () => {
    setErr("");
    try {
      if (mode === "bootstrap") {
        const r = await authApi.bootstrap(email.trim(), pw);
        setJwt(r.token); onDone(); return;
      }
      if (mode === "forgot") {
        const r = await authApi.resetRequest(email.trim());
        setErr(""); setNotice(r.message); return;   // 계정 존재 여부 비노출 응답
      }
      if (mode === "reset") {
        const r = await authApi.resetConfirm(resetToken, pw);
        setNotice(r.message + " 아래에서 다시 로그인하세요.");
        history.replaceState(null, "", location.pathname + location.hash);
        setPw(""); setMode("login"); return;        // 자동 세션 발급 없음
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
        : mode === "reset" ? "재설정 실패 — 링크가 만료됐거나 이미 사용됐어요. 재설정을 다시 요청하세요 (비밀번호 10자 이상)."
        : mode === "forgot" ? "요청 실패 — 잠시 후 다시 시도하세요"
        : "이메일 또는 비밀번호가 올바르지 않습니다");
    }
  };

  if (mode === "loading") return null;
  const S = { width: "100%", padding: "10px 12px", borderRadius: 9, marginBottom: 8,
    border: "1px solid var(--n300)", fontSize: 13, boxSizing: "border-box" as const };
  return (
    <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: "var(--d800)" }}>
      <div style={{ width: 330, background: "var(--n0)", borderRadius: 14, padding: "26px 26px 20px" }}>
        <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 2 }}>theprlist 어드민</div>
        <div style={{ fontSize: 11.5, color: "var(--n600)", marginBottom: 16 }}>
          {mode === "bootstrap" ? "최초 어드민 계정을 만듭니다 (1회)"
            : mode === "otp" ? "OTP 앱의 6자리 코드를 입력하세요"
            : mode === "forgot" ? "가입한 이메일로 재설정 링크를 보내드려요 (30분 유효·1회용)"
            : mode === "reset" ? "새 비밀번호(10자 이상)를 정하세요. 링크는 변경 시 확인합니다"
            : "이메일과 비밀번호로 로그인하세요"}
        </div>
        {(mode === "login" || mode === "bootstrap" || mode === "forgot") && (
          <input style={S} placeholder="이메일" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && mode === "forgot" && submit()} />
        )}
        {(mode === "login" || mode === "bootstrap" || mode === "reset") && (
          <input style={S} placeholder={mode === "login" ? "비밀번호" : "비밀번호 (10자 이상)"}
            type="password" value={pw} autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        )}
        {mode === "otp" && (
          <input style={S} placeholder="123456" value={code} inputMode="numeric"
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        )}
        {err && <div style={{ color: "var(--c500,#b00)", fontSize: 11.5, marginBottom: 8 }}>{err}</div>}
        {notice && <div style={{ color: "var(--n700)", fontSize: 11.5, marginBottom: 8 }}>{notice}</div>}
        <button onClick={submit} style={{ width: "100%", padding: "10px 0", borderRadius: 9,
          border: "none", background: "var(--d800)", color: "#fff", fontWeight: 800,
          fontSize: 13, cursor: "pointer" }}>
          {mode === "bootstrap" ? "어드민 만들기" : mode === "otp" ? "확인"
            : mode === "forgot" ? "재설정 메일 보내기" : mode === "reset" ? "비밀번호 변경" : "로그인"}
        </button>
        {mode === "login" && (
          <div onClick={() => { setErr(""); setNotice(""); setMode("forgot"); }}
            style={{ marginTop: 10, fontSize: 11, color: "var(--n600)", textAlign: "center",
              cursor: "pointer", textDecoration: "underline" }}>
            비밀번호를 잊으셨나요?
          </div>
        )}
        {mode === "forgot" && (
          <div onClick={() => { setErr(""); setNotice(""); setMode("login"); }}
            style={{ marginTop: 10, fontSize: 11, color: "var(--n600)", textAlign: "center",
              cursor: "pointer", textDecoration: "underline" }}>
            로그인으로 돌아가기
          </div>
        )}
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

/** 2FA(OTP) 설정 — 비밀키 발급 → OTP 앱 등록 → 코드 확인으로 활성화 */
function TwoFA() {
  const [step, setStep] = useState<"idle" | "show" | "done">("idle");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  if (step === "done")
    return <div style={{ color: "var(--s300)", marginBottom: 8 }}>✓ 2단계 인증 켜짐</div>;
  if (step === "idle")
    return (
      <div onClick={() => authApi.otpSetup()
          .then((r) => { setSecret(r.secret); setUri(r.otpauthUri); setStep("show"); })
          .catch(() => setErr("로그인(JWT) 상태에서만 가능합니다"))}
        style={{ cursor: "pointer", textDecoration: "underline", marginBottom: 8 }}>
        2단계 인증(OTP) 설정{err && <span style={{ color: "var(--c300)" }}> — {err}</span>}
      </div>
    );
  return (
    <div style={{ background: "var(--d600)", borderRadius: 9, padding: 10, marginBottom: 8 }}>
      <div style={{ color: "var(--n0)", fontWeight: 800, marginBottom: 4 }}>OTP 앱에 키 등록</div>
      <div style={{ wordBreak: "break-all", marginBottom: 6 }}>
        구글 OTP → ＋ → <b>설정 키 입력</b> → 계정명 아무거나, 키:<br />
        <span style={{ color: "var(--n0)", fontFamily: "monospace" }}>{secret}</span>
      </div>
      <a href={uri} style={{ color: "var(--s300)", fontSize: 10 }}>(모바일이면 이 링크로 바로 등록)</a>
      <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6자리"
          inputMode="numeric" style={{ flex: 1, minWidth: 0, padding: "5px 7px", borderRadius: 6, border: "none", fontSize: 11 }} />
        <button onClick={() => authApi.otpEnable(code.trim())
            .then(() => setStep("done"))
            .catch(() => setErr("코드 불일치"))}
          style={{ padding: "5px 9px", borderRadius: 6, border: "none", background: "var(--t500)", color: "#fff", fontWeight: 800, fontSize: 11, cursor: "pointer" }}>
          확인
        </button>
      </div>
      {err && <div style={{ color: "var(--c300)", marginTop: 4 }}>{err}</div>}
    </div>
  );
}

const MENU: { label: string; ic: string; badge?: keyof Summary; screens: [string, string][] }[] = [
  { label: "대시보드", ic: "grid", screens: [["/dashboard", "오늘 처리할 일"], ["/finance", "비용·성과"]] },
  { label: "브랜드 신청", ic: "inbox", badge: "pendingApplications", screens: [["/applications", "브랜드 신청"]] },
  { label: "신고 처리함", ic: "flag", badge: "openReports", screens: [["/reports", "신고 처리함"]] },
  { label: "분쟁 심판", ic: "scale", badge: "openDisputes", screens: [["/disputes", "분쟁 심판"]] },
  { label: "검수 현황", ic: "eye", badge: "inReviewSubmissions", screens: [["/submissions", "검수 현황"]] },
  { label: "디노 공용 모집", ic: "megaphone", screens: [["/recruitment", "디노 공용 모집"]] },
  { label: "브랜드 운영", ic: "gear", screens: [["/brands", "브랜드 목록"], ["/people", "사람·권한"]] },
  { label: "계정별 메일함", ic: "mail", screens: [["/mail", "계정별 메일함"]] },
  { label: "Gmail 운영", ic: "plug", screens: [["/gmail", "Gmail 운영"]] },
  { label: "후보 풀", ic: "users", screens: [["/pool", "후보 풀"]] },
];

export default function App() {
  const path = useLocation().pathname;
  const navigate = useNavigate();
  const mailLayout = path === "/mail";
  const [summary, setSummary] = useState<Summary | null>(null);
  const [live, setLive] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [navOpen, setNavOpen] = useState(false), [acct, setAcct] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("CONNECTION_JWT");
    if (!t) { setAuthed(false); return; }
    authApi.me().then(() => setAuthed(true))
      .catch(() => { clearJwt(); setAuthed(false); });
  }, []);
  // 다른 탭에서 로그아웃(JWT 삭제)·계정 교체 → 이 탭도 즉시 동기화
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key !== "CONNECTION_JWT" && e.key !== null) return; if (!localStorage.getItem("CONNECTION_JWT")) setAuthed(false); else if (e.newValue !== e.oldValue) location.reload(); };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);
  useEffect(() => { setNavOpen(false); setAcct(false); }, [path]);
  useEffect(() => { const on = () => setAuthed(false); window.addEventListener("admin-auth-lost", on); return () => window.removeEventListener("admin-auth-lost", on); }, []);
  // v8.1 시안 CSS 의 본문 글꼴·배경(body.v5)
  useEffect(() => { document.body.classList.add("v5", "v5-root", "sp-proposal", "a8"); }, []);

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

  const cur = MENU.find((m) => m.screens.some(([to]) => path === to || path.startsWith(to + "/"))) || MENU[0];
  return (
    <div className={"v2 v2-admin" + (navOpen ? " nav-open" : "") + (mailLayout ? " admin-mail-layout" : "")} data-role-app="admin">
      <div className="v2-top">
        <span className="v2-logo">theprlist <b>ADMIN</b> · 전사운영</span><span className="v2-sp" />
        <span className={"v2-topbtn a8-live" + (live ? "" : " is-off")} role="status">{live ? "서버 연결됨" : "서버 연결 확인 필요"}</span>
        <button type="button" className="v2-topbtn" aria-expanded={acct} onClick={() => setAcct(!acct)}>계정</button>
        {acct && <div className="v6-pop a8-acct" role="menu"><TwoFA /><button type="button" role="menuitem" onClick={() => { clearJwt(); setAuthed(false); }}>로그아웃</button><p className="v6-meta">모든 조치는 원장에 기록돼요.</p></div>}
      </div>
      <div className="v2-mobilebar"><button type="button" className="btn pri" aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}>메뉴 {navOpen ? "닫기" : "열기"}</button><span className="small">지금: <b>{cur.label}</b></span></div>
      <div className="v2-body">
        <nav className="v2-side" aria-label="관리자 메뉴">
          {MENU.map((m) => {
            const n = m.badge && summary ? Number(summary[m.badge] || 0) : 0;
            return <button key={m.label} type="button" className="v2-navbtn" aria-current={m === cur ? "page" : undefined} onClick={() => navigate(m.screens[0][0])}>
              <Icon k={m.ic} /><span className="v5-lab">{m.label}{n > 0 && <span className="badge-n" aria-label={`대기 ${n}건`}>{n}</span>}</span></button>;
          })}
        </nav>
        <div className="v2-main" role="region" aria-label={cur.label}>
          {cur.screens.length > 1 && <nav className="tabs v2-subtabs" aria-label={cur.label + " 하위 메뉴"}>{cur.screens.map(([to, l]) =>
            <button key={to} type="button" aria-current={path === to ? "page" : undefined} aria-selected={path === to} onClick={() => navigate(to)}>{l}</button>)}</nav>}
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard summary={summary} />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/applications" element={<Applications onChange={refresh} />} />
            <Route path="/reports" element={<Reports onChange={refresh} />} />
            <Route path="/disputes" element={<Disputes onChange={refresh} />} />
            <Route path="/submissions" element={<Submissions onChange={refresh} />} />
            <Route path="/recruitment" element={<Recruitment />} />
            <Route path="/brands" element={<Brands />} />
            <Route path="/people" element={<People />} />
            <Route path="/mail" element={<AccountMailboxes />} />
            <Route path="/gmail" element={<GmailOps />} />
            <Route path="/pool" element={<Pool />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
