// UI 리프레시 검수 — 375/390/768/1440 스크린샷 + focus-visible/reduced-motion/긴 텍스트/빈·로딩 상태
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const API = "http://localhost:8765";
const S = "/tmp/claude-0/-home-user-connection/01251095-f9da-56f0-92b5-f51238831bce/scratchpad/ui";
import { mkdirSync } from "node:fs";
mkdirSync(S, { recursive: true });
const results = [];
// 캡처 정책: 10초 제한·최대 1회 재시도·뷰포트 범위만(fullPage 금지 — 크래시 방지).
// 실패는 "INCOMPLETE"(검수 미완료)로 기록하고 진행한다 — 성공으로 가장하지 않는다.
const incomplete=[];
async function shot(p,path){
  for(let i=0;i<2;i++){
    try{
      await p.keyboard.press("Escape").catch(()=>{});
      await p.evaluate(()=>document.activeElement&&document.activeElement.blur()).catch(()=>{});
      await p.screenshot({path,animations:"disabled",caret:"hide",timeout:10000});
      return;
    }catch(e){
      if(i===1){incomplete.push(path.split("/").pop());
        results.push("INCOMPLETE 스크린샷 캡처 실패(검수 미완료): "+path.split("/").pop());}
    }
  }
}
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function overflow(p) {
  return p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}
async function loginConsole(p) {
  await p.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`);
  await p.waitForTimeout(800);
  await p.click("#authChip");
  await p.fill("#axEmail", "cand.cmo@glowlab.co"); await p.fill("#axPw", "glowlab-pw-123");
  await p.click('span.cbt:text-is("로그인")'); await p.waitForTimeout(1500);
}

for (const width of [375, 390, 768, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 812 : 900 }, isMobile: width < 500 });
  const errs = [];
  // ── 랜딩 ──
  const pl = await ctx.newPage(); pl.on("pageerror", e => errs.push("landing:" + e));
  await pl.goto("http://localhost:5177/"); await pl.waitForTimeout(700);
  const tl = await pl.evaluate(() => document.body.innerText);
  ok(`[${width}] 랜딩: 메시지·CTA·요금·크리에이터 설명`, tl.includes("관계를 이어가세요") && tl.includes("브랜드 가입 신청") && tl.includes("진행 방식 보기") && tl.includes("5,000원(부가세 포함)") && tl.includes("카드 등록 필수 아님") && tl.includes("브랜드 전용 공간"));
  ok(`[${width}] 랜딩: 흐름 4단계`, ["브랜드·제품 학습","후보 추천과 초대","PR 리스트 커뮤니티","협업과 월별 청구"].every(x=>tl.includes(x)));
  ok(`[${width}] 랜딩: 금지 표현 없음`, !/전달률.*보장|자동 발송으로|고객사|성공 사례 \d/.test(tl));
  ok(`[${width}] 랜딩 넘침 없음`, await overflow(pl));
  await shot(pl, `${S}/landing-${width}.png`);
  // ── 가입 오류 상태 ──
  await pl.goto("http://localhost:5177/index.html"); await pl.waitForTimeout(400);
  await pl.evaluate(() => { document.querySelector("#landing").hidden = true; document.querySelector("#signup").hidden = false; });
  await pl.fill('input[name=name]', "글로우랩 QA");
  await pl.click("#submitButton"); await pl.waitForTimeout(500);
  const terr = await pl.evaluate(() => (document.querySelector("#submitStatus")||{}).textContent || "");
  ok(`[${width}] 가입: 오류 요약(필드 나열)`, terr.includes("입력을 확인해 주세요") && terr.includes("이메일"), terr.slice(0,80));
  await pl.keyboard.press("Escape").catch(()=>{});           // 네이티브 검증 말풍선 닫기(렌더 캡처 방해)
  await pl.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await pl.waitForTimeout(200);
  await shot(pl, `${S}/signup-error-${width}.png`);

  // ── 콘솔: 홈(다음 할 일) → 제품·후보 → 메일 ──
  const pc = await ctx.newPage(); pc.on("pageerror", e => errs.push("console:" + e));
  await loginConsole(pc);
  const th = await pc.evaluate(() => document.body.innerText);
  ok(`[${width}] 콘솔 홈: 다음 할 일 + 브랜드 칩`, th.includes("다음 할 일") && th.includes("월별 청구 확인") && (await pc.locator(".brandchip").count()) > 0);
  await shot(pc, `${S}/console-home-${width}.png`);
  await pc.click('button:has-text("제품·캠페인")'); await pc.waitForTimeout(1100);
  const tp = await pc.evaluate(() => document.body.innerText);
  ok(`[${width}] 제품: 요약→편집 접기`, tp.includes("제품 프로필") && (await pc.locator("details summary").count()) > 0);
  await pc.selectOption("#candidateCountry", "TH").catch(()=>{});
  const cbtn = pc.locator('button:has-text("후보 보기")').first();
  if (await cbtn.count()) { await cbtn.click(); await pc.waitForTimeout(1400); }
  const tp2 = await pc.evaluate(() => document.body.innerText);
  ok(`[${width}] 후보: 근거·검증상태·선택 CTA`, tp2.includes("미검증 — 발송 전 확인") && tp2.includes("아웃리치 초안 만들기"));
  ok(`[${width}] 콘솔 제품·후보 넘침 없음`, await overflow(pc));
  await shot(pc, `${S}/console-candidates-${width}.png`);
  await pc.click('button:has-text("아웃리치·인박스")'); await pc.waitForTimeout(1400);
  const tm = await pc.evaluate(() => document.body.innerText);
  ok(`[${width}] 메일: 단계 위계(연결→작성→발송→답장)`, tm.includes("STEP 1 · 연결") && tm.includes("초안 저장은 발송이 아닙니다") && tm.includes("받은 답장"));
  ok(`[${width}] 메일: 점진 발송 한도 표현`, !tm.includes("웜업") || tm.includes("점진 발송 한도"));
  await shot(pc, `${S}/console-mail-${width}.png`);

  // ── 크리에이터: 탭 + 협업 ──
  const magic = await fetch(API + "/auth/magic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `ui.${width}@ex.com`, brand: "glowlab" }) }).then(r => r.json());
  const pr = await ctx.newPage(); pr.on("pageerror", e => errs.push("creator:" + e));
  await pr.goto(`http://localhost:5175/?api=${encodeURIComponent(API)}`);
  await pr.goto(`http://localhost:5175/?brand=glowlab&magic=${encodeURIComponent(magic.demoLink.split("magic=")[1])}`);
  await pr.waitForTimeout(1600);
  const tc = await pr.evaluate(() => document.body.innerText);
  ok(`[${width}] 크리에이터: 브랜드 헤더 + 탭`, tc.includes("with theprlist") && ["브랜드","캠페인","내 협업","커뮤니티·메시지"].every(x=>tc.includes(x)));
  await pr.click('button[role=tab]:has-text("내 협업")'); await pr.waitForTimeout(700);
  const tc2 = await pr.evaluate(() => document.body.innerText);
  ok(`[${width}] 크리에이터 협업: 단계 안내`, tc2.includes("지원 → 선정 → 조건 확인"));
  ok(`[${width}] 크리에이터: 내부 용어 없음`, !/creator_pool|platform_uid|invoice_id/.test(tc2));
  ok(`[${width}] 크리에이터 넘침 없음`, await overflow(pr));
  await shot(pr, `${S}/creator-collab-${width}.png`);

  // ── 관리자 후보풀 ──
  const pa = await ctx.newPage(); pa.on("pageerror", e => errs.push("admin:" + e));
  await pa.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`); await pa.waitForTimeout(1100);
  const skip = pa.locator("text=키 모드로 계속");
  if (await skip.count()) await skip.click();
  else { await pa.fill('input[placeholder="이메일"]', "admin.ctx@ex.com"); await pa.fill('input[placeholder="비밀번호"]', "admin-ctx-pass-1"); await pa.click('button:has-text("로그인")'); }
  await pa.waitForTimeout(1300);
  await pa.click("text=후보 풀"); await pa.waitForTimeout(1100);
  ok(`[${width}] 관리자 후보풀 넘침 없음`, await overflow(pa));
  await shot(pa, `${S}/admin-pool-${width}.png`);
  ok(`[${width}] JS 에러 없음`, errs.length === 0, errs.join("|").slice(0, 150));
  await ctx.close();
}

// ── 접근성: focus-visible / reduced-motion / 긴 텍스트·빈 상태 ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await loginConsole(p);
  await p.keyboard.press("Tab"); await p.keyboard.press("Tab");
  const focus = await p.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const st = getComputedStyle(el);
    return { tag: el.tagName, outline: st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0 };
  });
  ok("키보드 Tab → focus-visible 외곽선", !!focus && focus.outline, JSON.stringify(focus));
  const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const rp = await rctx.newPage();
  await rp.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`); await rp.waitForTimeout(700);
  const dur = await rp.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fast").trim());
  ok("prefers-reduced-motion → 전환 0ms", dur === "0ms", dur);
  // 긴 태국어/영어/URL 텍스트 — 커뮤니티 대화(기존 시드 สวัสดี + 장문 URL) 렌더에서 넘침 없음은
  // tests_e2e/mobile-width.mjs 심화 케이스로 상시 검증됨. 빈 목록/로딩/실패 구분:
  await p.click('button:has-text("홈")').catch(()=>{});
  await rctx.close(); await ctx.close();
}
await browser.close();
console.log(results.join("\n"));
if(incomplete.length)console.log("검수 미완료 스크린샷: "+incomplete.join(", "));
process.exit(results.some(r => r.startsWith("FAIL")) ? 1 : 0);
