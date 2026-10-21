import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, SectionTitle } from "@connection/ui";
import { adminApi, type AdminBrand, type AuditRow, type BrandAccount } from "../adminApi";

/** 브랜드 운영 — 직접 등록·검색·정지/재개 + 선택 브랜드의 로그인 계정 관리.
 *  링크(초기 설정 72h/재설정 30m)는 버튼을 눌렀을 때만 준비·표시되고 자동
 *  발송되지 않는다. 다른 브랜드 선택·계정 상태 변경 시 링크 표시는 비운다.
 *  비밀번호 원문 조회/임의 설정은 불가 — 사용자가 링크로 직접 설정한다. */
export default function Brands() {
  const [rows, setRows] = useState<AdminBrand[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditEvent, setAuditEvent] = useState("");
  const [auditActor, setAuditActor] = useState("");
  // 등록 폼
  const [form, setForm] = useState({ name: "", slug: "", category: "", countries: "", email: "" });
  const [regNotice, setRegNotice] = useState("");
  // 선택 브랜드 계정 관리
  const [selected, setSelected] = useState("");
  const [accounts, setAccounts] = useState<BrandAccount[] | null>(null);
  const [newAcc, setNewAcc] = useState({ email: "", role: "manager" });
  const [links, setLinks] = useState<Record<string, { label: string; link: string; note: string }>>({});

  const load = () =>
    adminApi.brands().then((r) => { setRows(r); setErr(""); })
      .catch((e) => setErr(e.message || "브랜드 목록을 불러오지 못했습니다"));
  const loadAudit = () =>
    adminApi.audit(auditActor, auditEvent).then(setAudit)
      .catch((e) => { setAudit([]); setErr(e.message || "감사 로그 조회 실패"); });
  const loadAccounts = (brand: string) =>
    adminApi.brandAccounts(brand).then(setAccounts)
      .catch((e) => { setAccounts([]); setErr(e.message || "계정 목록 조회 실패"); });
  useEffect(() => { void load(); }, []);

  const pick = (brand: string) => {
    setSelected(brand);
    setLinks({});                 // 다른 브랜드 선택 → 링크 표시 비움
    setAccounts(null);
    setErr("");
    void loadAccounts(brand);
  };

  const register = async () => {
    if (busy) return;
    setBusy("register"); setErr(""); setRegNotice("");
    try {
      const out = await adminApi.registerBrand({
        name: form.name.trim(), slug: form.slug.trim().toLowerCase(),
        category: form.category.trim(),
        countries: form.countries.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean),
        manager_email: form.email.trim(),
      });
      setRegNotice(`등록 완료 — ${out.brandId} (요금 가입 검증 1명당 5,000원·VAT 포함 월합산). 초기 설정 링크는 아래 계정 관리에서 버튼으로 준비하세요. 자동 메일 발송은 없습니다.`);
      setForm({ name: "", slug: "", category: "", countries: "", email: "" });
      await load();
      pick(out.brandId);
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };

  const act = async (key: string, fn: () => Promise<unknown>, keepLinks = false) => {
    if (busy) return;
    setBusy(key); setErr("");
    try {
      await fn();
      if (!keepLinks) setLinks({});     // 계정 상태 변경 → 링크 표시 비움
      if (selected) await loadAccounts(selected);
      await load();
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };

  const prepareLink = async (a: BrandAccount, kind: "setup" | "reset") => {
    if (busy) return;
    setBusy(a.userId + kind); setErr("");
    try {
      const r = kind === "setup"
        ? await adminApi.accountSetupLink(selected, a.userId)
        : await adminApi.accountResetLink(selected, a.userId);
      setLinks({ [a.userId]: {                 // 명시 버튼을 눌렀을 때만 표시
        label: kind === "setup" ? "초기 설정 링크 (72시간 · 1회용)" : "재설정 링크 (30분 · 1회용)",
        link: r.link, note: r.note } });
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };

  const visible = rows.filter((b) =>
    !query.trim() || (b.name + " " + b.brandId).toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>브랜드 운영</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>
        고객 브랜드 직접 등록과 브랜드 로그인 계정 관리. 모든 조치는 감사
        로그(원장)에 남고, 비밀번호는 담당자가 1회용 링크로 직접 설정합니다.
      </div>
      {err && <div role="alert" style={{ color: "var(--c500)", fontSize: 12, margin: "8px 0", whiteSpace: "pre-wrap" }}>{err}</div>}

      <SectionTitle>새 브랜드 등록</SectionTitle>
      <Card>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input placeholder="브랜드명" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={{ flex: "1 1 160px", minWidth: 0 }} />
          <input placeholder="slug (소문자·숫자·하이픈)" value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            style={{ flex: "1 1 150px", minWidth: 0 }} />
          <input placeholder="카테고리" value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            style={{ flex: "1 1 110px", minWidth: 0 }} />
          <input placeholder="타깃 국가 (예: KR, TH)" value={form.countries}
            onChange={(e) => setForm({ ...form, countries: e.target.value })}
            style={{ flex: "1 1 130px", minWidth: 0 }} />
          <input placeholder="담당자 이메일 (owner)" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={{ flex: "1 1 200px", minWidth: 0 }} />
          <button onClick={() => void register()} disabled={busy === "register"}>
            {busy === "register" ? "등록 중…" : "브랜드 등록"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--n500)", marginTop: 6 }}>
          기본 커뮤니티·운영 참고 프로필이 함께 생성됩니다(요금 per_signup
          5,000원 VAT 포함 월합산). 약관 동의·학습 확인을 대신 기록하지
          않으며, 담당자 이메일이 기존 계정(타 브랜드/크리에이터/어드민)이면
          409로 거부됩니다. 회사 관리 주소(chief+theprlist)는 기존 '디노 공용
          모집' 셋업 반입을 그대로 사용하세요.
        </div>
        {regNotice && <div role="status" style={{ fontSize: 12, color: "var(--t400)", marginTop: 6 }}>{regNotice}</div>}
      </Card>

      <SectionTitle>브랜드 {visible.length}곳</SectionTitle>
      <input placeholder="브랜드 검색 (이름·slug)" value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", margin: "2px 0 8px" }} />
      {visible.length === 0 && <EmptyState>일치하는 브랜드가 없어요</EmptyState>}
      {visible.map((b) => (
        <Card key={b.brandId}
          style={{ ...(b.suspendedAt ? { borderColor: "var(--c300)" } : {}),
                   ...(selected === b.brandId ? { borderColor: "var(--t400)" } : {}) }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b>{b.name}</b>
            <span style={{ fontSize: 12, color: "var(--n500)" }}>{b.brandId}</span>
            {b.demo && <Badge>데모</Badge>}
            <Badge color={b.suspendedAt ? "clay" : undefined}>
              {b.suspendedAt ? `정지됨 · ${b.suspendedAt.slice(0, 10)}` : "운영 중"}
            </Badge>
            <span style={{ fontSize: 12, color: "var(--n500)" }}>멤버 {b.members} · 팀 {b.team}</span>
            <button onClick={() => pick(b.brandId)} disabled={busy !== ""}>
              {selected === b.brandId ? "계정 관리 중" : "계정 관리"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {b.suspendedAt ? (
              <button onClick={() => void act(b.brandId, () => adminApi.resumeBrand(b.brandId))}
                disabled={busy === b.brandId}>
                {busy === b.brandId ? "처리 중…" : "정지 해제(재개)"}
              </button>
            ) : (
              <>
                <input placeholder="정지 사유 (감사 로그 기록)" value={reason[b.brandId] || ""}
                  onChange={(e) => setReason({ ...reason, [b.brandId]: e.target.value })}
                  style={{ flex: 1, minWidth: 160 }} />
                <button onClick={() => void act(b.brandId,
                  () => adminApi.suspendBrand(b.brandId, reason[b.brandId] || ""))}
                  disabled={busy === b.brandId}>
                  {busy === b.brandId ? "처리 중…" : "정지"}
                </button>
              </>
            )}
          </div>

          {selected === b.brandId && (
            <div style={{ marginTop: 10, borderTop: "1px solid var(--n200)", paddingTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>로그인 계정</div>
              {accounts === null && <div style={{ fontSize: 12 }}>불러오는 중…</div>}
              {accounts !== null && accounts.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--n500)" }}>계정이 없습니다 — 아래에서 추가하세요.</div>
              )}
              {(accounts || []).map((a) => (
                <div key={a.userId} style={{ borderTop: "1px solid var(--n150)", padding: "8px 0" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                    <b style={{ overflowWrap: "anywhere" }}>{a.email}</b>
                    <Badge color={a.role === "owner" ? undefined : "amber"}>
                      {a.role === "owner" ? "소유자" : "매니저"}
                    </Badge>
                    <Badge color={a.state === "active" ? undefined : "clay"}>
                      {a.state === "active" ? "활성" : "중지"}
                    </Badge>
                    <span style={{ fontSize: 11, color: "var(--n500)" }}>
                      비밀번호 {a.passwordSet ? "설정됨" : "미설정"} · 최근 로그인 {a.lastLoginAt ? a.lastLoginAt.slice(0, 16).replace("T", " ") : "없음"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {!a.passwordSet && a.state === "active" && (
                      <button onClick={() => void prepareLink(a, "setup")}
                        disabled={busy !== ""}>초기 설정 링크 준비</button>
                    )}
                    {a.passwordSet && a.state === "active" && (
                      <button onClick={() => void prepareLink(a, "reset")}
                        disabled={busy !== ""}>재설정 링크 준비</button>
                    )}
                    <button onClick={() => void act(a.userId + "role",
                      () => adminApi.accountRole(b.brandId, a.userId,
                        a.role === "owner" ? "manager" : "owner"))}
                      disabled={busy !== ""}>
                      {a.role === "owner" ? "매니저로 변경" : "소유자로 변경"}
                    </button>
                    <button onClick={() => void act(a.userId + "state",
                      () => adminApi.accountState(b.brandId, a.userId, a.state !== "active"))}
                      disabled={busy !== ""}>
                      {a.state === "active" ? "중지" : "재개"}
                    </button>
                    <button onClick={() => void act(a.userId + "revoke",
                      () => adminApi.accountRevokeSessions(b.brandId, a.userId))}
                      disabled={busy !== ""}>세션 철회</button>
                  </div>
                  {links[a.userId] && (
                    <div style={{ marginTop: 6, fontSize: 12, background: "var(--n100)",
                      borderRadius: 8, padding: "8px 10px" }}>
                      <b>{links[a.userId].label}</b>
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <input readOnly value={links[a.userId].link} onClick={(e) => (e.target as HTMLInputElement).select()}
                          style={{ flex: 1, minWidth: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                        <button onClick={() => { void navigator.clipboard?.writeText(links[a.userId].link); }}>복사</button>
                      </div>
                      <div style={{ color: "var(--n500)", marginTop: 3 }}>{links[a.userId].note}</div>
                    </div>
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <input placeholder="새 계정 이메일" value={newAcc.email}
                  onChange={(e) => setNewAcc({ ...newAcc, email: e.target.value })}
                  style={{ flex: "1 1 180px", minWidth: 0 }} />
                <select value={newAcc.role}
                  onChange={(e) => setNewAcc({ ...newAcc, role: e.target.value })}>
                  <option value="manager">매니저</option>
                  <option value="owner">소유자</option>
                </select>
                <button onClick={() => void act("addacc", async () => {
                  await adminApi.addBrandAccount(b.brandId, newAcc.email.trim(), newAcc.role);
                  setNewAcc({ email: "", role: "manager" });
                })} disabled={busy !== ""}>계정 추가</button>
              </div>
              <div style={{ fontSize: 11, color: "var(--n500)", marginTop: 6 }}>
                중지·역할 변경·세션 철회 시 해당 계정의 기존 로그인과 미사용
                링크가 즉시 무효화됩니다. 마지막 활성 소유자는 중지/강등할 수
                없습니다. 계정 이메일 이전·삭제는 지원하지 않습니다.
              </div>
            </div>
          )}
        </Card>
      ))}

      <SectionTitle>감사 로그</SectionTitle>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
        <input placeholder="행위자 필터 (예: admin:)" value={auditActor}
          onChange={(e) => setAuditActor(e.target.value)} style={{ minWidth: 160 }} />
        <input placeholder="이벤트 필터 (예: BRAND_ACCOUNT_)" value={auditEvent}
          onChange={(e) => setAuditEvent(e.target.value)} style={{ minWidth: 200 }} />
        <button onClick={() => void loadAudit()}>조회</button>
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
