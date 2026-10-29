// 합의 정확성 E2E — 실 로컬 API·DB, 실브라우저(크리에이터 앱 + 브랜드 콘솔).
// GET 한 100 USD 조건 → 브랜드가 200 KRW 로 변경 → 옛 화면에서 합의 클릭 시 거절(409)·새 조건 재확인
// → 최신 조건으로 합의 → 브랜드가 다시 수정 → 크리에이터 상세·보상, 브랜드 지원자 화면 모두 확정 스냅샷 유지.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";

const API = process.env.API_URL || "http://localhost:8765";
const APP = process.env.APP_URL || "http://localhost:5175";
const CON = process.env.CONSOLE_URL || "http://localhost:5174";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: b ? JSON.stringify(b) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const tag = Date.now().toString(36).slice(-5);
const me = (await api("GET", "/me/profile", null, T.creator)).body;
const offer = async (cid) => ((await api("GET", "/me/campaign-offers", null, T.creator)).body || []).find((o) => o.campaignId === cid);

const cid = (await api("POST", "/brands/fau/campaigns", { name: `확인값 ${tag}`, product: "수분 선크림", reward_type: "paid", reward_amount: 100, reward_currency: "USD", platform: "instagram", conditions: ["릴스 1개"], countries: ["US"], deadline: "2026-12-30" }, T.fau)).body.campaignId;
await api("POST", `/brands/fau/campaigns/${cid}/publish`, null, T.fau);
await api("POST", `/campaigns/${cid}/apply`, { creator_id: "me" }, T.creator);
ok("준비: 선정(실 API)", (await api("POST", `/brands/fau/campaigns/${cid}/select`, { creator_id: me.creatorId }, T.fau)).status === 200);

const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(APP + "/"); await p.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.creator, API]);
await p.reload(); await p.waitForFunction(() => window.__ME && LIVE.campaigns && LIVE.offers, null, { timeout: 15000 });
const main = () => p.locator(".v2-main").innerText();
await p.evaluate(() => V8brand("fau")); await p.waitForTimeout(300);
await p.evaluate((id) => V8go("c-work", id), cid); await p.waitForTimeout(500);
ok("크리에이터가 본 조건: 고정비 100 USD", (await main()).includes("고정비 100 USD"));

// 크리에이터가 화면을 보는 사이 브랜드가 조건 변경
await api("PATCH", `/brands/fau/campaigns/${cid}`, { reward_amount: 200, reward_currency: "KRW", conditions: ["릴스 2개"] }, T.fau);
await p.locator("#agreeHandle").fill("@fp.minji"); await p.locator("#agreeOk").check();
await p.getByRole("button", { name: "조건 합의" }).click(); await p.waitForTimeout(1500);
const after409 = await main();
ok("옛 확인값 합의 → 거절, 재확인 안내", after409.includes("확인하신 뒤 브랜드가 조건을 바꿨어요") && (await offer(cid)).state === "selected");
ok("새 조건(200원 · 릴스 2개) 표시, 옛 100 USD 사라짐", after409.includes("고정비 200원") && after409.includes("릴스 2개") && !after409.includes("100 USD"));
ok("확인 체크는 해제, 계정 입력은 유지", !(await p.locator("#agreeOk").isChecked()) && (await p.locator("#agreeHandle").inputValue()) === "@fp.minji");
ok("경고로 포커스 이동", await p.evaluate(() => document.activeElement && document.activeElement.id === "termsChanged"));

await p.locator("#agreeOk").check();
await p.getByRole("button", { name: "조건 합의" }).click(); await p.waitForTimeout(1500);
const o = await offer(cid);
ok("최신 조건 재확인 합의 → 스냅샷 200 KRW·확인값 일치", o.state === "terms_agreed" && o.agreedTerms.rewardAmount === 200 && o.agreedTerms.rewardCurrency === "KRW" && o.agreedTerms.confirmedByCreator === true, JSON.stringify(o.agreedTerms).slice(0, 140));

// 합의 후 브랜드가 다시 수정
await api("PATCH", `/brands/fau/campaigns/${cid}`, { reward_amount: 999, reward_currency: "USD", platform: "tiktok", conditions: ["바뀐 조건"] }, T.fau);
await p.evaluate(() => collabRefresh()); await p.waitForTimeout(1200);
await p.evaluate((id) => V8go("c-work", id), cid); await p.waitForTimeout(500);
const work = await main();
ok("크리에이터 상세: 합의 조건 유지(200원·Instagram·릴스 2개), 수정값 미노출", work.includes("고정비 200원") && work.includes("Instagram · 릴스 2개") && work.includes("합의한 조건") && !work.includes("999") && !work.includes("바뀐 조건"));
ok("Instagram 합의라 Spark 칸 없음(캠페인이 TikTok 으로 바뀌어도)", await p.locator("#sparkCode").count() === 0);
await p.evaluate(() => V8go("c-rewards")); await p.waitForTimeout(400);
const rw = await main();
ok("크리에이터 보상: 200원 (합의)", rw.includes("200원 (합의)") && !rw.includes("999"));
await p.evaluate(() => V8go("c-tasks")); await p.waitForTimeout(400);
ok("크리에이터 할 일: 합의 조건 기준", !(await main()).includes("999"));
ok("크리에이터 페이지 오류 없음", !errs.length, errs.join(" | "));

// 체크 후 자동 새로고침 경합: 체크한 시점의 확인값만 쓰고, 새로고침으로 조건이 바뀌면 체크 해제·재확인
const cid3 = (await api("POST", "/brands/fau/campaigns", { name: `경합 ${tag}`, product: "수분 선크림", reward_type: "paid", reward_amount: 50, reward_currency: "USD", platform: "instagram", conditions: ["릴스 1개"], countries: ["US"], deadline: "2026-12-30" }, T.fau)).body.campaignId;
await api("POST", `/brands/fau/campaigns/${cid3}/publish`, null, T.fau);
await api("POST", `/campaigns/${cid3}/apply`, { creator_id: "me" }, T.creator);
await api("POST", `/brands/fau/campaigns/${cid3}/select`, { creator_id: me.creatorId }, T.fau);
await p.evaluate(() => collabRefresh()); await p.waitForTimeout(1200);
await p.evaluate((id) => V8go("c-work", id), cid3); await p.waitForTimeout(500);
await p.locator("#agreeHandle").fill("@race"); await p.locator("#agreeOk").check();
await p.evaluate(() => collabRefresh()); await p.waitForTimeout(1200);   // 조건 변화 없는 자동 새로고침
ok("경합: 변화 없는 새로고침은 체크 유지", await p.locator("#agreeOk").isChecked() && !(await main()).includes("확인하신 뒤 브랜드가 조건을 바꿨어요"));
await api("PATCH", `/brands/fau/campaigns/${cid3}`, { reward_amount: 70 }, T.fau);
await p.evaluate(() => collabRefresh()); await p.waitForTimeout(1200);   // 조건이 바뀐 자동 새로고침
const raced = await main();
ok("경합: 새로고침으로 조건 변경 감지 → 체크 해제·재확인 안내·새 금액 표시", !(await p.locator("#agreeOk").isChecked()) && raced.includes("확인하신 뒤 브랜드가 조건을 바꿨어요") && raced.includes("고정비 70 USD"));
await p.getByRole("button", { name: "조건 합의" }).click(); await p.waitForTimeout(800);
ok("경합: 재확인 없이 합의 클릭 → 합의되지 않음", (await offer(cid3)).state === "selected");
await p.locator("#agreeOk").check(); await p.getByRole("button", { name: "조건 합의" }).click(); await p.waitForTimeout(1500);
const o3 = await offer(cid3);
ok("경합: 재확인 후 합의 → 70 USD 스냅샷", o3.state === "terms_agreed" && o3.agreedTerms.rewardAmount === 70 && o3.agreedTerms.confirmedByCreator === true);

// 브랜드 콘솔 지원자 화면 — 같은 합의 데이터
const q = await br.newPage({ viewport: { width: 1280, height: 900 } });
const qerr = []; q.on("pageerror", (e) => qerr.push(e.message));
await q.goto(CON + "/"); await q.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.fau, API]);
await q.reload(); await q.waitForFunction(() => window.__C8 && window.__C8.active() && document.querySelector(".v2-brand"), null, { timeout: 15000 });
// v8 콘솔 지원자 화면(실클릭): 캠페인 선택 → 이 크리에이터 상세의 합의 조건
await q.evaluate((id) => { C8.go("b-applicants"); C8.pick("appCamp", id); }, cid); await q.waitForTimeout(2000);
await q.locator(".v6-split-list .v6-row", { hasText: "@" }).first().getByRole("button", { name: "보기" }).click(); await q.waitForTimeout(600);
const bt = await q.locator(".v6-split-list .v6-panel").innerText().catch(() => "");
ok("브랜드 지원자: 합의한 조건 200원·Instagram·@fp.minji·릴스 2개", bt.includes("고정비 200원") && bt.includes("Instagram") && bt.includes("@fp.minji") && bt.includes("릴스 2개") && !bt.includes("999"), bt.replace(/\s+/g, " "));
ok("브랜드 페이지 오류 없음", !qerr.length, qerr.join(" | "));
await br.close();
for (const r of results) console.log(r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`PASS ${results.length - fail} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
