// 모바일 375/390 실측 — 각 표면·주요 페이지의 가로 넘침(스크롤 폭)과 넘친 요소 보고
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const API = "http://localhost:8765";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);

async function measure(p, name) {
  const m = await p.evaluate(() => {
    const doc = document.documentElement;
    const over = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 1 && r.width > 8)
        over.push(el.tagName + (el.id ? "#" + el.id : "") + " right=" + Math.round(r.right));
    }
    return { scrollW: doc.scrollWidth, innerW: window.innerWidth, over: over.slice(0, 5) };
  });
  ok(`${name} 가로 넘침 없음 (scrollW=${m.scrollW}/vw=${m.innerW})`, m.scrollW <= m.innerW + 1, m.over.join(" | "));
}

const longWord = "https://cdn.example.com/" + "verylongpathsegment".repeat(8) + ".png";

for (const width of [390, 375]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });

  // ── 콘솔: 로그인 → 홈/제품/아웃리치·인박스/청구/커뮤니티 ──
  const pc = await ctx.newPage();
  await pc.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`);
  await pc.waitForTimeout(900);
  const vp = await pc.evaluate(() => window.innerWidth);
  ok(`[${width}] 뷰포트 실측 ${vp}px`, vp === width);
  await measure(pc, `[${width}] 콘솔 로그인 전`);
  await pc.click("#authChip");
  await pc.fill("#axEmail", "cmo@glowlab.co");
  await pc.fill("#axPw", "glowlab-pw-123");
  await pc.click('button.cbt:text-is("로그인")');
  await pc.waitForTimeout(1500);
  await measure(pc, `[${width}] 콘솔 홈`);
  for (const btn of ["제품·캠페인", "아웃리치·인박스", "월별 청구", "커뮤니티"]) {
    const b = pc.locator(`button:has-text("${btn}")`).first();
    if (await b.count()) { await b.click(); await pc.waitForTimeout(1100); await measure(pc, `[${width}] 콘솔 ${btn}`); }
  }
  // 긴 URL 입력값도 넘치지 않는지 (메일 페이지 로고 입력)
  await pc.click('button:has-text("아웃리치·인박스")');
  await pc.waitForTimeout(1200);
  const logoInput = pc.locator("#idLogo");
  if (await logoInput.count()) { await logoInput.fill(longWord); await measure(pc, `[${width}] 콘솔 긴 URL 입력`); }

  // ── 크리에이터 앱: 로그인 전 + 로그인 후 ──
  const pa = await ctx.newPage();
  await pa.goto(`http://localhost:5175/?api=${encodeURIComponent(API)}&brand=glowlab`);
  await pa.waitForTimeout(1100);
  await measure(pa, `[${width}] 크리에이터 로그인 전(초대 카드)`);
  const magic = await fetch(API + "/auth/magic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `mob.${width}@ex.com` }) }).then(r => r.json());
  await pa.goto(`http://localhost:5175/?magic=${encodeURIComponent(magic.demoLink.split("magic=")[1])}`);
  await pa.waitForTimeout(1500);
  await measure(pa, `[${width}] 크리에이터 로그인 후`);

  // ── signup: 랜딩 + 가입 폼 ──
  const ps = await ctx.newPage();
  await ps.goto("http://localhost:5177/");
  await ps.waitForTimeout(700);
  await measure(ps, `[${width}] signup 랜딩`);
  await ps.evaluate(() => { const l = document.querySelector("#landing"), s = document.querySelector("#signup"); if (l && s) { l.hidden = true; s.hidden = false; } });
  await ps.waitForTimeout(400);
  const url = ps.locator("input[name=site], #applicationForm input[type=url]").first();
  if (await url.count()) await url.fill("https://brand-with-a-really-long-domain-name.example-shop.com/collections/all-products");
  await measure(ps, `[${width}] signup 가입 폼(긴 URL 포함)`);

  await ctx.close();
}
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
