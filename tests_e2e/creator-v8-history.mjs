// 신청 이력 보존 E2E(D01) — 마감·미선정이 된 신청 건이 '내 캠페인'에 사유·일자와 함께 남고, 둘러보기 목록·신청에서는 빠진다.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";
const API = process.env.API_URL || "http://localhost:8765";
const APP = process.env.APP_URL || "http://localhost:5175";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = []; const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const tag = Date.now().toString(36).slice(-5), me = (await api("GET", "/me/profile", null, T.creator)).body;
const mk = async (name) => { const id = (await api("POST", "/brands/fau/campaigns", { name, reward_type: "gifted", countries: ["US"], deadline: "2026-12-30" }, T.fau)).body.campaignId; await api("POST", `/brands/fau/campaigns/${id}/publish`, null, T.fau); await api("POST", `/campaigns/${id}/apply`, { creator_id: "me" }, T.creator); return id; };
const closedName = `마감 이력 ${tag}`, rejName = `미선정 이력 ${tag}`;
const a = await mk(closedName), r = await mk(rejName);
await api("POST", `/brands/fau/campaigns/${r}/applicants/${me.creatorId}/reject`, { reason: `국가 불일치 ${tag}` }, T.fau);
await api("POST", `/brands/fau/campaigns/${a}/close`, null, T.fau); await api("POST", `/brands/fau/campaigns/${r}/close`, null, T.fau);
const br = await chromium.launch();
for (const w of [1280, 390]) {
  const p = await br.newPage({ viewport: { width: w, height: w < 500 ? 844 : 900 } }); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(APP + "/"); await p.evaluate(([t, x]) => { localStorage.setItem("CONNECTION_API_URL", x); localStorage.setItem("CONNECTION_JWT", t); }, [T.creator, API]);
  await p.reload(); await p.waitForFunction(() => window.__ME && LIVE.campaigns && LIVE.offers, null, { timeout: 15000 });
  await p.evaluate(() => { V8brand("fau"); V8go("c-work"); }); await p.waitForTimeout(600);
  const t = await p.locator(".v2-main").innerText();
  ok(`[${w}] 내 캠페인: 마감·미선정 신청 건 이력 표시`, t.includes(closedName) && t.includes(rejName));
  await p.evaluate((id) => V8go("c-work", id), r); await p.waitForTimeout(500);
  const rt = await p.locator(".v2-main").innerText();
  ok(`[${w}] 미선정 상세: 결과·사유 표시`, rt.includes("이번에는 선정되지 않았어요") && rt.includes(`국가 불일치 ${tag}`));
  await p.evaluate((id) => V8go("c-work", id), a); await p.waitForTimeout(500);
  ok(`[${w}] 마감된 신청: 마감 안내`, (await p.locator(".v2-main").innerText()).includes("모집이 마감됐어요"));
  await p.evaluate(() => V8go("c-campaigns")); await p.waitForTimeout(500);
  const bt = await p.locator(".v2-main").innerText();
  ok(`[${w}] 둘러보기 목록에는 마감 건 없음`, !bt.includes(closedName) && !bt.includes(rejName));
  await p.evaluate((id) => V8go("c-campaigns", id), a); await p.waitForTimeout(500);
  ok(`[${w}] 마감 건 상세는 신청 불가 안내`, (await p.locator(".v2-main").innerText()).includes("신청할 수 없어요"));
  // 내 캠페인 목록 → '보기' 실클릭 → 모바일은 선택 상세가 먼저(목록 숨김·되돌아가기), 데스크톱은 양쪽 패널
  await p.locator(".v2-side .v2-navbtn", { hasText: "내 캠페인" }).first().click().catch(async () => { await p.getByRole("button", { name: "채널·메뉴 열기" }).click(); await p.locator(".v2-side .v2-navbtn", { hasText: "내 캠페인" }).first().click(); });
  await p.waitForTimeout(500);
  const sub = await p.evaluate(() => (LIVE.offers || []).find((o) => o.brandId === "fau" && o.state === "content_submitted" && /^https:/.test(o.contentUrl || "")));
  await p.locator(".v8-work .v6-row", { hasText: sub ? sub.campaignName : rejName }).first().getByRole("button", { name: "보기" }).click(); await p.waitForTimeout(600);
  const listVis = await p.locator(".v8-work > .v6-list").isVisible(), head = await p.locator("#v8-work-h").boundingBox();
  if (w < 500) {
    ok(`[${w}] 보기 → 선택 상세가 첫 화면(목록 숨김)`, !listVis && head && head.y < 400 && await p.locator(".v8-back button").isVisible(), JSON.stringify(head));
    await p.screenshot({ path: "docs/qa/v8/creator-c-work-390-detail.png" });
    await p.locator(".v8-back button").click(); await p.waitForTimeout(400);
    ok(`[${w}] 캠페인 목록으로 되돌아가기`, await p.locator(".v8-work > .v6-list").isVisible() && !(await p.locator(".v8-work > .v6-panel").isVisible()));
  } else ok(`[${w}] 데스크톱 양쪽 패널 유지`, listVis && head && !(await p.locator(".v8-back button").isVisible()));
  if (sub) {
    await p.evaluate((id) => V8go("c-work", id), sub.campaignId); await p.waitForTimeout(500);
    const link = await p.locator("a.v8-video").first().evaluate((x) => ({ href: x.href, target: x.target, rel: x.rel, text: x.innerText }));
    ok(`[${w}] 제출 영상 보기: 안전한 https 새 창 링크`, link.href === sub.contentUrl && link.target === "_blank" && /noopener/.test(link.rel) && link.text === "제출 영상 보기", JSON.stringify(link));
    if (w >= 500) await p.screenshot({ path: "docs/qa/v8/creator-c-work-1280-video.png" });
  } else ok(`[${w}] 제출 건 준비`, false, "content_submitted FAU offer 없음");
  ok(`[${w}] 페이지 오류 없음`, !errs.length, errs.join("|")); await p.close();
}
await br.close(); for (const x of results) console.log(x);
const fail = results.filter((x) => x.startsWith("FAIL")).length; console.log(`PASS ${results.length - fail} FAIL ${fail}`); process.exit(fail ? 1 : 0);
