// 관리자 v8.1 E2E — 실제 로컬 API·DB, 실브라우저 클릭(1280 / 390). 운영 메일 발송·OAuth·실결제 없음.
// 모집 5단계(브랜드 선택 → 제안 확인 → 대상 찾기 → 메일 나누기 → 최종 확인) + 210개 발신 계정 fixture 에서 200개 선택 상한,
// Gmail 운영 필터·20개 페이지·CSV 메타데이터, 신고 조치의 실제 효과(D05)·복구, 협업 제출=검수 같은 기록(D03),
// 불러오기 실패 표시(D07), 비용·성과, 브랜드 대리운영(1회용 전환 → 콘솔), 390 메뉴.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const API = process.env.API_URL || "http://localhost:8765";
const ADM = process.env.ADMIN_URL || "http://localhost:5176";
const CON = process.env.CONSOLE_URL || "http://localhost:5174";
const DB = process.env.E2E_DB || "postgresql://postgres:postgres@localhost:5432/v8dev";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = []; const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const sql = (q) => execFileSync("psql", [DB, "-Atc", q], { encoding: "utf8" }).trim();
const tag = Date.now().toString(36).slice(-5);
const shots = "docs/qa/v8";
const SCOPES = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly openid email";

// ---- fixture: 공용 모집 공간 + 210개 발신 계정(중지 3·연결 필요 2) + 제품 제안 + 후보 6명 ----
await api("POST", "/admin/recruitment/workspace", null, T.admin);
sql(`UPDATE gmail_accounts SET state='revoked' WHERE brand_id='dino-recruitment' AND email LIKE 'e2e-%'`);
sql(`INSERT INTO gmail_accounts(brand_id,email,scopes) SELECT 'dino-recruitment','e2e-'||lpad(g::text,3,'0')||'-${tag}@sender.example','${SCOPES}' FROM generate_series(1,210) g;
UPDATE gmail_accounts SET sending_paused=true, pause_reason='qa' WHERE email IN ('e2e-005-${tag}@sender.example','e2e-006-${tag}@sender.example','e2e-007-${tag}@sender.example');
UPDATE gmail_accounts SET state='revoked' WHERE email IN ('e2e-008-${tag}@sender.example','e2e-009-${tag}@sender.example');`);
const first = sql(`SELECT account_id FROM gmail_accounts WHERE email='e2e-001-${tag}@sender.example'`);
const prod = (await api("GET", "/brands/goryeo1392/products", null, T.goryeo1392)).body.find((p) => p.state !== "archived");
const mp = await api("POST", "/admin/recruitment/mappings", { name: `E2E 제안 ${tag}`, target_brand_id: "goryeo1392", product_id: prod.productId, gmail_account_id: first, state: "active", country: "US", subject: "{{brand}} 협업 제안 {{name}}", body: "{{product}} 제안드려요 — {{reason}}" }, T.admin);
const csv = "platform,platform_uid,handle,display_name,email,country,lang,category,product_tags,followers,bio\n" + Array.from({ length: 6 }, (_, i) => `tiktok,uid-${tag}-${i},e2e_${tag}_${i},E2E Creator ${i},e2e.${tag}.${i}@creator.example,US,en,Beauty & Personal Care,skincare;serum,${20000 + i},bio`).join("\n");
const pool = await api("POST", "/admin/pool/candidates", { csv }, T.admin);
ok("fixture: 공용 모집 210개 계정·제품 제안·후보", mp.status === 200 && pool.status === 200, `${mp.status}/${pool.status} ${JSON.stringify(mp.body).slice(0, 80)}`);

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
// 로컬 콘솔(5174)도 로컬 API 를 쓰게 — 운영 주소로 나가지 않는다
await ctx.addInitScript((a) => { if (location.port === "5174") localStorage.setItem("CONNECTION_API_URL", a); }, API);
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
await p.goto(ADM + "/"); await p.evaluate((t) => localStorage.setItem("CONNECTION_JWT", t), T.admin);
await p.goto(ADM + "/dashboard"); await p.waitForSelector(".v2.v2-admin");
const menu = await p.locator(".v2-side .v2-navbtn").allInnerTexts();
ok("셸: v8.1 관리자 메뉴 10개(시안 순서)", ["대시보드", "브랜드 신청", "신고 처리함", "분쟁 심판", "검수 현황", "디노 공용 모집", "브랜드 운영", "계정별 메일함", "Gmail 운영", "후보 풀"].every((l, i) => (menu[i] || "").startsWith(l)), menu.join("|"));
const main = () => p.locator(".v2-main").innerText();
const click = async (name, exact = true) => { await p.locator(".v2-main").getByRole("button", { name, exact }).first().click(); await p.waitForTimeout(900); };

// 1) 모집 8탭 · 5단계 · 200개 상한
await p.locator(".v2-side .v2-navbtn", { hasText: "디노 공용 모집" }).click(); await p.waitForTimeout(1500);
const tabs = await p.locator(".recruitment-workspace .v6-tabs [role=tab]").allInnerTexts();
ok("모집: 8개 탭", tabs.join("|") === "모집 시작|반복 모집|발송 내역|크리에이터·메일|회신·성과|테스트 발송|브랜드 승인·커뮤니티|브랜드·메일 설정", tabs.join("|"));
await p.locator(".recruitment-workspace .v6-tabs [role=tab]", { hasText: "모집 시작" }).click(); await p.waitForTimeout(800);
const steps = await p.locator(".v6-steps button").allInnerTexts();
ok("모집: 5단계 표시", steps.map((s) => s.replace(/^✓ /, "")).join("|") === "1. 브랜드 선택|2. 제안 확인|3. 대상 찾기|4. 메일 나누기|5. 최종 확인", steps.join("|"));
await p.locator("label.flow-choice", { hasText: prod.name }).filter({ has: p.locator("input:not([disabled])") }).first().locator("input").check(); await p.waitForTimeout(300);
await click("다음 · 제안 확인 →");
await p.locator(".flow-proposal .flow-check input").first().check();
await click("확인한 제안 저장 · 대상 찾기 →"); await p.waitForTimeout(1200);
await p.locator(".flow-check", { hasText: "미검증 이메일도" }).locator("input").check();
await p.locator(".flow-check", { hasText: "제품 일치 근거가 있는 후보만" }).locator("input").uncheck();
await click("조건에 맞는 대상 찾기 · 발송 없음"); await p.waitForTimeout(2000); if (process.env.DEBUG) console.log("DEBUG", (await main()).slice(0, 1500));
await p.locator(".flow-check", { hasText: "대상 적합성" }).locator("input").check();
await click("다음 · 발신 계정 선택 →"); await p.waitForTimeout(800);
const stat = async (l) => Number((await p.locator(".v8-senders .v6-stat", { hasText: l }).locator("b").innerText()).replace(/\D/g, ""));
const total = await stat("전체 계정");
ok("4단계 메일 나누기: 계정 210개 이상 목록·상태 집계", total >= 210 && (await stat("중지")) >= 3, `전체 ${total}`);
const pagerTxt = await p.locator(".v8-senders .v6-meta[aria-live]").last().innerText();
ok("4단계: 20개씩 페이지", (await p.locator(".v8-senders .v6-senders .v6-tr:not(.v6-th)").count()) === 20 && /1–20/.test(pagerTxt), pagerTxt);
await p.locator("#sp-q").fill(`-${tag}@sender`); await p.waitForTimeout(300);
const searched = Number(((await p.locator(".v8-senders .v6-meta[aria-live]").last().innerText()).match(/^(\d+)개/) || [])[1]);
await p.locator("#sp-s").selectOption("paused"); await p.waitForTimeout(300);
const pausedRows = await p.locator(".v8-senders .v6-senders .v6-tr:not(.v6-th)").count();
const pausedDisabled = await p.locator(".v8-senders .v6-senders .v6-tr:not(.v6-th) input").first().isDisabled();
ok("4단계: 검색·상태 필터(중지 계정은 선택 불가)", searched === 210 && pausedRows === 3 && pausedDisabled, `${searched}/${pausedRows}`);
await p.locator("#sp-q").fill(`-${tag}@`); await p.locator("#sp-s").selectOption(""); await p.waitForTimeout(300);
await p.locator(".v8-senders").getByRole("button", { name: /검색 결과 중 배정 가능/ }).click(); await p.waitForTimeout(400);
const cnt = await p.locator(".v8-senders .v6-actions .v6-meta").innerText();
const lastPageBtn = p.locator(".v8-senders .v6-pager .v6-pill").last(); await lastPageBtn.click(); await p.waitForTimeout(300);
const unselected = p.locator(".v8-senders .v6-senders .v6-tr:not(.v6-th) input:not(:checked)").first();
const capDisabled = (await unselected.count()) ? await unselected.isDisabled() : true;
ok("4단계: 필터 결과 한 번에 선택 → 200/200 상한, 초과 선택 불가", /선택 200 \/ 최대 200/.test(cnt) && capDisabled, cnt);
await p.screenshot({ path: `${shots}/admin-recruit-step4-200-1280.png` });
await click("브랜드 전체 초안 미리보기"); await p.waitForTimeout(2500);
const pv = await main();
ok("4단계: 200개 선택으로 서버 미리보기(배정·제외 집계, 발송 없음)", /초안에 넣을 주소/.test(pv) && !/422|409/.test(pv), (pv.match(/(\d+)\s*초안에 넣을 주소/) || [])[0]);

// 2) Gmail 운영: 필터·페이지·CSV 메타데이터
await p.locator(".v2-side .v2-navbtn", { hasText: "Gmail 운영" }).click(); await p.waitForTimeout(1500);
await p.locator("#sd-q").fill(`-${tag}@sender`); await p.waitForTimeout(300);
const gm = await p.locator(".v2-main .v6-meta[aria-live]").innerText();
await p.locator("#sd-s").selectOption("paused"); await p.waitForTimeout(300);
const gmPaused = await p.locator(".v6-senders .v6-tr:not(.v6-th)").count();
ok("Gmail 운영: 검색 210개 · 20개씩 · 상태 필터", /210개 중 1–20/.test(gm) && gmPaused === 3, gm);
await p.locator("#sd-q").fill(""); await p.locator("#sd-s").selectOption("");
await p.locator("#sd-csv").fill(`meta-${tag}@sender.example,goryeo1392,하린\nbad-email,goryeo1392,x\nmeta-${tag}@sender.example,,중복\nmeta2-${tag}@sender.example,no-such-brand,y`);
await click("검수");
const rv = await main();
ok("Gmail 운영: CSV 검수(형식 오류·중복·없는 브랜드)", rv.includes("이메일 형식 오류") && rv.includes("이미 등록됨") && rv.includes("없는 브랜드 ID"));
await click("검수 통과 1개 등록"); await p.waitForTimeout(800);
await p.locator("#sd-q").fill(`meta-${tag}`); await p.waitForTimeout(300);
ok("Gmail 운영: 등록 → ‘연결 전’으로 목록(연결은 소유자 승인 필요)", (await p.locator(".v6-senders .v6-tr:not(.v6-th)").innerText()).includes("연결 전") && sql(`SELECT count(*) FROM gmail_accounts WHERE email='meta-${tag}@sender.example'`) === "0");

// 3) 신고 조치 실제 효과(D05) + 복구
const cell = (await api("GET", "/community/my-cells", null, T.creator)).body.find((c) => c.brandId === "goryeo1392" && c.kind !== "dm").cellId;
const msg = (await api("POST", `/community/cells/${cell}/messages`, { text: `신고 대상 ${tag}`, channel: "chat" }, T.creator)).body;
const rep = (await api("POST", "/reports", { cell_id: cell, msg_id: String(msg.msgId), reporter: "e2e", reason: "spam" }, T.admin)).body;
await p.locator(".v2-side .v2-navbtn", { hasText: "신고 처리함" }).click(); await p.waitForTimeout(1500);
await p.locator(".v6-row", { hasText: `신고 대상 ${tag}` }).getByRole("button", { name: "숨김 + 7일 쓰기 제한" }).click(); await p.waitForTimeout(1500);
const memberView = (await api("GET", `/community/cells/${cell}/messages`, null, T.goryeo1392)).body.some((m) => m.msgId === msg.msgId);
const blocked = await api("POST", `/community/cells/${cell}/messages`, { text: "제한 중 글", channel: "chat" }, T.creator);
ok("신고: 7일 제한 조치 → 실제 숨김·작성자 글쓰기 403·화면에 적용 결과", !memberView && blocked.status === 403 && (await main()).includes("쓰기 제한"), String(blocked.status));
await p.locator(".v6-tabs [role=tab]", { hasText: "처리한 신고·효과" }).click(); await p.waitForTimeout(1200);
await p.locator(".v6-row", { hasText: `신고 대상 ${tag}` }).getByRole("button", { name: "복구" }).click(); await p.waitForTimeout(1500);
const back = (await api("GET", `/community/cells/${cell}/messages`, null, T.goryeo1392)).body.some((m) => m.msgId === msg.msgId);
const canWrite = await api("POST", `/community/cells/${cell}/messages`, { text: `복구 후 글 ${tag}`, channel: "chat" }, T.creator);
ok("신고: 복구 → 메시지 다시 보임·글쓰기 가능", back && canWrite.status === 200 && (await main()).includes("복구됨"));

// 4) 불러오기 실패(D07)는 0건과 다르게
await p.route("**/admin/reports?status=open", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "일시 오류" }) }));
await p.locator(".v6-tabs [role=tab]", { hasText: "대기" }).click(); await p.waitForTimeout(800);
const failTxt = await main();
ok("D07: 조회 500 → ‘불러오지 못했어요 · 0건이 아니에요’(빈 목록 아님)", failTxt.includes("불러오지 못했어요") && failTxt.includes("0건이 아니에요") && !failTxt.includes("대기 중인 신고가 없어요"));
await p.unroute("**/admin/reports?status=open");

// 5) 협업 제출 = 검수 현황 같은 기록(D03)
const subs = (await api("GET", "/submissions?status=in_review", null, T.admin)).body.filter((s) => s.source === "collab");
await p.locator(".v2-side .v2-navbtn", { hasText: "검수 현황" }).click(); await p.waitForTimeout(1500);
const sv = await main();
ok("D03: 크리에이터 협업 제출이 검수 현황에 버전과 함께", subs.length === 0 ? sv.includes("검수 대기 제출물이 없어요") : sv.includes("협업 제출 v"), `collab in_review ${subs.length}`);

// 6) 비용·성과 / 사람·권한
await p.locator(".v2-side .v2-navbtn", { hasText: "대시보드" }).click(); await p.waitForTimeout(600);
await p.locator(".v2-subtabs button", { hasText: "비용·성과" }).click(); await p.waitForTimeout(1800);
const fin = await main();
ok("대시보드 › 비용·성과: 서버 집계·미확인 표시", fin.includes("제공자 접수") && fin.includes("미확인"));
await p.locator(".v2-side .v2-navbtn", { hasText: "브랜드 운영" }).click(); await p.waitForTimeout(600);
await p.locator(".v2-subtabs button", { hasText: "사람·권한" }).click(); await p.waitForTimeout(1500);
ok("브랜드 운영 › 사람·권한: 브랜드 계정·역할", (await main()).includes("소유자") || (await main()).includes("운영자"));

// 7) 브랜드 대리운영: 콘솔 열기 → 1회용 전환 → 그 브랜드 콘솔(관리자)
await p.locator(".v2-subtabs button", { hasText: "브랜드 목록" }).click(); await p.waitForTimeout(1500);
const [con] = await Promise.all([p.context().waitForEvent("page"), p.locator(".wkb-row", { hasText: "goryeo1392" }).getByRole("button", { name: "브랜드 콘솔 열기" }).first().click()]);
await con.waitForFunction(() => window.__C8 && window.__C8.active() && document.querySelector(".v2-brand"), null, { timeout: 15000 }).catch(() => {});
const cstate = await con.evaluate(() => ({ url: location.href, me: window.__ME && window.__ME.kind, brand: localStorage.getItem("CONNECTION_ADMIN_BRAND"), ws: (document.querySelector(".v2-ws b") || {}).textContent || "" }));
ok("브랜드 콘솔 열기: 1회용 코드 교환 → 관리자 권한으로 그 브랜드 콘솔(주소에 코드·JWT 없음)", cstate.me === "admin" && cstate.brand === "goryeo1392" && !/handoff|eyJ/.test(cstate.url), JSON.stringify(cstate));
await con.close();

// 8) 390 메뉴·가로 넘침
const m = await br.newPage({ viewport: { width: 390, height: 844 } }); const merr = []; m.on("pageerror", (e) => merr.push(e.message));
await m.goto(ADM + "/"); await m.evaluate((t) => localStorage.setItem("CONNECTION_JWT", t), T.admin); await m.goto(ADM + "/gmail"); await m.waitForTimeout(1500);
ok("390: 메뉴 기본 숨김", !(await m.locator(".v2-side").isVisible()));
await m.getByRole("button", { name: "메뉴 열기" }).click(); await m.waitForTimeout(300);
await m.locator(".v2-side .v2-navbtn", { hasText: "디노 공용 모집" }).click(); await m.waitForTimeout(1500);
ok("390: 메뉴로 이동 + 가로 넘침 없음", (await m.locator(".v2-main h1").first().innerText()).includes("디노 공용 모집") && await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await m.screenshot({ path: `${shots}/admin-recruit-390.png` });
ok("페이지 오류 없음", !errs.length && !merr.length, errs.concat(merr).join(" | "));
await br.close();
sql(`UPDATE outreach_batches SET state='cancelled' WHERE brand_id='dino-recruitment' AND state='draft'`);
for (const r of results) console.log(r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`PASS ${results.length - fail} FAIL ${fail}`);
writeFileSync(`${shots}/admin-e2e.json`, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
process.exit(fail ? 1 : 0);
