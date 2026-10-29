/* theprlist 크리에이터 워크스페이스 — 실서버 데이터 레이어.
   화면(마크업·클래스·흐름)은 docs/ui-reference/slack-v3 원본을 그대로 쓰고,
   이 파일이 예시 데이터를 대체한다: 실제 로그인(이메일 매직링크), 멤버십,
   커뮤니티 메시지(번역·스레드·검색·읽음), 캠페인·신청, 협업(조건 합의·샘플·
   콘텐츠·Spark), 알림, 프로필 온보딩·TikTok 입장 게이트, XP·미션·랭킹, 폴링.
   localStorage는 운영 DB 대용이 아니다 — JWT 세션, 언어 선택, 입력 초안,
   북마크 같은 이 브라우저만의 편의만 저장한다. */
(function(){
'use strict';

/* ── API 주소 — 기존 앱과 동일 규칙(?api=는 localhost에서만 저장) ── */
try{
  var qApi=new URLSearchParams(location.search).get('api');
  if(qApi&&/^(localhost|127\.0\.0\.1)$/.test(location.hostname))localStorage.setItem('CONNECTION_API_URL',qApi);
}catch(e){}
var API=(function(){
  var fallback=/^(localhost|127\.0\.0\.1)$/.test(location.hostname)?'http://localhost:8000':'https://api.theprlist.net';
  try{return /^(localhost|127\.0\.0\.1)$/.test(location.hostname)?(localStorage.getItem('CONNECTION_API_URL')||fallback):fallback;}catch(e){return fallback;}
})();
window.__API_URL=API;

function jwtGet(){try{return localStorage.getItem('CONNECTION_JWT')||'';}catch(e){return '';}}
function jwtSet(t){try{localStorage.setItem('CONNECTION_JWT',t);}catch(e){}}
function jwtClear(){try{localStorage.removeItem('CONNECTION_JWT');}catch(e){}}
window.jwtGet=jwtGet;

/* ── 세션 세대 — 로그인/로그아웃/계정 교체마다 증가.
   모든 요청은 발사 시점의 (세대, 토큰)을 캡처하고, 응답이 돌아온 시점에
   세션이 바뀌어 있으면 stale 오류로 중단한다: 늦게 도착한 이전 계정의
   응답이 LIVE를 덮지 못하고, 체인의 후속 POST가 다른 계정 토큰으로
   이어지지도 않는다. stale 오류는 사용자 메시지를 띄우지 않는다. ── */
var sessionGen=0;
function bumpSessionGen(){sessionGen++;}
window.__sessionGen=function(){return sessionGen;};
function staleError(){var e=new Error('이전 세션의 응답이라 적용하지 않았습니다');e.stale=true;return e;}
window.isStale=function(e){return !!(e&&e.stale);};

function req(method,path,body){
  var gen=sessionGen,tok=jwtGet();
  var h={'Content-Type':'application/json'};
  if(tok)h['Authorization']='Bearer '+tok;
  return fetch(API+path,{method:method,headers:h,body:body?JSON.stringify(body):undefined})
    .then(function(r){return r.json().then(function(data){
      if(gen!==sessionGen||tok!==jwtGet())throw staleError();
      if(!r.ok){var err=new Error(typeof data.detail==='string'?data.detail:'요청을 처리하지 못했습니다 ('+r.status+')');err.status=r.status;err.detail=data.detail;throw err;}
      return data;});},
    function(netErr){if(gen!==sessionGen||tok!==jwtGet())throw staleError();throw netErr;});
}
window.liveReq=req;

/* ── 언어 — 저장 설정 > 접속 국가(IP) > 브라우저 언어 > en ── */
var LANGS=[['ko','한국어'],['en','English'],['th','ไทย'],['vi','Tiếng Việt'],['ja','日本語']];
window.LIVE_LANGS=LANGS;
function langLabel(l){var f=LANGS.find(function(x){return x[0]===l;});return f?f[1]:l;}
window.langLabel=langLabel;
function applyLang(l,silent){
  window.__USER_LANG=l;
  try{localStorage.setItem('CONNECTION_LANG',l);}catch(e){}
  if(window.render)render();
  if(!silent&&window.toast)toast('이제 대화가 '+langLabel(l)+'로 표시됩니다. 원문은 메시지에서 열 수 있어요.');
}
window.setConversationLang=function(l){
  if(!LANGS.some(function(x){return x[0]===l;}))return;
  try{localStorage.setItem('CONNECTION_LANG_MODE','manual');}catch(e){}
  applyLang(l,true);
};
function requestConversationLocale(){
  return location.hostname==='app.theprlist.net'
    ?fetch('/api/locale',{credentials:'omit',cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('locale');return r.json();}).catch(function(){return req('GET','/locale/detect');})
    :req('GET','/locale/detect');
}
window.useAutomaticConversationLang=function(){
  try{localStorage.setItem('CONNECTION_LANG_MODE','auto');}catch(e){}
  return requestConversationLocale().then(function(r){
    try{if(localStorage.getItem('CONNECTION_LANG_MODE')==='manual')return;}catch(e){}
    var l=r&&r.locale;if(!LANGS.some(function(x){return x[0]===l;}))l='en';
    applyLang(l,true);
  }).catch(function(){if(window.toast)toast('언어를 확인하지 못해 현재 설정을 유지했습니다.');});
};
(function initLang(){
  var saved=null,mode=null;
  try{saved=localStorage.getItem('CONNECTION_LANG');mode=localStorage.getItem('CONNECTION_LANG_MODE');}catch(e){}
  if(saved&&mode!=='auto'&&LANGS.some(function(x){return x[0]===saved;})){window.__USER_LANG=saved;return;}
  window.__USER_LANG=saved&&LANGS.some(function(x){return x[0]===saved;})?saved:(/^ko/i.test(navigator.language||'')?'ko':'en');
  try{localStorage.setItem('CONNECTION_LANG_MODE','auto');}catch(e){}
  requestConversationLocale().then(function(r){
    try{if(localStorage.getItem('CONNECTION_LANG_MODE')==='manual')return;}catch(e){}
    var l=r&&r.locale;if(!LANGS.some(function(x){return x[0]===l;}))l='en';
    applyLang(l,true);
  }).catch(function(){});
})();

/* ── 이 브라우저만의 편의 저장(초안·북마크) — 운영 데이터 아님.
   계정(userId)별로 격리 저장한다: 같은 기기에서 A 로그아웃 → B 로그인해도
   A의 미전송 초안·북마크가 B에게 보이지 않는다. 로그인 전에는 메모리
   전용(영속화 없음)이며, 과거 계정 공용 키(prlist-slack-live-v1)는 읽지
   않고 폐기한다(마이그레이션 금지 — 누구의 초안인지 알 수 없다). ── */
var STORE_PREFIX='prlist-slack-live-v1:u:';
var storeUser=null;
function emptyStore(){return {saved:[],drafts:{},setting:'profile'};}
window.store=emptyStore();
window.save=function(){
  if(!storeUser)return;   // 미로그인: 영속화하지 않음
  try{localStorage.setItem(STORE_PREFIX+storeUser,JSON.stringify({saved:store.saved,drafts:store.drafts,setting:store.setting}));}catch(e){}
};
function storeBind(userId){
  storeUser=String(userId||'')||null;
  var s=null;
  if(storeUser){try{s=JSON.parse(localStorage.getItem(STORE_PREFIX+storeUser)||'null');}catch(e){}}
  window.store={saved:(s&&s.saved)||[],drafts:(s&&s.drafts)||{},setting:(s&&s.setting)||'profile'};
  try{localStorage.removeItem('prlist-slack-live-v1');}catch(e){}   // 레거시 공용 키 폐기
  if(typeof ui!=='undefined')ui.setting=store.setting||'profile';
}
function storeUnbind(){storeUser=null;window.store=emptyStore();}
window.__storeUser=function(){return storeUser;};

/* ── 진입 파라미터 — 브랜드 초대·모집 제안·매직링크·계정 링크 ── */
var sp=new URLSearchParams(location.search);
var joinTarget=null;
try{joinTarget=(sp.get('brand')||'').toLowerCase()||null;if(joinTarget&&!/^[a-z0-9][a-z0-9-]{2,39}$/.test(joinTarget))joinTarget=null;}catch(e){}
var applicationToken=sp.get('application')||'';
var magicTok=sp.get('magic'),inviteTok=sp.get('invite'),resetTok=sp.get('reset');
window.entryLang=function(){var l=sp.get('lang');return l==='en'?'en':l==='ko'?'ko':(window.__INVITATION_LOCALE||(/^ko/i.test(navigator.language||'')?'ko':'en'));};
window.entryText=function(ko,en){return window.entryLang()==='en'?en:ko;};

/* ── 라이브 상태 ── */
window.__ME=null;
window.LIVE={
  authKnown:false,            // /auth/me 확인 완료 여부(로그인 화면 깜빡임 방지)
  memberships:null, cells:null, campaigns:null, offers:null,
  unread:{}, notifs:null, profile:null, tiktok:null, xp:null,
  missions:{}, ranking:{}, loadErr:{},
  open:null,                  // {cellId,name,channel,msgs,loading,error}
  thread:null,                // {rootId,msgs}
  threadBusy:false, sending:false,
  searchQ:'', searchRes:null, searchBusy:false,
  magic:{busy:false,sent:false,demoLink:'',status:''},
  joinTarget:joinTarget, joinBrandInfo:null, joinBusy:false,
  applicationToken:applicationToken, applicationContext:null,
  applicationError:'', applicationBusy:false, applicationDone:false,
  invitationProduct:null,
  applyBusy:{}, agreeBusy:false, contentBusy:false, sparkBusy:false,
  profileBusy:false, tiktokBusy:false, spaceBusy:false,
  verifyState:magicTok?'verifying':'',   // '', verifying, failed
};

/* ── 파생 데이터 — 화면이 쓰는 형태로 ── */
window.brandsLive=function(){
  var map={},order=[];
  (LIVE.memberships||[]).forEach(function(m){
    if(!map[m.brandId]){map[m.brandId]={brandId:m.brandId,name:m.name||m.brandId,logoUrl:m.logoUrl||'',tagline:m.tagline||''};order.push(m.brandId);}
  });
  (LIVE.cells||[]).forEach(function(c){
    if(c.kind==='dm')return;
    if(!map[c.brandId]){map[c.brandId]={brandId:c.brandId,name:c.brandName||c.brandId,logoUrl:c.logoUrl||'',tagline:''};order.push(c.brandId);}
    map[c.brandId].cellId=c.cellId;map[c.brandId].cellName=c.name;
    map[c.brandId].memberCount=c.memberCount;map[c.brandId].verifiedCount=c.verifiedCount;
  });
  return order.map(function(id,i){var b=map[id];b.initial=(b.name||'?').slice(0,1).toUpperCase();b.alt=i%2===1;return b;});
};
window.brandById=function(id){return brandsLive().find(function(b){return b.brandId===id;})||null;};
window.currentBrand=function(){
  var list=brandsLive();
  if(ui.brand){var f=list.find(function(b){return b.brandId===ui.brand;});if(f)return f;}
  return list[0]||null;
};
window.dmCellFor=function(brandId){return (LIVE.cells||[]).find(function(c){return c.kind==='dm'&&c.brandId===brandId;})||null;};
window.campaignsLive=function(){return LIVE.campaigns||[];};
window.campaignById=function(id){return (LIVE.campaigns||[]).find(function(c){return c.campaignId===id;})||null;};
window.offerByCampaign=function(id){return (LIVE.offers||[]).find(function(o){return o.campaignId===id;})||null;};
window.campExpired=function(c){
  // 서버 신청 마감 검사와 동일하게 Asia/Seoul 기준 날짜로 비교한다
  try{
    if(!c||!c.deadline)return false;
    var today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
    return String(c.deadline).slice(0,10)<today;
  }catch(e){return false;}
};
window.offerStateLabel=function(v){return ({none:'모집 중',applied:'신청 검토 중',selected:'조건 확인 필요',terms_agreed:'샘플 발송 대기',sample_shipped:'샘플 발송됨 · 콘텐츠 준비',content_submitted:'제출 완료 · 브랜드 검토 중',revision_requested:'수정 요청 — 수정본 제출 필요',completed:'협업 완료',declined:'제안 거절',rejected:'미선정'})[v]||v||'확인 필요';};
window.actionableOffers=function(){return (LIVE.offers||[]).filter(function(o){return ['selected','terms_agreed','sample_shipped','revision_requested'].indexOf(o.state)>=0;});};
window.unreadCount=function(cellId){var u=LIVE.unread[cellId];return (u&&u.unread)||0;};
window.unreadTotal=function(){var t=0;Object.keys(LIVE.unread).forEach(function(k){t+=LIVE.unread[k].unread||0;});return t;};
window.entryReady=function(){return !!(LIVE.profile&&LIVE.profile.entryReady);};

/* 브랜드/제품 아트 — 실제 로고·제품 이미지가 없으면 중립 모노그램(가짜 금지) */
window.brandArt=function(b){
  if(b&&b.logoUrl&&/^https:\/\//.test(String(b.logoUrl)))return String(b.logoUrl);
  var ch=((b&&(b.initial||b.name))||'?').slice(0,1).toUpperCase().replace(/[^A-Z0-9가-힣]/,'·');
  var alt=b&&b.alt;
  var svg='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+(alt?'#6b5478':'#3a2843')+'"/><stop offset="1" stop-color="'+(alt?'#a58cb7':'#695177')+'"/></linearGradient></defs><rect width="640" height="420" fill="url(#g)"/><text x="50%" y="54%" font-family="Georgia,serif" font-size="150" fill="rgba(255,255,255,.85)" text-anchor="middle">'+ch+'</text></svg>';
  return 'data:image/svg+xml;utf8,'+encodeURIComponent(svg);
};
window.campaignArt=function(c){
  if(c&&c.imageUrl&&/^https:\/\//.test(String(c.imageUrl)))return String(c.imageUrl);
  if(c&&c.logoUrl&&/^https:\/\//.test(String(c.logoUrl)))return String(c.logoUrl);
  return brandArt(brandById(c&&c.brandId)||{name:c&&(c.brandName||c.brandId)||'?'});
};

/* ── 로더 ── */
var membershipState='idle';
window.membershipStateGet=function(){return membershipState;};
window.retryMemberships=function(){
  if(!window.__ME||window.__ME.kind!=='creator')return Promise.resolve();
  var token=jwtGet();membershipState='loading';
  return req('GET','/me/memberships').then(function(m){
    if(token!==jwtGet())return;
    if(!Array.isArray(m))throw new Error('bad');
    LIVE.memberships=m;membershipState='ready';render();
  }).catch(function(e){if(isStale(e)||token!==jwtGet())return;membershipState='error';render();});
};
window.loadCreatorData=function(){
  if(applicationToken)req('GET','/recruitment-links/'+encodeURIComponent(applicationToken)).then(function(r){
    if(LIVE.joinTarget&&LIVE.joinTarget!==r.brandId){LIVE.applicationContext=null;LIVE.applicationError='모집 링크와 브랜드가 다릅니다. 원래 제안 링크를 열어 주세요.';render();return;}
    LIVE.applicationContext=r;LIVE.joinTarget=r.brandId;if(r.locale)window.__INVITATION_LOCALE=r.locale;
    LIVE.invitationProduct=r.product||null;LIVE.applicationError='';render();
  }).catch(function(e){if(isStale(e))return;LIVE.applicationContext=null;LIVE.applicationError=(e&&e.message)||'모집 링크를 확인하지 못했습니다';render();});
  var productQuery=sp.get('product');
  if(LIVE.joinTarget&&productQuery&&!applicationToken)req('GET','/brands/'+encodeURIComponent(LIVE.joinTarget)+'/products/'+encodeURIComponent(productQuery)+'/invitation').then(function(p){LIVE.invitationProduct=p;render();}).catch(function(){});
  if(LIVE.joinTarget)req('GET','/brands/'+LIVE.joinTarget+'/identity').then(function(b){LIVE.joinBrandInfo=b;render();}).catch(function(e){if(isStale(e))return;LIVE.joinBrandInfo={missing:true};render();});
  if(window.__ME&&window.__ME.kind==='creator'){
    retryMemberships();LIVE.loadErr={};
    req('GET','/community/my-cells').then(function(c){LIVE.cells=c;LIVE.loadErr.community=false;
      if(!LIVE.open&&(ui.page==='community')){var first=c.find(function(x){return x.kind!=='dm'&&(!LIVE.joinTarget||x.brandId===LIVE.joinTarget);});if(first){ui.brand=first.brandId;window.openCell(first.cellId,first.name,ui.channel);return;}}
      render();}).catch(function(e){if(isStale(e))return;LIVE.loadErr.community=true;render();});
    req('GET','/me/campaigns').then(function(c){LIVE.campaigns=c;LIVE.loadErr.campaigns=false;render();}).catch(function(e){if(isStale(e))return;LIVE.loadErr.campaigns=true;render();});
    req('GET','/me/campaign-offers').then(function(o){LIVE.offers=o;LIVE.loadErr.offers=false;render();}).catch(function(e){if(isStale(e))return;LIVE.loadErr.offers=true;render();});
    req('GET','/me/unread').then(function(u){var m={};(u||[]).forEach(function(x){m[x.cellId]=x;});LIVE.unread=m;render();}).catch(function(){});
    req('GET','/me/notifications?limit=30').then(function(n){LIVE.notifs=n;render();}).catch(function(){});
    req('GET','/me/profile').then(function(p){LIVE.profile=p;render();}).catch(function(){});
    req('GET','/me/tiktok').then(function(t){LIVE.tiktok=t;render();}).catch(function(){});
    req('GET','/me/xp').then(function(x){LIVE.xp=x;render();}).catch(function(){});
    loadNotifPrefs();
    pollStart();
  }
};
var collabFreshBusy=false;
window.collabRefresh=function(){
  if(collabFreshBusy||!window.__ME||window.__ME.kind!=='creator'||!jwtGet())return;
  collabFreshBusy=true;var token=jwtGet();
  return Promise.all([
    req('GET','/me/campaigns').then(function(c){if(token===jwtGet()){LIVE.campaigns=c;LIVE.loadErr.campaigns=false;}}).catch(function(){}),
    req('GET','/me/campaign-offers').then(function(o){if(token===jwtGet()){LIVE.offers=o;LIVE.loadErr.offers=false;}}).catch(function(){})
  ]).then(function(){collabFreshBusy=false;render();});
};

/* ── 커뮤니티: 채널 열기·게시·스레드·검색·읽음 ── */
var commVersion=0;
window.openCell=function(id,name,channel){
  var cell=(LIVE.cells||[]).find(function(c){return c.cellId===id;});
  if(cell)ui.brand=cell.brandId;
  var ch=cell&&cell.kind==='dm'?'chat':(['chat','tips','products','qna','notice'].indexOf(channel)>=0?channel:(ui.channel&&cell&&cell.kind!=='dm'?ui.channel:'chat'));
  ui.channel=ch;
  var version=++commVersion,token=jwtGet();
  LIVE.open={cellId:id,name:name,channel:ch,msgs:[],loading:true,error:'',dm:!!(cell&&cell.kind==='dm')};
  LIVE.thread=null;LIVE.searchRes=null;render();
  return req('GET','/community/cells/'+encodeURIComponent(id)+'/messages?channel='+ch+'&limit=200').then(function(m){
    if(version!==commVersion||token!==jwtGet())return;
    LIVE.open.msgs=m;LIVE.open.loading=false;
    var maxId=0;(m||[]).forEach(function(x){if(x.msgId&&x.msgId>maxId)maxId=x.msgId;});
    if(maxId)req('POST','/community/cells/'+encodeURIComponent(id)+'/read',{last_msg_id:maxId}).then(function(){if(LIVE.unread[id]){delete LIVE.unread[id];render();}}).catch(function(){});
    render();
    var feed=document.getElementById('messageFeed');if(feed)feed.scrollTop=feed.scrollHeight;
  }).catch(function(e){if(isStale(e)||version!==commVersion||token!==jwtGet())return;LIVE.open.loading=false;LIVE.open.error=(e&&e.message)||'대화를 불러오지 못했습니다. 멤버십과 연결 상태를 확인하세요.';render();});
};
window.selectChannelLive=function(ch){if(LIVE.open)return openCell(LIVE.open.cellId,LIVE.open.name,ch);};
window.sendMessage=function(){
  var d=document.getElementById('chatDraft'),v=(d&&d.value||'').trim();
  if(!v||!LIVE.open||LIVE.sending||LIVE.open.channel==='notice'||v.length>2000)return;
  var img=((document.getElementById('chatImage')||{}).value||'').trim();
  if(img&&!/^https:\/\/\S{8,470}$/.test(img))return toast('이미지는 공개 https:// 주소만 첨부할 수 있어요.');
  var id=LIVE.open.cellId,name=LIVE.open.name,ch=LIVE.open.channel,key=d.getAttribute('data-key'),token=jwtGet();
  LIVE.sending=true;render();
  return req('POST','/community/cells/'+encodeURIComponent(id)+'/messages',{text:v,channel:ch,locale:(window.__USER_LANG||'ko'),image_url:img}).then(function(){
    if(token!==jwtGet())return;
    if(key){store.drafts[key]='';save();}
    ui.attachOpen=false;formClearField('chatImage');
    if(LIVE.open&&LIVE.open.cellId===id&&LIVE.open.channel===ch)return openCell(id,name,ch);
  }).catch(function(e){if(isStale(e))return;toast((e&&e.message)||'게시하지 못했어요. 입력은 보관됐어요 — 다시 시도하세요.');})
    .finally(function(){LIVE.sending=false;softRender();var el=document.getElementById('chatDraft');if(el)el.focus();});
};
window.threadOpen=function(mid){
  if(!LIVE.open)return;
  var id=LIVE.open.cellId,version=commVersion,token=jwtGet();
  ui.panel=null;LIVE.thread={rootId:mid,msgs:null};render();
  return req('GET','/community/cells/'+encodeURIComponent(id)+'/messages/'+mid+'/thread').then(function(m){
    if(version!==commVersion||token!==jwtGet())return;
    LIVE.thread={rootId:mid,msgs:m};render();
  }).catch(function(e){if(isStale(e)||version!==commVersion)return;LIVE.thread=null;toast('스레드를 불러오지 못했습니다.');render();});
};
window.threadClose=function(){LIVE.thread=null;render();};
window.threadReplySend=function(){
  var el=document.getElementById('threadReply'),v=(el&&el.value||'').trim();
  if(!v||!LIVE.open||!LIVE.thread||LIVE.threadBusy||v.length>2000)return;
  var id=LIVE.open.cellId,mid=LIVE.thread.rootId,token=jwtGet();
  LIVE.threadBusy=true;render();
  return req('POST','/community/cells/'+encodeURIComponent(id)+'/messages',{text:v,channel:LIVE.open.channel==='notice'?'chat':LIVE.open.channel,locale:(window.__USER_LANG||'ko'),thread_parent:mid}).then(function(){
    if(token!==jwtGet())return;
    return threadOpen(mid);
  }).catch(function(e){if(isStale(e))return;toast((e&&e.message)||'답글을 보내지 못했습니다.');})
    .finally(function(){LIVE.threadBusy=false;softRender();});
};
window.reactToggle=function(msgId,on){
  if(!LIVE.open)return;
  var id=LIVE.open.cellId;
  function apply(list,count,mine){(list||[]).forEach(function(m){if(m.msgId===msgId){if(count!=null)m.reactionCount=count;m.myReaction=mine;}});}
  // 낙관 반영(연타 방지 겸) — 실패하면 서버 값으로 복원
  var prev=null;(LIVE.open.msgs||[]).forEach(function(m){if(m.msgId===msgId)prev={c:m.reactionCount||0,m:!!m.myReaction};});
  apply(LIVE.open.msgs,prev?(prev.c+(on?1:-1)):null,on);
  if(LIVE.thread&&LIVE.thread.msgs)apply(LIVE.thread.msgs,null,on);
  softRender();
  return req('POST','/community/cells/'+encodeURIComponent(id)+'/messages/'+msgId+'/reaction',{on:!!on}).then(function(r){
    apply(LIVE.open&&LIVE.open.msgs,r.count,r.mine);
    if(LIVE.thread&&LIVE.thread.msgs)apply(LIVE.thread.msgs,r.count,r.mine);
    softRender();
  }).catch(function(e){
    if(isStale(e))return;
    if(prev){apply(LIVE.open&&LIVE.open.msgs,prev.c,prev.m);softRender();}
    toast((e&&e.message)||'리액션을 저장하지 못했습니다.');
  });
};
window.commSearchInput=function(v){LIVE.searchQ=v;};
window.commSearchRun=function(){
  var q=(LIVE.searchQ||'').trim();
  if(!LIVE.open||LIVE.searchBusy)return;
  if(q.length<2)return toast('검색어는 2자 이상 입력해 주세요.');
  var id=LIVE.open.cellId,token=jwtGet();
  LIVE.searchBusy=true;render();
  return req('GET','/community/cells/'+encodeURIComponent(id)+'/search?q='+encodeURIComponent(q)).then(function(r){
    if(token!==jwtGet())return;LIVE.searchRes=r;
  }).catch(function(e){if(isStale(e))return;LIVE.searchRes=[];toast((e&&e.message)||'검색하지 못했습니다.');})
    .finally(function(){LIVE.searchBusy=false;softRender();});
};
window.commSearchClear=function(){LIVE.searchRes=null;LIVE.searchQ='';render();};
window.openDm=function(brandId){
  req('POST','/community/dm/'+brandId,{}).then(function(r){
    if(!(LIVE.cells||[]).some(function(c){return c.cellId===r.cellId;})){
      var m=(LIVE.memberships||[]).find(function(x){return x.brandId===brandId;});
      LIVE.cells=(LIVE.cells||[]).concat([{cellId:r.cellId,name:'담당자 DM',brandId:brandId,brandName:(m&&m.name)||brandId,kind:'dm'}]);
    }
    navigate('messages');ui.dm=brandId;
    openCell(r.cellId,'담당자 DM');
  }).catch(function(e){if(isStale(e))return;toast('담당자 DM은 브랜드 멤버십 가입 후 이용할 수 있어요.');});
};

/* ── 캠페인·협업 액션 ── */
window.applyCampaign=function(cid){
  if(LIVE.applyBusy[cid])return;
  LIVE.applyBusy[cid]=true;render();
  return req('POST','/campaigns/'+encodeURIComponent(cid)+'/apply',{creator_id:'me'}).then(function(){
    toast('신청이 접수됐어요 — 브랜드가 검토 후 선정하면 내 협업에서 조건을 확인할 수 있어요.');
    navigate('applied',cid);
    return Promise.resolve(collabRefresh()).then(function(){return true;});
  }).catch(function(e){if(isStale(e))return false;toast((e&&e.message)||'신청하지 못했습니다. 잠시 후 다시 시도해 주세요.');return false;})
    .finally(function(){LIVE.applyBusy[cid]=false;softRender();});
};
window.agreeOffer=function(cid,accept){
  if(LIVE.agreeBusy)return;
  var h=((document.getElementById('agreeHandle')||{}).value||'').trim();
  if(accept&&!h)return toast('합의에는 본인 TikTok 핸들 확인이 필요해요.');
  LIVE.agreeBusy=true;render();
  return req('POST','/me/campaign-offers/'+encodeURIComponent(cid)+'/agree',{accept:!!accept,tiktok_handle:h}).then(function(r){
    toast(accept?'수수료 합의 완료 — 확정 '+r.agreedCommissionPct+'% · 샘플 발송을 기다려 주세요.':'이 캠페인 제안을 거절했어요.');
    formClearPage('collaboration');
    return collabRefresh();
  }).catch(function(e){if(isStale(e))return;toast((e&&e.message)||'처리하지 못했습니다.');})
    .finally(function(){LIVE.agreeBusy=false;softRender();});
};
window.submitSpark=function(cid){
  var v=((document.getElementById('sparkCode')||{}).value||'').trim();
  if(!v)return toast('Spark 코드를 입력해 주세요.');
  if(LIVE.sparkBusy)return;LIVE.sparkBusy=true;render();
  return req('POST','/me/campaign-offers/'+encodeURIComponent(cid)+'/spark-code',{spark_code:v}).then(function(){
    toast('Spark 코드가 브랜드에 전달됐어요 — 커뮤니티에는 노출되지 않습니다.');
    formClearField('sparkCode');
    return collabRefresh();
  }).catch(function(e){if(isStale(e))return;toast((e&&e.message)||'합의 이후에 제출할 수 있어요.');})
    .finally(function(){LIVE.sparkBusy=false;softRender();});
};
/* 담당자 DM 전달(신청 아이디어·제출 메모) — 실패 시 DM 초안으로 보관해
   본 작업(신청/제출)을 중복하지 않고 메모만 다시 보낼 수 있게 한다. */
window.stashDmDraft=function(brandId,text){
  if(!window.__ME)return false;
  // 매직 로그인 응답에는 creatorId가 없을 수 있다 — 프로필 값으로 폴백
  var cid=window.__ME.creatorId||(LIVE.profile&&LIVE.profile.creatorId);
  if(!cid){var dm=dmCellFor(brandId);if(dm)cid=String(dm.cellId).split('--').pop();}
  if(!cid)return false;
  var cellId='dm-'+brandId+'--'+cid;
  var key='u:'+window.__ME.userId+':'+cellId+':chat';
  store.drafts[key]=(store.drafts[key]?store.drafts[key]+'\n':'')+text;
  save();return true;
};
window.relayToManagerDm=function(brandId,text){
  return req('POST','/community/dm/'+brandId,{}).then(function(r){
    return req('POST','/community/cells/'+encodeURIComponent(r.cellId)+'/messages',{text:text,channel:'chat',locale:(window.__USER_LANG||'ko')})
      .then(function(){return true;});
  }).catch(function(e){
    if(isStale(e))return false;
    return window.stashDmDraft(brandId,text)?false:'lost';
  });
};
window.submitContent=function(cid,url,memo){
  if(LIVE.contentBusy)return Promise.resolve();
  if(!/^https:\/\//.test(url||''))return Promise.resolve(toast('https:// 콘텐츠 링크를 입력해 주세요.'));
  LIVE.contentBusy=true;render();
  var offer=offerByCampaign(cid);
  return req('POST','/me/campaign-offers/'+encodeURIComponent(cid)+'/content',{content_url:url}).then(function(){
    formClearPage('submission');
    var m=(memo||'').trim();
    if(!m||!offer){toast('콘텐츠 제출 완료 — 브랜드 확인 후 완료 처리됩니다.');return true;}
    return relayToManagerDm(offer.brandId,'[콘텐츠 제출 메모] '+(offer.campaignName||cid)+' — '+m).then(function(sent){
      toast(sent===true?'콘텐츠 제출 완료 — 메모도 담당자 DM으로 전달했어요.'
        :sent==='lost'?'콘텐츠는 제출됐어요. 메모 전달에 실패했어요 — 담당자 DM에서 직접 전해 주세요. (콘텐츠를 다시 제출할 필요는 없어요)'
        :'콘텐츠는 제출됐어요. 메모 전달은 실패해 담당자 DM 초안으로 보관했어요 — DM에서 보내기만 누르면 됩니다. (콘텐츠를 다시 제출할 필요는 없어요)');
      return true;
    });
  }).then(function(done){if(done)return collabRefresh().then(function(){navigate('collaboration',cid);});})
    .catch(function(e){if(isStale(e))return;toast((e&&e.message)||'합의/샘플 수령 후 제출할 수 있어요.');})
    .finally(function(){LIVE.contentBusy=false;softRender();});
};
window.submitShipping=function(cid){
  if(LIVE.shippingBusy)return;
  function val(id){var el=document.getElementById(id);return el?el.value.trim():'';}
  var payload={recipient:val('shipRecipient'),country:val('shipCountry').toUpperCase(),address:val('shipAddress'),phone:val('shipPhone')};
  if(!payload.recipient||payload.country.length!==2||payload.address.length<4||payload.phone.length<4)
    return toast('수령인·국가(2자리)·주소·연락처를 확인해 주세요.');
  var consent=document.getElementById('shipConsent');
  if(consent&&!consent.checked)return toast('샘플 배송을 위한 정보 제공을 확인해 주세요.');
  LIVE.shippingBusy=true;render();
  return req('POST','/me/campaign-offers/'+encodeURIComponent(cid)+'/shipping',payload).then(function(){
    toast('수령 정보를 저장했어요 — 브랜드 담당자에게만 전달됩니다.');
    formClearPage('collaboration');
    return collabRefresh();
  }).catch(function(e){if(isStale(e))return;toast((e&&e.message)||'샘플 발송 전에만 등록할 수 있어요.');})
    .finally(function(){LIVE.shippingBusy=false;softRender();});
};
window.loadNotifPrefs=function(){
  LIVE.notifPrefsError=false;render();
  return req('GET','/me/notification-prefs').then(function(np){LIVE.notifPrefs=np;LIVE.notifPrefsError=false;render();})
    .catch(function(e){if(isStale(e))return;LIVE.notifPrefsError=true;render();});
};
window.saveNotifPref=function(key,on){
  var cur=(LIVE.notifPrefs&&LIVE.notifPrefs.prefs)||{dm:true,campaign:true,deadline:true,email:true};
  var next={dm:cur.dm,campaign:cur.campaign,deadline:cur.deadline,email:cur.email};
  next[key]=!!on;
  var prev=LIVE.notifPrefs;
  LIVE.notifPrefs={prefs:next,applied:(prev&&prev.applied)||{}};render();
  return req('PUT','/me/notification-prefs',next).then(function(){
    toast('알림 설정을 저장했어요.');
    return req('GET','/me/notification-prefs').then(function(np){LIVE.notifPrefs=np;render();});
  }).catch(function(e){
    if(isStale(e))return;
    LIVE.notifPrefs=prev;render();
    toast((e&&e.message)||'알림 설정을 저장하지 못했습니다.');
  });
};
window.joinBrandLive=function(brandId){
  if(LIVE.joinBusy)return;LIVE.joinBusy=true;render();
  return req('POST','/me/join',{brand_id:brandId}).then(function(r){
    toast(r.joined?'합류 완료 🎉 — '+r.brandId+' PR 리스트에 등록됐어요.':'이미 이 브랜드의 멤버예요 — 중복 가입은 다시 등록되지 않습니다.');
    LIVE.joinBusy=false;
    navigate('welcome');
    loadCreatorData();
  }).catch(function(e){
    LIVE.joinBusy=false;
    if(isStale(e))return;
    var msg=(e&&e.message)||'';
    if(msg.indexOf('온보딩')>=0||msg.indexOf('인증')>=0){toast(msg);navigate('onboarding');return;}
    toast(msg||'가입하지 못했습니다. 잠시 후 다시 시도해 주세요.');render();
  });
};
window.applyRecruitment=function(){
  if(LIVE.applicationBusy||!LIVE.applicationContext||LIVE.applicationError)return;
  var consent=document.getElementById('recruitmentConsent');
  if(!consent||!consent.checked)return toast('브랜드 합류와 이 모집 신청을 확인해 주세요.');
  LIVE.applicationBusy=true;render();
  req('POST','/recruitment-links/'+encodeURIComponent(applicationToken)+'/apply',{}).then(function(r){
    LIVE.applicationDone=true;toast(r.brandName+'에 신청이 저장되었습니다. 참여 확정은 별도 검토입니다.');loadCreatorData();
  }).catch(function(e){if(isStale(e))return;LIVE.applicationError=(e&&e.message)||'이 제안을 받은 계정인지 확인해 주세요.';})
    .finally(function(){LIVE.applicationBusy=false;render();});
};

/* ── 알림 ── */
window.notifReadAll=function(){
  req('POST','/me/notifications/read',{all:true}).then(function(){return req('GET','/me/notifications?limit=30');})
    .then(function(n){LIVE.notifs=n;render();})
    .catch(function(e){if(isStale(e))return;toast('읽음 처리에 실패했습니다 — 다시 시도해 주세요.');});
};
window.notifGo=function(idx){
  var item=LIVE.notifs&&LIVE.notifs.items&&LIVE.notifs.items[idx];if(!item)return;
  var t=item.target||{};
  closeModal();
  req('POST','/me/notifications/read',{ids:[item.id]}).then(function(){return req('GET','/me/notifications?limit=30');}).then(function(n){LIVE.notifs=n;render();}).catch(function(){});
  if(t.cellId){navigate('community');var room=(LIVE.cells||[]).find(function(c){return c.cellId===t.cellId;});return openCell(t.cellId,(room&&room.name)||'공지',t.channel||'notice');}
  if(t.campaignId){var c=campaignById(t.campaignId);if(c)return navigate('detail',t.campaignId);return navigate('work');}
  render();
};

/* ── 프로필 온보딩·TikTok 입장 게이트 ── */
window.profileSaveLive=function(onDone){
  if(LIVE.profileBusy)return;
  function val(id){var el=document.getElementById(id);return el?el.value:'';}
  function checked(id){var el=document.getElementById(id);return !!(el&&el.checked);}
  var langs=[];['ko','en','th','vi','ja'].forEach(function(l){if(checked('joinLang_'+l))langs.push(l);});
  var payload={country:val('joinCountry').trim().toUpperCase(),languages:langs,
    ship_countries:val('joinShip').split(',').map(function(x){return x.trim().toUpperCase();}).filter(Boolean),
    tiktok_handle:val('joinHandle').trim(),
    consent_terms:checked('joinConsentTerms'),consent_privacy:checked('joinConsentPrivacy')};
  LIVE.profileBusy=true;render();
  req('PUT','/me/profile',payload)
    .then(function(r){toast(r.onboarded?'프로필 저장 완료 🎉':(r.hint||'프로필이 저장되었습니다.'));return req('GET','/me/profile');})
    .then(function(p){LIVE.profile=p;formClearPage('settings');formClearPage('onboarding');if(onDone)onDone(p);})
    .catch(function(e){if(isStale(e))return;toast((e&&e.message)||'입력값을 확인해 주세요.');})
    .finally(function(){LIVE.profileBusy=false;softRender();retryMemberships();});
};
window.tiktokConnect=function(){
  if(LIVE.tiktokBusy)return;LIVE.tiktokBusy=true;render();
  req('POST','/me/tiktok/connect-start',{}).then(function(r){
    if(r&&r.authUrl){toast('TikTok 인증 창으로 이동합니다 — 완료 후 상태 새로고침을 눌러 주세요.');try{window.open(r.authUrl,'_blank','noopener');}catch(e){}}
    return req('GET','/me/tiktok');
  }).then(function(t){LIVE.tiktok=t;})
    .catch(function(e){if(isStale(e))return;toast((e&&e.message)||'지금은 연결할 수 없습니다.');return req('GET','/me/tiktok').then(function(t){LIVE.tiktok=t;}).catch(function(){});})
    .finally(function(){LIVE.tiktokBusy=false;render();});
};
window.tiktokDisconnect=function(){
  req('POST','/me/tiktok/disconnect',{}).then(function(){return req('GET','/me/tiktok');}).then(function(t){LIVE.tiktok=t;toast('TikTok 소유 인증을 해제했습니다.');render();}).catch(function(e){if(isStale(e))return;toast('해제하지 못했습니다 — 다시 시도해 주세요.');});
};
window.tiktokRefresh=function(){
  Promise.all([req('GET','/me/tiktok'),req('GET','/me/profile')]).then(function(r){LIVE.tiktok=r[0];LIVE.profile=r[1];render();}).catch(function(e){if(isStale(e))return;toast('상태를 확인하지 못했습니다.');});
};
window.tiktokStateLabel=function(s){return ({none:'미연결',pending:'인증 진행 중',connected:'연결됨 ✓',failed:'인증 실패 — 다시 연결',expired:'만료 — 다시 연결',revoked:'해제됨',eligible:'자격 확인 ✓',rejected:'자격 미충족'})[s]||s||'미연결';};

/* ── XP·미션·랭킹 ── */
window.loadSpace=function(brandId){
  if(LIVE.spaceBusy)return;LIVE.spaceBusy=true;render();
  Promise.all([
    req('GET','/me/missions?brand='+encodeURIComponent(brandId)).catch(function(){return null;}),
    req('GET','/brands/'+encodeURIComponent(brandId)+'/ranking?period=all').catch(function(){return null;}),
    req('GET','/brands/'+encodeURIComponent(brandId)+'/ranking?period=week').catch(function(){return null;}),
    req('GET','/me/xp').catch(function(){return null;})
  ]).then(function(r){
    if(r[0])LIVE.missions[brandId]=r[0];
    if(r[1]||r[2])LIVE.ranking[brandId]={all:r[1],week:r[2]};
    if(r[3])LIVE.xp=r[3];
  }).finally(function(){LIVE.spaceBusy=false;render();});
};

/* ── 로그인(이메일 매직링크) ── */
window.magicRequest=function(email){
  if(LIVE.magic.busy)return;
  var v=(email||'').trim();
  if(v.indexOf('@')<0){LIVE.magic.status=entryText('이메일 주소를 확인해 주세요.','Please enter a valid email address.');render();return;}
  LIVE.magic.busy=true;LIVE.magic.sent=false;LIVE.magic.demoLink='';
  LIVE.magic.status=entryText('로그인 링크를 요청하고 있습니다…','Requesting your sign-in link…');
  LIVE.magic.email=v;render();
  return req('POST','/auth/magic',{email:v,brand:LIVE.joinTarget||'',application:applicationToken,locale:entryLang()}).then(function(r){
    if(!r.demoLink&&r.sent!==true)throw new Error(r.hint||'로그인 메일을 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    LIVE.magic.sent=true;LIVE.magic.status='';
    if(r.demoLink)LIVE.magic.demoLink=r.demoLink.replace('https://app.theprlist.net/',location.origin+'/').replace('https://theprlist.net/',location.origin+'/');
    navigate('checkemail');
  }).catch(function(e){if(isStale(e))return;LIVE.magic.status=(e&&e.message)||entryText('로그인 링크 요청에 실패했습니다. 연결 상태를 확인해 주세요.','Unable to send the sign-in link. Please try again.');render();})
    .finally(function(){LIVE.magic.busy=false;render();});
};
/* 세션 민감 메모리 전부 초기화 — 로그아웃·다른 창 로그아웃 공용 */
function resetLiveSession(){
  bumpSessionGen();
  window.__ME=null;
  storeUnbind();
  LIVE.memberships=null;LIVE.cells=null;LIVE.campaigns=null;LIVE.offers=null;LIVE.unread={};
  LIVE.notifs=null;LIVE.profile=null;LIVE.tiktok=null;LIVE.xp=null;LIVE.open=null;LIVE.thread=null;
  LIVE.missions={};LIVE.ranking={};LIVE.loadErr={};LIVE.notifPrefs=null;LIVE.notifPrefsError=false;
  LIVE.searchQ='';LIVE.searchRes=null;LIVE.applicationDone=false;LIVE.applicationBusy=false;
  LIVE.magic={busy:false,sent:false,demoLink:'',status:''};
  formDirty={};
  if(typeof ui!=='undefined'){ui.original={};ui.brand=null;ui.dm=null;ui.campaign=null;ui.activeCollab=null;ui.thread=null;ui.panel=null;}
}
window.sessionBind=function(user){
  bumpSessionGen();
  window.__ME=user;
  storeBind(user&&user.userId);
};
window.authLogout=function(){
  jwtClear();
  resetLiveSession();
  toast('로그아웃했습니다 — 다시 로그인해야 이용할 수 있어요.');
  navigate('login');
};
/* 다른 창/탭의 로그아웃·계정 교체를 이 창에도 즉시 반영 */
try{window.addEventListener('storage',function(e){
  if(e.key!=='CONNECTION_JWT')return;
  if(!e.newValue){               // 다른 창에서 로그아웃
    if(window.__ME){resetLiveSession();toast('다른 창에서 로그아웃되어 이 창도 로그아웃했어요.');navigate('login');}
  }else{                         // 다른 창에서 로그인/계정 교체 — 깨끗하게 재적재
    location.reload();
  }
});}catch(e){}

/* ── 실패 시 폼 보존 — 사용자가 만진 입력만 페이지별로 기억해 재렌더
      후에도 값·체크 상태를 복원한다(서버 적재 값을 덮지 않도록 더티만).
      비밀번호는 제외, chatDraft는 자체 초안 시스템 사용. ── */
var formDirty={};
function dirtyPageKey(){return (typeof ui!=='undefined'&&ui.page)||'';}
function onFormDirty(e){
  var el=e.target;
  if(!el||!el.id||el.type==='password'||el.id==='chatDraft')return;
  if(!window.__ME)return;
  var pg=dirtyPageKey();
  (formDirty[pg]||(formDirty[pg]={}))[el.id]=
    (el.type==='checkbox'||el.type==='radio')?{c:el.checked}:{v:el.value};
}
try{document.addEventListener('input',onFormDirty,true);
    document.addEventListener('change',onFormDirty,true);}catch(e){}
window.formRestore=function(){
  var m=formDirty[dirtyPageKey()];if(!m)return;
  Object.keys(m).forEach(function(id){
    var el=document.getElementById(id);if(!el||el.type==='password')return;
    var st=m[id];
    if('c' in st)el.checked=st.c;else if(el.value!==st.v)el.value=st.v;
  });
};
window.formClearPage=function(pg){delete formDirty[pg||dirtyPageKey()];};
window.formClearField=function(id){var m=formDirty[dirtyPageKey()];if(m)delete m[id];};

/* ── 폴링 — 알림·미읽음·열린 채널·스레드·캠페인/협업, 변경시에만 softRender ── */
var pollTimer=null,pollBusy=false,pollFail=0,pollWired=false;
var POLL_BASE=5000,POLL_MAX=60000;
function pollSchedule(){
  if(pollTimer)clearTimeout(pollTimer);
  pollTimer=setTimeout(pollTick,Math.min(POLL_BASE*Math.pow(2,pollFail),POLL_MAX));
}
function notifSig(n){return n?JSON.stringify([n.unreadCount,(n.items||[]).map(function(i){return [i.id,i.read];})]):'';}
function msgSig(list){return JSON.stringify((list||[]).map(function(m){return [m.msgId,m.pinnedAt,m.replyCount,m.translationState];}));}
function pollTick(){
  if(pollBusy)return pollSchedule();
  if(document.hidden)return;
  if(!window.__ME||window.__ME.kind!=='creator'||!jwtGet())return;
  pollBusy=true;
  var token=jwtGet(),changed=false;
  var work=req('GET','/me/unread').then(function(u){
    if(token!==jwtGet())return;
    var next={};(u||[]).forEach(function(x){next[x.cellId]=x;});
    if(JSON.stringify(next)!==JSON.stringify(LIVE.unread)){LIVE.unread=next;changed=true;}
  }).then(function(){return req('GET','/me/notifications?limit=30');}).then(function(n){
    if(token!==jwtGet())return;
    if(notifSig(n)!==notifSig(LIVE.notifs)){LIVE.notifs=n;changed=true;}
  }).then(function(){
    if(!LIVE.open||LIVE.open.loading||LIVE.sending)return;
    var id=LIVE.open.cellId,ch=LIVE.open.channel,version=commVersion;
    return req('GET','/community/cells/'+encodeURIComponent(id)+'/messages?channel='+ch+'&limit=200').then(function(m){
      if(version!==commVersion||token!==jwtGet()||!LIVE.open||LIVE.open.cellId!==id||LIVE.open.channel!==ch)return;
      if(msgSig(m)!==msgSig(LIVE.open.msgs)){
        LIVE.open.msgs=m;changed=true;
        var maxId=0;(m||[]).forEach(function(x){if(x.msgId&&x.msgId>maxId)maxId=x.msgId;});
        if(maxId)req('POST','/community/cells/'+encodeURIComponent(id)+'/read',{last_msg_id:maxId}).then(function(){if(LIVE.unread[id])delete LIVE.unread[id];}).catch(function(){});
      }
    });
  }).then(function(){
    if(['campaigns','work','detail','collaboration','applicationstatus'].indexOf(ui.page)<0)return;
    return Promise.all([
      req('GET','/me/campaigns').then(function(list){if(token!==jwtGet())return;if(JSON.stringify(list)!==JSON.stringify(LIVE.campaigns)){LIVE.campaigns=list;changed=true;}}),
      req('GET','/me/campaign-offers').then(function(list){if(token!==jwtGet())return;if(JSON.stringify(list)!==JSON.stringify(LIVE.offers)){LIVE.offers=list;changed=true;}})
    ]);
  }).then(function(){
    if(!LIVE.thread||!LIVE.thread.msgs||!LIVE.open||LIVE.threadBusy)return;
    var id=LIVE.open.cellId,mid=LIVE.thread.rootId,version=commVersion;
    return req('GET','/community/cells/'+encodeURIComponent(id)+'/messages/'+mid+'/thread').then(function(m){
      if(version!==commVersion||token!==jwtGet()||!LIVE.thread||LIVE.thread.rootId!==mid)return;
      if(msgSig(m)!==msgSig(LIVE.thread.msgs)){LIVE.thread={rootId:mid,msgs:m};changed=true;}
    });
  });
  return work.then(function(){pollFail=0;})
    .catch(function(){pollFail=Math.min(pollFail+1,4);})
    .then(function(){
      pollBusy=false;
      if(changed&&typeof softRender==='function')softRender();
      pollSchedule();
    });
}
window.pollNow=function(){pollFail=0;if(pollTimer)clearTimeout(pollTimer);return pollTick();};
function pollStart(){
  if(!pollWired){
    pollWired=true;
    try{document.addEventListener('visibilitychange',function(){
      if(document.hidden){if(pollTimer)clearTimeout(pollTimer);}
      else window.pollNow();
    });}catch(e){}
  }
  pollFail=0;pollSchedule();
}
window.__pollTick=pollTick;

/* ── 보존 렌더 — 폴링 갱신 시 입력·포커스·커서·스크롤 유지 ── */
window.softRender=function(){
  try{
    var act=document.activeElement,actId=act&&act.id,selS=null,selE=null,actVal=null;
    if(actId&&(act.tagName==='TEXTAREA'||act.tagName==='INPUT')){
      try{actVal=act.value;selS=act.selectionStart;selE=act.selectionEnd;}catch(e){}
    }else{actId=null;}
    var keep=[];
    ['.messages','.panel-body','.workspace','.slack-primary','.slack-side-scroll'].forEach(function(sel){
      var el=document.querySelector(sel);
      if(el)keep.push({sel:sel,top:el.scrollTop,bottom:(el.scrollHeight-el.scrollTop-el.clientHeight)<48});
    });
    var winY=(typeof window.scrollY==='number')?window.scrollY:0;
    render();
    keep.forEach(function(k){var el=document.querySelector(k.sel);if(el)el.scrollTop=k.bottom?el.scrollHeight:k.top;});
    if(window.scrollTo)window.scrollTo(0,winY);
    if(actId){
      var el=document.getElementById(actId);
      if(el){
        if(actVal!=null&&('value' in el))el.value=actVal;
        try{el.focus({preventScroll:true});}catch(e){try{el.focus();}catch(e2){}}
        try{if(selS!=null&&el.setSelectionRange)el.setSelectionRange(selS,selE);}catch(e){}
      }
    }
  }catch(e){try{render();}catch(e2){}}
};

/* ── 세션 시작 — 매직링크 소비·계정 링크(초대 수락/비밀번호 재설정)·복원 ── */
window.liveBoot=function(){
  if(resetTok){
    modal('<span class="eyebrow">ACCOUNT</span><h2 id="modalTitle">새 비밀번호 설정</h2><p class="muted">새 비밀번호(10자 이상)를 정하세요. 완료 후 다시 로그인합니다.</p><div class="field" style="margin-top:14px"><label for="axPw">새 비밀번호</label><input id="axPw" type="password"></div><div class="modal-footer"><button class="button primary" onclick="liveResetConfirm()">비밀번호 변경</button></div>');
    window.liveResetConfirm=function(){
      var pw=(document.getElementById('axPw')||{}).value||'';
      req('POST','/auth/reset/confirm',{token:resetTok,password:pw}).then(function(r){
        closeModal();history.replaceState(null,'',location.pathname);
        toast((r.message||'비밀번호 변경 완료 ✅')+(r.kind==='admin'?' — admin.theprlist.net에서 다시 로그인하세요.':' — 다시 로그인하세요.'));
      }).catch(function(e){if(isStale(e))return;toast((e&&e.message)||'링크가 만료됐거나 이미 사용됐어요 — 재설정을 다시 요청하세요.');});
    };
  }
  if(inviteTok){
    modal('<span class="eyebrow">BRAND ACCOUNT</span><h2 id="modalTitle">브랜드 계정 만들기</h2><p class="muted">초대를 수락하고 비밀번호를 정하세요 (10자 이상).</p><div class="field" style="margin-top:14px"><label for="axPw">새 비밀번호</label><input id="axPw" type="password"></div><div class="modal-footer"><button class="button primary" onclick="liveAcceptInvite()">수락하고 시작</button></div>');
    window.liveAcceptInvite=function(){
      var pw=(document.getElementById('axPw')||{}).value||'';
      req('POST','/auth/accept',{token:inviteTok,password:pw}).then(function(r){
        jwtSet(r.token);sessionBind(r.user);closeModal();
        history.replaceState(null,'',location.pathname);
        toast('계정 생성 완료 🎉 '+r.user.email+' — 브랜드 콘솔(console.theprlist.net)에서 이 계정으로 로그인하세요.');
        LIVE.authKnown=true;render();
      }).catch(function(e){if(isStale(e))return;toast('수락하지 못했습니다 — 링크가 만료됐을 수 있어요. 초대를 다시 요청하세요. 비밀번호는 10자 이상.');});
    };
  }
  if(magicTok){
    var keep={};if(LIVE.joinTarget)keep.brand=LIVE.joinTarget;if(applicationToken)keep.application=applicationToken;if(sp.get('lang'))keep.lang=sp.get('lang');
    req('POST','/auth/magic/verify',{token:magicTok}).then(function(r){
      jwtSet(r.token);sessionBind(r.user);LIVE.authKnown=true;LIVE.verifyState='';
      history.replaceState(null,'',location.pathname+(Object.keys(keep).length?'?'+new URLSearchParams(keep).toString():''));
      toast(sp.get('lang')==='en'?'Signed in ✅ '+r.user.email:'로그인 완료 ✅ '+r.user.email);
      req('GET','/me/profile').then(function(p){
        LIVE.profile=p;
        if(!p.onboarded)navigate('onboarding');
        else if(LIVE.joinTarget)navigate('join');
        else navigate('community');
        loadCreatorData();
      }).catch(function(){navigate('community');loadCreatorData();});
    }).catch(function(e){
      if(isStale(e))return;
      LIVE.verifyState='failed';LIVE.authKnown=true;
      navigate('state','expired');
    });
    render();return;
  }
  if(jwtGet()){
    req('GET','/auth/me').then(function(u){
      sessionBind(u);LIVE.authKnown=true;render();loadCreatorData();
    }).catch(function(e){if(isStale(e))return;jwtClear();LIVE.authKnown=true;render();});
  }else{
    LIVE.authKnown=true;
  }
  render();
  loadCreatorData();
};
})();
