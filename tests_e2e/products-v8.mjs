// 독립 제품 모아보기(/products/) E2E — 공개 표시 제품만, 필터·상세·저장, 신청 경로.
// 전제: API 8765 + creator dist 5175 + scripts/dev/seed_local_v8.py(고려 '한방 진정 앰플' 공개 표시).
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";

const API = process.env.API_URL || "http://localhost:8765";
const APP = process.env.APP_URL || "http://localhost:5175";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const pub = await (await fetch(API + "/public/products")).json();
const fauProducts = await (await fetch(API + "/brands/fau/products", { headers: { Authorization: "Bearer " + T.fau } })).json();

const br = await chromium.launch();
for (const w of [1280, 390]) {
  const p = await br.newPage({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(APP + "/products/"); await p.evaluate((a) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.removeItem("CONNECTION_JWT"); localStorage.removeItem("PRODUCTS_SAVED"); }, API);
  await p.reload(); await p.waitForSelector(".v6-pcard, .v6-empty"); await p.waitForTimeout(400);
  const names = await p.locator(".v6-pcard h3").allInnerTexts();
  ok(`[${w}] 공개 표시한 제품만 표시`, names.length === pub.length && !fauProducts.some((x) => !x.publicListed && names.includes(x.name)), names.join(","));
  ok(`[${w}] 커뮤니티 셸(레일·채널) 없음`, await p.locator(".v2-rail, .v2-side").count() === 0);
  await p.locator("#v6pf-q").fill("없는제품xyz"); await p.waitForTimeout(200);
  ok(`[${w}] 검색 0건 안내 + 입력 포커스 유지`, (await p.locator(".catalog-main").innerText()).includes("조건에 맞는 제품이 없어요") && await p.evaluate(() => document.activeElement.id === "v6pf-q"));
  await p.locator(".v6-empty").getByRole("button", { name: "필터 초기화" }).click(); await p.waitForTimeout(200);
  ok(`[${w}] 필터 초기화로 복구`, await p.locator(".v6-pcard").count() === pub.length);
  await p.locator(".v6-pcard").first().getByRole("button", { name: "상세" }).click(); await p.waitForTimeout(200);
  ok(`[${w}] 상세 시트 열림`, await p.locator("#pd-sheet").isVisible() && (await p.locator("#pd-sheet").innerText()).includes(pub[0].name));
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  ok(`[${w}] Esc로 닫히고 상세 버튼으로 포커스 복귀`, !(await p.locator("#pd-sheet").isVisible()) && await p.evaluate(() => !!document.activeElement.dataset.detail));
  await p.locator(".v6-pcard").first().getByRole("button", { name: "저장" }).click(); await p.waitForTimeout(150);
  await p.selectOption("#v6pf-view", "saved"); await p.waitForTimeout(150);
  ok(`[${w}] 저장 → 저장한 제품 보기`, await p.locator(".v6-pcard").count() === 1);
  ok(`[${w}] 비로그인: 브랜드 참여 후 신청(초대 링크)`, (await p.locator(".v6-pcard a.btn").first().getAttribute("href")).startsWith("/?brand=" + pub[0].brandId));
  ok(`[${w}] 가로 넘침 없음`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  ok(`[${w}] 페이지 오류 없음`, !errs.length, errs.join("|"));
  await p.close();
}
// 로그인 멤버: 다른 브랜드(FAU) 공간에 있어도 '조건 보고 신청'은 그 제품 브랜드의 캠페인 상세로 연결
const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto(APP + "/"); await p.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.creator, API]);
await p.reload(); await p.waitForFunction(() => window.__ME && LIVE.campaigns, null, { timeout: 15000 });
await p.evaluate(() => V8brand("fau")); await p.waitForTimeout(300);
ok("커뮤니티 캠페인 화면에 전체 브랜드 필터 없음", !(await p.locator(".v2-main").innerText()).includes("전체 브랜드"));
await p.goto(APP + "/products/"); await p.waitForSelector(".v6-pcard"); await p.waitForTimeout(800);
const href = await p.locator(".v6-pcard a.btn.pri").first().getAttribute("href");
ok("로그인 멤버: 조건 보고 신청 링크", /^\/#\/c-campaigns\//.test(href || ""), href);
await p.goto(APP + href); await p.reload(); await p.waitForTimeout(2000);
ok("링크 → 해당 브랜드(고려) 공간 캠페인 상세", await p.evaluate(() => currentBrand().brandId) === pub[0].brandId && await p.locator("#v6-cdetail").count() === 1);
await br.close();
for (const r of results) console.log(r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`PASS ${results.length - fail} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
