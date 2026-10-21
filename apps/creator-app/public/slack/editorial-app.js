/* slack-v3 원본 editorial-app.js의 실데이터 각색 — 마크업·클래스·구성은
   원본을 유지하고, 예시 데이터(brands/campaigns/sampleMessages/store 상태)만
   live-core의 실제 서버 데이터로 바꾼다. 시안 전용 요소(DESIGN PREVIEW,
   체험 안내)는 실제 이용 안내로 치환. */
const $=s=>document.querySelector(s),E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={community:'M21 11a8 8 0 0 1-8 8H5l-3 3V11a8 8 0 0 1 8-8h3a8 8 0 0 1 8 8Z',campaigns:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',work:'M3 7h18v14H3zM8 7V3h8v4M3 12h18M10 12v3h4v-3',messages:'M3 4h18v16H3zM3 5l9 8 9-8',space:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',settings:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',search:'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6',arrow:'M5 12h14m-5-5 5 5-5 5',back:'M19 12H5m5-5-5 5 5 5',send:'m3 3 18 9-18 9 4-9-4-9Zm4 9h14',bookmark:'M6 3h12v19l-6-4-6 4z',globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18',more:'M5 12h.01M12 12h.01M19 12h.01',check:'m5 12 4 4L19 6',link:'m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1'};
const I=(name,size=20)=>`<svg class="ico" style="width:${size}px;height:${size}px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.community}"/></svg>`;
let ui={page:'community',brand:null,channel:'chat',filter:'all',dm:null,setting:store.setting||'profile',workFilter:'active',thread:null,original:{},campaign:null,routeId:'',panel:null,mobileChannels:false,missionTab:'missions'};
const labels={community:'커뮤니티',campaigns:'캠페인',work:'내 협업',messages:'메시지',space:'내 공간',settings:'설정',detail:'캠페인 상세'};
const CHANNEL_NAMES={chat:'자유 대화',notice:'공지사항',tips:'콘텐츠 팁'};
const btn=(text,fn,kind='')=>`<button class="button ${kind}" onclick="${fn}">${text}</button>`;
const pill=(t,c='')=>`<span class="pill ${c}">${t}</span>`;
let timer;function toast(t){const el=$('#toast');el.innerHTML=t;el.style.display='block';clearTimeout(timer);timer=setTimeout(()=>el.style.display='none',4200)}
function closeModal(){$('#modal').close()}
function modal(html){$('#modalBody').innerHTML=html;$('#modal').showModal()}
function avatar(letter,cls=''){return `<span class="avatar ${cls}">${E(letter)}</span>`}
function myName(){const me=window.__ME;if(!me)return '크리에이터';const h=LIVE.profile&&LIVE.profile.tiktokHandle;return (h&&h.replace(/^@/,''))||((me.email||'').split('@')[0])||'크리에이터'}
function captureDraft(){
  // 세션 소유자 검증 — 로그아웃 직후나 계정 교체 중에는 화면에 남은 입력을
  // 캡처하지 않는다(다른 계정 스토어로의 유입·메모리 잔존 방지).
  if(!window.__ME||!window.__storeUser||window.__storeUser()!==window.__ME.userId)return;
  const d=$('#chatDraft');
  if(d&&d.dataset.key&&d.dataset.key.indexOf('u:'+window.__ME.userId+':')===0){store.drafts[d.dataset.key]=d.value;save()}
}
function navigate(page,id){captureDraft();ui.page=page;ui.thread=null;if(id)ui.campaign=id;history.pushState(null,'','#'+page+(id?'/'+id:''));render();window.scrollTo(0,0)}
function selectBrand(brandId){captureDraft();ui.brand=brandId;ui.channel='chat';ui.thread=null;const b=brandById(brandId);if(b&&b.cellId)openCell(b.cellId,b.cellName,'chat');else render()}
function selectChannel(channel){captureDraft();ui.channel=channel;ui.thread=null;if(typeof selectChannelLive==='function')selectChannelLive(channel);else render()}
function pageHead(kicker,title,desc,action=''){return `<div class="page-head"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${desc}</p></div>${action}</div>`}

/* ── 대화(커뮤니티 채널·담당자 DM) — 실제 메시지·번역·스레드 ── */
/* 초안 키 — 사용자ID+셀(브랜드 소속)+채널로 네임스페이스: 같은 기기의
   다른 계정이 이 초안을 보거나 보낼 수 없다(store 자체도 계정별 저장). */
function chatKey(){if(!LIVE.open||!window.__ME)return '';return 'u:'+window.__ME.userId+':'+LIVE.open.cellId+':'+LIVE.open.channel}
function fmtTime(at){if(!at)return '';try{const d=new Date(at);const h=d.getHours(),m=String(d.getMinutes()).padStart(2,'0');return (h<12?'오전 ':'오후 ')+((h%12)||12)+':'+m}catch(e){return String(at).slice(11,16)}}
function fmtDay(at){try{const d=new Date(at),now=new Date();const base=(d.getMonth()+1)+'월 '+d.getDate()+'일';return d.toDateString()===now.toDateString()?base+' · 오늘':base}catch(e){return ''}}
function messageHtml(m,dm,key){
  const lang=window.__USER_LANG||'ko';
  let translated=m.translations&&m.translations[lang];
  if(typeof translated!=='string'||!translated.trim()||/^\[[a-z]{2}·번역대기\]/.test(translated))translated='';
  const shown=translated||m.original,isTr=!!translated&&shown!==m.original;
  const pending=!translated&&m.originalLocale&&m.originalLocale!==lang;
  const origin=ui.original[key+m.msgId];
  const mine=m.authorKind!=='brand'&&m.authorKind!=='ari'&&m.author===myName();
  return `<article class="message">${avatar((m.author||'?').slice(0,1),m.authorKind==='brand'?'olive':mine?'dark':'rose')}<div class="message-body"><div class="message-name">${E(m.author||'멤버')}${m.authorKind==='brand'?`<span class="role">브랜드 · 담당자</span>`:m.authorKind==='ari'?`<span class="role">운영</span>`:''}<time>${E(fmtTime(m.at))}</time>${m.pinnedAt?pill('📌 고정됨','sand'):''}</div><p>${E(shown)}</p>${isTr?`<div class="translation-meta">${I('globe',9)} ${langLabel(lang)} 번역 · <button onclick="ui.original['${key+m.msgId}']=!ui.original['${key+m.msgId}'];render()">${origin?'원문 닫기':'원문 보기'}</button></div>${origin?`<div class="original">${E(m.original)}</div>`:''}`:pending?`<div class="translation-meta">${I('globe',9)} ${m.translationState==='failed'?'번역 실패 · 원문 표시':'번역 준비 중 · 원문 표시'}</div>`:''}${m.msgId?`<div class="reaction"><button onclick="threadOpen(${m.msgId})">${m.replyCount?'답글 '+m.replyCount+'개 보기':'스레드에 답글'}</button></div>`:''}</div></article>`
}
function conversation(dm){
  const open=LIVE.open,key=chatKey();
  const cell=open&&(LIVE.cells||[]).find(c=>c.cellId===open.cellId);
  const brandName=cell?(cell.brandName||cell.brandId):'';
  const title=open?(open.dm?brandName+' 담당자':CHANNEL_NAMES[open.channel]||'자유 대화'):'커뮤니티';
  const sub=open?(open.dm?'브랜드 담당자 · 1:1 대화':open.channel==='notice'?'브랜드의 새로운 소식을 확인하세요':'작은 일상부터 새로운 아이디어까지.'):'브랜드를 선택해 대화를 시작하세요.';
  let feed='';
  if(!open)feed=`<div class="date-divider">${(brandsLive().length?'왼쪽에서 브랜드와 채널을 선택하세요.':'아직 참여한 브랜드가 없어요 — 브랜드의 초대 링크로 합류하세요.')}</div>`;
  else if(open.loading)feed='<div class="loading-lines" role="status" aria-label="불러오는 중"><div></div><div></div><div></div></div>';
  else if(open.error)feed=`<div class="date-divider" role="alert">${E(open.error)}</div>`;
  else{
    const msgs=(open.msgs||[]).filter(m=>m.channel===open.channel);
    const ordered=msgs.filter(m=>m.pinnedAt).concat(msgs.filter(m=>!m.pinnedAt));
    let lastDay='';
    feed=ordered.map(m=>{const day=fmtDay(m.at);const div=day&&day!==lastDay?`<div class="date-divider">${day}</div>`:'';lastDay=day||lastDay;return div+messageHtml(m,dm,key)}).join('')
      ||`<div class="date-divider">${open.channel==='notice'?'아직 공지가 없어요 — 브랜드의 새 소식이 이곳에 올라와요.':'첫 대화를 시작해 보세요. 메시지는 내 언어로 자동 번역돼요.'}</div>`;
  }
  const searchBox=LIVE.searchRes!==null?`<div class="live-search-res" role="region" aria-label="검색 결과"><p class="live-search-head"><b>검색 결과 ${LIVE.searchRes.length}건</b><button class="text-link" onclick="commSearchClear()">닫기 ×</button></p>${LIVE.searchRes.map(m=>`<p><b>${E(m.author)}</b> <small>${E((m.at||'').slice(0,16).replace('T',' '))}</small><br>${E(m.original)}${m.msgId&&!m.threadParent?` <button class="text-link" onclick="threadOpen(${m.msgId})">스레드 보기 →</button>`:''}</p>`).join('')||'<p>일치하는 메시지가 없습니다.</p>'}</div>`:'';
  return `<section class="conversation"><header class="conversation-head">${open&&open.dm?avatar(brandName.slice(0,1),'olive'):I('community',22)}<div><h2>${E(title)}</h2><p>${E(sub)}${cell&&!open.dm?` · ${E(brandName)} 멤버 ${cell.memberCount||0}명`:''}</p></div><button class="icon-btn" onclick="${dm?'contactDialog()':'guideDialog()'}" aria-label="${dm?'담당자 정보':'커뮤니티 정보'}">${I('more',17)}</button></header><div class="translation-bar">${I('globe',12)} ${langLabel(window.__USER_LANG||'ko')}로 번역 표시 · 번역이 없으면 원문<button onclick="languageDialog()">언어 설정 ↗</button></div><div class="messages" id="messageFeed">${searchBox}${feed}</div>${open&&open.channel==='notice'&&!open.dm?'<div class="composer-area"><p class="muted" style="font-size:11px;text-align:center">공지는 브랜드 담당자가 게시하는 읽기 전용 채널입니다 — 질문은 각 공지의 스레드에 남겨 주세요.</p></div>':open?`<form class="composer-area" onsubmit="event.preventDefault();sendMessage()"><div class="composer"><textarea id="chatDraft" data-key="${E(key)}" aria-label="메시지 작성" maxlength="2000" placeholder="${open.dm?'담당자에게 메시지를 남겨보세요…':'함께 나누고 싶은 이야기를 남겨보세요…'}" oninput="store.drafts[this.dataset.key]=this.value" ${LIVE.sending?'disabled':''}>${E(store.drafts[key]||'')}</textarea><div class="composer-bottom"><small>Enter 전송 · Shift + Enter 줄바꿈 · 내 언어로 쓰면 자동 번역돼요</small><button class="send-btn" type="submit" aria-label="메시지 보내기" ${LIVE.sending?'disabled':''}>${I('send',14)}</button></div></div></form>`:''}</section>`
}

/* ── 캠페인 목록·카드·상세 — 실제 모집 데이터 ── */
function campaignStatusPill(c){
  if(c.termsState)return pill(offerStateLabel(c.termsState));
  if(c.myStatus==='applied')return pill('신청 검토 중');
  if(c.myStatus==='rejected')return pill('미선정','gray');
  if(campExpired(c))return pill('모집 마감','gray');
  return pill('모집 중');
}
const COUNTRY_NAMES={KR:'한국',TH:'태국',US:'미국',VN:'베트남',JP:'일본'};
function countryName(c){return COUNTRY_NAMES[c]||c}
function countryList(cs){return (cs||[]).map(countryName).join(' · ')}
function rewardLabel(t){return ({affiliate:'어필리에이트 커미션',gifted:'제품 제공(기프트)',paid:'고정 보상'})[t]||'브랜드와 확인'}
function campaignList(){
  if(LIVE.loadErr.campaigns)return pageHead('CAMPAIGNS','함께할 캠페인','나의 취향과 맞는 제품, 다음 협업을 찾아보세요.')+empty('globe','캠페인을 불러오지 못했어요.','연결 상태를 확인한 뒤 다시 시도해 주세요.',btn('다시 불러오기','collabRefresh()','primary'));
  if(!LIVE.campaigns)return pageHead('CAMPAIGNS','함께할 캠페인','나의 취향과 맞는 제품, 다음 협업을 찾아보세요.')+'<div class="loading-lines" role="status"><div></div><div></div><div></div></div>';
  const all=campaignsLive();
  const applied=all.filter(c=>c.myStatus!=='none'||c.termsState);
  const list=all.filter(c=>ui.filter==='saved'?store.saved.includes(c.campaignId):ui.filter==='applied'?(c.myStatus!=='none'||c.termsState):true);
  return pageHead('CAMPAIGNS','함께할 캠페인','나의 취향과 맞는 제품, 다음 협업을 찾아보세요.')+`<div class="tabs" role="tablist">${[['all','모든 캠페인',all.length],['saved','저장한 캠페인',store.saved.filter(id=>all.some(c=>c.campaignId===id)).length],['applied','신청한 캠페인',applied.length]].map(([k,l,n])=>`<button role="tab" aria-selected="${ui.filter===k}" class="${ui.filter===k?'active':''}" onclick="ui.filter='${k}';render()">${l}<small>${n}</small></button>`).join('')}</div>${list.length?`<div class="campaign-grid">${list.map(c=>campaignCard(c)).join('')}</div>`:empty('campaigns',ui.filter==='applied'?'아직 신청한 캠페인이 없어요.':ui.filter==='saved'?'저장한 캠페인이 없어요.':'아직 열린 캠페인이 없어요.',ui.filter==='all'?'참여한 브랜드가 새 모집을 열면 이곳에서 확인할 수 있어요.':'관심 있는 캠페인을 살펴보고, 함께 만들고 싶은 이야기를 찾아보세요.',btn('캠페인 둘러보기',"ui.filter='all';render()",'primary'))}`
}
function campaignCard(c){
  const b=brandById(c.brandId)||{name:c.brandName||c.brandId,initial:(c.brandName||c.brandId||'?').slice(0,1).toUpperCase(),alt:false};
  const saved=store.saved.includes(c.campaignId);
  return `<article class="card"><div class="campaign-photo"><img src="${campaignArt(c)}" alt="${E(c.brandName||c.brandId)} 캠페인" loading="lazy">${campaignStatusPill(c)}<button class="bookmark ${saved?'on':''}" aria-label="${saved?'저장 취소':'캠페인 저장'}" aria-pressed="${saved}" onclick="toggleSaved('${E(c.campaignId)}')">${I('bookmark',15)}</button></div><div class="campaign-body"><div class="mini-brand"><span class="brand-letter ${b.alt?'mellow':''}">${E(b.initial)}</span>${E(b.name)}</div><h3>${E(c.name)}</h3><p>${E(c.product||'제품 정보는 브랜드 담당자에게 확인하세요.')}</p><div class="campaign-facts"><span>제안 커미션<b>${c.affiliatePct!=null?E(c.affiliatePct)+'%':'확인 필요'}</b></span><span>보상 유형<b>${E(rewardLabel(c.rewardType))}</b></span><span>신청 마감<b>${c.deadline?E(String(c.deadline).slice(0,10)):'별도 안내'}</b></span></div>${c.eligible===false?`<p class="muted" style="font-size:11px">${E(c.ineligibleReason||'이 캠페인의 대상 지역이 아닙니다.')}</p>`:''}${btn('캠페인 자세히 보기 '+I('arrow',14),`navigate('detail','${E(c.campaignId)}')`,'wide')}</div></article>`
}
function toggleSaved(id){store.saved=store.saved.includes(id)?store.saved.filter(x=>x!==id):store.saved.concat(id);save();render()}
function campaignDetail(){
  const c=campaignById(ui.campaign);
  if(!c)return `<button class="back" onclick="navigate('campaigns')">${I('back',14)}캠페인 목록</button>`+(!LIVE.campaigns?'<div class="loading-lines" role="status"><div></div><div></div><div></div></div>':empty('campaigns','캠페인을 찾을 수 없어요.','마감되었거나 내 멤버십 브랜드의 캠페인이 아닐 수 있어요.',btn('캠페인 목록 보기',"navigate('campaigns')",'primary')));
  const b=brandById(c.brandId)||{name:c.brandName||c.brandId};
  const offer=offerByCampaign(c.campaignId);
  const applied=c.myStatus!=='none'||!!c.termsState;
  const expired=campExpired(c);
  const gate=!entryReady()&&!applied;
  const cta=offer?btn('내 협업에서 진행하기',`navigate('collaboration','${E(c.campaignId)}')`,'primary wide')
    :applied?btn('신청 상태 보기',`navigate('applicationstatus','${E(c.campaignId)}')`,'primary wide')
    :expired?`<p class="muted" style="text-align:center">모집이 마감되었어요 — 다음 캠페인을 기다려 주세요.</p>`
    :c.eligible===false?btn('내 공간에서 국가 확인',"ui.setting='profile';navigate('settings')",'wide')
    :gate?btn('입장 준비 완료하기 (TikTok 인증)',"ui.setting='profile';navigate('settings')",'primary wide')
    :btn('캠페인 신청하기',`navigate('application','${E(c.campaignId)}')`,'primary wide');
  return `<button class="back" onclick="navigate('campaigns')">${I('back',14)}캠페인 목록</button><div class="detail-layout"><div><img class="detail-hero" src="${campaignArt(c)}" alt="${E(c.name)} 캠페인"><section class="detail-title"><div class="mini-brand">${E(b.name)} ${campaignStatusPill(c)}</div><h1>${E(c.name)}</h1><p>${E(c.product||'')}</p></section><div class="tabs detail-tabs">${[['about','캠페인 소개'],['guide','콘텐츠 가이드'],['schedule','진행 일정']].map(([id,l])=>`<button onclick="document.getElementById('${id}').scrollIntoView({behavior:'smooth'})">${l}</button>`).join('')}</div><section class="detail-section" id="about"><h2>이런 이야기를 기다려요.</h2><p>${E(c.usp||'제품을 직접 경험하고 솔직한 사용 이야기를 전해 주세요. 자세한 조건은 브랜드 담당자와 확인할 수 있어요.')}</p><div class="line"></div><h3 style="font-size:14px;margin-bottom:10px">함께하고 싶은 크리에이터</h3><ul><li>제품을 직접 경험하고 솔직한 사용 이야기를 전할 수 있는 분</li><li>협찬 표기와 콘텐츠 기준을 지키는 분</li><li>타깃 국가: ${(c.countries||[]).length?E(countryList(c.countries)):'전체'}${c.eligible===false?' — 내 지역 아님':''}</li></ul></section><section class="detail-section" id="guide"><h2>당신의 시선을 존중해요.</h2><div class="step-grid"><div class="step-tile"><span class="step-num">01 / FORMAT</span><b>${E(c.product||'브랜드 제품')} 콘텐츠</b><small>자연광과 실제 사용 장면을 권장해요.</small></div><div class="step-tile"><span class="step-num">02 / MUST HAVE</span><b>제품 사용 · 브랜드 태그</b><small>제품명이 잘 보이도록 소개해 주세요.</small></div><div class="step-tile"><span class="step-num">03 / PLEASE NOTE</span><b>협찬 표기 · 솔직한 표현</b><small>과장된 효능과 의학적 표현은 피해주세요.</small></div></div><div class="notice-box">광고 사용 권한(Spark 코드)은 선정·합의 후 내 협업에서 제출합니다. 실제 게시 일정과 최종 조건은 담당자와 확정하세요.</div></section><section class="detail-section" id="schedule"><h2>함께하는 과정.</h2><div class="summary-row"><span>크리에이터 신청</span><b>${c.deadline?'~ '+E(String(c.deadline).slice(0,10)):'별도 안내'}</b></div><div class="summary-row"><span>브랜드 검토·선정</span><b>신청 후 개별 안내</b></div><div class="summary-row"><span>조건 확인 · 수수료 합의</span><b>선정 후 내 협업에서</b></div><div class="summary-row"><span>샘플 수령 · 콘텐츠 제출</span><b>합의 후 진행</b></div></section></div><aside class="detail-aside"><div class="card apply-summary">${campaignStatusPill(c)}<h3>${E(c.name)}</h3><div class="summary-row"><span>제품</span><b>${E(c.product||'담당자와 확인')}</b></div><div class="summary-row"><span>제안 커미션</span><b>${c.affiliatePct!=null?E(c.affiliatePct)+'%':'브랜드와 확인'}</b></div><div class="summary-row"><span>보상 유형</span><b>${E(rewardLabel(c.rewardType))}</b></div><div class="summary-row"><span>모집 마감</span><b>${c.deadline?E(String(c.deadline).slice(0,10)):'별도 안내'}</b></div><div class="line"></div>${cta}<button class="text-link" style="display:flex;margin:13px auto 0" onclick="toggleSaved('${E(c.campaignId)}')">${I('bookmark',13)}${store.saved.includes(c.campaignId)?'저장됨':'나중에 다시 보기'}</button><p>신청은 참여 확정을 의미하지 않습니다.<br>선정 후 수수료와 조건에 별도로 합의합니다.</p></div></aside></div>`
}

/* ── 진행 단계(실제 협업 상태) ── */
const OFFER_STEPS=['selected','terms_agreed','sample_shipped','content_submitted','completed'];
const OFFER_STEP_LABELS=['선정','조건 합의','샘플 배송','콘텐츠 제출','완료'];
function progress(state){const stage=OFFER_STEPS.indexOf(state);if(stage<0)return '';return `<ol class="progress" aria-label="협업 진행 상태">${OFFER_STEP_LABELS.map((t,i)=>`<li class="${i<stage?'done':i===stage?'current':''}" ${i===stage?'aria-current="step"':''}><span>${i<stage?'✓':'0'+(i+1)}</span>${t}</li>`).join('')}</ol>`}

/* ── 메시지(DM 목록) ── */
function messagesPage(){
  if(LIVE.loadErr.community)return pageHead('DIRECT MESSAGES','메시지','브랜드 담당자와 나누는 1:1 대화.')+empty('globe','대화 목록을 불러오지 못했어요.','연결 상태를 확인한 뒤 다시 시도해 주세요.',btn('다시 불러오기','loadCreatorData()','primary'));
  if(!LIVE.cells)return pageHead('DIRECT MESSAGES','메시지','브랜드 담당자와 나누는 1:1 대화.')+'<div class="loading-lines" role="status"><div></div><div></div><div></div></div>';
  const dms=(LIVE.cells||[]).filter(c=>c.kind==='dm');
  const members=brandsLive();
  return pageHead('DIRECT MESSAGES','메시지','브랜드 담당자와 나누는 1:1 대화.')+`<section class="card inbox-layout"><aside class="dm-list"><div class="dm-search">${I('search',12)}<input placeholder="담당자 찾기" aria-label="담당자 검색" oninput="filterDM(this.value)"></div>${members.length?members.map(b=>{const dm=dmCellFor(b.brandId);const un=dm?unreadCount(dm.cellId):0;const active=LIVE.open&&dm&&LIVE.open.cellId===dm.cellId;return `<button class="dm-item ${active?'active':''}" data-dm-name="${E((b.name+' '+b.brandId).toLowerCase())}" onclick="openDm('${E(b.brandId)}')">${avatar(b.initial,'olive')}<div><b>${E(b.name)} 담당자</b><p>${dm?'대화 이어가기':'담당자와 1:1 대화 시작'}</p></div><time>${un?un+'↘':''}</time></button>`}).join(''):'<p class="muted" style="padding:14px;font-size:12px">참여한 브랜드가 없어요 — 초대 링크로 합류하면 담당자와 대화할 수 있어요.</p>'}</aside>${LIVE.open&&LIVE.open.dm?conversation(true):`<section class="conversation"><div class="messages"><div class="date-divider">왼쪽에서 브랜드 담당자를 선택해 대화를 시작하세요.</div></div></section>`}</section>`
}
function filterDM(q){document.querySelectorAll('.dm-item').forEach(e=>e.hidden=!e.dataset.dmName.includes(q.toLowerCase()))}
function contactDialog(){
  const cell=LIVE.open&&(LIVE.cells||[]).find(c=>c.cellId===LIVE.open.cellId);
  const name=cell?(cell.brandName||cell.brandId):'브랜드';
  modal(`<span class="eyebrow">BRAND CONTACT</span><h2 id="modalTitle">${E(name)} 담당자</h2><p class="muted">브랜드 캠페인 담당자</p><div class="notice-box">샘플 배송·콘텐츠 가이드·수수료 조건과 협업 일정을 이 대화에서 확인할 수 있습니다.</div><div class="modal-footer">${cell?btn('브랜드 커뮤니티',`closeModal();selectBrand('${E(cell.brandId)}');navigate('community')`):''}${btn('닫기','closeModal()','primary')}</div>`)
}

/* ── 내 공간 ── */
function spacePage(){
  const p=LIVE.profile,bs=brandsLive();
  const activeOffers=(LIVE.offers||[]).filter(o=>['selected','terms_agreed','sample_shipped','content_submitted'].includes(o.state));
  const savedList=campaignsLive().filter(c=>store.saved.includes(c.campaignId));
  return pageHead('MY SPACE','내 공간','함께하는 브랜드와 기록을 한곳에서.')+`<section class="space-banner">${avatar(myName()[0])}<div><h2>${E(myName())} <small style="font-size:10px;font-weight:400;margin-left:5px">CREATOR</small></h2><p>${E((p&&p.tiktokHandle)||window.__ME.email||'')} · ${E((p&&p.country)||'국가 미설정')}${p&&p.entryReady?' · 입장 준비 완료 ✓':p&&p.onboarded?' · TikTok 인증 대기':''}</p></div>${btn('프로필 편집 '+I('arrow',12),"ui.setting='profile';navigate('settings')",'small')}</section><div class="stats"><div class="card stat"><small>함께하는 브랜드</small><strong>${bs.length}<em>곳</em></strong></div><div class="card stat"><small>진행 중 협업</small><strong>${activeOffers.length}<em>개</em></strong></div><div class="card stat"><small>활동 XP</small><strong>${(LIVE.xp&&LIVE.xp.total)||0}<em>XP</em></strong></div></div><section class="space-section"><div class="row between"><h2>함께하는 브랜드</h2><button class="text-link" onclick="inviteDialog()">초대 링크로 참여 ＋</button></div>${membershipStateGet()==='error'?`<div class="notice-box">가입 목록을 불러오지 못했습니다 — 기존 가입이 취소된 것은 아닙니다. <button class="text-link" onclick="retryMemberships()">다시 불러오기</button></div>`:''}<div class="brand-grid">${bs.length?bs.map(b=>`<article class="card brand-card"><img src="${brandArt(b)}" alt="${E(b.name)} 브랜드"><div class="brand-card-body"><span class="brand-letter ${b.alt?'mellow':''}">${E(b.initial)}</span><div><h3>${E(b.name)}</h3><p>${E(b.tagline||'브랜드 커뮤니티 멤버')}</p></div>${btn('커뮤니티 ↗',`selectBrand('${E(b.brandId)}');navigate('community')`,'small')}</div></article>`).join(''):''}</div>${!bs.length&&membershipStateGet()==='ready'?empty('community','아직 함께하는 브랜드가 없어요.','브랜드가 보낸 초대 링크로 커뮤니티에 참여할 수 있어요.',btn('초대 링크 입력','inviteDialog()','primary')):''}</section><section class="space-section"><div class="row between"><h2>기억해 둔 캠페인</h2><button class="text-link" onclick="ui.filter='saved';navigate('campaigns')">전체 보기 →</button></div><div style="margin-top:18px">${savedList.length?savedList.slice(0,1).map(c=>`<article class="card work-card"><div class="work-top"><img class="work-thumb" src="${campaignArt(c)}" alt="캠페인 제품"><div><div class="mini-brand">${E(c.brandName||c.brandId)}</div><h3>${E(c.name)}</h3><span class="muted" style="font-size:11px">${c.deadline?String(c.deadline).slice(0,10)+'까지 모집':'모집 중'} · 제안 커미션 ${c.affiliatePct!=null?c.affiliatePct+'%':'확인 필요'}</span></div><div class="right">${btn('상세 보기',`navigate('detail','${E(c.campaignId)}')`,'small')}</div></div></article>`).join(''):empty('bookmark','저장한 캠페인이 없어요.','캠페인 카드의 북마크를 눌러 다음 기회를 기억해 두세요.','')}</div></section>`
}

/* ── 설정 — 프로필(온보딩·TikTok)·언어·알림·계정 ── */
function onboardingFormHtml(next){
  const p=LIVE.profile;
  if(!p)return '<div class="loading-lines" role="status"><div></div><div></div><div></div></div>';
  const st=p.states||{};
  const configured=!!(p.tiktokConfigured||(LIVE.tiktok&&LIVE.tiktok.configured));
  const states=`<div class="fields" style="gap:8px"><div class="summary-row"><span>이메일 로그인</span><b>완료 ✓</b></div><div class="summary-row"><span>TikTok 계정 소유 인증</span><b>${E(tiktokStateLabel(st.tiktokOwner))}</b></div><div class="summary-row"><span>TikTok Shop 어필리에이트 자격</span><b>${E(tiktokStateLabel(st.tiktokShop))}</b></div><div class="summary-row"><span>운영팀 본인 확인</span><b>${st.opsVerified?'확인됨 ✓':'확인 대기'}</b></div></div>`;
  const tiktokRow=configured
    ?`<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px"><button class="button small" onclick="tiktokConnect()" ${LIVE.tiktokBusy?'disabled':''}>${LIVE.tiktokBusy?'여는 중…':st.tiktokOwner==='connected'?'TikTok 다시 연결':'TikTok으로 소유 인증'}</button>${st.tiktokOwner==='connected'?`<button class="button small" onclick="tiktokDisconnect()">인증 해제</button>`:''}<button class="button small" onclick="tiktokRefresh()">상태 새로고침</button></div>`
    :`<div class="notice-box">${E((LIVE.tiktok&&LIVE.tiktok.hint)||'TikTok 공식 연동 승인 대기 중 — 연결 전까지 미연결로 표시됩니다. 핸들 입력만으로는 인증이 완료되지 않습니다.')}</div>`;
  const entryNote=p.entryReady?'<div class="notice-box">✓ 입장 요건 충족 — 브랜드 합류와 캠페인 신청이 가능해요.</div>'
    :p.onboarded?'<div class="notice-box" role="status"><b>TikTok 계정 소유 인증이 남았어요.</b> 신규 회원은 인증 완료 전에는 브랜드 합류 · 캠페인 신청이 제한됩니다.'+(configured?'':' 공식 연동 승인 대기 중에는 인증을 완료할 수 없어 입장이 대기 상태로 남아요 — 승인되면 이 화면에서 바로 연결할 수 있어요.')+(p.legacyMember?' 기존 멤버는 이용을 계속하면서 아래 정보를 다시 연결해 주세요.':'')+'</div>'
    :'<div class="notice-box">국가 · 배송 가능 국가 · 필수 동의 저장 후 <b>TikTok 계정 소유 인증</b>까지 완료하면 브랜드 합류와 캠페인 신청을 시작할 수 있어요.</div>';
  return `${entryNote}${states}${tiktokRow}<div class="fields" style="margin-top:16px"><div class="field-pair"><div class="field"><label for="joinCountry">활동 국가 (2자리 코드)</label><input id="joinCountry" maxlength="2" value="${E(p.country||'')}" placeholder="KR" autocapitalize="characters"></div><div class="field"><label for="joinShip">배송 가능 국가 (쉼표 구분)</label><input id="joinShip" value="${E((p.shipCountries||[]).join(', '))}" placeholder="KR, TH"></div></div><div class="field"><label>대화 언어</label><div class="row" style="gap:12px;flex-wrap:wrap">${['ko','en','th','vi','ja'].map(l=>`<label style="display:flex;align-items:center;gap:5px;font-size:12px"><input type="checkbox" id="joinLang_${l}" ${(p.languages||[]).includes(l)?'checked':''}>${langLabel(l)}</label>`).join('')}</div></div><div class="field"><label for="joinHandle">TikTok 계정</label><input id="joinHandle" value="${E(p.tiktokHandle||'')}" placeholder="@creator"><small>핸들 저장은 소유 인증이 아니에요 — 핸들을 바꾸면 소유 인증을 다시 진행해야 합니다.</small></div><label class="check"><input type="checkbox" id="joinConsentTerms" ${p.consentedVersion?'checked':''}>이용약관에 동의합니다. (필수)</label><label class="check"><input type="checkbox" id="joinConsentPrivacy" ${p.consentedVersion?'checked':''}>개인정보 처리방침에 동의합니다. (필수)</label>${p.consentText?`<small class="muted">${E(p.consentText)}</small>`:''}</div><div class="save-row"><small>프로필은 브랜드 합류·캠페인 조건 확인에 사용돼요.</small><button class="button primary" onclick="profileSaveLive(${next?'onboardNext':'null'})" ${LIVE.profileBusy?'disabled':''}>${LIVE.profileBusy?'저장 중…':next?'프로필 저장하고 계속':'변경사항 저장'}</button></div>`
}
function settingsPage(){
  let content='';
  if(ui.setting==='profile')content=`<h2>나를 소개해 주세요.</h2><p>브랜드 합류와 캠페인 신청에 쓰이는 크리에이터 프로필과 연결 상태입니다.</p>${onboardingFormHtml()}`;
  if(ui.setting==='language')content=`<h2>나의 언어로, 자연스럽게.</h2><p>커뮤니티와 담당자 대화의 번역 표시를 설정하세요.</p><div class="field"><label for="langSelect">표시할 언어</label><select id="langSelect" onchange="setConversationLang(this.value)">${LIVE_LANGS.map(([v,l])=>`<option value="${v}" ${(window.__USER_LANG||'ko')===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="setting-row"><div><h3>접속 국가에 맞춰 자동 선택</h3><p>접속 국가(IP)와 브라우저 언어로 표시 언어를 다시 고릅니다.</p></div>${btn('자동 선택','useAutomaticConversationLang()','small')}</div><div class="notice-box">선택한 언어로 번역된 메시지를 먼저 표시하고, 번역이 준비되지 않으면 원문을 보여줍니다. 계약 조건과 수수료는 원문도 함께 확인하세요.</div>`;
  if(ui.setting==='notifications'){
    const n=LIVE.notifs;
    content=`<h2>필요한 소식만, 놓치지 않게.</h2><p>선정·공지·담당자 메시지 등 내 활동 알림입니다.</p>${!n?'<div class="loading-lines" role="status"><div></div><div></div><div></div></div>':(n.items||[]).length?`<div class="row between" style="margin-bottom:8px"><small class="muted">안 읽음 ${n.unreadCount||0}건</small><button class="text-link" onclick="notifReadAll()">모두 읽음 처리 →</button></div>`+(n.items||[]).map((i,idx)=>`<button class="event-row" onclick="notifGo(${idx})">${avatar((i.title||'알')[0],i.read?'':'olive')}<div><b>${E(i.title)}</b><p>${E(i.body||'')}</p><time>${E((i.at||'').slice(0,16).replace('T',' '))}${i.read?'':' · 안 읽음'}</time></div>${I('arrow',12)}</button>`).join(''):empty('bell','새 알림이 없어요.','브랜드의 선정·공지 소식이 이곳에 도착해요.','')}`;
  }
  if(ui.setting==='account')content=`<h2>연결과 계정.</h2><p>활동 계정과 서비스 이용 정보를 확인하세요.</p><div class="setting-row"><div><h3>이메일</h3><p>${E(window.__ME.email||'')} · 매직링크 로그인</p></div>${pill('로그인됨')}</div><div class="setting-row"><div><h3>TikTok</h3><p>${E((LIVE.profile&&LIVE.profile.tiktokHandle)||'미입력')} · ${E(tiktokStateLabel(LIVE.profile&&LIVE.profile.states&&LIVE.profile.states.tiktokOwner))}</p></div>${pill(LIVE.profile&&LIVE.profile.states&&LIVE.profile.states.tiktokOwner==='connected'?'인증됨':'인증 대기','gray')}</div><div class="notice-box">TikTok 소유 인증과 어필리에이트 자격은 프로필 탭에서 진행할 수 있어요.</div><div class="line"></div><div class="fields"><a href="https://theprlist.net/terms" target="_blank" rel="noopener">서비스 이용약관 ↗</a><a href="https://theprlist.net/privacy" target="_blank" rel="noopener">개인정보처리방침 ↗</a></div><button class="text-link" onclick="authLogout()">로그아웃 →</button>`;
  return pageHead('PREFERENCES','설정','프로필과 언어, 필요한 소식을 관리하세요.')+`<div class="setting-layout"><nav class="setting-nav" aria-label="설정 메뉴">${[['profile','프로필'],['language','언어·번역'],['notifications','알림'],['account','계정·연결']].map(([k,t])=>`<button class="${ui.setting===k?'active':''}" onclick="ui.setting='${k}';store.setting='${k}';save();render()">${t}</button>`).join('')}</nav><section class="card setting-panel">${content}</section></div>`
}

function empty(icon,title,desc,action){return `<div class="card empty">${I(icon,34)}<h3>${title}</h3><p>${desc}</p>${action}</div>`}
function languageDialog(){modal(`<span class="eyebrow">CONVERSATION LANGUAGE</span><h2 id="modalTitle">나의 언어로 읽어요.</h2><p class="muted">대화와 담당자 DM을 선택한 언어로 번역해 표시합니다. 번역이 없으면 원문을 보여줘요.</p><div class="field"><label for="quickLanguage">번역 표시 언어</label><select id="quickLanguage" onchange="setConversationLang(this.value)">${LIVE_LANGS.map(([v,l])=>`<option value="${v}" ${(window.__USER_LANG||'ko')===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="setting-row"><div><h3>접속 국가에 맞춰 자동 선택</h3><p>접속 국가(IP)와 브라우저 언어로 다시 고릅니다.</p></div>${btn('자동','useAutomaticConversationLang()','small')}</div><div class="modal-footer">${btn('적용','closeModal();render()','primary')}</div>`)}
function notifications(){
  const n=LIVE.notifs;
  modal(`<span class="eyebrow">YOUR UPDATES</span><h2 id="modalTitle">새로운 소식</h2><p class="muted">선정·공지·담당자 메시지 알림${n&&n.unreadCount?` · 안 읽음 ${n.unreadCount}건`:''}</p>${n&&(n.items||[]).length?`<div style="text-align:right"><button class="text-link" onclick="notifReadAll()">모두 읽음 처리 →</button></div>`:''}${!n?'<div class="loading-lines" role="status"><div></div><div></div><div></div></div>':(n.items||[]).length?(n.items||[]).map((i,idx)=>{const t=i.target||{};return `<button class="event-row" onclick="notifGo(${idx})">${avatar((i.title||'알')[0],i.read?'':'olive')}<div><b>${E(i.title)}</b><p>${E(i.body||'')}</p><time>${E((i.at||'').slice(0,16).replace('T',' '))}${i.read?'':' · 안 읽음'}</time></div>${(t.cellId||t.campaignId)?I('arrow',12):''}</button>`}).join(''):'<div class="empty"><h3>새 알림이 없어요.</h3><p>브랜드의 선정·공지 소식이 이곳에 도착해요.</p></div>'}`)
}
function guideDialog(){
  const b=currentBrand();
  modal(`<span class="eyebrow">COMMUNITY GUIDE</span><h2 id="modalTitle">함께 만드는 좋은 공간.</h2><p class="muted">${E(b?b.name:'theprlist')} · 브랜드 커뮤니티</p><div class="setting-row"><div><h3>이야기를 나누고 연결해요.</h3><p>제품 이야기와 촬영 팁, 일상의 작은 영감을 함께 나눠주세요.</p></div></div><div class="setting-row"><div><h3>개인적인 문의는 담당자 DM으로.</h3><p>배송지·연락처·수수료는 공개 채널에 남기지 마세요.</p></div></div><div class="setting-row"><div><h3>언어가 달라도 편안하게.</h3><p>대화는 내 언어로 자동 번역돼요. 원문을 함께 확인하고 서로를 존중해 주세요.</p></div></div><div class="modal-footer">${btn('확인','closeModal()','primary')}</div>`)
}
function inviteDialog(){modal(`<span class="eyebrow">JOIN A BRAND</span><h2 id="modalTitle">새로운 연결을 시작해요.</h2><p class="muted">브랜드가 보낸 초대 링크를 입력해 참여 정보를 확인하세요.</p><form onsubmit="event.preventDefault();previewInvite(this)"><div class="field"><label for="inviteUrl">브랜드 초대 링크</label><input id="inviteUrl" name="url" type="url" required placeholder="https://app.theprlist.net/?brand=…"></div><div class="notice-box">초대 링크의 브랜드 정보를 확인한 뒤, 이 계정으로 합류를 진행합니다.</div><button class="button primary wide">초대 정보 확인</button></form>`)}
function previewInvite(form){
  let u;try{u=new URL(form.url.value)}catch(e){return}
  if(!['app.theprlist.net','theprlist.net','localhost','127.0.0.1'].includes(u.hostname)){toast('theprlist 브랜드 초대 링크를 입력해 주세요.');return}
  const b=(u.searchParams.get('brand')||'').toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]{2,39}$/.test(b)){toast('링크에 브랜드 정보가 없어요 — 받은 주소를 다시 확인해 주세요.');return}
  closeModal();
  LIVE.joinTarget=b;LIVE.joinBrandInfo=null;
  liveReq('GET','/brands/'+b+'/identity').then(x=>{LIVE.joinBrandInfo=x;render()}).catch(()=>{LIVE.joinBrandInfo={missing:true};render()});
  navigate('invite',b);
}
function searchDialog(){modal(`<span class="eyebrow">FIND YOUR NEXT</span><h2 id="modalTitle">무엇을 찾으세요?</h2><div class="field" style="margin-top:22px"><input id="globalQuery" aria-label="검색어" placeholder="브랜드 또는 캠페인 검색" oninput="searchResults(this.value)"></div><div id="searchResults"></div>`);searchResults('')}
function searchResults(q){
  const ql=q.toLowerCase();
  const cs=campaignsLive().filter(c=>((c.name||'')+(c.product||'')+(c.brandName||'')+(c.brandId||'')).toLowerCase().includes(ql));
  const bs=brandsLive().filter(b=>((b.name||'')+(b.brandId||'')).toLowerCase().includes(ql));
  $('#searchResults').innerHTML=(cs.length||bs.length)?bs.map(b=>`<button class="event-row" onclick="closeModal();selectBrand('${E(b.brandId)}');navigate('community')"><span class="brand-letter ${b.alt?'mellow':''}">${E(b.initial)}</span><div><b>${E(b.name)}</b><p>브랜드 커뮤니티 열기</p></div></button>`).join('')+cs.map(c=>`<button class="event-row" onclick="closeModal();navigate('detail','${E(c.campaignId)}')"><span class="brand-letter">${E((c.brandName||c.brandId||'?').slice(0,1).toUpperCase())}</span><div><b>${E(c.name)}</b><p>${E(c.brandName||c.brandId)} · ${E(c.product||'캠페인')}</p></div></button>`).join(''):'<div class="empty"><h3>검색 결과가 없어요.</h3><p>브랜드명이나 다른 단어로 다시 찾아보세요.</p></div>'
}
window.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();if(window.__ME)searchDialog()}});
/* render는 slack-structure.js + journey.js가 정의·확장한다 */
function render(){}
