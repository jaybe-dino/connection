// 어드민 모바일 375/390 — 상단 메뉴 전환·대시보드 타일·후보 풀 폼 가독성 + 스크린샷
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const API="http://localhost:8765";
const S="/tmp/claude-0/-home-user-connection/01251095-f9da-56f0-92b5-f51238831bce/scratchpad";
const results=[];const ok=(n,p,note="")=>results.push(`${p?"PASS":"FAIL"} ${n}${note?" — "+note:""}`);
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
for(const width of [375,390]){
  const ctx=await browser.newContext({viewport:{width,height:812},isMobile:true,hasTouch:true});
  const p=await ctx.newPage();const errs=[];p.on("pageerror",e=>errs.push(String(e)));
  await p.goto(`http://localhost:5176/?api=${encodeURIComponent(API)}`);
  await p.waitForTimeout(1200);
  const skip=p.locator("text=키 모드로 계속");
  if(await skip.count()){await skip.click();}
  else{await p.fill('input[placeholder="이메일"]',"admin.ctx@ex.com");await p.fill('input[placeholder="비밀번호"]',"admin-ctx-pass-1");await p.click('button:has-text("로그인")');}
  await p.waitForTimeout(1500);
  // 좌측 고정 레일이 아니라 상단 메뉴여야 함: nav가 화면 폭 전체 + main이 그 아래
  const layout=await p.evaluate(()=>{
    const nav=document.querySelector("nav"),main=document.querySelector("main");
    if(!nav||!main)return null;
    const n=nav.getBoundingClientRect(),m=main.getBoundingClientRect();
    return {navW:Math.round(n.width),navBottom:Math.round(n.bottom),mainTop:Math.round(m.top),mainW:Math.round(m.width),vw:window.innerWidth,scrollW:document.documentElement.scrollWidth};
  });
  ok(`[${width}] 상단 메뉴 전환(nav 전체폭·본문 아래 배치)`, !!layout&&layout.navW>=width-2&&layout.mainTop>=layout.navBottom-1, JSON.stringify(layout));
  ok(`[${width}] 본문이 실사용 폭 확보(≥ ${width-30}px)`, !!layout&&layout.mainW>=width-30, `mainW=${layout&&layout.mainW}`);
  ok(`[${width}] 가로 넘침 없음`, !!layout&&layout.scrollW<=layout.vw+1);
  // 대시보드 타일이 세로 찌그러짐 없이 읽히는지: 첫 타일 폭
  const tile=await p.evaluate(()=>{const el=[...document.querySelectorAll("main div")].find(d=>d.textContent&&d.textContent.includes("브랜드 신청 대기"));if(!el)return null;const card=el.closest("main > div > div > *")||el;return Math.round(card.getBoundingClientRect().width);});
  ok(`[${width}] 대시보드 타일 폭 ≥140px(한 글자 세로 찌그러짐 없음)`, (tile||0)>=140, `tile=${tile}`);
  await p.screenshot({path:`${S}/admin-mobile-${width}-dashboard.png`,fullPage:false});
  // 후보 풀 화면
  await p.click("text=후보 풀");await p.waitForTimeout(1300);
  const t=await p.evaluate(()=>document.body.innerText);
  ok(`[${width}] 후보 풀 현황·폼 렌더`, t.includes("추천 가능")&&t.includes("CSV 등록"));
  const ta=await p.evaluate(()=>{const el=document.querySelector("main textarea");return el?Math.round(el.getBoundingClientRect().width):0;});
  ok(`[${width}] CSV 입력창 실사용 폭(≥ ${width-60}px)`, ta>=width-60, `textarea=${ta}`);
  const over=await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
  ok(`[${width}] 후보 풀 가로 넘침 없음`, over);
  await p.screenshot({path:`${S}/admin-mobile-${width}-pool.png`,fullPage:true});
  ok(`[${width}] JS 에러 없음`, errs.length===0, errs.join("|").slice(0,120));
  await ctx.close();
}
await browser.close();
console.log(results.join("\n"));
process.exit(results.some(r=>r.startsWith("FAIL"))?1:0);
