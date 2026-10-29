import { Head } from "../v8/kit";
import { useEffect, useRef, useState } from "react";
import { Badge, Card, EmptyState, SectionTitle } from "@connection/ui";
import { adminApi, errText, type AdminBrand, type AuditRow, type BrandAccount } from "../adminApi";

/** 브랜드 관리 — 처음 보는 운영자도 설명 없이 쓸 수 있게 구성한다.
 *  흐름: ① 브랜드 추가 → ② 담당자에게 비밀번호 설정 링크 전달 → ③ 운영 시작.
 *  - 링크(초기 설정 72시간/재설정 30분)는 버튼을 눌렀을 때만 만들어 보여주고
 *    자동 발송하지 않는다. 다른 브랜드 선택·계정 상태 변경 시 표시를 비운다.
 *  - 비밀번호 원문 조회/임의 설정 불가 — 담당자가 링크로 직접 설정한다.
 *  - 위험한 작업(브랜드 이용 중지, 역할 변경, 계정 이용 중지, 모든 기기에서
 *    로그아웃)은 '관리 메뉴'를 연 뒤 대상 브랜드·이메일을 보여주는 확인
 *    단계를 거친다.
 *  - 요청 세대(generation) 가드: 브랜드를 빠르게 바꿔 눌러도 늦게 도착한
 *    이전 브랜드 응답이 현재 패널에 섞이지 않는다. */

const COUNTRY_OPTIONS: [string, string][] = [
  ["KR", "한국"], ["TH", "태국"], ["US", "미국"], ["VN", "베트남"], ["JP", "일본"],
];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Keep transport status codes in adminApi for send/retry guards, but show plain
// instructions here instead of a raw HTTP/JSON response to the operator.
const friendlyError = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : "요청을 처리하지 못했어요. 다시 시도해 주세요.";
  const body = raw.replace(/^\d{3}\s+/, "");
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.detail === "string") return parsed.detail.replace(/\(owner\)/g, "");
    return "입력한 내용을 확인한 뒤 다시 시도해 주세요.";
  } catch {
    return /^\d{3}\s+/.test(raw) ? "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." : raw;
  }
};

const suggestSlug = (name: string) =>
  name.toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

type Confirm =
  | { kind: "suspendBrand"; brand: string; brandName: string }
  | { kind: "resumeBrand"; brand: string; brandName: string }
  | { kind: "role"; brand: string; brandName: string; acc: BrandAccount; nextRole: "owner" | "manager" }
  | { kind: "state"; brand: string; brandName: string; acc: BrandAccount; active: boolean }
  | { kind: "logoutAll"; brand: string; brandName: string; acc: BrandAccount };

export default function Brands() {
  const [rows, setRows] = useState<AdminBrand[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditEvent, setAuditEvent] = useState("");
  const [auditActor, setAuditActor] = useState("");

  // ── 새 브랜드 추가(접이식 폼) ──
  const [regOpen, setRegOpen] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", category: "", email: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [countrySel, setCountrySel] = useState<Record<string, boolean>>({});
  const [countryEtc, setCountryEtc] = useState("");
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [regErr, setRegErr] = useState("");
  const [regDone, setRegDone] = useState<{ brandId: string; name: string } | null>(null);

  // ── 선택 브랜드 담당자(계정) 관리 ──
  const genRef = useRef(0);                   // 요청 세대 — 빠른 브랜드 전환 보호
  const [selected, setSelected] = useState("");
  const [accounts, setAccounts] = useState<BrandAccount[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newAcc, setNewAcc] = useState({ email: "", role: "manager" });
  const [links, setLinks] = useState<Record<string, { label: string; link: string; note: string }>>({});
  const [dangerOpen, setDangerOpen] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  const load = () =>
    adminApi.brands().then((r) => { setRows(r); setErr(""); })
      .catch((e) => setErr(friendlyError(e)));
  const loadAudit = () =>
    adminApi.audit(auditActor, auditEvent).then(setAudit)
      .catch((e) => { setAudit([]); setErr(friendlyError(e)); });
  useEffect(() => { void load(); }, []);
  // 사람·권한에서 넘어온 브랜드(?brand=) — 담당자 관리를 바로 연다
  useEffect(() => { const b = new URLSearchParams(location.search).get("brand"); if (b && rows.some((r) => r.brandId === b) && selected !== b) pick(b); }, [rows]);
  // 브랜드 대리운영: 1회용 전환 코드(2분)로 브랜드 콘솔을 이 관리자 권한으로 연다 — JWT 는 주소에 싣지 않는다
  const [handoffErr, setHandoffErr] = useState("");
  const openConsole = async (brandId: string) => {
    setHandoffErr("");
    const w = window.open("about:blank", "_blank");
    try { const r = await adminApi.consoleHandoff(brandId); if (w) { w.opener = null; w.location.href = r.url; } else location.href = r.url; }
    catch (e) { if (w) w.close(); setHandoffErr(errText(e)); }
  };

  const loadAccounts = async (brand: string, gen: number) => {
    try {
      const r = await adminApi.brandAccounts(brand);
      if (gen !== genRef.current) return;     // 이미 다른 브랜드로 이동함 — 버림
      setAccounts(r);
    } catch (e) {
      if (gen !== genRef.current) return;
      setAccounts([]);
      setErr(friendlyError(e));
    }
  };

  // 브랜드 선택/전환 — 링크·입력·확인 단계를 모두 초기화한다
  const pick = (brand: string) => {
    genRef.current += 1;
    if (selected === brand) { setSelected(""); setAccounts(null); setLinks({}); setConfirm(null); setErr(""); return; }
    setSelected(brand);
    setAccounts(null);
    setLinks({});
    setConfirm(null);
    setDangerOpen({});
    setAddOpen(false);
    setNewAcc({ email: "", role: "manager" });
    setErr("");
    void loadAccounts(brand, genRef.current);
  };

  const validate = () => {
    const fe: Record<string, string> = {};
    const name = form.name.trim();
    const slug = form.slug.trim().toLowerCase();
    const email = form.email.trim();
    if (name.length < 2) fe.name = "브랜드 이름을 2자 이상 적어 주세요.";
    if (!SLUG_RE.test(slug)) fe.slug = "영문 소문자·숫자·하이픈(-)으로 3~40자여야 해요. 예: glowlab";
    if (!EMAIL_RE.test(email)) fe.email = "이메일 모양이 맞는지 확인해 주세요. 예: manager@brand.com";
    const etcBad = countryEtc.split(",").map((c) => c.trim()).filter(Boolean)
      .filter((c) => !/^[A-Za-z]{2}$/.test(c));
    if (etcBad.length) fe.countries = `직접 입력 국가는 2자리 영문 코드만 가능해요 (확인 필요: ${etcBad.join(", ")})`;
    setFieldErr(fe);
    return Object.keys(fe).length === 0;
  };

  const register = async () => {
    if (busy) return;
    setRegErr(""); setRegDone(null);
    if (!validate()) return;
    setBusy("register");
    try {
      const countries = [
        ...COUNTRY_OPTIONS.filter(([c]) => countrySel[c]).map(([c]) => c),
        ...countryEtc.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean),
      ];
      const out = await adminApi.registerBrand({
        name: form.name.trim(), slug: form.slug.trim().toLowerCase(),
        category: form.category.trim(), countries,
        manager_email: form.email.trim(),
      });
      setRegDone({ brandId: out.brandId, name: form.name.trim() });
      setRegOpen(false);                 // 완료 카드 + 다음 단계 안내 표시
      setForm({ name: "", slug: "", category: "", email: "" });
      setCountrySel({}); setCountryEtc(""); setSlugTouched(false); setFieldErr({});
      await load();
      pick(out.brandId);
    } catch (e) { setRegErr(friendlyError(e)); }
    setBusy("");
  };

  // 공통 실행기 — 성공 시 링크 표시를 비우고 현재 브랜드 기준으로 새로고침
  const act = async (key: string, fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key); setErr("");
    const brand = selected;
    const gen = genRef.current;
    try {
      await fn();
      if (gen === genRef.current) setLinks({});
      if (brand && gen === genRef.current) await loadAccounts(brand, gen);
      await load();
    } catch (e) { if (gen === genRef.current) setErr(friendlyError(e)); }
    setBusy("");
  };

  const prepareLink = async (a: BrandAccount, kind: "setup" | "reset") => {
    if (busy) return;
    setBusy(a.userId + kind); setErr("");
    const brand = selected;
    const gen = genRef.current;
    try {
      const r = kind === "setup"
        ? await adminApi.accountSetupLink(brand, a.userId)
        : await adminApi.accountResetLink(brand, a.userId);
      // 늦게 도착한 응답이 다른 브랜드 패널에 보이지 않게 — 같은 브랜드일 때만 표시
      if (gen === genRef.current && brand === selected) {
        setLinks({ [a.userId]: {
          label: kind === "setup"
            ? "비밀번호 설정 링크 (72시간 안에 1번만 사용 가능)"
            : "비밀번호 재설정 링크 (30분 안에 1번만 사용 가능)",
          link: r.link, note: r.note } });
      }
    } catch (e) { if (gen === genRef.current) setErr(friendlyError(e)); }
    setBusy("");
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const c = confirm;
    await act("confirm", async () => {
      if (c.kind === "suspendBrand") await adminApi.suspendBrand(c.brand, suspendReason.trim());
      if (c.kind === "resumeBrand") await adminApi.resumeBrand(c.brand);
      if (c.kind === "role") await adminApi.accountRole(c.brand, c.acc.userId, c.nextRole);
      if (c.kind === "state") await adminApi.accountState(c.brand, c.acc.userId, c.active);
      if (c.kind === "logoutAll") await adminApi.accountRevokeSessions(c.brand, c.acc.userId);
      setConfirm(null); setSuspendReason("");
    });
  };

  const confirmText = (c: Confirm) => {
    const who = "acc" in c ? ` · 계정 ${c.acc.email}` : "";
    const base = `브랜드 ${c.brandName}(${c.brand})${who}`;
    switch (c.kind) {
      case "suspendBrand": return { title: "이 브랜드의 이용을 중지할까요?", body: `${base} — 중지하면 이 브랜드의 워크스페이스 이용이 멈춥니다. 아래에 사유를 남겨 주세요(기록에 남아요).`, yes: "이용 중지" };
      case "resumeBrand": return { title: "이 브랜드의 이용을 다시 시작할까요?", body: `${base} — 중지 상태를 해제합니다.`, yes: "이용 재개" };
      case "role": return { title: c.nextRole === "owner" ? "이 계정을 '소유자'로 바꿀까요?" : "이 계정을 '담당자'로 바꿀까요?", body: `${base} — 권한이 바뀌면 이 계정은 모든 기기에서 로그아웃되고 다시 로그인해야 해요.`, yes: "권한 변경" };
      case "state": return c.active
        ? { title: "이 계정의 이용을 다시 시작할까요?", body: `${base} — 다시 로그인할 수 있게 됩니다.`, yes: "이용 재개" }
        : { title: "이 계정의 이용을 중지할까요?", body: `${base} — 중지하면 즉시 모든 기기에서 로그아웃되고 로그인할 수 없어요.`, yes: "이용 중지" };
      case "logoutAll": return { title: "이 계정을 모든 기기에서 로그아웃할까요?", body: `${base} — 지금 로그인돼 있는 모든 화면이 끊기고, 만들어 둔 링크도 쓸 수 없게 됩니다.`, yes: "모든 기기에서 로그아웃" };
    }
  };

  const visible = rows.filter((b) =>
    !query.trim() || (b.name + " " + b.brandId).toLowerCase().includes(query.trim().toLowerCase()));

  const roleName = (r: string) => (r === "owner" ? "소유자" : "담당자");
  const slugPreview = form.slug.trim().toLowerCase() || "브랜드주소";

  const confirmBox = (c: Confirm) => {
    const t = confirmText(c);
    return (
      <div id="confirmBox" className="wkb-danger" style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{t.title}</div>
        <div style={{ fontSize: 12, marginTop: 4, color: "var(--n800)" }}>{t.body}</div>
        {c.kind === "suspendBrand" && (
          <div className="wkb-field" style={{ marginTop: 8 }}>
            <label htmlFor="suspendReason">중지 사유</label>
            <input id="suspendReason" value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="예: 계약 종료" disabled={busy !== ""} />
          </div>
        )}
        <div className="wkb-row" style={{ marginTop: 8 }}>
          <button id="confirmYes" className="wkb-btn wkb-danger-btn"
            onClick={() => void runConfirm()} disabled={busy !== ""}>
            {busy === "confirm" ? "처리하는 중…" : t.yes}
          </button>
          <button id="confirmNo" className="wkb-btn"
            onClick={() => { setConfirm(null); setSuspendReason(""); }}
            disabled={busy !== ""}>취소</button>
        </div>
      </div>
    );
  };

  return (
    <div className="v6" style={{ maxWidth: 960 }}>
      <Head title="브랜드 목록·콘솔" sub="브랜드를 등록하고 담당자 계정을 관리해요. ‘브랜드 콘솔 열기’는 그 브랜드 데이터만 다루는 콘솔을 이 관리자 권한으로 열어요. 모든 변경은 아래 ‘변경 기록’에 남아요." />
      {handoffErr && <div className="alert err" role="alert">브랜드 콘솔을 열지 못했어요: {handoffErr}</div>}
      <Card style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
          <b>이렇게 진행해요</b><br />
          ① <b>브랜드 추가</b> — 아래 '새 브랜드 추가' 버튼으로 등록<br />
          ② <b>담당자 계정 준비</b> — 브랜드의 '담당자 관리'에서 '비밀번호 설정 링크 만들기' → 복사해서 담당자에게 전달<br />
          ③ <b>운영 시작</b> — 담당자가 링크로 비밀번호를 만들면 바로 로그인해서 쓸 수 있어요
        </div>
      </Card>
      {err && <div role="alert" style={{ color: "var(--c500)", fontSize: 12, margin: "8px 0", whiteSpace: "pre-wrap" }}>{err}</div>}

      <SectionTitle>새 브랜드 추가</SectionTitle>
      {!regOpen && (
        <button id="regOpen" className="wkb-btn wkb-primary" onClick={() => { setRegOpen(true); setRegDone(null); }}>
          ＋ 새 브랜드 추가
        </button>
      )}
      {regDone && !regOpen && (
        <Card style={{ marginTop: 8 }}>
          <div role="status" style={{ fontSize: 13 }}>
            <b>등록 완료 — {regDone.brandId}</b> ({regDone.name})
            <div style={{ fontSize: 12, color: "var(--n800)", marginTop: 6, lineHeight: 1.7 }}>
              다음 단계: 아래 목록에서 <b>{regDone.name}</b>의 <b>담당자 관리</b>가 열려 있어요.
              <b> '비밀번호 설정 링크 만들기'</b>를 눌러 링크를 복사한 뒤, 담당자에게
              메신저나 메일로 직접 전달해 주세요. 자동으로 발송되지 않아요.
            </div>
          </div>
        </Card>
      )}
      {regOpen && (
        <Card>
          <fieldset disabled={busy !== ""} style={{ border: "none", margin: 0, padding: 0 }}>
            <div className="wkb-field">
              <label htmlFor="regName">브랜드 이름 <span style={{ color: "var(--c500)" }}>*</span></label>
              <input id="regName" value={form.name} placeholder="예: 글로우랩"
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({ ...f, name,
                    slug: slugTouched ? f.slug : suggestSlug(name) }));
                }} />
              {fieldErr.name && <div className="wkb-err" role="alert">{fieldErr.name}</div>}
            </div>
            <div className="wkb-field">
              <label htmlFor="regSlug">브랜드 주소 <span style={{ color: "var(--c500)" }}>*</span></label>
              <input id="regSlug" value={form.slug} placeholder="예: glowlab"
                onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: e.target.value }); }} />
              <div className="wkb-hint">
                크리에이터가 들어오는 주소가 돼요: <b>app.theprlist.net/?brand={slugPreview}</b>
                <br />영문 소문자·숫자·하이픈(-)만, 3~40자. 브랜드 이름을 적으면 자동으로
                추천되고 직접 고칠 수 있어요. 나중에 바꿀 수 없으니 확인해 주세요.
              </div>
              {fieldErr.slug && <div className="wkb-err" role="alert">{fieldErr.slug}</div>}
            </div>
            <div className="wkb-field">
              <label htmlFor="regCategory">어떤 브랜드인가요? (선택)</label>
              <input id="regCategory" value={form.category} placeholder="예: 스킨케어"
                onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="wkb-field">
              <label>주로 진출하는 국가 (선택 · 여러 개 가능)</label>
              <div className="wkb-row" style={{ gap: 10 }}>
                {COUNTRY_OPTIONS.map(([code, label]) => (
                  <label key={code} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, minHeight: 32 }}>
                    <input type="checkbox" checked={!!countrySel[code]}
                      onChange={(e) => setCountrySel({ ...countrySel, [code]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
              <input id="regCountryEtc" value={countryEtc} placeholder="그 외 국가는 2자리 코드로 (예: SG, ID)"
                onChange={(e) => setCountryEtc(e.target.value)} style={{ marginTop: 4 }} />
              {fieldErr.countries && <div className="wkb-err" role="alert">{fieldErr.countries}</div>}
            </div>
            <div className="wkb-field">
              <label htmlFor="regEmail">담당자 이메일 <span style={{ color: "var(--c500)" }}>*</span></label>
              <input id="regEmail" value={form.email} placeholder="예: manager@brand.com"
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <div className="wkb-hint">
                이 주소로 브랜드의 첫 로그인 계정(소유자)이 만들어져요. 이미 다른
                곳에서 쓰는 이메일은 사용할 수 없어요. 비밀번호는 담당자가 링크로
                직접 만들어요 — 우리가 정해 주지 않아요.
              </div>
              {fieldErr.email && <div className="wkb-err" role="alert">{fieldErr.email}</div>}
            </div>
            <div className="wkb-hint" style={{ margin: "2px 0 8px" }}>
              요금: 캠페인 가입 검증 1명당 5,000원(부가세 포함)이 월 단위로 모아서 청구돼요.
            </div>
            {regErr && <div className="wkb-err" role="alert" style={{ marginBottom: 8, whiteSpace: "pre-wrap" }}>{regErr}</div>}
            <div className="wkb-row">
              <button id="regSubmit" className="wkb-btn wkb-primary" onClick={() => void register()}>
                {busy === "register" ? "추가하는 중…" : "브랜드 추가"}
              </button>
              <button id="regClose" className="wkb-btn" onClick={() => { setRegOpen(false); setRegErr(""); setFieldErr({}); }}>
                닫기
              </button>
            </div>
          </fieldset>
        </Card>
      )}

      <SectionTitle>브랜드 {visible.length}곳</SectionTitle>
      <div className="wkb-field" style={{ margin: "2px 0 8px" }}>
        <label htmlFor="brandSearch">브랜드 찾기</label>
        <input id="brandSearch" placeholder="이름이나 주소로 검색" value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box" }} />
      </div>
      {visible.length === 0 && <EmptyState>일치하는 브랜드가 없어요</EmptyState>}
      {visible.map((b) => (
        <Card key={b.brandId}
          style={{ ...(b.suspendedAt ? { borderColor: "var(--c300)" } : {}),
                   ...(selected === b.brandId ? { borderColor: "var(--t400)" } : {}) }}>
          <div className="wkb-row">
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <b>{b.name}</b>
              <span style={{ fontSize: 12, color: "var(--n500)", marginLeft: 6 }}>{b.brandId}</span>
              {b.demo && <Badge>데모</Badge>}{" "}
              <Badge color={b.suspendedAt ? "clay" : undefined}>
                {b.suspendedAt ? `이용 중지됨 · ${b.suspendedAt.slice(0, 10)}` : "운영 중"}
              </Badge>
              <div style={{ fontSize: 12, color: "var(--n500)", marginTop: 2 }}>
                크리에이터 멤버 {b.members} · 팀 계정 {b.team}
              </div>
            </div>
            <button className="wkb-btn wkb-primary" onClick={() => void openConsole(b.brandId)} disabled={busy !== "" || !!b.suspendedAt}
              title={b.suspendedAt ? "이용 중지된 브랜드는 콘솔을 열 수 없어요" : undefined}>브랜드 콘솔 열기</button>
            <button className="wkb-btn" onClick={() => pick(b.brandId)} disabled={busy !== ""}>
              {selected === b.brandId ? "담당자 관리 닫기" : "담당자 관리"}
            </button>
          </div>

          {selected === b.brandId && (
            <div style={{ marginTop: 10, borderTop: "1px solid var(--n200)", paddingTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 2 }}>로그인 계정(담당자)</div>
              <div className="wkb-hint" style={{ marginBottom: 6 }}>
                <b>소유자</b>는 계정·팀 관리까지, <b>담당자</b>는 캠페인·메시지 운영을 할 수 있어요.
              </div>
              {accounts === null && <div style={{ fontSize: 12 }}>불러오는 중…</div>}
              {accounts !== null && accounts.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--n500)" }}>계정이 없어요 — 아래 '담당자 계정 추가'로 만들어 주세요.</div>
              )}
              {(accounts || []).map((a) => (
                <div key={a.userId} style={{ borderTop: "1px solid var(--n150)", padding: "8px 0" }}>
                  <div className="wkb-row" style={{ fontSize: 13 }}>
                    <b style={{ overflowWrap: "anywhere" }}>{a.email}</b>
                    <Badge color={a.role === "owner" ? undefined : "amber"}>{roleName(a.role)}</Badge>
                    <Badge color={a.state === "active" ? undefined : "clay"}>
                      {a.state === "active" ? "사용 중" : "이용 중지됨"}
                    </Badge>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--n500)", marginTop: 2 }}>
                    {a.passwordSet
                      ? `비밀번호 설정됨 · 최근 로그인 ${a.lastLoginAt ? a.lastLoginAt.slice(0, 16).replace("T", " ") : "아직 없음"}`
                      : "비밀번호 아직 설정 안 됨 — 아래 링크를 만들어 담당자에게 전달하세요"}
                  </div>
                  <div className="wkb-row" style={{ marginTop: 6 }}>
                    {!a.passwordSet && a.state === "active" && (
                      <button className="wkb-btn wkb-primary" onClick={() => void prepareLink(a, "setup")}
                        disabled={busy !== ""}>
                        {busy === a.userId + "setup" ? "만드는 중…" : "비밀번호 설정 링크 만들기"}
                      </button>
                    )}
                    {a.passwordSet && a.state === "active" && (
                      <button className="wkb-btn" onClick={() => void prepareLink(a, "reset")}
                        disabled={busy !== ""}>
                        {busy === a.userId + "reset" ? "만드는 중…" : "비밀번호 재설정 링크 만들기"}
                      </button>
                    )}
                    <button className="wkb-btn" onClick={() => {
                      setDangerOpen({ ...dangerOpen, [a.userId]: !dangerOpen[a.userId] });
                      setConfirm(null);
                    }} disabled={busy !== ""}>
                      {dangerOpen[a.userId] ? "관리 메뉴 닫기" : "관리 메뉴"}
                    </button>
                  </div>
                  {links[a.userId] && (
                    <div style={{ marginTop: 6, fontSize: 12, background: "var(--n100)",
                      borderRadius: 8, padding: "8px 10px" }}>
                      <b>{links[a.userId].label}</b>
                      <div className="wkb-row" style={{ marginTop: 4 }}>
                        <input readOnly value={links[a.userId].link} onClick={(e) => (e.target as HTMLInputElement).select()}
                          style={{ flex: 1, minWidth: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                        <button className="wkb-btn"
                          onClick={() => { void navigator.clipboard?.writeText(links[a.userId].link); }}>복사</button>
                      </div>
                      <div style={{ color: "var(--n500)", marginTop: 3 }}>
                        복사해서 담당자에게 메신저나 메일로 직접 전달하세요. {links[a.userId].note}
                      </div>
                    </div>
                  )}
                  {dangerOpen[a.userId] && (
                    <div style={{ marginTop: 6 }}>
                      <div className="wkb-hint">조심해서 쓰는 기능이에요 — 누르면 한 번 더 확인해요.</div>
                      <div className="wkb-row" style={{ marginTop: 4 }}>
                        <button className="wkb-btn" disabled={busy !== ""}
                          onClick={() => setConfirm({ kind: "role", brand: b.brandId, brandName: b.name,
                            acc: a, nextRole: a.role === "owner" ? "manager" : "owner" })}>
                          {a.role === "owner" ? "담당자로 바꾸기" : "소유자로 바꾸기"}
                        </button>
                        <button className="wkb-btn" disabled={busy !== ""}
                          onClick={() => setConfirm({ kind: "state", brand: b.brandId, brandName: b.name,
                            acc: a, active: a.state !== "active" })}>
                          {a.state === "active" ? "계정 이용 중지" : "계정 이용 재개"}
                        </button>
                        <button className="wkb-btn" disabled={busy !== ""}
                          onClick={() => setConfirm({ kind: "logoutAll", brand: b.brandId, brandName: b.name, acc: a })}>
                          모든 기기에서 로그아웃
                        </button>
                      </div>
                      {confirm && "acc" in confirm && confirm.acc.userId === a.userId && confirmBox(confirm)}
                    </div>
                  )}
                </div>
              ))}

              <div style={{ marginTop: 8 }}>
                {!addOpen ? (
                  <button className="wkb-btn" onClick={() => setAddOpen(true)} disabled={busy !== ""}>
                    ＋ 담당자 계정 추가
                  </button>
                ) : (
                  <fieldset disabled={busy !== ""} style={{ border: "none", margin: 0, padding: 0 }}>
                    <div className="wkb-field">
                      <label htmlFor="accEmail">새 계정 이메일</label>
                      <input id="accEmail" placeholder="예: staff@brand.com" value={newAcc.email}
                        onChange={(e) => setNewAcc({ ...newAcc, email: e.target.value })} />
                    </div>
                    <div className="wkb-field">
                      <label htmlFor="accRole">권한</label>
                      <select id="accRole" value={newAcc.role}
                        onChange={(e) => setNewAcc({ ...newAcc, role: e.target.value })}>
                        <option value="manager">담당자 — 캠페인·메시지 운영</option>
                        <option value="owner">소유자 — 계정·팀 관리까지</option>
                      </select>
                    </div>
                    <div className="wkb-row">
                      <button id="accAdd" className="wkb-btn wkb-primary" onClick={() => void act("addacc", async () => {
                        await adminApi.addBrandAccount(b.brandId, newAcc.email.trim(), newAcc.role);
                        setNewAcc({ email: "", role: "manager" });
                        setAddOpen(false);
                      })}>
                        {busy === "addacc" ? "추가하는 중…" : "계정 추가"}
                      </button>
                      <button className="wkb-btn" onClick={() => setAddOpen(false)}>닫기</button>
                    </div>
                  </fieldset>
                )}
              </div>

              <div style={{ marginTop: 10, borderTop: "1px solid var(--n150)", paddingTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>브랜드 전체 설정</div>
                <div className="wkb-row" style={{ marginTop: 4 }}>
                  {b.suspendedAt ? (
                    <button className="wkb-btn" disabled={busy !== ""}
                      onClick={() => setConfirm({ kind: "resumeBrand", brand: b.brandId, brandName: b.name })}>
                      브랜드 이용 재개
                    </button>
                  ) : (
                    <button className="wkb-btn" disabled={busy !== ""}
                      onClick={() => setConfirm({ kind: "suspendBrand", brand: b.brandId, brandName: b.name })}>
                      브랜드 이용 중지
                    </button>
                  )}
                </div>
                {confirm && !("acc" in confirm) && confirm.brand === b.brandId && confirmBox(confirm)}
              </div>

              <div className="wkb-hint" style={{ marginTop: 8 }}>
                계정 이용 중지·권한 변경·모든 기기에서 로그아웃을 하면 그 계정의
                기존 로그인과 아직 안 쓴 링크가 바로 무효가 돼요. 마지막 남은
                소유자는 중지하거나 담당자로 바꿀 수 없어요. 계정 이메일 바꾸기와
                삭제는 지원하지 않아요.
              </div>
            </div>
          )}
        </Card>
      ))}

      <SectionTitle>변경 기록</SectionTitle>
      <div className="wkb-row" style={{ margin: "6px 0" }}>
        <input placeholder="누가 (예: admin:)" value={auditActor}
          onChange={(e) => setAuditActor(e.target.value)} style={{ minWidth: 160 }} />
        <input placeholder="무엇을 (예: BRAND_ACCOUNT_)" value={auditEvent}
          onChange={(e) => setAuditEvent(e.target.value)} style={{ minWidth: 200 }} />
        <button className="wkb-btn" onClick={() => void loadAudit()}>조회</button>
      </div>
      {audit === null && <EmptyState>조회를 누르면 최근 기록을 불러와요</EmptyState>}
      {audit !== null && audit.length === 0 && <EmptyState>일치하는 기록이 없어요</EmptyState>}
      {(audit || []).map((a, i) => (
        <Card key={i}>
          <div style={{ fontSize: 12 }}>
            <b>{a.event}</b> · {a.actor} → {a.subject}
            <span style={{ color: "var(--n500)" }}> · {a.at.slice(0, 19).replace("T", " ")}</span>
          </div>
          {Object.keys(a.payload || {}).length > 0 && (
            <pre style={{ fontSize: 11, margin: "6px 0 0", whiteSpace: "pre-wrap", color: "var(--n500)" }}>
              {JSON.stringify(a.payload)}
            </pre>
          )}
        </Card>
      ))}
    </div>
  );
}
