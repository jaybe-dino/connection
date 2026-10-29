// 크리에이터 v8.1 화면 실동작 E2E — 실제 로컬 API·DB, 실브라우저 조작(1280 / 390).
// 신청 → (브랜드 선정: 실 API) → 조건 합의 → 샘플 주소 → (브랜드 발송: 실 API) → 영상 제출,
// 질문 채널 게시·스레드 답글, 미션 이동, 모바일 메뉴, 로그아웃 후 공개 화면 복귀를 확인한다.
// 전제: API 8765 + creator dist 5175 + scripts/dev/seed_local_v8.py. 외부 발송·실결제 없음.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";

const API = process.env.API_URL || "http://localhost:8765";
const APP = process.env.APP_URL || "http://localhost:5175";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: b ? JSON.stringify(b) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

// 준비: FAU에 이번 실행 전용 캠페인을 새로 만들고 게시한다(실 API)
const tag = Date.now().toString(36).slice(-5);
const made = await api("POST", "/brands/fau/campaigns", { name: `선크림 리뷰 ${tag}`, product: "수분 선크림", usp: "가벼운 사용감", reward_type: "affiliate", affiliate_pct: 12, capacity: 10, deadline: "2026-12-20", countries: ["US"] }, T.fau);
const cid = made.body.campaignId;
await api("POST", `/brands/fau/campaigns/${cid}/publish`, null, T.fau);
const me = (await api("GET", "/me/profile", null, T.creator)).body;
const offer = async () => ((await api("GET", "/me/campaign-offers", null, T.creator)).body || []).find((o) => o.campaignId === cid);

const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(APP + "/"); await p.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.creator, API]);
await p.reload(); await p.waitForFunction(() => window.__ME && LIVE.campaigns && LIVE.offers, null, { timeout: 15000 });
const main = () => p.locator(".v2-main").innerText();
const brand = async (b) => { await p.evaluate((x) => V8brand(x), b); await p.waitForTimeout(500); };
const go = async (s, id) => { await p.evaluate(([x, y]) => V8go(x, y), [s, id || ""]); await p.waitForTimeout(500); };

ok("시안 셸(v2-creator)과 시안 CSS 사용", await p.locator(".v2.v2-creator").count() === 1 && await p.evaluate(() => !document.querySelector('link[href*="v8-kit.css"]').disabled && document.querySelector('link[href*="journey.css"]').disabled));
await brand("fau"); await go("c-campaigns");
await p.locator(".v8-ccard", { hasText: `선크림 리뷰 ${tag}` }).getByRole("button", { name: "조건 보기" }).click(); await p.waitForTimeout(400);
ok("캠페인 상세·신청 폼 표시", (await p.locator("#v6-cdetail").innerText()).includes("신청하기"));
await p.getByRole("button", { name: "신청하기", exact: true }).click(); await p.waitForTimeout(300);
ok("조건 확인 없이 신청하면 오류", (await p.locator("#err-ap-a").count()) === 1);
await p.locator("#ap-m").fill("미국 거주, 선크림 리뷰 경험 있어요");
await p.locator("#ap-a").check();
await p.getByRole("button", { name: "신청하기", exact: true }).click(); await p.waitForTimeout(1500);
const st1 = ((await api("GET", "/me/campaigns", null, T.creator)).body || []).find((c) => c.campaignId === cid);
ok("신청이 서버에 기록됨", st1 && st1.myStatus === "applied", st1 && st1.myStatus);
ok("신청 후 내 캠페인으로 이동", (await main()).includes(`선크림 리뷰 ${tag}`) && await p.evaluate(() => __V8.screen) === "c-work");

const sel = await api("POST", `/brands/fau/campaigns/${cid}/select`, { creator_id: me.creatorId, commission_pct: 12 }, T.fau);
ok("브랜드 선정(실 API)", sel.status < 300, String(sel.status));
await p.evaluate(() => collabRefresh()); await p.waitForTimeout(1200);
await go("c-tasks");
ok("내 할 일에 조건 확인 표시", (await main()).includes("제안 조건을 확인하고 합의해요"));
await go("c-work", cid);
await p.locator("#agreeOk").check();
await p.getByRole("button", { name: "조건 합의" }).click(); await p.waitForTimeout(1500);
ok("조건 합의 → terms_agreed", (await offer()).state === "terms_agreed", (await offer()).state);
ok("진행 단계 3(조건·주소)", (await p.locator('.v8-stepper li[aria-current="step"]').innerText()).includes("조건·주소"));
await p.locator("#shipRecipient").fill("Minji Test");
await p.locator("#shipLine").fill("123 Main St");
await p.locator("#shipCity").fill("Brooklyn NY");
await p.locator("#shipZip").fill("11201");
await p.locator("#shipPhone").fill("+1 555 0100");
await p.locator("#shipConsent").check();
await p.getByRole("button", { name: "주소 저장" }).click(); await p.waitForTimeout(1500);
const o2 = await offer();
ok("주소가 서버에 저장(수령인·국가·주소·연락처)", o2.shipping && o2.shipping.address.includes("Brooklyn") && o2.shipping.country === "US", JSON.stringify(o2.shipping || {}).slice(0, 80));
ok("주소 저장 후 발송 대기 표시", (await main()).includes("샘플 발송 대기"));
const ship = await api("POST", `/brands/fau/campaigns/${cid}/terms/${me.creatorId}/sample-shipped`, { tracking: "TRK-" + tag }, T.fau);
ok("브랜드 발송 처리(실 API)", ship.status < 300, String(ship.status));
await p.evaluate(() => collabRefresh()); await p.waitForTimeout(1200); await go("c-work", cid);
ok("송장·영상 제출 단계 표시", (await main()).includes("TRK-" + tag) && (await main()).includes("영상 제출"));
await p.locator("#vdUrl").fill("https://www.tiktok.com/@minji.test/video/1");
await p.getByRole("button", { name: "영상 제출" }).click(); await p.waitForTimeout(1800);
ok("영상 제출 → content_submitted", (await offer()).state === "content_submitted", (await offer()).state);

// 커뮤니티: 질문 채널 게시 + 스레드 답글
await brand("goryeo1392");
await p.evaluate(() => V8openChannel("qna")); await p.waitForTimeout(1200);
const text = "배송은 보통 며칠 걸리나요? " + tag;
await p.locator("#chatDraft").fill(text); await p.keyboard.press("Enter"); await p.waitForTimeout(1500);
ok("# 질문 채널 게시·표시", (await p.locator(".v2-feed").innerText()).includes(text));
await p.locator(".sp-msg", { hasText: text }).getByRole("button", { name: "답글" }).click(); await p.waitForTimeout(800);
await p.locator("#threadReply").fill("답글 확인 " + tag); await p.getByRole("button", { name: "보내기" }).click(); await p.waitForTimeout(1500);
ok("스레드 답글 표시", (await p.locator(".sp-thread").innerText()).includes("답글 확인 " + tag));
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
ok("Esc로 스레드 닫힘", await p.locator(".sp-thread").count() === 0);

// 미션: 이동 버튼은 실제 위치로, 주 버튼 없음
await go("c-missions");
ok("미션 행에 주 버튼 없음", await p.locator(".v8-missions .btn.pri").count() === 0);
const can = p.locator(".v8-mission.is-can .btn").first();
if (await can.count()) { const label = await can.innerText(); await can.click(); await p.waitForTimeout(800); ok("미션 버튼은 실제 화면으로 이동만", await p.evaluate(() => __V8.screen) !== "c-missions", label); }
await go("c-rewards");
ok("보상: 금액 미연동 상태 표시(가짜 금액 없음)", (await main()).includes("미연동") && !/\d+,\d{3}원 지급/.test(await main()));

// 모바일 메뉴
await p.setViewportSize({ width: 390, height: 844 }); await go("c-tasks");
await p.getByRole("button", { name: "채널·메뉴 열기" }).click(); await p.waitForTimeout(300);
ok("[390] 채널·메뉴 열기 → nav-open", await p.locator(".v2.nav-open").count() === 1);
await p.locator(".v2-side").getByRole("button", { name: "내 캠페인" }).click(); await p.waitForTimeout(500);
ok("[390] 메뉴에서 이동 후 메뉴 닫힘", await p.evaluate(() => __V8.screen) === "c-work" && await p.locator(".v2.nav-open").count() === 0);
ok("[390] 가로 넘침 없음", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

// 로그아웃 → 공개(기존) 화면, 시안 CSS 꺼짐
await p.evaluate(() => authLogout()); await p.waitForTimeout(1200);
ok("로그아웃 후 공개 화면(기존 CSS)", await p.locator(".v2-creator").count() === 0 && await p.evaluate(() => document.querySelector('link[href*="v8-kit.css"]').disabled));
ok("페이지 오류 없음", !errs.length, errs.join(" | "));
await br.close();
for (const r of results) console.log(r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`PASS ${results.length - fail} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
