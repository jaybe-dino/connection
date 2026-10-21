// 어드민 브랜드 직접 등록 + 로그인 계정 관리 E2E — 실 로컬 disposable DB,
// 실제 UI(PC 1440 / 모바일 375) 조작. 메일 발송·실결제 없음.
// 여정: 등록 폼 → 계정 관리 → 초기 설정 링크(버튼 클릭 시에만 표시) →
// 담당자가 링크로 비밀번호 직접 설정 → 콘솔 로그인(자기 브랜드만) →
// 브랜드 전환 시 링크 표시 비움 → 모바일 375 실측.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const API = "http://localhost:8765";
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m,
  headers: { "Content-Type": "application/json",
             ...(tok ? { Authorization: "Bearer " + tok } : {}) },
  body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errors = [];
const newPage = async (tag, viewport, mobile) => {
  const ctx = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(tag + ":" + e));
  return p;
};

// ── 어드민 JWT 준비(최초 1회 bootstrap, 이후 login) ──
let boot = await api("POST", "/auth/bootstrap",
  { email: "ops.e2e@ex.com", password: "admin-ops-pass-1" });
if (!boot.token) boot = await api("POST", "/auth/login",
  { email: "ops.e2e@ex.com", password: "admin-ops-pass-1" });
const ajwt = boot.token;
ok("어드민 실계정 JWT 확보(bootstrap)", !!ajwt);

const sfx = Date.now().toString(36);
const SLUG = "uibrand-" + sfx;
const EMAIL = `ui-owner-${sfx}@brand.example`;

// ── PC 1440: 등록 폼 → 계정 관리 → 링크 준비 ──
const A = await newPage("admin", { width: 1440, height: 900 });
await A.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await A.evaluate((t) => localStorage.setItem("CONNECTION_JWT", t), ajwt);
await A.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await A.waitForTimeout(1600);
await A.click('text=브랜드 운영');
await A.waitForTimeout(1200);
await A.fill('input[placeholder="브랜드명"]', "UI 등록 브랜드 " + sfx);
await A.fill('input[placeholder^="slug"]', SLUG);
await A.fill('input[placeholder="카테고리"]', "스킨케어");
await A.fill('input[placeholder^="타깃 국가"]', "KR, TH");
await A.fill('input[placeholder^="담당자 이메일"]', EMAIL);
await A.click('button:has-text("브랜드 등록")');
await A.waitForSelector(`text=등록 완료 — ${SLUG}`, { timeout: 12000 });
ok("등록 폼 → 브랜드 생성 + 요금 안내", true);

// 중복 slug 재등록 → 명확한 409 메시지, 폼 입력 유지 확인
await A.fill('input[placeholder="브랜드명"]', "중복 확인");
await A.fill('input[placeholder^="slug"]', SLUG);
await A.fill('input[placeholder^="담당자 이메일"]', `dup-${sfx}@brand.example`);
await A.click('button:has-text("브랜드 등록")');
await A.waitForTimeout(1500);
const dupErr = await A.evaluate(() => document.body.innerText);
ok("중복 slug 409 메시지 표시", dupErr.includes("이미 등록된 브랜드 주소"));

// 계정 패널: owner 1명 · 비밀번호 미설정 · 링크는 아직 미표시
await A.waitForSelector(`text=${EMAIL}`, { timeout: 8000 });
let t = await A.evaluate(() => document.body.innerText);
ok("계정 목록: owner·활성·비밀번호 미설정·최근 로그인 없음",
  t.includes("소유자") && t.includes("비밀번호 미설정") && t.includes("최근 로그인 없음"));
ok("링크는 버튼 클릭 전에는 표시되지 않음", !t.includes("invite="));
await A.click('button:has-text("초기 설정 링크 준비")');
await A.waitForSelector("text=초기 설정 링크 (72시간", { timeout: 8000 });
const setupLink = await A.evaluate(() =>
  [...document.querySelectorAll("input[readonly]")].map((e) => e.value)
    .find((v) => v.includes("invite=")) || "");
ok("초기 설정 링크 준비(자동 발송 없음 안내)", setupLink.includes("invite=")
  && (await A.evaluate(() => document.body.innerText)).includes("자동 발송되지 않습니다"));

// 다른 브랜드 선택 → 링크 표시 비움 (glowlab 시드 존재)
await A.fill('input[placeholder^="브랜드 검색"]', "glowlab");
await A.waitForTimeout(400);
await A.click('button:has-text("계정 관리")');
await A.waitForTimeout(1200);
t = await A.evaluate(() => document.body.innerText);
ok("브랜드 검색 + 전환 시 링크 표시 비움", !t.includes("invite=") && t.includes("GLOWLAB"));

// ── 담당자: 링크로 비밀번호 직접 설정 → 콘솔 로그인 → 자기 브랜드만 ──
const B = await newPage("brand", { width: 1380, height: 880 });
await B.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`);
await B.waitForTimeout(600);
await B.goto(setupLink);
await B.waitForTimeout(1200);
await B.fill("#axPw", "brand-ui-pass-12");
await B.click("text=수락하고 시작");
// 수락 = 비밀번호 직접 설정 + 콘솔 세션 — 자기 브랜드 워크스페이스로 진입
await B.waitForFunction((slug) => document.body.innerText.includes(slug),
  SLUG, { timeout: 15000 });
const consoleText = await B.evaluate(() => document.body.innerText);
ok("링크로 비밀번호 직접 설정 → 콘솔 자기 브랜드 워크스페이스 진입",
  consoleText.includes("워크스페이스") && !consoleText.includes("브랜드 선택"));
const login = await api("POST", "/auth/login",
  { email: EMAIL, password: "brand-ui-pass-12" });
ok("설정한 비밀번호로 재로그인 성공", !!login.token);
const own = await fetch(`${API}/brands/${SLUG}/team`,
  { headers: { Authorization: "Bearer " + login.token } });
const other = await fetch(`${API}/brands/glowlab/team`,
  { headers: { Authorization: "Bearer " + login.token } });
ok("자기 브랜드만 접근(타 브랜드 403)", own.status === 200 && other.status === 403,
  `own=${own.status} other=${other.status}`);

// ── 어드민: 상태 변경 시 링크 비움 + 세션 철회 → 기존 JWT 차단 ──
await A.fill('input[placeholder^="브랜드 검색"]', SLUG);
await A.waitForTimeout(400);
await A.click('button:has-text("계정 관리")');
await A.waitForSelector(`text=${EMAIL}`, { timeout: 8000 });
await A.click('button:has-text("재설정 링크 준비")');
await A.waitForSelector("text=재설정 링크 (30분", { timeout: 8000 });
await A.click('button:has-text("세션 철회")');
await A.waitForTimeout(1500);
t = await A.evaluate(() => document.body.innerText);
ok("계정 상태 변경(세션 철회) 시 링크 표시 비움", !t.includes("reset="));
const afterRevoke = await fetch(`${API}/brands/${SLUG}/team`,
  { headers: { Authorization: "Bearer " + login.token } });
ok("세션 철회 → 기존 브랜드 JWT 즉시 차단", afterRevoke.status === 401,
  String(afterRevoke.status));
// 마지막 활성 owner 보호 — 중지 409 메시지
await A.click('button:has-text("중지")');
await A.waitForTimeout(1200);
t = await A.evaluate(() => document.body.innerText);
ok("마지막 활성 owner 중지 거부(409 안내)", t.includes("마지막 활성 소유자"));
await A.screenshot({ path: "tests_e2e/shots/admin-brand-accounts-pc.png" }).catch(() => {});

// ── 모바일 375: 폼·계정 패널 실측(가로 넘침 없음·버튼 탭 가능) ──
const M = await newPage("admin-mobile", { width: 375, height: 812 }, true);
await M.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await M.evaluate((tk) => localStorage.setItem("CONNECTION_JWT", tk), ajwt);
await M.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await M.waitForTimeout(1800);
await M.tap('text=브랜드 운영');
await M.waitForTimeout(1200);
await M.fill('input[placeholder^="브랜드 검색"]', SLUG);
await M.waitForTimeout(400);
await M.tap('button:has-text("계정 관리")');
await M.waitForSelector(`text=${EMAIL}`, { timeout: 8000 });
const mFit = await M.evaluate(() => ({
  sw: document.documentElement.scrollWidth, vw: window.innerWidth,
  btn: (() => { const b = [...document.querySelectorAll("button")]
    .find((x) => x.textContent.includes("재설정 링크 준비"));
    if (!b) return null; const r = b.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; })() }));
ok("모바일 375: 가로 넘침 없음 + 계정 액션 버튼 화면 안",
  mFit.sw <= mFit.vw + 1 && !!mFit.btn && mFit.btn.right <= 375 && mFit.btn.h >= 24,
  JSON.stringify(mFit));
await M.tap('button:has-text("재설정 링크 준비")');
await M.waitForSelector("text=재설정 링크 (30분", { timeout: 8000 });
ok("모바일: 링크 준비 플로우 동작", true);
await M.screenshot({ path: "tests_e2e/shots/admin-brand-accounts-mobile.png" }).catch(() => {});

ok("JS 에러 없음", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
