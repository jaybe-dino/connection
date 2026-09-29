// 번역 재시도 실브라우저 — 버튼 표시→클릭→상태 갱신, JS 에러 0
// 전제: e2e DB의 cell-glowlab-th에 failed 메시지 1건(스크립트가 시드)
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { execSync } from "node:child_process";
const API="http://localhost:8765";
const results=[];const ok=(n,p,note="")=>results.push(`${p?"PASS":"FAIL"} ${n}${note?" — "+note:""}`);
// 시드: 브랜드 토큰으로 메시지 작성 후 failed로 강제(키 없는 로컬은 pending으로 저장됨)
const login=await fetch(API+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"cmo@glowlab.co",password:"glowlab-pw-123"})}).then(r=>r.json());
await fetch(API+"/community/cells/cell-glowlab-th/messages",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+login.token},body:JSON.stringify({text:"seed-check-longword",locale:"ko"})});
execSync(`PGUSER=postgres PGPASSWORD=postgres PGHOST=localhost psql -d e2e_c3 -c "UPDATE cell_messages SET translation_state='failed', translation_attempts=5 WHERE original='seed-check-longword';" >/dev/null`);
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const errors=[];
const ctx=await browser.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage();p.on("pageerror",e=>errors.push(String(e).slice(0,120)));
await p.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`);
await p.waitForTimeout(800);
await p.click("#authChip");await p.fill("#axEmail","cmo@glowlab.co");await p.fill("#axPw","glowlab-pw-123");
await p.click('span.cbt:text-is("로그인")');await p.waitForTimeout(1400);
await p.click('button:has-text("커뮤니티")');
const lounge=p.locator('button:has-text("라운지 ·")').first();
await lounge.waitFor({timeout:8000});await lounge.click();
await p.locator('article.cc').first().waitFor({timeout:8000});
const t=await p.evaluate(()=>document.body.innerText);
ok("실패 안내+재시도 버튼 표시", t.includes("번역 실패 — 원문은 보존")&&t.includes("번역 재시도"));
ok("원문 보존 표시", t.includes("seed-check-longword"));
await p.click('button:has-text("번역 재시도")');
await p.waitForTimeout(1800);
const t2=await p.evaluate(()=>document.body.innerText);
ok("재시도 접수 피드백", t2.includes("완료되지 않았습니다")||t2.includes("재시도를 접수")||t2.includes("번역 재시도 완료"));
ok("JS 에러 없음", errors.length===0, errors.join("|"));
await browser.close();
console.log(results.join("\n"));
process.exit(results.some(r=>r.startsWith("FAIL"))?1:0);
