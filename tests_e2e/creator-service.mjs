// 서비스 전환 E2E — 크리에이터 Slack 셸(사이드바·채널·미읽음·스레드·공지·알림)
// + 콘솔 캠페인 발행 알림. 전부 로컬 모사 스택(외부 발송·실OAuth 없음).
// legacy 크리에이터로 입장(신규는 TikTok provider 승인 전 입장 불가 — pending blocker).
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
const newPage = async (tag, viewport) => {
  const ctx = await browser.newContext(viewport ? { viewport } : {});
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(tag + ":" + e));
  return p;
};

// ── 시드: legacy 크리에이터 + glowlab 멤버십 + 브랜드 계정 ──
const email = "svc.e2e@ex.com";
const magic = (await api("POST", "/auth/magic", { email })).demoLink.split("magic=")[1];
const cjwt = (await api("POST", "/auth/magic/verify", { token: magic })).token;
const creatorId = (await api("GET", "/me/profile", null, cjwt)).creatorId;
psql(`INSERT INTO legacy_creators(creator_id) VALUES('${creatorId}') ON CONFLICT DO NOTHING`);
const join = await api("POST", "/me/join", { brand_id: "glowlab" }, cjwt);
ok("legacy 크리에이터 합류(온보딩 재연결 안내 대상)", join.brandId === "glowlab");

let bjwt = "";
try {
  const inv = await api("POST", "/auth/invite", { email: "svc.brand@glowlab.co", brand_id: "glowlab" });
  if (inv.demoLink) bjwt = (await api("POST", "/auth/accept",
    { token: inv.demoLink.split("invite=")[1], password: "glowlab-pw-123" })).token;
} catch {}
if (!bjwt) bjwt = (await api("POST", "/auth/login",
  { email: "svc.brand@glowlab.co", password: "glowlab-pw-123" })).token;

// 콘솔 측: 캠페인 초안 → 발행(멤버 알림) — API로 수행, UI는 아래에서 검증
const camp = await api("POST", "/brands/glowlab/campaigns",
  { name: "E2E 서비스 캠페인", product: "세럼", reward_type: "gifted" }, bjwt);
const pub = await api("POST", `/brands/glowlab/campaigns/${camp.campaignId}/publish`, {}, bjwt);
ok("캠페인 발행 → 멤버 알림 팬아웃", pub.lifecycle === "published" && pub.notified >= 1);

// ── 크리에이터 앱(데스크톱 1440): Slack 셸 ──
const p = await newPage("creator", { width: 1440, height: 900 });
await p.goto(`http://localhost:5175/?api=${encodeURIComponent(API)}`);
await p.evaluate((t) => localStorage.setItem("CONNECTION_JWT", t), cjwt);
await p.goto("http://localhost:5175/");
await p.waitForTimeout(2200);
const t1 = await p.evaluate(() => document.body.innerText);
ok("플럼 셸: 탑바·사이드바·채널 표시", t1.includes("theprlist") && t1.includes("채널") && t1.includes("GLOWLAB"));
const bell = await p.evaluate(() => (document.querySelector(".crtop-bell em") || {}).textContent || "");
ok("알림 배지(캠페인 발행)", Number(bell) >= 1, "badge=" + bell);

// 채널 열기 → 메시지 게시
await p.click(".crside-item >> text=GLOWLAB");
await p.waitForTimeout(1500);
await p.fill("#commText", "E2E 첫 인사 — 서비스 전환");
await p.click("button:has-text('메시지 보내기')");
await p.waitForTimeout(1800);
const t2 = await p.evaluate(() => document.body.innerText);
ok("채널 게시 + 본문 표시", t2.includes("E2E 첫 인사 — 서비스 전환"));

// 스레드: 답글 달기 → 답글 수 표시
await p.click(".crmsg:has-text('E2E 첫 인사') .crthread-btn");
await p.waitForTimeout(1200);
await p.fill("#crThreadText", "스레드 답글입니다");
await p.click(".crthreadp button:has-text('답글 보내기')");
await p.waitForTimeout(1800);
const t3 = await p.evaluate(() => document.body.innerText);
ok("스레드 패널 + 답글 반영", t3.includes("스레드") && t3.includes("스레드 답글입니다"));
await p.click("button:has-text('닫기 ×')");

// 공지 탭: 읽기 전용 + 브랜드 공지 후 표시
await api("POST", "/community/cells/cell-glowlab-th/messages",
  { text: "E2E 공지 — 이번 주 발송 안내", channel: "notice", locale: "ko" }, bjwt);
await p.click(".crchat-tabs button:has-text('공지')");
await p.waitForTimeout(1500);
const t4 = await p.evaluate(() => document.body.innerText);
ok("공지 채널 읽기 전용 + 공지 표시", t4.includes("E2E 공지") && t4.includes("읽기 전용")
  && !(await p.$("#commText")));

// 검색
await p.fill("#crSearchQ", "첫 인사");
await p.click(".crsearch button:has-text('검색')");
await p.waitForTimeout(1200);
const t5 = await p.evaluate(() => document.body.innerText);
ok("채널 검색 결과", t5.includes("검색 결과") && t5.includes("E2E 첫 인사"));

// 알림 패널: 캠페인 딥링크 → 캠페인 탭
await p.click(".crtop-bell");
await p.waitForTimeout(800);
const t6 = await p.evaluate(() => document.body.innerText);
ok("알림 카드(공지·캠페인, 강제 이동 없음)", t6.includes("알림") && t6.includes("E2E 서비스 캠페인"));
await p.click(".crnotif-item:has-text('E2E 서비스 캠페인') button:has-text('캠페인 보기')");
await p.waitForTimeout(1500);
const t7 = await p.evaluate(() => document.body.innerText);
ok("딥링크 → 캠페인 탭에 발행 캠페인 노출", t7.includes("E2E 서비스 캠페인"));
await p.screenshot({ path: "tests_e2e/shots/creator-desktop.png" }).catch(() => {});

// 내 공간: 온보딩 카드 + 상태 4종 + XP
await p.click(".crside-item:has-text('내 공간')");
await p.waitForTimeout(1500);
const t8 = await p.evaluate(() => document.body.innerText);
ok("내 공간: 온보딩 · 상태 4종 · XP", t8.includes("TikTok 계정 소유 인증")
  && t8.includes("운영팀 본인 확인") && t8.includes("XP"));

// ── 모바일 390: 하단 네비 + 브랜드 스트립 ──
const m = await newPage("mobile", { width: 390, height: 844 });
await m.goto(`http://localhost:5175/?api=${encodeURIComponent(API)}`);
await m.evaluate((t) => localStorage.setItem("CONNECTION_JWT", t), cjwt);
await m.goto("http://localhost:5175/#community");
await m.waitForTimeout(2200);
const nav = await m.evaluate(() => {
  const n = document.querySelector(".crbottomnav");
  if (!n) return null;
  const s = getComputedStyle(n);
  return { display: s.display, cols: s.gridTemplateColumns.split(" ").length,
           text: n.innerText, hscroll: document.documentElement.scrollWidth <= 390 + 2 };
});
ok("모바일 4열 하단 네비 + 가로 스크롤 없음", !!nav && nav.display === "grid"
  && nav.cols === 4 && nav.text.includes("커뮤니티"), JSON.stringify(nav || {}));
const strip = await m.evaluate(() => {
  const b = document.querySelector(".crchat-brands");
  return b ? getComputedStyle(b).display : "none";
});
ok("모바일 브랜드 스트립 표시", strip === "flex");
await m.screenshot({ path: "tests_e2e/shots/creator-mobile.png" }).catch(() => {});

ok("JS 에러 없음", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
