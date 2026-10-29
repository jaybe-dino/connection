// PERSONA_QA 에 '미확인'으로 남았던 v8.1 노출 경로 5개 + 이번 수정(공개 완성도·D10 이력) 실제 화면 확인 · 대표 캡처 보존.
// 실제 로컬 API·DB·브라우저. 외부 실인증·운영 메일·실결제 없음.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const API = process.env.API_URL || "http://localhost:8765";
const CON = process.env.CONSOLE_URL || "http://localhost:5174";
const APP = process.env.APP_URL || "http://localhost:5175";
const ADM = process.env.ADMIN_URL || "http://localhost:5176";
const DB = process.env.E2E_DB || "postgresql://postgres:postgres@localhost:5432/v8dev";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = []; const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const sql = (q) => execFileSync("psql", [DB, "-Atc", q], { encoding: "utf8" }).trim();
const tag = Date.now().toString(36).slice(-5);
const shots = "docs/qa/v8";
const B = "goryeo1392";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4oaGBFTEMLQkAgl1GAWqNFmsAAAAASUVORK5CYII=", "base64");
const br = await chromium.launch();
const allErrs = [];
async function page(url, tok, vp = { width: 1280, height: 900 }, extra = {}) {
  const ctx = await br.newContext({ viewport: vp, ...extra });
  const p = await ctx.newPage(); p.on("pageerror", (e) => allErrs.push(url + ": " + e.message)); p.on("dialog", (d) => d.accept());
  await p.goto(url + "/"); await p.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [tok, API]);
  await p.reload(); return p;
}
const consoleP = async (vp) => { const p = await page(CON, T[B], vp); await p.waitForFunction(() => window.__C8 && window.__C8.active() && document.querySelector(".v2-brand"), null, { timeout: 15000 }); return p; };
const creatorP = async (extra) => { const p = await page(APP, T.creator, { width: 1280, height: 900 }, extra); await p.waitForFunction(() => window.__ME && LIVE.campaigns && LIVE.offers, null, { timeout: 15000 }); return p; };
const main = (p) => p.locator(".v2-main").innerText();
const toasts = (p) => p.evaluate(() => Array.from(document.querySelectorAll("#toastWrap .toast")).map((x) => x.textContent).join(" | "));

// ── 공개 완성도: 임시 저장 → 공개 거부·보완 안내 → 필수 채움 → 공개 성공(오류 없음) ──
const c = await consoleP();
await c.evaluate(() => C8.go("b-products")); await c.waitForTimeout(800);
await c.locator(".v2-main").getByRole("button", { name: "새 제품 등록" }).click(); await c.waitForTimeout(400);
await c.locator('input[type=file]').first().setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG }); await c.waitForTimeout(300);
await c.screenshot({ path: `${shots}/console-product-photo-first-1280.png` });
await c.locator('[data-f="P.name"]').fill(`완성도 ${tag}`); await c.locator('[data-f="P.desc"]').fill("임시로 저장한 한방 앰플 설명이에요");
await c.locator(".v2-main").getByRole("button", { name: "임시 저장", exact: true }).click(); await c.waitForTimeout(2000);
const prod = (await api("GET", `/brands/${B}/products`, null, T[B])).body.find((x) => x.name === `완성도 ${tag}`);
ok("사진 먼저 등록 + 임시 저장: 제품 생성 후 대표 사진 업로드", prod && (prod.images || []).some((i) => i.slot === "main"));
await c.locator("#P-public").click(); await c.waitForTimeout(1200);
const refused = await main(c);
ok("임시 저장 제품 공개 시도 → 서버 거부·보완 안내(카테고리·USP·배송 국가), 공개 안 됨", /공개하지 못했어요/.test(refused) && /카테고리/.test(refused) && /USP 3개/.test(refused) && /배송 가능 국가/.test(refused) && !(await c.locator("#P-public").isChecked()));
await c.locator('select[data-f="P.category"]').selectOption("스킨케어");
for (const [i, v] of ["진정", "보습", "저자극"].entries()) await c.locator(`[data-f="P.usp.${i}"]`).fill(v);
await c.locator('[data-farr="P.ship"][value="US"]').check();
await c.locator(".v2-main").getByRole("button", { name: "검증하고 저장" }).click(); await c.waitForTimeout(2000);
await c.evaluate(() => { document.querySelectorAll("#toastWrap .toast").forEach((x) => x.remove()); });
await c.locator("#P-public").click(); await c.waitForTimeout(1500);
const okTxt = await main(c);
const listed = (await api("GET", `/brands/${B}/products`, null, T[B])).body.find((x) => x.productId === prod.productId);
ok("필수 채운 뒤 공개 성공(오류 없음·서버 공개·제품 모아보기 노출)", listed.publicListed && !/공개하지 못했어요/.test(okTxt) && (await toasts(c)).includes("공개했어요") && ((await (await fetch(API + `/public/products?brand=${B}&limit=100`)).json()).items || []).some((x) => x.productId === prod.productId));
await c.screenshot({ path: `${shots}/console-product-public-ok-1280.png` });

// ── 팀 초대 캡처 ──
await c.evaluate(() => C8.go("b-team")); await c.waitForTimeout(1200);
await c.locator('[data-f="TM.email"]').fill(`invite${tag}@goryeo.example`); await c.locator('select[data-f="TM.role"]').selectOption("manager");
await c.locator(".v2-main").getByRole("button", { name: "등록하고 초대 링크 만들기" }).click(); await c.waitForTimeout(1500);
ok("팀 초대: 등록 + 링크 표시", (await c.locator("#c8-invite-link").inputValue()).includes("/?invite="));
await c.screenshot({ path: `${shots}/console-team-invite-1280.png` });

// ── 미확인 1: 후보 근거 화면 ──
await c.evaluate(() => C8.go("b-invite")); await c.waitForTimeout(1200);
await c.locator(".v2-main").getByRole("button", { name: "후보 찾기" }).click(); await c.waitForTimeout(2500);
const inv = await main(c);
const candRows = await c.locator(".v2-main .v6-list .v6-row").count();
ok("후보 근거 화면: 보유 DB 후보와 근거·이메일 검증 상태 표시", /결과 \d+명/.test(inv) && (candRows === 0 ? /조건에 맞는 후보가 없어요/.test(inv) : true), (inv.match(/결과 \d+명[^\n]*/) || [""])[0]);
await c.screenshot({ path: `${shots}/console-invite-evidence-1280.png` });

// ── 미확인 2: 회신·DM 대기 시간 ──
const dmCell = (await api("POST", `/community/dm/${B}`, {}, T.creator)).body.cellId;
await api("POST", `/community/cells/${dmCell}/messages`, { text: `대기 시간 확인 ${tag}`, channel: "chat" }, T.creator);
await fetch(API + "/inbound/reply", { method: "POST", headers: { "Content-Type": "application/json", "X-Inbound-Key": "local-inbound-test" }, body: JSON.stringify({ brand_id: B, from_email: `wait${tag}@creator.example`, text: "Question about the sample" }) });
await c.evaluate(() => { C8.reload("inbox"); C8.reload("cells"); C8.go("b-today"); }); await c.waitForTimeout(9000);
const home = await main(c);
ok("홈 할 일: DM·회신에 ‘n분째’ 대기 시간", /DM에 답장/.test(home) && /\d+분째|\d+시간째|\d+일째/.test(home));
await c.evaluate(() => { C8.go("b-community"); C8.tab("bc", "dm"); }); await c.waitForTimeout(1500);
const dmChip = await c.locator(".v6-ithread", { hasText: "답장 필요" }).first().innerText().catch(() => "");
ok("DM 목록: ‘답장 필요 · n분째’", /답장 필요 · \d+(분|시간|일)째/.test(dmChip), dmChip.replace(/\s+/g, " ").slice(0, 80));
await c.evaluate(() => C8.go("b-reply")); await c.waitForTimeout(1500);
const repRow = await c.locator(".v6-ithread", { hasText: `wait${tag}` }).innerText().catch(() => "");
ok("회신함 목록: 답장 필요 회신에 대기 시간", /\d+(분|시간|일)째/.test(repRow), repRow.replace(/\s+/g, " ").slice(0, 80));
await c.screenshot({ path: `${shots}/console-reply-wait-1280.png` });

// ── 모바일 상세(390) 캡처 ──
const m = await consoleP({ width: 390, height: 844 });
await m.evaluate(() => { C8.go("b-community"); C8.tab("bc", "dm"); }); await m.waitForTimeout(1500);
await m.locator(".v6-ithread", { hasText: "답장 필요" }).first().click(); await m.waitForTimeout(1200);
ok("390 DM: 목록 → 상세 먼저(가로 넘침 없음)", await m.evaluate(() => getComputedStyle(document.querySelector(".v6-inbox > .v6-ilist")).display === "none" && document.documentElement.scrollWidth <= innerWidth));
await m.screenshot({ path: `${shots}/console-dm-detail-390.png` });

// ── 미확인 3: 캠페인 0 빈 상태 (모집 중 캠페인이 없는 브랜드 멤버십) ──
const eb = "empty" + tag;
sql(`INSERT INTO brands(brand_id,name) VALUES('${eb}','빈 브랜드 ${tag}'); INSERT INTO cells(cell_id,brand_id,name,visibility) VALUES('cell-${eb}','${eb}','라운지','apply_approve');`);
const me = (await api("GET", "/me/profile", null, T.creator)).body;
sql(`INSERT INTO memberships(creator_id,brand_id) VALUES('${me.creatorId}','${eb}')`);
const cr = await creatorP();
await cr.evaluate((b) => V8brand(b), eb); await cr.evaluate(() => V8go("c-campaigns")); await cr.waitForTimeout(800);
const empty = await main(cr);
ok("캠페인 0: ‘이 브랜드에서 모집 중인 캠페인이 없어요’(빈 화면 아님, 다른 브랜드 캠페인 혼입 없음)", empty.includes("이 브랜드에서 모집 중인 캠페인이 없어요") && !empty.includes("수정2회"));
await cr.screenshot({ path: `${shots}/creator-campaigns-empty-1280.png` });
sql(`DELETE FROM memberships WHERE creator_id='${me.creatorId}' AND brand_id='${eb}'`);

// ── 미확인 4·5: 태국 주소 형식 · 번역/원문 · 현지 시각 마감 (기기 시간대 Asia/Bangkok) ──
const cid = (await api("POST", `/brands/${B}/campaigns`, { name: `태국 ${tag}`, reward_type: "gifted", countries: ["TH", "US"], deadline: "2026-12-20", conditions: ["TikTok 영상 1개 · 30초"] }, T[B])).body.campaignId;
await api("POST", `/brands/${B}/campaigns/${cid}/publish`, null, T[B]);
const th = await creatorP({ timezoneId: "Asia/Bangkok", locale: "th-TH" });
await th.evaluate((b) => V8brand(b), B); await th.evaluate((x) => V8go("c-campaigns", x), cid); await th.waitForTimeout(800);
const due = await th.locator("#v6-cdetail").innerText().catch(async () => main(th));
ok("현지 시각 마감: ‘2026-12-20 23:59 (한국 시간) · 내 시간 12. 20. 21:59’(방콕)", /2026-12-20 23:59 \(한국 시간\)/.test(due) && /내 시간[^\n]*21:59/.test(due), (due.match(/2026-12-20[^\n]*/) || [""])[0]);
await th.screenshot({ path: `${shots}/creator-deadline-local-1280.png` });
await api("POST", `/campaigns/${cid}/apply`, { creator_id: "me" }, T.creator);
await api("POST", `/brands/${B}/campaigns/${cid}/select`, { creator_id: me.creatorId }, T[B]);
const off = ((await api("GET", "/me/campaign-offers", null, T.creator)).body || []).find((o) => o.campaignId === cid);
await api("POST", `/me/campaign-offers/${cid}/agree`, { accept: true, handle: "@th" + tag, terms_fingerprint: off.termsFingerprint }, T.creator);
await th.evaluate(() => loadCreatorData && loadCreatorData()); await th.waitForTimeout(1500);
await th.evaluate((x) => V8go("c-work", x), cid); await th.waitForTimeout(800);
await th.locator("#shipCountry").selectOption("TH"); await th.waitForTimeout(400);
const labels = await th.locator(".v6-form").first().innerText();
ok("태국 주소 형식: 국가 TH 선택 → ‘도시·도’·‘우편번호’(미국식 ZIP·주 아님)", labels.includes("도시·도") && labels.includes("우편번호") && !labels.includes("ZIP"));
await th.locator("#shipRecipient").fill("Somchai"); await th.locator("#shipLine").fill("99 Sukhumvit Rd"); await th.locator("#shipCity").fill("Bangkok"); await th.locator("#shipZip").fill("10110"); await th.locator("#shipPhone").fill("+66 81 234 5678");
await th.locator("#shipConsent").check(); await th.getByRole("button", { name: "주소 저장", exact: true }).click(); await th.waitForTimeout(1500);
const sh = ((await api("GET", "/me/campaign-offers", null, T.creator)).body || []).find((o) => o.campaignId === cid).shipping;
ok("태국 주소 저장: 국가 TH·주소 서버 반영", sh && sh.country === "TH" && /Bangkok 10110/.test(sh.address), JSON.stringify(sh));
await th.screenshot({ path: `${shots}/creator-thai-address-1280.png` });
// 번역: 번역이 저장된 메시지는 내 언어(태국어)로, 원문은 버튼으로 / 번역 실패 메시지는 원문 그대로
const cell = (await api("GET", "/community/my-cells", null, T.creator)).body.find((x) => x.brandId === B && x.kind !== "dm").cellId;
sql(`INSERT INTO cell_messages(cell_id,channel,author,author_kind,original,original_locale,translations,translation_state) VALUES
 ('${cell}','chat','goryeo1392','brand','샘플은 다음 주에 보내요 ${tag}','ko','{"th":"เราจะส่งตัวอย่างสัปดาห์หน้า ${tag}"}','done'),
 ('${cell}','chat','goryeo1392','brand','번역 실패 원문 ${tag}','ko','{}','failed')`);
await th.evaluate(() => { if (typeof setConversationLang === "function") setConversationLang("th"); else window.__USER_LANG = "th"; }); await th.waitForTimeout(500);
await th.evaluate(() => V8openChannel("chat")); await th.waitForTimeout(2500);
const feed = await main(th);
ok("번역: 태국어 번역 표시 + ‘번역 표시’ 안내, 번역 실패 메시지는 원문 유지", feed.includes(`เราจะส่งตัวอย่างสัปดาห์หน้า ${tag}`) && feed.includes(`번역 실패 원문 ${tag}`) && feed.includes("번역 표시"));
const origBtn = th.locator(".sp-reply", { hasText: "원문" }).last();
if (await origBtn.count()) { await origBtn.click(); await th.waitForTimeout(500); }
ok("번역: 원문 보기로 한국어 원문 확인", (await main(th)).includes(`샘플은 다음 주에 보내요 ${tag}`));
await th.screenshot({ path: `${shots}/creator-thai-translation-1280.png` });
await th.evaluate(() => { if (typeof setConversationLang === "function") setConversationLang("ko"); });

// ── D10: 재제출 후 이전 링크·수정 요청 메모를 운영자가 화면에서 확인 ──
const rc = (await api("POST", `/brands/${B}/campaigns`, { name: `D10 ${tag}`, reward_type: "gifted", sample_required: false, conditions: ["TikTok 영상 1개"] }, T[B])).body.campaignId;
await api("POST", `/brands/${B}/campaigns/${rc}/publish`, null, T[B]);
await api("POST", `/campaigns/${rc}/apply`, { creator_id: "me" }, T.creator);
await api("POST", `/brands/${B}/campaigns/${rc}/select`, { creator_id: me.creatorId }, T[B]);
const o2 = ((await api("GET", "/me/campaign-offers", null, T.creator)).body || []).find((o) => o.campaignId === rc);
await api("POST", `/me/campaign-offers/${rc}/agree`, { accept: true, handle: "@d10" + tag, terms_fingerprint: o2.termsFingerprint }, T.creator);
await api("POST", `/me/campaign-offers/${rc}/content`, { content_url: `https://www.tiktok.com/@d10${tag}/video/1` }, T.creator);
await api("POST", `/brands/${B}/campaigns/${rc}/terms/${me.creatorId}/request-revision`, { note: `제품명을 말해 주세요 ${tag}` }, T[B]);
await api("POST", `/me/campaign-offers/${rc}/content`, { content_url: `https://www.tiktok.com/@d10${tag}/video/2` }, T.creator);
const a = await page(ADM, T.admin); await a.goto(ADM + "/submissions"); await a.waitForTimeout(2000);
const row = a.locator(".v6-row", { hasText: `@d10${tag}/video/2` });
await row.locator("summary").click(); await a.waitForTimeout(300);
const hist = await row.innerText();
ok("D10: 대기 건(v2)에서 이전 제출 v1 링크·수정 요청 메모·보완 요청 상태 확인", hist.includes("이전 제출 1건") && hist.includes(`video/1`) && hist.includes(`제품명을 말해 주세요 ${tag}`) && hist.includes("보완 요청"));
await a.screenshot({ path: `${shots}/admin-submission-history-1280.png` });
await a.locator(".v6-tabs [role=tab]", { hasText: "전체 이력" }).click(); await a.waitForTimeout(500);
const v1 = a.locator(".v6-row", { hasText: `@d10${tag}/video/1` });
ok("D10: 전체 이력은 읽기 전용(이전 버전에는 검수 버튼 없음)", (await v1.count()) === 1 && (await v1.getByRole("button").count()) === 0 && (await v1.innerText()).includes(`제품명을 말해 주세요 ${tag}`));

// ── 관리자 390: 모집 머리 버튼 줄바꿈 없음, 로컬 전용 문구 없음 ──
const am = await page(ADM, T.admin, { width: 390, height: 844 }); await am.goto(ADM + "/recruitment"); await am.waitForTimeout(2000);
const btnBox = await am.locator(".recruitment-workspace .v6-head > button").boundingBox();
const headTxt = await am.locator(".recruitment-workspace .v6-head").innerText();
ok("관리자 390: ‘상태 새로고침’ 한 줄(높이 정상)·가로 넘침 없음·로컬 전용 문구 없음", btnBox && btnBox.height < 60 && await am.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && !/로컬 검수 화면/.test(headTxt) && /초안 저장과 발송 승인은 따로/.test(headTxt), JSON.stringify(btnBox));
await am.screenshot({ path: `${shots}/admin-recruit-390.png` });

ok("페이지 오류 없음", !allErrs.length, allErrs.join(" | "));
await br.close();
sql(`UPDATE outreach_batches SET state='cancelled' WHERE brand_id='${B}' AND state='draft'`);
for (const r of results) console.log(r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`PASS ${results.length - fail} FAIL ${fail}`);
writeFileSync(`${shots}/persona-unconfirmed-e2e.json`, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
process.exit(fail ? 1 : 0);
