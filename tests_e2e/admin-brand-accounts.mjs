// 어드민 브랜드 직접 등록 + 로그인 계정 관리 E2E — 실 로컬 disposable DB,
// 실제 UI(PC 1440 / 모바일 375·390) 조작. 메일 발송·실결제 없음.
// 초보 운영자 여정: 3단계 안내 → '새 브랜드 추가'(라벨·예시·주소 미리보기·
// 국가 체크박스) → 등록 완료+다음 단계 → '담당자 관리' → '비밀번호 설정
// 링크 만들기'(버튼 클릭 시에만 표시·복사 안내) → 담당자가 링크로 직접
// 설정 → 콘솔(자기 브랜드만) → 위험 작업은 확인 단계('모든 기기에서
// 로그아웃' 포함) → 브랜드 전환 시 링크 비움 → 모바일 실측.
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

// ── PC 1440: 3단계 안내 + 등록 폼(미리보기·국가 체크박스) ──
const A = await newPage("admin", { width: 1440, height: 1000 });
await A.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await A.evaluate((t) => localStorage.setItem("CONNECTION_JWT", t), ajwt);
await A.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await A.waitForTimeout(1600);
await A.click('text=브랜드 관리');
await A.waitForTimeout(1200);
let t = await A.evaluate(() => document.body.innerText);
ok("처음 화면: 3단계 진행 안내 + '새 브랜드 추가' 주행동",
  t.includes("이렇게 진행해요") && t.includes("브랜드 추가")
  && t.includes("담당자 계정 준비") && t.includes("운영 시작"));
ok("구현 용어(slug/409/per_signup/JSON) 미노출",
  !t.includes("slug") && !t.includes("409") && !t.includes("per_signup") && !t.includes("JSON"));

await A.click("#regOpen");
await A.waitForTimeout(400);
await A.fill("#regName", "UI 등록 브랜드 " + sfx);
const suggested = await A.inputValue("#regSlug");
ok("브랜드 이름 → 주소 자동 추천", suggested.includes(sfx), suggested);
await A.fill("#regSlug", SLUG);            // 직접 수정도 가능
await A.waitForTimeout(200);
t = await A.evaluate(() => document.body.innerText);
ok("브랜드 주소 미리보기(app.theprlist.net/?brand=…)",
  t.includes(`app.theprlist.net/?brand=${SLUG}`));
await A.fill("#regCategory", "스킨케어");
await A.click('label:has-text("한국")');
await A.click('label:has-text("태국")');
await A.fill("#regEmail", EMAIL);
ok("요금 안내는 자연스러운 문구", t.includes("1명당 5,000원") && t.includes("부가세 포함"));
await A.click("#regSubmit");
await A.waitForSelector(`text=등록 완료 — ${SLUG}`, { timeout: 12000 });
t = await A.evaluate(() => document.body.innerText);
ok("등록 완료 + 다음 단계 안내(링크 만들기→복사→전달)",
  t.includes("다음 단계") && t.includes("비밀번호 설정 링크 만들기")
  && t.includes("자동으로 발송되지 않아요"));

// 중복 주소 재등록 → 명확한 인라인 오류, 입력 유지
await A.click("#regOpen");
await A.fill("#regName", "중복 확인 브랜드");
await A.fill("#regSlug", SLUG);
await A.fill("#regEmail", `dup-${sfx}@brand.example`);
await A.click("#regSubmit");
await A.waitForTimeout(1500);
t = await A.evaluate(() => document.body.innerText);
const keptSlug = await A.inputValue("#regSlug");
ok("중복 주소: 인라인 오류 + 입력 유지",
  t.includes("이미 등록된 브랜드 주소") && keptSlug === SLUG);
await A.click("#regClose");
await A.waitForTimeout(300);

// 담당자 관리 패널(등록 직후 자동 열림): 역할·비밀번호 상태 한국어 안내
await A.waitForSelector(`text=${EMAIL}`, { timeout: 8000 });
t = await A.evaluate(() => document.body.innerText);
ok("계정 목록: 소유자/담당자 설명 + 미설정 안내",
  t.includes("소유자") && t.includes("계정·팀 관리")
  && t.includes("비밀번호 아직 설정 안 됨"));
ok("링크는 버튼 클릭 전에는 표시되지 않음", !t.includes("invite="));
await A.click('button:has-text("비밀번호 설정 링크 만들기")');
await A.waitForSelector("text=비밀번호 설정 링크 (72시간", { timeout: 8000 });
const setupLink = await A.evaluate(() =>
  [...document.querySelectorAll("input[readonly]")].map((e) => e.value)
    .find((v) => v.includes("invite=")) || "");
t = await A.evaluate(() => document.body.innerText);
ok("링크 만들기 → 복사 버튼 + 직접 전달 안내(자동 발송 없음)",
  setupLink.includes("invite=") && t.includes("복사")
  && t.includes("자동 발송되지 않습니다"));

// 다른 브랜드 선택 → 링크 표시 비움 (glowlab 시드 존재, 세대 가드)
await A.fill("#brandSearch", "glowlab");
await A.waitForTimeout(400);
await A.click('button:has-text("담당자 관리")');
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

// ── 어드민: 재설정 링크 → 위험 작업(확인 단계 경유) ──
await A.fill("#brandSearch", SLUG);
await A.waitForTimeout(400);
await A.click('button:has-text("담당자 관리")');
await A.waitForSelector(`text=${EMAIL}`, { timeout: 8000 });
await A.click('button:has-text("비밀번호 재설정 링크 만들기")');
await A.waitForSelector("text=비밀번호 재설정 링크 (30분", { timeout: 8000 });
await A.click('button:has-text("관리 메뉴")');
await A.waitForTimeout(400);
await A.click('button:has-text("모든 기기에서 로그아웃")');
await A.waitForTimeout(400);
t = await A.evaluate(() => document.body.innerText);
ok("확인 단계: 대상 브랜드·이메일 명시('모든 기기에서 로그아웃')",
  t.includes("모든 기기에서 로그아웃할까요") && t.includes(EMAIL) && t.includes(SLUG));
await A.click("#confirmYes");
await A.waitForTimeout(1500);
t = await A.evaluate(() => document.body.innerText);
ok("실행 후 링크 표시 비움", !t.includes("reset="));
const afterRevoke = await fetch(`${API}/brands/${SLUG}/team`,
  { headers: { Authorization: "Bearer " + login.token } });
ok("모든 기기에서 로그아웃 → 기존 브랜드 JWT 즉시 차단", afterRevoke.status === 401,
  String(afterRevoke.status));
// 마지막 활성 소유자 보호 — 중지 시도는 확인 단계 후 409 안내
await A.click('button:has-text("계정 이용 중지")');
await A.waitForTimeout(400);
await A.click("#confirmYes");
await A.waitForTimeout(1200);
t = await A.evaluate(() => document.body.innerText);
ok("마지막 활성 소유자 중지 거부(쉬운 안내)", t.includes("마지막 활성 소유자"));
await A.screenshot({ path: "tests_e2e/shots/admin-brand-accounts-pc.png" }).catch(() => {});

// ── 모바일 375: 세로 흐름 + 44px 터치 + 링크 플로우 ──
const M = await newPage("admin-mobile", { width: 375, height: 812 }, true);
await M.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await M.evaluate((tk) => localStorage.setItem("CONNECTION_JWT", tk), ajwt);
await M.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await M.waitForTimeout(1800);
await M.tap('text=브랜드 관리');
await M.waitForTimeout(1200);
await M.fill("#brandSearch", SLUG);
await M.waitForTimeout(400);
await M.tap('button:has-text("담당자 관리")');
await M.waitForSelector(`text=${EMAIL}`, { timeout: 8000 });
const mFit = await M.evaluate(() => ({
  sw: document.documentElement.scrollWidth, vw: window.innerWidth,
  btn: (() => { const b = [...document.querySelectorAll("button")]
    .find((x) => x.textContent.includes("비밀번호 재설정 링크 만들기"));
    if (!b) return null; const r = b.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; })() }));
ok("모바일 375: 가로 넘침 없음 + 주행동 버튼 44px·화면 안",
  mFit.sw <= mFit.vw + 1 && !!mFit.btn && mFit.btn.right <= 375 && mFit.btn.h >= 44,
  JSON.stringify(mFit));
await M.tap('button:has-text("비밀번호 재설정 링크 만들기")');
await M.waitForSelector("text=비밀번호 재설정 링크 (30분", { timeout: 8000 });
ok("모바일: 링크 준비 플로우 동작", true);
await M.screenshot({ path: "tests_e2e/shots/admin-brand-accounts-mobile.png" }).catch(() => {});

// ── 모바일 390: 등록 폼 세로 흐름 + 44px 제출 버튼 ──
const M9 = await newPage("admin-m390", { width: 390, height: 844 }, true);
await M9.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await M9.evaluate((tk) => localStorage.setItem("CONNECTION_JWT", tk), ajwt);
await M9.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await M9.waitForTimeout(1800);
await M9.tap('text=브랜드 관리');
await M9.waitForTimeout(1200);
await M9.tap("#regOpen");
await M9.waitForTimeout(400);
const m9 = await M9.evaluate(() => {
  const b = document.querySelector("#regSubmit");
  const r = b && b.getBoundingClientRect();
  const labels = [...document.querySelectorAll(".wkb-field > label")].map((l) => l.textContent);
  return { sw: document.documentElement.scrollWidth, vw: window.innerWidth,
    btnH: r ? Math.round(r.height) : 0, btnRight: r ? Math.round(r.right) : 999,
    hasLabels: labels.some((x) => x.includes("브랜드 이름")) && labels.some((x) => x.includes("담당자 이메일")) };
});
ok("모바일 390: 등록 폼 라벨 지속 표시 + 44px 버튼 + 넘침 없음",
  m9.sw <= m9.vw + 1 && m9.btnH >= 44 && m9.btnRight <= 390 && m9.hasLabels,
  JSON.stringify(m9));
await M9.screenshot({ path: "tests_e2e/shots/admin-brand-accounts-m390.png" }).catch(() => {});

ok("JS 에러 없음", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
