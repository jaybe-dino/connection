// 모바일 터치 접근성 실측 — 375/390에서 크리에이터·콘솔 헤더의 알림/계정/
// 버거 버튼이 44×44 이상이고(flex-shrink 수축 금지), 긴 브랜드명·미읽음
// 배지가 있어도 가로 넘침 없이 설정/드로어 진입이 실제 탭으로 되는지 검증.
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

// ── 시드: legacy 크리에이터(긴 이름 브랜드 + glowlab 멤버, 알림 1+) ──
const email = "touch.e2e@ex.com";
const magic = (await api("POST", "/auth/magic", { email })).demoLink.split("magic=")[1];
const cjwt = (await api("POST", "/auth/magic/verify", { token: magic })).token;
const creatorId = (await api("GET", "/me/profile", null, cjwt)).creatorId;
psql(`INSERT INTO legacy_creators(creator_id) VALUES('${creatorId}') ON CONFLICT DO NOTHING`);
await api("POST", "/me/join", { brand_id: "glowlab" }, cjwt);
await api("POST", "/me/join", { brand_id: "longname" }, cjwt);
let bjwt = "";
try {
  const inv = await api("POST", "/auth/invite", { email: "touch.brand@long.co", brand_id: "longname" });
  if (inv.demoLink) bjwt = (await api("POST", "/auth/accept",
    { token: inv.demoLink.split("invite=")[1], password: "longname-pw-123" })).token;
} catch {}
// 캠페인 발행 → 크리에이터 알림 배지(미읽음 알림) 확보
const gjwt = (await api("POST", "/auth/login",
  { email: "cmo@glowlab.co", password: "glowlab-pw-123" })).token;
const camp = await api("POST", "/brands/glowlab/campaigns",
  { name: "터치 검증 캠페인 " + Date.now(), reward_type: "gifted" }, gjwt);
await api("POST", `/brands/glowlab/campaigns/${camp.campaignId}/publish`, {}, gjwt);

const box = (p, sel) => p.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
           right: Math.round(r.right), left: Math.round(r.left) };
}, sel);

for (const width of [375, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  const errsBefore = errors.length;

  // ── 크리에이터 390/375 ──
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push("creator" + width + ":" + e));
  await p.goto(`http://localhost:5175/?api=${encodeURIComponent(API)}`);
  await p.evaluate((t) => localStorage.setItem("CONNECTION_JWT", t), cjwt);
  await p.goto("http://localhost:5175/#community");
  await p.waitForTimeout(2300);
  const bell = await box(p, ".crtop-bell");
  const me = await box(p, ".crtop-me");
  const badge = await p.evaluate(() => (document.querySelector(".crtop-bell em") || {}).textContent || "");
  ok(`[${width}] 크리에이터 알림 버튼 ≥44×44(배지 ${badge || "없음"})`,
    !!bell && bell.w >= 44 && bell.h >= 44, JSON.stringify(bell));
  ok(`[${width}] 크리에이터 계정 버튼 ≥44×44 · 화면 안`,
    !!me && me.w >= 44 && me.h >= 44 && me.right <= width, JSON.stringify(me));
  const fit1 = await p.evaluate(() => ({
    sw: document.documentElement.scrollWidth, vw: window.innerWidth,
    chip: getComputedStyle(document.querySelector("#authChip") || document.body).display,
    nav: !!document.querySelector(".crbottomnav") &&
      getComputedStyle(document.querySelector(".crbottomnav")).display === "grid" }));
  ok(`[${width}] 크리에이터 가로 넘침 없음(긴 브랜드명 포함) + 하단 네비`,
    fit1.sw <= fit1.vw + 1 && fit1.nav, JSON.stringify(fit1));
  ok(`[${width}] 로그인 후 플로팅 칩이 하단 네비를 가리지 않음`, fit1.chip === "none", fit1.chip);
  // 실제 탭으로 설정(계정·언어) 진입
  await p.tap(".crtop-me");
  await p.waitForTimeout(1300);
  const t1 = await p.evaluate(() => document.body.innerText);
  ok(`[${width}] 계정 버튼 탭 → 설정 진입`, t1.includes("계정과 언어"));
  // 알림 버튼 탭 → 패널 열림(헤더에 가려지지 않음)
  await p.tap(".crtop-bell");
  await p.waitForTimeout(800);
  const notifBox = await box(p, ".crnotif");
  ok(`[${width}] 알림 버튼 탭 → 패널 열림(헤더 아래)`,
    !!notifBox && notifBox.left >= 0, JSON.stringify(notifBox));
  await p.tap(".crnotif button[aria-label='알림 닫기']");

  // ── 콘솔 390/375 (긴 브랜드명 칩 + 버거/계정) ──
  const c = await ctx.newPage();
  c.on("pageerror", (e) => errors.push("console" + width + ":" + e));
  await c.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`);
  await c.waitForTimeout(900);
  await c.tap("#authChip");
  await c.fill("#axEmail", "touch.brand@long.co");
  await c.fill("#axPw", "longname-pw-123");
  await c.tap('button.cbt:text-is("로그인")');
  await c.waitForTimeout(1900);
  const burger = await box(c, ".wkburger");
  const cme = await box(c, ".crtop-me");
  const chip = await box(c, ".wkchip");
  ok(`[${width}] 콘솔 버거 버튼 ≥44×44`, !!burger && burger.w >= 44 && burger.h >= 44, JSON.stringify(burger));
  ok(`[${width}] 콘솔 계정 버튼 ≥44×44 · 화면 안(긴 브랜드명 칩과 공존)`,
    !!cme && cme.w >= 44 && cme.h >= 44 && cme.right <= width, JSON.stringify({ cme, chip }));
  const fit2 = await c.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  ok(`[${width}] 콘솔 가로 넘침 없음(긴 브랜드명)`, fit2.sw <= fit2.vw + 1, JSON.stringify(fit2));
  // 버거 탭 → 드로어(전체 메뉴) → 팀 진입, 드로어가 가려지지 않음
  await c.tap(".wkburger");
  await c.waitForTimeout(700);
  const drawerTeam = await box(c, '.crside.open .crside-item:nth-last-child(2)');
  ok(`[${width}] 버거 탭 → 드로어 열림`, !!(await c.locator(".crside.open").count()), JSON.stringify(drawerTeam));
  await c.tap('.crside.open button:has-text("팀")');
  await c.waitForTimeout(1500);
  const t2 = await c.evaluate(() => document.body.innerText);
  ok(`[${width}] 드로어 → 팀 화면 진입`, t2.includes("역할 변경은 소유자"));
  ok(`[${width}] JS 에러 없음`, errors.length === errsBefore, errors.slice(errsBefore).join("|").slice(0, 200));
  if (width === 390) {
    await p.screenshot({ path: "tests_e2e/shots/creator-mobile-touch.png" }).catch(() => {});
    await c.screenshot({ path: "tests_e2e/shots/console-mobile-touch.png" }).catch(() => {});
  }
  await ctx.close();
}

await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
