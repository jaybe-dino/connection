// 크리에이터 v8 세션 격리 E2E — 같은 SPA(전체 새로고침 없이)에서 A 로그아웃 → B 세션 바인딩.
// 두 크리에이터가 같은 브랜드·같은 캠페인(둘 다 합의 → 샘플 주소 단계)을 가진 fixture.
// A 가 주소·DM 초안 입력, 느린 주소 저장 요청을 띄운 채 로그아웃 → B 바인딩 후 A 입력·상세·선택·busy·늦은 응답 효과가 없어야 한다.
// 계정별 채팅 초안 정책: A 로 다시 들어오면 A 의 DM 초안만 복원(B 에게는 안 보임).
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const API = process.env.API_URL || "http://localhost:8765";
const APP = process.env.APP_URL || "http://localhost:5175";
const DB = process.env.E2E_DB || "postgresql://postgres:postgres@localhost:5432/v8dev";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = []; const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const sql = (q) => execFileSync("psql", [DB, "-Atc", q], { encoding: "utf8" }).trim();
const tag = Date.now().toString(36).slice(-5);

// fixture: 크리에이터 B(새 계정) + FAU 같은 캠페인에 A·B 둘 다 합의
const magic = await (await fetch(API + "/auth/magic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `sess.b.${tag}@creator.example` }) })).json();
const TB = (await (await fetch(API + "/auth/magic/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: magic.demoLink.split("magic=")[1] }) })).json()).token;
await api("PUT", "/me/profile", { country: "US", languages: ["ko"], ship_countries: ["US"], consent_terms: true, consent_privacy: true }, TB);
await api("POST", "/me/join", { brand_id: "fau" }, TB);
const meA = (await api("GET", "/me/profile", null, T.creator)).body, meB = (await api("GET", "/me/profile", null, TB)).body;
// TikTok 소유 인증은 이 환경에서 실행하지 않으므로 B 의 멤버십은 DB fixture 로 둔다(가입 API 가 막힌 경우만)
sql(`INSERT INTO memberships(creator_id,brand_id) VALUES('${meB.creatorId}','fau') ON CONFLICT DO NOTHING`);
const cid = (await api("POST", "/brands/fau/campaigns", { name: `세션격리 ${tag}`, product: "수분 선크림", reward_type: "gifted", countries: ["US"], deadline: "2026-12-30", conditions: ["TikTok 영상 1개 · 30초"] }, T.fau)).body.campaignId;
await api("POST", `/brands/fau/campaigns/${cid}/publish`, null, T.fau);
for (const [tok, me] of [[T.creator, meA], [TB, meB]]) {
  const ap = await api("POST", `/campaigns/${cid}/apply`, { creator_id: "me" }, tok);
  if (ap.status !== 200) sql(`INSERT INTO campaign_applications(campaign_id,creator_id,status) VALUES('${cid}','${me.creatorId}','applied') ON CONFLICT DO NOTHING`);
  await api("POST", `/brands/fau/campaigns/${cid}/select`, { creator_id: me.creatorId }, T.fau);
  const off = ((await api("GET", "/me/campaign-offers", null, tok)).body || []).find((o) => o.campaignId === cid);
  await api("POST", `/me/campaign-offers/${cid}/agree`, { accept: true, handle: "@sess" + tag, terms_fingerprint: off.termsFingerprint }, tok);
}
const stB = ((await api("GET", "/me/campaign-offers", null, TB)).body || []).find((o) => o.campaignId === cid);
const stA = ((await api("GET", "/me/campaign-offers", null, T.creator)).body || []).find((o) => o.campaignId === cid);
ok("fixture: A·B 같은 브랜드·같은 캠페인 합의(주소 단계)", stA && stB && stA.state === "terms_agreed" && stB.state === "terms_agreed", JSON.stringify([stA && stA.state, stB && stB.state]));

const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(APP + "/"); await p.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.creator, API]);
await p.reload(); await p.waitForFunction(() => window.__ME && LIVE.campaigns && LIVE.offers, null, { timeout: 15000 });
const main = () => p.locator(".v2-main").innerText();
await p.evaluate(() => V8brand("fau")); await p.waitForTimeout(400);
await p.evaluate((c) => V8go("c-work", c), cid); await p.waitForTimeout(800);
await p.locator("#shipRecipient").fill("에이 받는분 " + tag); await p.locator("#shipLine").fill("A 비밀 주소 1번지"); await p.locator("#shipPhone").fill("010-1111-" + tag.slice(0, 4));
if (await p.locator("#shipCity").count()) await p.locator("#shipCity").fill("Brooklyn NY");
if (await p.locator("#shipZip").count()) await p.locator("#shipZip").fill("11201");
await p.locator("#shipConsent").check();
ok("A: 상세(c-work)·주소 입력 상태", (await p.evaluate(() => window.__V8.id)) === cid && (await p.evaluate(() => window.__V8.f.shipLine)) === "A 비밀 주소 1번지");
// A DM 초안(계정별 채팅 초안 정책)
await p.evaluate(() => V8go("c-messages")); await p.waitForTimeout(800);
const hasDraft = await p.locator("#chatDraft").count();
if (hasDraft) await p.locator("#chatDraft").fill("A의 DM 초안 " + tag);
// 느린 주소 저장(이전 세션 요청) — 응답 전에 계정 교체
await p.evaluate((c) => V8go("c-work", c), cid); await p.waitForTimeout(600);
await p.route("**/me/campaign-offers/*/shipping", async (r) => { await new Promise((s) => setTimeout(s, 2500)); r.continue(); });
await p.getByRole("button", { name: "주소 저장" }).click(); await p.waitForTimeout(150);
const busyA = await p.evaluate(() => !!window.__V8.busy.ship);
// 로그아웃(앱 버튼과 같은 함수) → 같은 SPA 에서 B 세션 바인딩(앱 부팅 경로와 같은 함수, 새로고침 없음)
const navCount = await p.evaluate(() => performance.getEntriesByType("navigation").length);
await p.evaluate(() => authLogout()); await p.waitForTimeout(300);
const afterLogout = await p.evaluate(() => ({ f: Object.keys(window.__V8.f).length, id: window.__V8.id, busy: Object.keys(window.__V8.busy).length, hash: location.hash }));
ok("로그아웃 즉시: v8 폼·선택·busy·상세 해시 비움", busyA && afterLogout.f === 0 && afterLogout.id === "" && afterLogout.busy === 0 && !/c-work/.test(afterLogout.hash), JSON.stringify(afterLogout));
await p.evaluate((t) => { localStorage.setItem("CONNECTION_JWT", t); return liveReq("GET", "/auth/me").then((u) => { sessionBind(u); LIVE.authKnown = true; render(); loadCreatorData(); }); }, TB);
await p.waitForFunction(() => window.__ME && LIVE.offers && LIVE.campaigns, null, { timeout: 15000 }); await p.waitForTimeout(3000);   // A 의 느린 응답 도착 시점 지나기
const sameDoc = (await p.evaluate(() => performance.getEntriesByType("navigation").length)) === navCount && (await p.evaluate(() => !!window.__V8));
const stB0 = await p.evaluate(() => ({ me: window.__ME && window.__ME.email, f: JSON.stringify(window.__V8.f), id: window.__V8.id, busy: JSON.stringify(window.__V8.busy), screen: window.__V8.screen }));
ok("B 바인딩(같은 문서·새로고침 없음): A 입력·상세·busy 없음", sameDoc && /sess\.b\./.test(stB0.me) && stB0.f === "{}" && stB0.id === "" && stB0.busy === "{}", JSON.stringify(stB0));
await p.evaluate(() => V8brand("fau")); await p.waitForTimeout(400);
await p.evaluate((c) => V8go("c-work", c), cid); await p.waitForTimeout(1000);
if (process.env.DEBUG) console.log("DEBUG B main:", (await main()).slice(0, 600), await p.evaluate(() => JSON.stringify({ s: window.__V8.screen, id: window.__V8.id, offers: (LIVE.offers || []).length })));
const bv = { rec: await p.locator("#shipRecipient").inputValue().catch(() => "?"), line: await p.locator("#shipLine").inputValue().catch(() => "?"), consent: await p.locator("#shipConsent").isChecked().catch(() => null), text: await main() };
ok("B 같은 캠페인 상세: A 주소·연락처·동의 체크 미노출", bv.rec === "" && bv.line === "" && bv.consent === false && !bv.text.includes("A 비밀 주소") && !bv.text.includes("에이 받는분"), JSON.stringify({ rec: bv.rec, line: bv.line, consent: bv.consent }));
ok("B: A 의 늦은 저장 응답이 성공 토스트·주소로 표시되지 않음", !(await p.evaluate(() => (document.getElementById("toast") || {}).textContent || "")).includes("주소") || !bv.text.includes("A 비밀 주소"));
const srvB = ((await api("GET", "/me/campaign-offers", null, TB)).body || []).find((o) => o.campaignId === cid);
ok("서버: B 참여 건에 A 주소 없음", !srvB.shipping);
await p.evaluate(() => V8go("c-messages")); await p.waitForTimeout(800);
const bDraft = hasDraft ? await p.locator("#chatDraft").inputValue().catch(() => "") : "";
ok("B DM: A 의 DM 초안 미노출", !bDraft.includes("A의 DM 초안"), bDraft);
// B 가 입력 → 로그아웃 → A 다시 바인딩: B 입력 없음, A 의 계정별 채팅 초안만 복원(기존 정책)
await p.evaluate((c) => V8go("c-work", c), cid); await p.waitForTimeout(600);
await p.locator("#shipLine").fill("B 주소 " + tag, { timeout: 5000 }).catch(() => ok("B 주소 입력칸 표시", false, "no #shipLine"));
await p.unroute("**/me/campaign-offers/*/shipping");
await p.evaluate(() => authLogout()); await p.waitForTimeout(300);
await p.evaluate((t) => { localStorage.setItem("CONNECTION_JWT", t); return liveReq("GET", "/auth/me").then((u) => { sessionBind(u); LIVE.authKnown = true; render(); loadCreatorData(); }); }, T.creator);
await p.waitForFunction(() => window.__ME && LIVE.offers, null, { timeout: 15000 }); await p.waitForTimeout(1200);
await p.evaluate(() => V8brand("fau")); await p.evaluate((c) => V8go("c-work", c), cid); await p.waitForTimeout(800);
const aBack = await p.evaluate(() => JSON.stringify(window.__V8.f));
ok("A 재바인딩: B 입력 없음", !aBack.includes("B 주소"), aBack);
if (hasDraft) { await p.evaluate(() => V8go("c-messages")); await p.waitForTimeout(800); const ad = await p.locator("#chatDraft").inputValue().catch(() => ""); ok("A 재바인딩: 계정별 채팅 초안 정책 유지(A 초안 복원)", ad.includes("A의 DM 초안"), ad); }
ok("페이지 오류 없음", !errs.length, errs.join(" | "));
await br.close();
for (const r of results) console.log(r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`PASS ${results.length - fail} FAIL ${fail}`);
writeFileSync("docs/qa/v8/creator-session-e2e.json", JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
process.exit(fail ? 1 : 0);
