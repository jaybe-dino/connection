// 크리에이터 v8 커뮤니티 보완 E2E — 실 로컬 API·DB, 실브라우저.
// · 브랜드의 실제 '캠페인 게시'(campaignId 메시지) → 크리에이터 '캠페인 공지' 카드 → 그 캠페인 상세 열기
// · 공지사항 목록에서 고른 공지 → 공지 채널 + 그 공지 스레드가 열림(msgId 일치)
// · 누적 XP = 서버 /me/xp?brand= total (브랜드 전환 포함)
// · 이미지 오류 시 같은 제품/브랜드 이니셜의 중립 그림(가짜 제품 사진 없음) — 크리에이터 제품·레일, 공개 상세
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";

const API = process.env.API_URL || "http://localhost:8765";
const APP = process.env.APP_URL || "http://localhost:5175";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: b ? JSON.stringify(b) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const tag = Date.now().toString(36).slice(-5);

// 준비: 고려 캠페인 발행 + 공지 채널에 캠페인 카드 게시(실 API) + 공지 2건
const cname = `카드 게시 ${tag}`;
const cid = (await api("POST", "/brands/goryeo1392/campaigns", { name: cname, product: "한방 진정 앰플", reward_type: "paid", reward_amount: 30000, conditions: ["TikTok 영상 1개"], countries: ["US"], deadline: "2026-12-30" }, T.goryeo1392)).body.campaignId;
await api("POST", `/brands/goryeo1392/campaigns/${cid}/publish`, null, T.goryeo1392);
const post = await api("POST", `/brands/goryeo1392/campaigns/${cid}/post`, { channel: "notice" }, T.goryeo1392);
ok("준비: 브랜드 캠페인 카드 게시(실 API)", post.status === 200, JSON.stringify(post.body).slice(0, 80));
const cell = post.body.cellId;
const n1 = (await api("POST", `/community/cells/${cell}/messages`, { text: `첫 공지 ${tag}`, channel: "notice" }, T.goryeo1392)).body.msgId;
const n2 = (await api("POST", `/community/cells/${cell}/messages`, { text: `두 번째 공지 ${tag}`, channel: "notice" }, T.goryeo1392)).body.msgId;
// 레일 로고 오류 확인용: FAU 로고를 열리지 않는 https 주소로(로컬 DB)
await api("PUT", "/brands/fau/identity", { logo_url: "https://logo.invalid.example/fau.png", tagline: "" }, T.fau);

const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.route(/invalid\.example|cdn\.example\.com/, (r) => r.abort());
await p.goto(APP + "/"); await p.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.creator, API]);
await p.reload(); await p.waitForFunction(() => window.__ME && LIVE.campaigns && LIVE.offers, null, { timeout: 15000 });
const main = () => p.locator(".v2-main").innerText();
const nav = async (label) => { await p.locator(".v2-side .v2-navbtn", { hasText: label }).first().click(); await p.waitForTimeout(900); };
await p.locator(".v2-rail").getByRole("button", { name: "고려공작1392", exact: true }).click(); await p.waitForTimeout(500);

// 캠페인 공지
await nav("캠페인 공지");
let t = await main();
ok("캠페인 공지: 게시된 카드 표시(고정 빈 상태 아님)", t.includes(cname) && !t.includes("아직 채널에 게시된 캠페인이 없어요") && t.includes("공지사항 채널"));
await p.locator(".v8-ccard", { hasText: cname }).getByRole("button", { name: "조건 보기" }).click(); await p.waitForTimeout(600);
ok("카드 → 그 캠페인 상세", (await p.evaluate(() => location.hash)).includes(cid) && (await p.locator("#v6-cdetail").count()) === 1);

// 공지 → 해당 스레드
await nav("공지사항");
await p.locator(".rowi", { hasText: `첫 공지 ${tag}` }).getByRole("button").click(); await p.waitForTimeout(1500);
const th = await p.evaluate(() => ({ root: LIVE.thread && LIVE.thread.rootId, ch: LIVE.open && LIVE.open.channel }));
ok("공지 열기 → 공지 채널 + 고른 공지(첫 공지) 스레드", th.root === n1 && th.ch === "notice", JSON.stringify(th));
await nav("공지사항");
await p.locator(".rowi", { hasText: `두 번째 공지 ${tag}` }).getByRole("button").click(); await p.waitForTimeout(1500);
ok("다른 공지 → 그 공지 스레드", (await p.evaluate(() => LIVE.thread && LIVE.thread.rootId)) === n2);

// 누적 XP = 서버 브랜드별 total
for (const [b, name] of [["goryeo1392", "고려공작1392"], ["fau", "FAU"]]) {
  await p.locator(".v2-rail").getByRole("button", { name, exact: true }).click(); await p.waitForTimeout(400);
  await nav("브랜드 랭킹"); await p.waitForTimeout(600);
  const server = (await api("GET", `/me/xp?brand=${b}`, null, T.creator)).body.total;
  const shown = Number(((await main()).match(/누적 (\d+) XP/) || [])[1]);
  ok(`[${b}] 누적 XP = 서버 total`, shown === server, `${shown}/${server}`);
}

// 이미지 fallback — 크리에이터 제품 이미지·레일 로고
await nav("캠페인 둘러보기"); await p.waitForTimeout(800);
const imgs = await p.evaluate(() => Array.from(document.querySelectorAll(".v2-main img.v6-pimg")).map((i) => ({ src: i.currentSrc || i.src, w: i.naturalWidth, alt: i.alt })));
ok("제품 이미지: 깨진 이미지 없음(실패는 이니셜 그림)", imgs.length > 0 && imgs.every((i) => i.w > 0), JSON.stringify(imgs.filter((i) => !i.w).slice(0, 2)));
ok("제품 이미지 대체는 data: 이니셜 그림(외부 사진 아님)", imgs.filter((i) => !/^https:/.test(i.src)).every((i) => i.src.startsWith("data:image/svg+xml")));
const rail = await p.locator(".v2-rail").getByRole("button", { name: "FAU", exact: true }).evaluate((b) => ({ img: b.querySelectorAll("img").length, text: b.innerText.trim() }));
ok("레일 로고 오류 → 브랜드 이니셜", rail.img === 0 && rail.text === "F", JSON.stringify(rail));
ok("크리에이터 페이지 오류 없음", !errs.length, errs.join(" | "));

// 공개 제품 상세 이미지
const q = await br.newPage({ viewport: { width: 390, height: 844 } });
await q.route(/invalid\.example|cdn\.example\.com|\/public\/product-images\//, (r) => r.abort());
await q.goto(APP + "/products/"); await q.evaluate((a) => localStorage.setItem("CONNECTION_API_URL", a), API); await q.reload();
await q.waitForSelector(".v6-pcard"); await q.locator(".v6-pcard").first().getByRole("button", { name: "상세" }).click(); await q.waitForTimeout(600);
const sheet = await q.locator("#pd-sheet img").evaluate((i) => ({ src: i.currentSrc || i.src, w: i.naturalWidth }));
ok("공개 상세 이미지 오류 → 이니셜 그림", sheet.w > 0 && sheet.src.startsWith("data:image/svg+xml"), sheet.src.slice(0, 40));
await api("PUT", "/brands/fau/identity", { logo_url: "", tagline: "" }, T.fau);
await br.close();
for (const r of results) console.log(r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`PASS ${results.length - fail} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
