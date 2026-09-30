// 모집 실사용 경로 E2E — 운영자 CSV 등록 → 현황 → 브랜드 추천(미검증 표시)
// → 선택 → 아웃리치 프리필 → 계산서 안내·status 문구. 외부 발송/실PG 없음.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const API = "http://localhost:8765";
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m,
  headers: { "Content-Type": "application/json",
             ...(tok ? { Authorization: "Bearer " + tok } : {}) },
  body: b ? JSON.stringify(b) : undefined }).then((r) => r.json().then((j) => ({ status: r.status, j })));

import { execSync } from "node:child_process";
// 멱등: 이전 실행이 남긴 e2e 후보 제거
execSync(`PGUSER=postgres PGPASSWORD=postgres PGHOST=localhost psql -d e2e_c3 -c "DELETE FROM creator_pool WHERE handle LIKE 'e2e.%';" >/dev/null`);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errors = [];

// ── 운영자: CSV 등록 (격리 DB · example.com 가짜 도메인만) ──
const adm = (await api("POST", "/auth/login", { email: "admin.ctx@ex.com", password: "admin-ctx-pass-1" })).j.token;
const csv = "handle,email,country,platform,category,product_tags,followers\n" +
  "e2e.ploy,e2e.ploy@example.com,TH,tiktok,beauty;skincare,serum,12000\n" +
  "e2e.nok,e2e.nok@example.com,TH,tiktok,beauty,,900\n" +
  "e2e.noemail,,TH,tiktok,beauty,,10\n";
const prev = await api("POST", "/admin/pool/candidates/preview", { csv }, adm);
ok("운영자 미리보기", prev.status === 200 && prev.j.counts.insert === 3);
const imp = await api("POST", "/admin/pool/candidates", { csv }, adm);
ok("운영자 CSV 등록(중복 없음)", imp.status === 200 && imp.j.inserted === 3);
const dup = await api("POST", "/admin/pool/candidates", { csv }, adm);
ok("재등록은 전부 건너뜀(중복 방지)", dup.j.inserted === 0 && dup.j.counts.skip === 3);
const st = (await api("GET", "/admin/pool/status", null, adm)).j;
ok("현황: 후보수/추천가능/제외사유", st.total >= 3 && st.recommendable >= 2
  && st.exclusions && typeof st.exclusions.noEmail === "number", JSON.stringify(st.exclusions));

// ── 어드민 UI: 후보 풀 화면 ──
const ca = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const pa = await ca.newPage(); pa.on("pageerror", (e) => errors.push("admin:" + e));
await pa.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
await pa.waitForTimeout(1200);
const skip = pa.locator("text=키 모드로 계속");
if (await skip.count()) { await skip.click(); await pa.waitForTimeout(600); }
else { // 실로그인
  await pa.fill('input[type=email]', "admin.ctx@ex.com").catch(()=>{});
  await pa.fill('input[type=password]', "admin-ctx-pass-1").catch(()=>{});
  await pa.click('button:has-text("로그인")').catch(()=>{});
  await pa.waitForTimeout(1200);
}
await pa.click("text=후보 풀");
await pa.waitForTimeout(1200);
const ta = await pa.evaluate(() => document.body.innerText);
ok("어드민 후보 풀 화면(현황+미검증 안내)", ta.includes("추천 가능") && ta.includes("미검증"));

// ── 브랜드 콘솔: 추천 → 선택 → 아웃리치 프리필 ──
const inv = await api("POST", "/auth/invite", { email: "cand.cmo@glowlab.co", brand_id: "glowlab" });
if (inv.j.demoLink) await api("POST", "/auth/accept", { token: inv.j.demoLink.split("invite=")[1], password: "glowlab-pw-123" });
const cb = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const pb = await cb.newPage(); pb.on("pageerror", (e) => errors.push("console:" + e));
await pb.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`);
await pb.waitForTimeout(900);
await pb.click("#authChip");
await pb.fill("#axEmail", "cand.cmo@glowlab.co"); await pb.fill("#axPw", "glowlab-pw-123");
await pb.click('span.cbt:text-is("로그인")'); await pb.waitForTimeout(1500);
await pb.click('button:has-text("제품·캠페인")'); await pb.waitForTimeout(1000);
await pb.fill("#pNew", "시카 진정 세럼"); await pb.click('button:has-text("제품 등록")');
await pb.waitForTimeout(1200);
await pb.selectOption("#candidateCountry", "TH");
await pb.click('button:has-text("후보 보기")'); await pb.waitForTimeout(1500);
const t1 = await pb.evaluate(() => document.body.innerText);
ok("후보 목록: 등록 후보 + 미검증 표시", t1.includes("e2e.ploy") && t1.includes("미검증 — 발송 전 확인"));
ok("이메일 없는 후보는 담기 불가", !t1.includes("e2e.noemail") || (await pb.locator('div.cc:has-text("e2e.noemail") input[type=checkbox]').count()) === 0);
// 두 명 선택 → 초안 만들기
const boxes = pb.locator('label:has-text("아웃리치 담기") input[type=checkbox]');
await boxes.nth(0).check(); await pb.waitForTimeout(400);
await pb.locator('label:has-text("아웃리치 담기") input[type=checkbox]').nth(1).check(); await pb.waitForTimeout(400);
await pb.click('button:has-text("명으로 아웃리치 초안 만들기")');
await pb.waitForTimeout(1200);
const rec = await pb.evaluate(() => (document.getElementById("outRecipients") || {}).value || "");
const brief = await pb.evaluate(() => (document.getElementById("outBrief") || {}).value || "");
const prodSel = await pb.evaluate(() => (document.getElementById("outProduct") || {}).value || "");
ok("아웃리치 수신자 프리필(2명)", rec.split("\n").filter(Boolean).length === 2 && rec.includes("e2e.ploy@example.com"));
ok("브리프에 제품·국가·후보 컨텍스트 보존", brief.includes("시카 진정 세럼") && brief.includes("TH") && brief.includes("@e2e.ploy"));
ok("제품 선택 유지", prodSel.length > 0);
const t2 = await pb.evaluate(() => document.body.innerText);
ok("합류 링크 자동 포함 + 자동 발송 없음 안내", t2.includes("합류 링크가 자동 포함") && t2.includes("자동 발송은 없으며"));

// ── 계산서 운영 안내 + status 문구 ──
await pb.click('button:has-text("월별 청구")'); await pb.waitForTimeout(1200);
const t3 = await pb.evaluate(() => document.body.innerText);
ok("계산서 운영 안내(카드 필수 아님)", t3.includes("카드 등록은 필수가 아닙니다") && t3.includes("계산서"));
ok("계산서 발행 완료 단정 없음", !t3.includes("계산서가 발행되었습니다") && !t3.includes("발행 완료"));
await pb.evaluate(() => window.liveNav("status")); await pb.waitForTimeout(600);
const t4 = await pb.evaluate(() => document.body.innerText);
ok("status: 커뮤니티/수신이 이용 가능 흐름에 포함", t4.includes("답장 수신(인박스 동기화)") && t4.includes("크리에이터 커뮤니티·캠페인 협업"));
ok("status: 준비 중에서 커뮤니티/수신 제거", !t4.includes("크리에이터 커뮤니티·캠페인 참여, 자동 답장 수신"));

ok("JS 에러 없음", errors.length === 0, errors.join("|").slice(0, 200));
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
