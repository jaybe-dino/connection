// 크리에이터 slack-v3 실서비스 셸 E2E — 실 로컬 disposable DB(e2e_c3),
// 실제 UI 조작(PC 1440 / 모바일 375·390). 외부 메일·실결제·DNS 변경 없음.
//
// 검증 범위:
//  · 공개 진입: 브랜드 초대(?brand=) → 이메일 매직링크(실요청, 데모 링크) →
//    온보딩(국가/언어/배송/동의) → TikTok 입장 게이트(미인증 시 합류 차단,
//    인증 후 통과 — 공식 연동 승인 대기라 서버 테스트와 같은 DB 대리) →
//    브랜드 참여 → 참여 완료 → 커뮤니티.
//  · 커뮤니티: 실제 메시지 로드·게시·스레드 답글·검색·공지 읽기전용·채널
//    전환·번역 표시(언어 설정)·미읽음 배지.
//  · 캠페인: 실모집 카드 → 상세 → 신청 → 신청 완료/상태 → (브랜드 선정)
//    → 조건 합의(TikTok 핸들) → 샘플 발송(송장 표시) → Spark 코드 →
//    콘텐츠 제출(+메모는 담당자 DM으로) → 완료 기록.
//  · 알림 딥링크·모두 읽음, 랭킹·미션·배지(서버 XP), 설정(언어/계정/로그아웃).
//  · 권한 부정: 타 브랜드 랭킹/셀/캠페인 접근 차단, 미멤버 신청 차단.
//  · 원본 대조: docs/ui-reference/slack-v3 원본을 같은 뷰포트로 띄워
//    핵심 구조(탑바/레일/사이드바/채널탭/모바일네비)와 플럼 색을 비교,
//    스크린샷 세트 저장(shots/creator-slack-*).
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { execSync, spawn } from "node:child_process";

const API = "http://localhost:8765";
const APP = "http://localhost:5175";
const REF = "http://localhost:5178";
const DB = "postgresql://postgres:postgres@localhost:5432/e2e_c3";
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m,
  headers: { "Content-Type": "application/json",
             ...(tok ? { Authorization: "Bearer " + tok } : {}) },
  body: b ? JSON.stringify(b) : undefined }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    return { status: r.status, body: j };
  });
const sql = (q) => execSync(`psql "${DB}" -Atc ${JSON.stringify(q)}`).toString().trim();

// 원본 레퍼런스 정적 서버(5178)
const refServer = spawn("python3", ["-m", "http.server", "5178"],
  { cwd: "docs/ui-reference/slack-v3", stdio: "ignore" });
await new Promise((r) => setTimeout(r, 900));

const crashDump = async (e) => {
  console.log(results.join("\n"));
  console.log("CRASH:", (e && e.message || e));
  try { if (globalThis.__A) await globalThis.__A.screenshot({ path: "tests_e2e/shots/creator-slack-FAIL.png" }); } catch {}
  try {
    if (globalThis.__A) console.log("BODY:", (await globalThis.__A.evaluate(() => document.body.innerText)).slice(0, 500).replace(/\n/g, "|"));
  } catch {}
  try { refServer.kill(); } catch {}
  process.exit(1);
};
process.on("unhandledRejection", crashDump);
process.on("uncaughtException", crashDump);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errors = [];
const newPage = async (tag, viewport, mobile) => {
  const ctx = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(tag + ":" + e));
  return p;
};
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
const sfx = Date.now().toString(36);

// ── 준비(실 API): 브랜드 2곳 + 글로우랩 캠페인 1건 발행 ──
let boot = await api("POST", "/auth/bootstrap", { email: "ops.e2e@ex.com", password: "admin-ops-pass-1" });
if (!boot.body.token) boot = await api("POST", "/auth/login", { email: "ops.e2e@ex.com", password: "admin-ops-pass-1" });
const ajwt = boot.body.token;
ok("어드민 JWT", !!ajwt);
// 두 번째 브랜드 — 어드민 일반 등록 경로 재사용(격리 검증용)
const B2 = "velvet-" + sfx;
const reg = await api("POST", "/admin/brands", { name: "VELVET " + sfx, slug: B2,
  category: "스킨케어", countries: ["KR"], manager_email: `owner-${B2}@brand.example` }, ajwt);
ok("두 번째 브랜드 등록(admin)", reg.status === 200, JSON.stringify(reg.body).slice(0, 120));
// 글로우랩 콘솔 계정(기존 invite demo 흐름, 멱등)
let glogin = await api("POST", "/auth/login", { email: "cmo@glowlab.co", password: "glowlab-pw-123" });
if (!glogin.body.token) {
  const inv = await api("POST", "/auth/invite", { email: "cmo@glowlab.co", brand_id: "glowlab" });
  if (inv.body.demoLink) await api("POST", "/auth/accept",
    { token: inv.body.demoLink.split("invite=")[1], password: "glowlab-pw-123" });
  glogin = await api("POST", "/auth/login", { email: "cmo@glowlab.co", password: "glowlab-pw-123" });
}
const gjwt = glogin.body.token;
ok("글로우랩 콘솔 JWT", !!gjwt);
const deadline = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
const CNAME = "글로우 세럼 라이브 " + sfx;
const camp = await api("POST", "/brands/glowlab/campaigns",
  { name: CNAME, product: "데일리 글로우 세럼 30ml",
    usp: "세안 후 첫 단계의 가벼운 수분광 세럼 — 자연광 루틴 영상을 기다려요.",
    reward_type: "affiliate", affiliate_pct: 15, capacity: 3,
    deadline, countries: ["KR", "TH"] }, gjwt);
const CID = camp.body.campaignId;
ok("캠페인 생성(초안)", camp.status === 200 && !!CID, JSON.stringify(camp.body).slice(0, 100));

// ── PC 1440: 초대 → 로그인 → 온보딩 → TikTok 게이트 → 참여 ──
const EMAIL = `live-${sfx}@creator.example`;
const HANDLE = "live_" + sfx;
const A = await newPage("creator", { width: 1440, height: 960 });
globalThis.__A = A;
await A.goto(`${APP}/?api=${encodeURIComponent(API)}&brand=glowlab`);
await A.waitForTimeout(1600);
let t = await A.evaluate(() => document.body.innerText);
ok("초대 페이지: 실브랜드 정체성 + 참여 단계 + 혜택(원본 구성)",
  t.includes("GLOWLAB") && t.includes("초대 확인") && t.includes("멤버를 위한 캠페인 신청")
  && t.includes("브랜드 커뮤니티 참여와 캠페인 선정은 별개"));
ok("시안 전용 문구(디자인 체험/예시 데이터) 미노출",
  !t.includes("디자인 체험") && !t.includes("예시 데이터") && !t.includes("DESIGN PREVIEW"));
await A.screenshot({ path: "tests_e2e/shots/creator-slack-invite-pc.png" }).catch(() => {});
await A.click('button:has-text("초대 수락하고 시작하기")');
await A.fill("#entryEmail", EMAIL);
await A.click('button:has-text("로그인 링크 받기")');
await A.waitForSelector("text=메일함을 확인해 주세요", { timeout: 9000 });
ok("이메일 매직링크 실요청 → 메일 확인 화면", true);
const demo = await A.evaluate(() => { const a = [...document.querySelectorAll("a")]
  .find((x) => x.textContent.includes("이 링크로 로그인")); return a ? a.href : ""; });
ok("개발 모드 로그인 링크 발급", demo.includes("magic="));
await A.goto(demo);
await A.waitForSelector("text=브랜드에 나를 소개해요", { timeout: 12000 });
ok("매직 검증 → 온보딩 게이트(프로필 미완료 시 강제)", true);
await A.fill("#joinCountry", "KR");
await A.fill("#joinShip", "KR, TH");
await A.check("#joinLang_ko");
await A.fill("#joinHandle", "@" + HANDLE);
await A.check("#joinConsentTerms"); await A.check("#joinConsentPrivacy");
await A.click('button:has-text("프로필 저장하고 계속")');
await A.waitForSelector("text=입장 준비가 아직 끝나지 않았어요", { timeout: 9000 });
t = await A.evaluate(() => document.body.innerText);
ok("TikTok 신규 입장 게이트: 인증 전 합류 차단", t.includes("TikTok 계정 소유 인증"));
// 게이트 상태에서 합류 API도 차단되는지(화면 밖 우회 방지)
const myTok = await A.evaluate(() => localStorage.getItem("CONNECTION_JWT"));
const joinBlocked = await api("POST", "/me/join", { brand_id: "glowlab" }, myTok);
ok("게이트 중 서버 합류 차단", joinBlocked.status >= 400, String(joinBlocked.status));
// TikTok 공식 연동 승인 대기 — 서버 테스트와 동일한 DB 대리로 인증 완료 처리
sql(`UPDATE creator_profiles SET tiktok_owner_state='connected', tiktok_open_id='e2e-${sfx}' WHERE tiktok_handle='${HANDLE}'`);
await A.click('button:has-text("프로필·TikTok 인증으로 이동")');
await A.waitForTimeout(700);
await A.check("#joinConsentTerms"); await A.check("#joinConsentPrivacy");
await A.click('button:has-text("프로필 저장하고 계속")');
await A.waitForSelector('button:has-text("브랜드 커뮤니티 참여")', { timeout: 9000 });
await A.check(".journey-checkbox input");
await A.click('button:has-text("브랜드 커뮤니티 참여")');
await A.waitForSelector("text=GLOWLAB에서 만나요", { timeout: 9000 });
ok("브랜드 참여(실멤버십) → 참여 완료 화면", true);
await A.screenshot({ path: "tests_e2e/shots/creator-slack-welcome-pc.png" }).catch(() => {});
// 가입 완료 후 발행 — 새 멤버에게 실제 알림이 가는 순서
const pub = await api("POST", `/brands/glowlab/campaigns/${CID}/publish`, {}, gjwt);
ok("캠페인 발행(멤버 알림 포함)", pub.status === 200 && pub.body.lifecycle === "published");
const myTok2 = await A.evaluate(() => localStorage.getItem("CONNECTION_JWT"));
const myCells = await api("GET", "/community/my-cells", null, myTok2);
const gCell = (myCells.body || []).find((c) => c.kind !== "dm" && c.brandId === "glowlab");
ok("내 커뮤니티 셀 수신", !!gCell);
const noticePost = await api("POST", `/community/cells/${gCell.cellId}/messages`,
  { text: "공지: " + CNAME + " 모집을 시작했어요. 브리프를 확인해 주세요.", channel: "notice", locale: "ko" }, gjwt);
ok("브랜드 공지 실게시(콘솔 권한)", noticePost.status === 200, JSON.stringify(noticePost.body).slice(0, 80));
await A.click('button:has-text("브랜드 커뮤니티 들어가기")');
await A.waitForSelector(".slack-app", { timeout: 9000 });
await A.waitForTimeout(1500);

// ── 셸 구조·플럼 팔레트: 원본 slack-v3와 동일 ──
const shell = await A.evaluate(() => ({
  top: getComputedStyle(document.querySelector(".slack-top")).backgroundColor,
  rail: getComputedStyle(document.querySelector(".brand-rail")).backgroundColor,
  side: getComputedStyle(document.querySelector(".slack-sidebar")).backgroundColor,
  hasTabs: !!document.querySelector(".slack-channel-tabs"),
  hasMobileNav: !!document.querySelector(".slack-mobile-nav"),
  hasSearch: !!document.querySelector(".slack-search"),
}));
const refPage = await newPage("ref", { width: 1440, height: 960 });
await refPage.goto(REF + "/slack.html");
await refPage.waitForTimeout(1200);
const refShell = await refPage.evaluate(() => ({
  top: getComputedStyle(document.querySelector(".slack-top")).backgroundColor,
  rail: getComputedStyle(document.querySelector(".brand-rail")).backgroundColor,
  side: getComputedStyle(document.querySelector(".slack-sidebar")).backgroundColor,
}));
ok("플럼 셸 색 원본 일치(top/rail/side)",
  shell.top === refShell.top && shell.rail === refShell.rail && shell.side === refShell.side,
  JSON.stringify({ live: shell, ref: refShell }));
ok("원본 구조 보존: 탑검색·채널탭·모바일네비", shell.hasTabs && shell.hasMobileNav && shell.hasSearch);
await refPage.screenshot({ path: "tests_e2e/shots/creator-slack-REF-community-pc.png" }).catch(() => {});
t = await A.evaluate(() => document.body.innerText);
const tipsCollapsed = await A.evaluate(() => {
  const d = document.querySelector(".slack-sidebar details.journey-more");
  return d ? { has: d.innerText.length >= 0, tip: !!d.querySelector("button"), open: d.open } : null;
});
ok("사이드바: 실채널(공지/자유대화)+접힌 '제품·콘텐츠 더 보기'(콘텐츠팁)+랭킹·미션+실캠페인 채널+담당자 DM",
  t.includes("공지사항") && t.includes("자유대화") && t.includes("제품·콘텐츠 더 보기")
  && !!tipsCollapsed && tipsCollapsed.tip && !tipsCollapsed.open
  && t.includes("브랜드 랭킹") && t.includes("미션·배지")
  && t.includes("글로우 세럼 라이브") && t.includes("브랜드 담당자"), JSON.stringify(tipsCollapsed));
ok("원본 'UX 참고 사례/디자인 체험' 요소 → 실제 '이용 안내' 치환",
  t.includes("이용 안내") && !t.includes("UX 참고 사례") && !t.includes("디자인 체험")
  && !t.includes("예시 데이터") && !t.includes("DESIGN PREVIEW"));
await A.screenshot({ path: "tests_e2e/shots/creator-slack-community-pc.png" }).catch(() => {});

// ── 커뮤니티: 게시 → 스레드 → 검색 → 공지 읽기전용 ──
const MSG = "라이브 셸 첫 인사 " + sfx;
await A.fill("#chatDraft", MSG);
await A.click(".send-btn");
await A.waitForSelector(`text=${MSG}`, { timeout: 9000 });
ok("실메시지 게시(자유대화)", true);
await A.click(`article.message:has-text("${MSG}") >> button:has-text("스레드에 답글")`);
await A.waitForSelector("#threadReply", { timeout: 9000 });
await A.fill("#threadReply", "스레드 답글 " + sfx);
await A.click('button:has-text("답글 남기기")');
await A.waitForSelector(`.slack-panel >> text=스레드 답글 ${sfx}`, { timeout: 9000 });
ok("스레드 패널(원본 slack-panel)에 실답글", true);
await A.click('button[aria-label="스레드 닫기"]');
// 리액션 ♡ — 사람당 1개 토글(서버 집계)
await A.click(`article.message:has-text("${MSG}") >> button:has-text("♡")`);
await A.waitForSelector(`article.message:has-text("${MSG}") >> button.on:has-text("♡ 1")`, { timeout: 9000 });
const reacted = await api("GET", `/community/cells/${gCell.cellId}/messages?channel=chat`, null, myTok2);
ok("메시지 리액션 ♡ 실토글(서버 저장·내 상태 표시)",
  (reacted.body || []).some((m) => m.original === MSG && m.reactionCount === 1 && m.myReaction === true));
// 이미지 첨부 — 공개 https 주소 검증 + 렌더
await A.click('button[aria-label="이미지 첨부"]');
await A.fill("#chatImage", `https://cdn.example.com/live-${sfx}.jpg`);
await A.fill("#chatDraft", "이미지 첨부 확인 " + sfx);
await A.click(".send-btn");
await A.waitForSelector(`img.message-image[src="https://cdn.example.com/live-${sfx}.jpg"]`, { timeout: 9000 });
ok("메시지 이미지 첨부(https 검증) + 원본 message-image 렌더", true);
// 제품이야기 — 접힌 '제품·콘텐츠 더 보기' 안의 실채널
await A.click(".slack-sidebar details.journey-more summary");
await A.click('.slack-sidebar button:has-text("제품이야기")');
await A.waitForSelector("h1:has-text(\"제품 이야기\")", { timeout: 9000 });
await A.fill("#chatDraft", "제품 채널 첫 글 " + sfx);
await A.click(".send-btn");
await A.waitForSelector(`text=제품 채널 첫 글 ${sfx}`, { timeout: 9000 });
ok("제품이야기(products) 실채널 게시·조회", true);
await A.click('.slack-sidebar button:has-text("자유대화")');
await A.waitForTimeout(1200);
await A.fill('input[aria-label="이 채널에서 검색"]', MSG.slice(0, 8));
await A.click('button[aria-label="검색"]');
await A.waitForSelector("text=검색 결과", { timeout: 9000 });
t = await A.evaluate(() => document.body.innerText);
ok("채널 실검색", t.includes(MSG));
await A.click('button:has-text("닫기 ×")');
await A.click('.slack-sidebar button:has-text("공지사항")');
await A.waitForSelector(`text=${CNAME} 모집을 시작했어요`, { timeout: 9000 });
t = await A.evaluate(() => document.body.innerText);
ok("공지 채널: 브랜드 공지 수신 + 읽기 전용(스레드 안내)", t.includes("읽기 전용"));

// ── 알림: 캠페인 발행 알림 + 모두 읽음 ──
await A.waitForTimeout(5500);   // 폴링 주기 1회 — 알림 수신
await A.click('.slack-top button[aria-label^="알림"]');
await A.waitForSelector("#modalBody", { timeout: 6000 });
t = await A.evaluate(() => document.getElementById("modalBody").innerText);
ok("실알림 패널(새 캠페인·공지 알림)", t.includes("새 캠페인") || t.includes("공지"), t.slice(0, 120).replace(/\n/g, "|"));
await A.click('#modalBody button:has-text("모두 읽음 처리")').catch(() => {});
await A.click(".modal-close");

// ── 캠페인: 카드 → 상세 → 신청(아이디어는 담당자 DM으로) ──
await A.click('.slack-sidebar button:has-text("캠페인 둘러보기")');
await A.waitForSelector(".campaign-grid", { timeout: 9000 });
t = await A.evaluate(() => document.body.innerText);
ok("캠페인 목록: 실모집 카드(커미션·보상·마감)", t.includes(CNAME) && t.includes("15%"));
await A.click(`article.card:has-text("${CNAME}") >> button:has-text("캠페인 자세히 보기")`);
await A.waitForSelector(".detail-layout", { timeout: 9000 });
await A.waitForSelector("text=데일리 글로우 세럼", { timeout: 9000 });
t = await A.evaluate(() => document.body.innerText);
ok("캠페인 상세(원본 detail 레이아웃 + 실데이터)",
  t.includes("데일리 글로우 세럼") && t.includes("한국 · 태국") && t.includes(deadline),
  (t.includes("한국 · 태국") ? "" : "countries? ") + (t.includes(deadline) ? "" : "deadline? " + deadline));
await A.click('button:has-text("캠페인 신청하기")');
await A.waitForSelector("#journeyIdea", { timeout: 9000 });
await A.fill("#journeyIdea", "자연광 루틴 아이디어 " + sfx);
await A.check(".journey-checkbox input");
await A.click('button:has-text("신청하기")');
await A.waitForSelector("text=신청이 접수되었어요", { timeout: 9000 });
ok("실신청 접수 → 신청 완료 화면(접수≠선정 안내)", true);
await A.click('button:has-text("신청 상태 보기")');
await A.waitForSelector("text=브랜드가 신청을 검토하고 있어요", { timeout: 9000 });
ok("신청 상태: 검토 중", true);

// ── 브랜드 선정(콘솔 API) → 조건 합의 → 샘플 → Spark → 콘텐츠 → 완료 ──
const apps = await api("GET", `/brands/glowlab/campaigns/${CID}/applicants`, null, gjwt);
const myCreatorId = (apps.body || []).find((a) => (a.handle || "").includes(HANDLE))?.creatorId
  || (apps.body || [])[0]?.creatorId;
ok("브랜드 콘솔: 지원자 목록 수신", !!myCreatorId, JSON.stringify(apps.body).slice(0, 120));
const sel = await api("POST", `/brands/glowlab/campaigns/${CID}/select`,
  { creator_id: myCreatorId, commission_pct: 15 }, gjwt);
ok("브랜드 선정 + 수수료 제안", sel.status === 200 && sel.body.state === "selected");
await A.click('.slack-sidebar button:has-text("내 할 일")');
await A.waitForSelector("text=선정되었어요", { timeout: 12000 });
t = await A.evaluate(() => document.body.innerText);
ok("내 협업: 선정 카드(다음 할 일) + 진행 단계 표시", t.includes("조건 확인 필요") && t.includes("확인할 일"));
await A.click('button:has-text("협업 열기")');
await A.waitForSelector("#agreeHandle", { timeout: 9000 });
t = await A.evaluate(() => document.body.innerText);
ok("협업 상세: 제안 커미션 15% + 합의 폼 + 협업 기록", t.includes("15%") && t.includes("협업 기록"));
await A.screenshot({ path: "tests_e2e/shots/creator-slack-collab-pc.png" }).catch(() => {});
await A.check(".journey-checkbox input");
await A.click('button:has-text("수수료 합의 — 확정하기")');
await A.waitForSelector("text=샘플 발송을 기다려 주세요", { timeout: 9000 });
ok("조건 합의 → terms_agreed(확정 수수료)", true);
// 샘플 수령 정보(원본 address 단계) — 당사자(브랜드 담당자)에게만 전달
await A.waitForSelector("#shipRecipient", { timeout: 9000 });
await A.fill("#shipRecipient", "라이브 수령인");
await A.fill("#shipCountry", "KR");
await A.fill("#shipAddress", "서울시 테스트로 77");
await A.fill("#shipPhone", "010-7777-" + sfx.slice(0, 4));
await A.check("#shipConsent");
await A.click('button:has-text("수령 정보 저장")');
await A.waitForSelector("text=저장됨: 라이브 수령인", { timeout: 9000 });
const shipSeen = await api("GET", `/brands/glowlab/campaigns/${CID}/applicants`, null, gjwt);
ok("수령 정보: 크리에이터 저장 → 해당 브랜드 콘솔에서만 조회",
  (shipSeen.body || []).some((a) => a.shipping && a.shipping.address === "서울시 테스트로 77"));
const ship = await api("POST",
  `/brands/glowlab/campaigns/${CID}/terms/${myCreatorId}/sample-shipped`,
  { tracking: "CJ-" + sfx }, gjwt);
ok("브랜드 샘플 발송(송장)", ship.status === 200 && ship.body.state === "sample_shipped");
await A.click('button:has-text("협업 열기")').catch(() => {});
await A.waitForSelector(`text=CJ-${sfx}`, { timeout: 12000 });
ok("샘플 송장 실표시", true);
// 실패해도 입력이 사라지지 않는다(폼 보존) — 첫 요청만 차단
let sparkBlocked = false;
await A.context().route("**/spark-code", (route) => {
  if (sparkBlocked) return route.continue();
  sparkBlocked = true; route.abort();
});
await A.fill("#sparkCode", "SPARK-" + sfx);
await A.click('button:has-text("코드 제출")');
await A.waitForTimeout(1500);
const sparkKept = await A.evaluate(() => (document.getElementById("sparkCode") || {}).value);
ok("제출 실패 시 Spark 입력 값 보존(재렌더에도 유지)", sparkKept === "SPARK-" + sfx, sparkKept);
await A.click('button:has-text("코드 제출")');
await A.waitForTimeout(1500);
await A.context().unroute("**/spark-code");
const sparkSaved = await api("GET", "/me/campaign-offers", null, myTok);
ok("Spark 코드 서버 저장(브랜드 전용·커뮤니티 비노출)",
  (sparkSaved.body || []).some((o) => o.sparkCode === "SPARK-" + sfx));
await A.click('button:has-text("콘텐츠 제출하기")');
await A.waitForSelector("#journeyContent", { timeout: 9000 });
await A.fill("#journeyContent", `https://www.tiktok.com/@${HANDLE}/video/${sfx}`);
await A.fill("#journeyMemo", "첫 장면에 제품명 강조했어요 " + sfx);
await A.check(".journey-checkbox input");
let dmBlocked = false;
await A.context().route("**/community/dm/glowlab", (route) => {
  if (dmBlocked) return route.continue();
  dmBlocked = true; route.abort();
});
await A.click('button:has-text("콘텐츠 제출")');
await A.waitForSelector("text=브랜드가 콘텐츠를 검토하고 있어요", { timeout: 12000 });
await A.context().unroute("**/community/dm/glowlab");
const partialToast = await A.evaluate(() => document.getElementById("toast").innerText);
const stashedDraft = await A.evaluate(() =>
  Object.values(store.drafts).find((v) => String(v).includes("[콘텐츠 제출 메모]")) || "");
ok("콘텐츠 제출 성공 + 메모 전달 실패의 부분 성공 안내(완료 오인 없음)",
  partialToast.includes("초안으로 보관"), partialToast.slice(0, 80));
ok("실패한 메모는 담당자 DM 초안으로 보관(재제출 불필요)",
  stashedDraft.includes(sfx), stashedDraft.slice(0, 60));

// ── 브랜드 수정 요청 → 수정본 제출 → 완료 ──
const rev = await api("POST",
  `/brands/glowlab/campaigns/${CID}/terms/${myCreatorId}/request-revision`,
  { note: "첫 장면에 제품명을 더 크게 보여주세요 " + sfx }, gjwt);
ok("브랜드 수정 요청(콘솔 액션)", rev.status === 200 && rev.body.state === "revision_requested");
await A.click('.slack-sidebar button:has-text("내 할 일")');
await A.waitForSelector("text=담당자가 수정을 요청했어요", { timeout: 15000 });
await A.click('button:has-text("협업 열기")');
await A.waitForSelector(".revision-note", { timeout: 9000 });
t = await A.evaluate(() => document.body.innerText);
ok("수정 요청 단계(원본 revision-note): 피드백·이전 제출 표시",
  t.includes("제품명을 더 크게") && t.includes("이전 제출"));
await A.click('button:has-text("수정본 제출")');
await A.waitForSelector("#journeyContent", { timeout: 9000 });
t = await A.evaluate(() => document.body.innerText);
ok("수정본 제출 화면: 요청 내용 함께 표시", t.includes("제품명을 더 크게"));
await A.fill("#journeyContent", `https://www.tiktok.com/@${HANDLE}/video/${sfx}v2`);
await A.check(".journey-checkbox input");
await A.click('button:has-text("수정본 제출")');
await A.waitForSelector("text=브랜드가 콘텐츠를 검토하고 있어요", { timeout: 12000 });
const resub = await api("GET", "/me/campaign-offers", null, myTok);
ok("수정본 재제출 → 요청 해소·content_submitted 복귀",
  (resub.body || []).some((o) => o.campaignId === CID
    && o.state === "content_submitted" && !o.revisionNote
    && (o.contentUrl || "").endsWith(sfx + "v2")));
const comp = await api("POST",
  `/brands/glowlab/campaigns/${CID}/terms/${myCreatorId}/complete`, {}, gjwt);
ok("브랜드 완료 처리", comp.status === 200 && comp.body.state === "completed");
await A.click('.slack-sidebar button:has-text("내 할 일")');
await A.waitForSelector(".work-list, .tabs", { timeout: 12000 });
await A.click('.tabs button:has-text("완료")');
await A.waitForSelector("text=협업을 완료했어요", { timeout: 12000 });
await A.click('button:has-text("완료 기록 보기")').catch(() => {});
await A.waitForTimeout(1200);
t = await A.evaluate(() => document.body.innerText);
ok("완료 기록: 확정 수수료·제출 콘텐츠·Spark 보존",
  t.includes("15%") && t.includes(`tiktok.com/@${HANDLE}`) && t.includes("Spark 코드 제출됨"));

// ── 랭킹·미션·배지(서버 XP) ──
await A.click('button:has-text("나의 배지 보기")').catch(async () => { await A.evaluate(() => navigate("achievements")); });
await A.waitForSelector(".growth-overview", { timeout: 9000 });
await A.waitForSelector("text=달성한 미션", { timeout: 12000 });
t = await A.evaluate(() => document.body.innerText);
ok("미션: 서버 검증 이벤트 달성(합류/신청/합의/제출/완료)",
  t.includes("달성한 미션") && t.includes("Level"));
await A.click('button:has-text("브랜드 랭킹")');
await A.waitForSelector(".ranking-table", { timeout: 9000 });
await A.click('.tabs button:has-text("이번 주")');
await A.waitForSelector(".ranking-row.is-me", { timeout: 9000 });
const weekMe = await A.evaluate(() => document.querySelector(".ranking-row.is-me").innerText.replace(/\n/g, " "));
ok("주간 랭킹 탭(최근 7일 실집계) — '나' 행 표시", /\d{2,}/.test(weekMe), weekMe.slice(0, 60));
await A.click('.tabs button:has-text("전체 기록")');
await A.waitForTimeout(600);
t = await A.evaluate(() => document.body.innerText);
const meRow = await A.evaluate(() => { const r = document.querySelector(".ranking-row.is-me");
  return r ? r.innerText.replace(/\n/g, " ") : ""; });
ok("브랜드 랭킹: '나' 행 강조 + XP 집계", meRow.includes("나") && /\d{2,}/.test(meRow), meRow.slice(0, 80));
await A.screenshot({ path: "tests_e2e/shots/creator-slack-ranking-pc.png" }).catch(() => {});

// ── DM: 신청 아이디어·콘텐츠 메모가 담당자 DM에 전달됨 ──
await A.evaluate(() => navigate("messages"));
await A.waitForTimeout(800);
await A.click('.dm-item >> nth=0');
await A.waitForTimeout(1800);
t = await A.evaluate(() => document.body.innerText);
const dmDraftNow = await A.evaluate(() => (document.getElementById("chatDraft") || {}).value || "");
ok("담당자 DM: 신청 아이디어 실전달 + 보관된 제출 메모 초안 복원",
  t.includes("캠페인 신청 아이디어") && dmDraftNow.includes("[콘텐츠 제출 메모]"),
  dmDraftNow.slice(0, 50));
await A.click(".send-btn");
await A.waitForSelector("text=[콘텐츠 제출 메모]", { timeout: 9000 });
ok("보관 초안 재전송 → 담당자 DM에 메모 실전달(중복 제출 없이)", true);

// ── 설정: 언어 변경·계정·로그아웃 + 권한 부정 ──
await A.evaluate(() => navigate("settings"));
await A.waitForTimeout(700);
await A.click('.setting-nav button:has-text("언어·번역")');
await A.selectOption("#langSelect", "th");
await A.waitForTimeout(500);
t = await A.evaluate(() => document.body.innerText);
ok("대화 언어 변경(5개 언어·실저장)", t.includes("ไทย"));
await A.selectOption("#langSelect", "ko");
await A.click('.setting-nav button:has-text("알림")');
await A.waitForSelector('button.toggle', { timeout: 9000 });
t = await A.evaluate(() => document.body.innerText);
ok("알림 설정: 원본 토글 4종 + 적용 범위 정직 표기",
  t.includes("담당자 메시지") && t.includes("캠페인·선정 소식")
  && t.includes("연결 준비 중"));
await A.click('button[aria-label="캠페인·선정 소식"]');
await A.waitForTimeout(1200);
const prefsOff = await api("GET", "/me/notification-prefs", null, myTok);
ok("알림 설정 실저장(campaign off)", prefsOff.body.prefs && prefsOff.body.prefs.campaign === false,
  JSON.stringify(prefsOff.body.prefs));
await A.click('button[aria-label="캠페인·선정 소식"]');
await A.waitForTimeout(1200);
const prefsOn = await api("GET", "/me/notification-prefs", null, myTok);
ok("알림 설정 실저장(campaign on 복귀)", prefsOn.body.prefs && prefsOn.body.prefs.campaign === true);
await A.click('.setting-nav button:has-text("계정·연결")');
await A.waitForTimeout(400);
t = await A.evaluate(() => document.body.innerText);
ok("계정 탭: 실이메일·TikTok 인증 상태", t.includes(EMAIL) && t.includes("인증됨"));
// 권한 부정: 타 브랜드(velvet) 자원 접근 차단
const otherRank = await api("GET", `/brands/${B2}/ranking`, null, myTok);
const otherCells = await api("GET", "/community/my-cells", null, myTok);
const hasOther = (otherCells.body || []).some((c) => c.brandId === B2);
ok("권한 부정: 타 브랜드 랭킹 403 + 셀 목록 비노출",
  otherRank.status === 403 && !hasOther, `rank=${otherRank.status}`);
const dmOther = await api("POST", `/community/dm/${B2}`, {}, myTok);
ok("권한 부정: 미가입 브랜드 담당자 DM 차단", dmOther.status >= 400, String(dmOther.status));

// ── 모바일 375: 진입·채널 드로어·하단 네비·가로 넘침 ──
const M = await newPage("mobile375", { width: 375, height: 812 }, true);
await M.goto(demo.replace("magic=", "x="));   // 세션 없는 초기 화면 → 로그인
await M.waitForTimeout(1200);
const mTok = myTok;
await M.evaluate((tk) => localStorage.setItem("CONNECTION_JWT", tk), mTok);
await M.goto(`${APP}/?api=${encodeURIComponent(API)}#community`);
await M.waitForTimeout(2200);
const m1 = await M.evaluate(() => ({
  sw: document.documentElement.scrollWidth, vw: window.innerWidth,
  nav: !!document.querySelector(".slack-mobile-nav"),
  navH: document.querySelector(".slack-mobile-nav") ?
    Math.round(document.querySelector(".slack-mobile-nav").getBoundingClientRect().height) : 0 }));
ok("모바일 375: 가로 넘침 없음 + 하단 탭(원본 slack-mobile-nav)",
  m1.sw <= m1.vw + 1 && m1.nav, JSON.stringify(m1));
await M.tap('.slack-mobile-nav button:has-text("채널")');
await M.waitForTimeout(700);
const drawer = await M.evaluate(() => !!document.querySelector(".slack-sidebar.mobile-open"));
ok("모바일: 채널 드로어 열림(원본 mobile-open)", drawer);
await M.tap('.slack-sidebar.mobile-open button:has-text("자유대화")');
await M.waitForTimeout(1500);
t = await M.evaluate(() => document.body.innerText);
ok("모바일: 실대화 로드 + 작성창", t.includes(MSG));
await M.screenshot({ path: "tests_e2e/shots/creator-slack-community-375.png" }).catch(() => {});
await M.tap('.slack-mobile-nav button:has-text("내 협업")');
await M.waitForTimeout(1500);
const m2 = await M.evaluate(() => ({
  sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
ok("모바일 375: 내 협업 세로 흐름(넘침 없음)", m2.sw <= m2.vw + 1, JSON.stringify(m2));
await M.screenshot({ path: "tests_e2e/shots/creator-slack-work-375.png" }).catch(() => {});

// 원본 375 대조 캡처
const refM = await newPage("ref375", { width: 375, height: 812 }, true);
await refM.goto(REF + "/slack.html#work");
await refM.waitForTimeout(1500);
await refM.screenshot({ path: "tests_e2e/shots/creator-slack-REF-work-375.png" }).catch(() => {});

// ── 모바일 390: 캠페인 목록·초대 페이지 ──
const M9 = await newPage("mobile390", { width: 390, height: 844 }, true);
await M9.evaluate(() => {});
await M9.goto(`${APP}/?api=${encodeURIComponent(API)}&brand=glowlab`);
await M9.waitForTimeout(1600);
const m9a = await M9.evaluate(() => ({
  sw: document.documentElement.scrollWidth, vw: window.innerWidth,
  cta: (() => { const b = [...document.querySelectorAll("button")]
    .find((x) => x.textContent.includes("초대 수락하고 시작하기"));
    if (!b) return null; const r = b.getBoundingClientRect();
    return { h: Math.round(r.height), right: Math.round(r.right) }; })() }));
ok("모바일 390: 초대 공개 페이지(넘침 없음·CTA 탭 가능)",
  m9a.sw <= m9a.vw + 1 && !!m9a.cta && m9a.cta.right <= 390 && m9a.cta.h >= 36,
  JSON.stringify(m9a));
await M9.screenshot({ path: "tests_e2e/shots/creator-slack-invite-390.png" }).catch(() => {});
await M9.evaluate((tk) => localStorage.setItem("CONNECTION_JWT", tk), mTok);
await M9.goto(`${APP}/?api=${encodeURIComponent(API)}#campaigns`);
await M9.waitForTimeout(2200);
const m9b = await M9.evaluate(() => ({
  sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
ok("모바일 390: 캠페인 목록 넘침 없음", m9b.sw <= m9b.vw + 1, JSON.stringify(m9b));
await M9.screenshot({ path: "tests_e2e/shots/creator-slack-campaigns-390.png" }).catch(() => {});

// ── 로그아웃 → 공개 로그인 화면 복귀 ──
await A.evaluate(() => authLogout());
await A.waitForSelector("text=이메일로 시작하세요", { timeout: 9000 });
ok("로그아웃 → 공개 로그인 화면", true);

ok("JS 에러 없음", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
refServer.kill();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
