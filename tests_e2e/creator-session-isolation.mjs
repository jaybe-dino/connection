// P0 세션·초안 격리 E2E — 같은 기기(브라우저 프로필)에서 같은 브랜드의
// 크리에이터 A → 로그아웃 → B 로그인 시:
//  · A의 미전송 초안·북마크가 B에게 보이지 않는다(계정별 네임스페이스 저장).
//  · 로그아웃 시 메모리 민감 상태가 초기화된다.
//  · 과거 계정 공용 키(prlist-slack-live-v1)는 읽지 않고 폐기한다.
//  · A의 지연 응답이 로그아웃/계정 교체 후 LIVE를 덮지 못한다(stale 가드),
//    체인 후속 POST도 다른 계정 토큰으로 이어지지 않는다.
//  · 다른 탭의 로그아웃이 storage 이벤트로 이 탭에 반영된다.
// 실 로컬 disposable DB(e2e_c3), 실메일·실결제 없음.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { execSync } from "node:child_process";

const API = "http://localhost:8765";
const APP = "http://localhost:5175";
const DB = "postgresql://postgres:postgres@localhost:5432/e2e_c3";
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m,
  headers: { "Content-Type": "application/json",
             ...(tok ? { Authorization: "Bearer " + tok } : {}) },
  body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
const sql = (q) => execSync(`psql "${DB}" -Atc ${JSON.stringify(q)}`).toString().trim();
const sfx = Date.now().toString(36);

// ── 같은 브랜드(glowlab) 멤버 크리에이터 2명 API로 준비 ──
async function makeCreator(tag) {
  const email = `iso-${tag}-${sfx}@creator.example`;
  const magic = await api("POST", "/auth/magic", { email, brand: "glowlab", locale: "ko" });
  const tok = (await api("POST", "/auth/magic/verify",
    { token: magic.demoLink.split("magic=")[1] })).token;
  const me = await api("GET", "/auth/me", null, tok);
  await api("PUT", "/me/profile", { country: "KR", languages: ["ko"],
    ship_countries: ["KR"], tiktok_handle: "@iso_" + tag + "_" + sfx,
    consent_terms: true, consent_privacy: true }, tok);
  // TikTok 공식 연동 승인 대기 — 서버 테스트와 동일한 DB 대리
  sql(`UPDATE creator_profiles SET tiktok_owner_state='connected', tiktok_open_id='iso-${tag}-${sfx}' WHERE tiktok_handle='iso_${tag}_${sfx}'`);
  const joined = await api("POST", "/me/join", { brand_id: "glowlab" }, tok);
  return { email, tok, userId: me.userId, joined: joined.joined !== undefined };
}
const A = await makeCreator("a");
const B = await makeCreator("b");
ok("크리에이터 A·B 동일 브랜드 멤버십 준비", A.joined && B.joined && A.userId !== B.userId);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
const login = async (tok, mark) => {
  await p.goto(`${APP}/?api=${encodeURIComponent(API)}&s=${mark}`);
  await p.evaluate((t) => localStorage.setItem("CONNECTION_JWT", t), tok);
  await p.goto(`${APP}/?api=${encodeURIComponent(API)}&s=${mark}r#community`);
  await p.waitForSelector("#chatDraft", { timeout: 15000 });
};

// 레거시 공용 키가 남아 있던 기기 시나리오 — 절대 읽히면 안 된다
await p.goto(`${APP}/?api=${encodeURIComponent(API)}`);
await p.evaluate(() => localStorage.setItem("prlist-slack-live-v1",
  JSON.stringify({ drafts: { legacy: "레거시 공용 초안 — 노출 금지" }, saved: ["x"] })));

// ── A: 초안 작성(미전송) + 북마크 ──
await login(A.tok, "a1");
const DRAFT_A = "A의 비밀 초안 " + sfx;
await p.fill("#chatDraft", DRAFT_A);
await p.evaluate(() => { captureDraft(); });
const aState = await p.evaluate(() => ({
  user: window.__storeUser(), draftKeys: Object.keys(store.drafts),
  legacyGone: localStorage.getItem("prlist-slack-live-v1") === null,
  keys: Object.keys(localStorage).filter((k) => k.startsWith("prlist-slack-live-v1")) }));
ok("A 초안이 A userId 네임스페이스에만 저장", aState.user === A.userId
  && aState.draftKeys.every((k) => k.startsWith("u:" + A.userId + ":"))
  && aState.keys.length === 1 && aState.keys[0] === "prlist-slack-live-v1:u:" + A.userId,
  JSON.stringify(aState));
ok("레거시 공용 초안 키는 읽지 않고 폐기(마이그레이션 금지)", aState.legacyGone);

// ── A 로그아웃(UI) → 메모리 민감 상태 초기화 ──
await p.evaluate(() => navigate("settings"));
await p.click('.setting-nav button:has-text("계정·연결")');
await p.click('button:has-text("로그아웃")');
await p.waitForSelector("text=이메일로 시작하세요", { timeout: 9000 });
const afterLogout = await p.evaluate(() => ({
  me: window.__ME, user: window.__storeUser(),
  drafts: Object.keys(store.drafts).length, saved: store.saved.length,
  cells: LIVE.cells, profile: LIVE.profile, jwt: localStorage.getItem("CONNECTION_JWT"),
  persisted: !!localStorage.getItem("prlist-slack-live-v1:u:" + "__A__".replace("__A__", "")) }));
ok("로그아웃: 메모리 초안·스토어·LIVE·JWT 초기화", afterLogout.me === null
  && afterLogout.user === null && afterLogout.drafts === 0 && afterLogout.saved === 0
  && afterLogout.cells === null && afterLogout.profile === null && !afterLogout.jwt,
  JSON.stringify(afterLogout));

// ── B 로그인: 같은 셀·채널에서 A 초안이 보이지 않는다 ──
await login(B.tok, "b1");
const bView = await p.evaluate(() => ({
  user: window.__storeUser(), draft: document.getElementById("chatDraft").value,
  body: document.body.innerText.slice(0, 4000) }));
ok("B에게 A의 미전송 초안 비노출(오발송 불가)", bView.user === B.userId
  && bView.draft === "" && !bView.body.includes("A의 비밀 초안"),
  bView.draft.slice(0, 40));
const DRAFT_B = "B의 초안 " + sfx;
await p.fill("#chatDraft", DRAFT_B);
await p.evaluate(() => { captureDraft(); });

// ── 재로그인한 A: 자기 초안은 복원, B 초안은 비노출 ──
await login(A.tok, "a2");
const aBack = await p.evaluate(() => document.getElementById("chatDraft").value);
ok("A 재로그인: 자기 초안 복원 + B 초안 비노출", aBack.includes("A의 비밀 초안") && !aBack.includes("B의 초안"), aBack.slice(0, 40));

// ── 지연 응답 교체: A의 /me/campaigns 응답이 로그아웃 후 도착해도 버려진다 ──
await ctx.route("**/me/campaigns**", async (route) => {
  await new Promise((r) => setTimeout(r, 2500));
  route.continue();
});
const staleProbe = await p.evaluate(async () => {
  LIVE.campaigns = null;
  const inflight = liveReq("GET", "/me/campaigns")
    .then((list) => ({ applied: true, n: list.length }))
    .catch((e) => ({ applied: false, stale: !!(e && e.stale) }));
  await new Promise((r) => setTimeout(r, 300));
  authLogout();                       // 응답 도착 전 로그아웃
  const out = await inflight;
  return { ...out, campaignsAfter: LIVE.campaigns, me: window.__ME };
});
ok("지연 응답 stale 폐기: 로그아웃 후 도착한 A 응답이 LIVE를 덮지 않음",
  staleProbe.applied === false && staleProbe.stale === true
  && staleProbe.campaignsAfter === null && staleProbe.me === null,
  JSON.stringify(staleProbe));
await ctx.unroute("**/me/campaigns**");

// 체인 후속 POST 차단: 제출(지연) 도중 로그아웃 → DM 전달 POST가 B 토큰으로 이어지지 않는다
await login(A.tok, "a3");
await ctx.route("**/campaign-offers/**", async (route) => {
  await new Promise((r) => setTimeout(r, 2000));
  route.continue();
});
const before = sql(`SELECT count(*) FROM cell_messages WHERE original LIKE '%체인차단${sfx}%'`);
const chainProbe = await p.evaluate(async (sfx) => {
  const run = submitContent("no-such-campaign-" + sfx, "https://example.com/x", "체인차단" + sfx);
  await new Promise((r) => setTimeout(r, 300));
  authLogout();
  await run;
  return true;
}, sfx);
await p.waitForTimeout(2600);
const after = sql(`SELECT count(*) FROM cell_messages WHERE original LIKE '%체인차단${sfx}%'`);
ok("세션 교체 후 체인 후속 POST(DM 전달) 미발사", chainProbe && before === after, `${before}->${after}`);
await ctx.unroute("**/campaign-offers/**");

// ── 다른 탭 로그아웃이 storage 이벤트로 반영 ──
await login(A.tok, "a4");
const p2 = await ctx.newPage();
await p2.goto(`${APP}/?api=${encodeURIComponent(API)}&s=tab2#community`);
await p2.waitForSelector("#chatDraft", { timeout: 15000 });
await p2.evaluate(() => authLogout());           // 탭2에서 로그아웃
await p.waitForSelector("text=이메일로 시작하세요", { timeout: 9000 });
const tabSync = await p.evaluate(() => ({ me: window.__ME, drafts: Object.keys(store.drafts).length }));
ok("다른 탭 로그아웃 → 이 탭도 즉시 로그아웃·메모리 초기화", tabSync.me === null && tabSync.drafts === 0, JSON.stringify(tabSync));

ok("JS 에러 없음", errors.length === 0, errors.join(" | ").slice(0, 200));
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
