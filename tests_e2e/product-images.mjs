// 제품 이미지 업로드 → 공개 → 로그아웃 /products/ 에서 실제 사진·추가 이미지 표시, 공개 해제 시 익명 접근 차단,
// 멤버 크리에이터 캠페인 카드에는 서명 URL 이미지. 실 로컬 API·DB, 실브라우저(외부 스토리지 없음).
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";
const API = process.env.API_URL || "http://localhost:8765", APP = process.env.APP_URL || "http://localhost:5175";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
const results = []; const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const H = { Authorization: "Bearer " + T.goryeo1392 };
const j = (m, p, b) => fetch(API + p, { method: m, headers: { ...H, "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
// 실제로 디코딩되는 PNG(8x8 단색) — 색으로 대표/추가 구분
const png = (hex) => Buffer.from(hex, "base64");
const RED = png("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4oaGBFTEMLQkAgl1GAWqNFmsAAAAASUVORK5CYII=");
const BLUE = png("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPQ0DiBFTEMLQkAMl1GAd0cO4AAAAAASUVORK5CYII=");
const tag = Date.now().toString(36).slice(-5), name = `업로드 제품 ${tag}`;
const pid = (await j("POST", "/brands/goryeo1392/products", { name })).body.productId;
await j("POST", `/brands/goryeo1392/products/${pid}/profile`, { answers: { description: "브랜드가 직접 입력한 상세 설명 " + tag } });
const up = (buf, slot) => fetch(`${API}/brands/goryeo1392/products/${pid}/images?slot=${slot}`, { method: "POST", headers: { ...H, "Content-Type": "image/png" }, body: buf }).then((r) => r.status);
ok("업로드: 대표·추가 이미지(실 API)", (await up(RED, "main")) === 200 && (await up(BLUE, "extra")) === 200);
ok("업로드: 형식 오류 거부", (await fetch(`${API}/brands/goryeo1392/products/${pid}/images?slot=main`, { method: "POST", headers: { ...H, "Content-Type": "image/png" }, body: Buffer.from("not an image") })).status === 415);
const pub = await j("POST", `/brands/goryeo1392/products/${pid}/public`, { listed: true });
ok("명시적 공개(운영 소개 없이 상세 설명+업로드 이미지)", pub.status === 200, JSON.stringify(pub.body).slice(0, 100));
const br = await chromium.launch();
for (const w of [1280, 390]) {
  const p = await br.newPage({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
  await p.goto(APP + "/products/"); await p.evaluate((a) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.removeItem("CONNECTION_JWT"); }, API); await p.reload();
  await p.waitForSelector(".v6-pcard"); await p.locator("#v6pf-q").fill(tag); await p.waitForTimeout(1200);
  const card = p.locator(".v6-pcard", { hasText: name });
  const im = await card.locator("img.v6-pimg").evaluate((x) => ({ src: x.currentSrc, w: x.naturalWidth }));
  ok(`[${w}] 로그아웃 /products/: 업로드 대표 사진 표시`, im.w === 8 && im.src.includes("/public/product-images/"), JSON.stringify(im));
  await card.getByRole("button", { name: "상세" }).click(); await p.waitForTimeout(800);
  const th = await p.locator("#pd-sheet .v6-thumb img").evaluateAll((xs) => xs.map((x) => ({ w: x.naturalWidth, src: x.currentSrc })));
  ok(`[${w}] 상세: 추가 이미지 표시`, th.length === 1 && th[0].w === 8 && th[0].src.includes("/public/product-images/"), JSON.stringify(th));
  if (w < 500) await p.screenshot({ path: "docs/qa/v8/products-390-uploaded-detail.png" });
  await p.close();
}
// 공개 해제 → 익명 이미지 접근 403, 목록에서 빠짐
await j("POST", `/brands/goryeo1392/products/${pid}/public`, { listed: false });
const items = (await (await fetch(API + "/public/products?limit=100")).json()).items;
const mainId = (await j("GET", "/brands/goryeo1392/products")).body.find((x) => x.productId === pid).images.find((i) => i.slot === "main");
ok("공개 해제: 목록 제외 + 익명 이미지 403 + 소유 브랜드 서명 주소는 열림",
  !items.some((x) => x.productId === pid) && (await fetch(`${API}/public/product-images/${mainId.imageId}`)).status === 403 && (await fetch(API + mainId.url)).status === 200);
await br.close(); for (const x of results) console.log(x);
const fail = results.filter((x) => x.startsWith("FAIL")).length; console.log(`PASS ${results.length - fail} FAIL ${fail}`); process.exit(fail ? 1 : 0);
