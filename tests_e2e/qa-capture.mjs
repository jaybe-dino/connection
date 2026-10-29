// QA 보존용 소수 캡처 — 실제 v8 UI(로컬 실 API·DB)를 1280/390 으로 찍어 docs/qa/v8 에 남긴다.
// 사용: node tests_e2e/qa-capture.mjs  (로컬 스택 + 시드 전제, 외부 발송 없음)
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const API = process.env.API_URL || "http://localhost:8765";
const APP = process.env.APP_URL || "http://localhost:5175";
const CON = process.env.CONSOLE_URL || "http://localhost:5174";
const OUT = "docs/qa/v8";
const T = JSON.parse(readFileSync(process.env.SEED_TOKENS || "tests_e2e/shots/.seed-tokens.json", "utf8"));
mkdirSync(OUT, { recursive: true });
const shots = [];
const br = await chromium.launch();
const creatorScreens = [["c-tasks", "fau"], ["c-recruit", "goryeo1392"], ["c-ranking", "fau"]];
for (const w of [1280, 390]) {
  const p = await br.newPage({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
  await p.route(/invalid\.example|cdn\.example\.com/, (r) => r.abort());
  await p.goto(APP + "/"); await p.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.creator, API]);
  await p.reload(); await p.waitForFunction(() => window.__ME && LIVE.campaigns && LIVE.offers, null, { timeout: 15000 });
  for (const [s, b] of creatorScreens) {
    await p.evaluate(([s, b]) => { V8brand(b); V8go(s); }, [s, b]); await p.waitForTimeout(1200);
    const f = `creator-${s}-${w}.png`; await p.screenshot({ path: `${OUT}/${f}` });
    shots.push({ file: f, app: "app", screen: s, brand: b, width: w, overflowX: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
  }
  await p.goto(APP + "/products/"); await p.waitForSelector(".v6-pcard, .v6-empty"); await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/products-${w}.png` });
  shots.push({ file: `products-${w}.png`, app: "app/products", width: w, overflowX: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
  await p.close();
}
await br.close();
writeFileSync(`${OUT}/shots.json`, JSON.stringify({ capturedAt: new Date().toISOString(), data: "로컬 실 API·DB(scripts/dev/seed_local_v8.py + E2E 실행 데이터)", shots }, null, 2));
console.log(shots.map((s) => `${s.file}${s.overflowX ? " OVERFLOW" : ""}`).join("\n"));
