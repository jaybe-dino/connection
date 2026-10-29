/* creator-v8.js — v8.1 승인 시안(docs/ui-reference/v8.1)의 크리에이터 워크스페이스를
   실서비스 데이터로 렌더한다.

   - 마크업·클래스는 시안 DOM과 같게 만들고, 스타일은 v8-kit.css(시안 CSS 생성본)를 쓴다.
   - 데이터와 동작은 기존 live-core.js(LIVE 상태, API, 폴링, 게시·신청·합의·배송·제출)를 그대로 쓴다.
     예시 데이터·로컬 저장 체험은 없다. 서버에 없는 값은 '브랜드 안내 대기' 같은 실제 상태로 보인다.
   - 공개 진입(초대·로그인·온보딩·참여)과 상태 화면은 시안 범위 밖이므로 기존 화면을 그대로 쓴다.
   - 브랜드 경계는 v8-scope.js가 접근자(campaignsLive/offersLive/notifScoped)에서 보장한다. */
(function () {
  'use strict';
  // /products 는 커뮤니티 밖 독립 페이지(/products/)로 보낸다
  if (location.pathname === '/products') { location.replace('/products/' + location.search); return; }
  var h = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var a = function (s) { return h(s).replace(/`/g, '&#96;'); };

  /* ---------- 아이콘 (시안 design-v5.js와 같은 경로) ---------- */
  var P = {
    check: 'M4 12l5 5L20 6', compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', megaphone: 'M3 10v4h4l8 4V6l-8 4zM18 9a4 4 0 0 1 0 6',
    hash: 'M5 9h15M4 15h15M10 3L8 21M16 3l-2 18', trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z', briefcase: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01',
    chat: 'M4 5h16v11H9l-5 4z', chevron: 'M6 9l6 6 6-6', plus: 'M12 5v14M5 12h14', dot: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'
  };
  function icon(k) { return '<svg class="v5-ic " width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + (P[k] || P.dot) + '"/></svg>'; }

  /* ---------- 상태 ---------- */
  var V = window.__V8 = { screen: 'c-tasks', id: '', nav: false, rail: false, more: false, welcome: false, info: false, tab: 'msg', last: '', f: {}, err: {}, dmCamp: '', busy: {} };
  var SCREENS = ['c-tasks', 'c-campaigns', 'c-rewards', 'c-profile', 'c-announcements', 'c-community', 'c-ranking', 'c-missions', 'c-recruit', 'c-work', 'c-messages', 'c-helpdesk'];
  var CH_LABEL = { chat: '자유대화', products: '제품후기', qna: '질문', tips: '콘텐츠팁', notice: '공지사항' };
  var CH_DESC = { chat: '멤버 누구나 이야기해요', products: '사용 후기를 나눠요', qna: '협업·배송 질문', tips: '촬영·편집 팁을 나눠요', notice: '브랜드의 새 소식' };
  /* 채널: 브랜드가 콘솔에서 관리하는 실제 목록(GET /community/cells/{cell}/channels). 불러오는 동안만 기본 이름을 쓴다 */
  var CHC = {}, CHT = {};
  function loadChannels(cell, force) {
    if (!cell || CHC[cell] === 'loading' || (!force && CHC[cell]) || (force && Date.now() - (CHT[cell] || 0) < 15000 && Array.isArray(CHC[cell]))) return;
    var prev = CHC[cell]; CHC[cell] = Array.isArray(prev) ? prev : 'loading'; CHT[cell] = Date.now();
    var token = window.jwtGet ? jwtGet() : '';
    liveReq('GET', '/community/cells/' + encodeURIComponent(cell) + '/channels').then(function (l) { if (!window.jwtGet || token === jwtGet()) CHC[cell] = Array.isArray(l) ? l : []; })
      .catch(function (e) { if (typeof isStale === 'function' && isStale(e)) return; CHC[cell] = Array.isArray(prev) ? prev : 'error'; })
      .finally(function () { render(); });
  }
  function chList() {
    var b = currentBrand(), l = b && b.cellId ? CHC[b.cellId] : null;
    if (b && b.cellId && !l) loadChannels(b.cellId);
    if (Array.isArray(l)) return l;
    return ['notice', 'chat', 'products', 'qna', 'tips'].map(function (k) { return { key: k, name: CH_LABEL[k], description: CH_DESC[k], visibility: k === 'notice' ? 'readonly' : 'public', base: true, pending: true }; });
  }
  function chInfo(k) { return chList().find(function (c) { return c.key === k; }) || null; }
  function chLabel(k) { var c = chInfo(k); return c ? c.name : (CH_LABEL[k] || k); }
  function chReady() { var b = currentBrand(); return !!(b && b.cellId && Array.isArray(CHC[b.cellId])); }
  var CTRY = { KR: '한국', TH: '태국', US: '미국', VN: '베트남', JP: '일본' };
  var ctry = function (cs) { return (cs || []).map(function (c) { return CTRY[c] || c; }).join(', ') || '국가 제한 없음'; };

  function today() { try { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function dLabel(d) { if (!d) return ''; var n = Math.round((Date.parse(String(d).slice(0, 10)) - Date.parse(today())) / 864e5); return n < 0 ? '마감' : n === 0 ? 'D-day' : 'D-' + n; }
  function brandShort() { var b = currentBrand(); return b ? b.name : ''; }
  function bid() { var b = currentBrand(); return b ? b.brandId : ''; }
  function crumb(name) { return h(brandShort()) + ' › ' + h(name); }
  function chip(t, tone) { return '<span class="chip ' + (tone || '') + '">' + h(t) + '</span>'; }
  function btn(label, onclick, cls, extra) { return '<button type="button" class="btn ' + (cls || '') + '" onclick="' + a(onclick) + '"' + (extra || '') + '>' + label + '</button>'; }
  /* 이미지가 없거나 깨지면 같은 제품/브랜드의 이니셜만 보이는 중립 그림 — 다른 제품 사진처럼 보이는 대체는 쓰지 않는다 */
  function mono(label) {
    var l = String(label || '?').trim().slice(0, 1).toUpperCase() || '?';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#f3eff6"/><text x="32" y="42" font-size="26" text-anchor="middle" font-family="sans-serif" fill="#5b4466">' + l.replace(/[<&>"]/g, '') + '</text></svg>');
  }
  /* 이미지 주소: 공개 https 또는 API 의 서명된 브랜드 업로드 이미지(/public/product-images/…) */
  function imgSrc(u) {
    u = String(u || '');
    if (/^https:\/\//.test(u)) return u;
    if (/^\/public\/product-images\/[0-9a-f-]{36}(\?e=\d+&s=[0-9a-f]{32})?$/.test(u)) return (window.__API_URL || (typeof API !== 'undefined' ? API : '')) + u;
    return '';
  }
  function pimg(c, size) {
    var label = (c && (c.product || c.name)) || '제품', fb = mono(c && (c.product || c.brandName || c.name));
    var src = imgSrc(c && c.imageUrl) || fb;
    return '<img class="v6-pimg" width="' + size + '" height="' + size + '" src="' + a(src) + '" data-fb="' + a(fb) + '" alt="' + a(label + ' 이미지') + '" loading="lazy" referrerpolicy="no-referrer">';
  }
  document.addEventListener('error', function (e) {
    var t = e.target; if (!t || t.tagName !== 'IMG' || !t.dataset) return;
    // 서명 URL 이 만료됐을 수 있으면 협업 데이터를 한 번 다시 받아 새 서명 URL 로 다시 그린다(1분에 한 번까지)
    if (t.dataset.fb && /\/public\/product-images\/.+\?e=/.test(t.src) && Date.now() - (V.imgRetryAt || 0) > 60000 && typeof collabRefresh === 'function') {
      V.imgRetryAt = Date.now(); Promise.resolve(collabRefresh()).then(function () { render(); });
    }
    if (t.dataset.fb && t.src !== t.dataset.fb) { t.src = t.dataset.fb; return; }
    if (t.dataset.fbtext != null && t.parentNode) t.parentNode.replaceChild(document.createTextNode(t.dataset.fbtext), t);
  }, true);
  function money(n, cur) { if (n == null) return ''; cur = cur || 'KRW'; return cur === 'KRW' ? Number(n).toLocaleString('ko-KR') + '원' : Number(n).toLocaleString('en-US') + ' ' + cur; }
  var PLATFORM = { tiktok: 'TikTok', instagram: 'Instagram' };
  function rewardKind(c) {
    if (!c) return '브랜드 안내 대기';
    if (c.rewardType === 'affiliate') return c.affiliatePct != null ? '판매 수수료 ' + c.affiliatePct + '%' : '판매 수수료 (브랜드 안내 대기)';
    if (c.rewardType === 'paid') return c.rewardAmount != null ? '고정비 ' + money(c.rewardAmount, c.rewardCurrency) : '고정 보상 (금액 브랜드 안내 대기)';
    if (c.rewardType === 'gifted') return '제품 제공';
    return '브랜드 안내 대기';
  }
  function contentText(c) { var p = c && c.platform && PLATFORM[c.platform] ? PLATFORM[c.platform] + ' · ' : ''; return c && c.conditions && c.conditions.length ? p + c.conditions.join(' · ') : (p ? p + '세부 조건 브랜드 안내 대기' : '브랜드 안내 대기'); }

  /* ---------- 협업 조건의 기준 ----------
     합의 후: 서버가 합의 시점에 저장한 agreedTerms 가 기준(이후 캠페인 수정과 무관).
     선정 후 합의 전: 서버가 확인값(termsFingerprint)과 함께 내려준 offerTerms 가 기준.
     그 외(신청 전·신청함): 현재 캠페인 값. */
  function effTerms(c, o) {
    var t = o && o.state !== 'selected' && o.agreedTerms ? o.agreedTerms : o && o.state === 'selected' && o.offerTerms ? o.offerTerms : null;
    if (!t) return c;
    var e = {}; for (var k in c) e[k] = c[k];
    e.rewardType = t.rewardType; e.rewardAmount = t.rewardAmount; e.rewardCurrency = t.rewardCurrency;
    e.platform = t.platform; e.conditions = t.conditions || []; e.affiliatePct = t.commissionPct;
    // 제품도 합의 대상 — 합의 후 캠페인의 제품이 바뀌어도 합의한 제품명·이미지로 보인다(이전 스냅샷엔 없으면 현재 값)
    if ('product' in t) { e.product = t.product; e.productId = t.productId; }
    // 샘플 필요 여부도 합의 대상 — 스냅샷에 없을 때(이전 기록)만 현재 캠페인 값
    if ('sampleRequired' in t) e.sampleRequired = t.sampleRequired !== false;
    // 합의한 제품의 이미지: 운영 소개 이미지(https) 또는 합의 당시 브랜드 대표 이미지(서버가 새 서명 URL 로 제공)
    if (o.state !== 'selected' && (t.productImage || o.agreedImageUrl)) e.imageUrl = t.productImage || o.agreedImageUrl;
    e._terms = o.state === 'selected' ? 'offer' : 'agreed';
    return e;
  }
  window.__v8effTerms = effTerms;

  /* ---------- 참여 상태 (서버 상태 → 시안 단계) ---------- */
  var PST = { applied: '신청', selected: '선정', terms_agreed: '조건 합의', sample_shipped: '샘플 발송', content_submitted: '제출 완료', revision_requested: '수정 요청', completed: '완료', declined: '거절함', rejected: '미선정' };
  var PST_TONE = { applied: 'info', selected: 'ok', terms_agreed: 'ok', sample_shipped: 'warn', content_submitted: 'warn', revision_requested: 'warn', completed: 'ok', declined: 'err', rejected: 'err' };
  var STEPS = ['신청', '선정', '조건·주소', '샘플', '영상', '검수'];
  var STEPS_NS = ['신청', '선정', '조건 합의', '영상', '검수'];
  function stepIdx(s) { return ({ applied: 0, selected: 1, terms_agreed: 2, sample_shipped: 3, revision_requested: 4, content_submitted: 5, completed: 6 })[s]; }
  /* 샘플 없는 캠페인(보유 제품·UGC): 합의 후 주소·발송 없이 바로 영상 제출 */
  function noSample(c) { return !!c && c.sampleRequired === false; }
  function stepIdxNS(s) { return ({ applied: 0, selected: 1, terms_agreed: 3, revision_requested: 3, content_submitted: 4, completed: 5 })[s]; }
  /* 내 참여 목록: 선정 이후(offers) + 신청만 한 캠페인 */
  function parts() {
    var offers = offersLive().map(function (o) { return { id: o.campaignId, status: o.state, o: o, c: effTerms(campaignById(o.campaignId) || { campaignId: o.campaignId, name: o.campaignName, product: o.product, imageUrl: o.imageUrl, brandId: o.brandId, rewardType: o.rewardType, rewardAmount: o.rewardAmount, rewardCurrency: o.rewardCurrency, platform: o.platform, conditions: o.conditions || [], affiliatePct: o.commissionPct }, o) }; });
    var applied = campaignsLive().filter(function (c) { return (c.myStatus === 'applied' || c.myStatus === 'rejected') && !c.termsState && !offers.some(function (p) { return p.id === c.campaignId; }); })
      .map(function (c) { return { id: c.campaignId, status: c.myStatus === 'rejected' ? 'rejected' : 'applied', o: null, c: c }; });
    return offers.concat(applied);
  }
  function needsMe(p) { return ['selected', 'terms_agreed', 'revision_requested', 'sample_shipped'].indexOf(p.status) >= 0 && !(p.status === 'terms_agreed' && !noSample(p.c) && p.o && p.o.shipping); }
  function nextAction(p) {
    var go = "V8go('c-work','" + a(p.id) + "')";
    switch (p.status) {
      case 'applied': return [p.c && p.c.open === false ? '모집이 마감됐어요 · 브랜드 결과 안내를 기다리는 중' : '브랜드 검토를 기다리는 중', btn('신청 내용 보기', go)];
      case 'rejected': return ['이번에는 선정되지 않았어요' + (p.c && p.c.rejectedAt ? ' · ' + h(String(p.c.rejectedAt).slice(0, 10)) : '') + (p.c && p.c.rejectReason ? ' · 사유: ' + h(p.c.rejectReason) : ''), btn('다른 캠페인 보기', "V8go('c-campaigns')")];
      case 'selected': return ['제안 조건을 확인하고 합의해요', btn('조건 확인', go, 'pri')];
      case 'terms_agreed': return noSample(p.c) ? ['샘플 없이 진행해요 · 영상을 제출해요', btn('영상 제출', go, 'pri')] : p.o && p.o.shipping ? ['샘플 발송을 기다리는 중', btn('상세 보기', go)] : ['샘플 받을 주소를 입력해요', btn('샘플 주소 입력', go, 'pri')];
      case 'sample_shipped': return ['샘플이 오고 있어요' + (p.o && p.o.sampleTracking ? ' · 송장 ' + h(p.o.sampleTracking) : '') + ' · 받은 뒤 영상을 제출해요', btn('영상 제출', go, 'pri')];
      case 'revision_requested': return ['브랜드 수정 요청을 반영해 다시 제출해요', btn('수정본 제출', go, 'pri')];
      case 'content_submitted': return ['브랜드 확인을 기다리는 중', btn('상세 보기', go)];
      case 'completed': return ['완료됐어요', btn('보상 보기', "V8go('c-rewards')")];
      case 'declined': return ['거절한 제안이에요', btn('다른 캠페인 보기', "V8go('c-campaigns')")];
    }
    return ['상태 확인 필요', btn('상세 보기', go)];
  }
  function scopeBar(label) { return '<div class="v8-scope" role="group" aria-label="보기 범위"><span class="v8-scope-t"><b>' + h(brandShort()) + '</b> 커뮤니티의 ' + label + '만 보여요</span></div>'; }
  function loading() { return '<div class="v6-empty" role="status">불러오는 중…</div>'; }
  function loadFail(what) { return '<div class="v6-empty" role="alert"><b>' + what + '을(를) 불러오지 못했어요.</b><p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p>' + btn('다시 불러오기', 'collabRefresh()') + '</div>'; }
  function head(title, sub, action) { return '<div class="v6-head"><div class="v6-head-t"><h1>' + title + '</h1>' + (sub ? '<p class="v6-sub">' + sub + '</p>' : '') + '</div>' + (action || '') + '</div>'; }

  /* ---------- 화면: 내 할 일 ---------- */
  function scTasks() {
    if (LIVE.loadErr.offers || LIVE.loadErr.campaigns) return '<div class="v6 v8-creator">' + head('내 할 일') + loadFail('할 일') + '</div>';
    if (!LIVE.offers || !LIVE.campaigns) return '<div class="v6 v8-creator">' + head('내 할 일') + loading() + '</div>';
    var list = parts(), todo = list.filter(needsMe), waiting = list.filter(function (p) { return ['applied', 'content_submitted'].indexOf(p.status) >= 0; });
    var top = todo[0] || list.filter(function (p) { return ['completed', 'declined', 'rejected'].indexOf(p.status) < 0; })[0];
    var rest = list.filter(function (p) { return p !== top && ['declined', 'rejected'].indexOf(p.status) < 0; });
    var name = h((LIVE.profile && LIVE.profile.tiktokHandle) || myName());
    var feature = '';
    if (top) {
      var na = nextAction(top);
      feature = '<section class="v8-feature" aria-labelledby="v8-top-h"><div class="v8-feature-img">' + pimg(top.c, 96) + '</div><div class="v8-feature-body"><p class="v8-eyebrow">' + (needsMe(top) ? '지금 가장 먼저 할 일' : '진행 중인 일') + '</p><h2 id="v8-top-h">' + crumb(top.c.name) + '</h2><p class="v8-feature-t">' + na[0] + '</p><p class="v6-meta">' + chip(PST[top.status], PST_TONE[top.status]) + (top.c.deadline ? ' · 모집 마감 ' + h(String(top.c.deadline).slice(0, 10)) : '') + ' · ' + h(rewardKind(top.c)) + '</p><div class="v6-actions">' + na[1] + '</div></div></section>';
    }
    var n = notifScoped(), ev = n && n.items.filter(function (i) { return !i.read; })[0];
    return '<div class="v6 v8-creator">' + head('내 할 일', name + '님, ' + (todo.length ? '지금 직접 처리할 일이 <b>' + todo.length + '개</b> 있어요' : '지금 직접 처리할 일은 없어요') + (waiting.length ? ' · 브랜드 답을 기다리는 일 ' + waiting.length + '개' : '') + '. 조건 확인 · 주소 · 영상 제출은 각 캠페인 상세에서 해요.') +
      scopeBar('할 일') + feature +
      (ev ? '<div class="v6-notice v8-notice"><span>최근 알림 · ' + h(ev.title) + (ev.body ? ': ' + h(ev.body) : '') + '</span>' + btn('열기', 'notifGo(' + ev._idx + ')') + '</div>' : '') +
      (rest.length ? '<h2 class="v8-h2">다른 할 일 <span class="v6-count-inline">' + rest.length + '개</span></h2><ul class="v6-list">' + rest.map(function (p) { var na = nextAction(p); return '<li class="v6-row">' + pimg(p.c, 48) + '<div class="v6-grow"><b>' + crumb(p.c.name) + '</b><span class="v6-meta">' + na[0] + '</span></div>' + chip(PST[p.status], PST_TONE[p.status]) + na[1] + '</li>'; }).join('') + '</ul>' : '') +
      (!list.length ? '<div class="v6-empty">이 브랜드에서 할 일이 없어요. ' + btn('이 브랜드 캠페인 보기', "V8go('c-campaigns')", 'ghost') + '</div>' : '') + '</div>';
  }

  /* ---------- 화면: 캠페인 둘러보기 (+상세·신청) ---------- */
  function myState(c) {
    var o = offerByCampaign(c.campaignId);
    if (o) return [o.state === 'completed' ? '완료' : o.state === 'declined' ? '거절함' : o.state === 'selected' ? '선정됨' : '진행 중', o.state === 'declined' ? 'err' : o.state === 'selected' || o.state === 'completed' ? 'ok' : 'warn'];
    if (c.myStatus === 'applied') return ['신청함', 'info'];
    if (c.myStatus === 'rejected') return ['미선정', 'err'];
    return ['신청 전', ''];
  }
  function condSummary(c, o) {
    return '<div class="v6-cond">' + pimg(c, 64) + '<dl class="v6-kv"><dt>제품</dt><dd>' + h(c.product || '브랜드 안내 대기') + '</dd><dt>보상</dt><dd>' + h(rewardKind(c)) + (c.rewardType === 'affiliate' || (!c.rewardType && o) ? (o && o.agreedCommissionPct != null ? ' · 합의 ' + h(o.agreedCommissionPct) + '%' : o && o.commissionPct != null ? ' · 제안 ' + h(o.commissionPct) + '%' : '') : '') + (c._terms === 'agreed' ? ' · 합의한 조건(합의 후 캠페인이 바뀌어도 이 조건 유지)' : '') + '</dd><dt>콘텐츠</dt><dd>' + h(contentText(c)) + '</dd>' + (c.usp ? '<dt>소개</dt><dd>' + h(c.usp) + '</dd>' : '') + '<dt>국가 · 인원</dt><dd>' + h(ctry(c.countries)) + (c.capacity ? ' · ' + h(c.capacity) + '명' : '') + '</dd><dt>모집 마감</dt><dd>' + h(c.deadline ? String(c.deadline).slice(0, 10) : '별도 안내') + '</dd></dl></div>';
  }
  function scCampaigns() {
    var action = '<a class="btn ghost" href="/products/">전체 제품 모아보기 (별도 페이지)</a>';
    var top = head('캠페인 둘러보기', '신청 전 / 신청함 / 선정됨 / 진행 중 / 완료 상태를 함께 보여 줘요. 참여 중인 건은 ‘내 캠페인’에서 관리해요.', action);
    if (LIVE.loadErr.campaigns) return '<div class="v6">' + top + loadFail('캠페인') + '</div>';
    if (!LIVE.campaigns) return '<div class="v6">' + top + loading() + '</div>';
    // 둘러보기는 모집 중만. 마감·미선정이 된 내 신청 건(open=false)은 목록에서 빠지지만 상세·내 캠페인 이력으로는 남는다
    var all = campaignsLive(), list = all.filter(function (c) { return c.open !== false; }), sel = V.id && all.find(function (c) { return c.campaignId === V.id; });
    if (sel) sel = effTerms(sel, offerByCampaign(sel.campaignId));
    var cards = list.length ? '<ul class="v8-cgrid">' + list.map(function (c) {
      var st = myState(c), o = offerByCampaign(c.campaignId);
      var cta = o || c.myStatus !== 'none' ? btn('내 캠페인에서 보기', "V8go('c-work','" + a(c.campaignId) + "')") : btn('조건 보기', "V8go('c-campaigns','" + a(c.campaignId) + "')");
      return '<li class="v8-ccard' + (sel && sel.campaignId === c.campaignId ? ' on' : '') + '"><div class="v8-ccard-top">' + pimg(c, 88) + '<div class="v6-grow"><span class="v6-meta">' + h(c.brandName || brandShort()) + '</span><h3>' + h(c.name) + '</h3><span class="v6-meta">' + h(c.product || '') + '</span></div></div>' +
        '<dl class="v8-facts"><div><dt>보상</dt><dd>' + h(rewardKind(c)) + '</dd></div><div><dt>신청 국가</dt><dd>' + h(ctry(c.countries)) + '</dd></div><div><dt>콘텐츠</dt><dd>' + h(contentText(c)) + '</dd></div><div><dt>모집 마감</dt><dd>' + h(c.deadline ? String(c.deadline).slice(0, 10) : '별도 안내') + ' <span class="v6-meta">' + h(dLabel(c.deadline)) + '</span></dd></div></dl>' +
        '<div class="v8-ccard-foot">' + chip('내 상태: ' + st[0], st[1]) + cta + '</div></li>';
    }).join('') + '</ul>' : '<div class="v6-empty">이 브랜드에서 모집 중인 캠페인이 없어요.</div>';
    var detail = '';
    if (sel) {
      var st = myState(sel), closed = campExpired(sel) || sel.open === false, busy = LIVE.applyBusy && LIVE.applyBusy[sel.campaignId];
      var body;
      if (closed) body = '<p class="alert warn">모집이 마감된 캠페인이에요. 신청할 수 없어요.</p>';
      else if (st[0] !== '신청 전') body = '<p>' + chip(st[0], st[1]) + ' 이미 참여 기록이 있어요. ' + btn('내 캠페인에서 보기', "V8go('c-work','" + a(sel.campaignId) + "')") + '</p>';
      else if (!sel.eligible) body = '<p class="alert warn">' + h(sel.ineligibleReason || '이 캠페인의 신청 국가와 내 활동 국가가 맞지 않아요.') + '</p>' + btn('내 정보에서 국가 확인', "V8go('c-profile')");
      else if (!entryReady()) body = '<p class="alert warn">신청 전에 프로필과 TikTok 계정 확인을 마쳐 주세요.</p>' + btn('내 정보로 가기', "V8go('c-profile')", 'pri');
      else body = '<h3>신청하기</h3><div class="v6-form"><div class="v6-field"><label for="ap-c">내 활동 국가</label><input id="ap-c" type="text" value="' + a(CTRY[(LIVE.profile || {}).country] || (LIVE.profile || {}).country || '') + '" readonly><span class="hint">내 정보의 국가로 신청해요.</span></div>' +
        '<div class="v6-field"><label for="ap-m">브랜드에 남길 말<span class="opt">선택</span></label><input id="ap-m" type="text" data-v8f="apMsg" value="' + a(V.f.apMsg || '') + '" maxlength="500"><span class="hint">담당자 DM으로 함께 전달돼요.</span></div>' +
        '<div class="v6-field v6-wide"><label class="v6-inline"><input type="checkbox" id="ap-a" data-v8f="apAgree"' + (V.f.apAgree ? ' checked' : '') + '> 보상·콘텐츠·광고 사용 범위·기한을 확인했어요<span class="req">필수</span></label>' + errOf('ap-a') + '</div></div>' +
        '<div class="v6-actions">' + btn(busy ? '신청 중…' : '신청하기', "V8apply('" + a(sel.campaignId) + "')", 'pri', busy ? ' disabled' : '') + '</div>';
      detail = '<section class="v6-sec v6-panel" id="v6-cdetail"><h2>' + crumb(sel.name) + '</h2>' + condSummary(sel, offerByCampaign(sel.campaignId)) + body + '</section>';
    } else if (V.id && LIVE.campaigns) detail = '<div class="v6-empty">이 브랜드의 모집 중인 캠페인에서 찾지 못했어요. 마감되었을 수 있어요.</div>';
    return '<div class="v6">' + top + scopeBar('캠페인') + '<p class="v6-kicker">조건 요약 </p>' + cards + detail + '</div>';
  }
  function errOf(k) { return V.err[k] ? '<p class="ferr" id="err-' + k + '" role="alert">' + h(V.err[k]) + '</p>' : ''; }
  window.V8apply = function (cid) {
    V.err = {};
    if (!V.f.apAgree) { V.err['ap-a'] = '조건 확인에 동의해 주세요.'; render(); var el = document.getElementById('ap-a'); if (el) el.focus(); return; }
    var c = campaignById(cid), msg = (V.f.apMsg || '').trim();
    Promise.resolve(applyCampaign(cid)).then(function (ok) {
      if (ok) window.__v8xpRefresh();
      if (!ok) return;
      V.f.apMsg = ''; V.f.apAgree = false;
      if (msg && c) relayToManagerDm(c.brandId, '[신청 메모] ' + c.name + ' — ' + msg).then(function (sent) { if (sent !== true) toast(sent === 'lost' ? '신청은 접수됐어요. 메모 전달은 실패했어요 — 담당자 DM에서 직접 전해 주세요.' : '신청은 접수됐어요. 메모는 담당자 DM 초안으로 보관했어요.'); });
      V8go('c-work', cid);
    });
  };

  /* ---------- 화면: 내 캠페인 (진행 단계·지금 할 일·조건·주소·영상) ---------- */
  function scWork() {
    var top = head('내 캠페인', '신청·선정·진행·완료한 캠페인. 조건·주소·영상·보상은 각 캠페인 안에서 봐요.');
    if (LIVE.loadErr.offers) return '<div class="v6 v8-creator">' + top + loadFail('협업 목록') + '</div>';
    if (!LIVE.offers || !LIVE.campaigns) return '<div class="v6 v8-creator">' + top + loading() + '</div>';
    var list = parts(), p = V.id ? list.find(function (x) { return x.id === V.id; }) : list[0];
    if (V.id && !p) return '<div class="v6 v8-creator">' + top + scopeBar('캠페인') + '<div class="v6-empty" role="alert"><b>이 캠페인의 참여 기록을 찾지 못했어요.</b><p>이 브랜드의 내 캠페인이 아니거나 아직 반영되지 않았어요. 목록에서 다시 골라 주세요.</p>' + btn('내 캠페인 목록', "V8go('c-work')") + '</div>' + (list.length ? '<ul class="v6-list">' + list.map(function (x) { return '<li class="v6-row">' + pimg(x.c, 36) + '<div class="v6-grow"><b>' + crumb(x.c.name) + '</b></div>' + chip(PST[x.status], PST_TONE[x.status]) + btn('보기', "V8go('c-work','" + a(x.id) + "')") + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    if (!p) return '<div class="v6 v8-creator">' + top + scopeBar('캠페인') + '<div class="v6-empty">이 브랜드에서 참여한 캠페인이 없어요. ' + btn('이 브랜드 캠페인 보기', "V8go('c-campaigns')", 'ghost') + '</div></div>';
    var c = p.c, o = p.o, ns = noSample(c), si = ns ? stepIdxNS(p.status) : stepIdx(p.status), rej = ['declined', 'rejected'].indexOf(p.status) >= 0, na = nextAction(p);
    var stepper = '<ol class="v8-stepper" aria-label="진행 단계">' + (ns ? STEPS_NS : STEPS).map(function (l, i) { var cls = rej ? '' : i < si ? 'is-done' : i === si ? 'is-now' : ''; return '<li class="' + cls + '"' + (i === si && !rej ? ' aria-current="step"' : '') + '><span class="v8-dot" aria-hidden="true">' + (i < si && !rej ? '✓' : i + 1) + '</span>' + l + '</li>'; }).join('') + '</ol>';
    var now = '<div class="v8-now"><p class="v8-eyebrow">' + (rej ? '결과' : '지금 할 일') + '</p><p class="v8-feature-t">' + na[0] + '</p>' + (o && o.contentUrl ? '<p class="v6-meta">제출물: ' + videoLink(o.contentUrl) + '</p>' : '') + (o && o.sampleTracking ? '<p class="v6-meta">송장: ' + h(o.sampleTracking) + '</p>' : '') + '<div class="v6-actions">' + btn('담당자에게 묻기', "V8dm('" + a(c.brandId || bid()) + "','" + a(c.campaignId) + "')") + '</div></div>';
    var act = o ? workAction(o, c) : '';
    return '<div class="v6 v8-creator">' + top + scopeBar('캠페인') + '<div class="v6-split v6-split-list v8-work' + (V.id ? ' v8-has-sel' : '') + '"><ul class="v6-list">' + list.map(function (x) {
      return '<li class="v6-row' + (x === p ? ' on' : '') + '">' + pimg(x.c, 36) + '<div class="v6-grow"><b>' + crumb(x.c.name) + '</b></div>' + chip(PST[x.status], PST_TONE[x.status]) + btn('보기', "V8go('c-work','" + a(x.id) + "')") + '</li>';
    }).join('') + '</ul><div class="v6-col v6-panel"><div class="v8-back">' + btn('← 캠페인 목록', "V8go('c-work')", 'ghost') + '</div><h2 id="v8-work-h" tabindex="-1">' + crumb(c.name) + ' ' + chip(PST[p.status], PST_TONE[p.status]) + '</h2>' + stepper + now + condSummary(c, o) + ' ' + act +
      '<div class="v6-actions">' + btn('브랜드 담당자에게 묻기', "V8dm('" + a(c.brandId || bid()) + "','" + a(c.campaignId) + "')") + btn('보상 보기', "V8go('c-rewards')", 'ghost') + '</div></div></div></div>';
  }
  /* 제출 영상 링크: 안전한 https 주소만 새 창 링크로 연다(그 외는 텍스트만) */
  function videoLink(url) {
    var u = String(url || '');
    if (!/^https:\/\/[^\s"'<>`]{4,1000}$/.test(u)) return '<span class="v6-wrap">' + h(u) + '</span>';
    return '<a class="btn ghost v8-video" href="' + a(u) + '" target="_blank" rel="noopener noreferrer">제출 영상 보기</a> <span class="v6-meta v6-wrap">' + h(u) + '</span>';
  }
  function field(id, label, value, opts) {
    opts = opts || {};
    return '<div class="v6-field' + (opts.wide ? ' v6-wide' : '') + '"><label for="' + id + '">' + label + (opts.req ? '<span class="req">필수</span>' : opts.opt ? '<span class="opt">선택</span>' : '') + '</label>' +
      (opts.area ? '<textarea id="' + id + '" data-v8f="' + id + '"' + (opts.max ? ' maxlength="' + opts.max + '"' : '') + '>' + h(value) + '</textarea>' : '<input id="' + id + '" type="' + (opts.type || 'text') + '" data-v8f="' + id + '" value="' + a(value) + '"' + (opts.ph ? ' placeholder="' + a(opts.ph) + '"' : '') + (opts.max ? ' maxlength="' + opts.max + '"' : '') + (opts.ro ? ' readonly' : '') + '>') +
      (opts.hint ? '<span class="hint">' + opts.hint + '</span>' : '') + errOf(id) + '</div>';
  }
  function fv(id, dflt) { return V.f[id] != null ? V.f[id] : (dflt || ''); }
  function workAction(o, c) {
    var id = a(o.campaignId), s = o.state;
    var plat = c.platform || o.platform || 'tiktok', platName = PLATFORM[plat] || 'TikTok';
    if (s === 'selected') {
      // 체크한 뒤 자동 새로고침 등으로 조건이 바뀌면(확인값이 달라지면) 체크를 풀고 재확인을 요구한다
      if (V.f.agreeOk && V.f.agreeFp !== (o.termsFingerprint || '')) { delete V.f.agreeOk; delete V.f.agreeFp; V.err._termsChanged = o.campaignId; }
      var rt = c.rewardType, rew, changed = V.err._termsChanged === o.campaignId;
      if (rt === 'paid') rew = '<dt>보상</dt><dd>고정비 ' + h(c.rewardAmount != null ? money(c.rewardAmount, c.rewardCurrency) : '금액 브랜드 안내 대기') + '</dd>';
      else if (rt === 'gifted') rew = '<dt>보상</dt><dd>제품 제공 (금액 보상 없음)</dd>';
      else rew = '<dt>제안 수수료</dt><dd>' + h(c.affiliatePct != null ? c.affiliatePct + '%' : '브랜드 안내 대기') + '</dd>';
      var hk = 'agreeHandle', hv = fv(hk, plat === 'tiktok' ? ((LIVE.profile && LIVE.profile.tiktokHandle) || '') : '');
      return '<section class="v6-sec"><h2>조건 확인</h2>' + (changed ? '<div class="alert warn" role="alert" id="termsChanged" tabindex="-1"><b>확인하신 뒤 브랜드가 조건을 바꿨어요.</b> 아래 새 조건을 다시 확인하고 합의해 주세요. 이전 조건으로는 합의되지 않았어요.</div>' : '') + '<p class="v6-meta">브랜드가 제안한 조건이에요. 합의하면 이 조건이 그대로 기록되고, ' + (noSample(c) ? '샘플 발송 없이 바로 영상을 제출해요' : '그다음 샘플 받을 주소를 입력해요') + '.</p><dl class="v6-kv">' + rew + (noSample(c) ? '<dt>샘플</dt><dd>없음 · 가지고 있는 제품으로 촬영</dd>' : '') + '<dt>콘텐츠</dt><dd>' + h(contentText(c)) + '</dd><dt>제품</dt><dd>' + h(c.product || '브랜드 안내 대기') + '</dd>' + (plat === 'tiktok' ? '<dt>광고 사용</dt><dd>합의 후 Spark 코드로 따로 제출</dd>' : '') + '</dl>' +
        '<div class="v6-form">' + field(hk, '본인 ' + platName + ' 계정', hv, { req: true, ph: '@myhandle' }) +
        '<div class="v6-field v6-wide"><label class="v6-inline"><input type="checkbox" id="agreeOk" data-v8f="agreeOk" data-fp="' + a(o.termsFingerprint || '') + '" onchange="V8agreeCheck(this)"' + (V.f.agreeOk ? ' checked' : '') + '> 보상·콘텐츠·제출 기준·일정을 확인했어요<span class="req">필수</span></label>' + errOf('agreeOk') + '</div></div>' +
        '<div class="v6-actions">' + btn(V.busy.agree ? '처리 중…' : '조건 합의', "V8agree('" + id + "',true)", 'pri', V.busy.agree ? ' disabled' : '') + btn('거절', "V8agree('" + id + "',false)", 'ghost danger', V.busy.agree ? ' disabled' : '') + '</div></section>';
    }
    var spark = plat !== 'tiktok' ? '<p class="v6-meta">이 캠페인은 ' + h(platName) + ' 콘텐츠라 Spark 코드가 필요 없어요.</p>' : '<div class="v6-field v6-wide"><label for="sparkCode">Spark Ads 코드<span class="opt">선택</span></label><input id="sparkCode" type="text" data-v8f="sparkCode" value="' + a(fv('sparkCode', o.sparkCode || '')) + '" placeholder="브랜드와 광고 사용에 합의한 경우"><span class="hint">브랜드에만 전달되고 커뮤니티에는 보이지 않아요.</span></div><div class="v6-actions">' + btn(o.sparkCode ? '코드 수정' : '코드 제출', "submitSpark('" + id + "')", '', LIVE.sparkBusy ? ' disabled' : '') + '</div>';
    if (s === 'terms_agreed' && !noSample(c)) {
      var sp = o.shipping || {};
      if (o.shipping && !V.f.editShip) return '<section class="v6-sec"><h2>샘플 발송 대기</h2><p>등록한 주소: ' + h([sp.recipient, sp.country, sp.address].filter(Boolean).join(' · ')) + '</p><p class="v6-meta">브랜드가 발송하면 송장과 배송 상태가 여기에 표시돼요. 이 정보는 이 캠페인의 브랜드 담당자에게만 전달돼요.</p><div class="v6-actions">' + btn('주소 수정', "V8set('editShip',true)") + '</div></section><section class="v6-sec"><h2>광고 사용 코드</h2><div class="v6-form">' + spark + '</div></section>';
      var cs = (c.countries && c.countries.length ? c.countries : [(LIVE.profile || {}).country || 'US']);
      var cur = fv('shipCountry', sp.country || cs[0]);
      return '<section class="v6-sec"><h2>샘플 받을 주소 </h2><p class="v6-meta">' + h(brandShort()) + ' 배송 담당에게만 샘플 발송 목적으로 전달돼요.</p><div class="v6-form">' +
        '<div class="v6-field"><label for="shipCountry">국가</label><select id="shipCountry" data-v8f="shipCountry">' + cs.map(function (k) { return '<option value="' + a(k) + '"' + (cur === k ? ' selected' : '') + '>' + h(CTRY[k] || k) + '</option>'; }).join('') + '</select></div>' +
        field('shipRecipient', '받는 분', fv('shipRecipient', sp.recipient || ''), { req: true, max: 80 }) +
        field('shipLine', '도로명 주소', fv('shipLine', sp.address || ''), { req: true, ph: cur === 'US' ? '예: 123 Main St' : '예: 도로명·건물', max: 200 }) +
        field('shipCity', cur === 'US' ? '도시·주' : '도시·도', fv('shipCity'), { req: !sp.address, ph: cur === 'US' ? '예: Brooklyn NY' : '', max: 60 }) +
        field('shipZip', cur === 'US' ? 'ZIP 코드' : '우편번호', fv('shipZip'), { req: !sp.address, ph: cur === 'US' ? '예: 11201' : '', max: 20 }) +
        field('shipPhone', '연락처', fv('shipPhone', sp.phone || ''), { req: true, max: 40, hint: '배송사 연락용이에요.' }) +
        '<div class="v6-field v6-wide"><label class="v6-inline"><input type="checkbox" id="shipConsent" data-v8f="shipConsent"' + (V.f.shipConsent || o.shipping ? ' checked' : '') + '> 샘플 배송에 필요한 정보 제공을 확인했어요<span class="req">필수</span></label></div>' +
        '</div><div class="v6-actions">' + btn(V.busy.ship ? '저장 중…' : '주소 저장', "V8ship('" + id + "')", 'pri', V.busy.ship ? ' disabled' : '') + '</div></section>';
    }
    if (s === 'sample_shipped' || s === 'revision_requested' || s === 'content_submitted' || s === 'terms_agreed') {
      var rev = s === 'revision_requested', done = s === 'content_submitted';
      return '<section class="v6-sec"><h2>' + (rev ? '수정본 제출' : done ? '제출한 영상' : '영상 제출') + '</h2>' +
        (rev ? '<div class="alert warn">브랜드 수정 요청: ' + h(o.revisionNote || '담당자 DM에서 확인해 주세요.') + (o.contentUrl ? '<br>이전 제출: ' + videoLink(o.contentUrl) : '') + '</div>' : '') +
        (s === 'sample_shipped' ? '<p>송장: ' + h(o.sampleTracking || '브랜드 등록 대기') + '</p>' : '') +
        (done ? '<p>제출함: ' + videoLink(o.contentUrl || '') + ' · 브랜드 확인 대기</p>' : '') +
        '<div class="v6-form">' + field('vdUrl', done ? '제출 링크 수정' : '영상 링크', fv('vdUrl', done ? o.contentUrl || '' : ''), { req: true, wide: true, type: 'url', ph: plat === 'instagram' ? 'https://www.instagram.com/reel/…' : 'https://www.tiktok.com/@…', hint: '요청: ' + h(contentText(c)) }) +
        field('vdMemo', '담당자에게 남길 메모', fv('vdMemo'), { opt: true, wide: true, area: true, max: 1000 }) + '</div>' +
        '<div class="v6-actions">' + btn(V.busy.content ? '제출 중…' : rev ? '수정본 제출' : done ? '링크 수정 저장' : '영상 제출', "V8content('" + id + "')", 'pri', V.busy.content ? ' disabled' : '') + '</div></section><section class="v6-sec"><h2>광고 사용 코드</h2><div class="v6-form">' + spark + '</div></section>';
    }
    if (s === 'completed') return '<section class="v6-sec"><h2>협업 완료</h2><p>' + (o.agreedTerms && o.agreedTerms.rewardType === 'paid' ? '합의한 고정비 ' + h(money(o.agreedTerms.rewardAmount, o.agreedTerms.rewardCurrency) || '—') : o.agreedTerms && o.agreedTerms.rewardType === 'gifted' ? '제품 제공 조건' : '확정 수수료 ' + h(o.agreedCommissionPct != null ? o.agreedCommissionPct + '%' : '—')) + ' 기준이에요.' + (o.contentUrl ? '<br>제출 영상: ' + videoLink(o.contentUrl) : '') + (o.affiliateLink ? '<br>어필리에이트 링크(브랜드 발급): <span class="v6-wrap">' + h(o.affiliateLink) + '</span>' : '') + '</p><p class="v6-meta">정산 금액·지급일은 아직 연동되지 않아 표시하지 않아요.</p></section>';
    return '';
  }
  window.V8set = function (k, v) { V.f[k] = v; render(); };
  /* 서버 응답이 성공일 때만 입력을 지운다. 4xx/5xx 면 입력·체크·주소가 그대로 남는다. */
  function call(key, method, path, body) {
    if (V.busy[key]) return Promise.reject(new Error('busy'));
    V.busy[key] = true; render();
    return liveReq(method, path, body).finally(function () { V.busy[key] = false; });
  }
  function fail(e, msg) { if (e && e.message === 'busy') return; if (typeof isStale === 'function' && isStale(e)) return; toast((e && e.message) || msg); render(); }
  /* 체크한 순간 화면에 그려진 조건의 확인값을 보관 — 합의는 이 값으로만 보낸다 */
  window.V8agreeCheck = function (el) { if (el.checked) { V.f.agreeOk = true; V.f.agreeFp = el.dataset.fp || ''; } else { delete V.f.agreeOk; delete V.f.agreeFp; } };
  window.V8agree = function (cid, accept) {
    V.err = {};
    var handle = String(V.f.agreeHandle != null ? V.f.agreeHandle : ((document.getElementById('agreeHandle') || {}).value || '')).trim();
    if (accept) {
      if (!handle) V.err.agreeHandle = '본인 계정을 적어 주세요.';
      if (!V.f.agreeOk) V.err.agreeOk = '조건을 확인했다고 표시해 주세요.';
      if (Object.keys(V.err).length) { render(); focusErr(); return; }
    }
    var seen = V.f.agreeFp || '';
    if (accept && (!seen || seen !== ((offerByCampaign(cid) || {}).termsFingerprint || ''))) { delete V.f.agreeOk; delete V.f.agreeFp; V.err = { _termsChanged: cid }; render(); var tc = document.getElementById('termsChanged'); if (tc) tc.focus(); return; }
    call('agree', 'POST', '/me/campaign-offers/' + encodeURIComponent(cid) + '/agree', { accept: !!accept, handle: handle, tiktok_handle: handle, terms_fingerprint: accept ? seen : '' })
      .then(function () { delete V.f.agreeOk; delete V.f.agreeFp; delete V.f.agreeHandle; toast(accept ? '조건에 합의했어요 — 이제 샘플 받을 주소를 입력해요.' : '이 캠페인 제안을 거절했어요.'); window.__v8xpRefresh(); return collabRefresh(); })
      .then(function () { render(); }, function (e) {
        if (e && e.status === 409 && e.detail && e.detail.code === 'terms_changed') {
          // 옛 조건으로는 합의되지 않았다 — 새 조건을 받아 다시 확인하게 한다(계정 입력은 유지, 확인 체크는 해제)
          delete V.f.agreeOk; delete V.f.agreeFp; V.err = { _termsChanged: cid };
          return Promise.resolve(collabRefresh()).then(function () { render(); var el = document.getElementById('termsChanged'); if (el) el.focus(); });
        }
        fail(e, '처리하지 못했어요. 입력은 그대로 남아 있어요.');
      });
  };
  window.V8ship = function (cid) {
    V.err = {};
    var o = offerByCampaign(cid) || {}, sp = o.shipping || {}, had = !!sp.address;
    var val = function (k, d) { return String(fv(k, d) || '').trim(); };
    var recipient = val('shipRecipient', sp.recipient), line = val('shipLine', sp.address), phone = val('shipPhone', sp.phone), city = val('shipCity'), zip = val('shipZip');
    var country = val('shipCountry', sp.country || ((document.getElementById('shipCountry') || {}).value || ''));
    if (!recipient) V.err.shipRecipient = '이 칸을 채워 주세요.';
    if (!line) V.err.shipLine = '이 칸을 채워 주세요.';
    if (!phone) V.err.shipPhone = '이 칸을 채워 주세요.';
    if (!had) { if (!city) V.err.shipCity = '이 칸을 채워 주세요.'; if (!zip) V.err.shipZip = '이 칸을 채워 주세요.'; }
    if (!V.f.shipConsent && !o.shipping) V.err.shipConsent = '정보 제공을 확인해 주세요.';
    if (Object.keys(V.err).length) { render(); focusErr(); if (V.err.shipConsent && Object.keys(V.err).length === 1) toast(V.err.shipConsent); return; }
    var extra = [city, zip].filter(Boolean).join(' ');
    call('ship', 'POST', '/me/campaign-offers/' + encodeURIComponent(cid) + '/shipping', { recipient: recipient, country: country.toUpperCase(), address: extra ? line + ', ' + extra : line, phone: phone })
      .then(function () { ['shipRecipient', 'shipLine', 'shipCity', 'shipZip', 'shipPhone', 'shipConsent', 'editShip', 'shipCountry'].forEach(function (k) { delete V.f[k]; }); toast('수령 정보를 저장했어요 — 이 캠페인의 브랜드 담당자에게만 전달돼요.'); return collabRefresh(); })
      .then(function () { render(); }, function (e) { fail(e, '주소를 저장하지 못했어요. 입력은 그대로 남아 있어요.'); });
  };
  window.V8content = function (cid) {
    V.err = {};
    var url = String(fv('vdUrl')).trim(), memo = String(fv('vdMemo') || '').trim(), o = offerByCampaign(cid) || {};
    if (!/^https:\/\//.test(url)) { V.err.vdUrl = 'https://로 시작하는 영상 링크를 적어 주세요.'; render(); focusErr(); return; }
    call('content', 'POST', '/me/campaign-offers/' + encodeURIComponent(cid) + '/content', { content_url: url })
      .then(function () {
        delete V.f.vdUrl; delete V.f.vdMemo;
        if (!memo) { toast('영상 제출 완료 — 브랜드 확인 후 완료 처리돼요.'); return; }
        return relayToManagerDm(o.brandId || bid(), '[콘텐츠 제출 메모] ' + (o.campaignName || cid) + ' — ' + memo).then(function (sent) {
          toast(sent === true ? '영상 제출 완료 — 메모도 담당자 DM으로 전달했어요.' : sent === 'lost' ? '영상은 제출됐어요. 메모 전달에 실패했어요 — 담당자 DM에서 직접 전해 주세요.' : '영상은 제출됐어요. 메모는 담당자 DM 초안으로 보관했어요.');
        });
      })
      .then(function () { window.__v8xpRefresh(); return collabRefresh(); })
      .then(function () { V8go('c-work', cid); }, function (e) { fail(e, '제출하지 못했어요. 입력은 그대로 남아 있어요.'); });
  };
  function focusErr() { var k = Object.keys(V.err)[0], el = k && document.getElementById(k); if (el) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', 'err-' + k); el.focus(); } }

  /* ---------- 화면: 받을 보상 / 내 정보 ---------- */
  function spaceTabs(cur) { return '<nav class="tabs v2-subtabs" aria-label="내 공간 하위 메뉴"><button type="button" onclick="V8go(\'c-rewards\')"' + (cur === 'c-rewards' ? ' aria-current="page" aria-selected="true"' : ' aria-selected="false"') + '>받을 보상</button><button type="button" onclick="V8go(\'c-profile\')"' + (cur === 'c-profile' ? ' aria-current="page" aria-selected="true"' : ' aria-selected="false"') + '>내 정보</button></nav>'; }
  function scRewards() {
    var top = spaceTabs('c-rewards') + '<div class="v6">' + head('받을 보상', '캠페인 조건별로 보상 방식이 달라요. ‘지급 대기’는 아직 받지 않은 상태예요.');
    if (!LIVE.offers || !LIVE.campaigns) return top + loading() + '</div>';
    var list = parts().filter(function (p) { return p.o && ['declined'].indexOf(p.status) < 0; });
    return top + scopeBar('보상') + '<ul class="v6-list">' + (list.map(function (p) {
      var c = p.c, o = p.o, aff = c.rewardType === 'affiliate' || (c.rewardType == null && o.commissionPct != null);
      var how = aff ? '판매 보상 · 플랫폼 정산 · 판매금액의 ' + (o.agreedCommissionPct != null ? o.agreedCommissionPct + '% (합의)' : o.commissionPct != null ? o.commissionPct + '% (제안)' : '— ') : c.rewardType === 'paid' ? '고정 보상 · 브랜드 지급' + ((o.agreedTerms && o.agreedTerms.rewardAmount != null) ? ' · ' + money(o.agreedTerms.rewardAmount, o.agreedTerms.rewardCurrency) + ' (합의)' : c.rewardAmount != null ? ' · ' + money(c.rewardAmount, c.rewardCurrency) : '') : c.rewardType === 'gifted' ? '제품 제공' : '보상 조건 브랜드 안내 대기';
      return '<li class="v6-row">' + pimg(c, 40) + '<div class="v6-grow"><b>' + crumb(c.name) + '</b><span class="v6-meta">' + h(how) + ' · 참여 단계 ' + h(PST[p.status] || p.status) + '</span><span class="v6-meta">' + (aff ? 'TikTok Shop이 주문 확정 후 정산해요. 판매·정산 데이터는 아직 연동되지 않아 금액을 표시하지 않아요.' : '지급 내역은 아직 연동되지 않아 표시하지 않아요.') + '</span></div>' + chip(aff ? '판매·정산 데이터 미연동' : '지급 내역 미연동', 'info') + '</li>';
    }).join('') || '<li class="v6-empty">이 브랜드에서 선정된 캠페인이 없어요.</li>') + '</ul><p class="v6-meta">신청 중인 캠페인은 선정 후 여기에 보여요. 문제가 있으면 ‘도움말’에서 문의해요.</p></div>';
  }
  function scProfile() {
    var p = LIVE.profile, t = LIVE.tiktok, st = (p && p.states) || {}, lang = window.__USER_LANG || 'ko';
    var LANGS = [['ko', '한국어'], ['en', 'English'], ['th', 'ไทย'], ['vi', 'Tiếng Việt'], ['ja', '日本語']];
    var owner = st.tiktokOwner || 'none';
    var ownerChip = owner === 'connected' ? chip('확인됨', 'ok') : owner === 'pending' ? chip('확인 중', 'warn') : chip(p && p.tiktokConfigured === false ? '연결 대기 (TikTok 승인 대기)' : '미확인', 'warn');
    var npAll = LIVE.notifPrefs, np = npAll && npAll.prefs, npApplied = (npAll && npAll.applied) || {};
    return spaceTabs('c-profile') + '<div class="creator-wrap"><div class="page-head"><div><h1>내 정보</h1><p>언어·계정·참여 자격</p></div></div>' +
      '<div class="card"><h3>언어 </h3><div class="field"><label for="p-tr">메시지 번역 언어</label><select id="p-tr" onchange="setConversationLang(this.value)">' + LANGS.map(function (l) { return '<option value="' + l[0] + '"' + (l[0] === lang ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select><span class="hint">커뮤니티·담당자 DM 표시 언어예요. 이 기기에 저장돼요. 번역이 없으면 원문을 보여 줘요.</span></div></div>' +
      '<div class="card" style="margin-top:12px"><h3>프로필 </h3>' + (p ? '<ul class="rows"><li class="rowi"><div class="grow"><b>국가 · 배송 가능 국가</b><div class="sub">' + h(CTRY[p.country] || p.country || '미설정') + ' · ' + h(ctry(p.shipCountries)) + '</div></div></li><li class="rowi"><div class="grow"><b>약관·개인정보 동의</b><div class="sub">' + (p.consentedVersion ? chip('동의함', 'ok') + ' ' + h(p.consentedVersion) : chip('미동의', 'warn')) + '</div></div></li></ul><p class="small muted">국가·핸들·동의는 온보딩 화면에서 바꿔요.</p>' + btn('프로필 수정', "navigate('onboarding')") : loading()) + '</div>' +
      '<div class="card" style="margin-top:12px"><h3>내 계정과 참여 자격 </h3><ul class="rows"><li class="rowi"><div class="grow"><b>TikTok ' + h(p && p.tiktokHandle ? '@' + String(p.tiktokHandle).replace(/^@/, '') : '핸들 미입력') + '</b><div class="sub">계정 주인 확인 ' + ownerChip + ' · 판매 보상 자격 ' + chip(st.tiktokShop === 'connected' ? '확인됨' : '미확인', st.tiktokShop === 'connected' ? 'ok' : '') + ' · ' + h(brandShort()) + ' 참여 ' + chip(p && p.entryReady ? '가능' : '준비 필요', p && p.entryReady ? 'ok' : 'warn') + '</div></div>' +
      (owner === 'connected' ? btn('인증 해제', 'tiktokDisconnect()', 'ghost') : btn('TikTok 계정 확인', 'tiktokConnect()')) + '</li><li class="rowi"><div class="grow"><b>로그인</b><div class="sub">' + h((window.__ME && window.__ME.email) || '') + ' · 이메일 링크 로그인</div></div>' + btn('로그아웃', 'authLogout()', 'ghost') + '</li></ul>' +
      (p && !p.entryReady ? '<p class="small muted">기다리는 동안 할 수 있는 일: 커뮤니티 질문 보기, 캠페인 조건 보기</p>' : '') + '</div>' +
      '<div class="card" style="margin-top:12px"><h3>알림 </h3>' + (!np ? (LIVE.notifPrefsError ? '<p class="small">알림 설정을 불러오지 못했어요. ' + btn('다시 불러오기', 'loadNotifPrefs()') + '</p>' : '<p class="small muted">불러오는 중…</p>') :
        '<ul class="rows">' + [['dm', '담당자 메시지', '새로운 1:1 대화가 도착했을 때'], ['campaign', '캠페인·선정 소식', '브랜드의 새 모집과 참여 결과'], ['deadline', '제출 일정 알림', '협업의 다음 기한이 다가올 때'], ['email', '이메일로도 받기', '중요한 협업 소식을 이메일로 확인']].filter(function (r) { return r[0] in np; }).map(function (r) { var live = npApplied[r[0]] === 'active'; return '<li class="rowi"><div class="grow"><b>' + r[1] + '</b><div class="sub">' + r[2] + (live ? '' : ' · ' + chip('발송 준비 중', '')) + '</div></div><label class="v6-inline"><input type="checkbox"' + (np[r[0]] ? ' checked' : '') + ' onchange="saveNotifPref(\'' + r[0] + '\',this.checked)"> 받기</label></li>'; }).join('') + '</ul><p class="small muted">설정은 계정에 저장돼요. ‘발송 준비 중’ 항목은 설정만 저장되고 아직 발송되지 않아요.</p>') + '</div></div>';
  }

  /* ---------- 화면: 공지사항 (공지 채널) / 캠페인 공지 / 도움말 ---------- */
  function noticeMsgs() { var b = currentBrand(); return b && LIVE.notices && LIVE.notices[b.cellId] ? LIVE.notices[b.cellId] : null; }
  function loadNotices() {
    var b = currentBrand(); if (!b || !b.cellId) return;
    LIVE.notices = LIVE.notices || {};
    if (LIVE.notices[b.cellId] || V.busy['n:' + b.cellId]) return;
    V.busy['n:' + b.cellId] = true;
    liveReq('GET', '/community/cells/' + encodeURIComponent(b.cellId) + '/messages?channel=notice&limit=50').then(function (m) { LIVE.notices[b.cellId] = m || []; })
      .catch(function () { LIVE.notices[b.cellId] = 'error'; }).finally(function () { V.busy['n:' + b.cellId] = false; render(); });
  }
  function msgText(m) { var l = window.__USER_LANG || 'ko', t = m.translations && m.translations[l]; return (typeof t === 'string' && t.trim() && !/^\[[a-z]{2}·번역대기\]/.test(t)) ? t : m.original; }
  function scAnnouncements() {
    loadNotices();
    var ms = noticeMsgs();
    var body = ms === null ? loading() : ms === 'error' ? '<div class="v6-empty" role="alert">공지를 불러오지 못했어요. ' + btn('다시 불러오기', "V8reloadNotices()") + '</div>' :
      '<ul class="rows">' + (ms.filter(function (m) { return !m.threadParent; }).slice().reverse().map(function (m) { return '<li class="rowi"><div class="grow"><b>' + h(msgText(m).split('\n')[0].slice(0, 120)) + '</b><div class="sub">' + (m.pinnedAt ? '📌 고정 · ' : '') + h(fmtDay(m.at)) + (msgText(m).length > 120 || msgText(m).indexOf('\n') > 0 ? ' · ' + h(msgText(m).slice(0, 160)) : '') + '</div></div>' + btn(m.replyCount ? '답글 ' + m.replyCount + '개' : '공지 열기', 'V8openNotice(' + Number(m.msgId) + ')') + '</li>'; }).join('') || '<li class="rowi"><div class="grow"><b>아직 공지가 없어요.</b><div class="sub">브랜드가 공지를 올리면 여기에 보여요.</div></div></li>') + '</ul>';
    return '<div class="creator-wrap"><div class="page-head"><div><h1>공지사항</h1><p>' + h(brandShort()) + '가 올린 공지예요. 질문은 각 공지의 답글로 남겨요.</p></div></div>' + body + '</div>';
  }
  window.V8reloadNotices = function () { var b = currentBrand(); if (b && LIVE.notices) delete LIVE.notices[b.cellId]; render(); };
  /* 캠페인 공지: 브랜드가 채널에 게시한 캠페인 카드(campaignId 가 붙은 메시지) — 서버 실데이터 */
  function loadCampaignPosts(force) {
    var b = currentBrand(); if (!b || !b.cellId) return;
    LIVE.cposts = LIVE.cposts || {};
    if ((!force && LIVE.cposts[b.cellId]) || V.busy['cp:' + b.cellId]) return;
    var cell = b.cellId, token = window.jwtGet ? jwtGet() : '';
    V.busy['cp:' + cell] = true;
    liveReq('GET', '/community/cells/' + encodeURIComponent(cell) + '/messages?campaign_posts=true&limit=100')
      .then(function (m) { if (!window.jwtGet || token === jwtGet()) LIVE.cposts[cell] = m || []; })
      .catch(function (e) { if (typeof isStale === 'function' && isStale(e)) return; LIVE.cposts[cell] = 'error'; })
      .finally(function () { V.busy['cp:' + cell] = false; render(); });
  }
  window.V8reloadPosts = function () { loadCampaignPosts(true); render(); };
  function scRecruit() {
    loadCampaignPosts();
    var b = currentBrand(), posts = b && LIVE.cposts ? LIVE.cposts[b.cellId] : null;
    var top = head('캠페인 공지', h(brandShort()) + '가 채널에 게시한 캠페인 카드를 모아 봐요 (읽기 전용).', btn('새로고침', 'V8reloadPosts()', 'ghost'));
    if (!b || !b.cellId) return '<div class="v6">' + top + '<div class="v6-empty">이 브랜드의 커뮤니티 공간이 아직 없어요.</div></div>';
    if (posts === 'error') return '<div class="v6">' + top + '<div class="v6-empty" role="alert">캠페인 공지를 불러오지 못했어요. ' + btn('다시 불러오기', 'V8reloadPosts()') + '</div></div>';
    if (!posts) return '<div class="v6">' + top + loading() + '</div>';
    var seen = {}, list = posts.slice().reverse().filter(function (m) { if (!m.campaignId || seen[m.campaignId]) return false; seen[m.campaignId] = 1; return true; });
    if (!list.length) return '<div class="v6">' + top + '<ul class="v6-list"><li class="v6-empty"><b>아직 채널에 게시된 캠페인이 없어요.</b><p>모집 중인 캠페인은 캠페인 둘러보기에서 확인할 수 있어요.</p>' + btn('캠페인 둘러보기', "V8go('c-campaigns')") + '</li></ul></div>';
    return '<div class="v6">' + top + scopeBar('캠페인 공지') + '<ul class="v8-cgrid">' + list.map(function (m) {
      var c = campaignsLive().find(function (x) { return x.campaignId === m.campaignId; }), o = offerByCampaign(m.campaignId);
      var when = '<span class="v6-meta">' + h(chLabel(m.channel)) + ' 채널 · ' + h(fmtDay(m.at)) + ' 게시</span>';
      if (!c) return '<li class="v8-ccard"><div class="v6-grow">' + when + '<h3>' + h(msgText(m).split('\n')[0].replace(/^\[캠페인\]\s*/, '')) + '</h3><p class="v6-meta">' + h(msgText(m).split('\n').slice(1).join(' ')) + '</p></div><div class="v8-ccard-foot">' + chip('모집 종료 · 목록에서 내려간 캠페인', 'err') + (o ? btn('내 캠페인에서 보기', "V8go('c-work','" + a(m.campaignId) + "')") : '') + '</div></li>';
      var st = myState(c), e = effTerms(c, o);
      var cta = o || (c.myStatus && c.myStatus !== 'none') ? btn('내 캠페인에서 보기', "V8go('c-work','" + a(c.campaignId) + "')") : btn('조건 보기', "V8go('c-campaigns','" + a(c.campaignId) + "')", 'pri');
      return '<li class="v8-ccard"><div class="v8-ccard-top">' + pimg(c, 88) + '<div class="v6-grow">' + when + '<h3>' + h(c.name) + '</h3><span class="v6-meta">' + h(c.product || '') + '</span></div></div>' +
        '<dl class="v8-facts"><div><dt>보상</dt><dd>' + h(rewardKind(e)) + '</dd></div><div><dt>신청 국가</dt><dd>' + h(ctry(c.countries)) + '</dd></div><div><dt>콘텐츠</dt><dd>' + h(contentText(e)) + '</dd></div><div><dt>모집 마감</dt><dd>' + h(c.deadline ? String(c.deadline).slice(0, 10) : '별도 안내') + ' <span class="v6-meta">' + h(dLabel(c.deadline)) + '</span></dd></div></dl>' +
        '<div class="v8-ccard-foot">' + chip('내 상태: ' + st[0], st[1]) + cta + '</div></li>';
    }).join('') + '</ul></div>';
  }
  function scHelpdesk() {
    return '<div class="creator-wrap"><div class="page-head"><div><h1>도움말</h1><p>막혔을 때 어디에 물어볼지 알려 드려요.</p></div>' + btn('담당자에게 문의', "V8go('c-messages')", 'pri') + '</div>' +
      '<ul class="rows"><li class="rowi"><div class="grow"><b>보상이 언제 들어와요?</b><div class="sub">캠페인 조건별 보상 방식과 단계를 확인해요.</div></div>' + btn('받을 보상 보기', "V8go('c-rewards')") + '</li>' +
      '<li class="rowi"><div class="grow"><b>주소를 바꾸고 싶어요</b><div class="sub">샘플 발송 전까지 각 캠페인에서 바꿀 수 있어요.</div></div>' + btn('내 할 일', "V8go('c-tasks')") + '</li>' +
      '<li class="rowi"><div class="grow"><b>내 문의 보기</b><div class="sub">브랜드 담당자와 1:1 대화예요.</div></div>' + btn('브랜드 담당자', "V8go('c-messages')") + '</li>' +
      '<li class="rowi"><div class="grow"><b>커뮤니티 이용 안내</b><div class="sub">배송지·연락처·수수료는 공개 채널에 남기지 마세요.</div></div>' + btn('안내 보기', 'guideDialog()') + '</li></ul></div>';
  }

  /* ---------- 화면: 랭킹 / 미션 (서버 XP) ---------- */
  function levelInfo(total) { var lo = Math.floor((total || 0) / 300) * 300; return { l: lo / 300 + 1, lo: lo, hi: lo + 300, pct: Math.round(((total || 0) - lo) / 3) }; }
  /* 누적 XP: 서버가 브랜드별로 합산한 /me/xp?brand= 의 total (최근 50건 events 합산이 아님).
     브랜드별 캐시 — 응답은 요청한 브랜드 키에만 쓰고, 세션이 바뀌면 버린다(브랜드 전환·응답 경합 안전). */
  var XPC = { token: null, total: {}, events: {}, busy: {}, err: {} };
  function loadBrandXp(b, force) {
    var token = window.jwtGet ? jwtGet() : '';
    if (XPC.token !== token) XPC = { token: token, total: {}, events: {}, busy: {}, err: {} };
    if (!b || XPC.busy[b] || (!force && (b in XPC.total || XPC.err[b]))) return;
    XPC.busy[b] = true;
    var box = XPC;
    liveReq('GET', '/me/xp?brand=' + encodeURIComponent(b)).then(function (x) {
      if (box !== XPC) return;                       // 세션이 바뀐 뒤 도착한 응답은 버린다
      box.total[b] = Number(x && x.total) || 0; box.events[b] = (x && x.events) || []; delete box.err[b];
    }).catch(function (e) { if (box === XPC && !(typeof isStale === 'function' && isStale(e))) box.err[b] = true; })
      .finally(function () { if (box === XPC) { box.busy[b] = false; render(); } });
  }
  window.__v8xpRefresh = function () { var b = bid(); if (b) loadBrandXp(b, true); };
  function brandXp() { var b = bid(); loadBrandXp(b); return b && b in XPC.total ? XPC.total[b] : null; }
  function levelBar() { var x = brandXp(); if (x === null) return '<div class="v8-level" role="status"><p class="v6-meta">' + (XPC.err[bid()] ? '누적 XP를 불러오지 못했어요. ' + btn('다시 불러오기', '__v8xpRefresh()', 'ghost') : '누적 XP 불러오는 중…') + '</p></div>'; var li = levelInfo(x); return '<div class="v8-level"><div class="v8-level-t"><b>Lv.' + li.l + '</b><span class="v6-meta">누적 ' + x + ' XP · 다음 레벨까지 ' + (li.hi - x) + ' XP</span></div><div class="v6-progress" role="progressbar" aria-label="레벨 진행" aria-valuemin="' + li.lo + '" aria-valuemax="' + li.hi + '" aria-valuenow="' + x + '"><span style="width:' + li.pct + '%"></span></div><p class="v6-meta">XP는 활동 기록이에요. 현금·정산·운영 성과와 관계없어요.</p></div>'; }
  function ensureSpace() { var b = bid(); if (!b || !LIVE.ranking || LIVE.ranking[b] || LIVE.spaceBusy || V.busy['s:' + b]) return; V.busy['s:' + b] = true; loadSpace(b); }  /* 한 번만 자동 요청 — 실패하면 화면의 '다시 불러오기'로 재시도 */
  var XP_LABEL = { join: '브랜드 합류', first_message: '커뮤니티 첫 인사', application: '캠페인 신청', agreement: '조건 합의', content_submitted: '콘텐츠 제출', completed: '협업 완료' };
  function scRanking() {
    ensureSpace();
    var b = bid(), set = LIVE.ranking && LIVE.ranking[b], rows = set && set.week, hist = XPC.events[b] || [];
    var me = rows && rows.find(function (r) { return r.me; });
    var max = rows && rows.length ? Math.max.apply(null, rows.map(function (r) { return r.total || 0; }).concat([1])) : 1;
    var table = !set ? (LIVE.spaceBusy ? loading() : '<div class="v6-empty">랭킹을 불러오지 못했어요. ' + btn('다시 불러오기', "loadSpace('" + a(b) + "')") + '</div>') : !rows || !rows.length ? '<div class="v6-empty">이번 주 활동 기록이 아직 없어요.</div>' :
      '<ol class="v8-rank">' + rows.map(function (r, i) { return '<li class="' + (r.me ? 'is-me' : '') + (i < 3 ? ' is-top' : '') + '"><span class="v8-rank-n">' + (r.rank || i + 1) + '</span><span class="v8-rank-name">' + h(r.handle || '크리에이터') + (r.me ? ' <span class="chip plum">나</span>' : '') + '</span><span class="v8-rank-bar" aria-hidden="true"><span style="width:' + Math.round((r.total || 0) / max * 100) + '%"></span></span><span class="v8-rank-pt">' + (r.total || 0) + '점</span></li>'; }).join('') + '</ol>';
    return '<div class="v6 v8-creator">' + head('브랜드 랭킹', h(brandShort()) + ' 기준 점수예요. 주간 점수와 누적 레벨 XP를 따로 계산해요.') + levelBar() +
      '<div class="v6-split"><section class="v6-col"><h2>이번 주 순위 ' + (me ? '<span class="v6-count-inline">내 순위 ' + me.rank + '위 · ' + (me.total || 0) + '점</span>' : '') + '</h2>' + table + '</section>' +
      '<section class="v6-col"><h2>점수 내역</h2><ul class="v6-list">' + (hist.map(function (e) { return '<li class="v6-row"><div class="v6-grow">' + h(XP_LABEL[e.kind] || e.kind) + '</div><span class="v6-meta">+' + e.points + ' · ' + h(String(e.at || '').slice(5, 10).replace('-', '/')) + '</span></li>'; }).join('') || '<li class="v6-empty">아직 점수 내역이 없어요.</li>') + '</ul>' +
      '<p class="v6-meta">제외 기준: 같은 미션 반복, 같은 문장 반복, 자기 글에 반응하기는 점수에 넣지 않아요.</p>' + btn('할 수 있는 미션 보기', "V8go('c-missions')") + '</section></div></div>';
  }
  var MISSION_GO = { join: ['합류 완료', '', ''], first_message: ['#자유대화로 가서 첫 인사 남기기', '#자유대화에서 해요', 'chat'], application: ['캠페인 보러 가기', '캠페인 둘러보기에서 해요', 'c-campaigns'], agreement: ['내 캠페인에서 조건 확인', '내 캠페인에서 해요', 'c-work'], content_submitted: ['내 캠페인에서 영상 제출', '내 캠페인에서 해요', 'c-work'], completed: ['내 캠페인 보기', '브랜드 확인 후 기록돼요', 'c-work'] };
  function missionCanDo(kind) {
    var ps = parts();
    if (kind === 'agreement') return ps.some(function (p) { return p.status === 'selected'; });
    if (kind === 'content_submitted') return ps.some(function (p) { return ['sample_shipped', 'revision_requested', 'terms_agreed'].indexOf(p.status) >= 0; });
    if (kind === 'completed') return false;
    return true;
  }
  var MISSION_WHY = { agreement: '브랜드에 선정되면 할 수 있어요', content_submitted: '조건 합의 후 영상을 제출할 수 있어요', completed: '브랜드가 영상을 확인하면 완료돼요' };
  function scMissions() {
    ensureSpace();
    var b = bid(), ms = LIVE.missions && LIVE.missions[b];
    if (!ms) return '<div class="v6 v8-creator">' + head('미션·배지') + levelBar() + (LIVE.spaceBusy ? loading() : '<div class="v6-empty">미션을 불러오지 못했어요. ' + btn('다시 불러오기', "loadSpace('" + a(b) + "')") + '</div>') + '</div>';
    var g = { can: [], wait: [], done: [] };
    ms.forEach(function (m) { (m.done ? g.done : missionCanDo(m.kind) ? g.can : g.wait).push(m); });
    function card(m, kind) {
      var go = MISSION_GO[m.kind] || [m.label, '', ''];
      var action = kind === 'can' ? btn(h(go[0]), "V8mission('" + a(m.kind) + "')") : kind === 'wait' ? btn('조건 보러 가기', "V8mission('" + a(m.kind) + "')", 'ghost') : chip('완료', 'ok');
      return '<li class="v8-mission is-' + kind + '"><span class="v8-mission-ic" aria-hidden="true">' + (kind === 'done' ? '✓' : kind === 'wait' ? '…' : '+') + '</span><div class="v6-grow"><b>' + h(m.label) + '</b><span class="v6-meta">' + h(go[1] || '') + (go[1] ? ' · ' : '') + '+' + m.points + ' XP' + (kind === 'wait' && MISSION_WHY[m.kind] ? ' · ' + h(MISSION_WHY[m.kind]) : '') + '</span></div>' + action + '</li>';
    }
    function sec(title, kind) { return g[kind].length ? '<section class="v8-msec"><h2>' + title + ' <span class="v6-count-inline">' + g[kind].length + '개</span></h2><ul class="v8-missions">' + g[kind].map(function (m) { return card(m, kind); }).join('') + '</ul></section>' : ''; }
    var dn = g.done.length;
    return '<div class="v6 v8-creator">' + head('미션·배지', h(brandShort()) + ' 미션. 버튼은 실제로 활동할 채널·화면으로 이동해요. 점수는 서버가 활동을 확인한 뒤 한 번만 기록해요.') + levelBar() + sec('지금 할 수 있어요', 'can') + sec('조건을 기다려요', 'wait') + sec('완료했어요', 'done') +
      '<section class="v8-msec"><h2>배지</h2><ul class="v8-badges"><li class="' + (dn >= 1 ? 'is-on' : '') + '">첫 걸음 <span class="v6-meta">미션 1개</span></li><li class="' + (dn >= 3 ? 'is-on' : '') + '">열심 멤버 <span class="v6-meta">미션 3개</span></li><li class="' + (dn >= ms.length ? 'is-on' : '') + '">모두 완료 <span class="v6-meta">미션 ' + ms.length + '개</span></li></ul></section></div>';
  }
  window.V8mission = function (kind) { var to = (MISSION_GO[kind] || [])[2]; if (to === 'chat') return V8openChannel('chat'); if (to) return V8go(to); V8go('c-community'); };

  /* ---------- 화면: 커뮤니티 채널 ---------- */
  function cellOpenFor(ch) { var b = currentBrand(); return LIVE.open && b && LIVE.open.cellId === b.cellId && LIVE.open.channel === ch && !LIVE.open.dm; }
  /* 공지 목록에서 고른 공지를 공지 채널과 함께 그 스레드로 연다 */
  window.V8openNotice = function (mid) {
    var b = currentBrand(); captureDraft(); V.screen = 'c-community'; V.id = 'notice'; V.tab = 'msg'; V.info = false; pushHash();
    if (!b || !b.cellId) return render();
    return Promise.resolve(openCell(b.cellId, b.cellName || b.name, 'notice')).then(function () {
      if (V.screen === 'c-community' && V.id === 'notice' && LIVE.open && LIVE.open.cellId === b.cellId) return threadOpen(mid);
    });
  };
  window.V8openChannel = function (ch) {
    var b = currentBrand(); if (b && b.cellId) loadChannels(b.cellId, true); captureDraft(); V.screen = 'c-community'; V.id = ch; V.tab = 'msg'; V.info = false; pushHash();
    if (b && b.cellId) { openCell(b.cellId, b.cellName || b.name, ch); } else render();
  };
  function msgHtml(m) {
    var l = window.__USER_LANG || 'ko', t = m.translations && m.translations[l];
    if (typeof t !== 'string' || !t.trim() || /^\[[a-z]{2}·번역대기\]/.test(t)) t = '';
    var shown = t || m.original, isTr = !!t && shown !== m.original, key = 'v8' + m.msgId, orig = ui.original && ui.original[key];
    var pending = !t && m.originalLocale && m.originalLocale !== l;
    var role = m.authorKind === 'brand' ? ' · 브랜드 담당' : m.authorKind === 'ari' ? ' · 운영' : '';
    return '<div class="msg sp-msg' + (LIVE.thread && LIVE.thread.rootId === m.msgId ? ' sp-active' : '') + '"><span class="sp-av" aria-hidden="true">' + h((m.author || '?').slice(0, 1).toUpperCase()) + '</span><div class="sp-body"><p class="small muted">' + h(m.author || '멤버') + role + ' · ' + h(fmtTime(m.at)) + (m.pinnedAt ? ' · 📌 고정' : '') + '</p><p>' + h(shown) + '</p>' +
      (m.imageUrl ? '<img class="message-image" src="' + a(m.imageUrl) + '" alt="첨부 이미지" loading="lazy" referrerpolicy="no-referrer" style="max-width:min(320px,100%);border-radius:8px">' : '') +
      (isTr ? '<p class="small muted">번역 표시 · <button type="button" class="sp-reply" onclick="ui.original[\'' + key + '\']=!ui.original[\'' + key + '\'];render()">' + (orig ? '원문 닫기' : '원문 보기') + '</button></p>' + (orig ? '<p class="small">' + h(m.original) + '</p>' : '') : pending ? '<p class="small muted">' + (m.translationState === 'failed' ? '번역 실패 · 원문 표시' : '번역 준비 중 · 원문 표시') + '</p>' : '') +
      (m.msgId ? '<button type="button" class="sp-reply" aria-pressed="' + !!m.myReaction + '" onclick="reactToggle(' + m.msgId + ',' + (m.myReaction ? 'false' : 'true') + ')">♡ ' + (m.reactionCount || 0) + '</button> <button type="button" class="sp-reply" data-act="sp-thread" aria-expanded="' + !!(LIVE.thread && LIVE.thread.rootId === m.msgId) + '" onclick="threadOpen(' + m.msgId + ')">' + (m.replyCount ? '답글 ' + m.replyCount + '개' : '답글') + '</button>' : '') + '</div></div>';
  }
  function scCommunity() {
    var b = currentBrand(), want = V.id || 'chat', info = chInfo(want);
    // 목록을 받은 뒤에도 없는 채널(보관됨·삭제)이면 자유대화로 — 받기 전에는 요청한 채널을 그대로 연다
    var gone = chReady() && !info, ch = gone ? 'chat' : want; if (gone) info = chInfo('chat');
    if (!b) return '<div class="v6"><div class="v6-empty">아직 참여한 브랜드가 없어요. 브랜드의 초대 링크로 합류하세요. ' + btn('초대 링크 입력', 'inviteDialog()') + '</div></div>';
    if (!cellOpenFor(ch) && b.cellId && !(LIVE.open && LIVE.open.loading && LIVE.open.cellId === b.cellId && LIVE.open.channel === ch)) { setTimeout(function () { if (V.screen === 'c-community' && !cellOpenFor(ch)) openCell(b.cellId, b.cellName || b.name, ch); }, 0); }
    var open = cellOpenFor(ch) ? LIVE.open : null, ro = ch === 'notice' || !!(info && info.visibility === 'readonly');
    var key = open ? chatKey() : '';
    var pin = campaignsLive().filter(function (c) { return !campExpired(c); })[0];
    var feed;
    if (!open || open.loading) feed = '<div class="v8-day"><span>불러오는 중</span></div>';
    else if (open.error) feed = '<p class="alert warn" role="alert">' + h(open.error) + '</p>';
    else {
      var msgs = (open.msgs || []).filter(function (m) { return m.channel === ch && !m.threadParent; });
      msgs = msgs.filter(function (m) { return m.pinnedAt; }).concat(msgs.filter(function (m) { return !m.pinnedAt; }));
      var last = '';
      feed = msgs.map(function (m) { var d = fmtDay(m.at), div = d && d !== last ? '<div class="v8-day"><span>' + h(d) + '</span></div>' : ''; last = d || last; return div + msgHtml(m); }).join('') || '<div class="v8-day"><span>' + (ro ? '아직 공지가 없어요' : '첫 대화를 시작해 보세요') + '</span></div>';
    }
    if (pin && ch !== 'notice') feed = '<div class="v8-pin"><span class="v8-pin-l">고정</span>' + pimg(pin, 40) + '<div class="v6-grow"><b>' + h(pin.name) + '</b><span class="v6-meta">' + h(rewardKind(pin)) + ' · ' + h(ctry(pin.countries)) + ' · ' + h(dLabel(pin.deadline)) + '</span></div>' + btn('조건 보기', "V8go('c-campaigns','" + a(pin.campaignId) + "')") + '</div>' + feed;
    var search = LIVE.searchRes ? '<div class="v6-notice" role="region" aria-label="검색 결과"><span><b>검색 결과 ' + LIVE.searchRes.length + '건</b> ' + LIVE.searchRes.slice(0, 8).map(function (m) { return h(m.author) + ': ' + h(String(m.original).slice(0, 60)); }).join(' · ') + '</span>' + btn('닫기', 'commSearchClear()') + '</div>' : '';
    var draft = (open && store.drafts[key]) || '';
    var compose = ro ? '<div class="v2-compose"><p class="small muted" style="margin:0">' + (ch === 'notice' ? '공지는 브랜드만 올리는 읽기 전용 채널이에요. 질문은 각 공지의 답글로 남겨 주세요.' : '이 채널은 브랜드만 글을 쓰는 읽기 전용 채널이에요. 질문은 각 글의 답글로 남겨 주세요.') + '</p></div>' :
      '<div class="v2-compose"><label class="sr" for="chatDraft">메시지 입력</label><textarea id="chatDraft" data-key="' + a(key) + '" maxlength="2000" placeholder="# ' + a(chLabel(ch)) + '에 메시지 입력" oninput="store.drafts[this.dataset.key]=this.value"' + (LIVE.sending || !open ? ' disabled' : '') + '>' + h(draft) + '</textarea>' +
      (ui.attachOpen ? '<input id="chatImage" type="url" placeholder="이미지 주소 (공개 https)" maxlength="480" style="margin-top:6px">' : '') +
      '<div class="btns" style="margin:0"><button type="button" class="btn " onclick="ui.attachOpen=!ui.attachOpen;render()" aria-expanded="' + !!ui.attachOpen + '">첨부</button><button type="button" class="btn pri" onclick="sendMessage()"' + (LIVE.sending ? ' disabled' : '') + '>' + (LIVE.sending ? '전송 중…' : '전송') + '</button></div></div>';
    var ps = parts();
    var tabs = '<div class="tabs" role="tablist"><button type="button" role="tab" aria-selected="' + (V.tab === 'msg') + '" onclick="V8tab(\'msg\')">메시지</button><button type="button" role="tab" aria-selected="' + (V.tab === 'camp') + '" onclick="V8tab(\'camp\')">캠페인 정보</button><button type="button" role="tab" aria-selected="' + (V.tab === 'work') + '" onclick="V8tab(\'work\')">내 협업·제출</button></div>';
    var welcome = '<div class="sp-welcome"><span class="sp-welcome-t">새로 오셨군요 · 첫 행동, 이번 주 기회, 질문 바로가기</span><button type="button" class="btn ghost sp-welcome-btn" aria-expanded="' + V.welcome + '" onclick="V8set(\'_w\',1);V8toggle(\'welcome\')">' + (V.welcome ? '접기' : '펼치기') + '</button></div><div class="card primary-card v2-welcome sp-welcome-card"' + (V.welcome ? '' : ' hidden') + '><ol class="small"><li>첫 행동: #자유대화에 자기소개 한 줄 남기기</li>' + (pin ? '<li>이번 주 기회: ' + h(pin.name) + ' ' + btn('조건 보기', "V8go('c-campaigns','" + a(pin.campaignId) + "')") + '</li>' : '') + '<li>질문은 # 질문 채널에 남겨 주세요</li></ol></div>';
    var thread = '';
    if (LIVE.thread || V.info) {
      if (V.info) thread = '<aside class="sp-thread" aria-label="채널 정보"><div class="sp-thead"><b>채널 정보</b><button type="button" class="xbtn" aria-label="정보 닫기" onclick="V8toggle(\'info\')">✕</button></div><div class="sp-tbody"><p><b>' + h(b.name) + ' · # ' + h(chLabel(ch)) + '</b></p><p class="small muted">' + h((info && info.description) || '') + ' · 멤버 ' + h(b.memberCount || 0) + '명</p><p class="small">번역: 내 번역 언어로 함께 표시</p><p class="small">배송지·연락처·수수료는 공개 채널에 남기지 마세요.</p></div></aside>';
      else {
        var t = LIVE.thread, root = open && (open.msgs || []).find(function (m) { return m.msgId === t.rootId; });
        var replies = (t.msgs || []).filter(function (m) { return m.msgId !== t.rootId; });
        thread = '<aside class="sp-thread" aria-label="스레드"><div class="sp-thead"><b>스레드</b><button type="button" class="xbtn" aria-label="스레드 닫기" onclick="threadClose()">✕</button></div><div class="sp-tbody">' +
          (root ? '<div class="sp-msg sp-root"><span class="sp-av" aria-hidden="true">' + h((root.author || '?').slice(0, 1).toUpperCase()) + '</span><div class="sp-body"><p class="small muted">' + h(root.author) + ' · ' + h(fmtTime(root.at)) + '</p><p>' + h(msgText(root)) + '</p></div></div>' : '') +
          (t.msgs === null ? '<p class="small muted">불러오는 중…</p>' : replies.map(function (m) { return '<div class="sp-msg"><span class="sp-av" aria-hidden="true">' + h((m.author || '?').slice(0, 1).toUpperCase()) + '</span><div class="sp-body"><p class="small muted">' + h(m.author) + ' · ' + h(fmtTime(m.at)) + '</p><p>' + h(msgText(m)) + '</p></div></div>'; }).join('') || '<p class="small muted">아직 답글이 없어요.</p>') + '</div>' +
          '<div class="sp-tcompose"><label class="sr" for="threadReply">답글 입력</label><textarea id="threadReply" placeholder="답글 입력" maxlength="2000"></textarea><button type="button" class="btn pri" onclick="threadReplySend()"' + (LIVE.threadBusy ? ' disabled' : '') + '>보내기</button></div></aside>';
      }
    }
    var panels = '<div data-group="ch" data-panel="msg" class="sp-msgpanel"' + (V.tab === 'msg' ? '' : ' hidden') + '><p class="alert info small">메시지는 내 번역 언어로 함께 보여요. </p>' + welcome + search + '<div class="v2-feed" id="messageFeed">' + feed + '</div>' + compose + '</div>' +
      '<div data-group="ch" data-panel="camp"' + (V.tab === 'camp' ? '' : ' hidden') + '><ul class="v6-list">' + (campaignsLive().map(function (c) { return '<li class="v6-row">' + pimg(c, 40) + '<div class="v6-grow"><b>' + h(c.name) + '</b><span class="v6-meta">' + h(rewardKind(c)) + ' · ' + h(contentText(c)) + '</span></div>' + btn('조건 보기', "V8go('c-campaigns','" + a(c.campaignId) + "')") + '</li>'; }).join('') || '<li class="v6-empty">이 브랜드에서 모집 중인 캠페인이 없어요.</li>') + '</ul></div>' +
      '<div data-group="ch" data-panel="work"' + (V.tab === 'work' ? '' : ' hidden') + '><ul class="v6-list">' + (ps.map(function (p) { var na = nextAction(p); return '<li class="v6-row"><div class="v6-grow"><b>' + crumb(p.c.name) + '</b><span class="v6-meta">' + na[0] + '</span></div>' + na[1] + '</li>'; }).join('') || '<li class="v6-empty">이 브랜드에서 참여한 캠페인이 없어요.</li>') + '</ul></div>';
    return '<div class="v2-ch"><div class="v2-chhead"><h1><span class="v8-brandmark" aria-hidden="true">' + h(b.name.slice(0, 1)) + '</span># ' + h(chLabel(ch)) + ' <span class="small muted">' + h(b.name) + '</span></h1><p class="v8-chdesc">' + h((info && info.description) || '') + ' · ' + (ro ? '읽기 전용' : '누구나 글쓰기') + (info && info.campaignId ? ' · ' + btn('연결 캠페인: ' + h(info.campaignName || info.campaignId), "V8go('c-campaigns','" + a(info.campaignId) + "')", 'ghost') : '') + '</p>' + (gone ? '<p class="alert warn" role="alert">찾는 채널은 브랜드가 보관했어요. 자유대화를 보여 드려요.</p>' : '') + '<div class="btns" style="margin:0"><button type="button" class="btn " onclick="V8search()">채널 검색</button><button type="button" class="btn " aria-expanded="' + V.info + '" onclick="V8toggle(\'info\')">정보</button></div></div>' + tabs + panels + '</div>' + thread;
  }
  window.V8tab = function (t) { V.tab = t; render(); };
  window.V8toggle = function (k) { V[k] = !V[k]; if (k === 'info' && V.info && LIVE.thread) LIVE.thread = null; render(); };
  window.V8search = function () {
    var q = window.prompt('이 채널에서 검색 (2자 이상)', LIVE.searchQ || '');
    if (q == null) return; commSearchInput(q); commSearchRun();
  };

  /* ---------- 화면: 브랜드 담당자 DM ---------- */
  function scMessages() {
    var b = currentBrand();
    if (!b) return '<div class="v6"><div class="v6-empty">참여한 브랜드가 없어요.</div></div>';
    var dm = dmCellFor(b.brandId), open = dm && LIVE.open && LIVE.open.cellId === dm.cellId ? LIVE.open : null;
    if (!dm && !V.busy['dm:' + b.brandId]) { V.busy['dm:' + b.brandId] = true; liveReq('POST', '/community/dm/' + encodeURIComponent(b.brandId), {}).then(function (r) { if (!(LIVE.cells || []).some(function (c) { return c.cellId === r.cellId; })) LIVE.cells = (LIVE.cells || []).concat([{ cellId: r.cellId, name: '담당자 DM', brandId: b.brandId, brandName: b.name, kind: 'dm' }]); render(); }).catch(function () { V.busy['dm:' + b.brandId] = 'error'; render(); }); }
    else if (dm && !open && !(LIVE.open && LIVE.open.cellId === dm.cellId)) setTimeout(function () { if (V.screen === 'c-messages') openCell(dm.cellId, '담당자 DM'); }, 0);
    var camps = campaignsLive();
    var key = open ? chatKey() : '';
    var feed = !open || open.loading ? '<p class="small muted" style="padding:12px 16px">불러오는 중…</p>' : open.error ? '<p class="alert warn" role="alert">' + h(open.error) + '</p>' :
      ((open.msgs || []).filter(function (m) { return !m.threadParent; }).map(function (m) { var mine = m.authorKind === 'creator'; return '<div class="v6-msg' + (mine ? ' me' : '') + '"><span class="v6-av" aria-hidden="true">' + (mine ? '나' : h((b.name || '?').slice(0, 1))) + '</span><div><p class="v6-mh">' + (mine ? '나' : h(b.name) + ' 담당') + ' · ' + h(fmtDay(m.at)) + ' ' + h(fmtTime(m.at)) + '</p><p>' + h(msgText(m)) + '</p></div></div>'; }).join('') || '<p class="small muted" style="padding:12px 16px">아직 대화가 없어요. 궁금한 점을 남겨 주세요.</p>');
    return '<div class="v6">' + head('브랜드 담당자 ', '브랜드를 고르면 그 대화가 열려요. 브랜드 회신함과 같은 메시지예요.') +
      '<div class="v6-filters"><div class="v6-field"><label for="cdm-b">브랜드</label><select id="cdm-b" onchange="V8brand(this.value,\'c-messages\')">' + brandsLive().map(function (x) { return '<option value="' + a(x.brandId) + '"' + (x.brandId === b.brandId ? ' selected' : '') + '>' + h(x.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="v6-field"><label for="cdm-c">관련 캠페인</label><select id="cdm-c" data-v8f="dmCamp"><option value="">선택 안 함</option>' + camps.map(function (c) { return '<option value="' + a(c.campaignId) + '"' + (V.f.dmCamp === c.campaignId ? ' selected' : '') + '>' + h(c.name) + '</option>'; }).join('') + '</select><span class="hint">고르면 메시지 앞에 캠페인 이름을 붙여 보내요.</span></div></div>' +
      (V.busy['dm:' + b.brandId] === 'error' ? '<p class="alert warn" role="alert">담당자 DM은 브랜드 멤버십 가입 후 이용할 수 있어요.</p>' : '') +
      '<div class="v6-iconvo v6-solo"><div class="v6-ihead"><b>' + h(b.name) + ' 담당</b><span class="v6-meta">' + h(V.f.dmCamp && campaignById(V.f.dmCamp) ? campaignById(V.f.dmCamp).name : '1:1 대화') + '</span></div><div class="v6-feed" id="messageFeed">' + feed + '</div>' +
      '<div class="v6-compose"><label for="chatDraft">메시지</label><textarea id="chatDraft" data-key="' + a(key) + '" maxlength="2000" oninput="store.drafts[this.dataset.key]=this.value"' + (!open || LIVE.sending ? ' disabled' : '') + '>' + h((key && store.drafts[key]) || '') + '</textarea><div class="v6-actions">' + btn(LIVE.sending ? '보내는 중…' : '보내기', 'V8dmSend()', 'pri', LIVE.sending ? ' disabled' : '') + '</div></div></div></div>';
  }
  window.V8dmSend = function () {
    var d = document.getElementById('chatDraft'), c = V.f.dmCamp && campaignById(V.f.dmCamp);
    if (d && c && d.value.trim() && d.value.indexOf('[' + c.name + ']') !== 0) d.value = '[' + c.name + '] ' + d.value.trim();
    sendMessage();
  };
  window.V8dm = function (brandId, cid) { if (brandId && brandId !== bid()) ui.brand = brandId; V.f.dmCamp = cid || ''; V8go('c-messages'); };
  window.V8brand = function (id, screen) { captureDraft(); ui.brand = id; LIVE.thread = null; V.f = {}; V.err = {}; V8go(screen || (V.screen === 'c-community' ? 'c-community' : V.screen), V.screen === 'c-community' ? V.id : ''); };

  /* ---------- 셸 ---------- */
  var LABEL = { 'c-tasks': '내 할 일', 'c-campaigns': '캠페인 둘러보기', 'c-rewards': '받을 보상', 'c-profile': '내 정보', 'c-announcements': '공지사항', 'c-community': '', 'c-ranking': '브랜드 랭킹', 'c-missions': '미션·배지', 'c-recruit': '캠페인 공지', 'c-work': '내 캠페인', 'c-messages': '브랜드 담당자', 'c-helpdesk': '도움말' };
  function navBtn(screen, ic, label, extra) {
    var cur = V.screen === screen && (screen !== 'c-community' || !extra) || (extra && V.screen === 'c-community' && V.id === extra);
    if (screen === 'c-rewards' && V.screen === 'c-profile') cur = true;
    var on = extra ? "V8openChannel('" + extra + "')" : "V8go('" + screen + "')";
    var unread = extra ? '' : '';
    return '<button type="button" class="v2-navbtn" onclick="' + on + '"' + (cur ? ' aria-current="page"' : '') + ' data-v5="">' + icon(ic) + '<span class="v5-lab">' + label + '</span>' + unread + '</button>';
  }
  /* 사이드 채널 메뉴: 공지 → 공지사항 화면, 자유대화·제품후기·질문은 바로, 콘텐츠팁·브랜드 추가 채널은 '더보기' 안 */
  function chNav(chUnread) {
    var l = chList(), top = ['chat', 'products', 'qna'], more = l.filter(function (c) { return c.key !== 'notice' && top.indexOf(c.key) < 0; });
    var openMore = V.more || (V.screen === 'c-community' && more.some(function (c) { return c.key === V.id; }));
    var notice = l.find(function (c) { return c.key === 'notice'; });
    return navBtn('c-announcements', 'megaphone', h(notice ? notice.name : '공지사항')) +
      top.map(function (k) { var c = l.find(function (x) { return x.key === k; }); return c ? navBtn('c-community', 'hash', h(c.name) + (k === 'chat' && chUnread ? ' <span class="badge-n">' + chUnread + '</span>' : ''), k) : ''; }).join('') +
      (more.length ? '<button type="button" class="v2-navbtn v2-moretoggle" onclick="V8toggle(\'more\')" aria-expanded="' + openMore + '" data-v5="">' + icon('chevron') + '<span class="v5-lab">제품·콘텐츠 더보기</span></button>' +
        (openMore ? more.map(function (c) { return '<button type="button" class="v2-navbtn v2-sub1" onclick="V8openChannel(\'' + a(c.key) + '\')"' + (V.screen === 'c-community' && V.id === c.key ? ' aria-current="page"' : '') + '># ' + h(c.name) + (c.visibility === 'readonly' ? ' <span class="small muted">읽기 전용</span>' : '') + '</button>'; }).join('') : '') : '');
  }
  function shell(content) {
    var bs = brandsLive(), b = currentBrand();
    if (V.screen !== V.last) { V.nav = false; V.rail = false; V.last = V.screen; }
    var todo = actionableOffers().length, x = brandXp(), lv = x === null ? '–' : levelInfo(x).l;
    var dm = b && dmCellFor(b.brandId), dmUnread = dm ? unreadCount(dm.cellId) : 0, chUnread = b && b.cellId ? unreadCount(b.cellId) : 0;
    var n = notifScoped(), nUnread = n ? n.unreadCount : 0;
    var curLabel = V.screen === 'c-community' ? '# ' + chLabel(V.id || 'chat') : V.screen === 'c-announcements' ? chLabel('notice') : LABEL[V.screen];
    var rail = '<nav class="v2-rail" aria-label="브랜드 선택"><button type="button" onclick="V8go(\'c-rewards\')" aria-label="내 공간" data-v5="">pr.</button>' +
      bs.map(function (v) { return '<button type="button" onclick="V8brand(\'' + a(v.brandId) + '\')" aria-label="' + a(v.name) + '"' + (b && b.brandId === v.brandId ? ' aria-current="true"' : '') + ' data-v5="">' + (v.logoUrl && /^https:\/\//.test(v.logoUrl) ? '<img src="' + a(v.logoUrl) + '" alt="" data-fbtext="' + a((v.name || v.brandId).slice(0, 1).toUpperCase()) + '" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">' : h((v.name || v.brandId).slice(0, 1).toUpperCase())) + '</button>'; }).join('') +
      '<button type="button" onclick="inviteDialog()" aria-label="브랜드 초대로 참여" data-v5="">' + icon('plus') + '</button><button type="button" onclick="V8go(\'c-profile\')" aria-label="설정" data-v5="">' + icon('gear') + '</button></nav>';
    var side = '<nav class="v2-side" aria-label="크리에이터 채널·메뉴"><div class="v2-ws"><b>' + h(b ? b.name : 'theprlist') + '</b><span class="small">' + (b ? '브랜드 커뮤니티 · 멤버 ' + h(b.memberCount || 0) : '크리에이터 워크스페이스') + '</span></div>' +
      navBtn('c-tasks', 'check', '내 할 일' + (todo ? ' <span class="badge-n" aria-label="할 일 ' + todo + '개">' + todo + '</span>' : '')) + navBtn('c-campaigns', 'compass', '캠페인 둘러보기') + navBtn('c-rewards', 'user', '내 공간') +
      '<p class="v2-grp">커뮤니티</p>' + chNav(chUnread) +
      navBtn('c-ranking', 'trophy', '브랜드 랭킹') + navBtn('c-missions', 'star', '미션·배지 Lv.' + lv) +
      '<p class="v2-grp">캠페인</p>' + navBtn('c-recruit', 'megaphone', '캠페인 공지') + navBtn('c-work', 'briefcase', '내 캠페인') +
      '<p class="v2-grp">다이렉트 메시지</p>' + navBtn('c-messages', 'chat', '브랜드 담당자' + (dmUnread ? ' <span class="badge-n">' + dmUnread + '</span>' : '')) +
      '<p class="v2-grp"></p>' + navBtn('c-helpdesk', 'help', '도움말') + '</nav>';
    var chat = V.screen === 'c-community';
    return '<div class="v2 v2-creator' + (V.nav ? ' nav-open' : '') + (V.rail ? ' rail-open' : '') + '" data-role-app="creator">' +
      '<div class="v2-top"><span class="v2-logo">theprlist</span><label class="v2-search hide-m"><span class="sr">검색</span><input type="text" placeholder="' + a((b ? b.name + ' 안에서' : '브랜드·캠페인') + ' 검색') + '" onfocus="this.blur();searchDialog()"></label><span class="v2-sp"></span><button type="button" class="v2-topbtn" onclick="V8go(\'c-helpdesk\')">이용안내</button><button type="button" class="v2-topbtn" onclick="notifications()" aria-label="알림 ' + nUnread + '건">알림' + (nUnread ? ' ' + nUnread : '') + '</button></div>' +
      '<div class="v2-mobilebar"><button type="button" class="btn" onclick="V8toggle(\'rail\')" aria-expanded="' + V.rail + '">브랜드 선택 ' + (V.rail ? '닫기' : '열기') + '</button><button type="button" class="btn pri" onclick="V8toggle(\'nav\')" aria-expanded="' + V.nav + '">채널·메뉴 ' + (V.nav ? '닫기' : '열기') + '</button><span class="small">지금: <b>' + h(curLabel) + '</b></span></div>' +
      '<div class="v2-body">' + rail + side + '<div class="v2-main' + (chat ? ' sp-chat' + (LIVE.thread || V.info ? ' sp-has-thread' : '') : '') + '" role="region" aria-label="' + a(curLabel) + '">' + content + '</div></div></div>';
  }
  var PAGES = { 'c-tasks': scTasks, 'c-campaigns': scCampaigns, 'c-rewards': scRewards, 'c-profile': scProfile, 'c-announcements': scAnnouncements, 'c-community': scCommunity, 'c-ranking': scRanking, 'c-missions': scMissions, 'c-recruit': scRecruit, 'c-work': scWork, 'c-messages': scMessages, 'c-helpdesk': scHelpdesk };

  /* ---------- 라우팅 (#/c-xxx[/id]) — 기존 navigate(page) 호출은 시안 화면으로 연결 ---------- */
  function pushHash(replace) { var u = '#/' + V.screen + (V.id ? '/' + encodeURIComponent(V.id) : ''); try { if (location.hash !== u) history[replace ? 'replaceState' : 'pushState'](null, '', u); } catch (e) {} }
  window.V8go = function (screen, id) {
    captureDraft();
    if (SCREENS.indexOf(screen) < 0) screen = 'c-tasks';
    if (screen !== 'c-community' && LIVE.thread) LIVE.thread = null;
    V.screen = screen; V.id = id || ''; V.err = {}; V.info = false; if (screen !== 'c-community') V.tab = 'msg';
    if (screen === 'c-profile' && !LIVE.notifPrefs && !LIVE.notifPrefsError) loadNotifPrefs();
    if (screen === 'c-ranking' || screen === 'c-missions') window.__v8xpRefresh();   // 화면에 들어올 때 서버 누적값으로 갱신
    if (screen === 'c-recruit') loadCampaignPosts(true);
    if (screen === 'c-community' || screen === 'c-announcements') { var cb = currentBrand(); if (cb && cb.cellId) loadChannels(cb.cellId, true); }
    ui.page = 'v8'; pushHash(); render(); try { var m = document.querySelector('.v2-main'); if (m && screen !== 'c-community') m.scrollTop = 0; } catch (e) {}
  };
  var LEGACY = { community: 'c-community', campaigns: 'c-campaigns', detail: 'c-campaigns', application: 'c-campaigns', applied: 'c-work', applicationstatus: 'c-work', work: 'c-work', collaboration: 'c-work', submission: 'c-work', messages: 'c-messages', space: 'c-rewards', settings: 'c-profile', ranking: 'c-ranking', achievements: 'c-missions', routes: 'c-helpdesk' };
  var PUBLIC = ['invite', 'login', 'checkemail', 'onboarding', 'join', 'welcome', 'state'];
  var baseNavigate = navigate;
  navigate = function (page, id) {
    if (LEGACY[page] && window.__ME) { if (page === 'community') return V8openChannel(V.screen === 'c-community' ? (V.id || 'chat') : (LIVE.open && !LIVE.open.dm ? LIVE.open.channel : 'chat')); return V8go(LEGACY[page], id || ''); }
    return baseNavigate(page, id);
  };
  function fromHash() {
    var m = /^#\/(c-[a-z]+)(?:\/(.+))?$/.exec(location.hash || '');
    if (m && SCREENS.indexOf(m[1]) >= 0) { V.screen = m[1]; V.id = m[2] ? decodeURIComponent(m[2]) : ''; ui.page = 'v8'; return true; }
    var legacy = /^#([a-z]+)(?:\/(.+))?$/.exec(location.hash || '');
    if (legacy && LEGACY[legacy[1]]) { V.screen = LEGACY[legacy[1]]; V.id = legacy[1] === 'community' ? 'chat' : (legacy[2] || ''); ui.page = 'v8'; return true; }
    return false;
  }
  window.addEventListener('popstate', function () { if (fromHash()) render(); });

  /* ---------- 입력값 보존 ---------- */
  document.addEventListener('input', function (e) { var t = e.target; if (t && t.dataset && t.dataset.v8f) { V.f[t.dataset.v8f] = t.type === 'checkbox' ? t.checked : t.value; if (V.err[t.dataset.v8f]) { delete V.err[t.dataset.v8f]; } } });
  document.addEventListener('change', function (e) { var t = e.target; if (t && t.dataset && t.dataset.v8f) { V.f[t.dataset.v8f] = t.type === 'checkbox' ? t.checked : t.value; if (t.tagName === 'SELECT') render(); } });
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && t.id === 'chatDraft' && e.key === 'Enter' && !e.shiftKey && !e.isComposing && document.querySelector('.v2-creator')) { e.preventDefault(); if (V.screen === 'c-messages') V8dmSend(); else sendMessage(); }
    if (e.key === 'Escape' && document.querySelector('.v2-creator')) { if (LIVE.thread) threadClose(); else if (V.info) V8toggle('info'); else if (V.nav || V.rail) { V.nav = V.rail = false; render(); } }
  });

  /* ---------- 렌더 진입점: 워크스페이스는 시안 셸, 그 외는 기존 화면 ---------- */
  function setMode(ws) {
    document.querySelectorAll('link[data-live-css]').forEach(function (l) { l.disabled = ws; });
    document.querySelectorAll('link[data-v8-css]').forEach(function (l) { l.disabled = !ws; });
    ['v5', 'v5-root', 'sp-proposal', 'v8-live'].forEach(function (c) { document.body.classList.toggle(c, ws); });
  }
  function workspace() {
    if (!LIVE.authKnown || LIVE.verifyState === 'verifying' || !window.__ME) return false;
    if (LIVE.profile && !LIVE.profile.onboarded) return false;
    if (PUBLIC.indexOf(ui.page) >= 0) return false;
    return true;
  }
  var baseRender = render;
  render = function () {
    if (!workspace()) { setMode(false); return baseRender.apply(this, arguments); }
    if (ui.page !== 'v8') { if (!fromHash()) { V.screen = LEGACY[ui.page] || 'c-tasks'; V.id = ui.page === 'community' ? 'chat' : (ui.campaign || ''); ui.page = 'v8'; pushHash(true); } }
    setMode(true);
    // 다른 브랜드 캠페인으로 바로 들어온 경우(제품 모아보기·알림 링크) 그 브랜드 공간으로 전환한다
    if ((V.screen === 'c-campaigns' || V.screen === 'c-work') && V.id) {
      var hit = (LIVE.campaigns || []).find(function (c) { return c.campaignId === V.id; }) || (LIVE.offers || []).find(function (o) { return o.campaignId === V.id; });
      if (hit && hit.brandId && hit.brandId !== bid() && brandsLive().some(function (x) { return x.brandId === hit.brandId; })) ui.brand = hit.brandId;
    }
    var root = document.getElementById('root');
    var feed = document.getElementById('messageFeed'), keepBottom = feed ? feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48 : true, feedTop = feed ? feed.scrollTop : 0;
    var main = document.querySelector('.v2-main'), mainTop = main ? main.scrollTop : 0, sameScreen = root.dataset.v8screen === V.screen + '|' + V.id;
    root.innerHTML = shell((PAGES[V.screen] || scTasks)());
    root.dataset.v8screen = V.screen + '|' + V.id;
    var nf = document.getElementById('messageFeed'); if (nf) nf.scrollTop = keepBottom ? nf.scrollHeight : feedTop;
    var nm = document.querySelector('.v2-main'); if (nm && sameScreen) nm.scrollTop = mainTop;
    Object.keys(V.err).forEach(function (k) { var el = document.getElementById(k); if (el) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', 'err-' + k); } });
  };
  // 첫 화면: 해시가 시안 화면이면 그대로, 기존 해시면 대응 화면으로
  fromHash();
  try { render(); } catch (e) {}
})();
