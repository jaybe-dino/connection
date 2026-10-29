// 콘솔 검수 반영 E2E — 실제 로컬 API·DB, 실브라우저 클릭(1280 / 390). 외부 발송·실결제·운영 초대 발송 없음.
// 공개 전환(연타·500), owner 팀 등록·초대 링크, 조회자 첫 화면 쓰기 잠금, 샘플 없는 캠페인(콘솔↔크리에이터),
// 사람 검증 라벨, 청구 고객 문구, DM 관련 캠페인 선택·태그·AI 초안(미연결 실오류), 회신 AI 초안, 내 메일함 테스트 발송,
// 추가 채널 캠페인 게시, 신규 제품 사진 먼저 선택(업로드 실패 → 같은 제품 재시도), 390 목록→상세(20+ 항목 마지막 클릭).
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const API = process.env.API_URL || "http://localhost:8765";
const CON = process.env.CONSOLE_URL || "http://localhost:5174";
const APP = process.env.APP_URL || "http://localhost:5175";
const DB = process.env.E2E_DB || "postgresql://postgres:postgres@localhost:5432/v8dev";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = []; const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const sql = (q) => execFileSync("psql", [DB, "-Atc", q], { encoding: "utf8" }).trim();
const tag = Date.now().toString(36).slice(-5);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4oaGBFTEMLQkAgl1GAWqNFmsAAAAASUVORK5CYII=", "base64");
const shots = "docs/qa/v8";
const B = "goryeo1392";

const br = await chromium.launch();
async function open(tok, vp = { width: 1280, height: 900 }, adminBrand) {
  const page = await br.newPage({ viewport: vp }); page.errs = []; page.on("pageerror", (e) => page.errs.push(e.message)); page.on("dialog", (d) => d.accept());
  await page.goto(CON + "/"); await page.evaluate(([t, a, ab]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); if (ab) localStorage.setItem("CONNECTION_ADMIN_BRAND", ab); }, [tok, API, adminBrand || ""]);
  await page.reload(); await page.waitForFunction(() => window.__C8 && window.__C8.active() && document.querySelector(".v2-brand"), null, { timeout: 15000 });
  return page;
}
const p = await open(T[B]);
const main = (pg = p) => pg.locator(".v2-main").innerText();
const go = async (s, id, pg = p) => { await pg.evaluate(([x, y]) => C8.go(x, y), [s, id || ""]); await pg.waitForTimeout(1000); };
const fill = async (key, v, pg = p) => { await pg.locator(`[data-f="${key}"]`).fill(v); };
const click = async (name, pg = p) => { await pg.locator(".v2-main").getByRole("button", { name, exact: true }).first().click(); await pg.waitForTimeout(1200); };
const toasts = (pg = p) => pg.evaluate(() => Array.from(document.querySelectorAll("#toastWrap .toast, #toast")).map((x) => x.textContent).join(" | "));

// 1) 신규 제품: 사진 먼저 선택(서버 저장 전 미리보기만) → 검증 저장 때 생성 → 업로드 실패 → 같은 제품으로 재시도
await go("b-products"); await click("새 제품 등록");
const pname = `사진먼저 ${tag}`;
await p.locator('input[type=file]').first().setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG }); await p.waitForTimeout(400);
const preview = await p.locator(".c8-newimg img").getAttribute("src");
const before = (await api("GET", `/brands/${B}/products`, null, T[B])).body.filter((x) => x.name === pname).length;
ok("신규 제품: 저장 전 사진 선택·미리보기(서버 미생성)", preview && preview.startsWith("blob:") && before === 0 && (await main()).includes("저장할 때 함께 올려요"));
await fill("P.name", pname); await p.locator('select[data-f="P.category"]').selectOption("스킨케어");
await fill("P.usp.0", "진정"); await fill("P.usp.1", "보습"); await fill("P.usp.2", "저자극"); await fill("P.desc", "사진부터 등록한 앰플이에요");
await p.locator('[data-farr="P.ship"][value="US"]').check();
let failImg = true;
await p.route("**/products/*/images?slot=main", (r) => failImg && r.request().method() === "POST" ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "테스트 업로드 실패" }) }) : r.continue());
await click("검증하고 저장"); await p.waitForTimeout(800);
const afterFail = (await api("GET", `/brands/${B}/products`, null, T[B])).body.filter((x) => x.name === pname);
const m1 = await main();
ok("신규 제품: 업로드 실패 → 성공 표시 없이 오류·입력·선택 사진 유지", afterFail.length === 1 && m1.includes("사진을 올리지 못했어요") && !(await toasts()).includes("제품을 저장했어요") && (await p.locator('[data-f="P.desc"]').inputValue()) === "사진부터 등록한 앰플이에요" && (await p.locator(".c8-newimg img").getAttribute("src")).startsWith("blob:"), JSON.stringify({ n: afterFail.length }));
failImg = false;
await click("검증하고 저장"); await p.waitForTimeout(1200);
const afterOk = (await api("GET", `/brands/${B}/products`, null, T[B])).body.filter((x) => x.name === pname);
ok("신규 제품: 다시 저장 → 같은 제품에 실제 사진 업로드(제품 1개)", afterOk.length === 1 && afterOk[0].productId === afterFail[0].productId && (afterOk[0].images || []).some((i) => i.slot === "main") && !(await main()).includes("사진을 올리지 못했어요"));
await p.unroute("**/products/*/images?slot=main");

// 2) 공개 전환: 연타는 처리 중 차단, 500 이면 오류만(성공 토스트 없음), 성공하면 오류 지움
const prodId = afterOk[0].productId;
await p.evaluate(() => { document.querySelectorAll("#toastWrap .toast").forEach((x) => x.remove()); });
await p.route(`**/products/${prodId}/public`, async (r) => { await new Promise((s) => setTimeout(s, 700)); r.continue(); });
await p.locator("#P-public").click(); await p.waitForTimeout(80);
const disabledWhileBusy = await p.locator("#P-public").isDisabled();
await p.locator("#P-public").click({ force: true }).catch(() => {}); await p.waitForTimeout(1500);
const srv1 = (await api("GET", `/brands/${B}/products`, null, T[B])).body.find((x) => x.productId === prodId);
ok("공개 전환: 처리 중 다시 누를 수 없음 → 서버 한 번 반영(공개)", disabledWhileBusy && srv1.publicListed === true && await p.locator("#P-public").isChecked());
await p.unroute(`**/products/${prodId}/public`);
await p.evaluate(() => { document.querySelectorAll("#toastWrap .toast").forEach((x) => x.remove()); });
await p.route(`**/products/${prodId}/public`, (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "일시 오류" }) }));
await p.locator("#P-public").click(); await p.waitForTimeout(900);
const t500 = await toasts();
ok("공개 전환: 500 → 오류만 표시, 성공 토스트 없음, 체크는 서버 상태(공개 유지)", (await main()).includes("공개를 내리지 못했어요") && !t500.includes("내렸어요") && await p.locator("#P-public").isChecked(), t500);
await p.unroute(`**/products/${prodId}/public`);
await p.locator("#P-public").click(); await p.waitForTimeout(1200);
const srv2 = (await api("GET", `/brands/${B}/products`, null, T[B])).body.find((x) => x.productId === prodId);
ok("공개 전환: 다시 성공 → 오류 지움·서버 비공개", srv2.publicListed === false && !(await main()).includes("공개를 내리지 못했어요") && !(await p.locator("#P-public").isChecked()));

// 3) 샘플 없는 캠페인: 콘솔 3단계 샘플 0 → API sampleRequired=false → 크리에이터 합의 후 바로 영상 제출
await go("b-create");
await p.locator('[data-f="W.goal"][value="ugc"]').check(); await p.waitForTimeout(300);
await fill("W.name", `샘플없음 ${tag}`); await p.locator('[data-farr="W.countries"][value="US"]').check();
await fill("W.start", "2026-11-01"); await fill("W.end", "2026-12-20"); await click("다음");
await p.locator('select[data-f="W.productId"]').selectOption(prodId); await p.waitForTimeout(400); await click("다음");
await fill("W.fee", "50"); await fill("W.payAt", "확인 후 14일"); await fill("W.sampleQty", "0"); await fill("W.length", "30초"); await fill("W.due", "합의 후 7일"); await fill("W.cap", "5");
await click("다음"); await click("모집 시작"); await p.waitForTimeout(800);
const nsCamp = (await api("GET", `/brands/${B}/campaigns`, null, T[B])).body.find((c) => c.name === `샘플없음 ${tag}`);
ok("샘플 없음: 콘솔 저장 → 서버 sampleRequired=false·조건 문장", nsCamp && nsCamp.sampleRequired === false && nsCamp.lifecycle === "published" && nsCamp.conditions.includes("샘플 없음 · 보유 제품으로 촬영"), JSON.stringify(nsCamp && { s: nsCamp.sampleRequired, c: nsCamp.conditions }));
await api("POST", `/campaigns/${nsCamp.campaignId}/apply`, { creator_id: "x", message: "보유 제품 있어요" }, T.creator);
const crId = (await api("GET", `/brands/${B}/campaigns/${nsCamp.campaignId}/applicants`, null, T[B])).body[0].creatorId;
await api("POST", `/brands/${B}/campaigns/${nsCamp.campaignId}/select`, { creator_id: crId }, T[B]);
const offer = ((await api("GET", "/me/campaign-offers", null, T.creator)).body || []).find((o) => o.campaignId === nsCamp.campaignId);
const agree = await api("POST", `/me/campaign-offers/${nsCamp.campaignId}/agree`, { accept: true, handle: "@nosample" + tag, terms_fingerprint: offer.termsFingerprint }, T.creator);
ok("샘플 없음: 합의 스냅샷 sampleRequired=false", agree.status === 200 && agree.body.agreedTerms.sampleRequired === false);
const cp = await br.newPage({ viewport: { width: 1280, height: 900 } }); cp.errs = []; cp.on("pageerror", (e) => cp.errs.push(e.message));
await cp.goto(APP + "/"); await cp.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.creator, API]);
await cp.reload(); await cp.waitForFunction(() => window.__ME && LIVE.campaigns && LIVE.offers, null, { timeout: 15000 });
await cp.evaluate((b) => V8brand(b), B); await cp.waitForTimeout(500);
await cp.evaluate((c) => V8go("c-work", c), nsCamp.campaignId); await cp.waitForTimeout(800);
const cw = await cp.locator(".v2-main").innerText();
ok("샘플 없음: 크리에이터 합의 후 주소 없이 바로 영상 제출 화면", cw.includes("영상 제출") && cw.includes("영상 링크") && !cw.includes("샘플 받을 주소") && !cw.includes("샘플 발송 대기") && cw.includes("조건 합의"));
await cp.locator("#vdUrl").fill("https://www.tiktok.com/@nosample/video/" + tag); await cp.getByRole("button", { name: "영상 제출", exact: true }).click(); await cp.waitForTimeout(1200);
const off2 = ((await api("GET", "/me/campaign-offers", null, T.creator)).body || []).find((o) => o.campaignId === nsCamp.campaignId);
ok("샘플 없음: 크리에이터 실제 클릭 제출 → content_submitted", off2.state === "content_submitted");
await go("b-samples"); await p.evaluate((c) => C8.pick("scCamp", c), nsCamp.campaignId); await p.waitForTimeout(1200);
ok("샘플 없음: 콘솔 샘플 화면에 주소·발송 요청 없음", !(await main()).includes("DM으로 주소 요청") && !(await main()).includes("발송 처리"));
await cp.close();

// 4) 지원자 라벨: 운영팀 사람 검증(TikTok 소유 인증과 구분)
await go("b-applicants"); await p.evaluate((c) => C8.pick("appCamp", c), nsCamp.campaignId); await p.waitForTimeout(1200);
const ap = await main();
ok("지원자: ‘운영팀 확인’ 라벨(계정 미확인·TikTok 표현 없음)", (ap.includes("운영팀 확인 크리에이터") || ap.includes("운영팀 확인 전")) && !ap.includes("계정 미확인") && !ap.includes("계정 확인됨"));

// 5) 청구: 내부 검토 메모 없음
await go("b-billing"); await p.waitForTimeout(1500);
const bill = await main();
ok("청구: 고객 문구만(검토 중 정책·서버 집계 미지원 없음)", bill.includes("청구 기준") && !bill.includes("검토 중") && !bill.includes("서버 집계") && !bill.includes("미지원"));

// 6) 추가 채널에 캠페인 게시(실 클릭)
const cell = (await api("GET", "/community/my-cells", null, T[B])).body.find((c) => c.brandId === B && c.kind === "lounge").cellId;
const chKey = (await api("POST", `/community/cells/${cell}/channels`, { name: `체험방${tag}` }, T[B])).body.key;
await go("b-community"); await p.evaluate(() => C8.tab("bc", "post")); await p.waitForTimeout(1000);
await p.evaluate(() => C8.reload("channels")); await p.waitForTimeout(800);
await p.locator("#post-camp").selectOption(nsCamp.campaignId); await p.waitForTimeout(400);
await p.locator("#post-ch").selectOption(chKey); await p.waitForTimeout(400);
await click("4. 게시");
const chPosts = (await api("GET", `/community/cells/${cell}/messages?campaign_posts=true&channel=${chKey}`, null, T[B])).body;
ok("캠페인 게시: 직접 추가한 채널에 게시", chPosts.some((m) => m.campaignId === nsCamp.campaignId && m.channel === chKey));

// 7) DM: 관련 캠페인 기본 ‘일반 문의’ → 선택 시 그 캠페인만 → 답장에 캠페인 태그 → AI 초안(미연결 실오류)
const dmCell = `dm-${B}--${crId}`;
await p.evaluate((c) => C8.openDm(c), dmCell); await p.waitForTimeout(1500);
const info0 = await p.locator(".v6-iinfo").innerText();
ok("DM: 기본은 일반 문의(캠페인 정보 미표시)", (await p.locator("#dm-camp").inputValue()) === "" && info0.includes("일반 문의") && !info0.includes(`샘플없음 ${tag}`));
await p.locator("#dm-camp").selectOption(nsCamp.campaignId); await p.waitForTimeout(500);
const info1 = await p.locator(".v6-iinfo").innerText();
ok("DM: 고른 캠페인 조건만 표시", info1.includes(`샘플없음 ${tag}`) && info1.includes("샘플") && info1.includes("없음"));
const ta = p.locator(".v6-compose textarea");
await p.evaluate(() => { document.querySelectorAll("#toastWrap .toast").forEach((x) => x.remove()); });
await click("AI 초안"); await p.waitForTimeout(800);
ok("DM AI 초안: AI 미연결이면 실제 오류, 가짜 초안 없음", (await toasts()).includes("AI") && (await ta.inputValue()) === "");
await ta.fill("관련 답장 " + tag); await click("보내기"); await p.waitForTimeout(800);
const dmMsgs = (await api("GET", `/community/cells/${dmCell}/messages?limit=50`, null, T[B])).body;
ok("DM: 답장이 고른 캠페인 태그로 1:1 대화에 저장", dmMsgs.some((m) => m.original === "관련 답장 " + tag && m.campaignId === nsCamp.campaignId));

// 8) 회신 AI 초안(미연결 실오류) · 9) 테스트 발송(데모 모드는 보내지 않음)
await fetch(API + "/inbound/reply", { method: "POST", headers: { "Content-Type": "application/json", "X-Inbound-Key": "local-inbound-test" }, body: JSON.stringify({ brand_id: B, from_email: `ai${tag}@creator.example`, text: "Can I get a sample?" }) });
await go("b-reply"); await p.locator(".v6-ithread", { hasText: `ai${tag}` }).click(); await p.waitForTimeout(1200);
await p.evaluate(() => { document.querySelectorAll("#toastWrap .toast").forEach((x) => x.remove()); });
await p.locator(".v2-main").getByRole("button", { name: /^AI 초안/ }).first().click(); await p.waitForTimeout(800);
ok("회신 AI 초안: 미연결 실제 오류(초안 칸 비어 있음)", (await toasts()).includes("AI") && (await p.locator(".v6-compose textarea").inputValue()) === "");
await api("POST", `/brands/${B}/gmail/connect`, { email: `test${tag}@goryeo.example` }, T[B]);
await p.evaluate(() => C8.reload("gmail")); await go("b-mailprep");
const acct = (await api("GET", `/brands/${B}/gmail`, null, T[B])).body.accounts.find((a) => a.email === `test${tag}@goryeo.example`);
await p.locator('select[data-f="M.sender"]').selectOption(acct.accountId); await p.evaluate(() => C8.mailGo(2)); await p.waitForTimeout(300);
await fill("M.subject", "테스트 " + tag); await fill("M.body", "본문 " + tag); await p.evaluate(() => C8.mailGo(5)); await p.waitForTimeout(500);
await p.evaluate(() => { document.querySelectorAll("#toastWrap .toast").forEach((x) => x.remove()); });
await click("내 메일함으로 테스트 발송"); await p.waitForTimeout(1000);
const sentRows = sql(`SELECT count(*) FROM brand_test_mail WHERE account_id='${acct.accountId}'`);
ok("테스트 발송: 보내는 계정 자신에게만 · 데모 모드는 실제 오류(기록·발송 없음)", (await toasts()).includes("실제 Gmail 연결이 필요") && sentRows === "0" && (await main()).includes(`test${tag}@goryeo.example`));

// 10) owner 팀 등록 → 초대 링크 → 조회자 로그인 첫 화면부터 쓰기 잠금
await go("b-team");
await fill("TM.email", `viewer${tag}@goryeo.example`); await p.locator('select[data-f="TM.role"]').selectOption("viewer");
await click("등록하고 초대 링크 만들기"); await p.waitForTimeout(800);
const link = await p.locator("#c8-invite-link").inputValue().catch(() => "");
const team = (await api("GET", `/brands/${B}/team`, null, T[B])).body.find((m) => m.email === `viewer${tag}@goryeo.example`);
ok("팀: owner 직접 등록 → 조회자·초대 대기 + 링크(자동 발송 없음)", link.includes("/?invite=") && team && team.role === "viewer" && team.passwordSet === false && (await main()).includes("초대 대기"));
await fill("TM.email", `viewer${tag}@goryeo.example`); await click(`등록하고 초대 링크 만들기`); await p.waitForTimeout(800);
ok("팀: 같은 이메일 재등록 → 서버 중복 오류", (await toasts()).includes("이미 이 브랜드의 계정"));
const acc = await fetch(API + "/auth/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: link.split("invite=")[1], password: "viewer-local-pw-1" }) }).then((r) => r.json());
const v = await open(acc.token);
await v.waitForTimeout(1500);
await v.evaluate(() => C8.go("b-campaigns")); await v.waitForTimeout(1200);
const newBtn = v.locator(".v2-main .v6 > .v6-actions").getByRole("button", { name: "새 캠페인" }).first();
ok("조회자: 첫 화면부터 쓰기 버튼 비활성 + 안내(눌러서 403 아님)", (await newBtn.count()) > 0 && await newBtn.isDisabled() && (await main(v)).includes("조회자(보기 전용)"));
await v.evaluate(() => C8.go("b-products")); await v.waitForTimeout(1000);
ok("조회자: 제품 등록 버튼 비활성", await v.locator(".v2-main").getByRole("button", { name: "새 제품 등록" }).first().isDisabled());
const ownerBtn = p.locator(".v2-main"); await go("b-campaigns");
ok("소유자: 같은 버튼 활성(역할별 정확)", !(await p.locator(".v2-main .v6 > .v6-actions").getByRole("button", { name: "새 캠페인" }).first().isDisabled()));
ok("페이지 오류 없음(조회자)", !v.errs.length, v.errs.join(" | "));
await v.close();

// 11) 390: 20+ 항목에서 마지막 항목 → 상세 먼저 → 뒤로 목록 (지원자·DM·회신)
const fx = `fx${tag}`;
sql(`INSERT INTO creators(creator_id,handle,platform,verified) SELECT '${fx}-'||g,'${fx}_'||g,'tiktok',(g%2=0) FROM generate_series(1,22) g;
INSERT INTO memberships(creator_id,brand_id) SELECT '${fx}-'||g,'${B}' FROM generate_series(1,22) g;
INSERT INTO campaign_applications(campaign_id,creator_id,status) SELECT '${nsCamp.campaignId}','${fx}-'||g,'applied' FROM generate_series(1,22) g;
INSERT INTO cells(cell_id,brand_id,name,visibility) SELECT 'dm-${B}--${fx}-'||g,'${B}','DM','dm' FROM generate_series(1,22) g;
INSERT INTO cell_messages(cell_id,author,author_kind,original,original_locale) SELECT 'dm-${B}--${fx}-'||g,'${fx}_'||g,'creator','문의 '||g,'ko' FROM generate_series(1,22) g;
INSERT INTO mail_threads(brand_id,creator_email,subject,last_direction) SELECT '${B}','${fx}'||g||'@creator.example','회신 '||g,'in' FROM generate_series(1,22) g;`);
const m = await open(T[B], { width: 390, height: 844 });
await m.evaluate((c) => { C8.go("b-applicants"); C8.pick("appCamp", c); }, nsCamp.campaignId); await m.waitForTimeout(1800);
const rows = m.locator(".v6-split-list .v6-list .v6-row"); const nrows = await rows.count();
await rows.nth(nrows - 1).getByRole("button", { name: "보기" }).click(); await m.waitForTimeout(800);
const lastName = await m.locator("#c8-app-h").innerText();
const appState = await m.evaluate(() => ({ list: getComputedStyle(document.querySelector(".v6-split-list > .v6-list")).display, panel: getComputedStyle(document.querySelector(".v6-split-list > .v6-panel")).display, top: document.querySelector("#c8-app-h").getBoundingClientRect().top, vh: innerHeight, act: (document.querySelector(".v6-split-list > .v6-panel .btn.pri") || document.body).getBoundingClientRect().bottom, w: document.documentElement.scrollWidth <= innerWidth }));
ok("390 지원자: 마지막(" + nrows + "번째) 클릭 → 상세 먼저(목록 숨김·첫 화면에 상세와 선정 버튼)", nrows >= 20 && appState.list === "none" && appState.panel !== "none" && appState.top >= 0 && appState.act <= appState.vh && appState.w, JSON.stringify({ lastName, ...appState }));
await m.screenshot({ path: `${shots}/console-applicant-detail-390.png` });
await m.getByRole("button", { name: "← 지원자 목록" }).click(); await m.waitForTimeout(500);
ok("390 지원자: 뒤로 → 목록", await m.evaluate(() => getComputedStyle(document.querySelector(".v6-split-list > .v6-list")).display !== "none" && getComputedStyle(document.querySelector(".v6-split-list > .v6-panel")).display === "none"));
await m.evaluate(() => C8.reload("cells")); await m.evaluate(() => { C8.go("b-community"); C8.tab("bc", "dm"); }); await m.waitForTimeout(2000);
ok("390 DM: 처음엔 목록만(대화 숨김)", await m.evaluate(() => getComputedStyle(document.querySelector(".v6-inbox > .v6-iconvo")).display === "none"));
const th = m.locator(".v6-inbox .v6-ithread"); const nth = await th.count();
await th.nth(nth - 1).click(); await m.waitForTimeout(1200);
ok("390 DM: 마지막(" + nth + "번째) 클릭 → 대화 먼저 + 관련 캠페인 선택기", nth >= 20 && await m.evaluate(() => getComputedStyle(document.querySelector(".v6-inbox > .v6-ilist")).display === "none" && getComputedStyle(document.querySelector(".v6-inbox > .v6-iconvo")).display !== "none" && !!document.querySelector("#dm-camp") && document.documentElement.scrollWidth <= innerWidth));
await m.screenshot({ path: `${shots}/console-dm-detail-390.png` });
await m.getByRole("button", { name: "← 대화 목록" }).click(); await m.waitForTimeout(500);
ok("390 DM: 뒤로 → 목록", await m.evaluate(() => getComputedStyle(document.querySelector(".v6-inbox > .v6-ilist")).display !== "none"));
await m.evaluate(() => { C8.reload("inbox"); C8.go("b-reply"); }); await m.waitForTimeout(1800);
const rt = m.locator(".v6-inbox2 .v6-ithread"); const nrt = await rt.count();
await rt.nth(nrt - 1).click(); await m.waitForTimeout(1200);
ok("390 회신: 마지막(" + nrt + "번째) 클릭 → 대화 먼저", nrt >= 20 && await m.evaluate(() => getComputedStyle(document.querySelector(".v6-inbox2 > .v6-ilist")).display === "none" && getComputedStyle(document.querySelector(".v6-inbox2 > .v6-iconvo")).display !== "none" && document.documentElement.scrollWidth <= innerWidth));
await m.getByRole("button", { name: "← 회신 목록" }).click(); await m.waitForTimeout(500);
ok("390 회신: 뒤로 → 목록", await m.evaluate(() => getComputedStyle(document.querySelector(".v6-inbox2 > .v6-ilist")).display !== "none"));
ok("페이지 오류 없음(브랜드·390)", !p.errs.length && !m.errs.length, p.errs.concat(m.errs).join(" | "));
await br.close();
for (const r of results) console.log(r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`PASS ${results.length - fail} FAIL ${fail}`);
writeFileSync(`${shots}/console-review-e2e.json`, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
process.exit(fail ? 1 : 0);
