/* ============================================================ 상태 */
const BRANDS = {
 GLOWLAB:{ nm:'GLOWLAB', cat:'스킨케어 · 한국', color:'linear-gradient(140deg,#EFC8B6,#C2543C)',
   cell:'태국 크루 · 1번방', cap:0, at:131, reward:'₩45,000', desc:'선케어·앰플 중심. 태국·미국·베트남에 285명이 활동 중입니다.' },
 AURA:{ nm:'AURA LAB', cat:'클렌저 · 한국', color:'linear-gradient(140deg,#C9E3D4,#3E6E8E)',
   cell:'태국 클렌저 · 1번방', cap:0, at:19, reward:'₩52,000', desc:'저자극 클렌저 라인. 태국 앰배서더를 처음 모집합니다.' },
 NOON:{ nm:'NOON', cat:'메이크업 · 한국', color:'linear-gradient(140deg,#D8CFEA,#6B5E8E)',
   cell:'태국 메이크업 · 2번방', cap:0, at:236, reward:'₩38,000', desc:'톤업·베이스 메이크업. 신청 후 승인제 셀입니다.', appr:1 },
};
const SEED_MSGS = {
 GLOWLAB:[
  {who:'seed',tx:'다들 선쿠션 <b>어디부터 바르세요?</b> T존 먼저인 분, 볼부터인 분 갈리는 것 같아서요.'},
  {who:'Ploy S.',tm:'09:12',lang:'th',orig:'ฉันเริ่มจากทีโซนค่ะ หน้าร้อนตรงนั้นพังก่อนเลย เลยทาสองรอบ',tx:'저는 T존부터요. 여름엔 거기가 제일 먼저 무너져서 <b>두 번 바르는 편</b>이에요.',g:1},
  {who:'Nan T.',tm:'09:31',lang:'th',orig:'ฉันเริ่มจากแก้มค่ะ! เดี๋ยวลองวิธีของ Ploy ดูนะ',tx:'저는 볼부터요! 근데 Ploy 님 방식 다음에 해볼게요',g:2},
  {who:'Maya C.',tm:'09:44',lang:'en',orig:'T-zone first here too — I reapply at noon, my studio lights melt everything.',tx:'저도 T존 먼저요 — 정오에 한 번 더 발라요. 스튜디오 조명에 다 무너져서요.',g:2},
  {who:'Fah K.',tm:'10:02',g:1,ct:{th:'linear-gradient(140deg,#F0D9CE,#C2543C)',cap:'아침 루틴 30초 컷 — 선쿠션 파트만 잘라봤어요',stat:'저장 1.2K · 조회 48K'},tx:'이런 식으로 찍으면 편해요! 참고하세요'},
  {who:'sys',tx:'<b>Nan 님</b>이 첫 영상을 올렸어요'}],
 AURA:[
  {who:'seed',tx:'새로 오신 분들 환영해요. <b>지금 쓰고 계신 클렌저</b>가 뭔지 알려주시면 비교 콘텐츠 짤 때 도움이 돼요.'},
  {who:'Gift W.',tm:'08:50',lang:'th',orig:'ฉันใช้แบบโฟมค่ะ แต่หน้าหนาวมันตึงไปหน่อย',tx:'저는 폼 타입 쓰는데 겨울엔 당겨서 고민이에요',g:2}],
};
const INIT=()=>({
 app:(window.__SURFACE||'creator'), c:'welcome', b:'brief',
 me:{ pass:false, name:'Ploy S.', handle:'', grade:'A',
      consents:[true,true,true,false], joined:[], cur:null, joinBrand:null, joinStep:0, brandConsent:[true,true] },
 cellMsgs:{ GLOWLAB:[...SEED_MSGS.GLOWLAB], AURA:[...SEED_MSGS.AURA],
   TH2:[{who:'Bee P.',tm:'08:12',tx:'2번방은 이번 주 앰플 조 맞죠? 샘플 언제 오는지 아시는 분',g:2},
        {who:'June L.',tm:'08:40',tx:'저는 어제 받았어요! 곧 오실 거예요',g:1}],
   TH3:[{who:'seed',tx:'요즘 조용하네요. <b>촬영할 때 제일 어려운 게 뭔가요?</b> 하나만 알려주시면 정리해서 팁으로 만들어 볼게요.'}] },
 curCh:'잡담', bCell:'GLOWLAB', bCh:'잡담', bTab:'talk',
 rules:{autoInvite:true, seedHour:'09:00', silentDays:4, assign:'country_grade', autonomy:2, access:'apply'},
 queue:{cand:12, invited:0, joinedQ:0},
 srcTab:'agents',
 ch:{ tkshop:{on:1,lv:1}, comm:{on:1,lv:1}, email:{on:1,lv:1}, igdm:{on:1,lv:2},
      inbound:{on:1,lv:2}, api:{on:1,lv:2}, ref:{on:1,lv:2}, clean:{on:1,lv:2} },
 mail:{ seq:[1,1,0], daily:80, lang:'th', gate:null },
 tk:{ used:12, cap:20, sent:false }, learn:false, tech:{graded:false, revoked:false},
 pwa:false, myLang:'th',
 dbSeg:'all', dbQ:'', dbSel:'fah',
 bj:{step:0, slug:'glowlab', slugOk:false, plan:1, agree:[true,true], q:0, url:'glowlab.kr', learned:false, confirmed:false}, agOpen:null, planTab:'svc',
 seeded:{}, swept:false, pastedN:0,
 gates:{pii:null,payout:null,exp:null},
 camps:[{id:'sun', nm:'8월 선쿠션 · 태국 1차', prod:'선쿠션 SPF50+', type:'paid', pay:'₩45,000', aff:'',
   img:'linear-gradient(140deg,#F0D9CE,#D89A82)',
   usp:['백탁 없음 · 톤 그대로','지성 피부도 안 무너짐','시카 진정 · 민감성 OK'],
   req:'15초 이상 · 제품 3초 노출 · #ad 표기 · 얼굴 노출 자유', due:'9/15', slots:40, st:'open',
   th:{nm:'คุชชั่นกันแดด ส.ค. · ไทย รอบ 1', prod:'คุชชั่นกันแดด SPF50+',
    usp:['ไม่วอกแวก · สีผิวคงเดิม','ผิวมันก็ไม่พัง','ซิก้าปลอบผิว · ผิวแพ้ง่ายโอเค'],
    req:'ยาว 15 วิ ขึ้นไป · โชว์สินค้า 3 วิ · ติด #ad · เปิดหน้าหรือไม่ก็ได้'}}],
 campLang:{},
 nc:{type:'paid'}, campTab:'stat',
 dm:[{who:'brand',tm:'10:20',lang:'ko',orig:'지원 감사합니다! 아침 루틴 영상 톤이 저희 제품과 잘 맞아요. 향에 민감하신 편인가요?',
      tx:'지원 감사합니다! 아침 루틴 영상 톤이 저희 제품과 잘 맞아요. 향에 민감하신 편인가요?'}],
 profile:{addr:'방콕 왓타나구 수쿰빗 소이 23', phone:'+66 89-xxx-4421', skin:'지성 · 민감', bank:'카시콘 ···0871', addrAt:'6월 12일'},
 editKey:null,
 applied:false,shipped:false,submitted:false,tagFixed:false,passed:false,licensed:false,paid:false,
 recruited:42,shippedN:0,submittedN:29,passedN:27,roster:285,
 earnExport:0, chat:[], busy:false,
 ledger:[['02:15','BILLING_EVENT','검증 가입 18건 · billable=true','₩180,000','3c88…a012'],
         ['02:15','CONSENT_APPENDED','신규 23명 · policy_version 2026-08-v1','—','a417…88bc']],
});
let ST=INIT();
function resetAll(){ ST=INIT(); seedChat(); render(); toast('초기화','처음 상태로 되돌렸습니다.'); }

function toast(l,m,app,scr){
 const w=document.getElementById('toastWrap');
 w.innerHTML=`<div class="toast"><span class="x" onclick="this.parentElement.remove()">✕</span>
  <div class="l">${l}</div><div class="m">${m}</div>
  ${app?`<button class="go" onclick="jump('${app}','${scr||''}')">보러 가기 →</button>`:''}</div>`;
 clearTimeout(window._t); window._t=setTimeout(()=>{ if(w.firstChild) w.innerHTML=''; },9000);
}
function jump(a,s){ document.getElementById('toastWrap').innerHTML='';
 if(a==='brand'&&s) ST.b=s; if(a==='creator'&&s) ST.c=s; go(a); }
function go(a){ ST.app=a; render(); }

function spark(v,c){const w=104,h=22,mx=Math.max(...v),mn=Math.min(...v),rg=(mx-mn)||1;
 const p=v.map((x,i)=>[i*(w/(v.length-1)),h-2-((x-mn)/rg)*(h-5)]);
 const d=p.map((q,i)=>(i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)).join(' ');
 return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
 <path d="${d} L${w} ${h} L0 ${h} Z" fill="${c}" opacity=".1"/>
 <path d="${d}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
 <circle cx="${p[p.length-1][0]}" cy="${p[p.length-1][1]}" r="2.2" fill="${c}"/></svg>`}
const mc=(l,v,dl,dc,sk,nt)=>`<div class="mc${dc==='dn'?' w':''}"><div class="l">${l}</div>
 <div class="vv"><span class="v num">${v}</span>${dl?`<span class="dl ${dc}">${dl}</span>`:''}</div>
 ${sk?`<div class="sp">${sk}</div>`:''}${nt?`<div class="nt2">${nt}</div>`:''}</div>`;
const SEG=a=>`<div class="seg">${a.map((x,i)=>`<span class="${i===0?'on':''}">${x}</span>`).join('')}</div>`;
const NOTE=t=>`<div class="note"><div class="a av"></div><p>${t}</p></div>`;
const joined=b=>ST.me.joined.includes(b);
function gateCount(){let n=0; if(ST.gates.pii===null)n++; if(ST.gates.payout===null)n++;
 return n;}
const reviewCount=()=>ST.submitted&&!ST.passed?1:0;

/* ============================================================
   크리에이터 앱 — 온보딩 → 셀 가입 → 셀 생활
   ============================================================ */
const CA = {

/* ---------- 0. 웰컴 ---------- */
welcome:()=>({hd:null, body:`
 <div class="hero2">
  <div class="lgm"><span class="sym"><i class="c"></i><i class="a"></i><i class="b"></i></span><span>CONNECTION</span></div>
  <h1>브랜드는 여러 곳,<br>계정은 <i>하나</i>.</h1>
  <p>커넥션은 브랜드가 운영하는 <b>크리에이터 커뮤니티</b>를 한 자리에 모아둔 곳이에요.
   여기서 계정을 하나 만들면, 브랜드마다 다시 가입할 필요가 없습니다.</p>
  <p>브랜드마다 <b>셀</b>이라는 방이 있어요. 인원 상한 없이 여러 명이 함께 이야기하고,
   서로 <b>다른 언어로 말해도 각자 자기 언어로</b> 보입니다.</p>
 <div class="urlbar"><span class="lk2">connection.app/glowlab</span>
  <span class="cp" onclick="toast('브랜드 URL','주소는 <b>브랜드명 하나</b>로 끝납니다. 링크로 들어와도 <b>커넥션 패스 로그인</b>부터 거치고, 로그인하면 바로 그 브랜드의 내 셀로 이동해요.')">?</span></div>
 </div>
 <div class="cc" style="background:var(--n50)"><div class="t">이렇게 진행됩니다</div>
  <p>① 커넥션 계정 만들기 (한 번만)<br>② 참여할 브랜드 셀 고르기<br>
   ③ 그 브랜드에만 해당하는 동의 · 자격 확인<br>④ 셀 입장</p></div>
 <button class="btn lg" style="width:100%;margin-top:6px" onclick="ST.c='signup';render()">시작하기</button>
 <div class="fine">이미 계정이 있으면 로그인만 하면 됩니다.
  회원 정보는 <b>각 브랜드가 소유</b>하고, 커넥션은 <b>본인 확인만</b> 맡습니다.</div>`}),

/* ---------- 1. 커넥션 가입 ---------- */
signup:()=>({hd:['커넥션 계정 만들기','한 번만 하면 됩니다'], back:'welcome', steps:[1,0,0,0], body:`
 <div class="cc" style="background:var(--t50);border-color:var(--t100)">
  <div class="t">지금 만드는 건 브랜드 계정이 아니에요</div>
  <p>커넥션 계정(<b>패스</b>)입니다. 이 하나로 <b>여러 브랜드 셀</b>에 들어갈 수 있어요.</p></div>
 ${['커넥션 패스 생성 · <b>본인 확인</b>을 커넥션이 맡습니다','서비스 이용약관',
    '국외 이전 · 해외 브랜드·물류와 연결되기 위해 필요합니다','다른 브랜드 셀 추천 받기']
  .map((t,i)=>`<div class="cs" onclick="tg(${i})">
    <div class="bx ${ST.me.consents[i]?'on':''}">${ST.me.consents[i]?'✓':''}</div>
    <div class="tx">${t}${i<3?'<span class="rq">필수</span>':'<span class="op">선택</span>'}</div></div>`).join('')}
 <div style="margin-top:16px">
  <div style="font-size:9.4px;font-weight:900;letter-spacing:.12em;color:var(--n600);margin-bottom:7px">크리에이터 계정으로 시작 · 필수</div>
  <div class="oa mn" onclick="mkPass('tiktok')"><span class="ic" style="background:#111"></span>TikTok 계정으로 시작</div>
  <div class="oa" onclick="mkPass('instagram')"><span class="ic" style="background:linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)"></span>Instagram 계정으로 시작</div>
  <p style="font-size:10.2px;color:var(--n600);line-height:1.6;margin-top:8px">
   가입은 <b>본인 크리에이터 계정 연결</b>로만 됩니다. 이메일 가입은 없어요 —
   계정이 진짜인지가 이 커뮤니티 전체의 <b>DB 품질</b>이라서요. 팔로워·게시물은 <b>공개 범위만</b> 읽습니다.</p>
  <div style="font-size:9.4px;font-weight:900;letter-spacing:.12em;color:var(--n400);margin:12px 0 5px">가입 후 연결 가능</div>
  <div style="font-size:10.6px;color:var(--n400)">Google · Discord — 로그인 보조 수단으로만, 가입은 안 됩니다.</div></div>
 <div class="fine">동의 기록은 <b>append-only</b>로 보관되며 수정되지 않습니다.
  필수 3개 + <b>SNS 계정 연결</b>이 있어야 계정이 만들어집니다.</div>`}),

/* ---------- 2. 셀 고르기 (허브) ---------- */
hub:()=>({hd:[ST.me.name+' 님의 커넥션', `패스 · 소속 셀 ${ST.me.joined.length}개`], body:`
 <div class="cc" style="background:var(--n900);border:none;color:#fff">
  <div style="display:flex;gap:12px;align-items:center">
   <div class="av" style="width:40px;height:40px"></div>
   <div><div style="font-size:14.4px;font-weight:800">${ST.me.name}</div>
    <div style="font-size:10.8px;color:#B8B1A8;margin-top:2px">
     ${ST.me.handle||'@ploy.skincare'} · 태국 · <b style="color:#fff">${ST.me.grade}등급</b></div></div>
   <div style="margin-left:auto;text-align:right">
    <div class="num" style="font-size:17px;font-weight:800">₩${((ST.paid?142000:97000)+ST.earnExport).toLocaleString()}</div>
    <div style="font-size:9.6px;color:#B8B1A8">누적 정산</div></div></div></div>
 ${ST.me.joined.length? `<div style="font-size:9.6px;font-weight:900;letter-spacing:.14em;color:var(--n600);margin:16px 0 8px">참여 중인 셀</div>
  ${ST.me.joined.map(k=>{const B=BRANDS[k];return `<div class="cellcard joined">
   <div class="bl" style="background:${B.color}"></div>
   <div><div class="nm">${B.nm}</div><div class="ds">${B.cell} · <b>${B.at+1}명 활동</b></div></div>
   <div class="rt"><button class="btn" onclick="enterCell('${k}')">들어가기</button></div></div>`}).join('')}`:''}
 <div style="font-size:9.6px;font-weight:900;letter-spacing:.14em;color:var(--n600);margin:16px 0 8px">참여할 수 있는 셀</div>
 ${Object.keys(BRANDS).filter(k=>!joined(k)).map(k=>{const B=BRANDS[k];
   return `<div class="cellcard"><div class="bl" style="background:${B.color}"></div>
    <div><div class="nm">${B.nm}</div>
     <div class="ds">${B.cat} · 보상 <b>${B.reward}</b><br>${B.cell} · <b>${B.at}명 활동</b>${B.appr?' · 승인제':''}</div></div>
    <div class="rt"><button class="btn" onclick="startJoin('${k}')">${B.appr?'신청':'가입'}</button></div></div>`}).join('')}
 ${ST.me.joined.length? NOTE('두 번째 셀부터는 <b>계정을 다시 만들지 않습니다.</b> 브랜드 동의만 새로 받고 바로 들어갑니다 — 그게 커넥션 패스가 하는 일이에요.')
  : NOTE('셀에 <b>인원 상한은 없습니다.</b> 대신 아리가 발화 밀도를 지켜보고, 대화가 묻히면 <b>소그룹 스레드</b>를 열어줘요.')}`}),

/* ---------- 3. 브랜드 셀 가입 (3단계) ---------- */
join:()=>{
 const k=ST.me.joinBrand, B=BRANDS[k], st=ST.me.joinStep;
 const steps=[0, st>=0?1:0, st>=1?1:0, st>=2?1:0];
 if(st===0) return {hd:[B.nm+' 셀 가입','1 / 3 · 어떤 곳인지'], back:'hub', steps:[1,1,0,0], body:`
  <div class="cc" style="padding:0;overflow:hidden">
   <div style="height:74px;background:${B.color}"></div>
   <div style="padding:15px 17px">
    <div class="t" style="font-size:15px">${B.nm}</div>
    <p>${B.desc}</p>
    <div style="display:flex;gap:7px;margin-top:11px;flex-wrap:wrap">
     <span class="chip nt">${B.cat}</span><span class="chip ok">보상 ${B.reward}</span>
     <span class="chip nt">${B.at}명 활동</span></div></div></div>
  <div class="cc"><div class="t">셀에서 하는 일</div>
   <p>· 같은 캠페인 하는 <b>20~30명</b>과 이야기해요<br>
    · 담당자(아리)가 <b>매일 질문 하나</b>를 던집니다<br>
    · 촬영 팁을 나누고, 먼저 한 사람이 답해줍니다<br>
    · <b>순위표는 없습니다</b> — 비교하지 않아요</p></div>
  <div class="cc" style="background:var(--n50)"><div class="t">미리 알려드릴 것</div>
   <p>· 읽음 표시·타이핑 표시가 <b>없습니다.</b> 즉답 압박을 안 만들려고요<br>
    · 캠페인 참여는 <b>의무가 아닙니다.</b> 안 해도 셀에 남을 수 있어요<br>
    · 언제든 <b>나갈 수 있습니다</b></p></div>
  <button class="btn lg" style="width:100%" onclick="ST.me.joinStep=1;render()">다음</button>`};
 if(st===1) return {hd:[B.nm+' 셀 가입','2 / 3 · 이 브랜드에 대한 동의'], back:null, steps:[1,1,1,0], body:`
  <div class="cc" style="background:var(--s50);border-color:var(--s100)">
   <div class="t">커넥션 계정은 이미 있어요</div>
   <p>다시 가입하지 않습니다. <b>${B.nm}에 대한 동의만</b> 새로 받아요.
    브랜드마다 회원 정보를 <b>그 브랜드가 소유</b>하기 때문입니다.</p></div>
  ${[`${B.nm}의 회원이 되는 것 · 이름·연락처를 <b>${B.nm}이 소유</b>합니다`,
     `캠페인 안내 수신 · 배송·마감·정산 알림을 받습니다`]
   .map((t,i)=>`<div class="cs" onclick="tgB(${i})">
     <div class="bx ${ST.me.brandConsent[i]?'on':''}">${ST.me.brandConsent[i]?'✓':''}</div>
     <div class="tx">${t}<span class="rq">필수</span></div></div>`).join('')}
  <div class="cc" style="margin-top:14px;background:var(--n50)"><div class="t">이미 동의하신 것 (커넥션)</div>
   <p>· 패스 생성 · 본인 확인<br>· 국외 이전<br>
    · 다른 브랜드 셀 추천 받기 — <b>${ST.me.consents[3]?'켜짐':'꺼짐'}</b></p></div>
  <button class="btn lg" style="width:100%" onclick="joinNext()">동의하고 계속</button>
  <div class="fine">${B.nm}을 나가도 <b>커넥션 계정과 다른 셀은 그대로</b> 유지됩니다.</div>`};
 return {hd:[B.nm+' 셀 가입','3 / 3 · 자격 확인'], back:null, steps:[1,1,1,1], body:`
  <div class="cc"><div class="t">SNS 계정을 알려주세요</div>
   <p>콘텐츠를 보고 <b>어떤 캠페인이 맞을지</b> 판단하는 데 씁니다.
    <b>기준에 못 미쳐도 떨어뜨리지 않아요</b> — 맞는 캠페인을 찾아드릴 뿐입니다.</p>
   <div class="fld" style="margin-top:11px"><span class="pf">@</span>
    <input id="hd" placeholder="ploy.skincare" value="${ST.me.handle.replace('@','')}"></div>
   <button class="btn" style="width:100%" onclick="doQualify()">확인하기</button></div>
  ${ST.me.qual? `<div class="cc" style="background:var(--s50);border-color:var(--s100)">
    <div class="t">확인됐어요</div>
    <p>팔로워 <b>12.8K</b> · 인게이지 <b>5.1%</b> · 리뷰 콘텐츠 비중 높음<br>
     등급 <span class="gd A" style="vertical-align:middle">A</span> — <b>${B.nm} 캠페인에 잘 맞습니다.</b></p>
    <div style="margin-top:11px;padding-top:11px;border-top:1px dashed var(--s100)">
     <p>배정될 셀 — <b>${B.cell}</b> (${B.at}명 활동)</p></div>
    <button class="btn lg" style="width:100%;margin-top:12px" onclick="finishJoin()">셀 입장하기</button></div>`:''}`};
},

/* ---------- 4. 셀 (채팅) ---------- */
cell:()=>{
 const k=ST.me.cur, B=BRANDS[k];
 return {hd:[B.cell, `${B.at+1}명 · 오늘 47명이 봤어요 · 자동 번역`], cellUI:true, brand:k, body:''};
},

camp:()=>{
 const k=ST.me.cur, B=BRANDS[k];
 if(k!=='GLOWLAB') return {hd:['캠페인',B.nm], body:`<div class="cc"><div class="t">아직 열린 캠페인이 없어요</div>
  <p>${B.nm}은 셀을 먼저 채우는 중입니다. 캠페인이 열리면 <b>담당자가 먼저 알려드릴게요.</b></p></div>`};
 return {hd:['캠페인','GLOWLAB · 열린 캠페인 '+ST.camps.filter(c=>c.st==='open').length+'개'], body:`
  <div class="cc" style="background:var(--n50);padding:8px 12px;font-size:10.2px;color:var(--n600)">
   캠페인은 <b>내 언어(ไทย)로 자동 번역</b>돼 보입니다 — 원문은 카드의 칩으로.</div>
  ${ST.camps.map((c,ci)=>`<div class="cc" style="${ci===0?'background:var(--t50);border-color:var(--t100)':''}">
   <div style="display:flex;gap:10px">
    <div style="width:52px;height:52px;border-radius:10px;background:${c.img};flex-shrink:0"></div>
    <div style="flex:1;min-width:0">
     <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <div class="t" style="margin:0">${cT(c,'nm')}</div>${CBADGE(c)}
      <span class="trc" onclick="tgCamp('${c.id}')">${ST.campLang[c.id]?'ไทย로 보기':'KO 원문'}</span></div>
     <p style="margin-top:4px"><b>${cT(c,'prod')}</b> · 마감 ${c.due} · 정원 ${c.slots}명</p></div></div>
   <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px">
    ${cT(c,'usp').map(u=>`<span class="uspc">${u}</span>`).join('')}</div>
   <p style="font-size:10.2px;color:var(--n600);margin-top:7px">조건 — ${cT(c,'req')}</p>
   ${ci===0? (ST.applied
     ? `<div style="margin-top:9px">${ST.picked?'<span class="chip ok">선정됨 · 배송 준비</span>':'<span class="chip wt">지원 완료 · 선정 대기</span>'}</div>`
     : `<div style="display:flex;gap:6px;margin-top:10px">
        <button class="btn" style="flex:2" onclick="doApply()">지원할게요</button>
        <button class="btn line" style="flex:1" onclick="toast('괜찮습니다','안 하셔도 <b>등급에 영향 없습니다.</b>')">안 함</button></div>`)
    : `<button class="btn soft" style="margin-top:9px" onclick="toast('지원 접수','새 캠페인 지원이 접수됐습니다. 판정 후 담당자가 연락드려요.')">지원할게요</button>`}
  </div>`).join('')}
  ${ST.applied?`<div class="cc" style="background:var(--n50);display:flex;align-items:center;gap:8px">
   <p style="flex:1;margin:0">선정 관련 대화는 <b>이 셀의 담당자</b>와 이어집니다.
    ${ST.dm.length>1?`새 메시지 <b>${ST.dm.length-1}건</b>`:''}</p>
   <button class="btn soft" style="flex-shrink:0" onclick="ST.c='agent';render()">담당자 탭 →</button></div>`:''}
  ${ST.applied&&ST.shipped?`<div class="cc"><div class="t">제품이 발송됐어요</div>
    <p>도착하면 <b>9월 2일</b>까지 올려주시면 됩니다.</p>
    <button class="btn" style="margin-top:9px" onclick="ST.c='submit';render()">제출하러 가기</button></div>`:''}`};
},

submit:()=>({hd:['콘텐츠 제출','8월 선쿠션 · 마감 9/15'], body:
 !ST.shipped? `<div class="cc"><div class="t">아직 제품이 안 나갔어요</div>
   <p>브랜드가 배송을 준비 중입니다. <b>도착하면 알려드릴게요.</b></p></div>`
 : ST.submitted? `<div class="cc" style="background:var(--s50);border-color:var(--s100)"><div class="t">제출 완료</div>
   <p>${ST.passed?'<b>검수를 통과했습니다.</b> 정산에 반영됐어요.':'검수 중입니다. 보통 하루 안에 끝나요.'}</p></div>
   `
 : `<div class="cc" style="text-align:center;padding:22px 15px;border-style:dashed">
   <div style="font-size:22px;margin-bottom:6px">↑</div><div class="t">영상을 올리거나</div>
   <p>이미 올린 링크를 붙여넣어도 돼요</p>
   <div class="mono" style="background:var(--n50);border:1px solid var(--n200);border-radius:9px;padding:9px 11px;
    margin-top:10px;font-size:10.4px;color:var(--n500);text-align:left">tiktok.com/@ploy.skincare/video/74…</div></div>
  <div class="cc"><div class="t">올리기 전에 확인했어요</div>
   <div style="display:flex;flex-direction:column;gap:7px;margin-top:8px">
    <div style="display:flex;gap:8px;align-items:center"><span class="chip ok">확인</span>
     <span style="font-size:11.4px;color:var(--n600)">길이 18초 — 조건 충족</span></div>
    <div style="display:flex;gap:8px;align-items:center"><span class="chip ok">확인</span>
     <span style="font-size:11.4px;color:var(--n600)">제품 노출 5.2초</span></div>
    <div style="display:flex;gap:8px;align-items:center"><span class="chip ${ST.tagFixed?'ok':'bd'}">${ST.tagFixed?'확인':'누락'}</span>
     <span style="font-size:11.4px;color:${ST.tagFixed?'var(--n600)':'var(--c500)'}">
      ${ST.tagFixed?'#ad 표기 추가됨':'<b>#ad 표기가 없어요</b> — 추가하면 바로 통과예요'}</span></div></div></div>
  ${ST.tagFixed? `<button class="btn lg" style="width:100%" onclick="doSubmit()">제출하기</button>`
   : `<button class="btn soft lg" style="width:100%" onclick="ST.tagFixed=true;render()">#ad 태그 추가하기</button>`}`}),

agent:()=>({hd:['담당자 · 아리', (BRANDS[ST.me.cur]||{}).nm+' 셀 · 자동 번역 ไทย↔KO'], body:`
 <div class="cellsw" style="margin:-4px -2px 8px">${ST.me.joined.map(x=>`<span class="${x===ST.me.cur?'on':''}"
   onclick="ST.me.cur='${x}';render()">${BRANDS[x].nm} 담당</span>`).join('')}</div>
 <div class="cc" style="background:var(--n50);padding:8px 12px;font-size:10.2px;color:var(--n600)">
  이 대화는 <b>${(BRANDS[ST.me.cur]||{}).nm} 셀 전용</b>이에요. 셀을 바꾸면 <b>그 셀의 담당자</b>와 이어집니다 — 대화는 셀끼리 섞이지 않아요.</div>
 <div class="cb">${ST.me.name} 님, ${ST.shipped?'오늘 제품이 <b>발송</b>됐어요.':'셀에 오신 걸 환영해요.'}
  ${ST.me.cur==='GLOWLAB'?'마감은 <b>9월 2일</b>이에요 — 아침 루틴 찍는 김에 같이 담으면 편할 거예요.':'천천히 둘러보세요.'}</div>
 <div class="cb me">받았어요 근데 이번주 일이 많아서 늦을 수도 있어요</div>
 <div class="cb">그럼 <b>9월 5일로 미뤄 둘게요.</b> 따로 하실 건 없어요.
  그때도 어려우면 말씀만 주세요 — <b>못 지켰다고 불이익 가는 구조가 아니에요.</b></div>
 ${ST.applied&&ST.me.cur==='GLOWLAB'?`
 <div class="sy" style="text-align:center;font-size:10px;color:var(--n400);margin:10px 0">— 캠페인 선정 대화 · 브랜드 담당자 참여 —</div>
 ${dmThread('creator')}
 ${ST.picked?'<div style="text-align:center;margin:6px 0"><span class="chip ok">선정됨 · 배송 준비</span></div>':''}`:''}
 ${ST.me.joined.length>1&&ST.me.cur!=='GLOWLAB'?`<div class="cb">여기는 <b>${(BRANDS[ST.me.cur]||{}).nm}</b> 담당입니다.
  GLOWLAB 이야기는 그쪽 셀 담당자 탭에서 이어져요 — <b>셀끼리는 서로 안 보입니다.</b></div>`:''}`,
 input:1}),

earn:()=>({hd:['내 정산','다음 지급 9월 5일 · PingPong'], body:`
 <div class="cc" style="background:var(--t50);border-color:var(--t100)">
  <p style="font-size:9.6px;font-weight:900;letter-spacing:.1em;color:var(--t700)">${ST.paid?'지급 완료':'지급 예정'}</p>
  <div class="num" style="font-size:26px;font-weight:800;margin-top:3px">
   ₩${((ST.passed?45000:0)+18000).toLocaleString()}</div>
  <p style="margin-top:5px">${ST.paid?'9월 5일 · 송금 완료':'9월 5일 예정 · <b>보류 없음</b>'}</p></div>
 <div style="display:flex;gap:7px;margin-bottom:9px">
  <div class="cc" style="flex:1;margin:0"><p style="font-size:9.6px;font-weight:900;color:var(--n600)">캠페인 보상</p>
   <div class="num" style="font-size:16px;font-weight:800;margin-top:2px">₩${(ST.passed?45000:0).toLocaleString()}</div>
   <p style="font-size:10px">${ST.passed?'선쿠션 · 검수 통과':'검수 전'}</p></div>
  <div class="cc" style="flex:1;margin:0"><p style="font-size:9.6px;font-weight:900;color:var(--n600)">지난 캠페인</p>
   <div class="num" style="font-size:16px;font-weight:800;margin-top:2px">₩18,000</div>
   <p style="font-size:10px">앰플 영상 · 7월 완료</p></div></div>
 <div class="cc"><div class="t">셀별 정산</div>
  ${ST.me.joined.map(k=>`<div style="display:flex;gap:9px;align-items:center;padding:7px 0;
    border-bottom:1px solid var(--n100)">
    <div style="width:26px;height:26px;border-radius:7px;background:${BRANDS[k].color};flex-shrink:0"></div>
    <div style="flex:1;font-size:11.8px;font-weight:700">${BRANDS[k].nm}</div>
    <div class="num" style="font-size:12.4px;font-weight:800">₩${k==='GLOWLAB'?((ST.passed?45000:0)+18000).toLocaleString():'0'}</div>
   </div>`).join('')}
  <p style="margin-top:9px">셀마다 <b>따로 정산</b>됩니다. 합산은 여기서만 보여요.</p></div>
 <div class="cc" style="background:var(--n50)"><p style="font-size:10.6px">
  정산 내역이 이상하면 <b>아리에게 바로 물어보세요.</b> 근거는 전부 원장에 있습니다.</p></div>`}),

pass:()=>({hd:['내 패스','커넥션 계정 · 소속 셀 '+ST.me.joined.length+'개'], body:`
 <div class="cc" style="background:var(--n900);border:none;color:#fff">
  <div style="display:flex;gap:12px;align-items:center">
   <div class="av" style="width:42px;height:42px"></div>
   <div><div style="font-size:15px;font-weight:800">${ST.me.name}</div>
    <div style="font-size:10.8px;color:#B8B1A8;margin-top:2px">${ST.me.handle||'@ploy.skincare'} · 태국
     <span style="background:rgba(255,255,255,.14);font-size:8.6px;font-weight:800;padding:1px 7px;border-radius:5px;margin-left:5px">${ST.me.sns==='instagram'?'IG':'TikTok'} 검증됨</span></div></div></div>
  <div style="display:flex;gap:18px;margin-top:15px">
   <div><div class="num" style="font-size:17px;font-weight:800">${ST.me.joined.length}</div>
    <div style="font-size:9.4px;color:#B8B1A8">소속 셀</div></div>
   <div><div class="num" style="font-size:17px;font-weight:800">${ST.passed?3:2}</div>
    <div style="font-size:9.4px;color:#B8B1A8">완료 캠페인</div></div>
   <div><div class="num" style="font-size:17px;font-weight:800">98%</div>
    <div style="font-size:9.4px;color:#B8B1A8">완주율</div></div>
   <div><div class="num" style="font-size:17px;font-weight:800">${ST.me.grade}</div>
    <div style="font-size:9.4px;color:#B8B1A8">등급</div></div></div>
  <p style="font-size:10.6px;color:#B8B1A8;margin-top:13px;line-height:1.6">
   이 기록은 <b style="color:#fff">${ST.me.name} 님 것</b>이에요. 브랜드가 바뀌어도 따라갑니다.</p></div>
 <div style="font-size:9.6px;font-weight:900;letter-spacing:.14em;color:var(--n600);margin:16px 0 8px">소속 셀</div>
 ${ST.me.joined.map(k=>`<div class="cellcard">
   <div class="bl" style="background:${BRANDS[k].color}"></div>
   <div><div class="nm">${BRANDS[k].nm}</div><div class="ds">${BRANDS[k].cell}</div></div>
   <div class="rt"><button class="btn soft" onclick="enterCell('${k}')">열기</button></div></div>`).join('')}
 <p style="font-size:9.8px;color:var(--n400);margin-top:8px;text-align:center">
  다른 브랜드 셀은 <b>초대 링크</b>로만 들어갈 수 있어요.
  <span style="text-decoration:underline;cursor:pointer"
   onclick="toast('초대 링크 입장','받은 링크를 열면 이 계정 그대로 입장합니다 — 재가입은 없어요. ${ST.me.consents[3]?'추천 동의를 켜두셔서, 맞는 셀이 생기면 <b>담당자 대화로만</b> 조용히 알려드립니다(월 1회 이하 · 같은 카테고리 제외).':'셀 추천은 꺼져 있어요 — 아래 동의를 켜면 담당자 대화로만 옵니다.'}')">초대 링크가 있어요</span></p>
 <div style="font-size:9.6px;font-weight:900;letter-spacing:.14em;color:var(--n600);margin:16px 0 8px">내 정보 관리</div>
 <div class="cc" style="padding:6px 14px">
 ${[['addr','배송 주소',ST.profile.addr,'수정하면 진행 중 캠페인 배송에 바로 반영'],
    ['phone','연락처',ST.profile.phone,'담당자 연락용 · 셀에는 안 보임'],
    ['skin','피부 타입',ST.profile.skin,'캠페인 매칭 판정에 쓰여요'],
    ['bank','정산 계좌',ST.profile.bank,'마스킹 보관 · 정산에만 사용']]
  .map(r=>`<div class="pfrow">
   <div class="pfl">${r[1]}</div>
   ${ST.editKey===r[0]
    ?`<input id="pf_${r[0]}" class="pfin" value="${r[2]}" onkeydown="saveP('${r[0]}',event)" autofocus>
      <span class="cbt" onclick="saveP('${r[0]}')">저장</span>`
    :`<div class="pfv">${r[2]}${r[0]==='addr'?`<span class="pfat">갱신 ${ST.profile.addrAt}</span>`:''}</div>
      <span class="cbt no" onclick="editP('${r[0]}')">수정</span>`}
  </div><div class="pfhint">${r[3]}</div>`).join('')}
 <p style="font-size:10.2px;color:var(--n600);margin:8px 0 6px">수정하면 <b>브랜드 콘솔 DB에 즉시 반영</b>되고, 이력이 원장에 남습니다. 내 정보의 주인은 나예요.</p></div>
 <div class="cc" style="margin-top:12px;background:var(--n50)"><div class="t">동의 설정</div>
  <div class="cs" onclick="tg(3)"><div class="bx ${ST.me.consents[3]?'on':''}">${ST.me.consents[3]?'✓':''}</div>
   <div class="tx">다른 브랜드 셀 추천 받기<span class="op">선택</span></div></div>
  <p style="font-size:10.6px">켜면 맞는 셀이 생겼을 때 <b>담당자 대화로만, 월 1회 이하</b> 알려드려요.
   지금 있는 셀과 <b>같은 카테고리 브랜드는 추천하지 않습니다.</b> 꺼두면 아예 오지 않아요.</p></div>`}),
};


/* ---------- 캠페인 등록 · 지원자 · 1:1 ---------- */
function ncType(t){ ST.nc.type=t; render(); }
function pubCamp(){
 const nm=(document.getElementById('ncn')||{}).value||'9월 진정 앰플 · 태국';
 const prod=(document.getElementById('ncp')||{}).value||'시카 진정 앰플';
 const t=ST.nc.type;
 const camp={id:'c'+ST.camps.length, nm, prod, type:t,
  pay:t==='paid'?'₩38,000':t==='gift'?'제품 제공':'', aff:t==='aff'?'판매액의 12%':'',
  img:'linear-gradient(140deg,#D8E6DC,#7FA98C)',
  usp:['48시간 진정 테스트 완료','무향 · 민감성 전용','가벼운 젤 텍스처'],
  req:'15초 이상 · 제품 3초 노출 · #ad 표기', due:'10/5', slots:30, st:'open',
  th:{nm:'เซรั่มซิก้า ก.ย. · ไทย', prod:'เซรั่มซิก้าปลอบผิว',
   usp:['ผ่านเทสต์ปลอบผิว 48 ชม.','ไร้น้ำหอม · สำหรับผิวแพ้ง่าย','เนื้อเจลบางเบา'],
   req:'ยาว 15 วิ ขึ้นไป · โชว์สินค้า 3 วิ · ติด #ad'}};
 ST.ledger.push(['방금','CAMPAIGN_TRANSLATED',nm+' · th/en/vi 3개 언어 생성','—','b1c7…8e22']);
 ST.camps.push(camp);
 ST.cellMsgs.GLOWLAB.push({who:'sys',tx:`새 캠페인 공지 — <b>${nm}</b>이 열렸어요. 캠페인 탭에서 조건을 확인하세요.`});
 ST.ledger.push(['방금','CAMPAIGN_PUBLISHED',nm+' · '+(t==='paid'?'유가':t==='gift'?'무가':'어필리에이트'),'—','e2b8…4a01']);
 ST.campTab='stat';
 toast('연결됨 · 2곳','캠페인이 게시됐습니다. <b>크리에이터 앱 캠페인 목록</b>과 <b>셀 공지 채널</b>에 동시에 떴어요.','creator','camp');
 render();
}
function dmSendB(e){ if(e.key!=='Enter') return; const v=e.target.value.trim(); if(!v) return; e.target.value='';
 ST.dm.push({who:'brand',tm:'지금',lang:'ko',orig:v,tx:v}); render();
 toast('연결됨 · 크리에이터 앱','보냈습니다. Ploy 님에게는 <b>태국어로 자동 번역</b>돼 도착합니다 — 원문은 칩으로 열려요.','creator','camp'); }
function dmSendC(e){ if(e.key!=='Enter') return; const v=e.target.value.trim(); if(!v) return; e.target.value='';
 ST.dm.push({who:'me',tm:'지금',lang:'th',orig:'(ไทย) '+v,tx:v}); render();
 toast('전송됨','담당자 화면에는 <b>한국어로 번역</b>돼 보입니다.'); }
function tgDm(i){ ST.dm[i]._o=!ST.dm[i]._o; render(); }
function dmThread(view){ /* view: 'brand'|'creator' */
 return ST.dm.map((m,i)=>{
  const mine=(view==='brand'&&m.who==='brand')||(view==='creator'&&m.who==='me');
  return `<div class="dmm ${mine?'me':''}"><div class="bub">
   <div class="tx">${m._o?m.orig:m.tx}</div>
   <div class="mt2">${m.who==='brand'?'담당자 · GLOWLAB':'Ploy S.'} · ${m.tm||''}
    <span class="trc" onclick="tgDm(${i})">${m._o?'번역 보기':(m.who==='brand'?'KO':'TH')+' 원문'}</span></div>
  </div></div>`}).join('');
}
function pickCreator(){ ST.picked=true;
 ST.ledger.push(['방금','CAMPAIGN_SELECTED','Ploy S. · 8월 선쿠션','—','a90c…2e17']);
 toast('연결됨 · 크리에이터 앱','선정했습니다. Ploy 님 캠페인 화면이 <b>\'선정됨\'</b>으로 바뀌고 배송 준비로 넘어갑니다.','creator','camp');
 render(); }
/* ---------- 크리에이터 프로필 수정 ---------- */
function editP(k){ ST.editKey=ST.editKey===k?null:k; render(); }
function saveP(k,e){ if(e&&e.key!=='Enter') return;
 const el=document.getElementById('pf_'+k); if(!el||!el.value.trim()) return;
 ST.profile[k]=el.value.trim(); if(k==='addr'){ ST.profile.addrAt='방금'; }
 ST.editKey=null;
 ST.ledger.push(['방금','PROFILE_UPDATED','Ploy S. · '+({addr:'배송 주소',phone:'연락처',skin:'피부 타입',bank:'정산 계좌'}[k])+' · 본인 수정','—','7d3e…9b40']);
 toast('연결됨 · 브랜드 콘솔 DB','저장했습니다. <b>브랜드 쪽 레코드에도 즉시 반영</b>되고, 수정 이력이 원장에 남습니다.','brand','roster');
 render(); }
function cT(c,f){ /* 크리에이터 화면: 기본 = 시청자 언어(태국어), 토글로 원문 */
 const th=ST.campLang[c.id]; // true = 원문(KO) 보기
 if(th||!c.th) return f==='usp'?c.usp:c[f];
 return f==='usp'?c.th.usp:(c.th[f]||c[f]); }
function tgCamp(id){ ST.campLang[id]=!ST.campLang[id]; render(); }
const CBADGE=c=> c.type==='paid'?`<span class="chip ok">유가 · ${c.pay}</span>`
 : c.type==='gift'?`<span class="chip nt">무가 · 제품 제공</span>`
 : `<span class="chip vi">어필리에이트 · ${c.aff}</span>`;

/* ---------- 크리에이터 액션 ---------- */
function tg(i){ ST.me.consents[i]=!ST.me.consents[i]; render(); }
function tgB(i){ ST.me.brandConsent[i]=!ST.me.brandConsent[i]; render(); }
function mkPass(p){
 if(!ST.me.consents.slice(0,3).every(Boolean)){
  toast('계정을 만들 수 없습니다','필수 3개가 모두 있어야 합니다. <b>국외 이전 동의 없이는 진행되지 않습니다.</b>'); return; }
 ST.me.pass=true; ST.me.sns=p||'tiktok'; ST.me.handle=p==='instagram'?'@ploy.skincare':'@ploy.skin.th'; ST.c='hub';
 ST.ledger.push(['방금','PASS_CREATED','Ploy S. · '+(p==='instagram'?'IG':'TikTok')+' OAuth 검증 · policy 2026-08-v1 · '+(ST.me.consents[3]?'cross=Y':'cross=N'),'—','b3f1…22aa']);
 ST.ledger.push(['방금','SNS_VERIFIED',(p==='instagram'?'Instagram':'TikTok')+' '+(p==='instagram'?'@ploy.skincare':'@ploy.skin.th')+' · 공개 필드 6개 수신','—','d2c8…91e4']);
 toast('계정이 만들어졌습니다',(p==='instagram'?'<b>Instagram</b>':'<b>TikTok</b>')+' 계정이 검증됐습니다. 팔로워·게시 빈도 같은 <b>공개 필드가 DB의 시작점</b>이 돼요. 이제 브랜드 셀을 고르면 됩니다.');
 render();
}
function startJoin(k){ ST.me.joinBrand=k; ST.me.joinStep=0; ST.me.brandConsent=[true,true]; ST.me.qual=false; ST.c='join'; render(); }
function joinNext(){
 if(!ST.me.brandConsent.every(Boolean)){
  toast('가입할 수 없습니다','이 브랜드의 <b>필수 동의 2개</b>가 모두 있어야 합니다.'); return; }
 ST.me.joinStep=2; render();
}
function doQualify(){
 const el=document.getElementById('hd'); const v=(el&&el.value.trim())||'ploy.skincare';
 ST.me.handle='@'+v; ST.me.qual=true;
 toast('자격 확인 완료','A등급입니다. <b>기준에 못 미쳐도 떨어뜨리지 않습니다</b> — 맞는 캠페인을 찾아드릴 뿐이에요.');
 render();
}
function finishJoin(){
 const k=ST.me.joinBrand;
 ST.me.joined.push(k); ST.me.cur=k; ST.c='cell'; ST.curCh='잡담';
 if(k==='GLOWLAB'){ ST.roster++; }
 ST.ledger.push(['방금','MEMBERSHIP_CREATED',`${BRANDS[k].nm} · ${ST.me.name} · 셀 ${BRANDS[k].cell}`,'—','7f3a…c091']);
 ST.ledger.push(['방금','BILLING_EVENT',`${BRANDS[k].nm} · 검증 가입 1건 · billable=true`,'₩10,000','9b21…4de7']);
 if(ST.me.joined.length===1)
  toast('연결됨 · 브랜드 콘솔',`${BRANDS[k].nm} 명부에 <b>1명이 추가</b>됐고 <b>검증 가입 ₩10,000</b>이 원장에 찍혔습니다.`,'brand','roster');
 else
  toast('연결됨 · 두 번째 셀','계정을 <b>다시 만들지 않고</b> 들어갔습니다. 커넥션은 여기서 <b>₩10,000을 한 번 더</b> 받습니다 — 획득 비용은 0입니다.','brand','settle');
 render();
}
function tgOrig(k,i){ const m=ST.cellMsgs[k][i]; m._o=!m._o; render(); }
function trc(k,m,i){ if(!m.orig) return '';
 return `<span class="trc" onclick="tgOrig('${k}',${i})">${m._o?'번역 보기':(m.lang||'th').toUpperCase()+' 원문'}</span>`; }
function mtx(m){ return m._o&&m.orig? m.orig : m.tx; }
function doInstall(){ ST.pwa=true;
 toast('앱으로 설치됨','홈 화면에 아이콘이 생겼습니다. <b>같은 URL, 같은 로그인</b> — 오프라인 캐시와 셀 알림 푸시가 붙습니다.'); render(); }
function enterCell(k){ ST.me.cur=k; ST.c='cell'; ST.curCh='잡담'; render(); }
function doApply(){ ST.applied=true; ST.recruited++;
 setTimeout(()=>{},0);
 toast('연결됨 · 브랜드 콘솔','지원이 접수됐습니다. 캠페인 모집이 <b>'+ST.recruited+'명</b>으로 올라갔어요.','brand','camp'); render(); }
function doSubmit(){ ST.submitted=true; ST.submittedN++;
 toast('연결됨 · 브랜드 콘솔','제출됐습니다. 브랜드 <b>검수 큐</b>에 올라갔어요.','brand','review'); render(); }
function sendCell(e){ /* viewer lang: th */
 if(e.key!=='Enter') return; const v=e.target.value.trim(); if(!v) return; e.target.value='';
 const k=ST.me.cur;
 ST.cellMsgs[k].push({who:ST.me.name+'(나)',tm:'지금',tx:v,me:1}); render();
 setTimeout(()=>{ ST.cellMsgs[k].push({who:k==='GLOWLAB'?'Nan T.':'Gift W.',tm:'지금',
   tx:k==='GLOWLAB'?'오 그거 좋네요! 저도 해볼게요':'저도 그 고민이었어요 감사해요',g:2}); render(); },1100);
}

/* ============================================================ 브랜드 콘솔 */
function seedChat(){ ST.chat=[{k:'m',x:'좋은 아침입니다. 밤새 <b>41건</b> 처리했고 가입이 14명 늘었어요.'},
 {k:'m',x:'전체는 나쁘지 않은데 <em>태국이 문제</em>입니다.'},{k:'lnk',x:'캔버스 · 승인함',go:'gates'}]; }
function node(it){ if(it.k==='m')return `<div class="m"><div class="b">${it.x}</div></div>`;
 if(it.k==='me')return `<div class="m me"><div class="b">${it.x}</div></div>`;
 if(it.k==='tool')return `<div class="tool"><div class="t">${it.t}</div><div class="r">${it.r}</div></div>`;
 if(it.k==='lnk')return `<button class="lnk" onclick="ST.b='${it.go}';render()"><i>↗</i>${it.x}</button>`; return ''; }
function say(t){ if(!t||ST.busy) return; ST.busy=true; ST.chat.push({k:'me',x:t}); render();
 const key=Object.keys(RP).find(k=>t.includes(k));
 const out=key?RP[key]():[{k:'m',x:'그건 제가 아직 못 하는 일이에요. <b>모르는 걸 아는 척하지 않는 게</b> 제 역할이라서요.'}];
 seq(out,0); }
function seq(it,i){ const f=document.getElementById('feed');
 if(f){ f.insertAdjacentHTML('beforeend','<div class="typing"><i></i><i></i><i></i></div>'); f.scrollTop=f.scrollHeight; }
 setTimeout(()=>{ ST.chat.push(it[i]); render(); if(i+1<it.length) seq(it,i+1); else ST.busy=false; },560); }
const RP={
 '승인':()=>[{k:'tool',t:'TOOL · gate.list',r:`pending: <b>${gateCount()}</b>`},
   {k:'m',x:`${gateCount()}건 걸려 있습니다. 전부 <b>제가 자동으로 못 하는 항목</b>이에요.`},{k:'lnk',x:'캔버스 · 승인함',go:'gates'}],
 '셀':()=>[{k:'tool',t:'TOOL · cells.health',r:`cells: 3<br>TH-1: <b>${BRANDS.GLOWLAB.at+(joined('GLOWLAB')?1:0)}명</b> · talk 47/day<br>TH-3: silent 4d ⚠`},
   {k:'m',x:'1번방은 잘 돌고 있고 <b>3번방이 4일째 조용</b>합니다. 재편성은 관계가 끊기니 제 재량으로 안 했어요.'},
   {k:'lnk',x:'캔버스 · 셀 운영',go:'cells'}],
 '모집':()=>[{k:'tool',t:'TOOL · sourcing.shift',r:`agents: <b>${Object.values(ST.ch).filter(c=>c.on).length} / 8</b> on duty<br>hand_hours_saved: <b>${handTotal()}</b>/wk<br>queue: <b>${ST.queue.cand}</b><br>pending: tiktok_invite, outbound_email`},
   {k:'m',x:`담당 <b>${Object.values(ST.ch).filter(c=>c.on).length}명</b>이 근무 중이고 이번 주 <b>${handTotal()}시간</b>어치 손을 대신했습니다. 후보 큐 <b>${ST.queue.cand}명</b>.`},
   {k:'m',x:`오늘 급한 건 <b>틱톡샵 초대권</b>이에요. ${ST.tk.cap-ST.tk.used}장 남았는데 <b>09:00에 리셋되고 이월이 안 됩니다</b> — 안 쓰면 그냥 사라져요. 배분안은 짜뒀습니다.`},
   {k:'lnk',x:'캔버스 · 발굴 · 수집',go:'src'}],
 '명부':()=>[{k:'tool',t:'TOOL · db.status',r:`rows: <b>${ST.roster}</b> · all OAuth-verified<br>dup: 0 · reverify_due: 4<br>purge_scheduled: 42 fields`},
   {k:'m',x:`<b>${ST.roster}명</b> 전원이 틱톡·인스타 <b>OAuth 검증</b>으로 들어왔습니다. 수기 행이 없어서 중복이 0이에요. 재검증 대기 4명은 오늘 밤 돌립니다.`},
   {k:'lnk',x:'캔버스 · 크리에이터 DB',go:'roster'}],
 '정산':()=>[{k:'m',x:'이번 달 <b>검증 가입 285건</b>이 과금됐고, 구독은 Growth 플랜입니다.'},{k:'lnk',x:'캔버스 · 정산',go:'settle'}],
};
const RAIL=[['brief','◧'],['gates','✓'],['src','⌖'],['cells','◎'],['roster','◍'],['camp','▤'],['review','◑'],['settle','₩']];
const GATES={
 pii:{cls:'pii',l:'GATE · PII · 개인정보 제공',t:'배송 주소 전달 — 태국 42명 · 물류사',
  m:`records&nbsp;&nbsp;: <b>42 / 42</b><br>format&nbsp;&nbsp;&nbsp;: one-time CSV · 24h<br>autopath&nbsp;: <u>none — 항상 사람</u>`,
  w:'전원 수집이 끝났습니다. 승인하시면 CSV를 만들고 <b>배송 알림까지</b> 돌리겠습니다.',ok:'승인 · CSV 생성',no:'보류',
  d:'CSV를 생성했고 <b>42명 배송이 나갔습니다.</b>',r:'보류했습니다. 배송은 대기 상태입니다.'},
 payout:{cls:'pay',l:'GATE · PAYOUT · 정산',t:'8월 1차 정산 — 27명 · ₩1,840,000',
  m:`passed&nbsp;&nbsp;&nbsp;: 27 · held 2<br>channel&nbsp;&nbsp;: pingpong<br>autopath&nbsp;: <u>none — 돈은 항상 승인</u>`,
  w:'<b>돈이 나가는 건 자율 등급과 무관하게 항상 승인</b>입니다.',ok:'승인 · 송금 요청서',no:'거절',
  d:'PingPong 송금 요청서를 만들었습니다.',r:'정산을 진행하지 않습니다.'},
};
function gc(k){ const g=GATES[k], s=ST.gates[k];
 if(s==='ok') return `<div class="gt done"><div class="gl" style="color:var(--s700)">승인됨</div><h3>${g.t}</h3><div class="res">${g.d}</div></div>`;
 if(s==='no') return `<div class="gt held"><div class="gl" style="color:var(--n500)">보류됨</div><h3>${g.t}</h3><div class="res">${g.r}</div></div>`;
 return `<div class="gt ${g.cls}"><div class="gl">${g.l}</div><h3>${g.t}</h3><div class="gm">${g.m}</div>
  <div class="why">${g.w}</div><div style="display:flex;gap:7px">
  <button class="btn" onclick="dg('${k}','ok')">${g.ok}</button>
  <button class="btn line" onclick="dg('${k}','no')">${g.no}</button></div></div>`; }
function dg(k,v){ ST.gates[k]=v;
 if(k==='pii'&&v==='ok'){ ST.shipped=true; ST.shippedN=42;
  ST.ledger.push(['06:12','PII_APPROVED','배송 주소 42명 · one-time · 물류사','—','5d90…1f33']);
  toast('연결됨 · 크리에이터 앱','<b>배송이 시작됐습니다.</b> Ploy 님 캠페인 화면에 "제출하러 가기"가 생깁니다.','creator','camp'); }
 if(k==='payout'&&v==='ok'){ ST.paid=true;
  ST.ledger.push(['06:20','PAYOUT_APPROVED','27명 · ₩1,840,000','₩1,840,000','c091…5d33']);
  toast('연결됨 · 크리에이터 앱','정산이 실행됐습니다. 정산 탭이 <b>"지급 완료"</b>로 바뀝니다.','creator','earn'); }

 if(v==='no') toast('보류됨','실행하지 않았습니다. <b>크리에이터에게는 아무 안내도 나가지 않습니다.</b>');
 render(); }
function doPass2(){ ST.passed=true; ST.passedN++;
 ST.ledger.push(['방금','REVIEW_PASSED','Ploy S. · 선쿠션 아침루틴','—','3c88…a012']);
 toast('연결됨 · 크리에이터 앱','통과시켰습니다. <b>정산 대기 목록</b>에 올라갔어요.','creator','earn'); render(); }

const CV={
brief:()=>({t:'브리핑',s:`8월 22일 · 결정 ${gateCount()}건 대기`,
 r:(gateCount()?`<span class="chip wt">결정 ${gateCount()}건</span>`:`<span class="chip ok">결정 완료</span>`)+SEG(['오늘','어제']),
 b:`<div class="mrow m4">
  ${mc('검증 가입',ST.roster,'+'+(14+(joined('GLOWLAB')?1:0)),'up',spark([231,238,244,251,258,264,271,ST.roster],'#5E8C6A'),
    joined('GLOWLAB')?'방금 <b>1명 추가</b> — 셀 가입':'이 속도면 이번 달 <b>410명</b>')}
  ${mc('셀 인원','131','+9','up',null,'상한 없음 · <b>발화 밀도</b>만 봅니다')}
  ${mc('CAC','₩3,180','+18%','dn',spark([2410,2380,2520,2610,2740,2900,3020,3180],'#8E3B2A'),'소재 <b>2종</b>이 끌어올리는 중')}
  ${mc('이번 달 매출','₩'+(3640000+(joined('GLOWLAB')?10000:0)).toLocaleString(),'+12%','up',
    spark([2600,2780,2950,3080,3200,3390,3520,3640],'#5E8C6A'),'구독 ₩790,000 + <b>검증 가입</b>')}
 </div>
 ${gateCount()?`<div class="sect"><h2>지금 눌러야 할 것</h2><span class="more" onclick="ST.b='gates';render()">승인함 →</span></div>
  <table><tr><th style="width:110px">게이트</th><th>내용</th><th style="width:100px"></th></tr>
  ${ST.gates.pii===null?`<tr><td><span class="chip bd">PII</span></td><td><b>배송 주소 전달</b> — 태국 42명 · 물류사</td>
    <td><button class="btn" onclick="ST.b='gates';render()">보기</button></td></tr>`:''}
  ${ST.gates.payout===null?`<tr><td><span class="chip vi">PAYOUT</span></td><td><b>8월 1차 정산</b> — ₩1,840,000</td>
    <td><button class="btn" onclick="ST.b='gates';render()">보기</button></td></tr>`:''}
  </table>`
  :`<div class="empty"><div class="a av"></div><p><b>오늘 결정하실 게 없습니다.</b>
   게이트에 걸린 건 다 정리됐어요.</p></div>`}
 ${NOTE(joined('GLOWLAB')
  ? '방금 <b>새 멤버가 셀에 들어왔습니다.</b> 첫 인사와 프로필 3문항은 제가 이미 보냈어요.'
  : '오늘 하려는 것 — 10:00 무응답 6명 청취 · 13:00 인바운드 판정 · 16:00 주간 리포트.')}`}),

gates:()=>({t:'승인함',s:gateCount()?`${gateCount()}건 대기 · 누르기 전엔 아무 일도 일어나지 않습니다`:'오늘 결정할 것이 없습니다',
 r:gateCount()?`<span class="chip wt">대기 ${gateCount()}</span>`:`<span class="chip ok">모두 처리</span>`,
 b:gc('pii')+gc('payout')+
  NOTE('여기 있는 건 전부 <b>자율 등급과 무관하게 사람이 눌러야 하는 항목</b>입니다.')}),

src:()=>({t:'발굴 · 수집', s:`에이전트 ${Object.values(ST.ch).filter(c=>c.on).length}명 근무 중 · 사람 손 ${handTotal()}시간/주 대체 · 후보 큐 ${Q().cand}명`,
 r:`<div class="tabs2">${[['agents','에이전트'],['tkshop','틱톡샵'],['comm','커뮤니티'],['mail','메일링'],['judge','판정 엔진'],['learn','학습'],['tech','기술 스택']]
   .map(t=>`<span class="${ST.srcTab===t[0]?'on':''}" onclick="ST.srcTab='${t[0]}';render()">${t[1]}</span>`).join('')}</div>`,
 raw:2, b:''}),

cells:()=>({t:'커뮤니티 셀', s:'브랜드도 같은 방에 들어옵니다 · 캠페인과 무관한 자유 시딩 · 상한 없음 · 자동 번역', r:'<span class="chip wt">침묵 1</span>', raw:true, b:''}),

roster:()=>({t:'크리에이터 DB',
 s:`${ST.roster}명 · 전원 <b>SNS 계정 검증</b> 가입 · 필드마다 보유 근거 기록`,
 r:`<span class="chip ok">중복 0</span><span class="chip nt">재검증 대기 4</span>`,
 raw:3, b:''}),

camp:()=>({t:'캠페인',s:`열린 캠페인 ${ST.camps.filter(c=>c.st==='open').length}개 · 등록하면 크리에이터 앱 목록과 셀 공지에 동시 게시`,
 r:`<div class="tabs2">${[['stat','진행 현황'],['new','새 캠페인 등록'],['appl','지원자 · 선정']]
   .map(t=>`<span class="${ST.campTab===t[0]?'on':''}" onclick="ST.campTab='${t[0]}';render()">${t[1]}</span>`).join('')}</div>`,
 b: ST.campTab==='new' ? `
  <div class="sect2"><h3>새 캠페인 등록</h3><span class="h2">등록 즉시 크리에이터 앱 캠페인 목록 + 셀 공지 채널에 뜹니다</span></div>
  <div class="ncf"><label>캠페인 이름 / 제품 / 이미지</label>
   <div style="display:flex;gap:8px">
    <div class="ncimg" onclick="toast('이미지 업로드','제품 컷 1장 + 연출 컷 1장을 권장합니다. 크리에이터 목록 카드와 셀 공지에 그대로 쓰여요.')">
     <div style="background:linear-gradient(140deg,#D8E6DC,#7FA98C)"></div><span>이미지</span></div>
    <div style="flex:1;display:flex;flex-direction:column;gap:8px">
     <input id="ncn" placeholder="9월 진정 앰플 · 태국" value="9월 진정 앰플 · 태국">
     <input id="ncp" placeholder="제품명" value="시카 진정 앰플"></div></div></div>
  <div class="ncf"><label>보상 유형 — 조건이 다르면 지원자 풀이 완전히 달라집니다</label>
   <div class="ncty">
    ${[['paid','유가','고정 보상 ₩38,000 · 검수 통과 시 지급'],
       ['gift','무가','제품 제공만 · 게시 의무 없음 — 부담 없는 첫 접점'],
       ['aff','어필리에이트','판매액의 12% · 전용 링크 · 판매가 곧 보상']]
     .map(t=>`<div class="${ST.nc.type===t[0]?'on':''}" onclick="ncType('${t[0]}')">
       <b>${t[1]}</b><span>${t[2]}</span></div>`).join('')}</div></div>
  <div class="ncf"><label>USP — 아리가 제품 페이지에서 뽑은 소구점 (수정 가능)</label>
   <div style="display:flex;gap:4px;flex-wrap:wrap">
    ${['48시간 진정 테스트 완료','무향 · 민감성 전용','가벼운 젤 텍스처'].map(u=>`<span class="uspc big">${u} ×</span>`).join('')}
    <span class="uspc add" onclick="toast('USP 추가','브랜드 프로필의 <b>고객의 언어</b>에서 골라 넣을 수도 있어요 — "겉돌지 않아요" 같은.')">+ 추가</span></div></div>
  <div class="ncf"><label>조건 · 정원</label>
   <div style="display:flex;gap:8px"><input value="15초 이상 · 제품 3초 노출 · #ad 표기" style="flex:2">
    <input value="30명" style="width:80px"><input value="마감 10/5" style="width:100px"></div></div>
  <div class="cc" style="background:var(--n50);padding:9px 13px;margin-bottom:10px;font-size:10.6px;color:var(--n600)">
   게시하면 조건 · USP · 이름이 <b>타깃 국가 언어(태국어 · 영어 · 베트남어)로 자동 번역</b>됩니다.
   크리에이터에게는 <b>무조건 자기 언어로</b> 뜨고, 원문은 칩으로 열려요. 번역본은 게시 전 미리보기로 확인할 수 있습니다.</div>
  <div style="display:flex;gap:7px;margin-top:4px">
   <button class="btn" onclick="pubCamp()">등록 · 게시</button>
   <button class="btn line" onclick="toast('번역 미리보기','<b>ไทย</b> — เซรั่มซิก้าปลอบผิว · ผ่านเทสต์ปลอบผิว 48 ชม. · ไร้น้ำหอม… 태국어 화자 검수를 거친 용어집 기반입니다.')">번역 미리보기</button>
   <button class="btn line" onclick="toast('아리 검토','문구를 아리가 먼저 봅니다 — <b>금지어 검사</b>와 국가별 광고 표기 규정 체크를 통과해야 게시돼요.')">아리 검토 먼저</button></div>
  ${NOTE('무가 캠페인은 <b>게시 의무를 걸지 않는 게</b> 좋습니다. 의무를 걸면 유가와 같아지는데 보상만 없는 캠페인이 돼요 — 지원이 끊깁니다.')}`
 : ST.campTab==='appl' ? `
  <div class="sect2"><h3>지원자 · ${ST.applied?ST.recruited+1:ST.recruited}명</h3><span class="h2">선정 전 1:1로 확인하세요 — 대화는 자동 번역됩니다</span></div>
  <table><tr><th>크리에이터</th><th style="width:56px">등급</th><th style="width:90px">매치</th>
   <th style="width:110px">상태</th><th style="width:190px"></th></tr>
  ${ST.applied?`<tr style="background:var(--t50)"><td><b>${ST.me.name}</b> <span class="mono" style="font-size:10px;color:var(--n600)">@ploy.skin.th</span></td>
    <td><span class="gd A">A</span></td><td class="mono">92점</td>
    <td>${ST.picked?'<span class="chip ok">선정됨</span>':'<span class="chip wt">1:1 진행 중</span>'}</td>
    <td style="display:flex;gap:6px">${ST.picked?'':'<button class="btn" onclick="pickCreator()">선정</button>'}
     <button class="btn line" onclick="toast('아래 스레드','이 화면 아래 <b>1:1 스레드</b>에서 이어서 대화하세요.')">1:1 대화</button></td></tr>`:''}
  <tr><td><b>Fah K.</b> <span class="mono" style="font-size:10px;color:var(--n600)">@fahbeauty</span></td>
   <td><span class="gd A">A</span></td><td class="mono">88점</td><td><span class="chip nt">지원</span></td>
   <td><button class="btn line" onclick="toast('1:1 시작','아리가 태국어 첫 질문 초안을 만들었습니다 — 확인 후 보내세요.')">1:1 대화</button></td></tr>
  <tr><td><b>Nan T.</b> <span class="mono" style="font-size:10px;color:var(--n600)">@nan.talks</span></td>
   <td><span class="gd B">B</span></td><td class="mono">81점</td><td><span class="chip nt">지원</span></td>
   <td><button class="btn line" onclick="toast('1:1 시작','아리가 태국어 첫 질문 초안을 만들었습니다 — 확인 후 보내세요.')">1:1 대화</button></td></tr>
  </table>
  ${ST.applied?`
  <div class="sect2" style="margin-top:16px"><h3>1:1 스레드 — ${ST.me.name}</h3>
   <span class="h2">내가 쓰면 한국어 → 태국어, 답장은 태국어 → 한국어 · 원문은 칩</span></div>
  <div class="dmw brand">${dmThread('brand')}</div>
  <div class="box" style="display:flex;gap:7px;background:var(--n0);border:1px solid var(--n300);border-radius:10px;padding:9px 13px;margin-top:8px">
   <span class="chip nt" style="font-size:8.6px;flex-shrink:0;align-self:center">KO→TH 자동</span>
   <input style="flex:1;border:none;background:transparent;font-size:11.6px;outline:none"
    placeholder="담당자로서 질문하기 (엔터) — 예: 향에 민감하신 편인가요?" onkeydown="dmSendB(event)"></div>
  ${NOTE('1:1은 <b>선정 판단을 위한 확인</b>에 쓰세요 — 향 민감도, 촬영 일정, 피부 타입. 이 대화 내용도 DB 레코드에 요약으로 남습니다.')}`
  :NOTE('아직 1:1이 열린 지원자가 없습니다. 크리에이터가 지원하면 여기 스레드가 생깁니다.')}`
 : `<table><tr>
  ${[['모집',ST.recruited,100,''],['배송',ST.shippedN,ST.shipped?100:2,ST.shipped?'':'w'],
     ['제출',ST.submittedN,Math.min(100,ST.submittedN/42*100),''],
     ['검수',ST.passedN,Math.min(100,ST.passedN/42*100),''],
     ['정산',ST.paid?27:0,ST.paid?64:0,ST.paid?'':'w']]
  .map(x=>`<td style="border:none;padding:12px 14px">
   <div style="font-size:8.6px;font-weight:900;letter-spacing:.1em;color:${x[3]==='w'?'var(--c500)':'var(--n600)'}">${x[0]}</div>
   <div class="num" style="font-size:20px;font-weight:800;color:${x[3]==='w'?'var(--c500)':'var(--n900)'}">${x[1]||'—'}</div>
   <div class="bar" style="margin-top:6px"><i class="${x[3]}" style="width:${x[2]}%"></i></div></td>`).join('')}
 </tr></table>
 <div class="sect2" style="margin-top:14px"><h3>열린 캠페인</h3><span class="h2">크리에이터 앱 목록 · 셀 공지에 노출 중</span></div>
 ${ST.camps.map(c=>`<div class="crow">
   <div style="width:34px;height:34px;border-radius:8px;background:${c.img};flex-shrink:0"></div>
   <div class="cn">${c.nm}</div>
   <div class="cd"><b>${c.prod}</b> · ${c.usp[0]} · 마감 ${c.due} · 정원 ${c.slots}명 · <span style="color:var(--t700)">th·en·vi 번역됨</span></div>
   ${CBADGE(c)}
   <button class="btn line" style="font-size:10.4px" onclick="ST.campTab='appl';render()">지원자</button></div>`).join('')}
 ${NOTE(ST.shipped?'배송이 나갔습니다. 도착하는 대로 <b>개봉 유도와 마감 안내</b>를 돌릴게요.'
  :'배송이 <b>26시간째</b> 안 나갑니다 — 승인함의 주소 제공만 눌러주시면 오늘 바로 보냅니다.')}`}),

review:()=>({t:'콘텐츠 검수',s:reviewCount()?'새 제출물 1건':'대기 없음',
 r:reviewCount()?'<span class="chip wt">대기 1</span>':'<span class="chip ok">대기 없음</span>',
 b:reviewCount()?`<table><tr><th style="width:130px">크리에이터</th><th style="width:70px">형식</th>
  <th style="width:210px">자동 체크</th><th></th></tr>
  <tr><td><b>${ST.me.name}</b></td><td>영상 18s</td>
   <td><span class="chip ok">태그</span> <span class="chip ok">표기</span> <span class="chip ok">노출</span> <span class="chip ok">문구</span></td>
   <td style="display:flex;gap:6px"><button class="btn" onclick="doPass2()">통과</button>
    <button class="btn line" onclick="toast('보완요청','고쳐 달라고 안내했습니다. <b>반려로 처리하지 않았습니다.</b>')">보완요청</button></td></tr>
 </table>${NOTE('자동 체크는 전부 통과했습니다. <b>통과 = 정산 대상 편입</b>이라 마지막은 사람이 눌러주세요.')}`
 :`<div class="empty"><div class="a av"></div><p>${ST.passed?'방금 통과시키셨습니다. 정산 대기 목록에 반영됐어요.':'대기 중인 제출물이 없습니다.'}</p></div>`}),

settle:()=>({t:'정산 · 원장',s:'append-only · 수정·삭제 불가',r:'<span class="chip ok">원장 정상</span>',
 b:`<div class="mrow m4">
  ${mc('검증 가입','₩'+(2850000+(joined('GLOWLAB')?10000:0)+(ST.me.joined.length>1?10000:0)).toLocaleString(),'','',null,'건당 ₩10,000 · <b>일회성</b>')}
  ${mc('구독 · Growth','₩790,000','','',null,'월 · 셀 무제한 + 아리 L2')}
  ${mc('창작자 분배','₩'+(500000+ST.earnExport).toLocaleString(),'','',null,ST.paid?'<b>지급 완료</b>':'지급 대기')}
  ${mc('다음 결제일','9월 1일','','',null,'가입 과금은 <b>월말 합산</b>')}
 </div>
 <table><tr><th style="width:70px">시각</th><th style="width:170px">타입</th><th>내용</th>
  <th style="width:96px">금액</th><th style="width:110px">해시</th></tr>
 ${ST.ledger.slice().reverse().map(r=>`<tr><td class="mono" style="font-size:10.2px">${r[0]}</td>
  <td class="mono" style="font-size:10.2px;color:var(--t700)">${r[1]}</td><td>${r[2]}</td>
  <td class="n">${r[3]}</td><td class="mono" style="font-size:10px;color:var(--n400)">${r[4]}</td></tr>`).join('')}
 </table>
 ${NOTE(ST.me.joined.length>1
  ? '두 번째 셀 가입도 <b>검증 가입 ₩10,000</b>으로 잡혔습니다. 같은 사람인데 <b>획득 비용은 0</b>이에요 — 이게 OSMU입니다.'
  : '원장은 <b>고칠 수 없습니다.</b> 정정은 반대 항목 추가로만 합니다.')}`}),
};


/* ---------- 브랜드 콘솔 · 커뮤니티 셀 ---------- */
const BCELLS = {
 GLOWLAB:{ nm:'태국 크루 · 1번방', base:131, state:'ok' },
 TH2:{ nm:'태국 크루 · 2번방', base:87, state:'ok' },
 TH3:{ nm:'태국 크루 · 3번방', base:41, state:'silent' },
};
function bCellCount(k){ return BCELLS[k].base + (k==='GLOWLAB'&&joined('GLOWLAB')?1:0); }
function bSpoke(k){
 if(k==='TH3') return 0;
 const base = k==='GLOWLAB'?6:4;
 return base + ST.cellMsgs[k].filter(m=>m.me||m.brand).length;
}
function brandSend(e){
 if(e.key!=='Enter') return; const v=e.target.value.trim(); if(!v) return; e.target.value='';
 const k=ST.bCell;
 ST.cellMsgs[k].push({who:'GLOWLAB', brand:1, tm:'지금', tx:v});
 const isCreatorCell = (k==='GLOWLAB' && joined('GLOWLAB'));
 render();
 if(isCreatorCell) toast('연결됨 · 크리에이터 앱',
  '브랜드 이름으로 셀에 올라갔습니다. <b>Ploy 님 셀 화면에 그대로 보입니다.</b>','creator','cell');
 else toast('게시됨','브랜드 계정으로 올렸습니다. 대표님이 직접 쓴 글은 <b>게이트를 거치지 않습니다.</b>');
}
function brandSeed(){
 const k=ST.bCell;
 ST.cellMsgs[k].push({who:'seed', tx:'혹시 <b>요즘 제일 자주 쓰는 앱</b>이 뭐예요? 편집을 뭘로 하시는지 궁금해서요.'});
 toast('마중물 발송','아리가 오늘의 질문을 하나 더 올렸습니다. <b>이건 L2 자동 항목</b>이라 승인 없이 나갑니다.');
 render();
}
function brandDraft(){
 toast('초안 · 승인 필요','아리가 공지 초안을 썼습니다. <b>공개 게시는 게이트</b>라 승인 전에는 나가지 않습니다. — 대표님이 직접 쓰시면 바로 게시됩니다.');
}


/* ---------- 셀 활성화 플랜 (에이전트 운영) ---------- */
function pubFeed(k){ if(ST.feedSent){ toast('이번 주는 발행됐습니다','피드는 <b>주 1회</b>입니다. 자주 올리면 피드가 공지가 돼버려요.'); return; }
 ST.feedSent=true;
 ST.cellMsgs[k].push({who:'seed', f:1, tx:'이번 주 이 방에서 나온 것들 — <b>Fah 님 아침 루틴 영상</b>(저장 1.2K), <b>Maya 님 비교 리뷰</b>, Bee 님의 <b>선쿠션 덧바르기 팁</b>. 다음 주에 해볼 사람 있어요?'});
 ST.ledger.push(['방금','FEED_PUBLISHED','주간 피드 · 멤버 콘텐츠 3건 큐레이션','—','f7a2…3c90']);
 toast('연결됨 · 크리에이터 앱','주간 피드를 방에 올렸습니다. <b>Ploy 님 셀 화면에도 그대로 보입니다</b> — 멤버 콘텐츠가 재료라 광고가 아니에요.','creator','cell');
 render(); }
function actPanel(k){
 return `<div class="agp">
  <div class="sect2"><h3>이번 주 활성화 플랜</h3>
   <span class="h2">아리가 방을 살아 있게 하는 프로그램 — 캠페인과 무관하게 돕니다</span></div>
  ${[['월','주간 피드','멤버 콘텐츠 3건 큐레이션 → 방에 게시. <b>서로의 결과물이 최고의 마중물</b>이에요.','L2',ST.feedSent?'발행됨':'대기'],
     ['화','멤버 스포트라이트','이번 주 한 명을 골라 <b>아리가 인터뷰 3문항</b>. 작은 계정 우선 — 큰 계정은 이미 보여요.','L2','예약'],
     ['수','촬영 팁 큐레이션','잡담에서 나온 팁을 모아 <b>촬영 팁 채널</b>에 정리. 출처 멤버 이름을 남깁니다.','L2','예약'],
     ['목','미니 챌린지','\'선쿠션 덧바르기 전후\' 같은 가벼운 주제. 참여 보상 없음 — <b>보상이 붙으면 숙제가 돼요.</b>','L1','초안 승인 대기'],
     ['금','브랜드 Q&A','멤버 질문을 모아 브랜드가 답합니다. 답변 초안은 아리가, <b>게시는 승인</b>.','L1','질문 수집 중']]
   .map(r=>`<div class="mstep"><div class="day">${r[0]}</div>
    <div class="mb"><div class="mt">${r[1]} <span class="chip nt" style="font-size:8.6px;margin-left:4px">${r[3]}</span>
      <span class="chip ${r[4]==='발행됨'?'ok':r[4].includes('승인')?'wt':'nt'}" style="font-size:8.6px">${r[4]}</span></div>
     <div class="mp">${r[2]}</div></div></div>`).join('')}
  <div style="display:flex;gap:7px;margin:4px 0 18px">
   <button class="btn" onclick="pubFeed('${k}')">${ST.feedSent?'주간 피드 발행됨':'주간 피드 지금 발행'}</button>
   <button class="btn line" onclick="toast('플랜 조정','요일·프로그램은 셀마다 다르게 짭니다. 이 방은 <b>아침 활동 멤버</b>가 많아 오전 발행이에요.')">플랜 조정</button>
  </div>
  <div class="sect2"><h3>활성화 효과 · 지난 4주</h3><span class="h2">프로그램별로 발화를 얼마나 만들었나</span></div>
  ${[['주간 피드','게시 후 24시간 발화 <b>+3.1배</b> · 멤버 저장 41%'],
     ['스포트라이트','지목된 멤버의 30일 잔존 <b>100%</b> · 4주 연속'],
     ['미니 챌린지','참여 12명 → 콘텐츠 <b>7건</b> 자발 생산'],
     ['마중물(매일)','무발화일 0일 유지 · 발화 유도 평균 3명']]
   .map(r=>`<div class="alog"><span class="tm2" style="width:74px">${r[0]}</span><span class="tx2">${r[1]}</span></div>`).join('')}
  ${NOTE('활성화의 원칙 — <b>조급함 장치는 쓰지 않습니다.</b> @everyone도, 읽음 표시도, 출석 보상도 없어요. 멤버가 만든 것을 서로 보여주는 게 이 방의 유일한 리텐션 장치입니다.')}
 </div>`;
}

/* ---------- 셀 충원 · 규칙 패널 (에이전트 관리) ---------- */
const RUL=()=>ST.rules, Q=()=>ST.queue;
function setRule(k,v){ ST.rules[k]=v;
 const msg={
  autoInvite: v?'자동 초대를 켰습니다. 하루 <b>최대 15명</b>까지 제가 직접 초대문을 보냅니다.'
              :'자동 초대를 껐습니다. 후보는 계속 쌓이지만 <b>발송은 대표님이</b> 하셔야 합니다.',
  silentDays:`침묵 임계값을 <b>${v}일</b>로 바꿨습니다. 지금 기준이면 3번방은 ${4>=v?'<b>이미 걸립니다</b>':'아직 안 걸립니다'}.`,
  autonomy: v===2?'셀 운영을 <b>L2 자동</b>으로 올렸습니다. 마중물·배정·재접촉을 제가 알아서 합니다.'
           :v===1?'<b>L1</b>입니다. 초안까지 만들고 발송은 승인받습니다.'
           :'<b>L0</b>입니다. 제안만 하고 아무것도 실행하지 않습니다.',
  access: v==='open'?'완전 공개로 바꿨습니다. <b>판정 없이 들어오므로</b> 봇·협찬 계정이 섞일 수 있어요 — 발화 감시를 강화하겠습니다.'
        : v==='invite'?'초대 링크로만 들어옵니다. 제일 깨끗하지만 <b>성장이 느려져요.</b>'
        :'신청 후 승인입니다. 4축 판정을 거쳐 들어오는 <b>권장 설정</b>이에요.',
  assign: v==='country_grade'?'국가 + 등급으로 배정합니다. <b>같은 시간대에 활동하는 사람끼리</b> 묶여요.'
        : v==='topic'?'관심 주제로 묶습니다. 셀은 <b>캠페인과 무관</b>해서, 캠페인이 끝나도 방은 계속 삽니다.'
        :'무작위로 배정합니다 — <b>권하지 않습니다.</b> 공통점이 없으면 방이 죽어요.'
 }[k];
 toast('규칙 변경', msg||'변경했습니다.'); render();
}
function doCellInvite(){
 if(Q().invited>0){ toast('이미 발송했습니다','초대는 하루 한 번만 묶어서 보냅니다 — <b>같은 사람에게 반복 발송하지 않습니다.</b>'); return; }
 const n=Q().cand; if(!n){ toast('후보가 없습니다','<b>발굴 · 수집</b>에서 채널을 돌려야 큐가 찹니다.'); return; }
 const got=Math.max(1,Math.round(n*0.17));
 ST.queue.invited=n; ST.queue.joinedQ=got; BCELLS[ST.bCell].base+=got; ST.roster+=got;
 ST.ledger.push(['방금','INVITE_SENT',`${BCELLS[ST.bCell].nm} 충원 · ${n}명 · 언어별 초안`,'—','8e42…77ac']);
 ST.ledger.push(['방금','BILLING_EVENT',`셀 가입 ${got}건 · billable=true`,'₩'+(got*10000).toLocaleString(),'c091…5d33']);
 toast('연결됨 · 명부·원장',`${n}명에게 초대를 보냈고 <b>${got}명이 바로 들어왔습니다.</b> 명부 +${got}, 검증 가입 <b>₩${(got*10000).toLocaleString()}</b>이 원장에 찍혔어요.`,'brand','settle');
 render();
}
function growPanel(k){
 return `<div class="agp">
  <div class="sect2"><h3>이 셀을 채우는 파이프라인</h3>
   <span class="h2">아리가 후보를 찾아 초대하고, 가입하면 이 방에 배정합니다</span></div>
  <div class="funnel">
   <div class="fs"><div class="l">후보 큐</div><div class="v">${Q().cand}</div>
    <div class="d"><b>발굴 · 수집</b>에서 넘어옴<br>4축 판정 완료</div></div>
   <div class="fs ${Q().invited?'':'hot'}"><div class="l">초대 발송</div><div class="v">${Q().invited}</div>
    <div class="d">${Q().invited?'언어별 초안 · 발송됨':'<b>대기 중</b> · 발송 필요'}</div></div>
   <div class="fs"><div class="l">가입 전환</div><div class="v">${Q().joinedQ}</div>
    <div class="d">${Q().invited?'전환율 <b>17%</b>':'—'}</div></div>
   <div class="fs"><div class="l">셀 배정</div><div class="v">${Q().joinedQ}</div>
    <div class="d">국가+등급 기준<br>자동 배정</div></div>
   <div class="fs"><div class="l">7일 발화 전환</div><div class="v">68%</div>
    <div class="d">가입 후 <b>첫 발화</b>까지<br>평균 1.8일</div></div>
  </div>
  <div style="display:flex;gap:7px;margin-bottom:16px">
   <button class="btn" onclick="doCellInvite()">${Q().invited?`초대 ${Q().invited}건 발송됨`:`후보 ${Q().cand}명에게 초대 발송`}</button>
   <button class="btn line" onclick="ST.b='src';ST.srcTab='judge';render()">후보 큐가 어디서 오는지 →</button>
  </div>

  <div class="sect2"><h3>후보 큐 · 상위 5명</h3><span class="h2">이 셀에 배정될 예정</span></div>
  ${[['@fahbeauty','태국 · 6.2K · 인게이지 7.1%','A','아침 루틴 콘텐츠 · 1번방과 톤이 맞음'],
     ['@bkk.skin','태국 · 2.1K · 인게이지 9.8%','B','저장률 상위 · 소액 캠페인 적합'],
     ['@june.care','태국 · 11K · 인게이지 4.2%','A','리뷰 비중 높음 · 선케어 경험 있음'],
     ['@mild.th','태국 · 900 · 인게이지 12.4%','B','신규 · 첫 캠페인 유도 필요'],
     ['@glow.diary','태국 · 28K · 인게이지 1.4%','C','협찬 과다 · <b>과금 제외</b>지만 초대는 발송']]
   .map(r=>`<div class="qcand"><span class="h3 mono">${r[0]}</span><span class="s3">${r[1]}</span>
     <span class="s3" style="flex:2">${r[3]}</span><span class="gd ${r[2]}">${r[2]}</span></div>`).join('')}

  <div class="sect2" style="margin-top:20px"><h3>아리가 이 방에서 한 일</h3>
   <span class="h2">최근 24시간 · 전부 원장에 기록</span></div>
  ${[['09:00','오늘의 마중물 발송 — <b>"선쿠션 어디부터 바르세요?"</b> · 발화 3명 유도'],
     ['08:40','신규 입장자 <b>${nm}</b>에게 첫 인사 + 프로필 3문항 발송'.replace('${nm}', joined('GLOWLAB')?ST.me.name:'Fah K.')],
     ['07:20','2번방 활성 멤버 <b>3명</b> 식별 — 3번방 재편성 후보로 표시'],
     ['어제','침묵 감지 — 3번방 <b>4일 무발화</b> · 재편성 제안을 승인함으로 올림'],
     ['어제','후보 <b>12명</b> 4축 판정 완료 · 과금 대상 11명 / 제외 1명']]
   .map(r=>`<div class="alog"><span class="tm2">${r[0]}</span><span class="tx2">${r[1]}</span></div>`).join('')}
  ${NOTE(`후보 큐가 <b>${Q().cand}명</b>이라 채우는 데 어려움은 없는데, <b>한 번에 다 넣지는 않겠습니다</b> — 하루 여유 있게 들어와야 기존 멤버가 인사할 틈이 생겨요. 상한은 없지만 <b>발화가 묻히기 시작하면 소그룹 스레드</b>를 열자고 제안하겠습니다.`)}
 </div>`;
}
function rulePanel(k){
 const R=RUL();
 return `<div class="agp">
  <div class="sect2"><h3>충원 규칙</h3><span class="h2">아리가 이 셀을 어떻게 채울지</span></div>
  <div class="rule"><div class="rl"><div class="rn">자동 초대</div>
    <div class="rd">후보가 쌓이면 <b>아리가 직접 초대문을 보냅니다.</b> 하루 최대 15명 · 언어별로 다시 씁니다.
     ${R.autoInvite?'<br>틱톡 DM은 정책상 <b>초안까지만</b> — 발송은 승인함으로.':''}</div></div>
   <div class="sw2 ${R.autoInvite?'on':''}" onclick="setRule('autoInvite',${!R.autoInvite})"><i></i></div></div>

  <div class="rule"><div class="rl"><div class="rn">셀 URL 공개 범위</div>
    <div class="rd">셀마다 <b>고유 URL</b>이 있습니다. 누가 이 링크로 들어올 수 있는지 — 어느 쪽이든 <b>커넥션 패스 로그인</b>은 항상 거칩니다.</div></div>
   <div class="rc">${[['invite','초대 링크만'],['apply','신청 후 승인'],['open','완전 공개']]
     .map(v=>`<span class="${R.access===v[0]?'on':''}" onclick="setRule('access','${v[0]}')">${v[1]}</span>`).join('')}</div></div>
  <div class="rule"><div class="rl"><div class="rn">자동 번역</div>
    <div class="rd">크리에이터는 <b>자기 모국어(IP 기준 초기 설정)</b>로, 브랜드는 <b>본국어 중심</b>으로 봅니다. 원문은 칩 한 번으로 열려요. 마중물도 <b>각자 언어로</b> 나갑니다.</div></div>
   <div class="rc"><span class="lock">항상 켬</span></div></div>

  <div class="rule"><div class="rl"><div class="rn">배정 기준</div>
    <div class="rd">새 멤버를 어느 방에 넣을지. <b>공통점이 없으면 방이 죽습니다.</b></div></div>
   <div class="rc">${[['country_grade','국가+등급'],['topic','관심 주제'],['random','무작위']]
     .map(v=>`<span class="${R.assign===v[0]?'on':''}" onclick="setRule('assign','${v[0]}')">${v[1]}</span>`).join('')}</div></div>

  <div class="sect2" style="margin-top:20px"><h3>대화 유지 규칙</h3><span class="h2">방이 죽지 않게 하는 장치</span></div>
  <div class="rule"><div class="rl"><div class="rn">마중물 스케줄</div>
    <div class="rd">매일 <b>${R.seedHour}</b>에 질문 하나. 주제는 제품·촬영·일상 순으로 돌아갑니다.
     <br>빈 채널을 사람에게 맡기지 않는 게 이 규칙의 목적이에요.</div></div>
   <div class="rc">${['08:00','09:00','20:00'].map(v=>`<span class="${R.seedHour===v?'on':''}" onclick="setRule('seedHour','${v}')">${v}</span>`).join('')}</div></div>

  <div class="rule"><div class="rl"><div class="rn">침묵 감지</div>
    <div class="rd">며칠 조용하면 개입할지. 걸리면 <b>마중물 추가 → 그래도 조용하면 재편성 제안</b>.
     <br>재편성 실행은 <b>항상 승인</b>입니다 — 사람을 옮기면 관계가 끊기니까요.</div></div>
   <div class="rc">${[3,4,7].map(v=>`<span class="${R.silentDays===v?'on':''}" onclick="setRule('silentDays',${v})">${v}일</span>`).join('')}</div></div>

  <div class="rule"><div class="rl"><div class="rn">신규 입장 응대</div>
    <div class="rd">들어오면 <b>즉시 첫 인사 + 프로필 3문항</b>. 기존 멤버 한 명에게 <b>"인사해 주세요"</b>를 따로 부탁합니다.</div></div>
   <div class="sw2 on"><i></i></div></div>

  <div class="sect2" style="margin-top:20px"><h3>자율 등급 · 셀 운영</h3>
   <span class="h2">아리가 어디까지 스스로 하는가</span></div>
  <div class="rule"><div class="rl"><div class="rn">셀 운영 (C13 카드)</div>
    <div class="rd">${['제안만 — 마중물도 초안으로 올립니다',
      '초안 + 승인 — 문구를 만들고 발송은 대표님이',
      '규칙 안에서 자동 — 마중물·배정·재접촉을 알아서 하고 브리핑에 기록'][R.autonomy]}</div></div>
   <div class="rc">${[0,1,2].map(v=>`<span class="${R.autonomy===v?'on':''}" onclick="setRule('autonomy',${v})">L${v}</span>`).join('')}</div></div>

  <div class="rule" style="background:var(--n50)"><div class="rl"><div class="rn">잠긴 항목</div>
    <div class="rd"><b>사람 이동(재편성) · 공지 게시 · 멤버 강제 퇴장</b>은 등급과 무관하게 항상 승인입니다.
     다이얼로 올릴 수 없어요.</div></div>
   <div class="rc"><span class="lock">L0 고정</span></div></div>

  ${NOTE(R.assign==='random'
   ? '무작위 배정은 <b>권하지 않습니다.</b> 지난 시도에서 4일 만에 발화가 0이 됐어요 — 공통점이 대화의 재료입니다.'
   : R.autonomy===0 ? '<b>L0로 내리셨습니다.</b> 마중물도 승인이 필요해서, 하루라도 놓치면 방이 조용해집니다.'
   : '지금 설정이면 제가 <b>매일 09:00 마중물</b>을 올리고, <b>4일 침묵</b>이면 개입하고, 신규가 오면 <b>즉시 인사</b>합니다. 사람을 옮기는 것만 여쭤볼게요.')}
 </div>`;
}




/* ============================================================ 브랜드 가입 */
function bjNext(d){ ST.bj.step=Math.max(0,Math.min(4,ST.bj.step+d)); render(); }
function bjLearn(){ const el=document.getElementById('burl'); if(el&&el.value.trim()) ST.bj.url=el.value.trim();
 ST.bj.learned=true;
 toast('학습 완료','<b>'+ST.bj.url+'</b>에서 제품 34페이지 · 리뷰 812건 · 인스타 90일치를 읽었습니다. 추출 결과를 확인해 주세요 — <b>틀린 건 지금 고치는 게</b> 제일 쌉니다.');
 render(); }
function bjConfirm(v){ ST.bj.confirmed=true;
 toast(v?'확인됨':'수정됨', v?'주력 제품을 <b>선쿠션</b>으로 확정했습니다. 모집 문구·후보 판정의 중심축이 됩니다.'
  :'주력 제품을 다시 지정해 주세요 — 학습 결과에서 해당 축만 갈아끼웁니다.'); render(); }
function bjSlug(){ const el=document.getElementById('slug'); if(el) ST.bj.slug=(el.value||'glowlab').toLowerCase().replace(/[^a-z0-9-]/g,'');
 ST.bj.slugOk=true;
 toast('사용 가능','<b>connection.app/'+ST.bj.slug+'</b> — 이 주소가 브랜드의 셀 입구가 됩니다. 한번 정하면 바꾸기 어려워요.'); render(); }
function bjDone(){ toast('브랜드 온보딩 완료','아리가 <b>첫 주 운영 계획</b>을 짜서 브리핑에 올려뒀습니다. 콘솔에서 확인하세요.','brand','brief'); go('brand'); }
function bjoinView(){
 const B=ST.bj;
 const steps=['계정 · 사업자','브랜드 프로필','플랜 선택','아리 온보딩','완료'];
 const stepHead=`<div class="bjsteps">${steps.map((t,i)=>`<div class="${i<B.step?'done':i===B.step?'now':''}">
   <i>${i<B.step?'✓':i+1}</i><span>${t}</span></div>`).join('')}</div>`;
 let body='';
 if(B.step===0) body=`
  <h2>브랜드 계정을 만듭니다</h2>
  <p class="bjs">크리에이터와 달리 브랜드는 <b>사업자 확인</b>이 필수입니다. 돈과 개인정보를 다루는 쪽이니까요.</p>
  <div class="bjf"><label>사업자등록번호</label><div class="bjrow"><input value="123-45-67890" readonly>
   <span class="chip ok">국세청 조회 · 정상</span></div></div>
  <div class="bjf"><label>브랜드명 / 담당자</label><div class="bjrow"><input value="GLOWLAB / 김하나 (마케팅 리드)" readonly></div></div>
  <div class="bjf"><label>담당자 업무 메일</label><div class="bjrow"><input value="hana@glowlab.kr" readonly>
   <span class="chip ok">인증됨</span></div></div>
  ${[['서비스 이용약관 + <b>DPA(개인정보 처리 위탁 계약)</b>','필수 — 크리에이터 개인정보의 처리자가 되는 계약입니다'],
     ['크리에이터 데이터 이용 원칙 동의','필수 — 과금 제외≠차단 · 열람·이의 제기 보장 · 철회 즉시 전파']]
   .map((r,i)=>`<div class="cs" onclick="ST.bj.agree[${i}]=!ST.bj.agree[${i}];render()">
    <div class="bx ${B.agree[i]?'on':''}">${B.agree[i]?'✓':''}</div>
    <div class="tx">${r[0]}<div class="sub3">${r[1]}</div></div></div>`).join('')}
  <button class="btn lg" style="margin-top:14px" onclick="${B.agree.every(Boolean)?'bjNext(1)':`toast('진행할 수 없습니다','두 동의가 모두 있어야 합니다. <b>DPA 없이 크리에이터 데이터를 다룰 수 없어요.</b>')`}">다음</button>`;
 else if(B.step===1) body=`
  <h2>브랜드 프로필과 주소</h2>
  <p class="bjs">여기서 정하는 것들이 <b>아리의 판정 기준</b>과 <b>셀 입구 주소</b>가 됩니다.</p>
  <div class="bjf"><label>카테고리</label><div class="bjchips">${['스킨케어','메이크업','헤어·바디','향수'].map((c,i)=>`<span class="${i===0?'on':''}">${c}</span>`).join('')}</div></div>
  <div class="bjf"><label>타깃 국가 (복수 선택)</label><div class="bjchips">${['태국','미국','베트남','일본','인도네시아'].map((c,i)=>`<span class="${i<3?'on':''}">${c}</span>`).join('')}</div>
   <div class="sub3" style="margin-top:5px">선택한 국가 언어로 아리가 초대문·마중물을 씁니다.</div></div>
  <div class="bjf"><label>브랜드 주소 — 한번 정하면 바꾸기 어렵습니다</label>
   <div class="bjrow"><span class="mono" style="font-size:11.6px;color:var(--n600)">connection.app/</span>
    <input id="slug" value="${B.slug}" style="flex:1" class="mono">
    <button class="btn soft" onclick="bjSlug()">중복 확인</button>
    ${B.slugOk?'<span class="chip ok">사용 가능</span>':''}</div></div>
  <div class="bjnav"><button class="btn line" onclick="bjNext(-1)">이전</button>
   <button class="btn lg" onclick="${B.slugOk?'bjNext(1)':`toast('주소 확인 필요','<b>중복 확인</b>을 눌러 주소를 확정해 주세요.')`}">다음</button></div>`;
 else if(B.step===2) body=`
  <h2>플랜을 고릅니다</h2>
  <p class="bjs">구독의 실체는 <b>아리의 운영 범위</b>입니다. 검증 가입 과금(1명 ₩10,000)은 전 플랜 공통이에요.</p>
  <div class="bjplans">
  ${[['Starter','₩290,000<i>/월</i>','셀 1개 · 아리 L1(초안+승인)<br>발굴 에이전트 3종<br>DB 500명까지',0],
     ['Growth','₩790,000<i>/월</i>','셀 무제한 · 아리 L2(규칙 내 자동)<br>발굴 에이전트 8종 전부<br>DB 무제한 · 자동 번역 전 언어',1],
     ['Enterprise','별도 협의','멀티 브랜드 · 전용 인프라<br>DPA 커스텀 · SLA',2]]
   .map(p=>`<div class="bjp ${B.plan===p[3]?'on':''}" onclick="ST.bj.plan=${p[3]};render()">
    <div class="pn2">${p[0]}${p[3]===1?'<span class="chip ok" style="margin-left:6px;font-size:8.6px">권장</span>':''}</div>
    <div class="pp">${p[1]}</div><div class="pd">${p[2]}</div></div>`).join('')}
  </div>
  <div class="bjnav"><button class="btn line" onclick="bjNext(-1)">이전</button>
   <button class="btn lg" onclick="bjNext(1)">다음 · 결제는 온보딩 후</button></div>`;
 else if(B.step===3) body=`
  <h2>아리에게 브랜드를 가르칩니다</h2>
  <p class="bjs">두 단계입니다 — <b>① 사이트를 읽고, ② 사이트가 말해주지 않는 것만 묻습니다.</b>
   여기서 만든 브랜드 프로필이 이후 <b>크리에이터 모집의 판정 기준</b>이 됩니다.</p>

  <div class="bjf"><label>① 브랜드 사이트 · 쇼핑몰 · SNS 링크</label>
   <div class="bjrow"><input id="burl" value="${B.url}" class="mono" placeholder="glowlab.kr">
    <button class="btn" onclick="bjLearn()">${B.learned?'다시 학습':'학습 시작'}</button></div>
   <div class="sub3">공개 페이지만 읽습니다 — 제품 상세 · 리뷰 · 브랜드 스토리 · 인스타 90일.</div></div>

  ${B.learned?`<div class="lrncard">
   <div class="lh">아리가 읽고 이해한 것 <span class="h2">제품 34페이지 · 리뷰 812건 · 인스타 90일</span></div>
   ${[['포지셔닝','민감성 피부 · 저자극 · <b>성분 중심</b> 서사','브랜드 스토리 + 제품 상세'],
      ['주력 제품','선쿠션 SPF50+ (전체 매출 언급의 41%)','제품 페이지 · 베스트 탭'],
      ['성분 키워드','시카 · 판테놀 · 무향 — <b>\'순하다\'가 리뷰 최빈 단어</b>','리뷰 812건'],
      ['가격대','₩18,000 ~ 32,000 · 중가 — 소액 캠페인 적합','전 제품'],
      ['고객의 언어','"겉돌지 않아요" · "화장 안 밀려요" — <b>모집 문구에 그대로 쓸 말</b>','리뷰 최다 표현'],
      ['톤','차분함 · 데이터 인용 · 이모지 거의 없음','인스타 캡션 90일']]
    .map(r=>`<div class="lrow"><span class="lk3">${r[0]}</span><div class="lv3">${r[1]}</div>
      <span class="ls3">${r[2]}</span></div>`).join('')}
   <div class="lconf ${B.confirmed?'ok2':''}">
    ${B.confirmed?'주력 제품 <b>선쿠션</b> 확정 — 판정·문구의 중심축이 됩니다.'
     :`확인 — 모집의 중심을 <b>선쿠션</b>으로 잡아도 될까요?
      <span class="cbt" onclick="bjConfirm(true)">맞아요</span>
      <span class="cbt no" onclick="bjConfirm(false)">아니요, 다른 제품</span>`}</div>
  </div>`:`<div class="lrnhint">링크를 넣고 <b>학습 시작</b>을 누르면 아리가 사이트를 읽고 브랜드 프로필 초안을 만듭니다.</div>`}

  <div class="bjf" style="margin-top:16px"><label>② 사이트가 말해주지 않는 것 · 5문항</label></div>
  ${[['우리 브랜드를 한 문장으로?','\'민감성 피부를 위한 저자극 선케어\' — 아리가 초대문·공고에 그대로 씁니다'],
     ['어떤 크리에이터가 \'맞는\' 사람인가요?','팔로워 수보다 <b>피부 고민을 직접 말하는 사람</b> — 4축 판정의 적합도 축이 됩니다'],
     ['절대 하면 안 되는 말·표현은?','\'미백\' · 효능 단정 · 경쟁사 비방 — 아리의 모든 초안에서 금지어로 걸립니다'],
     ['제품을 먼저 보내는 기준은?','등급 B 이상 + 태국 거주 — 샘플 발송 자동 판정 기준이 됩니다'],
     ['브랜드 말투는?','존댓말 · 이모지 최소 · 태국어는 부드럽게 — 아리가 브랜드 이름으로 말할 때의 톤']]
   .map((q,i)=>`<div class="bjq ${i<=B.q?'done':''}" onclick="ST.bj.q=Math.max(ST.bj.q,${i});render()">
    <div class="qn">Q${i+1}</div><div><div class="qt">${q[0]}</div>
    <div class="qa">${i<=B.q?q[1]:'답변하면 아리 설정에 반영됩니다 — 눌러서 예시 보기'}</div></div>
    ${i<=B.q?'<span class="chip ok" style="margin-left:auto;flex-shrink:0">반영됨</span>':''}</div>`).join('')}
  <div class="bjnav"><button class="btn line" onclick="bjNext(-1)">이전</button>
   <button class="btn lg" onclick="${(B.learned&&B.q>=4)?'bjNext(1)':`toast('아직 부족합니다','${B.learned?'문항이 남았습니다':'<b>사이트 학습</b>부터 돌려주세요'} — 학습 없이 모집을 시작하면 아리가 <b>짐작으로 후보를 고르게</b> 됩니다.')`}">아리 세팅 완료</button></div>`;
 else body=`
  <h2>준비가 끝났습니다</h2>
  <p class="bjs">아리가 온보딩 답변으로 <b>첫 주 운영 계획</b>을 짰습니다.</p>
  <div class="bjsum">
   <div class="dkv"><span>브랜드 주소</span><b class="mono">connection.app/${B.slug}</b></div>
   <div class="dkv"><span>플랜</span><b>${['Starter','Growth','Enterprise'][B.plan]} · 검증 가입 ₩10,000/명</b></div>
   <div class="dkv"><span>타깃</span><b>태국 · 미국 · 베트남 (3개 언어 자동)</b></div>
   <div class="dkv"><span>브랜드 프로필</span><b>사이트 학습(34p · 리뷰 812) + 5문항 → <span class="mono" style="font-size:10px">profile v1</span></b></div>
   <div class="dkv"><span>아리 첫 주</span><b>인바운드 폼 개설 → 후보 스크리닝 → 1번방 시딩</b></div>
   <div class="dkv"><span>첫 결정 요청</span><b>초대문 초안 승인 (내일 09:30 예정)</b></div>
  </div>
  ${NOTE('브랜드가 가입하면서 이미 <b>아리를 세팅</b>했습니다 — 콘솔에 처음 들어가는 순간부터 아리는 일하고 있어요.')}
  <div class="bjnav"><button class="btn line" onclick="bjNext(-1)">이전</button>
   <button class="btn lg" onclick="bjDone()">브랜드 콘솔 열기 →</button></div>`;
 return `<div class="planw"><div class="plani" style="max-width:720px">
  <div class="plhero" style="padding:22px 26px;margin-bottom:14px">
   <div class="lgm"><span class="sym"><i class="c"></i><i class="a"></i><i class="b"></i></span>
    <span style="font-size:10px;font-weight:900;letter-spacing:.22em;color:var(--t700)">CONNECTION FOR BRANDS</span></div>
   ${stepHead}</div>
  <div class="bjcard">${body}</div>
 </div></div>`;
}

/* ============================================================ 핵심 기획 */

/* ---------- 모집 에이전트 기획 페이지 ---------- */
function recruitPlan(card,tabbar){
 const pipe=['① 브랜드 학습','② 후보 발견','③ 4축 판정','④ 접촉','⑤ 가입 · 과금','⑥ 셀 배정','⑦ 결과 채점'];
 const c1=card('R1','브랜드 학습 — 모집의 뿌리',[
    ['소스 ① 사이트 학습','브랜드가 링크를 넣으면 제품 상세 · 리뷰 · 인스타 90일을 읽어 <b>포지셔닝 · 주력 제품 · 성분 키워드 · 가격대 · 고객의 언어 · 톤</b>을 추출합니다. 공개 페이지만.'],
    ['소스 ② 온보딩 5문항','사이트가 말해주지 않는 것 — 맞는 크리에이터像 · 금지어 · 샘플 기준 · 말투. <b>대충 쓰면 아리도 대충 압니다.</b>'],
    ['소스 ③ 운영 피드백','대표가 후보를 반려·추가할 때마다 그 이유가 프로필에 쌓입니다. <b>운영할수록 정확해지는 유일한 소스.</b>'],
    ['산출 — 브랜드 프로필 v','버전 관리되는 구조화 문서. 바뀌면 <b>이후 판정부터</b> 적용되고 원장에 남습니다.']],
   '학습이 부실하면 그 뒤 전부가 부실해집니다 — 그래서 온보딩에서 <b>학습 없이는 모집을 시작할 수 없게</b> 막았습니다.');
 const c2=card('R2','프로필이 소비되는 곳 4군데',[
    ['4축 판정 · 적합도 축','\'우리 제품과 맞는가\'의 기준이 곧 프로필 — 주력 제품 · 타깃 피부 타입 · 카테고리 톤.'],
    ['초대문 · 공고 개인화','고객의 언어("겉돌지 않아요")와 브랜드 말투로 씁니다. <b>복붙 초대는 수락률 9%</b>, 개인화는 47%.'],
    ['채널 우선순위','중가 브랜드 → 소액 캠페인 채널 강화, 성분 서사 → 리뷰형 커뮤니티 우선 같은 배분 판단.'],
    ['금지어 필터','아리가 쓰는 <b>모든 초안</b>이 발송 전에 금지어 검사를 통과해야 합니다.']]);
 const c3=`<div class="pk"><div class="pkh"><span class="no2">R3</span><h2>담당자 8명 — 한눈에</h2></div>
   <table class="dbt" style="margin-top:4px"><tr><th>담당</th><th>목표</th><th style="width:170px">핵심 KPI</th><th style="width:170px">실패 시</th></tr>
   ${Object.keys(AGSPEC).map(k=>`<tr><td><b>${CHAN[k].nm}</b></td>
     <td style="font-size:10.8px">${AGSPEC[k].goal}</td>
     <td style="font-size:10.4px;color:var(--n600)">${AGSPEC[k].kpi.split(' · ')[0]}</td>
     <td style="font-size:10.4px;color:var(--n600)">${AGSPEC[k].fail.replace(/<[^>]+>/g,'').slice(0,42)}…</td></tr>`).join('')}</table>
   <div class="pkn">전체 설계서는 <b>브랜드 콘솔 → 발굴 · 수집 → 각 카드의 "운영 설계 보기"</b>에 있습니다.
    <span class="cbt" style="margin-left:6px" onclick="go('brand');ST.b='src';ST.srcTab='agents';render()">바로 가기 →</span></div></div>`;
 const c4=card('R4','접촉 정책 — 신뢰가 채널을 지킨다',[
    ['밖으로 나가는 건 승인','메일 발송 · 커뮤니티 게시 · 공개 글은 자율 등급과 무관하게 <b>항상 사람이 승인.</b>'],
    ['상한 준수','인스타 DM 일 30건 · 메일 일 80건 · 커뮤니티당 주 1회 — <b>상한을 지키는 게 실력.</b>'],
    ['재접촉 금지','거절 · 시퀀스 종료 후 <b>90일간 전 채널 침묵.</b> 우회 접촉도 금지.'],
    ['수신거부 즉시 전파','한 채널 거부 = 전 채널 제외. 지연 0건이 KPI.']]);
 const c5=card('R5','학습 루프 — 모집이 좋아지는 방식',[
    ['예측 기록','초대할 때마다 기대 완주율을 기록 — 점수가 아니라 <b>채점당할 약속.</b>'],
    ['30일 채점','게시 · 검수 · 잔존 결과로 자동 채점. 브라이어 점수로 확신의 질을 측정.'],
    ['가중치 갱신','틀린 이유가 가중치로 — <span class="mono" style="font-size:10px">follower 0.30→0.12</span> 같은 변경이 원장에 남음.'],
    ['브랜드 프로필 역반영','\'이런 후보가 실제로 완주하더라\'가 프로필의 크리에이터像을 다시 씁니다.']]);
 const c6=card('R6','단계 로드맵',[
    ['M0 — 수동 + 초안','아리는 후보 리스트와 초안만. 발송·게시 전부 사람. <b>판정 정확도 검증 기간.</b>'],
    ['M1 — L1 반자동','인바운드 판정 · 스윕 자동화. 접촉은 승인제 유지. 채점 루프 가동.'],
    ['M2 — L2 조건 자동','채점 정확도가 기준을 넘은 채널부터 규칙 내 자동으로. <b>승격 조건은 감이 아니라 브라이어 점수.</b>']],
   '자동화의 순서가 거꾸로면 망합니다 — <b>먼저 채점, 그 다음 자동화.</b>');
 return `<div class="planw"><div class="plani">
  <div class="plhero">
   <div class="lgm"><span class="sym"><i class="c"></i><i class="a"></i><i class="b"></i></span><span style="font-size:10px;font-weight:900;letter-spacing:.22em;color:var(--t700)">CONNECTION · 모집 에이전트 기획</span></div>
   ${tabbar}
   <h1>브랜드를 먼저 배우고,<br>그 이해로 사람을 모은다.</h1>
   <p>모집 에이전트는 채널 자동화 도구가 아닙니다. <b>브랜드 프로필</b>(사이트 학습 + 온보딩 문답 + 운영 피드백)을
    판단의 뿌리로 삼아 후보를 찾고 · 거르고 · 말 걸고 · 셀에 앉히는 <b>담당자 8명의 팀</b>이고, 모든 판단은 30일 뒤 채점됩니다.</p>
   <div class="pipe">${pipe.map((p,i)=>`<span>${p}</span>${i<pipe.length-1?'<i>→</i>':''}`).join('')}</div>
  </div>
  <div class="pgrid">${c1}${c2}</div>
  ${c3}
  <div class="pgrid" style="margin-top:12px">${c4}${c5}</div>
  <div style="margin-top:12px">${c6}</div>
 </div></div>`;
}

function planView(){
 const card=(no,t,rows,note)=>`<div class="pk"><div class="pkh"><span class="no2">${no}</span><h2>${t}</h2></div>
  ${rows.map(r=>`<div class="pkr"><b>${r[0]}</b><span>${r[1]}</span></div>`).join('')}
  ${note?`<div class="pkn">${note}</div>`:''}</div>`;
 const tabbar=`<div class="pltabs">
  <span class="${ST.planTab==='svc'?'on':''}" onclick="ST.planTab='svc';render()">서비스 전체</span>
  <span class="${ST.planTab==='recruit'?'on':''}" onclick="ST.planTab='recruit';render()">모집 에이전트 기획</span></div>`;
 if(ST.planTab==='recruit') return recruitPlan(card,tabbar);
 return `<div class="planw"><div class="plani">
  <div class="plhero">
   <div class="lgm"><span class="sym"><i class="c"></i><i class="a"></i><i class="b"></i></span><span style="font-size:10px;font-weight:900;letter-spacing:.22em;color:var(--t700)">CONNECTION · 핵심 기획</span></div>
   ${tabbar}
   <h1>브랜드가 소유하는 글로벌 크리에이터 커뮤니티를,<br>에이전트가 운영한다.</h1>
   <p>커넥션은 <b>계정 하나(패스)</b>로 여러 브랜드의 셀에 들어가는 구조 위에,
    브랜드마다 <b>아리(운영 에이전트)</b>를 붙여 모집 · 커뮤니티 · 검수 · 정산 · 권리를 대신 굴리는 서비스입니다.
    RemixHub의 권리 엔진이 아래층, 커넥션의 에이전트가 위층이에요.</p>
  </div>
  <div class="pgrid">
  ${card('01','접근 · URL',[
    ['주소는 브랜드명 하나','<b class=mono>connection.app/glowlab</b> — 셀·채널은 내부 라우팅. 주소가 복잡하면 공유가 죽습니다.'],
    ['링크는 숨기고 공유는 버튼','화면에 URL을 상시 노출하지 않습니다. <b>↗ 공유</b>를 누르면 복사.'],
    ['로그인은 항상 커넥션 패스','어떤 링크로 들어와도 <b>패스 로그인 → 원래 가려던 방</b>으로 리다이렉트.'],
    ['웹이자 앱','PWA — 같은 URL로 홈 화면 설치 · 오프라인 캐시 · 셀 알림 푸시.']])
  +card('02','가입 · 계정',[
    ['틱톡 또는 인스타 OAuth 필수','이메일 가입 없음. <b>본인 크리에이터 계정 연결이 곧 가입</b> — DB 품질의 시작점.'],
    ['필수 동의 3 + 선택 1','본인 확인 · 약관 · 국외 이전(필수), 교차 브랜드 추천(선택). append-only 기록.'],
    ['한 계정 · N 브랜드 멤버십','두 번째 브랜드부터 재가입 없음. 커넥션은 <b>획득 비용 0으로 ₩10,000</b>을 다시 받음.']])
  +card('03','셀 · 커뮤니티',[
    ['상한 없음','정원 대신 <b>발화 밀도</b>로 건강을 판단. 묻히면 소그룹 스레드 제안.'],
    ['캠페인과 무관한 자유 시딩','셀은 캠페인 단위로 묶지 않습니다. 캠페인이 끝나도 방은 계속 삽니다.'],
    ['자동 번역','크리에이터는 모국어(IP 초기값), 브랜드는 본국어 중심. 원문은 칩 한 번. 마중물은 <b>각자 언어로</b>.'],
    ['조급함 장치 제거','타이핑 표시 · 읽음 · @everyone · 출석 보상 없음.'],
    ['브랜드도 멤버','관리자 배지 없이 브랜드 이름으로 같은 방에. 감시가 아니라 동석.'],
    ['크로스 노출 차단','셀 안에서 다른 브랜드는 <b>절대 보이지 않음.</b> 이동은 초대 링크와 옵트인 추천(같은 카테고리 제외)뿐.']])
  +card('04','운영 에이전트 · 아리',[
    ['기능이 아니라 담당자','발굴 8명 체제 — 각자 목표 · 진행 중 작업 · <b>한 것 / 안 한 것</b> · 다음 행동.'],
    ['활성화 플랜','주간 피드(멤버 콘텐츠 큐레이션) · 스포트라이트 · 팁 큐레이션 · 미니 챌린지 · Q&A — 요일제로 방을 살립니다.'],
    ['게이트 4종','개인정보 제공 · 정산 · 외부 발송 · 공개 게시 — <b>밖으로 나가는 건 전부 사람이 승인.</b>'],
    ['자율 다이얼 L0/L1/L2','채널·셀 단위로 따로. 잠긴 항목은 다이얼로 못 올림.']])
  +card('05','크리에이터 DB',[
    ['모든 행이 OAuth로 시작','수기 행 없음 → 가짜·중복이 구조적으로 안 생김. 90일 재검증.'],
    ['라이프사이클 관리','후보 → 초대 → 가입 → 활성 → 휴면 → 이탈. 세그먼트 · 검색 · 레코드 카드.'],
    ['필드마다 보유 근거','어느 동의로 갖고 있는지 필드 단위 기록. 캠페인 종료 +30일 <b>파기 예약</b>.'],
    ['내보내기는 게이트','연락처·주소가 포함되면 CSV도 PII 승인 필요.']])
  +card('06','기술 스택 · 해자',[
    ['L1 결과 파이프라인','초대→가입→게시→검수→잔존이 한 사람에게 귀속되는 이벤트 스키마.'],
    ['L2 평가 하네스','아리의 예측이 30일 뒤 자동 채점 → 가중치 갱신. <b>성적표가 해자.</b>'],
    ['L3 규범 메모리','커뮤니티별 통한 문구·잘린 문구, 버전 관리 + 근거 링크.'],
    ['L4 신뢰 인프라','판단 원장 · 열람·이의 제기 · 동의 철회 0.4초 전파. <b>데이터를 들고 있을 자격.</b>'],
    ['안 하는 것','자체 LLM · 스크래핑 · 범용 CRM.']])
  +card('07','수익 구조',[
    ['브랜드 구독','Starter ₩290,000 / Growth ₩790,000 / Enterprise 별도 — <b>반복 매출의 축.</b> 아리 운영이 구독의 실체.'],
    ['검증 가입 과금','1명 ₩10,000 · 일회성. 두 번째 브랜드 가입도 동일 과금(획득 비용 0).'],
    ['과금 제외 원칙','기준 미달은 차단이 아니라 과금 제외 — 커뮤니티는 유지.']])
  +card('08','결정 로그',[
    ['8/22','에이전트+대시보드 결합(나란히) 확정 · 테라 데이라이트 확정'],
    ['8/24','RemixHub와 4층 구조로 합병 방향 · 커뮤니티 셀을 크리에이터 앱에 통합'],
    ['8/25','브랜드 콘솔에 셀 동석 · 발굴을 담당자 8명 체제로 재편'],
    ['8/26','URL을 브랜드명 하나로 단순화 · <b>셀 상한 제거</b> · 틱톡/인스타 OAuth 필수 · 자유 시딩 · 활성화 플랜 도입'],
    ['8/26','<b>반출·라이선스 모듈 제외</b> · 수익은 구독 + 가입 과금으로 · 브랜드 가입 프로세스 신설'],
    ['8/26','<b>셀 찾기 노출 제거</b> — 셀 컨텍스트는 브랜드 단독 세계 · 이동은 초대 링크 + 동종 카테고리 배제 추천만']],
   '상한 제거로 \'30명 정원\' 논거는 내려놓았지만, 조급함 장치 제거 + 아리 마중물 + 멤버 콘텐츠 피드가 <b>\'죽지 않는 방\'</b>이라는 차별점을 이어받습니다.')}
  </div>
 </div></div>`;
}

/* ============================================================ 크리에이터 DB */
const DB=[
 {id:'fah', h:'@fahbeauty', nm:'Fah K.', sns:'tt', fol:'6.2K', eng:'7.1%', ctry:'TH', g:'A', cell:'TH-1',
  st:'active', comp:'92%', ltv:120000, last:'2시간 전', bill:1, tags:['선케어','아침 루틴'],
  memo:'아침 루틴 포맷이 일정함 · 저장률 상위 8%',
  tl:[['8/03','TIKTOK_VERIFIED','틱톡 OAuth · 공개 필드 6개'],['8/04','CELL_JOINED','TH-1 배정 · 국가+등급'],
      ['8/09','CONTENT_POSTED','선쿠션 리뷰 · D+5'],['8/12','REVIEW_PASSED','1차 검수 통과'],['8/20','PAYOUT','₩45,000 분배']]},
 {id:'maya', h:'@maya.chen', nm:'Maya Chen', sns:'ig', fol:'48K', eng:'3.8%', ctry:'US', g:'S', cell:'US-1',
  st:'active', comp:'100%', ltv:410000, last:'40분 전', bill:1, tags:['비교 리뷰','전환 상위'],
  memo:'전환율이 팔로워 대비 이례적 · 완주 4회 연속',
  tl:[['7/11','IG_VERIFIED','인스타 OAuth'],['7/12','CELL_JOINED','US-1'],['8/02','REVIEW_PASSED','비교 리뷰 캠페인'],['8/20','PAYOUT','₩180,000 분배']]},
 {id:'nan', h:'@nan.talks', nm:'Nan T.', sns:'tt', fol:'2.1K', eng:'9.8%', ctry:'TH', g:'B', cell:'TH-1',
  st:'joined', comp:'—', ltv:0, last:'09:31', bill:1, tags:['신규'],
  memo:'저장률 상위 · 첫 캠페인 배송 대기',
  tl:[['8/19','TIKTOK_VERIFIED','틱톡 OAuth'],['8/19','CELL_JOINED','TH-1'],['8/21','CAMPAIGN_APPLIED','8월 선쿠션']]},
 {id:'sara', h:'@sara.kbeauty', nm:'Sara K.', sns:'ig', fol:'28K', eng:'1.4%', ctry:'US', g:'C', cell:'US-2',
  st:'active', comp:'40%', ltv:0, last:'어제', bill:0, tags:['과금 제외'],
  memo:'협찬 비율 61% 상승 추세 → 과금 제외 · 커뮤니티는 유지',
  tl:[['6/28','IG_VERIFIED','인스타 OAuth'],['7/02','BILLING_EXCLUDED','협찬 과다 · 근거 원장 기록'],['8/15','CELL_ACTIVE','발화 유지']]},
 {id:'june', h:'@june.care', nm:'June L.', sns:'tt', fol:'11K', eng:'4.2%', ctry:'TH', g:'A', cell:'TH-2',
  st:'dormant', comp:'71%', ltv:64000, last:'11일 전', bill:1, tags:['휴면 진입'],
  memo:'11일 무활동 · 재접촉 시퀀스 D+14에 예약됨',
  tl:[['5/20','TIKTOK_VERIFIED','틱톡 OAuth'],['6/01','REVIEW_PASSED','앰플 캠페인'],['8/14','DORMANT_FLAG','11일 무활동']]},
 {id:'bee', h:'@bee.bkk', nm:'Bee P.', sns:'tt', fol:'900', eng:'12.4%', ctry:'TH', g:'B', cell:'TH-2',
  st:'active', comp:'100%', ltv:38000, last:'08:12', bill:1, tags:['소액 캠페인'],
  memo:'작지만 완주율 100% · 게시 빈도 최상위',
  tl:[['7/07','TIKTOK_VERIFIED','틱톡 OAuth'],['7/30','REVIEW_PASSED','1회'],['8/22','CELL_ACTIVE','오늘 발화']]},
 {id:'mild', h:'@mild.th', nm:'Mild S.', sns:'tt', fol:'900', eng:'12.4%', ctry:'TH', g:'B', cell:'—',
  st:'invited', comp:'—', ltv:0, last:'초대 D+1', bill:1, tags:['후보'],
  memo:'초대 발송됨 · 수락 대기 · 기대 완주 중간',
  tl:[['8/21','JUDGED','4축 통과 · 과금 대상'],['8/22','INVITE_SENT','언어별 초안']]},
 {id:'glow', h:'@glow.diary', nm:'Glow D.', sns:'ig', fol:'28K', eng:'1.4%', ctry:'TH', g:'C', cell:'—',
  st:'churn', comp:'0%', ltv:0, last:'34일 전', bill:0, tags:['이탈','과금 제외'],
  memo:'샘플 수령 후 미게시 · 90일 재접촉 금지 등록',
  tl:[['6/10','SAMPLE_DELIVERED','앰플'],['7/05','NO_POST_30D','미게시 확정'],['7/05','DO_NOT_CONTACT','90일']]},
];
const DBSEG=[['all','전체'],['active','활성'],['joined','신규 가입'],['invited','초대됨'],['dormant','휴면'],['churn','이탈'],['nobill','과금 제외']];
function dbRows(){ let r=[...DB];
 if(joined('GLOWLAB')) r.unshift({id:'me', h:ST.me.handle||'@ploy.skin.th', nm:ST.me.name,
  sns:ST.me.sns==='instagram'?'ig':'tt', fol:'12K', eng:'6.4%', ctry:'TH', g:'A', cell:'TH-1',
  st:'joined', comp:'—', ltv:ST.earnExport?20000:0, last:'방금', bill:1, tags:['신규'],
  memo:'방금 셀 가입 · 첫 인사 발송함',
  tl:[['방금',(ST.me.sns==='instagram'?'IG':'TIKTOK')+'_VERIFIED','OAuth · 공개 필드 6개'],['방금','CELL_JOINED','TH-1 배정']]});
 const q=ST.dbQ.toLowerCase();
 if(q) r=r.filter(x=>x.h.toLowerCase().includes(q)||x.nm.toLowerCase().includes(q)||x.tags.join(' ').includes(q));
 if(ST.dbSeg==='nobill') r=r.filter(x=>!x.bill);
 else if(ST.dbSeg!=='all') r=r.filter(x=>x.st===ST.dbSeg);
 return r; }
function dbCount(k){ if(k==='all') return DB.length+(joined('GLOWLAB')?1:0);
 if(k==='nobill') return DB.filter(x=>!x.bill).length;
 return DB.filter(x=>x.st===k).length+((k==='joined'&&joined('GLOWLAB'))?1:0); }
const STL={active:['활성','ok'],joined:['신규 가입','ok'],invited:['초대됨','nt'],dormant:['휴면','wt'],churn:['이탈','bd']};
function dbFind(id){ return dbRows().find(x=>x.id===id)||dbRows()[0]; }
function dbExport(){ toast('내보내기는 게이트입니다','핸들·성과 필드만이면 바로 CSV가 됩니다. <b>연락처·주소가 포함되면 PII 게이트</b>로 올라가요 — 승인함에서 결정하세요.','brand','gates'); }
function dbView(){
 const rows=dbRows(); const sel=dbFind(ST.dbSel);
 return `<div class="dbw">
  <div class="dbmain">
   <div class="dbbar">
    <div class="dbsegs">${DBSEG.map(x=>`<span class="${ST.dbSeg===x[0]?'on':''}"
      onclick="ST.dbSeg='${x[0]}';render()">${x[1]} <b>${dbCount(x[0])}</b></span>`).join('')}</div>
    <input class="dbq" placeholder="핸들 · 이름 · 태그 검색" value="${ST.dbQ}"
      oninput="ST.dbQ=this.value;render();document.querySelector('.dbq').focus()">
    <button class="btn line" style="font-size:10.6px" onclick="dbExport()">CSV 내보내기</button>
   </div>
   <div class="dbhy">
    <span>중복 병합 <b>3건</b> · 이번 주</span><span>본인 수정 반영 <b>실시간</b> · 앱 → DB</span><span>SNS 재검증 대기 <b>4명</b> · 90일 주기</span>
    <span>필드 파기 예약 <b>42건</b> · 캠페인 종료 +30일</span><span class="ok3">무결성 검사 통과 · 오늘 06:00</span>
   </div>
   <table class="dbt"><tr><th>크리에이터</th><th style="width:56px">계정</th><th style="width:64px">팔로워</th>
    <th style="width:44px">등급</th><th style="width:56px">셀</th><th style="width:78px">상태</th>
    <th style="width:64px">완주율</th><th style="width:86px">누적 분배</th><th style="width:74px">최근 활동</th></tr>
   ${rows.map(r=>`<tr class="${ST.dbSel===r.id?'sel':''}" onclick="ST.dbSel='${r.id}';render()">
     <td><b>${r.h}</b><div class="sub2">${r.nm} · ${r.ctry}</div></td>
     <td><span class="snsb ${r.sns}">${r.sns==='tt'?'TikTok':'IG'}</span></td>
     <td class="mono">${r.fol}</td><td><span class="gd ${r.g}">${r.g}</span></td>
     <td class="mono" style="font-size:10.4px">${r.cell}</td>
     <td><span class="chip ${STL[r.st][1]}" style="font-size:9px">${STL[r.st][0]}</span>${r.bill?'':'<div class="sub2">과금 제외</div>'}</td>
     <td class="mono">${r.comp}</td><td class="mono">${r.ltv?'₩'+r.ltv.toLocaleString():'—'}</td>
     <td style="font-size:10.4px;color:var(--n600)">${r.last}</td></tr>`).join('')}
   ${rows.length?'':'<tr><td colspan="9" style="text-align:center;color:var(--n400);padding:22px">검색 결과가 없습니다</td></tr>'}
   </table>
   ${NOTE('이 DB의 모든 행은 <b>본인 SNS 계정 OAuth</b>로 시작됐습니다. 수기 입력 행이 없어서 <b>가짜·중복이 구조적으로 안 생깁니다.</b> 등급·상태는 아리가 갱신하고, 근거는 전부 원장에 있어요.')}
  </div>
  <div class="dbside">
   <div class="dph"><div class="a av" style="width:38px;height:38px"></div>
    <div><div class="dpn">${sel.h}</div><div class="sub2">${sel.nm} · ${sel.ctry} · ${sel.cell}</div></div>
    <span class="gd ${sel.g}" style="margin-left:auto">${sel.g}</span></div>
   <div class="dsec">검증된 계정 <span class="h2">공개 API · 90일마다 재검증</span></div>
   <div class="dkv"><span>${sel.sns==='tt'?'TikTok':'Instagram'}</span><b>${sel.h} · OAuth</b></div>
   <div class="dkv"><span>팔로워 / 인게이지</span><b>${sel.fol} / ${sel.eng}</b></div>
   <div class="dkv"><span>마지막 재검증</span><b>3일 전 · 정상</b></div>
   <div class="dsec">여정 <span class="h2">전부 원장 이벤트</span></div>
   ${sel.tl.map(t=>`<div class="dtl"><span class="tm2">${t[0]}</span>
     <div><b class="mono" style="font-size:9.6px">${t[1]}</b><div class="sub2">${t[2]}</div></div></div>`).join('')}
   <div class="dsec">보유 필드와 근거 <span class="h2">필드마다 어느 동의로 갖고 있는지</span></div>
   <div class="dkv"><span>핸들 · 국가 · 공개 지표</span><b>가입 동의</b></div>
   <div class="dkv"><span>배송 주소</span><b>${sel.id==='me'?ST.profile.addr+' · <span style="color:var(--s700)">본인 갱신 '+ST.profile.addrAt+'</span>':'캠페인 동의 · <span style="color:var(--c500)">종료 +30일 파기</span>'}</b></div>
   ${sel.id==='me'?`<div class="dkv"><span>피부 타입</span><b>${ST.profile.skin} · 매칭에 사용</b></div>`:''}
   <div class="dkv"><span>정산 계좌</span><b>정산 동의 · 마스킹 보관</b></div>
   <div class="dkv"><span>타 브랜드 완주 이력</span><b>${sel.id==='me'&&!ST.me.consents[3]?'<span style="color:var(--c500)">동의 없음 · 참조 불가</span>':'교차 참조 동의'}</b></div>
   <div class="dsec">아리 메모</div>
   <div class="dmemo">${sel.memo}</div>
   <div style="display:flex;gap:6px;margin-top:10px">
    <button class="btn soft" style="flex:1;font-size:10.6px" onclick="ST.b='cells';render()">셀에서 보기</button>
    <button class="btn line" style="flex:1;font-size:10.6px" onclick="toast('연락처 요청','이 사람의 연락처는 <b>PII 게이트</b>를 거쳐야 열립니다.','brand','gates')">연락처 요청</button>
   </div>
  </div>
 </div>`;
}

/* ============================================================ 발굴 · 수집 에이전트 */
const CHAN={
 tkshop:{nm:'틱톡샵 아웃바운드', ic:'◆', wk:38, cv:'41%', cac:'₩1,900',
  own:'초대권이 하루 20장뿐이라 <b>배분</b>이 전부입니다. 이건 우리 완주 데이터가 있어야 풀립니다.'},
 comm:{nm:'커뮤니티 씨딩', ic:'◇', wk:33, cv:'34%', cac:'₩900',
  own:'커뮤니티마다 <b>통한 문구 / 잘린 문구</b>가 쌓여 있습니다. 처음 들어가는 브랜드는 이걸 못 삽니다.'},
 email:{nm:'메일 리서치 · 발송', ic:'✉', wk:18, cv:'11%', cac:'₩4,200',
  own:'노가다는 발송이 아니라 <b>공개 메일 찾기</b>입니다. 그걸 대신합니다.'},
 igdm:{nm:'인스타 DM', ic:'◑', wk:26, cv:'19%', cac:'₩2,600',
  own:'반응 있던 계정만. 상한을 지키는 게 실력입니다.'},
 inbound:{nm:'인바운드 판정', ic:'▤', wk:41, cv:'62%', cac:'₩0',
  own:'폼이 들어온 <b>90초 안에</b> 판정하고 답합니다. 사람은 이 속도가 안 나옵니다.'},
 api:{nm:'소싱 스윕', ic:'⌗', wk:57, cv:'8%', cac:'₩1,100',
  own:'양은 많고 질은 낮습니다. 절반을 <b>버리는 판단</b>이 이 채널의 값어치예요.'},
 ref:{nm:'리퍼럴 운영', ic:'◍', wk:14, cv:'71%', cac:'₩1,500',
  own:'셀을 운영하는 쪽만 쓸 수 있는 채널입니다. <b>남이 복제 못 합니다.</b>'},
 clean:{nm:'재접촉 · 정리', ic:'⊘', wk:0, cv:'—', cac:'—',
  own:'무응답 정리 · 90일 금지 · 수신거부 전파. <b>아무도 하기 싫어하는 일</b>이라 사람이 하면 안 합니다.'},
};
const COMMS={
 cafe:{nm:'네이버 카페 · 화장품 리뷰', mem:'12.4만명', rule:'홍보 게시판만 · 주 1회', got:9, risk:'낮음',
  win:'"체험단"이라 쓰면 반응 없음 → <b>"30명만"</b>으로 바꾼 뒤 유입 2.4배', ban:'링크 2개 이상이면 자동 숨김 처리됨'},
 dc:{nm:'Discord · K-Beauty TH', mem:'3,100명', rule:'#collab 채널 · 봇 금지 · 사람 계정만', got:14, risk:'중간',
  win:'영어보다 <b>태국어 먼저</b>, 영어는 괄호 안. 운영자가 이걸 좋아함', ban:'초대 링크 붙이면 즉시 삭제 — DM 유도만 허용'},
 tg:{nm:'Telegram · BKK Creators', mem:'890명', rule:'운영자 사전 승인 필요', got:6, risk:'낮음',
  win:'운영자에게 먼저 DM → 승인 뒤 게시. <b>승인 없이 올린 브랜드는 영구 차단</b>됨', ban:'—'},
 rd:{nm:'r/AsianBeauty', mem:'180만명', rule:'자기홍보 10% 룰 · 플레어 필수', got:11, risk:'높음',
  win:'Disclosure 첫 줄에 없으면 <b>1시간 안에 삭제</b>. 댓글 응대하면 상단 고정됨', ban:'지난 3월 플레어 누락으로 <b>7일 정지</b> 받음 — 그 뒤 체크리스트 추가'},
 fb:{nm:'Facebook 그룹 · TH Skincare', mem:'2.7만명', rule:'금요일만 홍보 허용', got:8, risk:'중간',
  win:'사진 1장 + 3줄이 가장 반응 좋음. 긴 글은 접힘', ban:'금요일 외 게시 2회면 그룹 제명'},
};
function weekIn(){ let n=0; for(const k in CHAN) if(ST.ch[k]&&ST.ch[k].on) n+=CHAN[k].wk;
 n+=ST.pastedN+(ST.swept?9:0);
 for(const k in ST.seeded) if(ST.seeded[k]==='ok') n+=COMMS[k].got;
 return n; }
function agOn(k){ return ST.ch[k]?ST.ch[k].on:1; }
function toggleCh(k){ if(!ST.ch[k]) ST.ch[k]={on:1,lv:1}; ST.ch[k].on=ST.ch[k].on?0:1;
 const on=ST.ch[k].on;
 const m={ clean:on?'정리 담당을 다시 세웠습니다.':'껐습니다 — <b>이건 끄지 마세요.</b> 수신거부 전파가 멈추면 법적으로 위험합니다.',
   email:on?'메일 담당을 세웠습니다. 리서치는 돌지만 <b>발송은 여전히 승인</b>입니다.'
           :'껐습니다. 진행 중이던 시퀀스는 <b>다음 단계부터 멈춥니다</b> — 이미 나간 메일은 되돌릴 수 없어요.',
   comm:on?'커뮤니티 담당을 세웠습니다. 5곳 규칙을 다시 읽고 <b>초안만</b> 만들어 두겠습니다.':'껐습니다. 예약된 게시 3건을 취소했어요.',
   tkshop:on?'틱톡샵 담당을 세웠습니다. 오늘 초대권부터 배분합니다.':'껐습니다. <b>오늘 초대권 8장은 그냥 소멸합니다</b> — 이월이 안 돼요.',
   inbound:on?'인바운드 판정을 다시 켰습니다.':'껐습니다 — <b>권하지 않습니다.</b> 폼이 들어와도 아무도 답을 안 합니다.'
  }[k] || (on?`<b>${CHAN[k].nm}</b> 담당을 세웠습니다.`:`<b>${CHAN[k].nm}</b>을 정지했습니다. 이번 주 ${CHAN[k].wk}명을 데려오던 자리예요.`);
 toast(on?'근무 시작':'정지', m); render(); }
function setLv(k,v){
 if(k==='clean'&&v<2){ toast('내릴 수 없습니다','수신거부 전파와 90일 금지는 <b>사람이 승인할 종류의 일이 아닙니다.</b> 항상 자동입니다.'); return; }
 if(!ST.ch[k]) ST.ch[k]={on:1,lv:1}; ST.ch[k].lv=v;
 toast('자율 등급 변경', v===2?`<b>${CHAN[k].nm} · L2</b> — 규칙 안에서 제가 알아서 돌리고 브리핑에만 적습니다.`
  : v===1?`<b>${CHAN[k].nm} · L1</b> — 초안까지 만들고 <b>발송은 승인</b>받습니다.`
  : `<b>${CHAN[k].nm} · L0</b> — 제안만 하고 아무것도 실행하지 않습니다.`); render(); }


/* ---------- 에이전트별 운영 설계 ---------- */
const AGSPEC={
 tkshop:{goal:'초대권 20장을 <b>기대 완주 최상위</b>에게만 배분', kpi:'수락률 45%↑ · 14일 게시율 60%↑ · 초대권 소진율 100%',
  inp:'틱톡샵 파트너 API(카테고리 셀러 목록·GMV) · 우리 완주 이력 · 협찬 비율',
  rules:['팔로워 수는 가중치 0.12 — <b>게시 습관이 우선</b>','타 브랜드 셀에서 미게시 이력 있으면 제외','문구는 최근 영상 1편을 실제로 보고 한 줄 개인화'],
  sched:'매일 08:30 스크리닝 → 09:30 배분안 → 승인 후 발송 · 초대권 리셋 09:00',
  fail:'수락률 3일 연속 30% 미만이면 <b>배분 중단하고 원인 보고</b> — 문구·타깃·시즌 중 무엇인지'},
 comm:{goal:'커뮤니티 5곳에서 <b>밴 0건</b>으로 월 40명 유입', kpi:'유입 30명/월↑ · 밴 0 · 게시당 DM 8건↑',
  inp:'커뮤니티별 규범 메모리(v버전) · 지난 게시 반응 로그 · 커뮤니티 규칙 원문',
  rules:['게시 전 규칙 재독 — 충돌하면 <b>올리지 않고 보고</b>','커뮤니티당 주 1회 상한 고정','같은 글 복붙 금지 — 방마다 다시 씀'],
  sched:'월 캘린더 편성 → 요일별 초안 → 게시는 전부 승인 · 게시 후 2시간 댓글 응대',
  fail:'삭제·경고 1회라도 받으면 그 방 <b>30일 게시 중단</b> + 규범 메모리에 사례 기록'},
 email:{goal:'공개 메일 리서치로 <b>대형 크리에이터</b> 접점 확보', kpi:'유효 메일 확보율 35%↑ · 회신율 8%↑ · 스팸 신고 0',
  inp:'공개 bio·링크트리 · 발송 이력(90일 금지 목록) · 도메인 평판 점수',
  rules:['비공개 메일 추정·수집 금지 — <b>공개된 것만</b>','시퀀스 3단 넘게 안 보냄','수신거부는 즉시 전 채널 전파'],
  sched:'주 2회 리서치 스윕 → 초안 → OUTBOUND 게이트 → 회신 분류는 실시간',
  fail:'스팸 점수 3.0 넘으면 발송 자동 중단 · 반송률 5% 넘으면 리스트 재검증'},
 igdm:{goal:'반응 있던 계정만 골라 <b>계정 안전하게</b> DM 전환', kpi:'전환 18%↑ · 일 30건 상한 준수 100%',
  inp:'최근 30일 댓글·저장 반응 계정 · 우리 계정 상태 지표',
  rules:['우리 게시물에 반응한 적 없는 계정에는 <b>먼저 DM하지 않음</b>','같은 사람 재발송 금지','상한 도달 시 무조건 내일로'],
  sched:'매일 10:00 발송 · 회신은 실시간 분류',
  fail:'계정 경고 감지 시 <b>7일 전면 중단</b> — 상한을 절반으로 재시작'},
 inbound:{goal:'폼 유입을 <b>90초 안에</b> 판정·회신', kpi:'평균 응답 74초 유지 · 판정 정확도(이의 제기율 2%↓)',
  inp:'지원 폼 4개 항목 · SNS 공개 프로필 · 4축 판정 엔진',
  rules:['탈락도 <b>즉시 정중히 회신</b> — 무응답으로 두지 않음','판정 근거는 전부 원장에','애매하면 사람 검토로 올림'],
  sched:'상시 · 폼 유입 즉시',
  fail:'이의 제기가 월 3건 넘으면 판정 기준 재보정 세션 요청'},
 api:{goal:'조회 API로 후보를 <b>넓게 긁고 절반을 버림</b>', kpi:'주간 후보 50명↑ · 판정 통과율 40~55% 유지',
  inp:'해시태그·경쟁사 언급·지역 조건 · 공개 프로필만',
  rules:['스크래핑 금지 — <b>공식 조회 API만</b>','주 1회 스윕, 같은 사람 재수집 안 함','통과율이 60% 넘으면 그물이 좁은 것 — 조건 완화 제안'],
  sched:'매주 월 09:00 스윕 → 판정 → 큐 적재',
  fail:'API 쿼터 초과 시 다음 주로 이월 — 무리하게 우회하지 않음'},
 ref:{goal:'셀 멤버의 초대를 <b>보상 사기 없이</b> 운영', kpi:'리퍼럴 월 15명↑ · 완주율 85%↑ 유지',
  inp:'멤버별 초대 코드 · 피초대자 첫 제출 여부 · 기기 지문',
  rules:['보상은 피초대자가 <b>첫 제출을 끝내야</b> 지급','자기 초대·중복 계정은 기기 지문으로 차단','지급은 항상 승인'],
  sched:'상시 추적 · 지급 제안은 주 1회 묶음',
  fail:'같은 기기에서 3계정 이상 감지 시 해당 코드 정지 + 보고'},
 clean:{goal:'명단을 <b>법적으로 깨끗하게</b> 유지', kpi:'수신거부 전파 지연 0건 · 90일 금지 위반 0건',
  inp:'수신거부 이벤트 · 시퀀스 종료 목록 · 동의 철회 이벤트',
  rules:['수신거부는 <b>전 채널 즉시</b> — DM도 안 감','시퀀스 종료 후 90일 재접촉 금지, 채널 우회도 금지','철회 시 참조 즉시 절단 + 캐시 파기'],
  sched:'매 정시 · 자동(L2 고정 — 내릴 수 없음)',
  fail:'전파 실패 감지 시 <b>모든 발송 에이전트 일시 정지</b> 후 복구'},
};
function agSpec(k){ const p=AGSPEC[k]; if(!p) return '';
 return `<div class="agsp">
  <div class="sr"><span>목표</span><div>${p.goal}</div></div>
  <div class="sr"><span>KPI</span><div>${p.kpi}</div></div>
  <div class="sr"><span>입력</span><div>${p.inp}</div></div>
  <div class="sr"><span>판단 규칙</span><div>${p.rules.map(r=>`· ${r}`).join('<br>')}</div></div>
  <div class="sr"><span>스케줄</span><div>${p.sched}</div></div>
  <div class="sr"><span>실패 시</span><div>${p.fail}</div></div>
 </div>`; }

/* ---------- 오늘의 근무 ---------- */
function AGENTS(){ return [
 {k:'tkshop', tab:'tkshop', st:agOn('tkshop')?'work':'off',
  now:'선케어 카테고리 <b>47명</b> 스크리닝 → 초대권 배분안 작성 중', pct:64,
  q:['초대권', `${ST.tk.used} / ${ST.tk.cap}장`, '09:00 리셋 · 이월 없음'],
  did:23, didnt:11, next:'상위 8명 배분안 → <b>승인 대기</b>', gate:'발송 = 승인',
  hand:'6시간 / 주'},
 {k:'comm', tab:'comm', st:agOn('comm')?'work':'off',
  now:'커뮤니티 <b>5곳</b> 규칙 재확인 · 레딧 플레어 체크리스트 통과', pct:80,
  q:['게시 슬롯', `${Object.values(ST.seeded).filter(v=>v==='ok').length} / 5곳`, '커뮤니티당 주 1회'],
  did:5, didnt:2, next:'카페 · 디스코드 초안 <b>승인 대기</b>', gate:'게시 = 승인',
  hand:'3시간 / 주'},
 {k:'email', tab:'mail', st:agOn('email')?'work':'off',
  now:'공개 비즈니스 메일 <b>212개 프로필에서 80건</b> 확보 · 유효성 검증 완료', pct:100,
  q:['일일 상한', `0 / ${ST.mail.daily}건`, '도메인 평판 보호'],
  did:80, didnt:132, next:'1차 발송 <b>승인 대기</b>', gate:'OUTBOUND 게이트',
  hand:'8시간 / 주'},
 {k:'inbound', tab:'judge', st:agOn('inbound')?'work':'off',
  now:'폼 유입 <b>41건</b> 전부 90초 내 판정 · 자동 회신 완료', pct:100,
  q:['응답 시간', '평균 74초', '사람은 평균 11시간'],
  did:41, didnt:0, next:'통과 26명 <b>큐에 적재됨</b>', gate:'없음 · L2 자동',
  hand:'4시간 / 주'},
 {k:'igdm', tab:null, st:agOn('igdm')?'work':'off',
  now:'최근 30일 <b>댓글·저장 반응 계정</b>만 추출 · 26건 발송', pct:87,
  q:['일일 상한', '26 / 30건', '넘기면 계정 잠김'],
  did:26, didnt:64, next:'내일 09:00 재개', gate:'상한 자동 준수',
  hand:'3시간 / 주'},
 {k:'api', tab:'judge', st:agOn('api')?'work':'off',
  now:ST.swept?'이번 주 스윕 완료 · <b>57 → 9명</b>':'해시태그 · 경쟁사 언급 스윕 <b>대기 중</b>', pct:ST.swept?100:0,
  q:['스윕', ST.swept?'1 / 1회':'0 / 1회', '주 1회 · 중복 재수집 금지'],
  did:ST.swept?9:0, didnt:ST.swept?48:0, next:ST.swept?'다음 월요일 09:00':'수집 탭에서 실행', gate:'공개 데이터만',
  hand:'5시간 / 주'},
 {k:'ref', tab:null, st:agOn('ref')?'work':'off',
  now:'셀 멤버 <b>4명</b>의 초대 코드 추적 · 보상 조건 충족 여부 감시', pct:100,
  q:['보상 대기', '2 / 14건', '첫 제출 완료 시 지급'],
  did:14, didnt:0, next:'보상 2건 <b>정산에 반영</b>', gate:'지급 = 승인',
  hand:'2시간 / 주'},
 {k:'clean', tab:null, st:agOn('clean')?'work':'off',
  now:'무응답 <b>61명</b> 정리 · 수신거부 <b>3건</b> 전 채널 전파 · 90일 금지 목록 갱신', pct:100,
  q:['전파', '3 / 3건', '누락 시 법적 위험'],
  did:64, didnt:0, next:'상시 · 매 정시', gate:'없음 · 항상 자동',
  hand:'5시간 / 주'},
];}
function handTotal(){ return AGENTS().filter(a=>a.st==='work')
 .reduce((n,a)=>n+parseInt(a.hand),0); }

/* ---------- 틱톡샵 아웃바운드 ---------- */
const TKR=[
 ['@fahbeauty','선케어','₩4.2M','14편','수락','높음 · 우리 셀 2곳 완주',92,1,''],
 ['@june.care','스킨케어','₩11.8M','9편','수락','높음 · 검수 1회 통과',89,1,''],
 ['@mild.th','선케어','₩0.9M','21편','미정','중간 · 신규',81,1,'실적은 작지만 <b>게시 빈도가 최상위</b>'],
 ['@bkk.skin','스킨케어','₩2.1M','11편','수락','중간',77,1,''],
 ['@nira.beauty','메이크업','₩6.4M','6편','수락','중간 · 카테고리 인접',71,1,''],
 ['@ploy.daily','선케어','₩1.4M','8편','미정','중간',68,1,''],
 ['@tan.skincare','스킨케어','₩3.0M','5편','수락','낮음 · 데이터 없음',61,1,''],
 ['@may.glow','선케어','₩0.7M','12편','미정','낮음 · 데이터 없음',58,1,''],
];
const TKNO=[
 ['@siri.glow','GMV 상위 3%','다른 브랜드 셀에서 <b>샘플 받고 21일 미게시.</b> 초대권 한 장이 아깝습니다.'],
 ['@beauty.mall.th','커머스 실적 최상위','리셀러 계정입니다. <b>본인 콘텐츠가 없어서</b> 셀에 들어와도 할 게 없어요.'],
 ['@nokk.review','팔로워 84K','경쟁사 <b>전속 표기</b>를 프로필에서 확인했습니다. 보내도 수락이 안 됩니다.'],
 ['@glow.diary','팔로워 28K','최근 광고 표기 비율 <b>61%</b>. 초대는 하되 <b>과금 제외</b>로 표시했습니다.'],
];
function tkSend(){ if(ST.tk.sent){ toast('오늘 몫은 끝났습니다','초대권은 <b>09:00에 리셋</b>됩니다. 이월이 안 돼서 남기면 소멸이에요.'); return; }
 const n=ST.tk.cap-ST.tk.used; ST.tk.sent=true; ST.tk.used=ST.tk.cap; ST.queue.cand+=3;
 ST.ledger.push(['방금','TIKTOK_INVITE_SENT',`선케어 · 초대권 ${n}장 · 기대 완주 상위 ${n}명`,'—','b3f1…7a29']);
 toast('연결됨 · 후보 큐',`남은 <b>${n}장</b>을 상위 8명에게 배분했습니다. 수락 예상 <b>3~4명</b>이고 후보 큐로 들어갑니다.`,'brand','cells'); render(); }
function tkLearn(){ if(ST.learn){ toast('이미 적용했습니다','다음 재학습은 <b>다음 주 월요일</b>입니다.'); return; }
 ST.learn=true;
 ST.ledger.push(['방금','WEIGHT_UPDATED','follower 0.30→0.12 · post_freq 0.15→0.28','—','9c04…3e11']);
 toast('가중치 변경됨','오늘 배분부터 적용됩니다. <b>팔로워가 큰 사람이 뒤로 밀립니다</b> — 지난 30일 결과가 그렇게 나왔어요.'); render(); }

/* ---------- 나머지 액션 ---------- */
function mailSeq(i){ ST.mail.seq[i]=ST.mail.seq[i]?0:1;
 toast('시퀀스 변경', ST.mail.seq[i]
  ?`${['첫 접촉','3일 리마인드','7일 마지막'][i]} 단계를 켰습니다.`
  :`${['첫 접촉','3일 리마인드','7일 마지막'][i]} 단계를 껐습니다. ${i===0?'<b>첫 접촉이 없으면 시퀀스가 돌지 않습니다.</b>':'회신율이 떨어집니다 — 2단계에서 오는 회신이 전체의 <b>38%</b>예요.'}`); render(); }
function mailGate(v){ ST.mail.gate=v;
 if(v==='ok'){ ST.queue.cand+=6;
  ST.ledger.push(['방금','OUTBOUND_SENT','이메일 1차 80건 · 태국어 · unsub 포함','—','7b21…4e90']);
  toast('연결됨 · 후보 큐','80건 발송했습니다. 회신 <b>6건</b>이 후보 큐로 들어갔어요 — 셀 충원 탭에서 보입니다.','brand','cells'); }
 else toast('보류됨','발송하지 않았습니다. <b>메일함으로 나간 게 없습니다.</b>');
 render(); }
function runSweep(){ if(ST.swept){ toast('이미 돌렸습니다','스윕은 <b>주 1회</b>입니다. 같은 사람을 반복해서 긁지 않으려고요.'); return; }
 ST.swept=true; ST.queue.cand+=9;
 ST.ledger.push(['방금','SOURCE_SWEEP','조회 API · 후보 57 → 판정 통과 9','—','d4a1…2c77']);
 toast('연결됨 · 후보 큐','공개 프로필 <b>57개</b>를 훑어서 <b>9명</b>만 남겼습니다. 48명은 4축에서 떨어졌어요.','brand','cells'); render(); }
function doPaste(){ const el=document.getElementById('pst'); if(!el) return;
 const lines=el.value.split(/[\s,\n]+/).filter(x=>x.trim().length>2);
 if(!lines.length){ toast('붙여넣을 게 없습니다','핸들이나 프로필 링크를 줄바꿈으로 붙여넣으시면 제가 판정합니다.'); return; }
 const uniq=[...new Set(lines)], dup=lines.length-uniq.length;
 const pass=Math.max(1,Math.round(uniq.length*0.7)), ex=uniq.length-pass;
 ST.pastedN+=uniq.length; ST.queue.cand+=pass; el.value='';
 ST.ledger.push(['방금','SOURCE_PASTE',`붙여넣기 ${lines.length}건 → 중복 ${dup} · 통과 ${pass} · 제외 ${ex}`,'—','f902…11ab']);
 toast('연결됨 · 후보 큐',`${lines.length}건 받았습니다. 중복 <b>${dup}건</b> 제거하고 <b>${pass}명</b>을 큐에 넣었어요. ${ex?`<b>${ex}명</b>은 협찬 과다로 과금 제외 표시했습니다.`:''}`,'brand','cells');
 render(); }
function seedPost(k,v){
 if(v==='req'){ ST.seeded[k]='req';
  toast('승인함으로 올렸습니다',`<b>${COMMS[k].nm}</b> 공고 초안을 썼습니다. 공개 게시는 <b>게이트</b>라 승인 전에는 나가지 않습니다.`); }
 else if(v==='ok'){ ST.seeded[k]='ok'; ST.queue.cand+=Math.round(COMMS[k].got/3);
  ST.ledger.push(['방금','COMMUNITY_POST',`${COMMS[k].nm} · 규칙 준수 확인`,'—','5e77…9d02']);
  toast('게시됨',`올렸습니다. 이 커뮤니티는 지난달 <b>${COMMS[k].got}명</b>을 데려왔어요. 다음 게시는 규칙상 <b>일주일 뒤</b>입니다.`); }
 render(); }


/* ---------- 기술 스택 액션 ---------- */
function doGrade(){ if(ST.tech.graded){ toast('이미 채점했습니다','다음 채점은 <b>매주 월요일 06:00</b> 자동입니다.'); return; }
 ST.tech.graded=true;
 ST.ledger.push(['방금','EVAL_RUN','지난주 예측 31건 채점 · brier 0.19→0.16','—','e881…4c02']);
 ST.ledger.push(['방금','WEIGHT_UPDATED','our_completion_history 0.34 → 0.37','—','a2f4…9b18']);
 toast('채점 완료','지난주 예측 <b>31건</b>을 실제 결과로 채점했습니다. 맞은 확신은 키우고 틀린 확신은 줄였어요 — <b>가중치 1건 변경</b>이 원장에 남았습니다.');
 render(); }
function doRevoke(){ if(ST.tech.revoked){ toast('이미 시연했습니다','실제 철회는 크리에이터 앱 · 내 패스 · 동의 관리에서 합니다.'); return; }
 ST.tech.revoked=true;
 ST.ledger.push(['방금','CONSENT_REVOKED','데모 계정 · cross_brand_reference=false','—','c7d3…0e55']);
 ST.ledger.push(['방금','REFERENCE_SEVERED','브랜드 7곳 조회 경로 차단 · 캐시 파기','—','1b09…8fa6']);
 toast('철회 전파 완료','철회 즉시 <b>브랜드 7곳의 조회 경로가 끊기고 캐시가 파기</b>됐습니다. 걸린 시간 0.4초 — 이게 되니까 이 데이터를 들고 있을 자격이 생깁니다.');
 render(); }

/* ============================================================ 발굴 캔버스 */
function srcView(){
 const T=ST.srcTab; let body='';

 if(T==='agents'){
  const A=AGENTS(), onN=A.filter(a=>a.st==='work').length;
  body=`<div class="sect2"><h3>오늘의 근무</h3>
   <span class="h2">이 8명이 원래는 사람이 하던 일입니다 — 지금 무엇을 하고 있는지</span></div>
  <div class="funnel" style="grid-template-columns:repeat(4,1fr)">
   <div class="fs hot"><div class="l">대체한 손 시간</div><div class="v">${handTotal()}h</div>
    <div class="d">주당 · 담당자 <b>0.6명</b>어치</div></div>
   <div class="fs"><div class="l">근무 중</div><div class="v">${onN} / 8</div>
    <div class="d">정지 ${8-onN}명</div></div>
   <div class="fs"><div class="l">오늘 내린 판단</div><div class="v">${A.reduce((n,a)=>n+(a.st==='work'?a.did:0),0)}</div>
    <div class="d">전부 원장에 근거 기록</div></div>
   <div class="fs"><div class="l">안 한 판단</div><div class="v">${A.reduce((n,a)=>n+(a.st==='work'?a.didnt:0),0)}</div>
    <div class="d"><b>보낼 수 있었지만 안 보낸 것</b></div></div>
  </div>
  ${A.map(a=>{ const c=CHAN[a.k], s=ST.ch[a.k]||{on:1,lv:1};
   return `<div class="ag ${a.st==='work'?'':'stop'}">
    <div class="agh"><div class="ic">${c.ic}</div>
     <div><div class="nm2">${c.nm}</div>
      <div class="sub">${a.st==='work'?'<span class="dot"></span>근무 중':'정지됨'} · 대체 <b>${a.hand}</b></div></div>
     <div class="lvs">${[0,1,2].map(v=>`<span class="${s.lv===v?'on':''}" onclick="setLv('${a.k}',${v})">L${v}</span>`).join('')}</div>
     <div class="sw2 ${s.on?'on':''}" onclick="toggleCh('${a.k}')"><i></i></div></div>
    ${a.st==='work'?`
    <div class="agn">지금 — ${a.now}</div>
    <div class="prog"><i style="width:${a.pct}%"></i></div>
    <div class="agr">
     <div><div class="k">${a.q[0]}</div><div class="v3">${a.q[1]}</div><div class="k2">${a.q[2]}</div></div>
     <div><div class="k">한 것 / 안 한 것</div><div class="v3">${a.did} <span style="color:var(--n400)">/</span> ${a.didnt}</div>
      <div class="k2">안 한 쪽이 실력입니다</div></div>
     <div><div class="k">다음</div><div class="v3" style="font-size:11.4px;font-weight:700">${a.next}</div>
      <div class="k2">게이트: ${a.gate}</div></div>
    </div>
    <div class="agw">우리만 되는 이유 — ${c.own}</div>
    <div style="display:flex;gap:6px;margin-top:9px">
     ${a.tab?`<button class="btn soft" style="font-size:10.6px;padding:6px 12px"
       onclick="ST.srcTab='${a.tab}';render()">작업 열기 →</button>`:''}
     <button class="btn line" style="font-size:10.6px;padding:6px 12px"
       onclick="ST.agOpen=ST.agOpen==='${a.k}'?null:'${a.k}';render()">${ST.agOpen===a.k?'기획 닫기':'운영 설계 보기'}</button></div>
    ${ST.agOpen===a.k?agSpec(a.k):''}`
    :`<div class="agn" style="color:var(--c500)">정지됨 — 이 자리의 일은 <b>아무도 하지 않습니다.</b> ${c.nm}로 들어오던 주 ${c.wk}명이 사라집니다.</div>`}
   </div>`}).join('')}
  ${NOTE('에이전트는 <b>기능이 아니라 담당자</b>입니다. 각자 맡은 목표가 있고, 스스로 판단하고, 안 한 이유를 남기고, 결과로 다음 주 행동이 바뀝니다. 켜고 끄는 건 기능을 켜는 게 아니라 <b>그 자리를 비우는 것</b>이에요.')}`;
 }

 else if(T==='tkshop'){
  const left=ST.tk.cap-ST.tk.used;
  body=`<div class="hero">
   <div class="ht">틱톡샵 초대권은 하루 ${ST.tk.cap}장입니다</div>
   <p>메일은 무제한이라 뿌리면 됩니다. 여기는 다릅니다 — 그래서 이 담당자가 하는 일은 <b>발송이 아니라 배분</b>이에요.
   누구에게 쓸지 틀리면 그날 하루가 통째로 날아갑니다. 셀러 센터에서 사람이 하면 <b>스크리닝만 6시간</b>이 듭니다.</p></div>

  <div class="funnel" style="grid-template-columns:repeat(4,1fr)">
   <div class="fs ${left?'hot':''}"><div class="l">남은 초대권</div><div class="v">${left}</div>
    <div class="d">${ST.tk.cap}장 중 ${ST.tk.used}장 사용<br><b>이월 없음</b></div></div>
   <div class="fs"><div class="l">수락률</div><div class="v">47%</div>
    <div class="d">지난 30일 · 업계 평균 22%</div></div>
   <div class="fs"><div class="l">샘플 → 게시</div><div class="v">61%</div>
    <div class="d">14일 내 <b>실제 게시</b> 비율</div></div>
   <div class="fs"><div class="l">스크리닝</div><div class="v">47명</div>
    <div class="d">오늘 훑은 프로필</div></div>
  </div>

  <div class="sect2" style="margin-top:18px"><h3>오늘의 배분안 · 상위 8명</h3>
   <span class="h2">기대 완주율 × 카테고리 적합도로 정렬 — 팔로워 순이 아닙니다</span></div>
  <table><tr><th>크리에이터</th><th style="width:76px;white-space:nowrap">카테고리</th>
   <th style="width:80px;white-space:nowrap">30일 GMV</th><th style="width:62px;white-space:nowrap">커머스</th><th style="width:150px">완주 예측 <span style="color:var(--t700)">· 우리 데이터</span></th>
   <th style="width:48px">점수</th></tr>
  ${TKR.map(r=>`<tr><td class="mono"><b>${r[0]}</b>${r[8]?`<div style="font-size:10px;color:var(--n600);font-family:inherit;font-weight:400">${r[8]}</div>`:''}</td>
   <td style="font-size:11px;white-space:nowrap">${r[1]}</td><td class="mono" style="font-size:11px">${r[2]}</td>
   <td class="mono" style="font-size:11px">${r[3]}</td>
   <td style="font-size:11px"><b>${r[5].split(' · ')[0]}</b><span style="color:var(--n600)">${r[5].includes('·')?' · '+r[5].split(' · ')[1]:''}</span></td>
   <td class="mono"><b>${r[6]}</b></td></tr>`).join('')}
  </table>
  <div style="display:flex;gap:7px;margin:10px 0 18px">
   <button class="btn" onclick="tkSend()">${ST.tk.sent?`오늘 ${ST.tk.cap}장 전부 배분됨`:`남은 ${left}장 배분 · 승인`}</button>
   <button class="btn line" onclick="toast('개인화 문구','8명 전부 <b>다른 문구</b>입니다. 최근 올린 영상 한 편을 실제로 보고 한 줄을 씁니다 — 복붙 초대는 수락률이 9%예요.')">문구 8건 미리보기</button>
  </div>

  <div class="sect2"><h3>안 보낸 사람 · ${TKNO.length}명</h3>
   <span class="h2">지표는 좋은데 제외했습니다 — 이 판단이 초대권을 지킵니다</span></div>
  ${TKNO.map(r=>`<div class="qcand"><span class="h3 mono">${r[0]}</span>
    <span class="s3" style="width:130px">${r[1]}</span>
    <span class="s3" style="flex:2">${r[2]}</span>
    <span class="chip bd" style="font-size:9px">제외</span></div>`).join('')}

  <div class="sect2" style="margin-top:20px"><h3>학습 루프</h3>
   <span class="h2">초대 → 수락 → 샘플 → 게시 → GMV. 이 결과가 내일 배분을 바꿉니다</span></div>
  <div class="lrn ${ST.learn?'done':''}">
   <div class="lt">${ST.learn?'적용됨 · 오늘 배분부터':'지난 30일 결과에서 발견한 것'}</div>
   <p>팔로워 <b>5만 이상</b> 그룹의 14일 내 게시율이 <b>38%</b>, <b>1만 미만</b> 그룹은 <b>71%</b>였습니다.
   큰 계정이 초대는 잘 수락하는데 <b>게시를 안 합니다.</b> 초대권을 거기 쓰면 그날이 날아가요.</p>
   <div class="wt"><span>follower_weight</span><b>0.30 → 0.12</b></div>
   <div class="wt"><span>post_frequency_30d</span><b>0.15 → 0.28</b></div>
   <div class="wt"><span>our_completion_history</span><b>0.20 → 0.34</b></div>
   ${ST.learn?'<div class="lo">이 변경으로 @mild.th(팔로워 900)가 <b>3위</b>로 올라왔습니다.</div>'
    :`<button class="btn" style="margin-top:11px" onclick="tkLearn()">가중치 적용</button>`}
  </div>
  ${NOTE('정직하게 — 틱톡샵 <b>공식 파트너 API가 열어주는 범위</b> 밖은 제가 직접 못 누릅니다. 랭킹과 개인화 문구까지 만들고 실행은 셀러 계정에서 하세요. 그래도 <b>노가다의 90%는 스크리닝과 문구</b>이고, 그게 없어집니다.')}`;
 }

 else if(T==='comm'){
  body=`<div class="hero">
   <div class="ht">커뮤니티는 한 번 미움받으면 끝입니다</div>
   <p>그래서 여기서 중요한 건 게시 자동화가 아니라 <b>이 방에서 뭐가 통했고 뭐가 잘렸는지의 기록</b>입니다.
   처음 들어가는 브랜드는 이걸 돈 주고 못 삽니다 — 밴을 맞아가며 배워야 해요. 우리는 이미 맞아봤습니다.</p></div>

  <div class="sect2"><h3>커뮤니티 5곳 · 규범 메모리</h3>
   <span class="h2">각 방의 규칙 · 통한 문구 · 잘린 문구</span></div>
  ${Object.keys(COMMS).map(k=>{ const c=COMMS[k], s=ST.seeded[k];
   return `<div class="cbig">
    <div class="ch2"><div class="cn2">${c.nm}</div>
     <span class="chip ${c.risk==='높음'?'bd':c.risk==='중간'?'wt':'ok'}" style="font-size:9px">밴 위험 ${c.risk}</span>
     <span class="s4">${c.mem} · 지난달 ${c.got}명</span>
     <div style="margin-left:auto">${s==='ok'?`<span class="chip ok">게시됨</span>`
      : s==='req'?`<button class="btn" onclick="seedPost('${k}','ok')">승인 · 게시</button>`
      : `<button class="btn line" onclick="seedPost('${k}','req')">공고 초안 요청</button>`}</div></div>
    <div class="cmem"><div class="mk">규칙</div><div class="mv2">${c.rule}</div></div>
    <div class="cmem"><div class="mk ok2">통한 것</div><div class="mv2">${c.win}</div></div>
    ${c.ban!=='—'?`<div class="cmem"><div class="mk bd2">잘린 것</div><div class="mv2">${c.ban}</div></div>`:''}
   </div>`}).join('')}

  <div class="sect2" style="margin-top:20px"><h3>공고문 초안</h3>
   <span class="h2">같은 글을 복사해 돌리지 않습니다 — 위 메모리를 반영해 매번 다시 씁니다</span></div>
  <div class="mstep"><div class="day">DC</div><div class="mb">
   <div class="mt">Discord · K-Beauty TH · #collab</div>
   <div class="mp">สวัสดีค่ะ GLOWLAB จากเกาหลีค่ะ — 태국 크리에이터 크루를 모으고 있어요.
    한 방에 <b>30명까지만</b> 받고, 제품 먼저 보내드립니다. 광고 글이 아니라 <b>같이 쓰는 방</b>이에요.
    관심 있으시면 DM 주세요 — <b>링크는 규칙상 안 붙일게요.</b></div>
   <div class="mnote">메모리 반영 — 태국어 먼저(운영자 선호) · 초대 링크 제외(즉시 삭제 대상)</div></div></div>
  <div class="mstep"><div class="day">RD</div><div class="mb">
   <div class="mt">r/AsianBeauty · [Brand] 플레어</div>
   <div class="mp"><b>Disclosure: I work for GLOWLAB.</b> We're building a 30-person creator cohort in Thailand —
    products first, no posting quota. Happy to answer questions in the comments.</div>
   <div class="mnote">메모리 반영 — Disclosure 첫 줄(누락 시 1시간 내 삭제) · 플레어 체크 완료 · 게시 후 2시간 댓글 응대 예약</div></div></div>

  <div class="sect2" style="margin-top:20px"><h3>게시 뒤에 남는 일</h3>
   <span class="h2">사람이 제일 하기 싫어하는 부분 — 여기가 진짜 노가다입니다</span></div>
  <div class="rule"><div class="rl"><div class="rn">댓글 · DM 응대 큐</div>
    <div class="rd">게시하면 문의가 옵니다. <b>2시간 안에 답이 없으면</b> 반응이 절반으로 떨어져요.
     지금 대기 <b>7건</b> — 초안은 다 써뒀고 발송만 승인하시면 됩니다.</div></div>
   <div class="rc"><span class="on">대기 7건</span></div></div>
  <div class="rule"><div class="rl"><div class="rn">게시 캘린더</div>
    <div class="rd">카페 주 1회 · FB는 <b>금요일만</b> · 텔레그램은 운영자 승인 후.
     겹치지 않게 짜고 <b>규칙을 어길 날짜는 아예 제안하지 않습니다.</b></div></div>
   <div class="rc"><span class="lock">자동</span></div></div>
  <div class="rule"><div class="rl"><div class="rn">밴 리스크 감시</div>
    <div class="rd">레딧은 지난 3월 <b>7일 정지</b>를 맞았습니다. 그 뒤로 게시 전 체크리스트가 붙었고
     <b>규칙과 충돌하면 올리지 않고 보고</b>합니다.</div></div>
   <div class="rc"><span class="lock">L0 고정</span></div></div>
  ${NOTE('커뮤니티 CAC는 <b>₩900</b>으로 가장 쌉니다. 대신 제가 실수하면 그 방이 영구히 닫혀요 — 그래서 게시는 전부 여쭤봅니다.')}`;
 }

 else if(T==='mail'){
  const S=ST.mail;
  body=`<div class="hero">
   <div class="ht">메일의 노가다는 발송이 아니라 리서치입니다</div>
   <p>프로필 <b>212개</b>를 열어 공개된 비즈니스 메일을 찾고, 유효한지 확인하고, 이름·최근 게시물을 뽑아
   한 명씩 다르게 쓰는 일. 사람이 하면 주 <b>8시간</b>입니다. 발송은 그 뒤 5분이에요.</p></div>

  <div class="funnel" style="grid-template-columns:repeat(4,1fr)">
   <div class="fs"><div class="l">프로필 확인</div><div class="v">212</div><div class="d">공개 bio · 링크트리</div></div>
   <div class="fs"><div class="l">메일 확보</div><div class="v">80</div><div class="d">유효성 검증 통과</div></div>
   <div class="fs"><div class="l">제외</div><div class="v">132</div><div class="d">비공개 · 수신거부 이력</div></div>
   <div class="fs ${S.gate?'':'hot'}"><div class="l">발송</div><div class="v">${S.gate==='ok'?80:0}</div>
    <div class="d">${S.gate==='ok'?'회신 <b>6건</b>':'<b>승인 대기</b>'}</div></div>
  </div>

  <div class="sect2" style="margin-top:18px"><h3>3단 시퀀스</h3>
   <span class="h2">태국어로 다시 씀 · <span class="mv">{{변수}}</span>는 프로필에서 실제로 뽑아온 값</span></div>
  ${[['D+0','첫 접촉','สวัสดีค่ะ <span class="mv">{{name}}</span> 님, GLOWLAB입니다. <span class="mv">{{recent_post}}</span> 영상 잘 봤어요. 저희가 태국에서 <b>크리에이터 30명 크루</b>를 만들고 있는데, 제품을 먼저 보내드리고 편하게 써보시는 방식이에요. 관심 있으시면 이 링크에서 3분이면 끝납니다.'],
     ['D+3','리마인드','지난주에 드린 메일 이어서요. 부담 없이 <b>제품만 받아보셔도</b> 괜찮습니다. 지금 1번방에 <span class="mv">{{cell_count}}</span>명이 있고 촬영 팁을 주고받고 있어요.'],
     ['D+7','마지막','더 안 보낼게요. 나중에 생각나시면 이 링크는 계속 열려 있습니다. 좋은 하루 되세요.']]
   .map((m,i)=>`<div class="mstep ${S.seq[i]?'':'off'}">
    <div class="day">${m[0]}</div>
    <div class="mb"><div class="mt">${m[1]}</div><div class="mp">${m[2]}</div></div>
    <div class="sw2 ${S.seq[i]?'on':''}" onclick="mailSeq(${i})"><i></i></div></div>`).join('')}

  <div class="sect2" style="margin-top:20px"><h3>회신 자동 분류</h3>
   <span class="h2">받은 편지함을 사람이 뒤지지 않게 하는 부분</span></div>
  ${[['관심 있음','4건','후보 큐로 즉시 이동 · 자격 확인 링크 자동 발송'],
     ['거절','2건','<b>90일 재접촉 금지</b>에 등록 · 다른 채널로도 안 갑니다'],
     ['부재중 · 자동응답','9건','발송 실패로 세지 않음 · 복귀일에 재시도 예약'],
     ['수신거부','3건','<b>전 채널 즉시 제외</b> · DM도 안 갑니다']]
   .map(r=>`<div class="qcand"><span class="h3">${r[0]}</span><span class="s3" style="width:60px">${r[1]}</span>
     <span class="s3" style="flex:2">${r[2]}</span></div>`).join('')}

  <div class="sect2" style="margin-top:20px"><h3>안전장치</h3><span class="h2">도메인이 죽으면 복구가 안 됩니다</span></div>
  <div class="rule"><div class="rl"><div class="rn">일일 발송 상한</div>
    <div class="rd">하루 <b>${S.daily}건</b>까지. 새 도메인은 20건부터 <b>2주 워밍업</b>합니다.</div></div>
   <div class="rc">${[40,80,150].map(v=>`<span class="${S.daily===v?'on':''}"
     onclick="ST.mail.daily=${v};toast('발송 상한','${v}건으로 바꿨습니다.${v===150?' <b>150건은 워밍업이 끝난 도메인만</b> 권합니다.':''}');render()">${v}건</span>`).join('')}</div></div>
  <div class="rule"><div class="rl"><div class="rn">스팸 점수</div>
    <div class="rd">발송 전 초안 검사. 현재 <b>1.8 / 5.0</b> — 링크 1개, 이미지 없음, 대문자 없음.</div></div>
   <div class="rc"><span class="on" style="background:var(--s700)">안전</span></div></div>

  <div class="sect2" style="margin-top:20px"><h3>발송 대기</h3><span class="h2">밖으로 나가는 건 항상 승인입니다</span></div>
  ${S.gate==='ok'
   ? `<div class="gt done"><div class="gl" style="color:var(--s700)">발송됨</div>
      <h3>이메일 1차 — 태국 80건</h3><div class="res">80건이 나갔고 <b>회신 6건</b>이 후보 큐로 들어갔습니다.</div></div>`
   : S.gate==='no'
   ? `<div class="gt held"><div class="gl" style="color:var(--n500)">보류됨</div>
      <h3>이메일 1차 — 태국 80건</h3><div class="res">발송하지 않았습니다. 메일함으로 나간 게 없습니다.</div></div>`
   : `<div class="gt cnt"><div class="gl">GATE · OUTBOUND_DM · 외부 발송</div>
      <h3>이메일 1차 — 태국 80건</h3>
      <div class="gm">targets&nbsp;&nbsp;: <b>80 / 212</b> · 공개 비즈니스 메일<br>
       sequence : ${S.seq.filter(Boolean).length}단 · 태국어 · 개별 문구<br>
       unsub&nbsp;&nbsp;&nbsp;&nbsp;: 원클릭 포함<br>
       autopath : <u>none — 밖으로 나가는 건 항상 사람</u></div>
      <div class="why">리서치와 초안은 다 끝났습니다. <b>제 판단으로는 보낼 수 없습니다</b> — 한 번 나가면 되돌릴 수 없어서요.</div>
      <div style="display:flex;gap:7px"><button class="btn" onclick="mailGate('ok')">승인 · 80건 발송</button>
       <button class="btn line" onclick="mailGate('no')">보류</button></div></div>`}`;
 }

 else if(T==='judge'){
  body=`<div class="hero">
   <div class="ht">어디서 오든 같은 판정을 거칩니다</div>
   <p>틱톡샵이든 카페든 대표님이 붙여넣은 핸들이든, 큐에 들어가기 전에 네 가지를 봅니다.
   <b>절반을 버리는 게 이 엔진의 값어치</b>예요 — 안 버리면 배송비와 초대권이 그대로 샙니다.</p></div>

  <div class="sect2"><h3>수집 경로 · 3가지</h3><span class="h2">전부 하나의 큐로 모입니다</span></div>
  <div class="crow"><div class="cn">① 인바운드 폼</div>
   <div class="cd">받는 항목은 <b>핸들 · 국가 · 사용 제품 · 연락 수단</b> 4개뿐. 항목을 늘리면 이탈이 급증합니다.
    유입되면 <b>평균 74초 안에</b> 판정하고 답장까지 나갑니다.</div>
   <span class="chip ok">이번 주 41명</span></div>
  <div class="crow"><div class="cn">② 소싱 스윕</div>
   <div class="cd">해시태그 <b>#선쿠션 #ครีมกันแดด</b> · 경쟁사 언급 · 방콕/치앙마이 · 팔로워 500~50K.
    <b>공개 프로필만</b> 봅니다 — 스크래핑이 아닙니다.</div>
   <button class="btn ${ST.swept?'soft':''}" onclick="runSweep()">${ST.swept?'이번 주 완료':'스윕 돌리기'}</button></div>

  <div class="sect2" style="margin-top:16px"><h3>③ 붙여넣기</h3>
   <span class="h2">어디서 보셨든 넣으면 판정합니다</span></div>
  <textarea class="pst" id="pst" placeholder="@fahbeauty
@bkk.skin
https://instagram.com/june.care
@fahbeauty"></textarea>
  <div style="display:flex;gap:7px;margin:8px 0 18px">
   <button class="btn" onclick="doPaste()">판정해서 큐에 넣기</button>
   <button class="btn line" onclick="document.getElementById('pst').value='@fahbeauty\\n@bkk.skin\\nhttps://instagram.com/june.care\\n@fahbeauty\\n@mild.th\\n@glow.diary'">예시 채우기</button></div>

  <div class="sect2"><h3>4축 판정 · 실제로 무엇을 보는가</h3>
   <span class="h2">근거 신호까지 원장에 남습니다 — 나중에 왜 떨어뜨렸는지 되짚을 수 있어야 해서요</span></div>
  ${[['진짜 사람인가','팔로워 증가 곡선의 <b>계단 현상</b> · 댓글/팔로워 비율 · 댓글 언어 분포 · 계정 생성일 대비 게시 밀도',
      '팔로워 2,400인데 <b>3일 만에 1,900명 증가</b> · 댓글 언어 87% 불일치 → 탈락'],
     ['우리 제품과 맞는가','최근 30개 게시물 카테고리 분포 · 피부 타입 언급 · 촬영 환경(자연광/실내) · 사용 톤',
      '선케어 언급 <b>11회</b> · 지성 피부 명시 · 아침 루틴 포맷 반복 → 적합'],
     ['이미 협찬 과다인가','최근 90일 광고 표기 비율의 <b>추세</b>. 절대값이 아니라 방향을 봅니다',
      '광고 비율 <b>38% → 61%</b> 상승 중 → <b>과금 제외</b>, 다만 초대는 발송'],
     ['중복인가','핸들 · 이메일 · 결제 계정 · 기기 지문 크로스 매칭 + <b>다른 브랜드 셀 이력</b>',
      '@june.care = 다른 브랜드 셀 회원 · <b>재가입 아님</b> → 셀 추가 가입 경로로 전환']]
   .map((r,i)=>`<div class="jx"><div class="jn">${i+1}</div><div class="jb">
     <div class="jt">${r[0]}</div><div class="js">${r[1]}</div>
     <div class="jr"><span>실제 판정 예</span>${r[2]}</div></div></div>`).join('')}

  <div class="sect2" style="margin-top:20px"><h3>틀렸을 때</h3>
   <span class="h2">이 엔진은 완벽하지 않습니다 — 그걸 숨기지 않는 게 설계입니다</span></div>
  <div class="rule"><div class="rl"><div class="rn">오탐 되돌리기</div>
    <div class="rd">지난달 <b>3명</b>을 잘못 걸렀습니다. 크리에이터가 이의를 제기하면 <b>사람이 재검토</b>하고,
     결과는 가중치에 반영됩니다. 되돌린 기록도 원장에 남아요.</div></div>
   <div class="rc"><span class="on" style="background:var(--a700)">3건 복구</span></div></div>
  <div class="rule"><div class="rl"><div class="rn">과금 제외 ≠ 차단</div>
    <div class="rd">기준 미달이어도 <b>초대는 보내고 셀에는 들어옵니다.</b> 돈만 안 받아요.
     사람을 명단에서 지우는 판단은 제가 하지 않습니다.</div></div>
   <div class="rc"><span class="lock">고정</span></div></div>
  ${NOTE(`지금 큐에 <b>${Q().cand}명</b>이 있습니다. 여기서 바로 초대하지 않고 <b>셀 충원 탭</b>에서 방별로 나눠 보냅니다 — 한 방에 한꺼번에 넣으면 기존 멤버가 인사할 여유가 없어요.`)}`;
 }

 else if(T==='tech'){
  const G=ST.tech;
  body=`<div class="hero">
   <div class="ht">에이전트는 우리 기술이 아닙니다</div>
   <p>아리의 두뇌는 사다 쓰는 것이고, 경쟁사도 같은 걸 삽니다. 프롬프트는 6개월이면 따라잡혀요.
   우리가 쌓는 건 <b>에이전트가 내린 판단이 맞았는지 채점당하며 쌓이는 성적표</b>와,
   그 데이터를 <b>합법적으로 들고 있을 자격</b>입니다. 아래 4층이 그 실체예요.</p></div>

  <div class="sect2"><h3>L1 · 결과 데이터 파이프라인</h3>
   <span class="h2">가장 재미없어서 아무도 안 하는 층 — 위의 모든 학습이 여기서 먹고삽니다</span></div>
  <div class="chgrid">
   <div class="chc on2"><div class="top"><div class="ic">⛁</div><div class="nm2">여정 이벤트 스키마</div></div>
    <div class="d2">초대→수락→샘플→게시→검수→잔존이 <b>한 사람에게 끊기지 않고 귀속</b>됩니다.
     '게시'의 정의(스토리 제외 · 24h 이상 유지 · 태그 포함)까지 코드로 박혀 있어요.</div>
    <div class="mp" style="margin-top:9px">INVITE_SENT → ACCEPTED(+2d) → SAMPLE_DELIVERED(+6d)<br>→ CONTENT_POSTED(+11d) → REVIEW_PASSED(+12d) → RETAINED_90D</div>
    <div class="ar">이번 주 이벤트 <b>1,847건</b> · 유실 0.2%</div></div>
   <div class="chc on2"><div class="top"><div class="ic">◍</div><div class="nm2">귀속 규칙 · 아이덴티티 그래프</div></div>
    <div class="d2">리퍼럴 링크 타고 와서 폼으로 들어오면 누구 실적인가 — <b>최초 접점 우선, 7일 윈도</b>로
     못박았습니다. 핸들·이메일·기기·결제 계정을 하나로 묶되 <b>동의 범위 안에서만</b> 묶어요.</div>
    <div class="ar">병합된 신원 <b>2,140건</b> · 귀속 분쟁 0건 — 규칙이 먼저 있었으니까요</div></div>
  </div>

  <div class="sect2" style="margin-top:20px"><h3>L2 · 평가 하네스</h3>
   <span class="h2">예측 점수는 아무나 만듭니다 — 그 점수가 30일 뒤 자동으로 채점되는 회사는 드뭅니다</span></div>
  <table><tr><th>지난주 예측</th><th style="width:92px;white-space:nowrap">아리 예측</th>
   <th style="width:92px;white-space:nowrap">실제 결과</th><th style="width:64px">채점</th></tr>
  ${[['@fahbeauty · 14일 내 게시','높음 · 92','게시 D+9','<span class="chip ok">적중</span>'],
     ['@june.care · 14일 내 게시','높음 · 89','게시 D+13','<span class="chip ok">적중</span>'],
     ['@tan.skincare · 14일 내 게시','낮음 · 61','게시 D+8','<span class="chip bd">틀림</span>'],
     ['@siri.glow · 제외 판단','미게시 예측','타 브랜드서 미게시 확인','<span class="chip ok">적중</span>'],
     ['@may.glow · 14일 내 게시','낮음 · 58','미게시','<span class="chip ok">적중</span>']]
   .map(r=>`<tr><td class="mono" style="font-size:11px">${r[0]}</td><td style="font-size:11px">${r[1]}</td>
    <td style="font-size:11px">${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</table>
  <div class="lrn ${G.graded?'done':''}" style="margin-top:10px">
   <div class="lt">${G.graded?'채점 완료 · 가중치 반영됨':'주간 채점 대기'}</div>
   <p>예측 <b>31건</b> 중 26건 적중. 틀린 5건의 공통점은 <b>커머스 실적만 보고 게시 습관을 안 본 것</b>이었습니다.
   채점을 돌리면 이 발견이 가중치로 들어갑니다 — 브라이어 점수 <b>0.19 → 0.16</b>.</p>
   ${G.graded?'<div class="lo">정답 라벨이 자동으로 쌓이는 회사와 아닌 회사의 격차는, 모델이 아니라 <b>시간</b>이 벌립니다.</div>'
    :'<button class="btn" onclick="doGrade()">지난주 예측 31건 채점</button>'}
  </div>

  <div class="sect2" style="margin-top:20px"><h3>L3 · 규범 · 노하우 메모리</h3>
   <span class="h2">화면에 박힌 텍스트가 아니라, 버전 관리되고 근거가 링크된 지식</span></div>
  ${[['norm/discord-kbeauty-th','v7','태국어 우선 · 초대 링크 금지','근거: 게시 12건 A/B · DM 3.2배','2일 전'],
     ['norm/reddit-asianbeauty','v11','Disclosure 첫 줄 · 플레어 체크','근거: 3월 7일 정지 사건 #ban-004','5일 전'],
     ['playbook/cell-seeding','v23','마중물 09:00 · 제품→촬영→일상 순환','근거: 발화율 셀 9곳 비교','1일 전'],
     ['judge/saturation-threshold','v4','광고 비율 40% + 상승 추세','근거: 오탐 3건 복구 #appeal-011','8일 전']]
   .map(r=>`<div class="qcand"><span class="h3 mono" style="width:210px">${r[0]}</span>
     <span class="chip nt" style="font-size:9px">${r[1]}</span>
     <span class="s3">${r[2]}</span><span class="s3" style="flex:1.2;color:var(--t700)">${r[3]}</span>
     <span class="s3" style="width:44px;flex:none;text-align:right">${r[4]}</span></div>`).join('')}
  ${NOTE('LLM 시대의 기술력은 모델이 아니라 <b>모델에게 먹일 우리만의 컨텍스트를 어떤 구조로 쌓느냐</b>입니다. 새 브랜드는 첫날부터 v 최신을 물려받습니다.')}

  <div class="sect2" style="margin-top:20px"><h3>L4 · 신뢰 인프라</h3>
   <span class="h2">경쟁사가 이 데이터를 못 모으는 이유가 기술이 없어서가 아니라 자격이 없어서가 되게</span></div>
  <div class="rule"><div class="rl"><div class="rn">판단 원장</div>
    <div class="rd">아리의 모든 판단이 <b>근거 신호와 함께</b> 남습니다. 오늘 ${253}건.
     "왜 떨어뜨렸나"에 답 못 하는 판정은 자산이 아니라 리스크예요.</div></div>
   <div class="rc"><span class="lock">전건 기록</span></div></div>
  <div class="rule"><div class="rl"><div class="rn">열람 · 이의 제기</div>
    <div class="rd">크리에이터 본인이 자기 기록을 보고 이의를 걸 수 있습니다. 지난달 <b>이의 11건 → 복구 11건</b>,
     복구 기록도 원장에 남고 가중치에 반영됩니다.</div></div>
   <div class="rc"><span class="on" style="background:var(--a700)">복구 11건</span></div></div>
  <div class="rule ${G.revoked?'':''}" style="${G.revoked?'background:var(--s50);border-color:#CBDDD1':''}"><div class="rl"><div class="rn">동의 철회 전파</div>
    <div class="rd">${G.revoked
      ?'철회 <b>0.4초</b> 만에 브랜드 7곳의 조회 경로가 끊기고 캐시가 파기됐습니다. 원장에 2줄 남았어요.'
      :'철회하면 브랜드 간 참조가 <b>즉시</b> 끊겨야 합니다. 배치로 도는 회사는 이 데이터를 들고 있을 자격이 없어요.'}</div></div>
   <div class="rc">${G.revoked?'<span class="on" style="background:var(--s700)">0.4초 전파</span>'
     :'<button class="btn line" onclick="doRevoke()">철회 시뮬레이션</button>'}</div></div>

  <div class="sect2" style="margin-top:20px"><h3>투자하지 않는 것</h3>
   <span class="h2">기술력은 안 하는 것으로도 정의됩니다</span></div>
  ${[['자체 LLM · 파인튜닝','정답 라벨 <b>1만 건</b> 모이기 전엔 낭비입니다. 지금은 사다 쓰고, 라벨을 쌓습니다.'],
     ['스크래핑 기술','플랫폼과의 전쟁은 지는 싸움입니다. <b>공식 API + 인바운드 + 붙여넣기</b>로 충분해요.'],
     ['범용 CRM 기능','HubSpot과 싸우는 길입니다. 우리 화면은 <b>셀 운영에 필요한 것만</b> 남깁니다.']]
   .map(r=>`<div class="crow"><div class="cn" style="color:var(--n400);text-decoration:line-through">${r[0]}</div>
     <div class="cd">${r[1]}</div></div>`).join('')}
  ${NOTE('한 줄로 — 경쟁사가 못 베끼는 건 에이전트가 아니라, <b>에이전트가 채점당하며 쌓은 성적표</b>입니다. L1이 없으면 L2가 소설이 되고, L4가 없으면 전부 소송거리가 됩니다.')}`;
 }

 else {
  body=`<div class="hero">
   <div class="ht">우리만 가진 것은 명단이 아니라 결과입니다</div>
   <p>팔로워 수는 누구나 삽니다. <b>초대한 사람이 실제로 게시했는지, 검수를 통과했는지, 90일 뒤에도 남아 있는지</b>는
   셀을 운영하는 쪽만 압니다. 우리는 브랜드마다 셀을 돌리기 때문에 이게 <b>브랜드가 늘수록 정확해집니다.</b></p></div>

  <div class="sect2"><h3>결과 귀속 · 채널이 데려온 사람은 끝까지 갔는가</h3>
   <span class="h2">유입 수가 아니라 완주율로 채널을 평가합니다</span></div>
  <table><tr><th>채널</th><th style="width:52px">유입</th><th style="width:52px">가입</th>
   <th style="width:96px;white-space:nowrap">14일 내 게시</th><th style="width:76px;white-space:nowrap">검수 통과</th>
   <th style="width:88px;white-space:nowrap">90일 잔존</th><th style="width:86px;white-space:nowrap">완주 CAC</th></tr>
  ${[['리퍼럴',14,10,'9 · 90%','9','8 · 80%','₩2,100'],
     ['인바운드 폼',41,26,'19 · 73%','17','15 · 58%','₩0'],
     ['틱톡샵',38,16,'11 · 69%','10','8 · 50%','₩6,700'],
     ['커뮤니티',33,11,'7 · 64%','6','5 · 45%','₩5,900'],
     ['인스타 DM',26,5,'3 · 60%','3','2 · 40%','₩33,800'],
     ['소싱 스윕',57,5,'2 · 40%','2','1 · 20%','₩62,700'],
     ['메일',18,2,'1 · 50%','1','1 · 50%','₩75,600']]
   .map(r=>`<tr><td><b>${r[0]}</b></td><td class="mono">${r[1]}</td><td class="mono">${r[2]}</td>
    <td class="mono" style="white-space:nowrap">${r[3]}</td><td class="mono">${r[4]}</td>
    <td class="mono" style="white-space:nowrap">${r[5]}</td>
    <td class="mono"><b>${r[6]}</b></td></tr>`).join('')}</table>
  ${NOTE('겉 CAC는 소싱 스윕이 ₩1,100으로 싸 보입니다. <b>완주 CAC는 ₩62,700</b>이에요 — 데려온 5명 중 1명만 남습니다. 유입 수로 채널을 고르면 이걸 못 봅니다.')}

  <div class="sect2" style="margin-top:20px"><h3>브랜드가 늘수록 좋아지는 것 · 3가지</h3>
   <span class="h2">한 브랜드만 운영하는 도구는 이 자리에 못 옵니다</span></div>
  <div class="chgrid">
   <div class="chc on2"><div class="top"><div class="ic">◈</div><div class="nm2">완주 이력</div></div>
    <div class="d2">이 크리에이터가 <b>다른 브랜드 셀에서</b> 어떻게 했는지. 샘플 받고 게시했는지, 며칠 걸렸는지,
     몇 달 남았는지. 마켓플레이스는 <b>거래만 보고 그 뒤를 못 봅니다.</b></div>
    <div class="ar">지금 <b>2,140명</b>의 완주 기록 · 브랜드 7곳에서 누적</div></div>
   <div class="chc on2"><div class="top"><div class="ic">⊘</div><div class="nm2">배제 기록</div></div>
    <div class="d2">누가 샘플만 받고 사라졌는지. 브랜드가 혼자 배우려면 <b>샘플 200개를 태워야</b> 아는 걸
     첫날부터 압니다. 차단이 아니라 <b>과금 제외</b>이고, 본인이 열람·이의 제기할 수 있습니다.</div>
    <div class="ar">미게시 <b>318명</b> · 이의 제기로 복구 <b>11명</b></div></div>
   <div class="chc on2"><div class="top"><div class="ic">◇</div><div class="nm2">커뮤니티 규범</div></div>
    <div class="d2">어느 방에서 어떤 문구가 통했고 무엇으로 잘렸는지. <b>밴을 맞아가며</b> 쌓은 것이라
     돈으로 살 수 없습니다. 새 브랜드는 첫 게시부터 이 규칙을 물려받습니다.</div>
    <div class="ar">커뮤니티 <b>23곳</b> · 밴 사례 <b>4건</b>에서 학습</div></div>
   <div class="chc on2"><div class="top"><div class="ic">◍</div><div class="nm2">셀 → 획득 루프</div></div>
    <div class="d2">리퍼럴 완주율 <b>90%</b>. 이 채널은 <b>셀을 운영하는 쪽만</b> 가질 수 있습니다.
     남들은 획득이거나 관리거나 둘 중 하나인데, 우리는 관리가 획득을 만듭니다.</div>
    <div class="ar">셀 활성도가 오르면 <b>2주 뒤</b> 리퍼럴이 따라 오릅니다</div></div>
  </div>

  <div class="sect2" style="margin-top:20px"><h3>이번 주 바뀐 것</h3>
   <span class="h2">결과가 행동을 바꾼 기록 — 전부 원장에 남습니다</span></div>
  ${[['월','틱톡샵 배분 — <b>follower_weight 0.30 → 0.12</b> · 큰 계정의 14일 게시율이 38%로 확인됨'],
     ['월','디스코드 공고 — 태국어 우선으로 전환. 영어 우선 대비 <b>DM 3.2배</b>'],
     ['화','소싱 스윕 통과 기준 상향 — 완주 CAC ₩62,700이 다른 채널의 <b>9배</b>'],
     ['수','인바운드 폼 항목 <b>6개 → 4개</b> · 이탈률 41% → 18%'],
     ['목','레딧 게시 전 <b>플레어 체크</b> 추가 — 3월 7일 정지 재발 방지']]
   .map(r=>`<div class="alog"><span class="tm2">${r[0]}</span><span class="tx2">${r[1]}</span></div>`).join('')}
  ${NOTE('크리에이터 권리 — 자기 기록은 <b>본인이 열람하고 이의를 제기</b>할 수 있고, 동의를 철회하면 브랜드 간 참조가 즉시 끊깁니다. 이 원칙이 없으면 이 데이터는 자산이 아니라 <b>리스크</b>예요.')}
  <button class="btn soft" style="margin-top:4px" onclick="ST.srcTab='tech';render()">이걸 지탱하는 4층 기술 스택 →</button>`;
 }
 return `<div class="srcw"><div class="agp" style="background:var(--n100)">${body}</div></div>`;
}

function bcellView(){
 const k=ST.bCell, C=BCELLS[k], msgs=ST.cellMsgs[k]||[];
 const linked = (k==='GLOWLAB' && joined('GLOWLAB'));
 return `<div class="bc">
  <div class="list">
   <div class="sc">이 브랜드의 셀 · 3개</div>
   ${Object.keys(BCELLS).map(x=>`<a class="${x===ST.bCell?'on':''}" onclick="ST.bCell='${x}';ST.bCh='잡담';render()">
     <div class="nm">${BCELLS[x].nm}</div>
     <div class="ds">${bCellCount(x)}명 · 발화 ${bSpoke(x)}</div>
     ${BCELLS[x].state==='silent'?'<span class="bg2" style="background:var(--c50);color:var(--c500)">침묵 4일</span>'
       :'<span class="bg2" style="background:var(--s50);color:var(--s700)">활성</span>'}</a>`).join('')}
   <div class="sc" style="margin-top:14px">대기</div>
   <a onclick="toast('새 셀','셀은 <b>캠페인과 무관하게</b> 자유롭게 만듭니다. 이름과 시딩 주제만 정하면 아리가 배정·마중물을 이어받아요.')"
     style="border:1px dashed var(--n300)"><div class="nm">+ 새 셀 만들기</div>
    <div class="ds">캠페인과 무관 · 자유 개설</div></a>
  </div>

  <div class="mid2">
   <div class="hd2"><div><div class="t">${C.nm}</div>
     <div class="s">${bCellCount(k)}명 · 오늘 47명이 봤어요${linked?' · <b>크리에이터 앱과 같은 방</b>':''}
      <span class="urlchip" onclick="toast('링크 복사됨','<span class=mono>connection.app/glowlab</span> — 브랜드명 하나로 끝나는 주소입니다. 받은 사람은 <b>로그인 후 자기 셀</b>로 들어와요.')">↗ 공유</span>
      <span class="urlchip" onclick="toast('콘솔 언어','브랜드 콘솔은 <b>브랜드 본국어(한국어) 중심</b>입니다. 태국어·영어 메시지는 한국어로 자동 번역돼 보이고, 칩을 누르면 원문이 열립니다.')">KO 중심 · 자동 번역</span></div></div>
    <div class="tabs2">${[['talk','대화'],['act','활성화'],['grow','충원'],['rule','규칙']].map(t=>
      `<span class="${ST.bTab===t[0]?'on':''}" onclick="ST.bTab='${t[0]}';render()">${t[1]}</span>`).join('')}</div></div>
   ${ST.bTab!=='talk'? (ST.bTab==='grow'?growPanel(k):ST.bTab==='act'?actPanel(k):rulePanel(k)) : `
   <div class="hd2" style="padding:9px 20px;border-bottom:1px solid var(--n200)">
    <div class="chs">${['잡담','촬영 팁','공지'].map(c=>`<span class="${ST.bCh===c?'on':''}"
      onclick="ST.bCh='${c}';render()">${c==='공지'?'◎ 공지':'# '+c}</span>`).join('')}</div></div>

   <div class="sm2" id="bsm">
    ${ST.bCh==='잡담'? `<div class="sy" style="text-align:center;font-size:10.2px;color:var(--n400);margin:10px 0">— 8월 22일 —</div>`
      + (msgs.length? msgs.map((m,i)=>{
        if(m.who==='seed') return `<div class="sd" style="margin-bottom:12px"><div class="a av"></div><div>
          <div class="l">${m.f?'아리 · 이번 주 피드':'아리 · 오늘의 질문'} · <b>각자 언어로 발송</b></div><p>${m.tx}</p></div></div>`;
        if(m.who==='sys') return `<div style="text-align:center;font-size:10.2px;color:var(--n400);margin:10px 0">${m.tx}</div>`;
        if(m.brand) return `<div class="bmsg brand"><div class="a" style="width:30px;height:30px;border-radius:8px;
          background:linear-gradient(140deg,#EFC8B6,#C2543C)"></div><div>
          <div><span class="wh">GLOWLAB</span><span class="brandchip">브랜드</span><span class="tm">${m.tm||''}</span></div>
          <div class="tx">${m.tx}</div>
          <div class="trn">크리에이터에게는 <b>각자 언어로 번역</b>돼 보입니다</div></div></div>`;
        const bg=m.me?'linear-gradient(140deg,#EFC8B6,#C2543C)':m.g===2?'linear-gradient(140deg,#D8E6DC,#7FA98C)':'linear-gradient(140deg,#EFC8B6,#C2543C)';
        return `<div class="bmsg"><div class="a av" style="background:${bg}"></div><div style="min-width:0">
          <div><span class="wh">${m.who}</span><span class="tm">${m.tm||''}</span>${trc(k,m,i)}</div>
          <div class="tx">${mtx(m)}</div>
          ${m.ct?`<div class="ctc"><div class="th" style="background:${m.ct.th}"><i>▶</i></div>
            <div><div class="cap">${m.ct.cap}</div><div class="st4">${m.ct.stat}</div></div></div>`:''}</div></div>`;}).join('')
       : `<div class="empty" style="margin-top:10px"><div class="a av"></div>
          <p>이 방은 <b>4일째 조용합니다.</b> 마중물을 한 번 더 올려보거나, 재편성을 검토하세요 —
          다만 <b>사람을 옮기면 관계가 끊깁니다.</b></p></div>`)
     : ST.bCh==='촬영 팁'? `<div class="empty" style="margin-top:10px"><div class="a av"></div>
        <p>촬영 팁 채널은 <b>먼저 올린 사람</b>이 생기면 살아납니다. 브랜드가 첫 글을 써주는 게 가장 빠릅니다.</p></div>`
     : `<div class="bmsg brand"><div class="a" style="width:30px;height:30px;border-radius:8px;
        background:linear-gradient(140deg,#EFC8B6,#C2543C)"></div><div>
        <div><span class="wh">GLOWLAB</span><span class="brandchip">브랜드</span><span class="tm">8/20</span></div>
        <div class="tx">8월 선쿠션 캠페인이 열렸어요. 지원은 앱 캠페인 탭에서요.</div></div></div>
       <div class="empty" style="margin-top:12px"><div class="a av"></div>
        <p>공지는 <b>읽기 전용</b>입니다. 크리에이터는 댓글을 달 수 없고 잡담 채널에서 이야기합니다.
        아리가 공지 초안을 쓰면 <b>공개 게시 게이트</b>를 거칩니다.</p></div>`}
   </div>

   ${ST.bCh!=='공지'? `<div class="in2"><div class="box">
     <span class="as">GLOWLAB로 게시</span>
     <input placeholder="셀에 직접 말 걸기 (엔터)" onkeydown="brandSend(event)"></div>
     <div class="hintline">대표님이 <b>직접 쓰는 글은 게이트를 거치지 않습니다.</b>
      아리가 대신 쓰면 <b>공개 게시 게이트</b>로 올라갑니다.</div></div>`
    : `<div class="in2"><div class="box" style="opacity:.55">
      <span class="as">공지 · 읽기 전용</span><input placeholder="공지는 아리 초안 → 승인 후 게시" disabled></div>
      <div class="hintline"><button class="btn soft" style="margin-top:7px" onclick="brandDraft()">아리에게 공지 초안 요청</button></div></div>`}
  `}
  </div>

  <div class="side2">
   <div class="sc">이 방의 상태</div>
   <div class="st2"><div class="l">인원</div><div class="v">${bCellCount(k)}명</div>
    <div class="d">상한 없음 · <b>발화 밀도</b>로 건강 판단</div></div>
   <div class="st2"><div class="l">오늘 발화</div><div class="v">${bSpoke(k)}명</div>
    <div class="d">${bSpoke(k)===0?'<b>4일째 0명</b>':'본 사람 47명 중'}</div></div>
   <div class="st2"><div class="l">마중물</div><div class="v">${k==='TH3'?'1 / 1':'1 / 1'}</div>
    <div class="d">오늘치 질문 <b>발송됨</b></div></div>
   <div class="sc" style="margin-top:14px">아리가 할 수 있는 것</div>
   <div class="act"><button class="btn soft" style="width:100%" onclick="brandSeed()">마중물 한 번 더</button></div>
   <div class="act"><button class="btn line" style="width:100%"
     onclick="toast('재편성 제안','3번방을 20명으로 줄이고 활성 3명을 옮기는 안입니다. <b>사람을 옮기는 건 관계가 끊기는 일</b>이라 승인함으로 올렸습니다.','brand','gates')">재편성 제안 보기</button></div>
   <div class="sc" style="margin-top:14px">지금 있는 사람 · 4</div>
   ${(joined('GLOWLAB')&&k==='GLOWLAB'?[ST.me.name+' (신규)','Ploy S.','Nan T.','Mint R.']:['Ploy S.','Nan T.','Mint R.','Fah K.'])
     .map(n=>`<div class="mem"><div class="a av"></div><span class="n2">${n}</span></div>`).join('')}
   <div class="st2" style="margin-top:12px;background:var(--t50);border-color:var(--t100)">
    <div class="d" style="color:var(--t700)">브랜드도 <b>멤버로 보입니다.</b> 관리자 표시는 없고
    <b>GLOWLAB</b> 이름으로만 말합니다 — 감시하는 자리가 아니라 <b>같이 있는 자리</b>예요.</div></div>
  </div>
 </div>`;
}

/* ============================================================ 렌더 */
function render(){
 ['ac','ab','abj','ap'].forEach((id,i)=>{
  document.getElementById(id).className=ST.app===['creator','brand','bjoin','plan'][i]?'on':''; });
 document.getElementById('hint').innerHTML={
  creator:'커넥션 가입 → <b>브랜드 셀 추가 가입</b> → 셀 생활',
  brand:'게이트를 승인하면 <b>크리에이터 앱</b>이 바뀝니다',
  bjoin:'브랜드는 <b>가입하면서 아리를 세팅</b>합니다',
  plan:'서비스의 <b>핵심 결정</b>이 모여 있는 곳'}[ST.app];
 const st=document.getElementById('stage');

 if(ST.app==='creator'){
  const v=CA[ST.c]();
  const inCell=!!ST.me.cur;
  const tabs=inCell?[['cell','◎','셀'],['agent','◔','담당자'],['camp','▤','캠페인'],['submit','↑','제출'],
                     ['earn','₩','정산'],['pass','◍','내 패스']]:null;
  let body;
  if(v.cellUI){
   const k=v.brand, B=BRANDS[k], msgs=ST.cellMsgs[k];
   body=`<div class="cellsw">${ST.me.joined.map(x=>`<span class="${x===k?'on':''}" onclick="enterCell('${x}')">
      ${BRANDS[x].nm}</span>`).join('')}</div>
    <div class="chsw">${['잡담','촬영 팁','공지'].map(c=>`<span class="${ST.curCh===c?'on':''}"
      onclick="ST.curCh='${c}';render()">${c==='공지'?'◎ 공지':'# '+c}</span>`).join('')}</div>
    <div class="pbd" id="cellBody">
     ${ST.curCh==='잡담'? `<div class="sy">— 8월 22일 —</div>
      <div class="sy" style="color:var(--t700)">이 방은 3개 언어로 대화 중 · 서로 자기 언어로 봅니다</div>`+msgs.map((m,i)=>{
       if(m.who==='seed') return `<div class="sd"><div class="a av"></div><div>
         <div class="l">${m.f?'아리 · 이번 주 피드':'아리 · 오늘의 질문'} · <b>각자 언어로 발송</b></div><p>${m.tx}</p></div></div>`;
       if(m.who==='sys') return `<div class="sy">${m.tx}</div>`;
       if(m.brand) return `<div class="m2b"><div class="a" style="width:29px;height:29px;border-radius:8px;
         background:linear-gradient(140deg,#EFC8B6,#C2543C)"></div><div>
         <div><span class="wh">${BRANDS[k].nm}</span><span class="brandchip">브랜드</span>
          <span class="tm">${m.tm||''}</span>${trc(k,m,i)}</div><div class="tx">${mtx(m)}</div></div></div>`;
       const bg=m.me?'linear-gradient(140deg,#EFC8B6,#C2543C)':m.g===2?'linear-gradient(140deg,#D8E6DC,#7FA98C)':'linear-gradient(140deg,#EFC8B6,#C2543C)';
       return `<div class="m2b"><div class="a av" style="background:${bg}"></div><div style="min-width:0">
         <div><span class="wh">${m.who}</span><span class="tm">${m.tm||''}</span>${trc(k,m,i)}</div>
         <div class="tx">${mtx(m)}</div>
         ${m.ct?`<div class="ctc" onclick="toast('콘텐츠 예시','셀 안에서는 <b>서로의 결과물이 레퍼런스</b>가 됩니다. 밖으로는 안 나가요.')">
           <div class="th" style="background:${m.ct.th}"><i>▶</i></div>
           <div><div class="cap">${m.ct.cap}</div><div class="st4">${m.ct.stat}</div></div></div>`:''}</div></div>`;}).join('')
      : ST.curCh==='촬영 팁'? `<div class="cc"><div class="t">아직 조용해요</div>
        <p>촬영 팁 채널은 <b>먼저 올린 사람</b>이 생기면 살아납니다. Ploy 님이 첫 글을 써보실래요?</p></div>`
      : `<div class="cc" style="background:var(--n50)"><div class="t">읽기 전용 채널이에요</div>
        <p>브랜드 공지만 올라옵니다. 댓글은 잡담 채널에서요.</p></div>
        ${ST.camps.map(c=>`<div class="cc"><div style="display:flex;gap:9px">
          <div style="width:42px;height:42px;border-radius:9px;background:${c.img};flex-shrink:0"></div>
          <div style="flex:1;min-width:0"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
           <div class="t" style="margin:0">${cT(c,'nm')}</div>${CBADGE(c)}
           <span class="trc" onclick="tgCamp('${c.id}')">${ST.campLang[c.id]?'ไทย':'KO 원문'}</span></div>
          <p style="margin-top:3px">${cT(c,'prod')} · 마감 ${c.due}</p></div></div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:7px">${cT(c,'usp').slice(0,2).map(u=>`<span class="uspc">${u}</span>`).join('')}</div>
          <button class="btn soft" style="margin-top:8px;font-size:10.4px;padding:6px 12px" onclick="ST.c='camp';render()">조건 보고 지원하기</button></div>`).join('')}`}
    </div>
    ${ST.curCh!=='공지'?`<div class="cellin"><div class="box"><span style="color:var(--n400)">＋</span>
     <input placeholder="메시지 보내기 (엔터)" onkeydown="sendCell(event)"></div></div>`:''}`;
  } else {
   body=`${v.steps?`<div class="steps">${v.steps.map(s=>`<i class="${s?'on':''}"></i>`).join('')}</div>`:''}
     <div class="pbd" ${ST.c==='agent'?'id="agBody"':''}>${v.body}</div>
     ${v.input?`<div class="cellin"><div class="box"><span style="color:var(--n400)">＋</span>
      <input placeholder="담당자에게 말하기 (엔터) · ไทย로 써도 돼요" onkeydown="dmSendC(event)"></div></div>`:''}`;
  }
  st.innerHTML=`<div class="phwrap"><div class="phone">
    <div class="stbar"><span>9:41</span><span>●●●</span></div>
    ${v.hd?`<div class="phd">${v.back?`<button class="bk" onclick="ST.c='${v.back}';render()">‹</button>`:''}
      ${(ST.c==='cell'||ST.c==='agent'||ST.c==='hub')?'<div class="a av"></div>':''}
      <div style="flex:1;min-width:0"><div class="n">${v.hd[0]}</div><div class="s">${v.hd[1]}</div></div>
      ${ST.c==='cell'?`<span class="hbt" onclick="toast('링크 복사됨','<b>connection.app/${(ST.me.cur||'glowlab').toLowerCase()}</b> — 받은 사람은 <b>커넥션 패스 로그인</b>을 거쳐 바로 이 방으로 들어옵니다.')">↗ 공유</span>
       <span class="hbt soft" onclick="window.notifMenu&&notifMenu()">🔔</span>
       <span class="hbt soft" onclick="window.reportFlag&&reportFlag()">⚑</span>
       <span class="hbt soft" onclick="langMenu()">${window.__LANG_LABEL||'ไทย'}</span>`:''}</div>`:''}
    ${body}
    ${tabs&&!ST.pwa?`<div class="pwab"><div><b>앱으로 쓰기</b><span>같은 URL · 홈 화면 아이콘 · 셀 알림</span></div>
      <button class="btn" style="padding:6px 13px;font-size:11px" onclick="doInstall()">설치</button>
      <span class="x2" onclick="ST.pwa=true;render()">×</span></div>`:''}
    ${tabs?`<div class="pnav">${tabs.map(t=>`<div class="${ST.c===t[0]?'on':''}"
      onclick="ST.c='${t[0]}';render()"><i>${t[1]}</i>${t[2]}</div>`).join('')}</div>`:''}
   </div>
   <div class="side"><div class="ttl">가입 여정</div>
    ${[['커넥션 계정 만들기',ST.me.pass,'signup'],['브랜드 셀 고르기',ST.me.joined.length>0,'hub'],
       ['브랜드 동의 · 자격 확인',ST.me.joined.length>0,'join'],['셀 입장',ST.me.joined.length>0,'cell'],
       ['(초대 시) 다른 셀 연결',ST.me.joined.length>1,'hub']]
     .map((s,i)=>{const now=(!s[1]&&(i===0?!ST.me.pass:i===1?ST.me.pass&&!ST.me.joined.length:i===4&&ST.me.joined.length===1));
      return `<div class="step ${s[1]?'done':now?'now':''}"><div class="no">${s[1]?'✓':i+1}</div><div>${s[0]}</div></div>`}).join('')}
    <div class="card" style="margin-top:14px"><h4>이 구조의 핵심</h4>
     <p>계정은 <b>커넥션</b>이 하나만 만들고, 회원은 <b>브랜드마다 따로</b> 생깁니다.
     그래서 두 번째 브랜드부터는 <b>재가입이 없고</b>, 커넥션은 <b>획득 비용 0으로 ₩10,000</b>을 다시 받습니다.</p></div>
    <div class="card"><h4>지금 상태</h4>
     <p>패스 <b>${ST.me.pass?'있음':'없음'}</b> · 소속 셀 <b>${ST.me.joined.length}개</b>
     ${ST.me.joined.length?`<br>현재 셀 <b>${ST.me.cur?BRANDS[ST.me.cur].nm:'-'}</b>`:''}</p></div>
   </div></div>`;
  const cb=document.getElementById('cellBody'); if(cb) cb.scrollTop=cb.scrollHeight;
  const ag=document.getElementById('agBody'); if(ag) ag.scrollTop=ag.scrollHeight;
 }
 else if(ST.app==='brand'){
  const v=CV[ST.b]();
  st.innerHTML=`<div class="cons">
   <div class="rail"><div class="lg"><i class="c"></i><i class="a"></i><i class="b"></i></div>
    ${RAIL.map(r=>`<button class="${ST.b===r[0]?'on':''}" onclick="ST.b='${r[0]}';render()">${r[1]}
     ${r[0]==='gates'&&gateCount()?`<span class="bdg">${gateCount()}</span>`:''}
     ${r[0]==='review'&&reviewCount()?`<span class="bdg">${reviewCount()}</span>`:''}</button>`).join('')}
    <div class="sp"></div><div class="me"></div></div>
   <div class="chat"><div class="hd"><div class="a av"></div><div><div class="n">아리</div>
     <div class="s">GLOWLAB 담당 · 근무 중</div></div></div>
    <div class="feed" id="feed">${ST.chat.map(node).join('')}</div>
    <div class="cmp"><div class="sgs">
     <span onclick="say('승인할 거')">승인할 거</span><span onclick="say('셀 어때')">셀 어때</span>
     <span onclick="say('모집 어때')">모집 어때</span>
     <span onclick="say('명부')">명부</span><span onclick="say('정산')">정산</span></div>
     <div class="ipt"><input id="cmd" placeholder="아리에게 말하기…"
       onkeydown="if(event.key==='Enter'){say(this.value);this.value=''}">
      <span class="snd" onclick="const i=document.getElementById('cmd');say(i.value);i.value=''">↑</span></div></div></div>
   <div class="cvs"><div class="cvhd"><div><h1>${v.t}</h1><div class="s">${v.s}</div></div>
     <div class="r">${v.r||''}</div></div>
    ${v.raw===3? dbView() : v.raw===2? srcView() : v.raw? bcellView() : `<div class="cvbd">${v.b}</div>`}</div></div>`;
  const f=document.getElementById('feed'); if(f) f.scrollTop=f.scrollHeight;
  const bs=document.getElementById('bsm'); if(bs) bs.scrollTop=bs.scrollHeight;
 }
 else if(ST.app==='plan'){ st.innerHTML=planView(); }
 else if(ST.app==='bjoin'){ st.innerHTML=bjoinView(); }

}
seedChat(); render();
