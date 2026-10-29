// 크리에이터 v8 리뷰 반영 E2E — 실 로컬 API·DB, 실브라우저.
// · 없는 캠페인 ID를 명시하면 다른 협업 폼으로 넘어가지 않고 오류·목록만 보인다.
// · 합의·주소·영상 제출이 서버 오류(네트워크 수준 500 주입)면 입력·체크·주소가 남고, 성공 시에만 지워진다.
// · 고정비(USD)·Instagram 캠페인은 수수료·TikTok·Spark 없이 같은 조건 데이터로 합의된다(서버 스냅샷 확인).
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";

const API = process.env.API_URL || "http://localhost:8765";
const APP = process.env.APP_URL || "http://localhost:5175";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: b ? JSON.stringify(b) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const tag = Date.now().toString(36).slice(-5);
const me = (await api("GET", "/me/profile", null, T.creator)).body;
const offer = async (cid) => ((await api("GET", "/me/campaign-offers", null, T.creator)).body || []).find((o) => o.campaignId === cid);

// 준비: FAU 고정비 USD · Instagram 캠페인 (실 API) → 신청 → 수수료 없이 선정
const made = await api("POST", "/brands/fau/campaigns", { name: `인스타 릴스 ${tag}`, product: "수분 선크림", reward_type: "paid", reward_amount: 100, reward_currency: "USD", platform: "instagram", conditions: ["Instagram 릴스 1개 · 15~30초"], countries: ["US"], deadline: "2026-12-30" }, T.fau);
const cid = made.body.campaignId;
await api("POST", `/brands/fau/campaigns/${cid}/publish`, null, T.fau);
await api("POST", `/campaigns/${cid}/apply`, { creator_id: "me" }, T.creator);
const sel = await api("POST", `/brands/fau/campaigns/${cid}/select`, { creator_id: me.creatorId }, T.fau);
ok("준비: 고정비 캠페인 수수료 없이 선정(실 API)", sel.status === 200, String(sel.status));

const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(APP + "/"); await p.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.creator, API]);
await p.reload(); await p.waitForFunction(() => window.__ME && LIVE.campaigns && LIVE.offers, null, { timeout: 15000 });
const main = () => p.locator(".v2-main").innerText();

// 1) 없는 ID
await p.evaluate(() => V8brand("fau")); await p.waitForTimeout(300);
await p.evaluate(() => V8go("c-work", "cmp-does-not-exist")); await p.waitForTimeout(400);
ok("없는 캠페인 ID → 오류·목록, 다른 협업 폼 없음", (await main()).includes("참여 기록을 찾지 못했어요") && await p.locator("#agreeHandle, #shipRecipient, #vdUrl").count() === 0);

// 2) 고정비·Instagram 조건 표시 + 실패 시 입력 유지
await p.evaluate((id) => V8go("c-work", id), cid); await p.waitForTimeout(500);
const body = await main();
ok("고정비 100 USD · Instagram 조건으로 합의 화면", body.includes("고정비 100 USD") && body.includes("Instagram") && !body.includes("제안 수수료") && (await p.locator('label[for="agreeHandle"]').innerText()).includes("Instagram"));
await p.locator("#agreeHandle").fill("@insta.minji"); await p.locator("#agreeOk").check();
await p.route("**/agree", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"일시 오류"}' }));
await p.getByRole("button", { name: "조건 합의" }).click(); await p.waitForTimeout(700);
ok("합의 500 → 계정·체크 유지, 상태 그대로", await p.locator("#agreeHandle").inputValue() === "@insta.minji" && await p.locator("#agreeOk").isChecked() && (await offer(cid)).state === "selected");
await p.unroute("**/agree");
await p.getByRole("button", { name: "조건 합의" }).click(); await p.waitForTimeout(1500);
const o1 = await offer(cid);
ok("합의 성공 → 서버 스냅샷(고정비·USD·Instagram·계정)", o1.state === "terms_agreed" && o1.agreedTerms && o1.agreedTerms.rewardAmount === 100 && o1.agreedTerms.rewardCurrency === "USD" && o1.agreedTerms.platform === "instagram" && o1.platformHandle === "@insta.minji", JSON.stringify(o1.agreedTerms || {}).slice(0, 120));
ok("Instagram 캠페인엔 Spark 코드 칸 없음", await p.locator("#sparkCode").count() === 0);

await p.locator("#shipRecipient").fill("Minji Test"); await p.locator("#shipLine").fill("1 Ocean Ave");
await p.locator("#shipCity").fill("Miami FL"); await p.locator("#shipZip").fill("33139"); await p.locator("#shipPhone").fill("+1 555 0101");
await p.locator("#shipConsent").check();
await p.route("**/shipping", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"일시 오류"}' }));
await p.getByRole("button", { name: "주소 저장" }).click(); await p.waitForTimeout(700);
ok("주소 500 → 주소 입력·동의 유지, 서버 미저장", await p.locator("#shipLine").inputValue() === "1 Ocean Ave" && await p.locator("#shipZip").inputValue() === "33139" && await p.locator("#shipConsent").isChecked() && !(await offer(cid)).shipping);
await p.unroute("**/shipping");
await p.getByRole("button", { name: "주소 저장" }).click(); await p.waitForTimeout(1500);
ok("주소 성공 → 저장 후 입력 정리", ((await offer(cid)).shipping || {}).address === "1 Ocean Ave, Miami FL 33139" && (await main()).includes("샘플 발송 대기"));

await api("POST", `/brands/fau/campaigns/${cid}/terms/${me.creatorId}/sample-shipped`, { tracking: "IG-" + tag }, T.fau);
await p.evaluate(() => collabRefresh()); await p.waitForTimeout(1200); await p.evaluate((id) => V8go("c-work", id), cid); await p.waitForTimeout(500);
await p.locator("#vdUrl").fill("https://www.instagram.com/reel/abc" + tag); await p.locator("#vdMemo").fill("메모 " + tag);
await p.route("**/content", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"일시 오류"}' }));
await p.getByRole("button", { name: "영상 제출" }).click(); await p.waitForTimeout(700);
ok("영상 500 → 링크·메모 유지, 서버 미제출", (await p.locator("#vdUrl").inputValue()).includes("abc" + tag) && (await p.locator("#vdMemo").inputValue()) === "메모 " + tag && (await offer(cid)).state === "sample_shipped");
await p.unroute("**/content");
await p.getByRole("button", { name: "영상 제출" }).click(); await p.waitForTimeout(1800);
ok("영상 성공 → content_submitted", (await offer(cid)).state === "content_submitted");
await p.evaluate(() => V8go("c-rewards")); await p.waitForTimeout(400);
ok("받을 보상: 합의한 고정비 USD 표시(원 하드코딩 없음)", (await main()).includes("100 USD (합의)"));
ok("페이지 오류 없음", !errs.length, errs.join(" | "));
await br.close();
for (const r of results) console.log(r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`PASS ${results.length - fail} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
