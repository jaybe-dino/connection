/* slack-v3 원본 journey.js의 실데이터 각색 — 초대·로그인·온보딩·브랜드 참여의
   공개 진입 화면, 캠페인 신청·협업 단계·랭킹·미션 화면을 모두 실제 서버
   상태로 구동한다. 원본의 '전체 이용 흐름(체험 상태 바꾸기)'은 실제
   '이용 안내'(정보 페이지)로, '디자인 체험' 고지는 실제 서비스 안내로 치환.
   가짜 상태 전환 없음: 모든 단계는 서버가 기록한 상태만 보여준다. */
Object.assign(labels,{routes:'이용 안내',invite:'브랜드 초대',login:'로그인',checkemail:'이메일 확인',onboarding:'크리에이터 프로필',join:'브랜드 참여',welcome:'참여 완료',application:'캠페인 신청',applied:'신청 완료',applicationstatus:'신청 상태',collaboration:'협업 상세',submission:'콘텐츠 제출',state:'화면 상태',ranking:'브랜드 랭킹',achievements:'미션·배지'});
ui.routeId='';ui.rankPeriod='all';ui.missionTab='missions';ui.activeCollab=null;
const journeyBaseRender=render;
navigate=function(page,id){
  captureDraft();ui.page=page;ui.routeId=id||'';ui.panel=null;LIVE.thread=null;ui.mobileChannels=false;
  if(id&&campaignById(id))ui.campaign=id;
  history.pushState(null,'','#'+page+(id?'/'+id:''));
  if(['campaigns','work','detail','collaboration','applicationstatus','applied'].includes(page))collabRefresh();
  if(['ranking','achievements'].includes(page)){const b=currentBrand();if(b)loadSpace(b.brandId)}
  render();document.querySelector('.page-primary')?.scrollTo(0,0);window.scrollTo(0,0)
};
function routeFromHash(){const [p,id]=location.hash.slice(1).split('/');if(labels[p]){ui.page=p;ui.routeId=id||'';if(id&&campaignById(id))ui.campaign=id}}
window.addEventListener('popstate',()=>{captureDraft();routeFromHash();render()});
function JHead(k,t,d,a=''){return pageHead(k,t,d,a)}
const serviceNote='<span class="journey-demo">이용약관과 개인정보 처리방침에 따라 운영됩니다 · 캠페인 선정과 조건은 브랜드와 확정해요.</span>';
function publicFrame(body,step=0){return `<div class="entry-shell"><header><button class="entry-logo" onclick="navigate('invite',LIVE.joinTarget||'')">theprlist<span>CREATOR COMMUNITY</span></button><button class="button small" onclick="guideFlowDialog()">이용 안내 ${I('arrow',13)}</button></header><main class="entry-main">${step?`<nav class="entry-steps" aria-label="참여 단계">${['초대 확인','이메일 로그인','프로필','브랜드 참여'].map((l,i)=>`<span class="${step===i+1?'current':step>i+1?'done':''}"><b>${step>i+1?'✓':i+1}</b>${l}</span>`).join('')}</nav>`:''}${body}</main><footer>${serviceNote}<a href="/install.html">홈 화면에 설치 →</a><button onclick="policyDialog()">이용약관 · 개인정보 안내 →</button></footer></div>`}
function guideFlowDialog(){modal(`<span class="eyebrow">HOW IT WORKS</span><h2 id="modalTitle">theprlist는 이렇게 진행돼요.</h2><p class="muted">브랜드 초대부터 협업 완료까지.</p><ol class="mini-timeline" style="margin:18px 0"><li class="done">브랜드 초대 확인</li><li class="done">이메일 로그인</li><li class="done">프로필 · TikTok 인증</li><li>브랜드 참여 → 캠페인 신청 → 선정 · 조건 합의 → 샘플 → 콘텐츠 · Spark 제출 → 완료</li></ol><div class="notice-box">브랜드 커뮤니티 참여와 캠페인 선정은 별개입니다. 제품 제공·수수료 등 캠페인 조건은 선정 후 확인합니다.</div><div class="modal-footer">${btn('확인','closeModal()','primary')}</div>`)}
function policyDialog(){modal(`<h2 id="modalTitle">서비스 이용 안내</h2><p class="muted">계정 생성과 브랜드 참여에는 약관·개인정보 처리방침 동의가 필요합니다.</p><div class="fields"><a href="https://theprlist.net/terms" target="_blank" rel="noopener">서비스 이용약관 ↗</a><a href="https://theprlist.net/privacy" target="_blank" rel="noopener">개인정보처리방침 ↗</a></div><div class="modal-footer">${btn('확인','closeModal()','primary')}</div>`)}

/* ── 공개 진입: 초대 → 로그인 → 메일 확인 → 프로필 → 참여 → 완료 ── */
function invitationPage(){
  const bid=ui.routeId||LIVE.joinTarget;
  if(bid&&bid!==LIVE.joinTarget){LIVE.joinTarget=bid;LIVE.joinBrandInfo=null;liveReq('GET','/brands/'+bid+'/identity').then(x=>{LIVE.joinBrandInfo=x;render()}).catch(()=>{LIVE.joinBrandInfo={missing:true};render()})}
  const b=LIVE.joinBrandInfo;
  if(!bid)return loginPage();
  if(b&&b.missing)return statePage('invalid');
  if(!b)return publicFrame(`<section class="entry-card center"><div class="loading-lines" role="status" aria-label="초대 정보를 불러오는 중"><div></div><div></div><div></div></div></section>`,1);
  const joined=!!(window.__ME&&(LIVE.memberships||[]).some(m=>m.brandId===bid));
  const art=brandArt({name:b.name||bid,initial:(b.name||bid).slice(0,1).toUpperCase(),logoUrl:b.logoUrl});
  const product=LIVE.invitationProduct;
  return publicFrame(`<section class="entry-invitation"><div class="invitation-art"><img src="${product&&product.imageUrl&&/^https:\/\//i.test(product.imageUrl)?E(product.imageUrl):art}" alt="${E(b.name||bid)} 브랜드"><div><span class="eyebrow">A BRAND INVITATION</span><h1>${E(b.name||bid)}</h1><p>${E(b.tagline||'크리에이터와 함께 만드는 브랜드')}</p></div></div><div class="invitation-copy"><span class="brand-letter">${E((b.name||bid).slice(0,1).toUpperCase())}</span><span class="eyebrow">YOU’RE INVITED</span><h2>${E(b.name||bid)}의<br>크리에이터 커뮤니티에 초대합니다.</h2><p>제품을 경험하고, 이야기를 나누고,<br>당신의 콘텐츠로 함께할 기회를 만나세요.</p>${product?`<div class="notice-box"><b>${E(product.name||'제안 제품')}</b>${product.summary?`<br>${E(product.summary).slice(0,200)}`:''}</div>`:''}<div class="invite-benefits"><div>${I('community',17)}브랜드 멤버·담당자와 대화</div><div>${I('campaigns',17)}멤버를 위한 캠페인 신청</div><div>${I('work',17)}조건 확인부터 콘텐츠 제출까지</div></div>${joined?btn('이미 참여 중 · 커뮤니티 열기',`selectBrand('${E(bid)}');navigate('community')`,'primary wide'):window.__ME?btn('이 브랜드 참여 진행하기',"navigate('join')",'primary wide'):btn('초대 수락하고 시작하기',"navigate('login')",'primary wide')}${window.__ME?'':`<button class="entry-signin" onclick="navigate('login','existing')">이미 계정이 있나요? 로그인</button>`}<p class="entry-disclosure">브랜드 커뮤니티 참여와 캠페인 선정은 별개입니다.<br>제품 제공·수수료 등 캠페인 조건은 선정 후 확인합니다.</p></div></section>`,1)
}
function loginPage(){
  const b=LIVE.joinBrandInfo&&!LIVE.joinBrandInfo.missing?LIVE.joinBrandInfo:null;
  return publicFrame(`<section class="entry-card"><span class="eyebrow">WELCOME${b?' TO '+E((b.name||'').toUpperCase()):''}</span><h1>이메일로 시작하세요.</h1><p class="muted">비밀번호 없이 받은 링크로 로그인할 수 있어요.<br>${LIVE.applicationToken?'제안을 받은 이메일을 사용해 주세요.':'처음이어도 이메일만으로 시작할 수 있어요.'}</p><form onsubmit="event.preventDefault();magicRequest(this.email.value)"><div class="field"><label for="entryEmail">이메일 주소</label><input id="entryEmail" name="email" type="email" autocomplete="email" required value="${E(LIVE.magic.email||'')}" placeholder="you@example.com"></div><button class="button primary wide" ${LIVE.magic.busy?'disabled':''}>${LIVE.magic.busy?'요청 중…':'로그인 링크 받기'}</button></form><p id="crLoginStatus" role="status" aria-live="polite" class="muted" style="font-size:12px">${E(LIVE.magic.status||'')}</p><div class="entry-policy">서비스의 <button onclick="policyDialog()">이용약관·개인정보 안내</button>를 확인할 수 있습니다.</div>${LIVE.joinTarget?`<button class="text-link" onclick="navigate('invite','${E(LIVE.joinTarget)}')">← 초대 정보로 돌아가기</button>`:''}</section>`,2)
}
function checkEmailPage(){
  return publicFrame(`<section class="entry-card center"><div class="entry-symbol">${I('messages',28)}</div><h1>메일함을 확인해 주세요.</h1><p class="muted"><b>${E(LIVE.magic.email||'')}</b><br>로그인 링크를 보냈어요 (15분 유효 · 1회용).</p>${LIVE.magic.demoLink?`<div class="notice-box">개발 모드 — 메일 발송 대신 링크가 바로 발급됐어요.<br><a href="${E(LIVE.magic.demoLink)}">이 링크로 로그인 →</a></div>`:''}<button class="entry-signin" onclick="magicRequest('${E(LIVE.magic.email||'')}')" ${LIVE.magic.busy?'disabled':''}>메일 다시 받기</button><button class="text-link" onclick="navigate('login')">이메일 주소 수정</button><details class="entry-help"><summary>메일이 오지 않나요?</summary><p>스팸함과 입력한 이메일을 확인한 뒤 다시 요청하세요. 링크가 만료됐다면 새 링크가 필요합니다.</p></details></section>`,2)
}
window.onboardNext=function(p){
  if(p&&p.onboarded){if(LIVE.joinTarget&&!(LIVE.memberships||[]).some(m=>m.brandId===LIVE.joinTarget))navigate('join');else navigate('community')}
};
function onboardingPage(){
  return publicFrame(`<section class="entry-card"><span class="eyebrow">YOUR CREATOR PROFILE</span><h1>브랜드에 나를 소개해요.</h1><p class="muted">국가·배송 가능 국가·대화 언어와 TikTok 계정을 알려주세요.<br>나중에 설정에서 바꿀 수 있어요.</p>${onboardingFormHtml(true)}</section>`,3)
}
function joinPage(){
  const bid=LIVE.joinTarget;
  if(!bid)return window.__ME?(navigate('community'),''):loginPage();
  const b=LIVE.joinBrandInfo&&!LIVE.joinBrandInfo.missing?LIVE.joinBrandInfo:{name:bid};
  const joined=(LIVE.memberships||[]).some(m=>m.brandId===bid);
  const ready=entryReady();
  const appCard=LIVE.applicationToken?recruitmentCardHtml():'';
  return publicFrame(`<section class="entry-card"><div class="entry-brand">${avatar((b.name||bid).slice(0,1).toUpperCase())}<div><span class="eyebrow">BRAND MEMBERSHIP</span><h1>${E(b.name||bid)}</h1></div></div><p class="muted">${E(b.tagline||'크리에이터와 함께 만드는 브랜드')}</p><div class="join-checklist"><div><b># 커뮤니티</b><span>공지·자유대화·촬영 팁</span></div><div><b>▦ 캠페인</b><span>멤버 대상 모집과 신청</span></div><div><b>◌ 담당자 DM</b><span>샘플·일정·조건 문의</span></div></div>${joined?`<div class="notice-box">✓ 이미 이 브랜드의 멤버예요 — 중복 가입은 다시 등록되지 않습니다.</div>${btn('커뮤니티 열기',`selectBrand('${E(bid)}');navigate('community')`,'primary wide')}`:!ready?`<div class="notice-box"><b>입장 준비가 아직 끝나지 않았어요.</b> 프로필 저장과 TikTok 계정 소유 인증을 완료해야 브랜드에 합류할 수 있어요.</div>${btn('프로필·TikTok 인증으로 이동',"navigate('onboarding')",'primary wide')}`:`${appCard}<form onsubmit="event.preventDefault();joinBrandLive('${E(bid)}')"><label class="journey-checkbox"><input type="checkbox" required>이 브랜드의 크리에이터 커뮤니티(PR 리스트)에 참여하겠습니다.</label><button class="button primary wide" style="margin-top:25px" ${LIVE.joinBusy?'disabled':''}>${LIVE.joinBusy?'참여 처리 중…':'브랜드 커뮤니티 참여'}</button></form>`}</section>`,4)
}
function recruitmentCardHtml(){
  if(LIVE.applicationError)return `<div class="notice-box" role="alert"><b>모집 링크 확인 필요</b><br>${E(LIVE.applicationError)}</div>`;
  const r=LIVE.applicationContext;
  if(!r)return '<div class="notice-box" role="status">제안받은 모집 정보를 확인하는 중입니다…</div>';
  return `<div class="notice-box"><b>${E(r.brandName)} · 모집 제안</b><br>${E(r.productName||'브랜드 PR 리스트')}${r.campaignName?' · '+E(r.campaignName):''}<br>${LIVE.applicationDone?'✓ 신청 접수 완료 · 참여 검토 대기':'아래 참여를 완료하면 이 모집 신청도 함께 진행할 수 있어요.'}</div>${!LIVE.applicationDone&&window.__ME?`<label class="journey-checkbox"><input id="recruitmentConsent" type="checkbox">이 브랜드 PR 리스트 합류 및 해당 모집 신청을 확인합니다.</label><button class="button wide" style="margin-top:12px" onclick="applyRecruitment()" ${LIVE.applicationBusy?'disabled':''}>${LIVE.applicationBusy?'저장 중…':'이 모집에 신청하기'}</button>`:''}`
}
function welcomePage(){
  const bid=LIVE.joinTarget||((brandsLive()[0]||{}).brandId);
  const b=brandById(bid)||{name:bid||'theprlist'};
  return publicFrame(`<section class="entry-card center"><div class="entry-symbol">${I('check',28)}</div><span class="eyebrow">WELCOME TO THE COMMUNITY</span><h1>${E(b.name)}에서 만나요.</h1><p class="muted">브랜드 커뮤니티 참여가 완료됐어요.<br>공지와 모집 중인 캠페인을 먼저 살펴보세요.</p><div class="first-steps"><button onclick="selectBrand('${E(bid||'')}');ui.channel='notice';navigate('community');slackRoom('notice')"><span>01</span><div><b>커뮤니티 공지 읽기</b><small>처음 참여한 멤버를 위한 안내</small></div>${I('arrow',15)}</button><button onclick="navigate('campaigns')"><span>02</span><div><b>함께할 캠페인 찾기</b><small>제품·조건·모집 국가 확인</small></div>${I('arrow',15)}</button><button onclick="navigate('achievements')"><span>03</span><div><b>첫 미션 확인하기</b><small>합류·첫 인사·첫 신청 미션</small></div>${I('arrow',15)}</button></div>${btn('브랜드 커뮤니티 들어가기',`selectBrand('${E(bid||'')}');navigate('community')`,'primary wide')}</section>`,4)
}

/* ── 이용 안내(원본 '전체 이용 흐름' 치환 — 상태 조작 없음, 실제 안내) ── */
const guideGroups=[
  ['초대·가입',[['브랜드 초대 확인','초대 링크(?brand=)에서 브랜드 정보를 확인해요.',''],['이메일 로그인','비밀번호 없이 메일 링크로 로그인해요 (15분 유효).',''],['프로필 · TikTok 인증','국가·언어·배송 가능 국가 저장과 TikTok 소유 인증까지 완료해야 입장 준비가 끝나요.','settings'],['브랜드 참여','참여 확인 후 PR 리스트 멤버가 돼요 — 중복 가입은 다시 등록되지 않아요.','']]],
  ['캠페인·신청',[['모집 목록','내 멤버십 브랜드의 모집 중 캠페인을 봐요.','campaigns'],['캠페인 상세','제품·커미션·대상 국가·마감을 확인해요.','campaigns'],['참여 신청','신청 접수와 최종 선정은 달라요 — 선정 후 조건을 확인해요.','campaigns']]],
  ['협업 진행',[['선정 · 조건 확인','제안 수수료를 확인하고 TikTok 핸들로 합의해요.','work'],['샘플 배송','브랜드가 송장을 등록하면 배송 상태가 표시돼요.','work'],['콘텐츠 · Spark 제출','게시 링크와 광고 권한(Spark) 코드를 제출해요.','work'],['협업 완료','브랜드 확인 후 완료 — 확정 수수료 기준으로 정산돼요.','work']]],
  ['커뮤니티·활동',[['브랜드 채널','공지·자유대화·콘텐츠 팁 — 내 언어로 자동 번역돼요.','community'],['담당자 DM','나와 담당자만 보는 1:1 대화예요.','messages'],['브랜드 랭킹','완료한 협업과 검증된 활동 XP 기준이에요.','ranking'],['미션·배지','합류·첫 인사·신청·합의·제출·완료 미션으로 성장해요.','achievements']]],
];
function routesPage(){
  return JHead('HOW IT WORKS','이용 안내','처음 받은 초대부터 협업 완료까지, 서비스가 진행되는 순서예요.',btn('내 협업 보기',"navigate('work')",'primary'))+`<div class="route-map">${guideGroups.map(([group,items],g)=>`<section class="card route-group"><div class="route-group-head"><span>0${g+1}</span><h2>${group}</h2><small>${items.length}단계</small></div>${items.map(([t,d,page],i)=>page?`<button onclick="navigate('${page}')"><span class="route-num">${String(i+1).padStart(2,'0')}</span><b>${t}</b><small>${d}</small>${I('arrow',13)}</button>`:`<button style="cursor:default"><span class="route-num">${String(i+1).padStart(2,'0')}</span><b>${t}</b><small>${d}</small></button>`).join('')}</section>`).join('')}</div><div class="notice-box">캠페인 선정과 참여 조건은 브랜드와 확정합니다. 랭킹·XP는 서버가 검증한 활동에만 1회 지급돼요.</div>`
}

/* ── 캠페인 신청 — 실제 접수(아이디어 메모는 담당자 DM으로 전달) ── */
function applicationPage(){
  const c=campaignById(ui.routeId)||campaignById(ui.campaign);
  if(!c)return JHead('CAMPAIGN APPLICATION','캠페인 참여 신청','캠페인을 찾을 수 없어요.')+empty('campaigns','캠페인을 찾을 수 없어요.','모집이 마감되었거나 멤버십 브랜드의 캠페인이 아닐 수 있어요.',btn('캠페인 목록',"navigate('campaigns')",'primary'));
  const applied=c.myStatus!=='none'||!!c.termsState;
  const gate=!entryReady();
  const handle=(LIVE.profile&&LIVE.profile.tiktokHandle)||'';
  return JHead('CAMPAIGN APPLICATION','캠페인 참여 신청',E(c.name)+' · '+E(c.brandName||c.brandId),btn('상세로 돌아가기',`navigate('detail','${E(c.campaignId)}')`))+`<div class="journey-two-col"><section class="card journey-form-card">${applied?`<h2>이미 신청한 캠페인이에요.</h2><p class="muted">브랜드 검토 결과를 기다려 주세요.</p><div class="row" style="margin-top:14px">${btn('신청 상태 보기',`navigate('applicationstatus','${E(c.campaignId)}')`,'primary')}${btn('다른 캠페인 보기',"navigate('campaigns')")}</div>`:gate?`<h2>입장 준비가 먼저예요.</h2><p class="muted">프로필 저장과 TikTok 계정 소유 인증을 완료해야 캠페인에 신청할 수 있어요.</p>${btn('프로필·TikTok 인증으로 이동',"ui.setting='profile';navigate('settings')",'primary')}`:c.eligible===false?`<h2>이 캠페인의 대상 지역이 아니에요.</h2><p class="muted">${E(c.ineligibleReason||'')}</p>${btn('프로필에서 국가 확인',"ui.setting='profile';navigate('settings')",'primary')}`:campExpired(c)?`<h2>모집이 마감됐어요.</h2><p class="muted">다음 캠페인에서 새로운 기회를 만나보세요.</p>${btn('다른 캠페인 보기',"navigate('campaigns')",'primary')}`:`<h2>나의 콘텐츠 아이디어를 알려주세요.</h2><p class="muted">제품을 어떤 장면에서 어떻게 소개하고 싶나요?</p><form onsubmit="event.preventDefault();finishApplication(this,'${E(c.campaignId)}')"><div class="fields"><div class="field"><label for="journeyHandle">TikTok 계정</label><input id="journeyHandle" value="${E(handle)}" readonly><small>프로필의 계정으로 신청돼요 — 변경은 <button type="button" class="text-link" onclick="ui.setting='profile';navigate('settings')">설정 → 프로필</button>에서.</small></div><div class="field"><label for="journeyIdea">콘텐츠 아이디어 <span class="muted">· 선택</span></label><textarea id="journeyIdea" name="idea" maxlength="500" rows="5" placeholder="제품과 나의 일상이 만나는 장면을 소개해 주세요. 입력하면 담당자 DM으로 함께 전달돼요."></textarea></div><label class="journey-checkbox"><input required type="checkbox">모집 국가·콘텐츠 기준·제안 커미션을 확인했습니다.</label></div><div class="notice-box">신청 접수와 최종 선정은 다릅니다. 선정 후 참여 조건을 별도로 확인합니다.</div><button class="button primary" ${LIVE.applyBusy[c.campaignId]?'disabled':''}>${LIVE.applyBusy[c.campaignId]?'신청 중…':'신청하기 '+I('arrow',14)}</button></form>`}</section><aside>${campaignSummary(c)}</aside></div>`
}
function campaignSummary(c){return `<section class="card journey-summary"><img src="${campaignArt(c)}" alt="캠페인 제품"><div><span class="eyebrow">${E(c.brandName||c.brandId)}</span><h3>${E(c.name)}</h3><p>${E(c.product||'')}</p><div class="summary-row"><span>제안 커미션</span><b>${c.affiliatePct!=null?E(c.affiliatePct)+'%':'확인 필요'}</b></div><div class="summary-row"><span>보상 유형</span><b>${E(rewardLabel(c.rewardType))}</b></div><div class="summary-row"><span>모집 마감</span><b>${c.deadline?E(String(c.deadline).slice(0,10)):'별도 안내'}</b></div></div></section>`}
function finishApplication(f,id){
  const idea=(f.idea&&f.idea.value||'').trim();
  const c=campaignById(id);
  applyCampaign(id).then((applied)=>{
    // 신청이 접수된 경우에만 아이디어를 전달한다 — 메모 전달이 실패해도
    // 신청을 중복 접수하지 않고 DM 초안으로 보관한다.
    if(applied!==true||!idea||!c)return;
    relayToManagerDm(c.brandId,'[캠페인 신청 아이디어] '+(c.name||id)+' — '+idea).then(sent=>{
      if(sent!==true)toast(sent==='lost'
        ?'신청은 접수됐어요. 아이디어 전달에 실패했어요 — 담당자 DM에서 직접 전해 주세요.'
        :'신청은 접수됐어요. 아이디어 메모 전달은 실패해 담당자 DM 초안으로 보관했어요 — DM에서 보내기만 누르면 됩니다.');
    });
  });
}
function appliedPage(){
  const c=campaignById(ui.routeId)||campaignById(ui.campaign);
  if(!c)return routesPage();
  return `<section class="card journey-result"><div class="entry-symbol">${I('check',26)}</div><span class="eyebrow">APPLICATION RECEIVED</span><h1>신청이 접수되었어요.</h1><p>${E(c.name)} · ${E(c.brandName||c.brandId)}<br>브랜드가 확인한 뒤 결과를 알림으로 안내해요.</p><ol class="mini-timeline"><li class="done">신청 접수</li><li class="current">브랜드 검토</li><li>선정 시 조건 확인</li></ol><div class="row">${btn('신청 상태 보기',`navigate('applicationstatus','${E(c.campaignId)}')`,'primary')}${btn('다른 캠페인 보기',"navigate('campaigns')")}</div><small>선정 결과는 알림과 내 협업에서 확인할 수 있어요.</small></section>`
}
function applicationStatusPage(){
  const c=campaignById(ui.routeId)||campaignById(ui.campaign);
  if(!c)return routesPage();
  const offer=offerByCampaign(c.campaignId);
  const rejected=c.myStatus==='rejected';
  return JHead('APPLICATION STATUS',offer?'선정됐어요 — 조건을 확인하세요.':rejected?'이번에는 함께하지 못했어요.':'브랜드가 신청을 검토하고 있어요.',E(c.name))+`<div class="journey-two-col"><section class="card journey-form-card"><div class="row between"><h2>나의 신청</h2>${offer?pill(offerStateLabel(offer.state)):rejected?pill('미선정','gray'):pill('검토 중')}</div><div class="summary-row"><span>TikTok 계정</span><b>${E((LIVE.profile&&LIVE.profile.tiktokHandle)||'프로필 미입력')}</b></div><div class="line"></div>${offer?`<p class="journey-copy">브랜드가 참여를 제안했어요. 내 협업에서 수수료와 조건을 확인하고 합의를 진행하세요.</p><div class="row">${btn('내 협업에서 진행',`navigate('collaboration','${E(c.campaignId)}')`,'primary')}</div>`:rejected?`<p class="journey-copy">신청해 주셔서 감사합니다. 다음 제품·캠페인에서 새로운 기회를 만나보세요.</p><div class="row">${btn('다른 캠페인 보기',"navigate('campaigns')",'primary')}</div>`:`<div class="notice-box">선정되면 알림과 내 협업에 다음 행동이 표시됩니다. 모집 마감·결과 일정은 브랜드 공지를 확인하세요.</div><div class="row">${btn('브랜드 담당자에게 문의',`openDm('${E(c.brandId)}')`)}${btn('내 협업 보기',"navigate('work')",'primary')}</div>`}</section>${campaignSummary(c)}</div>`
}

/* ── 내 협업 — 실제 campaign_terms 상태 기반 ── */
const workStages={
  selected:['선정되었어요. 조건을 확인해 주세요.','제안 수수료·콘텐츠·일정을 확인하고 TikTok 핸들로 합의하면 확정돼요.'],
  terms_agreed:['조건을 확인했어요. 샘플 발송을 기다려 주세요.','브랜드가 샘플을 발송하면 송장이 이곳에 표시돼요. 콘텐츠는 지금부터 준비할 수 있어요.'],
  sample_shipped:['샘플이 발송됐어요. 이제 당신의 이야기를 담아주세요.','송장을 확인하고, 콘텐츠를 게시한 뒤 링크를 제출해 주세요.'],
  content_submitted:['브랜드가 콘텐츠를 검토하고 있어요.','제출한 링크를 다시 확인할 수 있어요. Spark 코드는 지금도 등록·수정할 수 있어요.'],
  revision_requested:['담당자가 수정을 요청했어요.','요청 내용을 확인한 뒤 변경된 콘텐츠를 다시 제출해 주세요.'],
  completed:['협업을 완료했어요.','콘텐츠와 확정 조건을 다시 확인하고 다음 기회를 만나보세요.'],
  declined:['이 제안을 거절했어요.','다른 캠페인에서 새로운 기회를 만나보세요.'],
};
workPage=function(){
  if(LIVE.loadErr.offers)return JHead('MY COLLABORATIONS','내 협업','다음 할 일과 담당자의 피드백을 확인하세요.')+empty('globe','협업 목록을 불러오지 못했어요.','연결 상태를 확인한 뒤 다시 시도해 주세요.',btn('다시 불러오기','collabRefresh()','primary'));
  if(!LIVE.offers)return JHead('MY COLLABORATIONS','내 협업','다음 할 일과 담당자의 피드백을 확인하세요.')+'<div class="loading-lines" role="status"><div></div><div></div><div></div></div>';
  const offers=LIVE.offers;
  const active=offers.filter(o=>['selected','terms_agreed','sample_shipped','content_submitted','revision_requested'].includes(o.state));
  const done=offers.filter(o=>o.state==='completed');
  const appliedCs=campaignsLive().filter(c=>c.myStatus==='applied'&&!c.termsState);
  const todo=actionableOffers().length;
  const listFor=f=>f==='active'?active:f==='completed'?done:[];
  const body=ui.workFilter==='applied'
    ?(appliedCs.length?`<div class="campaign-grid">${appliedCs.map(c=>campaignCard(c)).join('')}</div>`:empty('campaigns','검토 중인 신청이 없어요.','마음에 드는 캠페인을 살펴보고 신청해 보세요.',btn('캠페인 둘러보기',"navigate('campaigns')",'primary')))
    :(listFor(ui.workFilter).length?`<div class="work-list">${listFor(ui.workFilter).map(o=>{const c=campaignById(o.campaignId)||{};const st=workStages[o.state]||['조건 확인 필요',''];return `<article class="card work-card"><div class="work-top"><img class="work-thumb" src="${campaignArt(c&&c.campaignId?c:o)}" alt="캠페인 제품"><div><div class="mini-brand">${E(o.brandName||o.brandId)}</div><h3>${E(o.campaignName||o.campaignId)}</h3><span class="muted" style="font-size:11px">${o.agreedCommissionPct!=null?'확정 커미션 '+o.agreedCommissionPct+'%':o.commissionPct!=null?'제안 커미션 '+o.commissionPct+'%':'조건 확인 필요'}</span></div><div class="right">${pill(o.state==='revision_requested'?'수정 요청':offerStateLabel(o.state),['selected','sample_shipped','revision_requested'].includes(o.state)?'sand':'')}${btn('담당자 DM',`openDm('${E(o.brandId)}')`,'small')}</div></div>${progress(o.state)}<div class="work-action"><div><h4>${st[0]}</h4><p>${st[1]}</p></div>${btn(o.state==='completed'?'완료 기록 보기':'협업 열기',`navigate('collaboration','${E(o.campaignId)}')`,'primary small')}</div></article>`}).join('')}</div>`:empty(ui.workFilter==='completed'?'check':'work',ui.workFilter==='completed'?'새로운 완료 기록을 기다려요.':'아직 진행 중인 협업이 없어요.',ui.workFilter==='completed'?'협업이 완료되면 제출한 콘텐츠와 확정 조건을 이곳에서 다시 확인할 수 있어요.':'지원한 캠페인은 브랜드 검토 후 이곳에서 진행할 수 있어요.',btn(ui.workFilter==='completed'?'진행 중인 협업 보기':'캠페인 둘러보기',ui.workFilter==='completed'?"ui.workFilter='active';render()":"navigate('campaigns')",'primary')));
  return JHead('MY COLLABORATIONS','내 협업','다음 할 일과 담당자의 피드백을 확인하세요.')+`<div class="stats"><div class="card stat"><small>진행 중인 협업</small><strong>${active.length}<em>개</em></strong></div><div class="card stat"><small>확인할 일</small><strong>${todo}<em>개</em></strong></div><div class="card stat"><small>완료</small><strong>${done.length}<em>개</em></strong></div></div><div class="tabs">${[['active','진행 중'],['applied','신청 내역'],['completed','완료']].map(([k,l])=>`<button class="${ui.workFilter===k?'active':''}" onclick="ui.workFilter='${k}';render()">${l}</button>`).join('')}</div>${body}<div class="notice-box">진행 순서: 선정 → 조건 합의 → 샘플 배송 → 콘텐츠·Spark 제출 → 완료. 대금 지급(정산 송금) 화면은 공개 준비 중입니다 — 확정 조건은 각 협업 기록 기준이에요.</div>`
};
function activeOffer(){return offerByCampaign(ui.activeCollab)||null}
function collaborationPage(){
  if(ui.routeId&&offerByCampaign(ui.routeId))ui.activeCollab=ui.routeId;
  const o=activeOffer()||((LIVE.offers||[])[0]||null);
  if(!LIVE.offers)return '<div class="loading-lines" role="status"><div></div><div></div><div></div></div>';
  if(!o)return JHead('COLLABORATION','협업 상세','선정된 협업이 아직 없어요.')+empty('work','아직 선정된 협업이 없어요.','지원한 캠페인은 브랜드 검토 후 이곳에서 진행할 수 있어요.',btn('캠페인 보기',"navigate('campaigns')",'primary'));
  if(!ui.activeCollab)ui.activeCollab=o.campaignId;
  const c=campaignById(o.campaignId)||{};
  const s=o.state,t=workStages[s]||['상태 확인 필요',''];
  const stages=OFFER_STEPS;
  const idx=s==='revision_requested'?3:stages.indexOf(s);
  const history=[
    ['캠페인 선정','브랜드가 선정 후 참여 조건을 제안했어요.',idx>=0],
    ['조건 합의',o.agreedCommissionPct!=null?'확정 커미션 '+o.agreedCommissionPct+'%'+(o.tiktokHandle?' · '+o.tiktokHandle:''):'제안 수수료 확인 후 합의하면 확정돼요.',idx>=1],
    ['샘플 배송',o.sampleTracking?'송장 '+o.sampleTracking:'브랜드가 발송하면 송장이 표시돼요.',idx>=2],
    ['콘텐츠·Spark 제출',o.contentUrl?'제출: '+o.contentUrl+(s==='revision_requested'?' · 수정 요청 받음':''):'게시 링크와 Spark 코드를 제출해요.',idx>=3&&s!=='revision_requested'],
    ...(o.revisionNote&&s==='revision_requested'?[['수정 요청','담당자: "'+o.revisionNote+'"',false]]:[]),
    ['협업 완료',s==='completed'?'브랜드 확인 완료 — 확정 수수료 기준 정산':'브랜드 확인 후 완료 처리돼요.',idx>=4],
  ];
  return JHead('COLLABORATION',E(o.campaignName||o.campaignId),E(o.brandName||o.brandId)+' · '+E(c.product||'브랜드 제품'),btn('담당자 DM',`openDm('${E(o.brandId)}')`))+`<div class="journey-two-col"><div><section class="card collab-next"><div class="row between">${pill(s==='completed'?'협업 완료':s==='declined'?'거절한 제안':s==='revision_requested'?'수정 요청':'다음 할 일',['selected','sample_shipped','revision_requested'].includes(s)?'sand':'')}<small>${idx>=0?(idx+1)+' / 5 단계':''}</small></div><h2>${t[0]}</h2><p>${t[1]}</p>${collabAction(o,c)}</section><section class="card journey-form-card"><h2>협업 기록</h2><div class="collab-history">${history.map(([tt,p,done],i)=>`<div><i>${done?'✓':'•'}</i><section><b>${tt}</b><small>${done?'완료':'대기'}</small><p>${E(p)}</p></section></div>`).join('')}</div></section></div><aside><section class="card journey-summary"><div><h3>확정 조건</h3><div class="summary-row"><span>커미션</span><b>${o.agreedCommissionPct!=null?o.agreedCommissionPct+'% (확정)':o.commissionPct!=null?o.commissionPct+'% (제안)':'확인 필요'}</b></div><div class="summary-row"><span>제품</span><b>${E(c.product||'담당자와 확인')}</b></div><div class="summary-row"><span>보상 유형</span><b>${E(rewardLabel(c.rewardType))}</b></div><div class="summary-row"><span>광고 사용</span><b>${o.sparkCode?'Spark 코드 제출됨 ✓':'Spark 코드 별도 제출'}</b></div>${o.affiliateLink?`<div class="summary-row"><span>어필리에이트 링크</span><b style="overflow-wrap:anywhere">${E(o.affiliateLink)}</b></div>`:''}<div class="line"></div><button class="text-link" onclick="conditionsDialog('${E(o.campaignId)}')">조건 전체 보기 →</button></div></section><section class="card xp-next"><span>CREATOR GROWTH</span><h3>좋은 협업이 기록으로.</h3><p>합의·제출·완료는 서버가 검증해 XP와 배지로 쌓여요.</p><button class="text-link" onclick="navigate('achievements')">나의 미션·배지 →</button></section></aside></div>`
}
function collabAction(o,c){
  const id=E(o.campaignId);
  if(o.state==='selected')return `<div class="terms-list"><div><span>제안 커미션</span><b>${o.commissionPct!=null?o.commissionPct+'%':'-'}</b></div><div><span>제품</span><b>${E(c.product||'담당자와 확인')}</b></div><div><span>광고 사용</span><b>합의 후 Spark 코드 제출</b></div></div><form onsubmit="event.preventDefault();agreeOffer('${id}',true)"><div class="field" style="margin-top:14px"><label for="agreeHandle">본인 TikTok 핸들</label><input id="agreeHandle" value="${E((LIVE.profile&&LIVE.profile.tiktokHandle)||'')}" placeholder="@myhandle"></div><label class="journey-checkbox"><input required type="checkbox">수수료·제출 기준·일정을 확인했습니다.</label><div class="row" style="margin-top:18px"><button class="button primary" ${LIVE.agreeBusy?'disabled':''}>${LIVE.agreeBusy?'처리 중…':'수수료 합의 — 확정하기'}</button><button type="button" class="button" onclick="agreeOffer('${id}',false)" ${LIVE.agreeBusy?'disabled':''}>거절</button></div></form>`;
  if(o.state==='revision_requested')return `<div class="revision-note"><b>${E(o.brandName||o.brandId)} · 담당자 피드백</b><p>${E(o.revisionNote||'요청 내용은 담당자 DM에서 확인해 주세요.')}</p><small>${o.revisionRequestedAt?E(String(o.revisionRequestedAt).slice(0,16).replace('T',' '))+' 요청':''} · 이전 제출: ${E(o.contentUrl||'-')}</small></div><div class="fields" style="margin-top:14px"><div class="field"><label for="sparkCode">Spark Ads 코드 <span class="muted">· 등록/수정 가능</span></label><div class="row" style="gap:8px"><input id="sparkCode" value="${E(o.sparkCode||'')}" placeholder="광고 사용에 합의한 경우 입력" style="flex:1"><button class="button small" onclick="submitSpark('${id}')" ${LIVE.sparkBusy?'disabled':''}>${o.sparkCode?'코드 수정':'코드 제출'}</button></div></div></div>${btn('수정본 제출',`navigate('submission','${id}')`,'primary')}`;
  if(o.state==='terms_agreed'||o.state==='sample_shipped')return `${o.state==='sample_shipped'?`<div class="shipping-status"><span>${I('work',22)}</span><div><b>브랜드에서 샘플을 발송했어요.</b><p>${o.sampleTracking?'송장: '+E(o.sampleTracking):'송장 정보는 담당자 DM에서 확인할 수 있어요.'}</p></div></div>`:`<div class="shipping-status"><span>${I('work',22)}</span><div><b>샘플 발송 대기 중이에요.</b><p>확정 커미션 ${o.agreedCommissionPct!=null?o.agreedCommissionPct+'%':'-'} · 발송되면 송장이 표시돼요.</p></div></div>`}${o.affiliateLink?`<p class="muted" style="font-size:12px;overflow-wrap:anywhere">어필리에이트 링크(브랜드 발급): ${E(o.affiliateLink)}</p>`:''}${shippingSection(o)}<div class="fields" style="margin-top:14px"><div class="field"><label for="sparkCode">Spark Ads 코드 <span class="muted">· 광고 사용 권한, 내가 발급</span></label><div class="row" style="gap:8px"><input id="sparkCode" value="${E(o.sparkCode||'')}" placeholder="브랜드와 광고 사용에 합의한 경우 입력" style="flex:1"><button class="button small" onclick="submitSpark('${id}')" ${LIVE.sparkBusy?'disabled':''}>${o.sparkCode?'코드 수정':'코드 제출'}</button></div><small>브랜드에만 전달되며 공개 커뮤니티에는 노출되지 않아요.</small></div></div>${btn('콘텐츠 제출하기',`navigate('submission','${id}')`,'primary')}`;
  if(o.state==='content_submitted')return `<div class="submission-record"><b>제출한 콘텐츠</b><p style="overflow-wrap:anywhere"><a href="${E(o.contentUrl||'#')}" target="_blank" rel="noopener">${E(o.contentUrl||'')}</a></p><small>담당자가 확인한 뒤 완료 처리를 안내합니다.</small></div><div class="fields" style="margin-top:14px"><div class="field"><label for="sparkCode">Spark Ads 코드 <span class="muted">· 지금도 등록/수정 가능</span></label><div class="row" style="gap:8px"><input id="sparkCode" value="${E(o.sparkCode||'')}" placeholder="광고 사용에 합의한 경우 입력" style="flex:1"><button class="button small" onclick="submitSpark('${id}')" ${LIVE.sparkBusy?'disabled':''}>${o.sparkCode?'코드 수정':'코드 제출'}</button></div><small>${o.sparkCode?'Spark 코드 제출됨 ✓ — 브랜드에만 전달돼요.':'Spark 코드는 브랜드에만 전달됩니다(커뮤니티 비노출).'}</small></div></div><div class="row">${btn('제출 링크 수정',`navigate('submission','${id}')`)}</div>`;
  if(o.state==='completed')return `<div class="completion-award"><span>✦</span><div><b>협업 완료</b><p>확정 수수료 ${o.agreedCommissionPct!=null?o.agreedCommissionPct+'%':'-'} 기준으로 정산됩니다.${o.contentUrl?`<br>제출 콘텐츠: <a href="${E(o.contentUrl)}" target="_blank" rel="noopener" style="overflow-wrap:anywhere">${E(o.contentUrl)}</a>`:''}${o.sparkCode?'<br>Spark 코드 제출됨 ✓':''}${o.affiliateLink?`<br>어필리에이트 링크(판매 추적): ${E(o.affiliateLink)}`:''}</p></div></div><div class="row">${btn('나의 배지 보기',"navigate('achievements')")}${btn('다음 캠페인 찾기',"navigate('campaigns')",'primary')}</div><small class="design-hint">대금 지급(정산 송금) 화면은 공개 준비 중 — 확정 조건은 위 기록 기준입니다.</small>`;
  if(o.state==='declined')return `<p class="muted">거절한 제안이에요.</p>${btn('다른 캠페인 보기',"navigate('campaigns')",'primary')}`;
  return btn('내 협업 목록',"navigate('work')",'primary');
}
function shippingSection(o){
  const sp=o.shipping;
  const editable=['selected','terms_agreed'].includes(o.state);
  if(sp&&!editable)return `<div class="shipping-status" style="margin-top:12px"><span>${I('space',20)}</span><div><b>샘플 수령 정보</b><p>${E(sp.recipient||'')} · ${E(sp.country||'')} · ${E(sp.address||'')} · ${E(sp.phone||'')}</p></div></div>`;
  if(!editable)return '';
  return `<div class="line"></div><h3 style="font-size:14px;margin:4px 0 2px">샘플을 받을 정보를 알려주세요.</h3><p class="muted" style="font-size:12px">수령 정보는 이 협업의 브랜드 담당자에게만 전달돼요.</p>${sp?`<div class="notice-box">저장됨: ${E(sp.recipient||'')} · ${E(sp.country||'')} · ${E(sp.address||'')} · ${E(sp.phone||'')} — 아래에서 수정할 수 있어요.</div>`:''}<form onsubmit="event.preventDefault();submitShipping('${E(o.campaignId)}')"><div class="fields"><div class="field-pair"><div class="field"><label for="shipRecipient">수령인</label><input id="shipRecipient" required maxlength="80" value="${E((sp&&sp.recipient)||'')}"></div><div class="field"><label for="shipCountry">수령 국가 (2자리)</label><input id="shipCountry" required maxlength="2" value="${E((sp&&sp.country)||(LIVE.profile&&LIVE.profile.country)||'')}" autocapitalize="characters"></div></div><div class="field"><label for="shipAddress">배송 주소</label><input id="shipAddress" required maxlength="300" value="${E((sp&&sp.address)||'')}"></div><div class="field"><label for="shipPhone">연락처</label><input id="shipPhone" required maxlength="40" value="${E((sp&&sp.phone)||'')}" autocomplete="off"></div><label class="journey-checkbox"><input id="shipConsent" type="checkbox" required ${sp?'checked':''}>샘플 배송에 필요한 정보 제공을 확인합니다.</label></div><button class="button small" style="margin-top:10px" ${LIVE.shippingBusy?'disabled':''}>${LIVE.shippingBusy?'저장 중…':sp?'수령 정보 수정':'수령 정보 저장'}</button></form>`;
}
function conditionsDialog(cid){
  const o=offerByCampaign(cid)||activeOffer();if(!o)return;
  const c=campaignById(o.campaignId)||{};
  modal(`<span class="eyebrow">COLLABORATION TERMS</span><h2 id="modalTitle">참여 조건</h2><p class="muted">${E(o.campaignName||o.campaignId)} · ${E(o.brandName||o.brandId)}</p><div class="summary-row"><span>${o.agreedCommissionPct!=null?'확정 커미션':'제안 커미션'}</span><b>${o.agreedCommissionPct!=null?o.agreedCommissionPct+'%':o.commissionPct!=null?o.commissionPct+'%':'확인 필요'}</b></div><div class="summary-row"><span>제품</span><b>${E(c.product||'담당자와 확인')}</b></div><div class="summary-row"><span>보상 유형</span><b>${E(rewardLabel(c.rewardType))}</b></div><div class="summary-row"><span>TikTok 핸들</span><b>${E(o.tiktokHandle||'합의 시 확인')}</b></div><div class="summary-row"><span>광고 사용</span><b>${o.sparkCode?'Spark 코드 제출됨 ✓':'Spark 코드 별도 제출'}</b></div><div class="notice-box">수수료와 조건은 서버에 기록된 합의 기준입니다. 변경이 필요하면 담당자 DM으로 문의하세요.</div><div class="modal-footer">${btn('담당자에게 질문',`closeModal();openDm('${E(o.brandId)}')`)}${btn('확인','closeModal()','primary')}</div>`)
}
function submissionPage(){
  if(ui.routeId&&offerByCampaign(ui.routeId))ui.activeCollab=ui.routeId;
  const o=activeOffer();
  if(!o)return workPage();
  const resub=o.state==='content_submitted';
  const revision=o.state==='revision_requested';
  const can=['terms_agreed','sample_shipped','revision_requested'].includes(o.state);
  return JHead('CONTENT SUBMISSION',revision?'수정본 제출':resub?'제출 링크 수정':'콘텐츠 제출',E(o.campaignName||o.campaignId)+' · '+E(o.brandName||o.brandId),btn('협업으로 돌아가기',`navigate('collaboration','${E(o.campaignId)}')`))+`<section class="card journey-form-card narrow-form">${revision?`<div class="revision-note"><b>수정 요청</b><p>${E(o.revisionNote||'')}</p><small>이전 제출: ${E(o.contentUrl||'-')}</small></div>`:''}${!can&&!resub?`<div class="notice-box">지금은 제출할 수 없는 상태예요 — ${E(offerStateLabel(o.state))}. 합의 후 제출할 수 있어요.</div>${btn('협업 상태 보기',`navigate('collaboration','${E(o.campaignId)}')`,'primary')}`:`${resub?`<div class="notice-box">검토 중인 제출 링크를 수정합니다 — 저장하면 담당자에게 수정된 링크가 보여요.<br>현재 제출: ${E(o.contentUrl||'-')}</div>`:''}<form onsubmit="event.preventDefault();finishContent(this,'${E(o.campaignId)}')"><div class="fields"><div class="field"><label for="journeyContent">콘텐츠·게시 링크</label><input id="journeyContent" name="url" type="url" required pattern="https://.*" placeholder="https://www.tiktok.com/@creator/video/…" value="${E(resub?(o.contentUrl||''):'')}"><small>담당자가 열어볼 수 있는 https 링크를 입력하세요.</small></div><div class="field"><label for="journeyMemo">담당자에게 남길 메모 <span class="muted">· 선택</span></label><textarea id="journeyMemo" name="memo" maxlength="500" placeholder="확인할 내용이나 변경한 점을 적어주세요 — 담당자 DM으로 함께 전달돼요."></textarea></div><label class="journey-checkbox"><input required type="checkbox">콘텐츠 가이드와 협찬 표기를 확인했습니다.</label></div><button class="button primary" style="margin-top:24px" ${LIVE.contentBusy?'disabled':''}>${LIVE.contentBusy?'제출 중…':revision?'수정본 제출':resub?'제출 링크 수정':'콘텐츠 제출'}</button></form>`}</section>`
}
function finishContent(f,cid){submitContent(cid,f.url.value.trim(),f.memo?f.memo.value:'')}

/* ── 랭킹·미션·배지 — 서버 검증 XP ── */
function levelOf(total){return Math.floor((total||0)/300)+1}
function rankingPage(){
  const b=currentBrand();
  if(!b)return JHead('BRAND COMMUNITY','브랜드 랭킹','참여한 브랜드가 없어요.')+empty('community','아직 함께하는 브랜드가 없어요.','브랜드에 참여하면 멤버 랭킹을 볼 수 있어요.',btn('초대 링크로 참여','inviteDialog()','primary'));
  const rankSet=LIVE.ranking[b.brandId];
  const ranked=rankSet&&(ui.rankPeriod==='week'?rankSet.week:rankSet.all);
  const xp=(LIVE.xp&&LIVE.xp.total)||0;
  const myHandle=(LIVE.profile&&LIVE.profile.tiktokHandle)||'';
  const myIdx=(ranked||[]).findIndex(p=>p.me||(myHandle&&p.handle===myHandle));
  return JHead('BRAND COMMUNITY','함께 만드는 좋은 협업',E(b.name)+' 멤버들의 활동 기록',btn('점수 기준','xpRulesDialog()'))+`<div class="ranking-layout"><div><div class="leaderboard-intro card"><div><span class="eyebrow">${E(b.name)} · CREATOR BOARD</span><h2>좋은 협업은, 기록으로 남아요.</h2><p>대화량 대신 약속을 지키고 함께 완성한 활동을 중심으로 봅니다.</p></div><div class="leaderboard-mark">✦</div></div><div class="tabs">${[['week','이번 주'],['all','전체 기록']].map(([k,t])=>`<button class="${ui.rankPeriod===k?'active':''}" onclick="ui.rankPeriod='${k}';render()">${t}</button>`).join('')}</div>${!rankSet||!ranked?(LIVE.spaceBusy?'<div class="loading-lines" role="status"><div></div><div></div><div></div></div>':empty('globe','랭킹을 불러오지 못했어요.','잠시 후 다시 시도해 주세요.',btn('다시 불러오기',`loadSpace('${E(b.brandId)}')`,'primary'))):ranked.length?`<section class="card ranking-table"><div class="ranking-row ranking-table-head"><span>순위</span><span>크리에이터</span><span>활동 XP</span><span></span></div>${ranked.map((p,i)=>`<div class="ranking-row ${p.me||(myHandle&&p.handle===myHandle)?'is-me':''}"><span class="rank-number ${i<3?'top':''}">${p.rank}</span><div class="rank-person">${avatar((p.handle||'크')[0].toUpperCase())}<div><b>${E(p.handle||'크리에이터')} ${p.me||(myHandle&&p.handle===myHandle)?'<em>나</em>':''}</b><small>Level ${levelOf(p.total)}</small></div></div><strong>${Number(p.total||0).toLocaleString()}</strong><span></span></div>`).join('')}</section>`:empty('campaigns',ui.rankPeriod==='week'?'이번 주 기록이 아직 없어요.':'아직 기록이 없어요.','미션을 완료하면 이곳에 기록이 쌓여요.','')}<div class="notice-box">국가·계약 금액·판매량으로 순위를 매기지 않습니다. 공개 정보는 핸들·활동 XP뿐이에요 — 연락처·배송지·개별 계약 금액은 표시하지 않습니다.</div></div><aside><section class="card my-level"><span class="eyebrow">MY CREATOR LEVEL</span><div class="level-emblem">✦</div><h2>Level ${levelOf(xp)}</h2><p>Rising Creator</p><div class="xp-bar"><i style="width:${xp%300/3}%"></i></div><div class="row between"><small>${xp.toLocaleString()} XP</small><small>다음 레벨까지 ${300-xp%300} XP</small></div><div class="line"></div><div class="summary-row"><span>${E(b.name)} 내 순위</span><b>${myIdx>=0?(myIdx+1)+'위':'기록 전'}</b></div>${btn('미션·배지 보기',"navigate('achievements')",'primary wide')}</section><section class="card xp-next"><h3>나의 활동을 나의 속도로.</h3><p>랭킹은 참고용입니다. 참여 기회와 캠페인 선정은 제품 적합도·콘텐츠 기준에 따라 별도로 결정합니다.</p></section></aside></div>`
}
const MISSION_SYMBOLS={join:'✦',first_message:'♡',application:'▦',agreement:'✓',content_submitted:'↗',completed:'◇'};
function missionAction(kind){
  const b=currentBrand();
  if(kind==='join')return inviteDialog();
  if(kind==='first_message'){if(b)slackRoom('chat');else inviteDialog();return}
  if(kind==='application')return navigate('campaigns');
  return navigate('work');
}
function achievementsPage(){
  const b=currentBrand();
  const xp=(LIVE.xp&&LIVE.xp.total)||0;
  const missions=b?LIVE.missions[b.brandId]:null;
  const doneCount=(missions||[]).filter(m=>m.done).length;
  return JHead('CREATOR GROWTH','작은 활동, 쌓이는 성장.',(b?E(b.name)+' 미션과 ':'')+'나의 배지, 다음 목표를 확인하세요.',btn('브랜드 랭킹',"navigate('ranking')"))+`<section class="card growth-overview"><div class="growth-level">✦</div><div><span class="eyebrow">MY CREATOR LEVEL</span><h2>Level ${levelOf(xp)} · Rising Creator</h2><p>${xp.toLocaleString()} XP · 다음 레벨까지 ${300-xp%300} XP</p><div class="xp-bar"><i style="width:${xp%300/3}%"></i></div></div><button class="text-link" onclick="xpRulesDialog()">점수는 어떻게 쌓이나요? →</button></section><div class="tabs"><button class="${ui.missionTab==='missions'?'active':''}" onclick="ui.missionTab='missions';render()">나의 미션</button><button class="${ui.missionTab==='badges'?'active':''}" onclick="ui.missionTab='badges';render()">배지 컬렉션 <small>${doneCount} / ${(missions||[]).length||6}</small></button></div>${!b?empty('community','브랜드에 참여하면 미션이 열려요.','브랜드의 초대 링크로 합류해 첫 미션을 시작하세요.',btn('초대 링크로 참여','inviteDialog()','primary')):!missions?(LIVE.spaceBusy?'<div class="loading-lines" role="status"><div></div><div></div><div></div></div>':empty('globe','미션을 불러오지 못했어요.','잠시 후 다시 시도해 주세요.',btn('다시 불러오기',`loadSpace('${E(b.brandId)}')`,'primary'))):ui.missionTab==='missions'?`<div class="mission-grid">${missions.map((m,i)=>`<section class="card mission-card"><div class="row between"><span class="mission-symbol">${m.done?'✓':String(i+1).padStart(2,'0')}</span>${pill(m.done?'완료':'+'+m.points+' XP',m.done?'':'gray')}</div><h3>${E(m.label)}</h3><p>서버가 검증한 활동에만 1회 지급돼요 — 클릭이나 반복 제출로는 쌓이지 않아요.</p>${m.done?'<span class="mission-done">'+I('check',14)+' 달성한 미션</span>':btn('진행하기',`missionAction('${E(m.kind)}')`,'small')}</section>`).join('')}</div>`:`<div class="badge-grid">${missions.map(m=>`<section class="card badge-card ${m.done?'earned':'locked'}"><span>${MISSION_SYMBOLS[m.kind]||'✦'}</span><h3>${E(m.label)}</h3><p>+${m.points} XP</p><small>${m.done?'획득한 배지':'달성 조건을 기다리고 있어요'}</small></section>`).join('')}</div>`}<div class="notice-box">XP와 배지는 ${b?E(b.name)+' 활동 기준 ':''}서버 검증 이벤트로만 쌓입니다. 랭킹은 캠페인 선정이나 실제 수익을 보장하지 않아요.</div>`
}
function xpRulesDialog(){modal(`<span class="eyebrow">FAIR PLAY</span><h2 id="modalTitle">양보다, 좋은 협업.</h2><p class="muted">브랜드별 활동 점수·배지 기준입니다 — 각 항목은 서버 검증 후 1회만 지급돼요.</p><div class="terms-list"><div><span>브랜드 PR 리스트 합류</span><b>+50 XP</b></div><div><span>커뮤니티에 첫 인사</span><b>+20 XP</b></div><div><span>캠페인 신청</span><b>+30 XP</b></div><div><span>선정 후 조건 확인(수수료 합의)</span><b>+60 XP</b></div><div><span>콘텐츠 제출</span><b>+80 XP</b></div><div><span>협업 완료</span><b>+120 XP</b></div></div><div class="notice-box">단순 메시지 수·반복 클릭·무분별한 초대에는 점수를 주지 않습니다. 랭킹은 캠페인 선정이나 실제 수익을 보장하지 않습니다.</div><p class="muted">공개 정보는 핸들·활동 XP·배지입니다. 연락처·배송지·개별 계약 금액은 랭킹에 표시하지 않습니다.</p><div class="modal-footer">${btn('확인','closeModal()','primary')}</div>`)}

/* ── 실제 오류·복귀 상태 ── */
function statePage(kindArg){
  const kind=kindArg||ui.routeId;
  const data={
    expired:['로그인 링크가 만료되었어요.','링크는 15분 동안 1회만 쓸 수 있어요. 새 로그인 링크를 다시 요청해 주세요.','새 링크 요청하기','login'],
    invalid:['초대 정보를 확인할 수 없어요.','링크가 잘못되었거나 사용할 수 없는 초대입니다. 받은 주소를 다시 확인해 주세요.','로그인으로 이동','login'],
    mismatch:['초대를 받은 이메일과 달라요.','이 제안이 전달된 이메일로 로그인하거나 브랜드 담당자에게 확인해 주세요.','다른 이메일로 로그인','login'],
    duplicate:['이미 참여 중인 브랜드예요.','기존 멤버십을 그대로 사용합니다. 중복 가입은 다시 만들지 않습니다.','커뮤니티 열기','community'],
    rejected:['이번에는 함께하지 못했어요.','신청해 주셔서 감사합니다. 다음 제품·캠페인에서 새로운 기회를 만나보세요.','다른 캠페인 보기','campaigns'],
    error:['화면을 불러오지 못했어요.','저장된 데이터가 사라진 것은 아닙니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.','다시 불러오기','community'],
    empty:['아직 함께하는 브랜드가 없어요.','브랜드가 보낸 초대 링크로 커뮤니티에 참여할 수 있습니다.','내 공간 보기','space'],
    offline:['메시지를 보내지 못했어요.','연결이 불안정합니다. 작성한 내용은 그대로 보관되어 있어요.','대화로 돌아가기','community'],
  }[kind];
  if(kind==='loading')return JHead('LOADING','브랜드 공간을 준비하고 있어요.','잠시만 기다려 주세요.')+'<section class="card loading-lines"><div></div><div></div><div></div></section>';
  const d=data||['화면을 확인할 수 없어요.','주소를 확인한 뒤 다시 열어 주세요.','커뮤니티로','community'];
  if(['expired','invalid','mismatch','duplicate'].includes(kind)&&!window.__ME)
    return publicFrame(`<section class="entry-card center"><div class="entry-symbol">${I(kind==='duplicate'?'check':'link',25)}</div><h1>${d[0]}</h1><p class="muted">${d[1]}</p>${btn(d[2],`navigate('${d[3]}')`,'primary wide')}${LIVE.joinTarget?`<button class="entry-signin" onclick="navigate('invite','${E(LIVE.joinTarget)}')">초대 정보 다시 보기</button>`:''}</section>`);
  return `<section class="card journey-result"><div class="entry-symbol">${I(kind==='offline'?'messages':'globe',25)}</div><h1>${d[0]}</h1><p>${d[1]}</p>${btn(d[2],`navigate('${d[3]}')`,'primary')}</section>`
}

/* ── 최종 렌더 — 공개 진입 vs 멤버 셸 ── */
const journeyPublic=['invite','login','checkemail','onboarding','join','welcome'];
const journeyScreens={routes:routesPage,application:applicationPage,applied:appliedPage,applicationstatus:applicationStatusPage,collaboration:collaborationPage,submission:submissionPage,ranking:rankingPage,achievements:achievementsPage,state:statePage};
render=function(){
  const root=$('#root');
  if(!LIVE.authKnown||LIVE.verifyState==='verifying'){
    root.innerHTML=publicFrame(`<section class="entry-card center"><div class="loading-lines" role="status" aria-label="로그인 확인 중"><div></div><div></div><div></div></div><p class="muted">${LIVE.verifyState==='verifying'?'로그인 링크를 확인하고 있어요…':'세션을 확인하고 있어요…'}</p></section>`);
    return;
  }
  if(!window.__ME){
    const pub=['invite','login','checkemail'].includes(ui.page)?ui.page:(ui.page==='state'?'state':(LIVE.joinTarget?'invite':'login'));
    if(pub==='state'){root.innerHTML=statePage();return}
    if(!['invite','login','checkemail'].includes(ui.page)){ui.page=pub;ui.routeId=pub==='invite'?(LIVE.joinTarget||''):''}
    root.innerHTML=({invite:invitationPage,login:loginPage,checkemail:checkEmailPage})[ui.page]();
    return;
  }
  // 온보딩 게이트 — 프로필 미완료면 온보딩부터 (설정·공개 상태 화면은 허용)
  if(LIVE.profile&&!LIVE.profile.onboarded&&!journeyPublic.includes(ui.page)&&ui.page!=='settings'&&ui.page!=='state'){
    ui.page='onboarding';
  }
  if(journeyPublic.includes(ui.page)){
    root.innerHTML=({invite:invitationPage,login:loginPage,checkemail:checkEmailPage,onboarding:onboardingPage,join:joinPage,welcome:welcomePage})[ui.page]()||'';
    return;
  }
  if(ui.page==='state'&&['expired','invalid','mismatch','duplicate'].includes(ui.routeId)&&!window.__ME){root.innerHTML=statePage();return}
  journeyBaseRender();
  const custom=journeyScreens[ui.page];
  if(custom){
    const pane=$('.slack-primary');
    if(pane){pane.className='slack-primary page-primary';pane.innerHTML=custom()}
  }
  const footer=$('.slack-side-bottom');
  if(footer&&!$('#routeShortcut')){footer.insertAdjacentHTML('beforebegin','<button id="routeShortcut" class="journey-route-shortcut" onclick="navigate(\'routes\')">'+I('campaigns',14)+' 이용 안내</button>')}
};
/* 모든 렌더 뒤에 사용자가 만지던 폼 값·체크를 복원한다(실패 재렌더 보존) */
const journeyRenderCore=render;
render=function(){journeyRenderCore();try{formRestore()}catch(e){}};
routeFromHash();
if(!location.hash){
  ui.page=LIVE.joinTarget?'invite':'community';
  ui.routeId=LIVE.joinTarget||'';
}
liveBoot();
