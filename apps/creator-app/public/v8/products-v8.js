/* products-v8.js — 독립 제품 모아보기(v8.1 products.html 화면)를 실제 공개 목록으로 렌더.
   - 데이터: GET /public/products (브랜드가 공개 표시한 제품만). 로그인 상태면 /me/campaigns 로 내 신청 상태를 함께 본다.
   - 신청은 커뮤니티 안 캠페인 상세에서 한다(멤버). 멤버가 아니면 기존 브랜드 초대 화면으로 간다.
   - '저장'은 이 기기에만 남는 편의 기능이다. 관심 등록 서버 기능은 아직 없어 표시하지 않는다. */
(function () {
  'use strict';
  var h = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var API = (function () {
    try { var q = new URLSearchParams(location.search).get('api'); if (q && local) localStorage.setItem('CONNECTION_API_URL', q); } catch (e) {}
    try { return local ? (localStorage.getItem('CONNECTION_API_URL') || 'http://localhost:8000') : 'https://api.theprlist.net'; } catch (e) { return local ? 'http://localhost:8000' : 'https://api.theprlist.net'; }
  })();
  var JWT = (function () { try { return localStorage.getItem('CONNECTION_JWT') || ''; } catch (e) { return ''; } })();
  function req(path, auth) { return fetch(API + path, { headers: auth && JWT ? { Authorization: 'Bearer ' + JWT } : {}, credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); }); }
  var CTRY = { KR: '한국', TH: '태국', US: '미국', VN: '베트남', JP: '일본' };
  var S = { list: null, total: 0, next: null, more: false, facets: { categories: [], brands: [] }, err: false, mine: {}, member: {}, appliedPids: [], f: { q: '', brand: '', cat: '', ctry: '', rtype: '', view: 'all', can: false }, ver: 0 };
  var saved = (function () { try { return JSON.parse(localStorage.getItem('PRODUCTS_SAVED') || '[]'); } catch (e) { return []; } })();
  function keep() { try { localStorage.setItem('PRODUCTS_SAVED', JSON.stringify(saved)); } catch (e) {} }
  var P = { bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2', chat: 'M4 5h16v11H9l-5 4z' };
  function icon(k) { return '<svg class="v5-ic " width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + P[k] + '"/></svg>'; }
  function mono(name) { var l = h((name || '?').slice(0, 1).toUpperCase()); return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#f3eff6"/><text x="32" y="42" font-size="26" text-anchor="middle" fill="#695177" font-family="sans-serif">' + l + '</text></svg>'); }
  function reward(c) {
    if (c.rewardType === 'affiliate') return '판매 보상(판매금액의 ' + (c.affiliatePct != null ? c.affiliatePct + '%' : '— ') + ')';
    if (c.rewardType === 'paid') return '고정비' + (c.rewardAmount != null ? ' ' + ((c.rewardCurrency || 'KRW') === 'KRW' ? Number(c.rewardAmount).toLocaleString('ko-KR') + '원' : Number(c.rewardAmount).toLocaleString('en-US') + ' ' + c.rewardCurrency) : ' (금액 브랜드 안내 대기)');
    if (c.rewardType === 'gifted') return '제품 제공 (금액 보상 없음)';
    return '브랜드 안내 대기';
  }
  var RT = { affiliate: 'affiliate', paid: 'ugc', gifted: 'sample' };
  function inviteUrl(p) { return '/?brand=' + encodeURIComponent(p.brandId) + '&product=' + encodeURIComponent(p.productId); }
  function campUrl(c) { return '/#/c-campaigns/' + encodeURIComponent(c.campaignId); }
  function applied(p) { return p.campaigns.some(function (c) { return S.mine[c.campaignId] && S.mine[c.campaignId] !== 'none'; }); }
  function filtered() { return S.list || []; }  // 필터·페이지는 서버(/public/products)에서 처리
  function card(p) {
    var cs = p.campaigns, open = cs.length, isApplied = applied(p), member = !!S.member[p.brandId];
    var countries = []; cs.forEach(function (c) { (c.countries || []).forEach(function (k) { if (countries.indexOf(k) < 0) countries.push(k); }); });
    var primary = !open ? '<a class="btn" href="' + h(inviteUrl(p)) + '">브랜드 커뮤니티 참여</a>' : isApplied ? '<button type="button" class="btn" disabled>신청함</button>' : member ? '<a class="btn pri" href="' + h(campUrl(cs[0])) + '">조건 보고 신청</a>' : '<a class="btn pri" href="' + h(inviteUrl(p)) + '">브랜드 참여 후 신청</a>';
    return '<li class="v6-pcard" data-pid="' + h(p.productId) + '"><div class="v6-ptop"><img class="v6-pimg" width="56" height="56" src="' + h(p.imageUrl || mono(p.name)) + '" data-fb="' + h(mono(p.name)) + '" alt="' + h(p.name) + ' 이미지" loading="lazy" referrerpolicy="no-referrer"><div class="v6-grow"><span class="v6-meta">' + h(p.brandName) + '</span><h3>' + h(p.name) + '</h3><div>' + (open ? '<span class="chip ok">모집 중' + (open > 1 ? ' ' + open + '개' : '') + '</span>' : '<span class="chip ">모집 없음</span>') + (isApplied ? ' <span class="chip info">신청함</span>' : '') + (member ? ' <span class="chip ">참여 중인 브랜드</span>' : '') + '</div></div></div>' +
      '<dl class="v6-kv"><dt>신청 국가</dt><dd>' + h(countries.map(function (k) { return CTRY[k] || k; }).join(', ') || (open ? '국가 제한 없음' : '—')) + '</dd><dt>보상</dt><dd>' + h(open ? cs.map(reward).join(' / ') : '모집 조건 없음 · 보상 정보 없음') + '</dd><dt>콘텐츠</dt><dd>' + h(open ? cs.map(function (c) { return (c.conditions || []).join(' · ') || '브랜드 안내 대기'; }).join(' / ') : '—') + '</dd><dt>마감</dt><dd>' + h(open ? cs.map(function (c) { return c.deadline || '별도 안내'; }).join(', ') : '—') + '</dd></dl>' +
      '<div class="v6-actions">' + primary + '<button type="button" class="btn ghost" data-detail="' + h(p.productId) + '">상세</button><button type="button" class="btn ghost" data-save="' + h(p.productId) + '" aria-pressed="' + (saved.indexOf(p.productId) >= 0) + '">' + (saved.indexOf(p.productId) >= 0 ? '저장됨' : '저장') + '</button></div></li>';
  }
  function opt(v, l, cur) { return '<option value="' + h(v) + '"' + (cur === v ? ' selected' : '') + '>' + h(l) + '</option>'; }
  function render() {
    var f = S.f, list = S.list || [];
    var brands = (S.facets.brands || []).map(function (b) { return [b.brandId, b.name]; }), cats = S.facets.categories || [];
    var res = filtered();
    var body = S.err ? '<div class="v6-empty" role="alert"><b>제품 목록을 불러오지 못했어요.</b><p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p><button type="button" class="btn" data-act="reload">다시 불러오기</button></div>' :
      !S.list ? '<div class="v6-empty" role="status">불러오는 중…</div>' :
      '<p class="v6-count" id="v6pf-count" aria-live="polite">결과 ' + S.total + '개' + (res.length < S.total ? ' · ' + res.length + '개 표시' : '') + '</p>' + (res.length ? '<ul class="v6-pgrid">' + res.map(card).join('') + '</ul>' + (S.next != null ? '<div class="v6-actions"><button type="button" class="btn" data-act="more"' + (S.more ? ' disabled' : '') + '>' + (S.more ? '불러오는 중…' : '더 보기') + '</button></div>' : '') : '<div class="v6-empty">' + (S.filtered ? '조건에 맞는 제품이 없어요. <button type="button" class="btn" data-act="reset">필터 초기화</button>' : '아직 공개된 제품이 없어요.') + '</div>');
    var focused = document.activeElement && document.activeElement.id, caret = null;
    try { caret = focused === 'v6pf-q' ? document.activeElement.selectionStart : null; } catch (e) {}
    document.getElementById('stage').innerHTML = '<div class="catalog"><header class="catalog-top"><a class="catalog-logo" href="/">THEPRLIST</a><nav class="catalog-nav" aria-label="전역 메뉴"><a href="/products/" aria-current="page">' + icon('bag') + '<span>제품 모아보기</span></a><a href="/">' + icon('chat') + '<span>내 커뮤니티</span></a></nav><span class="catalog-sp"></span></header>' +
      '<div class="catalog-main" role="region" aria-label="제품 모아보기"><div class="v6 v6-market"><div class="v6-head"><div class="v6-head-t"><h1>제품 모아보기 </h1><p class="v6-sub">브랜드가 공개한 제품을 한 목록으로 봐요. 모집 중이면 조건을 보고 신청하고, 모집이 없으면 브랜드 커뮤니티에 참여할 수 있어요.</p></div></div>' +
      '<p class="v6-note v6-meta">브랜드가 공개 표시한 제품만 보여요 (비공개·초안·정지 브랜드 제외). ‘저장’은 이 기기에만 남아요.</p>' +
      '<div class="v6-filters" role="search"><div class="v6-field v6-q"><label for="v6pf-q">검색 (제품명·브랜드)</label><input id="v6pf-q" type="text" data-f="q" value="' + h(f.q) + '"></div>' +
      '<div class="v6-field"><label for="v6pf-brand">브랜드</label><select id="v6pf-brand" data-f="brand">' + opt('', '전체 브랜드', f.brand) + brands.map(function (b) { return opt(b[0], b[1], f.brand); }).join('') + '</select></div>' +
      '<div class="v6-field"><label for="v6pf-cat">분야</label><select id="v6pf-cat" data-f="cat">' + opt('', '전체', f.cat) + cats.map(function (c) { return opt(c, c, f.cat); }).join('') + '</select></div>' +
      '<div class="v6-field"><label for="v6pf-ctry">신청 국가</label><select id="v6pf-ctry" data-f="ctry">' + opt('', '전체', f.ctry) + Object.keys(CTRY).map(function (k) { return opt(k, CTRY[k], f.ctry); }).join('') + '</select></div>' +
      '<div class="v6-field"><label for="v6pf-rtype">보상 방식</label><select id="v6pf-rtype" data-f="rtype">' + opt('', '전체', f.rtype) + opt('affiliate', '판매 보상', f.rtype) + opt('ugc', '고정비 (유료 UGC)', f.rtype) + opt('sample', '샘플 (제품 제공)', f.rtype) + '</select></div>' +
      '<div class="v6-field"><label for="v6pf-view">보기</label><select id="v6pf-view" data-f="view">' + opt('all', '전체 제품', f.view) + opt('saved', '저장한 제품', f.view) + (JWT ? opt('applied', '신청한 제품', f.view) : '') + '</select></div>' +
      '<label class="v6-inline"><input type="checkbox" id="v6pf-can" data-f="can"' + (f.can ? ' checked' : '') + '> 신청 가능만</label><button type="button" class="btn " data-act="reset">초기화</button></div>' + body + '</div></div></div>';
    if (focused) { var el = document.getElementById(focused); if (el) { el.focus(); try { if (caret != null) el.setSelectionRange(caret, caret); } catch (e) {} } }
  }
  // 공개 이미지가 열리지 않으면 중립 모노그램으로 바꾼다(가짜 제품 사진 없음)
  document.addEventListener('error', function (e) { var t = e.target; if (t && t.tagName === 'IMG' && t.dataset && t.dataset.fb && t.src !== t.dataset.fb) t.src = t.dataset.fb; }, true);
  function sheet(p) {
    var el = document.getElementById('pd-sheet'), sc = document.getElementById('pd-scrim');
    el.innerHTML = '<h2 id="pd-sheet-title">' + h(p.name) + '</h2><p class="v6-meta">' + h(p.brandName) + (p.category ? ' · ' + h(p.category) : '') + '</p><img class="v6-pimg" width="96" height="96" src="' + h(p.imageUrl || mono(p.name)) + '" data-fb="' + h(mono(p.name)) + '" alt="' + h(p.name) + ' 이미지" referrerpolicy="no-referrer"><p>' + h(p.summary) + '</p>' +
      (p.campaigns.length ? '<h3>모집 중인 캠페인</h3><ul class="v6-list">' + p.campaigns.map(function (c) { return '<li class="v6-row"><div class="v6-grow"><b>' + h(c.name) + '</b><span class="v6-meta">' + h(reward(c)) + ' · ' + h((c.countries || []).map(function (k) { return CTRY[k] || k; }).join(', ') || '국가 제한 없음') + ' · 마감 ' + h(c.deadline || '별도 안내') + '</span></div></li>'; }).join('') + '</ul>' : '<p class="v6-meta">지금 모집 중인 캠페인은 없어요.</p>') +
      '<div class="v6-actions"><button type="button" class="btn" data-act="close">닫기</button></div>';
    el.hidden = false; sc.hidden = false; var b = el.querySelector('[data-act="close"]'); if (b) b.focus();
    S.sheetFrom = p.productId;
  }
  function closeSheet() { document.getElementById('pd-sheet').hidden = true; document.getElementById('pd-scrim').hidden = true; var back = S.sheetFrom && document.querySelector('[data-detail="' + S.sheetFrom + '"]'); if (back) back.focus(); }
  var qTimer = null;
  document.addEventListener('input', function (e) { var k = e.target.dataset && e.target.dataset.f; if (k === 'q') { S.f.q = e.target.value; clearTimeout(qTimer); qTimer = setTimeout(function () { fetchPage(true); }, 250); } });
  document.addEventListener('change', function (e) { var k = e.target.dataset && e.target.dataset.f; if (k && k !== 'q') { S.f[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; fetchPage(true); } });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) { if (e.target.id === 'pd-scrim') closeSheet(); return; }
    if (t.dataset.act === 'reset') { S.f = { q: '', brand: '', cat: '', ctry: '', rtype: '', view: 'all', can: false }; fetchPage(true); }
    if (t.dataset.act === 'reload') load();
    if (t.dataset.act === 'more') fetchPage(false);
    if (t.dataset.act === 'close') closeSheet();
    if (t.dataset.detail) { var p = (S.list || []).find(function (x) { return x.productId === t.dataset.detail; }); if (p) sheet(p); }
    if (t.dataset.save) { var id = t.dataset.save, i = saved.indexOf(id); if (i < 0) saved.push(id); else saved.splice(i, 1); keep(); if (S.f.view === 'saved') fetchPage(true); else render(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !document.getElementById('pd-sheet').hidden) closeSheet(); });
  function query(offset) {
    var f = S.f, p = new URLSearchParams();
    if (f.q.trim()) p.set('q', f.q.trim()); if (f.brand) p.set('brand', f.brand); if (f.cat) p.set('category', f.cat);
    if (f.ctry) p.set('country', f.ctry); if (f.rtype) p.set('reward', f.rtype); if (f.can) p.set('can', 'true');
    if (f.view === 'saved') p.set('ids', saved.join(',') || '00000000-0000-0000-0000-000000000000');
    if (f.view === 'applied') p.set('ids', S.appliedPids.join(',') || '00000000-0000-0000-0000-000000000000');
    p.set('offset', String(offset)); p.set('limit', '60');
    S.filtered = !!(f.q.trim() || f.brand || f.cat || f.ctry || f.rtype || f.can || f.view !== 'all');
    return '/public/products?' + p.toString();
  }
  function fetchPage(reset) {
    var ver = ++S.ver, offset = reset ? 0 : (S.next || 0);
    if (reset) { S.list = null; S.err = false; } else S.more = true;
    render();
    req(query(offset)).then(function (r) {
      if (ver !== S.ver) return;
      S.list = (reset ? [] : (S.list || [])).concat(r.items || []); S.total = r.total || 0; S.next = r.nextOffset; S.facets = r.facets || S.facets; S.more = false; render();
    }).catch(function () { if (ver !== S.ver) return; S.more = false; if (reset) S.err = true; else toast('더 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'); render(); });
  }
  function toast(m) { var t = document.getElementById('toast'); if (!t) return; t.textContent = m; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function load() {
    fetchPage(true);
    if (JWT) {
      req('/me/campaigns', true).then(function (cs) { (cs || []).forEach(function (c) { var st = c.termsState || c.myStatus; S.mine[c.campaignId] = st; S.member[c.brandId] = true; if (st && st !== 'none' && c.productId && S.appliedPids.indexOf(c.productId) < 0) S.appliedPids.push(c.productId); }); render(); }).catch(function () {});
      req('/me/memberships', true).then(function (ms) { (ms || []).forEach(function (m) { S.member[m.brandId] = true; }); render(); }).catch(function () {});
    }
  }
  load();
})();
