// 콘솔(brand)·어드민 워크스페이스 셸 E2E — journey 최종 플럼 팔레트 검증 +
// 전 페이지 네비·공지 게시/고정·팀·정지/재개·감사 로그 조작 + PC/모바일 캡처.
// 전부 로컬 모사 스택(외부 발송·실결제·실OAuth 없음).
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const API = "http://localhost:8765";
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b) => fetch(API + p, { method: m,
  headers: { "Content-Type": "application/json" },
  body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errors = [];
const newPage = async (tag, viewport, mobile) => {
  const ctx = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(tag + ":" + e));
  return p;
};
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

// ── 콘솔 데스크톱 1440: 플럼 셸 + 전 페이지 네비 + 공지 게시/고정 ──
const pc = await newPage("console", { width: 1440, height: 900 });
await pc.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`);
await pc.waitForTimeout(900);
await pc.click("#authChip");
await pc.fill("#axEmail", "cmo@glowlab.co");
await pc.fill("#axPw", "glowlab-pw-123");
await pc.click('button.cbt:text-is("로그인")');
await pc.waitForTimeout(1800);

const palette = await pc.evaluate(() => ({
  top: getComputedStyle(document.querySelector(".crtop")).backgroundColor,
  rail: getComputedStyle(document.querySelector(".crrail")).backgroundColor,
  side: getComputedStyle(document.querySelector(".crside")).backgroundColor,
}));
ok("플럼 탑바 #302037", palette.top === rgb("#302037"), palette.top);
ok("rail #3A2843 · 사이드 #F3EFF6",
  palette.rail === rgb("#3a2843") && palette.side === rgb("#f3eff6"),
  JSON.stringify(palette));
const t0 = await pc.evaluate(() => document.body.innerText);
ok("워크스페이스 홈(히어로 없음·업무 메뉴)", t0.includes("워크스페이스") && t0.includes("브랜드 학습")
  && t0.includes("팀") && t0.includes("월별 청구") && !t0.includes("브랜드의 다음 연결을"));

// 전 업무 페이지 순회 — 각 페이지 핵심 콘텐츠 + active 항목 색 확인
const PAGES = [["브랜드 학습", "브랜드 학습"], ["제품·캠페인", "새 캠페인 초안"],
  ["아웃리치·인박스", "브랜드 메일링"], ["팀", "소유자"], ["월별 청구", "월별 청구"]];
for (const [label, expect] of PAGES) {
  await pc.click(`.crside button:has-text("${label}")`);
  await pc.waitForTimeout(1400);
  const t = await pc.evaluate(() => document.body.innerText);
  const active = await pc.evaluate(() =>
    getComputedStyle(document.querySelector(".crside-item.active")).backgroundColor);
  ok(`사이드 네비 → ${label}`, t.includes(expect) && active === rgb("#6b5478"),
    (t.includes(expect) ? "" : "내용 없음 ") + active);
}

// 커뮤니티: 라운지 열기 → 공지 채널 게시 → 고정 → 고정됨 표시
await pc.click('.crside button:has-text("커뮤니티·DM")');
await pc.waitForTimeout(1200);
await pc.click('button:has-text("라운지 ·")');
await pc.waitForTimeout(1500);
await pc.selectOption(".wkpage select", "notice");
await pc.waitForTimeout(600);
const noticeText = "셸 검증 공지 " + Date.now();
await pc.fill(".wkpage textarea", noticeText);
await pc.click('button:has-text("공지 게시")');
await pc.waitForTimeout(2000);
let t1 = await pc.evaluate(() => document.body.innerText);
ok("공지 채널 게시(멤버 알림 안내 포함)", t1.includes(noticeText) && t1.includes("멤버 전원에게 알림"));
await pc.click(`article.cc:has-text("${noticeText}") >> button:has-text("공지 고정")`);
await pc.waitForTimeout(1800);
t1 = await pc.evaluate(() => document.body.innerText);
ok("공지 고정 → 고정됨 표시", t1.includes("고정됨") && t1.includes("고정 해제"));
await pc.screenshot({ path: "tests_e2e/shots/console-desktop.png" }).catch(() => {});

// ── 콘솔 모바일 390: 접는 메뉴(버거→드로어) + 4열 고정 하단 네비 ──
const pm = await newPage("console-mobile", { width: 390, height: 844 }, true);
await pm.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`);
await pm.waitForTimeout(900);
await pm.click("#authChip");
await pm.fill("#axEmail", "cmo@glowlab.co");
await pm.fill("#axPw", "glowlab-pw-123");
await pm.click('button.cbt:text-is("로그인")');
await pm.waitForTimeout(1800);
const mnav = await pm.evaluate(() => {
  const n = document.querySelector(".crbottomnav");
  const s = n && getComputedStyle(n);
  return n ? { display: s.display, cols: s.gridTemplateColumns.split(" ").length,
               text: n.innerText.replace(/\n/g, "/"),
               noScroll: document.documentElement.scrollWidth <= window.innerWidth + 1 } : null;
});
ok("모바일 4열 고정 네비 + 가로 넘침 없음", !!mnav && mnav.display === "grid" && mnav.cols === 4
  && mnav.noScroll, JSON.stringify(mnav));
await pm.click(".wkburger");
await pm.waitForTimeout(700);
ok("버거 → 접는 메뉴(전체 업무 메뉴)", await pm.locator('.crside.open button:has-text("팀")').isVisible());
await pm.click('.crside.open button:has-text("팀")');
await pm.waitForTimeout(1500);
const tm = await pm.evaluate(() => document.body.innerText);
ok("드로어 → 팀 화면 이동·드로어 닫힘", tm.includes("소유자") && !(await pm.locator(".crside.open").count()));
await pm.click('.crbottomnav button:has-text("커뮤니티")');
await pm.waitForTimeout(1300);
ok("하단 네비 → 커뮤니티", (await pm.evaluate(() => document.body.innerText)).includes("커뮤니티 · 담당자 DM"));
await pm.screenshot({ path: "tests_e2e/shots/console-mobile.png" }).catch(() => {});

// ── 어드민 데스크톱 1440: 플럼 전사 운영 셸 + 정지/재개 + 감사 로그 ──
// 어드민 실계정 JWT (최초 1회 bootstrap, 이후 login)
let boot = await api("POST", "/auth/bootstrap",
  { email: "ops.e2e@ex.com", password: "admin-ops-pass-1" });
if (!boot.token) boot = await api("POST", "/auth/login",
  { email: "ops.e2e@ex.com", password: "admin-ops-pass-1" });
const ajwt = boot.token;
const pa = await newPage("admin", { width: 1440, height: 900 });
await pa.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await pa.evaluate((t) => localStorage.setItem("CONNECTION_JWT", t), ajwt);
await pa.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await pa.waitForTimeout(1600);
const aTop = await pa.evaluate(() => {
  const h = document.querySelector(".wk-admin-top");
  const nav = document.querySelector("nav");
  return { top: h ? getComputedStyle(h).backgroundColor : "", text: h ? h.innerText : "",
           rail: nav ? getComputedStyle(nav).backgroundColor : "" };
});
ok("어드민 플럼 탑바(#302037·전사 운영)", aTop.top === rgb("#302037") && aTop.text.includes("전사 운영"), JSON.stringify(aTop));
ok("어드민 rail 플럼(#3A2843)", aTop.rail === rgb("#3a2843"), aTop.rail);
await pa.click('text=브랜드 관리');
await pa.waitForTimeout(1500);
// AURA(데모) 카드 → 담당자 관리 열기 → 브랜드 이용 중지(확인 단계) → 재개(확인 단계)
const demoCard = pa.locator('b:text-is("AURA")').locator("xpath=../../..");
await demoCard.locator('button:has-text("담당자 관리")').first().click();
await pa.waitForTimeout(1400);
await demoCard.locator('button:has-text("브랜드 이용 중지")').click();
await pa.waitForTimeout(500);
let ta = await pa.evaluate(() => document.body.innerText);
ok("브랜드 중지: 대상 브랜드를 보여주는 확인 단계", ta.includes("이용을 중지할까요") && ta.includes("AURA(aura)"));
await pa.fill("#suspendReason", "셸 검증 정지");
await pa.click("#confirmYes");
await pa.waitForTimeout(1600);
ta = await pa.evaluate(() => document.body.innerText);
ok("브랜드 정지 → 이용 중지됨 배지", ta.includes("이용 중지됨"));
await demoCard.locator('button:has-text("브랜드 이용 재개")').click();
await pa.waitForTimeout(500);
await pa.click("#confirmYes");
await pa.waitForTimeout(1600);
ta = await pa.evaluate(() => document.body.innerText);
ok("재개 → 운영 중 복귀", !ta.includes("브랜드 이용 재개") && ta.includes("운영 중"));
await pa.fill('input[placeholder^="무엇을"]', "BRAND_SUSPENDED");
await pa.click('button:has-text("조회")');
await pa.waitForTimeout(1300);
ta = await pa.evaluate(() => document.body.innerText);
ok("감사 로그: BRAND_SUSPENDED 기록 조회", ta.includes("BRAND_SUSPENDED") && ta.includes("aura"));
await pa.screenshot({ path: "tests_e2e/shots/admin-desktop.png" }).catch(() => {});

// ── 어드민 모바일 390 캡처(상단 랩 메뉴 유지) ──
const pam = await newPage("admin-mobile", { width: 390, height: 844 }, true);
await pam.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await pam.evaluate((t) => localStorage.setItem("CONNECTION_JWT", t), ajwt);
await pam.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await pam.waitForTimeout(1600);
await pam.click('text=브랜드 관리');
await pam.waitForTimeout(1400);
const am = await pam.evaluate(() => ({
  text: document.body.innerText,
  noScroll: document.documentElement.scrollWidth <= window.innerWidth + 1 }));
ok("어드민 모바일: 브랜드 관리 접근 + 가로 넘침 없음", am.text.includes("변경 기록") && am.noScroll);
await pam.screenshot({ path: "tests_e2e/shots/admin-mobile.png" }).catch(() => {});

ok("JS 에러 없음", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
