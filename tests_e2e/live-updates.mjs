// 실시간 갱신 E2E — 두 개의 실브라우저 세션이 서로 메시지/공지를 보내고,
// 수신 측이 "새로고침 없이" 받는지 + 입력 중 초안·포커스·스크롤 보존 검증.
// (creator A ↔ creator B 같은 채널, brand 콘솔 C 열린 대화·공지→알림 배지)
import { execSync } from "node:child_process";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const API = "http://localhost:8765";
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m,
  headers: { "Content-Type": "application/json",
             ...(tok ? { Authorization: "Bearer " + tok } : {}) },
  body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
const psql = (q) => execSync(
  `PGUSER=postgres PGPASSWORD=postgres PGHOST=localhost psql -d e2e_c3 -c "${q}" >/dev/null`);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errors = [];
const newPage = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1380, height: 880 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(tag + ":" + e));
  return p;
};
async function creatorJwt(email) {
  const magic = (await api("POST", "/auth/magic", { email })).demoLink.split("magic=")[1];
  const jwt = (await api("POST", "/auth/magic/verify", { token: magic })).token;
  const creatorId = (await api("GET", "/me/profile", null, jwt)).creatorId;
  psql(`INSERT INTO legacy_creators(creator_id) VALUES('${creatorId}') ON CONFLICT DO NOTHING`);
  await api("POST", "/me/join", { brand_id: "glowlab" }, jwt);
  return jwt;
}
async function openCreator(p, jwt) {
  await p.goto(`http://localhost:5175/?api=${encodeURIComponent(API)}`);
  await p.evaluate((t) => localStorage.setItem("CONNECTION_JWT", t), jwt);
  await p.goto("http://localhost:5175/");
  await p.waitForTimeout(2200);
  await p.click(".crside-item >> text=GLOWLAB");
  await p.waitForTimeout(1600);
}

const jwtA = await creatorJwt("live.a@ex.com");
const jwtB = await creatorJwt("live.b@ex.com");

// ── A: 채널 열고 위로 스크롤 + 입력 중 초안 + 내비 마커 ──
const A = await newPage("A");
await openCreator(A, jwtA);
await A.evaluate(() => { window.__navMarker = 41; const m = document.querySelector(".crmsgs"); if (m) m.scrollTop = 0; });
await A.click("#commText");
await A.type("#commText", "입력 중이던 초안 — 지워지면 안 됨");
const beforeBadge = await A.evaluate(() => Number((document.querySelector(".crtop-bell em") || {}).textContent || 0));

// ── B: 같은 채널에서 메시지 게시 ──
const B = await newPage("B");
await openCreator(B, jwtB);
const MSG1 = "라이브 메시지 " + Date.now();
await B.fill("#commText", MSG1);
await B.click("button:has-text('메시지 보내기')");
await B.waitForTimeout(1200);

// ── A: 새로고침 없이 수신 + 초안/포커스/스크롤 보존 ──
await A.waitForSelector(`.crmsg:has-text("${MSG1}")`, { timeout: 15000 });
const stateA = await A.evaluate(() => ({
  marker: window.__navMarker,
  draft: (document.getElementById("commText") || {}).value || "",
  focus: document.activeElement && document.activeElement.id,
  scrollTop: (document.querySelector(".crmsgs") || {}).scrollTop,
  head: (document.querySelector(".crchat-head h1") || {}).innerText || "",
}));
ok("A: 상대 메시지가 새로고침 없이 표시", stateA.marker === 41);
ok("A: 입력 중 초안 보존", stateA.draft === "입력 중이던 초안 — 지워지면 안 됨", stateA.draft);
ok("A: 포커스 보존(commText)", stateA.focus === "commText", String(stateA.focus));
ok("A: 스크롤 위치 보존(위로 올린 상태 유지)", (stateA.scrollTop || 0) < 120, "scrollTop=" + stateA.scrollTop);
ok("A: 현재 채널 강제 이동 없음", stateA.head.includes("잡담"), stateA.head);

// ── B: 스레드 답글 → A에 답글 수 자동 반영 ──
await B.click(`.crmsg:has-text("${MSG1}") .crthread-btn`);
await B.waitForTimeout(1000);
await B.fill("#crThreadText", "스레드 라이브 답글");
await B.click(".crthreadp button:has-text('답글 보내기')");
await B.waitForTimeout(800);
await A.waitForSelector(`.crmsg:has-text("${MSG1}") .crthread-btn:has-text("답글 1개")`, { timeout: 15000 });
ok("A: 스레드 답글 수 자동 반영(답글 1개)", true);

// ── 브랜드 콘솔 C: 열린 대화에 크리에이터 메시지 실시간 수신 ──
const C = await newPage("C");
await C.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`);
await C.waitForTimeout(900);
await C.click("#authChip");
await C.fill("#axEmail", "cmo@glowlab.co");
await C.fill("#axPw", "glowlab-pw-123");
await C.click('button.cbt:text-is("로그인")');
await C.waitForTimeout(1800);
await C.click('.crside button:has-text("커뮤니티·DM")');
await C.waitForTimeout(1200);
await C.click('button:has-text("라운지 ·")');
await C.waitForTimeout(1500);
await C.evaluate(() => { window.__navMarker = 42; });
const draftC = "콘솔에서 입력 중 — 보존 확인";
await C.fill(".wkpage textarea", draftC);
const MSG2 = "크리에이터 추가 메시지 " + Date.now();
await B.fill("#commText", MSG2);
await B.click("button:has-text('메시지 보내기')");
await C.waitForSelector(`article.cc:has-text("${MSG2}")`, { timeout: 18000 });
const stateC = await C.evaluate(() => ({
  marker: window.__navMarker,
  draft: (document.querySelector(".wkpage textarea") || {}).value || "",
}));
ok("콘솔: 새 메시지가 새로고침 없이 표시", stateC.marker === 42);
ok("콘솔: 입력 중 답장 초안 보존", stateC.draft === draftC, stateC.draft);

// ── C: 공지 게시 → A 알림 배지 자동 증가(강제 이동 없음) ──
await C.selectOption(".wkpage select", "notice");
await C.waitForTimeout(500);
const NOTICE = "라이브 공지 " + Date.now();
await C.fill(".wkpage textarea", NOTICE);
await C.click("button:has-text('공지 게시')");
await C.waitForTimeout(1500);
await A.waitForFunction((prev) => {
  const el = document.querySelector(".crtop-bell em");
  return el && Number(el.textContent.replace("+", "")) > prev;
}, beforeBadge, { timeout: 18000 });
const afterA = await A.evaluate(() => ({
  marker: window.__navMarker,
  head: (document.querySelector(".crchat-head h1") || {}).innerText || "",
  draft: (document.getElementById("commText") || {}).value || "",
}));
ok("A: 공지 알림 배지 자동 증가(새로고침 없음)", afterA.marker === 41);
ok("A: 알림이 와도 채널 강제 이동 없음 + 초안 유지",
  afterA.head.includes("잡담") && afterA.draft.includes("입력 중이던 초안"));

ok("JS 에러 없음", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
