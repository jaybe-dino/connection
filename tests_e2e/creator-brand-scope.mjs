// v8.1 브랜드 경계 E2E — 크리에이터가 두 브랜드에 참여해도 각 브랜드 공간에는
// 그 브랜드의 캠페인·협업·할 일·알림만 보이는지 실브라우저로 확인한다.
// 브랜드 전환·메뉴 이동은 실제 레일·메뉴 버튼 클릭으로 하고(모바일은 '브랜드 선택 열기'·'채널·메뉴 열기' 뒤),
// 전환 직후 화면을 바로 검사한다(추가 이동으로 이전 브랜드 상세 잔여를 가리지 않는다).
// 전제: 로컬 스택(API 8765, creator dist 5175)과 scripts/dev/seed_local_v8.py 시드. 외부 발송·실결제 없음.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";

const API = process.env.API_URL || "http://localhost:8765";
const APP = process.env.APP_URL || "http://localhost:5175";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: b ? JSON.stringify(b) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

// 준비: 이번 실행 전용 고려 캠페인을 만들어 신청·선정(고려에만 선정 건 + 선정 알림)
const tag = Date.now().toString(36).slice(-5);
const gName = `고려 경계 ${tag}`;
const g = (await api("POST", "/brands/goryeo1392/campaigns", { name: gName, product: "한방 진정 앰플", reward_type: "affiliate", affiliate_pct: 15, countries: ["US"], deadline: "2026-12-30" }, T.goryeo1392)).body;
await api("POST", `/brands/goryeo1392/campaigns/${g.campaignId}/publish`, null, T.goryeo1392);
await api("POST", `/campaigns/${g.campaignId}/apply`, { creator_id: "me" }, T.creator);
const me = (await api("GET", "/me/profile", null, T.creator)).body;
const sel = await api("POST", `/brands/goryeo1392/campaigns/${g.campaignId}/select`, { creator_id: me.creatorId, commission_pct: 15 }, T.goryeo1392);
ok("준비: 고려 캠페인 선정(실 API)", sel.status === 200, String(sel.status));
const fauCamp = ((await api("GET", "/me/campaigns", null, T.creator)).body || []).find((c) => c.brandId === "fau");
const brands = (await api("GET", "/me/memberships", null, T.creator)).body;
const nameOf = (id) => ((Array.isArray(brands) ? brands : brands.items || []).find((b) => b.brandId === id) || {}).name || id;

const br = await chromium.launch();
for (const w of [1280, 390]) {
  const mobile = w < 500;
  const p = await br.newPage({ viewport: { width: w, height: mobile ? 844 : 900 } });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(APP + "/"); await p.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.creator, API]);
  await p.reload(); await p.waitForFunction(() => window.__ME && window.LIVE && LIVE.campaigns && LIVE.offers && LIVE.notifs, null, { timeout: 15000 });
  const main = () => p.locator(".v2-main").innerText();
  // 실제 레일 클릭으로 브랜드 전환(모바일은 레일 열기 버튼 먼저)
  const clickBrand = async (id) => {
    if (mobile) await p.getByRole("button", { name: "브랜드 선택 열기" }).click();
    await p.locator(".v2-rail").getByRole("button", { name: nameOf(id), exact: true }).click();
    await p.waitForTimeout(500);
  };
  // 실제 사이드 메뉴 클릭(모바일은 채널·메뉴 열기 먼저)
  const clickNav = async (label) => {
    if (mobile) await p.getByRole("button", { name: "채널·메뉴 열기" }).click();
    await p.locator(".v2-side .v2-navbtn", { hasText: label }).first().click();
    await p.waitForTimeout(500);
  };
  const current = () => p.evaluate(() => currentBrand().brandId);

  await clickBrand("goryeo1392");
  await clickNav("내 캠페인");
  ok(`[${w}] 고려(레일 클릭) 내 캠페인에 선정 건`, (await current()) === "goryeo1392" && (await main()).includes(gName));
  // 고려 협업 상세를 연 채로 FAU 레일 클릭 → 전환 직후 바로 검사
  await p.locator(".v2-main .v6-row", { hasText: gName }).getByRole("button", { name: "보기" }).first().click(); await p.waitForTimeout(400);
  ok(`[${w}] 고려 협업 상세 열림`, (await p.evaluate(() => location.hash)).includes(g.campaignId));
  await clickBrand("fau");
  let t = await main();
  ok(`[${w}] FAU 전환 직후: 이전 브랜드 상세·캠페인명 없음`, (await current()) === "fau" && !t.includes(gName) && !(await p.evaluate(() => location.hash)).includes(g.campaignId));
  ok(`[${w}] FAU 전환 직후: 레일 현재 표시`, (await p.locator(".v2-rail [aria-current=true]").getAttribute("aria-label")) === nameOf("fau"));
  // 할 일: 사이드 배지·목록·접근자 모두 FAU 건만
  await clickNav("내 할 일");
  t = await main();
  const todo = await p.evaluate(() => actionableOffers().map((o) => o.brandId));
  ok(`[${w}] FAU 할 일: FAU 협업만(고려 선정 건 없음)`, !t.includes(gName) && todo.every((b) => b === "fau"), JSON.stringify(todo));
  const badge = await p.locator(".v2-side .badge-n[aria-label^='할 일']").innerText().catch(() => "0");
  ok(`[${w}] FAU 할 일 배지 = FAU 할 일 수`, Number(badge) === todo.length, `${badge}/${todo.length}`);
  await clickNav("캠페인 둘러보기");
  t = await main();
  ok(`[${w}] FAU 캠페인 목록에 고려 캠페인 없음`, !t.includes(gName) && (!fauCamp || t.includes(fauCamp.name)));
  // 알림: 상단 알림 버튼(실 클릭) → FAU 범위 + 각 항목이 원래 서버 목록의 같은 FAU 알림을 가리킴
  await p.locator(".v2-top").getByRole("button", { name: /^알림/ }).click(); await p.waitForTimeout(300);
  const modal = await p.locator("#modalBody").innerText();
  const idxOk = await p.evaluate(() => Array.from(document.querySelectorAll("#modalBody .event-row")).every((b) => {
    const i = Number((b.getAttribute("onclick").match(/notifGo\((\d+)\)/) || [])[1]);
    const it = LIVE.notifs.items[i]; return it && (!(it.target || {}).brandId || it.target.brandId === "fau") && b.innerText.includes(it.title);
  }));
  ok(`[${w}] FAU 알림 패널: 고려 선정 알림 없음`, !modal.includes(gName), modal.slice(0, 80).replace(/\s+/g, " "));
  ok(`[${w}] 알림 항목 _idx = 원래 서버 목록 인덱스(같은 알림)`, idxOk);
  await p.evaluate(() => closeModal());
  // 할 일 화면의 '최근 알림 · 열기'도 원래 인덱스
  await clickNav("내 할 일");
  const banner = await p.evaluate(() => { const b = document.querySelector(".v8-notice button"); if (!b) return null; const i = Number(b.getAttribute("onclick").match(/notifGo\((\d+)\)/)[1]); const it = LIVE.notifs.items[i]; return { ok: !!it && document.querySelector(".v8-notice").innerText.includes(it.title) && (!(it.target || {}).brandId || it.target.brandId === "fau") }; });
  ok(`[${w}] 최근 알림 배너 인덱스도 같은 FAU 알림`, banner === null || banner.ok, JSON.stringify(banner));
  // 고려로 되돌아오기(레일 클릭) 직후 고려 데이터
  await clickBrand("goryeo1392");
  await clickNav("내 캠페인");
  ok(`[${w}] 고려 복귀 후 선정 건 표시`, (await main()).includes(gName));
  ok(`[${w}] 페이지 오류 없음`, !errs.length, errs.join(" | "));
  await p.close();
}
await br.close();
for (const r of results) console.log(r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`PASS ${results.length - fail} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
