// 콘솔 v8 E2E — 실 로컬 API·DB, 실브라우저. 외부 메일 발송·결제·운영 데이터 변경 없음.
// 브랜드 학습 → 제품(이미지 업로드·공개) → 캠페인 4단계 → 지원자 선정 → 샘플 발송 → 영상 수정 요청·검수
// → 결과, 채널 관리·캠페인 게시·DM, 회신함 후속 처리, 메일 검수 목록(초안까지), 팀, 브랜드 전환 격리, 390 모바일 메뉴.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const API = process.env.API_URL || "http://localhost:8765";
const CON = process.env.CONSOLE_URL || "http://localhost:5174";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = []; const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const tag = Date.now().toString(36).slice(-5);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4oaGBFTEMLQkAgl1GAWqNFmsAAAAASUVORK5CYII=", "base64");
const shots = "docs/qa/v8";

const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
p.on("dialog", (d) => d.accept());
await p.goto(CON + "/"); await p.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.goryeo1392, API]);
await p.reload(); await p.waitForFunction(() => window.__C8 && window.__C8.active() && document.querySelector(".v2-brand"), null, { timeout: 15000 });
const main = () => p.locator(".v2-main").innerText();
const nav = async (label) => { await p.locator(".v2-side .v2-navbtn", { hasText: label }).first().click(); await p.waitForTimeout(900); };
const sub = async (label) => { await p.locator(".v2-subtabs button", { hasText: label }).first().click(); await p.waitForTimeout(900); };
const fill = async (key, v) => { await p.locator(`[data-f="${key}"]`).fill(v); };
const btn = async (name) => { await p.locator(".v2-main").getByRole("button", { name, exact: true }).first().click(); await p.waitForTimeout(1200); };
ok("로그인 브랜드 → v8 셸(시안 CSS)", await p.evaluate(() => document.body.classList.contains("c8") && !!document.querySelector('link[data-v8-css]:not([disabled])') && !!document.querySelector(".v2-rail")));

// 1) 브랜드 학습: 검증 실패 → 보완 → 저장 → 새로고침 후 서버값 유지
await nav("브랜드 학습");
await fill("L.intro", "짧음"); await btn("검증하고 저장");
ok("학습: 필수 검증(소개 20자)", (await main()).includes("20자 이상 적어 주세요"));
await fill("L.intro", `한방 원료로 민감 피부를 위한 진정 스킨케어를 만들어요 ${tag}`); await fill("L.homepage", "https://goryeo1392.example");
await p.locator('[data-farr="L.countries"][value="US"]').check(); await fill("L.usp", "한방 진정 성분"); await fill("L.banned", "치료, 완치");
await btn("FAQ 추가"); await fill("L.faq.0.q", "배송은 얼마나 걸려요?"); await fill("L.faq.0.a", "3일"); await btn("FAQ 추가"); await fill("L.faq.1.q", "샘플은요?"); await fill("L.faq.1.a", "1개");
await btn("검증하고 저장");
const prof = (await api("GET", "/brands/goryeo1392/profile/learned", null, T.goryeo1392)).body.fields;
const faqSaved = JSON.parse(prof.faq.value);
ok("학습: 서버 새 버전 저장(FAQ 포함)", prof.brand_one_liner.value.includes(tag) && faqSaved.some((x) => x.q === "샘플은요?" && x.a === "1개") && prof.countries.value.split(",").includes("US"), JSON.stringify({ faq: faqSaved.length, c: prof.countries.value }));
await p.reload(); await p.waitForFunction(() => window.__C8 && document.querySelector(".v2-brand")); await nav("브랜드 학습"); await p.waitForTimeout(800);
ok("학습: 새로고침 후 준비 6/6", (await main()).includes("준비 6/6"));

// 2) 제품: 새로 등록 → 저장 → 이미지(형식 오류 유지·실제 업로드) → 필수 저장 → 공개
await nav("캠페인 관리"); await sub("제품 라이브러리"); await btn("새 제품 등록");
const pname = `콘솔 제품 ${tag}`;
await fill("P.name", pname); await btn("임시 저장");
const prod = (await api("GET", "/brands/goryeo1392/products", null, T.goryeo1392)).body.find((x) => x.name === pname);
ok("제품: 임시 저장으로 서버 생성", !!prod);
await p.locator('input[type=file]').first().setInputFiles({ name: "bad.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") }); await p.waitForTimeout(400);
ok("제품: 형식 오류 안내(업로드 안 함)", (await main()).includes("JPG·PNG·WEBP 이미지만"));
await p.locator('input[type=file]').first().setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG }); await p.waitForTimeout(1800);
const img = await p.locator(".v6-imgbox img").evaluate((x) => ({ w: x.naturalWidth, src: x.currentSrc }));
ok("제품: 대표 이미지 실제 업로드·표시(서명 URL)", img.w === 8 && img.src.includes("/public/product-images/"), JSON.stringify(img));
await p.locator('select[data-f="P.category"]').selectOption("스킨케어");
await fill("P.usp.0", "진정"); await fill("P.usp.1", "보습"); await fill("P.usp.2", "저자극"); await fill("P.desc", "민감 피부 진정에 쓰는 한방 앰플이에요");
await fill("P.link", "https://shop.example/amp"); await fill("P.shopId", "SHOP-" + tag); await p.locator('[data-farr="P.ship"][value="US"]').check();
await btn("검증하고 저장");
await p.locator("#P-public").check(); await p.waitForTimeout(1800);
const pub = (await (await fetch(API + "/public/products?limit=100")).json()).items.find((x) => x.name === pname);
ok("제품: 필수 저장 후 공개 → 제품 모아보기 목록", !!pub && pub.imageUrl.startsWith("/public/product-images/"));
await p.screenshot({ path: `${shots}/console-product-editor-1280.png` });

// 3) 캠페인 4단계 → 모집 시작
await sub("새 캠페인");
await fill("W.name", `콘솔 캠페인 ${tag}`); await p.locator('[data-farr="W.countries"][value="US"]').check();
await fill("W.start", "2026-11-01"); await fill("W.end", "2026-12-20"); await btn("다음");
await p.locator('select[data-f="W.productId"]').selectOption(prod.productId); await p.waitForTimeout(400); await btn("다음");
await btn("다음");
ok("캠페인: 3단계 필수 검증", (await main()).includes("판매 커미션을"));
await fill("W.commission", "12"); await fill("W.sampleQty", "20"); await fill("W.length", "30~60초"); await fill("W.due", "샘플 받은 날부터 14일"); await fill("W.cap", "10");
await btn("다음"); await p.screenshot({ path: `${shots}/console-create-step4-1280.png` });
await btn("모집 시작"); await p.waitForTimeout(800);
const camp = (await api("GET", "/brands/goryeo1392/campaigns", null, T.goryeo1392)).body.find((c) => c.name === `콘솔 캠페인 ${tag}`);
ok("캠페인: 모집 시작(서버 published · 조건 문장 저장)", camp && camp.lifecycle === "published" && camp.conditions.includes("TikTok 영상 1개 · 30~60초") && camp.conditions.includes("모집 기간 2026-11-01 ~ 2026-12-20") && camp.affiliatePct === 12, JSON.stringify(camp && camp.conditions));
ok("캠페인: 상세 화면으로 이동", (await main()).includes(`콘솔 캠페인 ${tag}`) && (await main()).includes("모집 중"));

// 4) 지원자 → 선정 → (크리에이터 합의·주소) → 발송 → 영상 → 수정 요청 → 재제출 → 검수
const me = (await api("GET", "/me/profile", null, T.creator)).body;
await api("POST", `/campaigns/${camp.campaignId}/apply`, { creator_id: "me" }, T.creator);
await sub("지원자"); await p.locator("#appCamp").selectOption(camp.campaignId); await p.waitForTimeout(1200);
await btn("선정");
const off = async () => ((await api("GET", "/me/campaign-offers", null, T.creator)).body || []).find((o) => o.campaignId === camp.campaignId);
ok("지원자: 선정(제안 수수료 12%)", (await off()).state === "selected" && (await off()).commissionPct === 12);
const o1 = await off();
await api("POST", `/me/campaign-offers/${camp.campaignId}/agree`, { accept: true, handle: "@minji", terms_fingerprint: o1.termsFingerprint }, T.creator);
await sub("샘플·영상"); await p.locator("#scCamp").selectOption(camp.campaignId); await p.waitForTimeout(1200);
ok("샘플: 주소 대기 표시(주소 없이 발송 불가)", (await main()).includes("주소 대기"));
await api("POST", `/me/campaign-offers/${camp.campaignId}/shipping`, { recipient: "Minji", country: "US", address: "1 Ocean Ave, Miami FL 33139", phone: "+1 555 0101" }, T.creator);
await p.evaluate((c) => C8.reloadApps(c), camp.campaignId); await p.waitForTimeout(1200);
await btn("발송 처리");
ok("샘플: 송장 없이 발송 처리 → 안내", (await main()).includes("송장 번호를 적어 주세요"));
await fill(`T.${me.creatorId}`, "USPS-" + tag); await btn("발송 처리");
ok("샘플: 발송 처리(서버 sample_shipped)", (await off()).state === "sample_shipped" && (await off()).sampleTracking === "USPS-" + tag);
await api("POST", `/me/campaign-offers/${camp.campaignId}/content`, { content_url: "https://www.tiktok.com/@minji/video/" + tag }, T.creator);
await p.evaluate((c) => C8.reloadApps(c), camp.campaignId); await p.locator(".v6-tabs button", { hasText: "영상 검수" }).click(); await p.waitForTimeout(1200);
ok("영상: 제출 영상 보기 링크(https 새 창)", (await p.locator('.v2-main a[target=_blank]', { hasText: "제출 영상 보기" }).count()) === 1);
await btn("수정 요청");
ok("영상: 사유 없이 수정 요청 → 안내", (await main()).includes("수정 요청 사유를 적어 주세요"));
await fill(`R.${me.creatorId}`, "0:05 제품명을 말해 주세요"); await btn("수정 요청");
ok("영상: 수정 요청(서버 revision_requested·사유)", (await off()).state === "revision_requested" && (await off()).revisionNote.includes("제품명"));
await api("POST", `/me/campaign-offers/${camp.campaignId}/content`, { content_url: "https://www.tiktok.com/@minji/video/" + tag + "2" }, T.creator);
await p.evaluate((c) => C8.reloadApps(c), camp.campaignId); await p.waitForTimeout(1200);
await btn("검수 완료");
ok("영상: 검수 완료(서버 completed) + 지급 아님 안내", (await off()).state === "completed" && (await main()).includes("검수 완료는 지급 완료가 아니에요"));
await nav("월별 청구"); await sub("비용·결과"); await p.waitForTimeout(1500);
const cells = await p.locator(".v6-results .v6-tr", { hasText: `콘솔 캠페인 ${tag}` }).locator('[role="cell"]').evaluateAll((xs) => xs.map((x) => Array.from(x.childNodes).filter((n) => !(n.classList && n.classList.contains("v7-cell-label"))).map((n) => n.textContent).join("").trim()));
ok("결과: 같은 참여 건 집계(지원1·영상1·검수 완료1·판매 미연동)", cells[1] === "1" && cells[3] === "1" && cells[4] === "1" && cells[5] === "미연동" && cells[6].includes("플랫폼 정산 · 미연동"), JSON.stringify(cells));

// 5) 커뮤니티: 채널 추가·보관, 캠페인 게시, DM
await nav("커뮤니티·DM"); await p.locator(".v6-tabs button", { hasText: "채널 관리" }).click(); await p.waitForTimeout(1200);
await fill("NC.name", `콘솔채널${tag}`); await fill("NC.desc", "콘솔에서 만든 채널"); await btn("채널 추가");
const cell = (await api("GET", "/community/my-cells", null, T.goryeo1392)).body.find((c) => c.brandId === "goryeo1392" && c.kind === "lounge").cellId;
const chs = (await api("GET", `/community/cells/${cell}/channels`, null, T.creator)).body;
const added = chs.find((c) => c.name === `콘솔채널${tag}`);
ok("채널: 추가 → 크리에이터 채널 목록", !!added);
await p.locator(".v6-row", { hasText: `콘솔채널${tag}` }).getByRole("button", { name: "보관" }).click(); await p.waitForTimeout(1500);
ok("채널: 보관 → 크리에이터 목록에서 사라짐", !(await api("GET", `/community/cells/${cell}/channels`, null, T.creator)).body.some((c) => c.key === added.key));
await p.locator(".v6-tabs button", { hasText: "캠페인 게시" }).click(); await p.waitForTimeout(800);
await p.locator("#post-camp").selectOption(camp.campaignId); await p.waitForTimeout(300); await btn("4. 게시");
const posts = (await api("GET", `/community/cells/${cell}/messages?campaign_posts=true`, null, T.creator)).body;
ok("캠페인 게시: campaignId 메시지 생성", posts.some((m) => m.campaignId === camp.campaignId));
await btn("4. 게시");
ok("캠페인 게시: 같은 채널 중복 게시 방지 안내", (await main()).includes("이미 같은 캠페인을 게시했어요"));
await p.locator(".v6-tabs button", { hasText: "멤버" }).click(); await p.waitForTimeout(1200);
await p.locator(".v6-row", { hasText: "@" }).first().getByRole("button", { name: "대화" }).click(); await p.waitForTimeout(1500);
const dmKey = await p.evaluate(() => document.querySelector('.v6-compose textarea').dataset.f);
await p.locator(".v6-compose textarea").fill("콘솔 DM 답장 " + tag); await btn("보내기"); await p.waitForTimeout(800);
ok("DM: 보내기(서버 저장·피드 표시)", (await main()).includes("콘솔 DM 답장 " + tag), dmKey);

// 6) 회신함: 후속 처리 저장(낙관적 잠금)
await fetch(API + "/inbound/reply", { method: "POST", headers: { "Content-Type": "application/json", "X-Inbound-Key": "local-inbound-test" }, body: JSON.stringify({ brand_id: "goryeo1392", from_email: `kai${tag}@creator.example`, text: "What is the fee?" }) });
await nav("아웃리치·인박스"); await sub("회신함"); await p.waitForTimeout(1200);
await p.locator(".v6-ithread", { hasText: `kai${tag}` }).click(); await p.waitForTimeout(1200);
const tid = await p.evaluate(() => (location.hash.match(/b-reply\/(.+)$/) || [])[1]);
await p.locator(`select[data-f="RT.${tid}.label"]`).selectOption("question"); await fill(`RT.${tid}.next`, "단가 안내 " + tag);
await btn("후속 처리 저장");
const th = (await api("GET", "/brands/goryeo1392/inbox", null, T.goryeo1392)).body.find((x) => x.threadId === tid);
ok("회신함: 상태·후속 할 일 저장(revision 1)", th && th.task.label === "question" && th.task.nextAction === "단가 안내 " + tag && th.task.revision === 1, JSON.stringify(th && th.task));

// 7) 메일: (데모) 계정 연결 → CSV 받는 사람 → 내용 → 제외 확인 → 검수 목록(초안) → 발송 로그 → 초안 취소. 실제 발송 없음
await api("POST", "/brands/goryeo1392/gmail/connect", { email: `team${tag}@goryeo.example` }, T.goryeo1392);
await p.evaluate(() => C8.reload("gmail"));
await sub("받는 사람 찾기"); await p.locator(".v6-tabs button", { hasText: "CSV 붙여넣기" }).click(); await p.waitForTimeout(300);
await fill("CSV", `Ann,ann${tag}@creator.example,US\nBad,not-an-email,US\nAnn2,ann${tag}@creator.example,US`); await btn("검수 목록 만들기");
ok("받는 사람: CSV 검수(형식 오류·중복)", (await main()).includes("이메일 형식 오류") && (await main()).includes("중복"));
await btn("검수 통과 1명 선택에 추가"); await btn("선택 1명으로 메일 작성");
await p.locator('select[data-f="M.camp"]').selectOption(camp.campaignId); await p.waitForTimeout(400);
const acct = (await api("GET", "/brands/goryeo1392/gmail", null, T.goryeo1392)).body.accounts.find((a) => a.email === `team${tag}@goryeo.example`);
await p.locator('select[data-f="M.sender"]').selectOption(acct.accountId); await btn("다음");
await fill("M.subject", "협업 제안 " + tag); await fill("M.body", "안녕하세요, 한방 앰플 협업을 제안드려요."); await btn("다음"); await btn("다음");
await btn("제외 확인");
ok("제외 확인: 서버 판정(보낼 수 있음 1명)", (await main()).includes("보낼 수 있음 1명"));
await btn("다음"); await fill("M.approver", "하린"); await p.locator(".v2-main button", { hasText: "검수 목록 만들기" }).click(); await p.waitForTimeout(1800);
const batches = (await api("GET", "/brands/goryeo1392/outreach", null, T.goryeo1392)).body.batches;
const bt = batches.find((b) => b.subject === "협업 제안 " + tag);
ok("검수 목록: 승인 전 초안으로 저장(발송 안 됨) + 발송 로그 표시", bt && bt.state === "draft" && bt.recipients.every((r) => r.state === "pending") && (await main()).includes("협업 제안 " + tag));
await p.locator(".v6-row", { hasText: "협업 제안 " + tag }).getByRole("button", { name: "초안 취소" }).click(); await p.waitForTimeout(1500);
ok("발송 로그: 초안 취소(서버 cancelled)", (await api("GET", "/brands/goryeo1392/outreach", null, T.goryeo1392)).body.batches.find((b) => b.id === bt.id).state === "cancelled");

// 8) 팀: 서버 역할 표시(운영자=브랜드 전체 운영, 조회자=보기만), 담당 캠페인 제한 미표시
await nav("팀"); await p.waitForTimeout(1200);
const team = await main();
ok("팀: 실제 역할·권한 문구(담당 캠페인 제한 지원 안 함 명시)", team.includes("소유자") && team.includes("캠페인별 담당 제한은 아직 지원하지 않아요") && team.includes("운영팀에 초대 요청"));
ok("페이지 오류 없음(브랜드)", !errs.length, errs.join(" | "));

// 9) 관리자: 브랜드 전환 시 데이터·입력 초안 격리
const q = await br.newPage({ viewport: { width: 1280, height: 900 } }); const qerr = []; q.on("pageerror", (e) => qerr.push(e.message));
await q.goto(CON + "/"); await q.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); localStorage.setItem("CONNECTION_ADMIN_BRAND", "goryeo1392"); }, [T.admin, API]);
await q.reload(); await q.waitForFunction(() => window.__C8 && window.__C8.active() && document.querySelector(".v2-brand"), null, { timeout: 15000 });
await q.evaluate(() => C8.go("b-create")); await q.waitForTimeout(800); await q.locator('[data-f="W.name"]').fill("고려 초안 " + tag);
await q.locator(".v2-rail").getByRole("button", { name: "FAU", exact: true }).click(); await q.waitForTimeout(2500);
await q.evaluate(() => C8.go("b-create")); await q.waitForTimeout(800);
ok("관리자 전환: FAU 로 바뀌고 고려 입력 초안 없음", (await q.locator(".v2-ws b").innerText()).includes("FAU") && (await q.locator('[data-f="W.name"]').inputValue()) === "");
await q.evaluate(() => C8.go("b-campaigns")); await q.waitForTimeout(1500);
ok("관리자 전환: FAU 캠페인에 고려 캠페인 없음", !(await q.locator(".v2-main").innerText()).includes(`콘솔 캠페인 ${tag}`));
ok("페이지 오류 없음(관리자)", !qerr.length, qerr.join(" | "));

// 10) 390 모바일: 메뉴 열기 → 이동, 가로 넘침 없음
const m = await br.newPage({ viewport: { width: 390, height: 844 } }); const merr = []; m.on("pageerror", (e) => merr.push(e.message));
await m.goto(CON + "/"); await m.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.goryeo1392, API]);
await m.reload(); await m.waitForFunction(() => window.__C8 && document.querySelector(".v2-brand"));
ok("390: 사이드 메뉴 기본 숨김", !(await m.locator(".v2-side").isVisible()));
await m.getByRole("button", { name: "메뉴 열기" }).click(); await m.waitForTimeout(300);
await m.locator(".v2-side .v2-navbtn", { hasText: "캠페인 관리" }).click(); await m.waitForTimeout(1500);
ok("390: 메뉴로 이동 + 가로 넘침 없음", (await m.locator(".v2-main h1").innerText()).includes("캠페인 관리") && await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await m.screenshot({ path: `${shots}/console-campaigns-390.png` });
await m.evaluate((c) => C8.go("b-campaigns", c), camp.campaignId); await m.waitForTimeout(1500); await m.screenshot({ path: `${shots}/console-campaign-detail-390.png` });
ok("390: 상세 가로 넘침 없음", await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
ok("페이지 오류 없음(390)", !merr.length, merr.join(" | "));
await br.close();
for (const r of results) console.log(r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`PASS ${results.length - fail} FAIL ${fail}`);
writeFileSync(`${shots}/console-e2e.json`, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
process.exit(fail ? 1 : 0);
