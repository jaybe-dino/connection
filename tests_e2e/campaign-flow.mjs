// 캠페인 전체 여정 E2E(실 로컬 DB 스택, mock 없음) — 콘솔 초안 입력 →
// 다른 세션 메시지로 폴링 렌더 발생 중 복수 필드 보존 → 저장 실패시 입력
// 유지 → 초안 저장(422 회귀) → 발행 → 다른 크리에이터 UI 신청 → 지원자
// 선정까지. P1: campCreate가 render 뒤 DOM을 읽어 빈 payload를 보내던
// 회귀와 폼 초안 소실 회귀를 실브라우저로 고정한다.
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
async function legacyCreator(email) {
  const magic = (await api("POST", "/auth/magic", { email })).demoLink.split("magic=")[1];
  const jwt = (await api("POST", "/auth/magic/verify", { token: magic })).token;
  const creatorId = (await api("GET", "/me/profile", null, jwt)).creatorId;
  psql(`INSERT INTO legacy_creators(creator_id) VALUES('${creatorId}') ON CONFLICT DO NOTHING`);
  // 국가 조건 캠페인(KR,TH) 적격이 되도록 프로필(국가/배송) 재연결
  await api("PUT", "/me/profile", { country: "KR", languages: ["ko"],
    ship_countries: ["KR"], consent_terms: true, consent_privacy: true }, jwt);
  await api("POST", "/me/join", { brand_id: "glowlab" }, jwt);
  return { jwt, creatorId };
}
const sender = await legacyCreator("flow.sender@ex.com");   // 폴링 유발용
const applicant = await legacyCreator("flow.applicant@ex.com"); // 신청자
const gjwt = (await api("POST", "/auth/login",
  { email: "cmo@glowlab.co", password: "glowlab-pw-123" })).token;

// ── 콘솔: 제품·캠페인에서 실제 타이핑으로 초안 작성 ──
const C = await newPage("console");
await C.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`);
await C.waitForTimeout(900);
await C.click("#authChip");
await C.fill("#axEmail", "cmo@glowlab.co");
await C.fill("#axPw", "glowlab-pw-123");
await C.click('button.cbt:text-is("로그인")');
await C.waitForTimeout(1800);
await C.click('.crside button:has-text("제품·캠페인")');
await C.waitForTimeout(1400);
await C.evaluate(() => { window.__navMarker = 7; });

const NAME = "플로우 캠페인 " + Date.now();
await C.fill("#campName", NAME);
await C.fill("#campProduct", "플로우 세럼 30ml");
await C.fill("#campUsp", "비건 인증 — 2주 사용 후기 영상");
await C.fill("#campPct", "10");
await C.fill("#campDeadline", "2026-11-30");
await C.fill("#campCountries", "KR, TH");
await C.focus("#campUsp");

// ── 다른 세션 메시지 → 미읽음 변경 → 폴링 softRender 발생 대기 ──
await api("POST", "/community/cells/cell-glowlab-th/messages",
  { text: "폴링 유발 메시지 " + Date.now(), locale: "ko" }, sender.jwt);
await C.waitForFunction(() => {
  const em = document.querySelector('.crside-item em');
  return !!em; // 커뮤니티 메뉴 미읽음 배지 = 폴링 렌더가 실제 발생함
}, { timeout: 20000 });
const fields = await C.evaluate(() => ({
  marker: window.__navMarker,
  name: document.getElementById("campName").value,
  product: document.getElementById("campProduct").value,
  usp: document.getElementById("campUsp").value,
  pct: document.getElementById("campPct").value,
  deadline: document.getElementById("campDeadline").value,
  countries: document.getElementById("campCountries").value,
  focus: document.activeElement && document.activeElement.id,
}));
ok("폴링 렌더 발생(미읽음 배지) 중 새로고침 없음", fields.marker === 7);
ok("폴링 렌더 후 복수 입력 필드 전부 보존",
  fields.name === NAME && fields.product === "플로우 세럼 30ml"
  && fields.usp.includes("비건") && fields.pct === "10"
  && fields.deadline === "2026-11-30" && fields.countries === "KR, TH",
  JSON.stringify(fields));
ok("폴링 렌더 후 포커스 보존(campUsp)", fields.focus === "campUsp", String(fields.focus));

// ── 저장 실패(서버 400) 시 입력 유지 ──
await C.fill("#campDeadline", "2026-13-99");
await C.click('button:has-text("초안 저장")');
await C.waitForTimeout(1800);
const afterFail = await C.evaluate(() => ({
  name: document.getElementById("campName").value,
  pct: document.getElementById("campPct").value,
  deadline: document.getElementById("campDeadline").value,
}));
ok("저장 실패(잘못된 마감일 400) 후에도 입력 유지",
  afterFail.name === NAME && afterFail.pct === "10" && afterFail.deadline === "2026-13-99",
  JSON.stringify(afterFail));

// ── 초안 저장(과거 P1: 빈 payload 422) → 성공 + 폼 비움 ──
await C.fill("#campDeadline", "2026-11-30");
await C.click('button:has-text("초안 저장")');
await C.waitForTimeout(2200);
let t = await C.evaluate(() => document.body.innerText);
ok("초안 저장 성공(422 회귀 없음)", t.includes("캠페인 초안이 저장됐어요") && t.includes(NAME));
const cleared = await C.evaluate(() => document.getElementById("campName").value);
ok("저장 성공 후 초안 폼 비움(재노출 없음)", cleared === "");
const camps = await api("GET", "/brands/glowlab/campaigns", null, gjwt);
const camp = camps.find((c) => c.name === NAME);
ok("DB에 draft로 저장 + 입력값 반영",
  !!camp && camp.lifecycle === "draft" && camp.deadline === "2026-11-30"
  && camp.affiliatePct === 10 && camp.countries.join(",") === "KR,TH",
  JSON.stringify(camp || {}));

// ── 발행 ──
await C.click(`p:has-text("${NAME}") >> span:has-text("발행")`);
await C.waitForTimeout(2000);
t = await C.evaluate(() => document.body.innerText);
ok("발행 → 멤버 알림 안내 + 발행됨 상태", t.includes("캠페인 발행 완료") && t.includes("발행됨"));

// ── 다른 크리에이터가 UI로 신청 ──
const A = await newPage("applicant");
await A.goto(`http://localhost:5175/?api=${encodeURIComponent(API)}`);
await A.evaluate((tk) => localStorage.setItem("CONNECTION_JWT", tk), applicant.jwt);
await A.goto("http://localhost:5175/#campaigns");
await A.waitForTimeout(2300);
await A.evaluate(() => { window.__navMarker = 9; });
await A.click(`article:has-text("${NAME}") >> button:has-text("조건 및 상세 보기")`);
await A.waitForTimeout(800);
await A.click('dialog button:has-text("이 캠페인에 신청하기")');
await A.waitForTimeout(2000);
let applicants = await api("GET",
  `/brands/glowlab/campaigns/${camp.campaignId}/applicants`, null, gjwt);
const row = applicants.find((a) => a.creatorId === applicant.creatorId);
ok("크리에이터 UI 신청 → 서버 applied 저장", !!row && row.status === "applied",
  JSON.stringify(row || {}));

// ── 콘솔: 지원자 보기 → 선정 + 수수료 제안 ──
await C.click(`p:has-text("${NAME}") >> span:has-text("지원자 보기")`);
await C.waitForTimeout(1600);
await C.fill(`#sel_${applicant.creatorId}`, "12.5");
await C.click(`div:has(> b:text-is("@${row.handle}")) >> span:has-text("선정 + 수수료 제안")`).catch(async () => {
  await C.click('span:has-text("선정 + 수수료 제안")');
});
await C.waitForTimeout(2000);
t = await C.evaluate(() => document.body.innerText);
ok("선정 → 합의 대기 표시", t.includes("합의 대기") || t.includes("선정 완료"));
applicants = await api("GET",
  `/brands/glowlab/campaigns/${camp.campaignId}/applicants`, null, gjwt);
const sel = applicants.find((a) => a.creatorId === applicant.creatorId);
ok("서버 termsState=selected + 제안 수수료 12.5%",
  !!sel && sel.termsState === "selected" && sel.commissionPct === 12.5,
  JSON.stringify(sel || {}));

// ── (보완1) 선정 직후: A가 '내 협업' 탭 전환만으로 최신 조건 표시 ──
await A.click('.crside-item:has-text("내 협업")');
await A.waitForSelector(`#ofHandle_${camp.campaignId}`, { timeout: 15000 });  // 이 캠페인의 선정 카드
const freshA = await A.evaluate((n) => ({ marker: window.__navMarker,
  card: [...document.querySelectorAll(".cc")].map(e => e.innerText).find(t => t.includes(n)) || "" }), NAME);
ok("선정 반영: 탭 전환만으로 12.5% 제안 표시(전체 reload 없음)",
  freshA.marker === 9 && freshA.card.includes("12.5"), freshA.card.slice(0, 120));

// ── (보완2) 캠페인 상세: 서버 저장 usp/보상 유형/대상 국가/마감 표시 ──
await A.click('.crside-item:has-text("캠페인")');
await A.waitForTimeout(1600);
await A.click(`article:has-text("${NAME}") >> button:has-text("조건 및 상세 보기")`);
await A.waitForTimeout(700);
const dlg = await A.evaluate(() => (document.querySelector("dialog") || {}).innerText || "");
ok("상세 다이얼로그: usp·보상 유형·대상 국가·마감 표시",
  dlg.includes("비건 인증 — 2주 사용 후기 영상") && dlg.includes("어필리에이트 커미션")
  && dlg.includes("KR, TH") && dlg.includes("2026-11-30"), dlg.slice(0, 180));
await A.click('dialog button:has-text("내 협업 확인")');
await A.waitForTimeout(1600);

// ── 합의(수수료 12.5%) ──
await A.fill(`#ofHandle_${camp.campaignId}`, "@flow.applicant");
await A.click(`.cc:has(#ofHandle_${camp.campaignId}) >> button:has-text("수수료 합의")`);
await A.waitForTimeout(2000);

// ── 콘솔: 송장 기록 ──
await C.click(`p:has-text("${NAME}") >> span:has-text("지원자 보기")`);
await C.waitForTimeout(1600);
await C.fill(`#shp_${applicant.creatorId}`, "1Z-FLOW-999");
await C.click('span:has-text("샘플 발송")');
await C.waitForTimeout(1800);

// ── (보완1 재확인) 크리에이터 탭 재진입만으로 송장 반영 후 콘텐츠 먼저 제출 ──
await A.click('.crside-item:has-text("캠페인")');
await A.waitForTimeout(500);
await A.click('.crside-item:has-text("내 협업")');
await A.waitForSelector("text=1Z-FLOW-999", { timeout: 15000 });
await A.fill(`#ofUrl_${camp.campaignId}`, "https://www.tiktok.com/@flow/video/1");
await A.click(`.cc:has(#ofUrl_${camp.campaignId}) >> span:has-text("콘텐츠 제출")`);
await A.waitForTimeout(2000);

// ── (보완3) 콘텐츠 제출 '후' Spark 코드 등록 가능 ──
await A.waitForSelector(`#ofSpark_${camp.campaignId}`, { timeout: 12000 });
await A.fill(`#ofSpark_${camp.campaignId}`, "SPARK-LATE-77");
await A.click(`.cc:has(#ofSpark_${camp.campaignId}) >> span:has-text("코드 제출")`);
await A.waitForTimeout(1800);
let late = await api("GET",
  `/brands/glowlab/campaigns/${camp.campaignId}/applicants`, null, gjwt);
const lr = late.find((a) => a.creatorId === applicant.creatorId);
ok("콘텐츠 제출 후 Spark 코드 등록(서버 저장·커뮤니티 비노출)",
  !!lr && lr.termsState === "content_submitted" && lr.sparkCode === "SPARK-LATE-77",
  JSON.stringify(lr || {}));

// ── 콘솔: 콘텐츠 + Spark '원문' 조회/복사 → 완료 처리 ──
await C.click(`p:has-text("${NAME}") >> span:has-text("지원자 보기")`);
await C.waitForTimeout(1600);
const ct = await C.evaluate(() => document.body.innerText);
ok("콘솔: 제출 콘텐츠 + Spark 수령 ✓ 표시",
  ct.includes("tiktok.com/@flow/video/1") && ct.includes("Spark 코드 ✓"));
const sparkField = await C.evaluate((cid) => {
  const el = document.getElementById("spark_" + cid);
  return el ? { value: el.value, readOnly: el.readOnly,
    copyBtn: !!el.parentElement.querySelector("span.cbt") } : null;
}, applicant.creatorId);
ok("콘솔: Spark 코드 원문 readonly 표시 + 복사 버튼",
  !!sparkField && sparkField.value === "SPARK-LATE-77" && sparkField.readOnly
  && sparkField.copyBtn, JSON.stringify(sparkField));
// 크리에이터 공개 커뮤니티에는 코드 원문 비노출
await A.click('.crside-item >> text=GLOWLAB');
await A.waitForTimeout(1800);
const commText = await A.evaluate(() => document.body.innerText);
ok("공개 커뮤니티에 Spark 코드 원문 비노출", !commText.includes("SPARK-LATE-77"));
await A.click('.crside-item:has-text("내 협업")');
await A.waitForTimeout(800);
await C.click('span:has-text("완료 처리")');
await C.waitForTimeout(2000);
// ── 완료 후에도 기록(확정 수수료/송장/콘텐츠/코드 원문) 조회 가능 ──
await C.click(`p:has-text("${NAME}") >> span:has-text("지원자 보기")`);
await C.waitForTimeout(1600);
const doneRecord = await C.evaluate((cid) => ({
  t: document.body.innerText,
  spark: (document.getElementById("spark_" + cid) || {}).value || "" }), applicant.creatorId);
ok("완료 후 기록 보존: 확정 수수료·송장·콘텐츠 링크·Spark 원문",
  doneRecord.t.includes("12.5%") && doneRecord.t.includes("1Z-FLOW-999")
  && doneRecord.t.includes("tiktok.com/@flow/video/1")
  && doneRecord.spark === "SPARK-LATE-77",
  doneRecord.spark || "no-spark");

// ── 완료 반영: 탭 전환만으로 협업 완료 표시 ──
await A.click('.crside-item:has-text("캠페인")');
await A.waitForTimeout(500);
await A.click('.crside-item:has-text("내 협업")');
await A.waitForSelector(`.cc:has-text("${NAME}"):has-text("협업 완료")`, { timeout: 15000 });
const doneA = await A.evaluate((n) => ({ marker: window.__navMarker,
  card: [...document.querySelectorAll(".cc")].map(e => e.innerText).find(t => t.includes(n)) || "" }), NAME);
ok("완료 반영: 탭 전환만으로 완료 + 확정 수수료 표시(전체 reload 없음)",
  doneA.marker === 9 && doneA.card.includes("12.5") && doneA.card.includes("협업 완료"), doneA.card.slice(0, 120));

ok("JS 에러 없음", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
