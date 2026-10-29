// 콘솔 세션 경계 E2E — 실제 로컬 API, 실브라우저. 새로고침으로 상태를 가리지 않는다.
// 1) 로그인 화면 8초+ 대기 → UI 로그인 → DM 열어 둔 채 크리에이터 새 메시지 → 탭 전환·수동 이동 없이 표시(폴러 재시작)
// 2) 다른 탭 로그아웃 → 이 탭 인증 화면·입력/사진 메모리 폐기, 다른 탭 재로그인 → 깨끗한 재로딩
// 3) 이전 세션의 늦은 401 은 새 로그인을 끊지 않음, 현재 세션 401 만 로그아웃
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const API = process.env.API_URL || "http://localhost:8765";
const CON = process.env.CONSOLE_URL || "http://localhost:5174";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = []; const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const tag = Date.now().toString(36).slice(-5);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4oaGBFTEMLQkAgl1GAWqNFmsAAAAASUVORK5CYII=", "base64");
const creator = (await api("GET", "/me/profile", null, T.creator)).body;
const dmCell = (await api("POST", "/community/dm/goryeo1392", {}, T.creator)).body.cellId || `dm-goryeo1392--${creator.creatorId}`;

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());

// 1) 로그인 전 8초 이상 대기 → UI 로그인
await p.goto(CON + "/"); await p.evaluate((a) => { localStorage.clear(); localStorage.setItem("CONNECTION_API_URL", a); }, API); await p.reload();
await p.waitForSelector("#authChip"); await p.waitForTimeout(9000);
await p.locator("#authChip").click(); await p.locator("#axEmail").fill("goryeo@local.test"); await p.locator("#axPw").fill("brand-pass-1234");
await p.locator("#authPanel").getByRole("button", { name: "로그인", exact: true }).click();
await p.waitForFunction(() => window.__C8 && window.__C8.active() && document.querySelector(".v2-brand"), null, { timeout: 15000 });
const navs = await p.evaluate(() => performance.getEntriesByType("navigation").length);
await p.evaluate((c) => C8.openDm(c), dmCell); await p.waitForTimeout(1500);
const msg = "폴러 확인 " + tag;
await api("POST", `/community/cells/${dmCell}/messages`, { text: msg, channel: "chat" }, T.creator);
let seen = false; for (let i = 0; i < 25 && !seen; i++) { await p.waitForTimeout(1000); seen = (await p.locator(".v6-feed").innerText().catch(() => "")).includes(msg); }
ok("로그인 전 8초+ 대기 → UI 로그인 → 크리에이터 새 DM 자동 표시(탭 전환·이동·새로고침 없음)", seen && navs === await p.evaluate(() => performance.getEntriesByType("navigation").length));

// 2) 다른 탭 로그아웃 → 이 탭 인증 화면 + 입력·사진 메모리 폐기
await p.evaluate(() => C8.go("b-products")); await p.waitForTimeout(800);
await p.locator(".v2-main").getByRole("button", { name: "새 제품 등록" }).click(); await p.waitForTimeout(500);
await p.locator('[data-f="P.name"]').fill("다른탭 테스트 " + tag);
await p.locator("input[type=file]").first().setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG }); await p.waitForTimeout(400);
const blob = await p.locator(".c8-newimg img").getAttribute("src");
const q = await ctx.newPage(); await q.goto(CON + "/"); await q.waitForTimeout(800);
await q.evaluate(() => localStorage.removeItem("CONNECTION_JWT")); await p.waitForTimeout(1200);
const afterOut = await p.evaluate((b) => ({ me: window.__ME, active: window.__C8.active(), c8: document.body.classList.contains("c8"), name: !!document.querySelector('[data-f="P.name"]'), blobAlive: null, chip: (document.getElementById("authChip") || {}).textContent || "" }), blob);
const blobDead = await p.evaluate((b) => fetch(b).then(() => false, () => true), blob);
ok("다른 탭 로그아웃 → 이 탭 즉시 인증 화면(옛 __ME·입력 폼 없음)", afterOut.me === null && !afterOut.active && !afterOut.name && afterOut.chip.includes("로그인"), JSON.stringify(afterOut));
ok("다른 탭 로그아웃 → 선택 사진 objectURL 폐기", blob.startsWith("blob:") && blobDead);
// 다른 탭에서 다시 로그인(JWT 설정) → 이 탭 깨끗한 재로딩
const reloaded = p.waitForEvent("load", { timeout: 8000 }).then(() => true, () => false);
await q.evaluate((t) => localStorage.setItem("CONNECTION_JWT", t), T.goryeo1392);
const didReload = await reloaded;
await p.waitForFunction(() => window.__C8 && window.__C8.active() && document.querySelector(".v2-brand"), null, { timeout: 15000 });
ok("다른 탭 재로그인 → 이 탭 깨끗한 재로딩 후 로그인 상태", didReload && await p.evaluate(() => !!window.__ME && window.__ME.kind === "brand"));
await q.close();

// 3) 이전 세션의 늦은 401 은 무시, 현재 세션 401 만 로그아웃
await p.route("**/brands/goryeo1392/team", async (r) => { await new Promise((s) => setTimeout(s, 1500)); r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "만료" }) }); });
await p.evaluate(() => C8.reload("team")); await p.waitForTimeout(200);
// 이전 요청이 떠 있는 채로 로그아웃 → 같은 탭에서 다른 계정 로그인(앱과 같은 순서: 로그아웃 → JWT 저장 → /auth/me → __ME → 렌더)
await p.evaluate(([t, a]) => { authLogout(); localStorage.setItem("CONNECTION_JWT", t); return fetch(a + "/auth/me", { headers: { Authorization: "Bearer " + t } }).then((r) => r.json()).then((u) => { window.__ME = u; window.render(); }); }, [T.fau, API]);
await p.waitForTimeout(2500);
const late = await p.evaluate((t) => ({ jwt: localStorage.getItem("CONNECTION_JWT") === t, me: window.__ME && window.__ME.brandId, active: window.__C8.active() }), T.fau);
ok("이전 세션(고려)의 늦은 401 → 새 로그인(FAU) 유지", late.jwt && late.me === "fau" && late.active, JSON.stringify(late));
await p.unroute("**/brands/goryeo1392/team");
await p.route("**/brands/fau/team", (r) => r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "세션 만료" }) }));
await p.evaluate(() => C8.reload("team")); await p.waitForTimeout(1200);
const cur = await p.evaluate(() => ({ jwt: localStorage.getItem("CONNECTION_JWT"), me: window.__ME, active: window.__C8.active() }));
ok("현재 세션 401 → 기존 인증 core 로 로그아웃(JWT·__ME 제거)", !cur.jwt && cur.me === null && !cur.active, JSON.stringify(cur));
// 로그아웃 뒤 폴러가 이전 세션 요청을 계속 보내지 않음
let after = 0; p.on("request", (r) => { if (/\/me\/unread/.test(r.url())) after++; });
await p.waitForTimeout(10000);
ok("로그아웃 뒤 폴러 정지(이전 세션 요청 없음)", after === 0, String(after));
ok("페이지 오류 없음", !errs.length, errs.join(" | "));
await br.close();
for (const r of results) console.log(r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`PASS ${results.length - fail} FAIL ${fail}`);
writeFileSync("docs/qa/v8/console-session-e2e.json", JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
process.exit(fail ? 1 : 0);
