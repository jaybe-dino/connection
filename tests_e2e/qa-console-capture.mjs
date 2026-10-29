// 콘솔 대표 장면 캡처(1280/390) — 실제 클릭 후 열린 상세·오류 상태. 로컬 실 API·DB, 외부 발송 없음.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const API = "http://localhost:8765", CON = "http://localhost:5174", OUT = "docs/qa/v8";
const T = JSON.parse(readFileSync("tests_e2e/shots/.seed-tokens.json", "utf8"));
const br = await chromium.launch(); const shots = [];
for (const w of [1280, 390]) {
  const p = await br.newPage({ viewport: { width: w, height: w < 500 ? 844 : 900 } }); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.route(/cdn\.example\.com|invalid\.example/, (r) => r.abort());
  await p.goto(CON + "/"); await p.evaluate(([t, a]) => { localStorage.setItem("CONNECTION_API_URL", a); localStorage.setItem("CONNECTION_JWT", t); }, [T.goryeo1392, API]);
  await p.reload(); await p.waitForFunction(() => window.__C8 && document.querySelector(".v2-brand"));
  const shot = async (name, note) => { await p.waitForTimeout(1300); const f = `console-${name}-${w}.png`; await p.screenshot({ path: `${OUT}/${f}` }); shots.push({ file: f, width: w, note, overflowX: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) }); };
  await p.evaluate(() => C8.go("b-learning")); await p.waitForTimeout(1200);
  await p.locator('[data-f="L.homepage"]').fill("brand.example"); await p.locator(".v2-main").getByRole("button", { name: "검증하고 저장" }).click(); await shot("learning-error", "브랜드 학습 — 홈페이지 형식 오류 상태");
  const prod = (await (await fetch(API + "/brands/goryeo1392/products", { headers: { Authorization: "Bearer " + T.goryeo1392 } })).json()).find((x) => (x.images || []).length);
  if (prod) { await p.evaluate((id) => C8.editProd(id), prod.productId); await shot("product-photo", "제품 편집 — 업로드한 대표 이미지·공개 상태"); }
  const camps = await (await fetch(API + "/brands/goryeo1392/campaigns", { headers: { Authorization: "Bearer " + T.goryeo1392 } })).json();
  const done = camps.filter((c) => c.name.startsWith("콘솔 캠페인")).pop();
  await p.evaluate(() => { C8.newCamp(); }); await p.waitForTimeout(500); await p.evaluate(() => C8.wizGo(3)); await p.locator(".v2-main").getByRole("button", { name: "다음", exact: true }).click(); await shot("create-step3-error", "새 캠페인 3단계 — 필수 조건 오류");
  if (done) {
    await p.evaluate((c) => { C8.goApp(c, null); }, done.campaignId); await shot("applicants", "지원자 — 선택 캠페인·참여 상세");
    await p.evaluate((c) => { C8.goSc(c, "video"); }, done.campaignId); await shot("samples-video", "샘플·영상 — 영상 검수(제출 영상 보기·검수 완료≠지급)");
  }
  await p.evaluate(() => { C8.go("b-community"); }); await p.waitForTimeout(800); await shot("dm", "커뮤니티·DM — 대화 상세");
  await p.evaluate(() => { C8.go("b-reply"); }); await p.waitForTimeout(800); await p.locator(".v6-ithread").first().click().catch(() => {}); await shot("reply", "회신함 — 회신 상세·후속 처리");
  await p.evaluate(() => { C8.go("b-mailconnect"); }); await shot("mailconnect", "이메일 연결 — 연결 계정·일일 잔량");
  await p.evaluate(() => { C8.go("b-mailprep"); C8.mailGo(1); }); await p.locator(".v2-main").getByRole("button", { name: "다음", exact: true }).click(); await shot("mailprep-error", "메일 작성·검수 — 1단계 필수 오류");
  await p.evaluate(() => { C8.go("b-team"); }); await shot("team", "팀 — 실제 역할·권한");
  await p.evaluate(() => { C8.go("b-billing"); }); await shot("billing", "월별 청구 — 현행 기준·청구서");
  shots.push({ width: w, pageErrors: errs });
  await p.close();
}
await br.close();
writeFileSync(`${OUT}/console-shots.json`, JSON.stringify({ capturedAt: new Date().toISOString(), data: "로컬 실 API·DB(seed + E2E 생성 데이터)", shots }, null, 2));
console.log(shots.map((s) => s.file ? `${s.file}${s.overflowX ? " OVERFLOW" : ""}` : `errors@${s.width}: ${s.pageErrors.length}`).join("\n"));
