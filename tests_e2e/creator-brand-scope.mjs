// v8.1 브랜드 경계 E2E — 크리에이터가 두 브랜드에 참여해도 각 브랜드 공간에는
// 그 브랜드의 캠페인·협업·할 일·알림만 보이는지 실브라우저로 확인한다.
// 전제: 로컬 스택(API 8765, creator dist 5175)과 scripts/dev/seed_local_v8.py 시드.
// 외부 발송·실결제 없음. 브랜드 선정은 실제 API(/brands/{b}/campaigns/{c}/select)로 만든다.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";

const API = process.env.API_URL || "http://localhost:8765";
const APP = process.env.APP_URL || "http://localhost:5175";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: b ? JSON.stringify(b) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

// 준비: 두 브랜드 캠페인에 신청, 고려만 선정
const camps = (await api("GET", "/me/campaigns", null, T.creator)).body;
const g = camps.find((c) => c.brandId === "goryeo1392"), f = camps.find((c) => c.brandId === "fau");
for (const c of [g, f]) await api("POST", `/campaigns/${c.campaignId}/apply`, { creator_id: "me" }, T.creator);
const me = (await api("GET", "/me/profile", null, T.creator)).body;
const cid = me.creatorId || me.creator_id;
const sel = await api("POST", `/brands/goryeo1392/campaigns/${g.campaignId}/select`, { creator_id: cid, commission_pct: 15 }, T.goryeo1392);
ok("준비: 고려 캠페인 선정(실 API)", sel.status < 300 || sel.status === 409, String(sel.status));

const br = await chromium.launch();
for (const w of [1280, 390]) {
  const p = await br.newPage({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(APP + "/"); await p.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.creator, API]);
  await p.reload(); await p.waitForFunction(() => window.__ME && window.LIVE && LIVE.campaigns && LIVE.offers, null, { timeout: 15000 });
  const go = async (brand, page) => { await p.evaluate((b) => { slackBrand(b); }, brand); await p.waitForTimeout(400); await p.evaluate((pg) => navigate(pg), page); await p.waitForTimeout(700); };
  const main = () => p.locator(".v2-main, .slack-primary, .slack-main").first().innerText();

  await go("fau", "campaigns");
  let t = await main();
  ok(`[${w}] FAU 캠페인 목록에 고려 캠페인 없음`, !t.includes(g.name) && t.includes(f.name));
  await go("fau", "work");
  t = await main();
  ok(`[${w}] FAU 내 협업에 고려 선정 건 없음`, !t.includes(g.name));
  const todoF = await p.evaluate(() => actionableOffers().length);
  ok(`[${w}] FAU 할 일 수는 FAU 협업만`, todoF === 0, String(todoF));
  await go("goryeo1392", "work");
  t = await main();
  ok(`[${w}] 고려 내 협업에는 선정 건 표시`, t.includes(g.name));
  // 상세를 연 채 브랜드 전환 → 이전 브랜드 상세가 남지 않음
  await p.evaluate((id) => navigate("detail", id), g.campaignId); await p.waitForTimeout(500);
  await p.evaluate(() => slackBrand("fau")); await p.waitForTimeout(400);
  await p.evaluate(() => navigate("campaigns")); await p.waitForTimeout(500);
  t = await main();
  ok(`[${w}] 브랜드 전환 후 이전 브랜드 상세 없음`, !t.includes(g.name));
  // 알림 패널은 현재 브랜드 범위
  await p.evaluate(() => notifications()); await p.waitForTimeout(300);
  const modal = await p.locator("#modalBody").innerText();
  ok(`[${w}] FAU 알림 패널에 고려 선정 알림 없음`, !modal.includes(g.name), modal.slice(0, 80).replace(/\s+/g, " "));
  await p.evaluate(() => closeModal());
  ok(`[${w}] 콘솔 오류 없음`, !errs.length, errs.join(" | "));
  await p.close();
}
await br.close();
for (const r of results) console.log(r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`PASS ${results.length - fail} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
