// 카드 자동청구 UI — flags off(8765) 숨김 / on(8767 별도 인스턴스) 폼·동의 가드. PG 호출 0.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const results=[];const ok=(n,p,note="")=>results.push(`${p?"PASS":"FAIL"} ${n}${note?" — "+note:""}`);
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
async function login(p,api){
  await p.goto(`http://localhost:5174/?api=${encodeURIComponent(api)}`);
  await p.waitForTimeout(800);
  await p.click("#authChip");await p.fill("#axEmail","cmo@glowlab.co");await p.fill("#axPw","glowlab-pw-123");
  await p.click('button.cbt:text-is("로그인")');await p.waitForTimeout(1400);
  await p.click('button:has-text("월별 청구")');await p.waitForTimeout(1500);
}
const errors=[];
const c1=await browser.newContext();const p1=await c1.newPage();
p1.on("pageerror",e=>errors.push("off:"+e));
await login(p1,"http://localhost:8765");
const t1=await p1.evaluate(()=>document.body.innerText);
ok("off: 준비중 안내 + 수동결제 안내", t1.includes("자동청구 준비 중") && t1.includes("수동 결제"));
ok("off: 카드 입력창 없음", (await p1.locator("#bcNo").count())===0);
ok("off: 계산서 운영 안내(카드 필수 아님)", t1.includes("카드 등록은 필수가 아닙니다") && t1.includes("계산서"));
await c1.close();
const ON=process.env.BILLING_ON_API||"";
if(ON){
  const c2=await browser.newContext();const p2=await c2.newPage();
  p2.on("pageerror",e=>errors.push("on:"+e));
  const pgReqs=[];const cardPosts=[];
  p2.on("request",r=>{if(r.url().includes("nicepay"))pgReqs.push(r.url());if(r.url().includes("/billing/card")&&r.method()==="POST")cardPosts.push(1);});
  await login(p2,ON);
  const t2=await p2.evaluate(()=>document.body.innerText);
  ok("on: 등록 폼 렌더(결제 없음 문구·동의문)", t2.includes("등록 시 결제는 발생하지 않습니다") && t2.includes("자동 결제하는 데 동의"));
  ok("on: 카드 입력창 + 동의 체크박스", (await p2.locator("#bcNo").count())===1 && (await p2.locator("#bcConsent").count())===1);
  await p2.fill("#bcNo","4111111111111111");await p2.fill("#bcYY","28");await p2.fill("#bcMM","12");
  await p2.fill("#bcId","900101");await p2.fill("#bcPw","12");
  await p2.click('button:has-text("카드 등록 (결제 없음)")');   // 동의 미체크
  await p2.waitForTimeout(700);
  ok("on: 동의 미체크 → 서버/PG 호출 0", cardPosts.length===0 && pgReqs.length===0);
  ok("on: 입력값 즉시 비워짐", (await p2.evaluate(()=>document.getElementById("bcNo").value))==="");
  await c2.close();
}
ok("JS 에러 없음", errors.length===0, errors.join("|").slice(0,150));
await browser.close();
console.log(results.join("\n"));
process.exit(results.some(r=>r.startsWith("FAIL"))?1:0);
