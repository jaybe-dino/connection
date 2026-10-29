// 페르소나 검수에서 증거가 비어 있던 v8.1 노출 경로만 추가 검수 — 실제 로컬 API·DB, 실브라우저.
// B1 비공개 저장(초안은 크리에이터에게 안 보임) · B2 두 담당자 동시 회신 처리(낙관적 잠금) ·
// B2/C2 수정 요청 2회(최신 요청·버전별 제출 보존) · C2 발송 전 주소 수정 / 발송 후 수정 차단.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const API = process.env.API_URL || "http://localhost:8765";
const CON = process.env.CONSOLE_URL || "http://localhost:5174";
const APP = process.env.APP_URL || "http://localhost:5175";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = []; const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const tag = Date.now().toString(36).slice(-5);
const B = "goryeo1392";
const br = await chromium.launch();
async function consolePage() {
  const p = await br.newPage({ viewport: { width: 1280, height: 900 } }); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => d.accept());
  await p.goto(CON + "/"); await p.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T[B], API]);
  await p.reload(); await p.waitForFunction(() => window.__C8 && window.__C8.active() && document.querySelector(".v2-brand"), null, { timeout: 15000 });
  return p;
}
const toasts = (pg) => pg.evaluate(() => Array.from(document.querySelectorAll("#toastWrap .toast, #toast")).map((x) => x.textContent).join(" | "));

// B1 비공개 저장: 초안은 크리에이터 목록에 없고, 발행하면 보인다
const p = await consolePage();
await p.evaluate(() => C8.go("b-create")); await p.waitForTimeout(800);
await p.locator('[data-f="W.name"]').fill(`비공개 초안 ${tag}`);
await p.locator(".v2-main").getByRole("button", { name: "초안 저장", exact: true }).click(); await p.waitForTimeout(1500);
const draft = (await api("GET", `/brands/${B}/campaigns`, null, T[B])).body.find((c) => c.name === `비공개 초안 ${tag}`);
const seenDraft = ((await api("GET", "/me/campaigns", null, T.creator)).body || []).some((c) => c.campaignId === draft?.campaignId);
ok("B1 비공개 저장: 초안은 서버 draft·크리에이터 목록에 없음·화면 안내", draft && draft.lifecycle === "draft" && !seenDraft && (await toasts(p)).includes("크리에이터에게는 아직 보이지 않아요"));
await api("POST", `/brands/${B}/campaigns/${draft.campaignId}/publish`, null, T[B]);
ok("B1 발행 후 크리에이터 목록에 보임", ((await api("GET", "/me/campaigns", null, T.creator)).body || []).some((c) => c.campaignId === draft.campaignId));

// B2 두 담당자 동시 회신 처리: 늦게 저장한 쪽은 덮어쓰지 않고 안내·입력 유지 → 새로 불러온 뒤 저장
await fetch(API + "/inbound/reply", { method: "POST", headers: { "Content-Type": "application/json", "X-Inbound-Key": "local-inbound-test" }, body: JSON.stringify({ brand_id: B, from_email: `dual${tag}@creator.example`, text: "Rate?" }) });
const q = await consolePage();
for (const pg of [p, q]) { await pg.evaluate(() => { C8.reload("inbox"); C8.go("b-reply"); }); await pg.waitForTimeout(1500); await pg.locator(".v6-ithread", { hasText: `dual${tag}` }).click(); await pg.waitForTimeout(1200); }
const tid = await p.evaluate(() => (location.hash.match(/b-reply\/(.+)$/) || [])[1]);
await p.locator(`select[data-f="RT.${tid}.label"]`).selectOption("question"); await p.locator(`[data-f="RT.${tid}.next"]`).fill("A 담당 처리 " + tag);
await p.locator(".v2-main").getByRole("button", { name: "후속 처리 저장" }).click(); await p.waitForTimeout(1200);
await q.locator(`select[data-f="RT.${tid}.label"]`).selectOption("interested"); await q.locator(`[data-f="RT.${tid}.next"]`).fill("B 담당 처리 " + tag);
await q.locator(".v2-main").getByRole("button", { name: "후속 처리 저장" }).click(); await q.waitForTimeout(1500);
const th1 = (await api("GET", `/brands/${B}/inbox`, null, T[B])).body.find((x) => x.threadId === tid);
ok("B2 동시 회신 처리: 늦은 저장은 거부·안내, A 의 저장 유지, B 입력은 남음", th1.task.label === "question" && th1.task.nextAction === "A 담당 처리 " + tag && (await toasts(q)).includes("다른 담당자가 먼저 수정했어요") && (await q.locator(`[data-f="RT.${tid}.next"]`).inputValue()) === "B 담당 처리 " + tag);
await q.locator(".v2-main").getByRole("button", { name: "후속 처리 저장" }).click(); await q.waitForTimeout(1500);
const th2 = (await api("GET", `/brands/${B}/inbox`, null, T[B])).body.find((x) => x.threadId === tid);
ok("B2 인계: 최신 상태를 불러온 뒤 다시 저장 → 반영(revision 2)", th2.task.nextAction === "B 담당 처리 " + tag && th2.task.revision === 2, JSON.stringify(th2.task));

// B2/C2 수정 요청 2회 + C2 발송 전 주소 수정 / 발송 후 차단
const me = (await api("GET", "/me/profile", null, T.creator)).body;
const cid = (await api("POST", `/brands/${B}/campaigns`, { name: `수정2회 ${tag}`, reward_type: "gifted", countries: ["US", "KR"], conditions: ["TikTok 영상 1개 · 30초"] }, T[B])).body.campaignId;
await api("POST", `/brands/${B}/campaigns/${cid}/publish`, null, T[B]);
await api("POST", `/campaigns/${cid}/apply`, { creator_id: "me" }, T.creator);
await api("POST", `/brands/${B}/campaigns/${cid}/select`, { creator_id: me.creatorId }, T[B]);
const off = ((await api("GET", "/me/campaign-offers", null, T.creator)).body || []).find((o) => o.campaignId === cid);
await api("POST", `/me/campaign-offers/${cid}/agree`, { accept: true, handle: "@rev" + tag, terms_fingerprint: off.termsFingerprint }, T.creator);
await api("POST", `/me/campaign-offers/${cid}/shipping`, { recipient: "Min Ji", country: "US", address: "1 Wrong St, Brooklyn NY 11201", phone: "+1 555 0100" }, T.creator);
const c = await br.newPage({ viewport: { width: 1280, height: 900 } }); c.errs = []; c.on("pageerror", (e) => c.errs.push(e.message));
await c.goto(APP + "/"); await c.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.creator, API]);
await c.reload(); await c.waitForFunction(() => window.__ME && LIVE.campaigns && LIVE.offers, null, { timeout: 15000 });
await c.evaluate((b) => V8brand(b), B); await c.evaluate((x) => V8go("c-work", x), cid); await c.waitForTimeout(800);
await c.getByRole("button", { name: "주소 수정", exact: true }).click(); await c.waitForTimeout(300);
await c.locator("#shipLine").fill("2 Right Ave"); await c.locator("#shipCity").fill("Brooklyn NY"); await c.locator("#shipZip").fill("11201");
await c.locator("#shipConsent").check(); await c.getByRole("button", { name: "주소 저장", exact: true }).click(); await c.waitForTimeout(1500);
const sh = ((await api("GET", "/me/campaign-offers", null, T.creator)).body || []).find((o) => o.campaignId === cid).shipping;
ok("C2 주소 오타 수정(발송 전): 화면에서 수정 → 서버 반영", sh && /2 Right Ave/.test(sh.address), sh && sh.address);
await api("POST", `/brands/${B}/campaigns/${cid}/terms/${me.creatorId}/sample-shipped`, { tracking: "USPS " + tag }, T[B]);
const late = await api("POST", `/me/campaign-offers/${cid}/shipping`, { recipient: "Min Ji", country: "US", address: "3 Late St", phone: "+1 555 0100" }, T.creator);
await c.reload(); await c.waitForFunction(() => window.__ME && LIVE.offers, null, { timeout: 15000 }); await c.evaluate((b) => V8brand(b), B); await c.evaluate((x) => V8go("c-work", x), cid); await c.waitForTimeout(800);
ok("C2 발송 후 주소 변경 차단(서버 409·화면에 주소 수정 없음)", late.status === 409 && !(await c.getByRole("button", { name: "주소 수정" }).count()), String(late.status));
for (const [i, note] of [[1, "첫 번째 수정 요청 " + tag], [2, "두 번째 수정 요청 " + tag]]) {
  await api("POST", `/me/campaign-offers/${cid}/content`, { content_url: `https://www.tiktok.com/@rev${tag}/video/${i}` }, T.creator);
  await api("POST", `/brands/${B}/campaigns/${cid}/terms/${me.creatorId}/request-revision`, { note }, T[B]);
}
await c.reload(); await c.waitForFunction(() => window.__ME && LIVE.offers, null, { timeout: 15000 }); await c.evaluate((b) => V8brand(b), B); await c.evaluate((x) => V8go("c-work", x), cid); await c.waitForTimeout(800);
const cw = await c.locator(".v2-main").innerText();
ok("C2 수정 2회: 크리에이터 화면은 최신 요청·이전 제출 링크", cw.includes("두 번째 수정 요청 " + tag) && !cw.includes("첫 번째 수정 요청 " + tag) && cw.includes("/video/2"));
await c.locator("#vdUrl").fill(`https://www.tiktok.com/@rev${tag}/video/3`); await c.getByRole("button", { name: "수정본 제출", exact: true }).click(); await c.waitForTimeout(1500);
const subs = ((await api("GET", "/submissions", null, T.admin)).body || []).filter((s) => s.campaignId === cid && s.source === "collab").sort((a, b) => a.version - b.version);
ok("B2/D03 수정 2회 기록 보존: 제출 v1·v2(보완 요청·요청문) + v3 검수 대기", subs.map((s) => `${s.version}:${s.status}`).join(",") === "1:needs_fix,2:needs_fix,3:in_review" && subs[0].autoChecks.some((x) => (x.fix || "").includes("첫 번째")) && subs[1].autoChecks.some((x) => (x.fix || "").includes("두 번째")), subs.map((s) => `${s.version}:${s.status}`).join(","));
ok("페이지 오류 없음", !p.errs.length && !q.errs.length && !c.errs.length, p.errs.concat(q.errs, c.errs).join(" | "));
await br.close();
for (const r of results) console.log(r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`PASS ${results.length - fail} FAIL ${fail}`);
writeFileSync("docs/qa/v8/persona-gaps-e2e.json", JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
process.exit(fail ? 1 : 0);
