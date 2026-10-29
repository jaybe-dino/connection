/* console-v8.js — v8.1 승인 시안(docs/ui-reference/v8.1)의 브랜드 콘솔을 실서비스 데이터로 렌더한다.

   - 마크업·클래스는 시안 DOM(campaign-v6.js 브랜드 화면)과 같게, 스타일은 v8-kit.css(시안 CSS 생성본).
   - 데이터·동작은 실제 API만 쓴다(같은 JWT·같은 브랜드 경계). 예시 데이터·로컬 저장 체험·가짜 성공 없음.
     서버에 없는 기능은 '준비 중'·'미연동'으로 그대로 보인다.
   - 로그아웃·크리에이터 계정·브랜드 미선택 관리자·로그인/OTP/초대 화면은 기존 engine-live 화면을 그대로 쓴다.
   - 결제(카드 등록·청구서 결제)는 감사된 engine-live 의 billingCardHtml/billingInvoicesHtml 을 그대로 쓴다.
   - 브랜드가 바뀌거나 세션이 바뀌면 화면 상태·입력 초안·불러온 데이터를 전부 버린다(다른 브랜드로 새지 않음). */
(function () {
  'use strict';
  if (window.__SURFACE !== 'brand' || window.__C8) return;
  var h = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var a = function (s) { return h(s).replace(/`/g, '&#96;'); };
  var js = function (s) { return a(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); };

  /* ---------- 아이콘 (시안 design-v5.js 와 같은 경로) ---------- */
  var P = {
    home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z', book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5',
    box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10', chat: 'M4 5h16v11H9l-5 4z', mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
    team: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 20a5 5 0 0 0-4-5', card: 'M3 6h18v12H3zM3 10h18M7 15h4',
    plus: 'M12 5v14M5 12h14'
  };
  function icon(k) { return '<svg class="v5-ic " width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + P[k] + '"/></svg>'; }

  /* ---------- API (engine-live 와 같은 주소·같은 인증 헤더) ---------- */
  var API = window.__API_URL || 'https://api.theprlist.net';
  function jwt() { try { return localStorage.getItem('CONNECTION_JWT') || ''; } catch (e) { return ''; } }
  function headers(extra) {
    var o = extra || {};
    try { var ak = localStorage.getItem('CONNECTION_ADMIN_KEY'); if (ak) o['X-Admin-Key'] = ak; } catch (e) {}
    var t = jwt(); if (t) o.Authorization = 'Bearer ' + t;
    return o;
  }
  function req(method, path, body, raw) {
    if (/\/brands\/(null|undefined)?\//.test(path)) return Promise.reject(new Error('브랜드를 먼저 선택하세요'));
    var opt = { method: method, headers: headers(raw ? { 'Content-Type': raw.type } : { 'Content-Type': 'application/json' }) };
    if (raw) opt.body = raw.body; else if (body !== undefined && body !== null) opt.body = JSON.stringify(body);
    return fetch(API + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(typeof d.detail === 'string' ? d.detail : (d.detail && d.detail.message) || '요청을 처리하지 못했어요 (' + r.status + ')'); e.status = r.status; e.detail = d.detail; throw e; }
        return d;
      });
    });
  }
  function imgSrc(u) { u = String(u || ''); if (/^https:\/\//.test(u)) return u; if (/^\/public\/product-images\/[0-9a-f-]{36}(\?e=\d+&s=[0-9a-f]{32})?$/.test(u)) return API + u; return ''; }

  /* ---------- 신원·브랜드 경계 ---------- */
  function me() { return window.__ME || null; }
  function bid() {
    var m = me(); if (!m) return null;
    if (m.kind === 'brand') return m.brandId || null;
    if (m.kind === 'admin') { try { return localStorage.getItem('CONNECTION_ADMIN_BRAND') || null; } catch (e) { return null; } }
    return null;
  }
  function active() { var m = me(); return !!(m && bid() && (m.kind === 'brand' || m.kind === 'admin') && m.otp !== 'pending'); }

  /* ---------- 상태 ---------- */
  var D = null;           // 브랜드·세션별 데이터 — 키가 바뀌면 통째로 버린다
  var U = null;           // 화면·입력 상태 — 같은 규칙
  function fresh() {
    D = { key: (bid() || '') + '|' + jwt(), bid: bid(), err: {}, busy: {}, apps: {}, dm: {}, unread: {}, threads: {}, cand: {}, seq: {}, ver: 0 };
    U = { screen: U && U.screen || 'b-today', id: U && U.screen ? U.id : '', nav: false, rail: false, pop: false, f: {}, err: {}, busy: {}, tab: {}, wiz: 1, mail: 1, sel: [], lists: [], init: {}, flash: '' };
  }
  function ensure() { if (!D || D.key !== (bid() || '') + '|' + jwt()) { fresh(); route(true); } }
  var SCREENS = ['b-today', 'b-learning', 'b-campaigns', 'b-create', 'b-products', 'b-applicants', 'b-samples', 'b-community', 'b-mailconnect', 'b-invite', 'b-mailprep', 'b-reply', 'b-sendlog', 'b-team', 'b-billing', 'b-results'];
  var MENU = [
    { label: '홈', ic: 'home', screens: [['b-today', '홈']] },
    { label: '브랜드 학습', ic: 'book', screens: [['b-learning', '브랜드 학습']] },
    { label: '캠페인 관리', ic: 'box', screens: [['b-campaigns', '캠페인 관리'], ['b-create', '새 캠페인'], ['b-products', '제품 라이브러리'], ['b-applicants', '지원자'], ['b-samples', '샘플·영상']] },
    { label: '커뮤니티·DM', ic: 'chat', screens: [['b-community', '커뮤니티·DM']] },
    { label: '아웃리치·인박스', ic: 'mail', screens: [['b-mailconnect', '이메일 연결'], ['b-invite', '받는 사람 찾기'], ['b-mailprep', '메일 작성·검수'], ['b-reply', '회신함'], ['b-sendlog', '발송 로그']] },
    { label: '팀', ic: 'team', screens: [['b-team', '팀']] },
    { label: '월별 청구', ic: 'card', screens: [['b-billing', '청구'], ['b-results', '비용·결과']] }
  ];
  function menuOf(s) { return MENU.find(function (m) { return m.screens.some(function (x) { return x[0] === s; }); }) || MENU[0]; }

  /* ---------- 불러오기 (브랜드·세션이 바뀐 뒤 도착한 응답은 버린다) ---------- */
  var PATHS = {
    identity: function (b) { return '/brands/' + b + '/identity'; }, camps: function (b) { return '/brands/' + b + '/campaigns'; },
    prods: function (b) { return '/brands/' + b + '/products'; }, profile: function (b) { return '/brands/' + b + '/profile/learned'; },
    team: function (b) { return '/brands/' + b + '/team'; }, gmail: function (b) { return '/brands/' + b + '/gmail'; },
    inbox: function (b) { return '/brands/' + b + '/inbox'; }, outreach: function (b) { return '/brands/' + b + '/outreach'; },
    cells: function () { return '/community/my-cells'; }, members: function (b) { return '/brands/' + b + '/members'; },
    notifs: function () { return '/me/notifications?limit=20'; }
  };
  /* 자원별 요청 번호 — 늦게 도착한 이전 응답이 더 최신 데이터(또는 쓰기 결과)를 덮지 못한다 */
  function nextSeq(name) { D.seq[name] = (D.seq[name] || 0) + 1; return D.seq[name]; }
  function load(name, force) {
    ensure();
    if (!force && (D[name] !== undefined || D.busy[name])) return;
    var key = D.key, b = D.bid, n = nextSeq(name), latest = function () { return D && D.key === key && D.seq[name] === n; };
    D.busy[name] = true;
    return req('GET', PATHS[name](b)).then(function (r) { if (!latest()) return; D[name] = r; delete D.err[name]; })
      .catch(function (e) { if (!latest()) return; D.err[name] = e.message || '불러오지 못했어요'; if (D[name] === undefined) D[name] = null; })
      .then(function () { if (latest()) { D.busy[name] = false; paint(); } });
  }
  /* 쓰기 응답으로 목록 한 항목을 바로 바꾼다 — 진행 중인 이전 조회 응답은 버린다 */
  function putItem(name, idKey, item) {
    if (!item || !Array.isArray(D[name])) return;
    nextSeq(name); D.busy[name] = false;
    var i = D[name].findIndex(function (x) { return x[idKey] === item[idKey]; });
    if (i >= 0) D[name][i] = item; else D[name].push(item);
  }
  function need() { for (var i = 0; i < arguments.length; i++) load(arguments[i]); }
  function loaded() { for (var i = 0; i < arguments.length; i++) if (D[arguments[i]] === undefined || (D[arguments[i]] === null && D.busy[arguments[i]])) return false; return true; }
  /* 캠페인별 지원자 — 홈·지원자·샘플·결과가 같은 데이터를 쓴다 */
  function loadApps(cid, force) {
    if (!force && (D.apps[cid] !== undefined || D.busy['a:' + cid])) return;
    var key = D.key, n = nextSeq('a:' + cid), latest = function () { return D.key === key && D.seq['a:' + cid] === n; };
    D.busy['a:' + cid] = true;
    return req('GET', '/brands/' + D.bid + '/campaigns/' + encodeURIComponent(cid) + '/applicants').then(function (r) { if (latest()) D.apps[cid] = r; })
      .catch(function (e) { if (latest()) { D.apps[cid] = null; D.err['a:' + cid] = e.message; } })
      .then(function () { if (latest()) { D.busy['a:' + cid] = false; paint(); } });
  }
  function camps() { return Array.isArray(D.camps) ? D.camps : []; }
  function prods() { return Array.isArray(D.prods) ? D.prods : []; }
  function campById(id) { return camps().find(function (c) { return c.campaignId === id; }) || null; }
  function prodById(id) { return prods().find(function (p) { return p.productId === id; }) || null; }
  function allApps() { camps().forEach(function (c) { if (c.lifecycle !== 'draft') loadApps(c.campaignId); }); var out = []; camps().forEach(function (c) { (D.apps[c.campaignId] || []).forEach(function (x) { out.push({ c: c, x: x }); }); }); return out; }
  function appsReady() { return camps().filter(function (c) { return c.lifecycle !== 'draft'; }).every(function (c) { return D.apps[c.campaignId] !== undefined; }); }

  /* ---------- 실시간 갱신 (engine-live 폴러와 같은 규칙: 숨김 중단·복귀 즉시·단일 비행·오류 backoff·stale 무시) ---------- */
  var poll = { t: null, busy: false, fail: 0, wired: false };
  function pollSchedule() { if (poll.t) clearTimeout(poll.t); poll.t = setTimeout(pollTick, Math.min(8000 * Math.pow(2, poll.fail), 60000)); }
  function pollTick() {
    if (poll.busy) return pollSchedule();
    if (document.hidden || !active()) return;
    ensure(); poll.busy = true;
    var key = D.key, changed = false;
    var work = req('GET', '/me/unread').then(function (u) {
      if (D.key !== key) return; var next = {}; (u || []).forEach(function (x) { next[x.cellId] = x; });
      if (JSON.stringify(next) !== JSON.stringify(D.unread)) { D.unread = next; changed = true; }
    }).then(function () {
      var cell = U.dmSel; if (!cell || U.screen !== 'b-community') return;
      return req('GET', '/community/cells/' + encodeURIComponent(cell) + '/messages?limit=200').then(function (rows) {
        if (D.key !== key || U.dmSel !== cell) return;
        if (JSON.stringify(rows) !== JSON.stringify(D.dm[cell])) { D.dm[cell] = rows; changed = true; markRead(cell, rows); }
      });
    });
    return work.then(function () { poll.fail = 0; }, function () { poll.fail = Math.min(poll.fail + 1, 4); })
      .then(function () { poll.busy = false; if (changed) paint(); pollSchedule(); });
  }
  function pollStart() {
    if (!poll.wired) { poll.wired = true; document.addEventListener('visibilitychange', function () { if (document.hidden) { if (poll.t) clearTimeout(poll.t); } else { poll.fail = 0; pollTick(); } }); }
    pollSchedule();
  }
  function markRead(cell, rows) {
    var max = 0; (rows || []).forEach(function (m) { if (m.msgId > max) max = m.msgId; });
    if (max) req('POST', '/community/cells/' + encodeURIComponent(cell) + '/read', { last_msg_id: max }).then(function () { if (D.unread[cell]) { delete D.unread[cell]; paint(); } }).catch(function () {});
  }

  /* ---------- 공통 조각 ---------- */
  var CTRY = { US: '미국', TH: '태국', VN: '베트남', JP: '일본', KR: '한국' };
  var ctryText = function (arr) { return (arr || []).map(function (c) { return CTRY[c] || c; }).join(', ') || '—'; };
  var GOAL = { affiliate: 'TikTok Shop 판매 연결 (어필리에이트)', ugc: '유료 UGC', sample: '샘플 협업' };
  var GOAL_OF = { affiliate: 'affiliate', paid: 'ugc', gifted: 'sample' };
  var RT_OF = { affiliate: 'affiliate', ugc: 'paid', sample: 'gifted' };
  var PLATFORM = { tiktok: 'TikTok', instagram: 'Instagram' };
  var PST = { applied: '신청', rejected: '미선정', selected: '선정 · 합의 대기', terms_agreed: '조건 합의', sample_shipped: '샘플 배송', content_submitted: '영상 제출', revision_requested: '수정 요청', completed: '검수 완료', declined: '크리에이터 거절' };
  var PST_TONE = { applied: 'info', rejected: 'err', selected: 'ok', terms_agreed: 'ok', sample_shipped: 'warn', content_submitted: 'warn', revision_requested: 'warn', completed: 'ok', declined: 'err' };
  function st(x) { return x.termsState || (x.status === 'rejected' ? 'rejected' : 'applied'); }
  function chip(t, tone) { return '<span class="chip ' + (tone || '') + '">' + t + '</span>'; }
  function btn(label, on, cls, extra) { return '<button type="button" class="btn ' + (cls || '') + '" onclick="' + a(on) + '"' + (extra || '') + '>' + label + '</button>'; }
  function money(n, cur) { if (n == null || n === '') return ''; cur = cur || 'KRW'; return cur === 'KRW' ? Number(n).toLocaleString('ko-KR') + '원' : Number(n).toLocaleString('en-US') + ' ' + cur; }
  function today() { try { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function brandName() { var i = D.identity; return (i && i.name) || D.bid; }
  function initials(n) { return String(n || '?').trim().slice(0, 1).toUpperCase(); }
  function ctxHead(title, sub, badges) {
    return '<div class="v6-head"><div class="v6-head-t"><p class="v6-ctx">' + h(brandName()) + (me().kind === 'admin' ? ' · 관리자 브랜드 콘솔' : '') + '</p><h1>' + title + ' ' + (badges || '') + '</h1>' + (sub ? '<p class="v6-sub">' + sub + '</p>' : '') + '</div></div>';
  }
  function mono(label) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#f3eff6"/><text x="32" y="42" font-size="26" text-anchor="middle" font-family="sans-serif" fill="#5b4466">' + initials(label).replace(/[<&>"]/g, '') + '</text></svg>'); }
  function prodImage(p) { if (!p) return ''; var m = (p.images || []).find(function (i) { return i.slot === 'main'; }); return imgSrc(m && m.url) || imgSrc(p.publicImageUrl) || ''; }
  function pimg(p, size, label) {
    var name = (p && p.name) || label || '제품', fb = mono(name), src = prodImage(p) || fb;
    return '<img class="v6-pimg" width="' + size + '" height="' + size + '" src="' + a(src) + '" data-fb="' + a(fb) + '" alt="' + a(name + ' 이미지') + '" referrerpolicy="no-referrer">';
  }
  document.addEventListener('error', function (e) {
    var t = e.target; if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.fb) return;
    // 서명 URL 만료 가능성 → 제품 목록을 한 번 다시 받아 새 서명 URL 로(1분에 한 번)
    if (/\/public\/product-images\/.+\?e=/.test(t.src) && D && Date.now() - (D.imgRetry || 0) > 60000) { D.imgRetry = Date.now(); load('prods', true); }
    if (t.src !== t.dataset.fb) t.src = t.dataset.fb;
  }, true);
  function loading(what) { return '<div class="v6-empty" role="status">' + (what || '') + ' 불러오는 중…</div>'; }
  function failBox(name, what) { return '<div class="v6-empty" role="alert"><b>' + what + '을(를) 불러오지 못했어요.</b><p>' + h(D.err[name] || '') + ' — 0건이 아니에요.</p>' + btn('다시 불러오기', "C8.reload('" + name + "')") + '</div>'; }
  function errOf(k) { return U.err[k] ? '<p class="ferr" id="err-' + a(k) + '" role="alert">' + h(U.err[k]) + '</p>' : ''; }
  function fid(k) { return 'f-' + String(k).replace(/[^a-zA-Z0-9]/g, '-'); }
  function fv(k, d) { return U.f[k] !== undefined ? U.f[k] : (d === undefined ? '' : d); }
  function inv(k) { return U.err[k] ? ' aria-invalid="true" aria-describedby="err-' + a(k) + '"' : ''; }
  function inp(label, k, o) {
    o = o || {};
    var req_ = o.req ? '<span class="req">필수</span>' : (o.opt ? '<span class="opt">선택</span>' : ''), id = fid(k), v = fv(k, o.value);
    var ctl = o.area ? '<textarea id="' + id + '" data-f="' + a(k) + '"' + inv(k) + ' placeholder="' + a(o.ph || '') + '"' + (o.max ? ' maxlength="' + o.max + '"' : '') + (o.ro ? ' readonly' : '') + '>' + h(v) + '</textarea>'
      : '<input id="' + id + '" type="' + (o.type || 'text') + '" data-f="' + a(k) + '" value="' + a(v) + '"' + inv(k) + ' placeholder="' + a(o.ph || '') + '"' + (o.max ? ' maxlength="' + o.max + '"' : '') + (o.ro ? ' readonly' : '') + '>';
    return '<div class="v6-field' + (o.wide ? ' v6-wide' : '') + '"><label for="' + id + '">' + label + req_ + '</label>' + ctl + (o.hint ? '<span class="hint">' + o.hint + '</span>' : '') + errOf(k) + '</div>';
  }
  function sel(label, k, opts, o) {
    o = o || {}; var id = fid(k), v = fv(k, o.value);
    return '<div class="v6-field' + (o.wide ? ' v6-wide' : '') + '"><label for="' + id + '">' + label + (o.req ? '<span class="req">필수</span>' : '') + '</label><select id="' + id + '" data-f="' + a(k) + '"' + (o.live ? ' data-live' : '') + inv(k) + '>' +
      opts.map(function (x) { return '<option value="' + a(x[0]) + '"' + (String(v) === String(x[0]) ? ' selected' : '') + '>' + h(x[1]) + '</option>'; }).join('') + '</select>' + (o.hint ? '<span class="hint">' + o.hint + '</span>' : '') + errOf(k) + '</div>';
  }
  function checks(label, k, opts, o) {
    o = o || {}; var v = fv(k, o.value || []);
    return '<fieldset class="v6-field v6-fs' + (o.wide ? ' v6-wide' : '') + '"' + (U.err[k] ? ' aria-describedby="err-' + a(k) + '"' : '') + '><legend>' + label + (o.req ? '<span class="req">필수</span>' : '') + '</legend><div class="v6-checks">' +
      opts.map(function (x) { return '<label><input type="checkbox" data-farr="' + a(k) + '" value="' + a(x[0]) + '"' + (v.indexOf(x[0]) >= 0 ? ' checked' : '') + '> ' + h(x[1]) + '</label>'; }).join('') + '</div>' + errOf(k) + '</fieldset>';
  }
  function tabs(g, items, def) {
    var cur = U.tab[g] || def || items[0][0];
    return { cur: cur, html: '<div class="v6-tabs" role="tablist">' + items.map(function (x) { return '<button type="button" role="tab" aria-selected="' + (x[0] === cur) + '" onclick="C8.tab(\'' + g + '\',\'' + x[0] + '\')">' + x[1] + '</button>'; }).join('') + '</div>' };
  }
  function focusErr() { var k = Object.keys(U.err)[0]; if (!k) return; var el = document.querySelector('[aria-describedby="err-' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]'); if (el) { var f = el.matches('fieldset') ? el.querySelector('input') : el; if (f) f.focus(); } }
  function toast(m) { var w = document.getElementById('toastWrap'); if (!w) return; var t = document.createElement('div'); t.className = 'toast show'; t.setAttribute('role', 'status'); t.textContent = m; w.appendChild(t); setTimeout(function () { t.remove(); }, 3200); }
  function busy(k) { return !!U.busy[k]; }
  /* 서버 성공일 때만 입력을 지운다 — 실패하면 입력이 그대로 남는다 */
  function act(k, p, ok, failMsg) {
    if (U.busy[k]) return Promise.resolve();
    U.busy[k] = true; paint();
    var key = D.key;
    return Promise.resolve(p).then(function (r) { if (D.key !== key) return; return ok && ok(r); }, function (e) { if (D.key !== key) return; toast((e && e.message) || failMsg || '처리하지 못했어요. 입력은 그대로 남아 있어요.'); })
      .then(function () { if (D.key === key) { U.busy[k] = false; paint(); } });
  }

  /* =====================================================================
     셸 (시안 v2-brand: 상단·모바일바·브랜드 레일·사이드 메뉴·하위 탭)
     ===================================================================== */
  function adminBrands() {
    if (me().kind !== 'admin') return [];
    load('cells'); var seen = {}, out = [];
    (Array.isArray(D.cells) ? D.cells : []).forEach(function (c) { if (c.brandId && !seen[c.brandId] && c.kind !== 'dm') { seen[c.brandId] = 1; out.push({ brandId: c.brandId, name: c.brandName || c.brandId }); } });
    if (!seen[D.bid]) out.unshift({ brandId: D.bid, name: brandName() });
    return out;
  }
  function shell(body) {
    var m = menuOf(U.screen), isAdmin = me().kind === 'admin';
    var brands = isAdmin ? adminBrands() : [{ brandId: D.bid, name: brandName() }];
    var pop = U.pop ? '<div class="v6-pop" role="menu">' + brands.map(function (x) { return '<button type="button" role="menuitem" onclick="C8.setBrand(\'' + js(x.brandId) + '\')"' + (x.brandId === D.bid ? ' aria-current="true"' : '') + '>' + h(x.name) + '</button>'; }).join('') +
      (isAdmin ? '<button type="button" role="menuitem" onclick="C8.unpick()">다른 브랜드 고르기(목록)</button>' : '') + '</div>' : '';
    var top = '<div class="v2-top"><span class="v2-logo">theprlist <b>CONSOLE</b></span><button type="button" class="v2-topbtn" onclick="C8.toggle(\'pop\')" aria-expanded="' + !!U.pop + '">' + h(brandName()) + (isAdmin ? ' · 관리자' : '') + ' ▾</button>' + pop + '<span class="v2-sp"></span><button type="button" class="v2-topbtn" onclick="C8.account()" aria-expanded="' + !!U.acct + '" aria-label="계정 ' + a(me().email || '') + '">계정</button>' +
      (U.acct ? '<div class="v6-pop c8-acct" role="menu"><p class="v6-meta">' + h(me().email || '') + (me().kind === 'admin' ? ' · 관리자' : '') + '</p><button type="button" role="menuitem" onclick="C8.logout()">로그아웃</button></div>' : '') + '</div>';
    var mobile = '<div class="v2-mobilebar"><button type="button" class="btn" onclick="C8.toggle(\'rail\')" aria-expanded="' + !!U.rail + '">브랜드 선택 ' + (U.rail ? '닫기' : '열기') + '</button>\n      <button type="button" class="btn pri" onclick="C8.toggle(\'nav\')" aria-expanded="' + !!U.nav + '">메뉴 ' + (U.nav ? '닫기' : '열기') + '</button><span class="small">지금: <b>' + h(m.label) + '</b></span></div>';
    var rail = '<nav class="v2-rail" aria-label="브랜드 선택">' + brands.map(function (x) { return '<button type="button" onclick="C8.setBrand(\'' + js(x.brandId) + '\')" aria-label="' + a(x.name) + '"' + (x.brandId === D.bid ? ' aria-current="true"' : '') + ' data-v5="">' + h(initials(x.name)) + '</button>'; }).join('') +
      '<button type="button" onclick="C8.addBrand()" aria-label="브랜드 추가" data-v5="">' + icon('plus') + '</button></nav>';
    var unread = Object.keys(D.unread || {}).filter(function (k) { return /^dm-/.test(k); }).reduce(function (n, k) { return n + (D.unread[k].unread || 0); }, 0);
    var side = '<nav class="v2-side" aria-label="브랜드 메뉴"><div class="v2-ws"><b>' + h(brandName()) + '</b><span class="small">브랜드 콘솔' + (isAdmin ? ' · 관리자' : '') + '</span></div>' +
      MENU.map(function (x) { var on = x === m; return '<button type="button" class="v2-navbtn" onclick="C8.go(\'' + x.screens[0][0] + '\')"' + (on ? ' aria-current="page"' : '') + ' data-v5="">' + icon(x.ic) + '<span class="v5-lab">' + x.label + (x.ic === 'chat' && unread ? ' <span class="badge-n" aria-label="안 읽은 DM ' + unread + '개">' + unread + '</span>' : '') + '</span></button>'; }).join('') + '</nav>';
    var sub = m.screens.length > 1 ? '<nav class="tabs v2-subtabs" aria-label="' + m.label + ' 하위 메뉴">' + m.screens.map(function (x) { return '<button type="button" onclick="C8.go(\'' + x[0] + '\')"' + (x[0] === U.screen ? ' aria-current="page" aria-selected="true"' : ' aria-selected="false"') + '>' + x[1] + '</button>'; }).join('') + '</nav>' : '';
    return '<div class="v2 v2-brand' + (U.nav ? ' nav-open' : '') + (U.rail ? ' rail-open' : '') + '" data-role-app="brand">' + top + mobile + '<div class="v2-body">' + rail + side +
      '<div class="v2-main" role="region" aria-label="' + a(m.label) + '">' + sub + (U.flash ? '<div class="alert info" role="status">' + h(U.flash) + '</div>' : '') + body + '</div></div></div>';
  }

  /* =====================================================================
     화면: 홈 (같은 캠페인·참여·대화 데이터에서 오늘 처리할 일)
     ===================================================================== */
  function learnFields() {
    var f = (D.profile && D.profile.fields) || {}, v = function (k) { var x = f[k]; return x == null ? '' : (typeof x === 'object' ? (x.value || '') : String(x)); };
    var faq = []; try { faq = JSON.parse(v('faq') || '[]'); } catch (e) {}
    return { intro: v('brand_one_liner'), homepage: v('homepage'), countries: v('countries').split(',').map(function (x) { return x.trim(); }).filter(Boolean), usp: v('usp'), banned: v('banned_words'), faq: Array.isArray(faq) ? faq : [] };
  }
  function learnStatus(L) {
    return [['브랜드 소개', L.intro.trim().length >= 20], ['홈페이지', /^https:\/\//.test(L.homepage)], ['국가', L.countries.length > 0], ['USP', L.usp.trim().length >= 5], ['사용 금지 표현', L.banned.trim().length > 0], ['FAQ 2개 이상', L.faq.filter(function (x) { return (x.q || '').trim() && (x.a || '').trim(); }).length >= 2]];
  }
  function pfield(p, k) { var x = (p && p.fields || {})[k]; return x == null ? '' : (typeof x === 'object' ? (x.value || '') : String(x)); }
  function missingOf(p) {
    var m = [], usp = pfield(p, 'usp').split('\n').filter(function (x) { return x.trim(); });
    if (!p.name.trim()) m.push('제품명'); if (!pfield(p, 'category')) m.push('카테고리'); if (usp.length < 3) m.push('USP 3개');
    if (!pfield(p, 'description').trim()) m.push('상세 설명'); if (!pfield(p, 'ship')) m.push('배송 가능 국가');
    if (!(p.images || []).some(function (i) { return i.slot === 'main'; }) && !p.publicImageUrl) m.push('대표 이미지');
    return m;
  }
  function scToday() {
    need('camps', 'inbox', 'profile', 'prods', 'cells', 'members');
    var head = ctxHead(h(brandName()) + ' 오늘 할 일', '같은 캠페인·참여 건·대화 데이터에서 지금 처리할 일만 모아요.');
    if (!loaded('camps')) return '<div class="v6">' + head + loading('할 일') + '</div>';
    if (D.camps === null) return '<div class="v6">' + head + failBox('camps', '캠페인') + '</div>';
    var rows = allApps(), mem = {}; (D.members || []).forEach(function (x) { mem[x.dmCellId] = x; });
    var dms = Object.keys(D.unread || {}).filter(function (k) { return /^dm-/.test(k) && D.unread[k].unread; });
    var reps = (Array.isArray(D.inbox) ? D.inbox : []).filter(function (t) { return t.lastDirection === 'in' && ['unreviewed', 'question', 'interested'].indexOf((t.task || {}).label || 'unreviewed') >= 0; });
    var wait = rows.filter(function (r) { return st(r.x) === 'applied'; }), addr = rows.filter(function (r) { return st(r.x) === 'terms_agreed' && r.x.sampleRequired !== false && !r.x.shipping; }),
      ship = rows.filter(function (r) { return st(r.x) === 'terms_agreed' && r.x.sampleRequired !== false && r.x.shipping; }), vid = rows.filter(function (r) { return st(r.x) === 'content_submitted'; });
    var nm = function (r) { return '@' + h(r.x.handle || r.x.creatorId); };
    var items = [].concat(
      dms.map(function (k) { var x = mem[k]; return ['@' + h(x ? x.handle : k.split('--')[1]) + '의 DM에 답장', '안 읽은 메시지 ' + D.unread[k].unread + '개', btn('답장하기', "C8.openDm('" + js(k) + "')", 'pri')]; }),
      reps.map(function (t) { return [h(t.handle || t.creatorEmail) + '의 메일 회신 확인', h(t.subject || ''), btn('회신함', "C8.go('b-reply','" + js(t.threadId) + "')")]; }),
      wait.map(function (r) { return [nm(r) + ' 지원 검토', h(r.c.name), btn('지원자 보기', "C8.goApp('" + js(r.c.campaignId) + "','" + js(r.x.creatorId) + "')")]; }),
      addr.map(function (r) { return [nm(r) + ' 샘플 주소 대기', h(r.c.name), btn('샘플·영상', "C8.goSc('" + js(r.c.campaignId) + "','ship')")]; }),
      ship.map(function (r) { return [nm(r) + ' 샘플 발송 처리', h(r.c.name), btn('발송 처리', "C8.goSc('" + js(r.c.campaignId) + "','ship')", 'pri')]; }),
      vid.map(function (r) { return [nm(r) + ' 영상 검수', h(r.c.name), btn('영상 확인', "C8.goSc('" + js(r.c.campaignId) + "','video')", 'pri')]; }));
    var L = learnFields(), ls = learnStatus(L), lsDone = ls.filter(function (x) { return x[1]; }).length;
    var steps = [['제품 자료 완성', prods().some(function (p) { return !missingOf(p).length; })], ['캠페인 모집 시작', camps().some(function (c) { return c.lifecycle === 'published'; })], ['첫 지원 받기', rows.length > 0], ['선정·주소 받기', rows.some(function (r) { return r.x.shipping; })], ['샘플 발송', rows.some(function (r) { return ['sample_shipped', 'content_submitted', 'revision_requested', 'completed'].indexOf(st(r.x)) >= 0; })]];
    return '<div class="v6">' + head +
      '<div class="v6-stats">' + [['답장 필요', dms.length + reps.length], ['선정 대기', wait.length], ['주소 대기', addr.length], ['발송 대기', ship.length], ['영상 확인', vid.length]].map(function (x) { return '<div class="v6-stat"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('') + '</div>' +
      (appsReady() ? '' : '<p class="v6-meta" role="status">지원자 정보를 불러오는 중이에요…</p>') +
      '<section class="v6-sec"><h2>다음 행동 </h2><ul class="v6-list">' + (items.map(function (x) { return '<li class="v6-row"><div class="v6-grow"><b>' + x[0] + '</b><span class="v6-meta">' + x[1] + '</span></div>' + x[2] + '</li>'; }).join('') || '<li class="v6-empty">지금 처리할 일이 없어요.</li>') + '</ul></section>' +
      '<div class="v6-split"><section class="v6-col v6-panel"><h3>시작 진행 </h3><ul class="v6-steplist">' + steps.map(function (x, i) { return '<li>' + chip(x[1] ? '완료' : '대기', x[1] ? 'ok' : '') + ' ' + (i + 1) + '. ' + x[0] + '</li>'; }).join('') + '</ul></section>' +
      '<section class="v6-col v6-panel"><h3>브랜드 학습 </h3><p class="v6-meta">' + lsDone + '/' + ls.length + ' 완료' + (lsDone < ls.length ? ' · 부족: ' + ls.filter(function (x) { return !x[1]; }).map(function (x) { return x[0]; }).join(', ') : '') + '</p>' + btn('브랜드 학습 열기', "C8.go('b-learning')") + '</section></div></div>';
  }

  /* =====================================================================
     화면: 브랜드 학습 (서버 프로필 버전 — 저장하면 새 버전, 이전 버전 보존)
     ===================================================================== */
  function initLearn() {
    if (U.init.learn || !D.profile) return;
    var L = learnFields(); U.init.learn = true;
    U.f['L.intro'] = L.intro; U.f['L.homepage'] = L.homepage; U.f['L.countries'] = L.countries.slice(); U.f['L.usp'] = L.usp; U.f['L.banned'] = L.banned;
    U.faq = L.faq.map(function (x) { return { q: x.q || '', a: x.a || '' }; });
  }
  function curLearn() { return { intro: fv('L.intro'), homepage: fv('L.homepage'), countries: fv('L.countries', []), usp: fv('L.usp'), banned: fv('L.banned'), faq: (U.faq || []).map(function (x, i) { return { q: fv('L.faq.' + i + '.q', x.q), a: fv('L.faq.' + i + '.a', x.a) }; }) }; }
  function scLearning() {
    need('profile', 'prods');
    var head = ctxHead('브랜드 학습', '브랜드 자료는 AI 답장 초안과 캠페인 미리보기의 근거로 쓰여요.');
    if (!loaded('profile')) return '<div class="v6 v6-learn">' + head + loading('브랜드 자료') + '</div>';
    if (D.profile === null) return '<div class="v6 v6-learn">' + head + failBox('profile', '브랜드 자료') + '</div>';
    initLearn();
    var L = curLearn(), stt = learnStatus(L), done = stt.filter(function (x) { return x[1]; }).length;
    var faqDone = L.faq.filter(function (f) { return f.q.trim() && f.a.trim(); }).length;
    var todo = stt.filter(function (x) { return !x[1]; }).map(function (x) { return x[0] === 'FAQ 2개 이상' ? 'FAQ ' + Math.max(1, 2 - faqDone) + '개 더 작성' : x[0] + ' 보완'; });
    var incomplete = prods().filter(function (p) { return missingOf(p).length; });
    return '<div class="v6 v6-learn">' + head +
      '<p class="v7-ready-mobile"><span><b>준비 ' + done + '/' + stt.length + '</b>' + (todo.length ? ' · ' + h(todo.join(', ')) : ' · 모두 준비됐어요') + '</span><a href="#v6-ready-h">준비 현황 보기</a></p>' +
      '<div class="v6-layout"><div class="v6-main">' +
      '<section class="v6-sec v6-block"><h2>브랜드 기본 자료</h2><p class="v6-sec-sub">크리에이터가 초대·캠페인에서 처음 읽는 소개예요.</p><div class="v6-form">' +
      inp('브랜드 소개', 'L.intro', { req: true, area: true, wide: true, hint: '20자 이상. 크리에이터에게 보이는 첫 문장이에요.', max: 2000 }) +
      inp('홈페이지', 'L.homepage', { req: true, type: 'url', ph: 'https://', wide: true, hint: btn(busy('learn') ? '분석 중…' : '홈페이지 분석으로 빈 칸 채우기', 'C8.learnSite()', 'ghost', busy('learn') ? ' disabled' : '') + (U.learnNote ? ' <span class="v6-meta">' + h(U.learnNote) + '</span>' : '') }) +
      checks('운영 국가', 'L.countries', Object.keys(CTRY).map(function (k) { return [k, CTRY[k]]; }), { req: true, wide: true }) + '</div></section>' +
      '<section class="v6-sec v6-block"><h2>크리에이터용 표현</h2><p class="v6-sec-sub">AI 답장 초안과 캠페인 미리보기에 그대로 쓰여요.</p><div class="v6-form">' +
      inp('USP (핵심 장점)', 'L.usp', { req: true, area: true, wide: true, max: 2000 }) + inp('사용 금지 표현', 'L.banned', { req: true, area: true, wide: true, hint: '쉼표로 구분. 예: 치료, 완치', max: 2000 }) + '</div></section>' +
      '<section class="v6-sec v6-block"><h2>자주 묻는 질문 <span class="v6-count-inline">' + L.faq.length + '개</span></h2><p class="v6-sec-sub">질문과 답변을 모두 채운 항목이 2개 이상이면 준비 완료예요.</p>' +
      '<ul class="v6-list">' + (L.faq.map(function (f, i) { return '<li class="v6-row v6-faq">' + inp('질문 ' + (i + 1), 'L.faq.' + i + '.q', { value: f.q, max: 300 }) + inp('답변', 'L.faq.' + i + '.a', { area: true, value: f.a, max: 1000 }) + '<div class="v6-actions">' + btn('삭제', 'C8.faqDel(' + i + ')', 'ghost danger') + '</div></li>'; }).join('') || '<li class="v6-empty">아직 FAQ가 없어요. ‘FAQ 추가’로 첫 질문을 적어 주세요.</li>') + '</ul>' +
      '<div class="v6-actions">' + btn('FAQ 추가', 'C8.faqAdd()') + '</div></section>' +
      '<div class="v6-savebar"><p class="v6-meta">‘검증하고 저장’을 누르면 필수 항목을 확인한 뒤 서버에 새 버전으로 저장해요(이전 버전 보존).' + (D.profile.version ? ' 현재 저장 버전 v' + D.profile.version : ' 아직 저장한 버전이 없어요') + '</p>' + btn(busy('lsave') ? '저장 중…' : '검증하고 저장', 'C8.learnSave()', 'pri', busy('lsave') ? ' disabled' : '') + '</div>' +
      '</div><aside class="v6-aside" aria-labelledby="v6-ready-h"><h2 id="v6-ready-h">준비 현황</h2>' +
      '<p class="v6-summary"><b>준비 ' + done + '/' + stt.length + '</b>' + (todo.length ? ' · ' + h(todo.join(', ')) : ' · 모두 준비됐어요') + '</p>' +
      '<div class="v6-progress" role="progressbar" aria-label="브랜드 학습 준비" aria-valuemin="0" aria-valuemax="' + stt.length + '" aria-valuenow="' + done + '"><span style="width:' + Math.round(done / stt.length * 100) + '%"></span></div>' +
      '<ul class="v6-checklist">' + stt.map(function (x) { return '<li class="' + (x[1] ? 'is-ok' : 'is-todo') + '"><span class="v6-mark" aria-hidden="true">' + (x[1] ? '✓' : '!') + '</span>' + h(x[0]) + '<span class="v6-sr">' + (x[1] ? ' 완료' : ' 부족') + '</span></li>'; }).join('') + '</ul>' +
      '<h3>제품 자료</h3><ul class="v6-mini">' + (prods().map(function (p) { var m = missingOf(p); return '<li>' + pimg(p, 32) + '<div class="v6-grow"><b>' + h(p.name || '이름 없는 제품') + '</b><span class="v6-meta">' + (m.length ? '부족: ' + m.join(', ') : '초대·캠페인에 쓸 수 있어요') + '</span></div>' + (m.length ? btn('제품에서 보완', "C8.editProd('" + js(p.productId) + "')") : '<span class="v6-meta">완료</span>') + '</li>'; }).join('') || '<li class="v6-empty">등록한 제품이 없어요.</li>') + '</ul>' +
      (incomplete.length || !prods().length ? '' : '<p class="v6-meta">모든 제품 자료가 준비됐어요.</p>') + '</aside></div></div>';
  }

  /* =====================================================================
     화면: 제품 라이브러리·편집기 (서버 제품 + 제품 프로필 버전 + 실제 이미지 업로드)
     ===================================================================== */
  function curProd() { return U.editProd === 'new' ? null : prodById(U.editProd); }
  function initProd(p) {
    U.f = {}; U.err = {};
    var usp = p ? pfield(p, 'usp').split('\n') : [];
    U.f['P.name'] = p ? p.name : ''; U.f['P.category'] = p ? pfield(p, 'category') : ''; [0, 1, 2].forEach(function (i) { U.f['P.usp.' + i] = usp[i] || ''; });
    U.f['P.desc'] = p ? pfield(p, 'description') : ''; U.f['P.howto'] = p ? pfield(p, 'howto') : ''; U.f['P.banned'] = p ? pfield(p, 'banned') : '';
    U.f['P.link'] = p ? pfield(p, 'link') : ''; U.f['P.shopId'] = p ? (p.tiktokProductRef || '') : ''; U.f['P.price'] = p ? pfield(p, 'price') : '';
    U.f['P.currency'] = (p && pfield(p, 'currency')) || 'USD'; U.f['P.ship'] = p ? pfield(p, 'ship').split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [];
  }
  function draftMissing(p) {
    var m = [];
    if (!fv('P.name').trim()) m.push('제품명'); if (!fv('P.category')) m.push('카테고리');
    if ([0, 1, 2].filter(function (i) { return fv('P.usp.' + i).trim(); }).length < 3) m.push('USP 3개');
    if (!fv('P.desc').trim()) m.push('상세 설명'); if (!fv('P.ship', []).length) m.push('배송 가능 국가');
    if (!(p && ((p.images || []).some(function (i) { return i.slot === 'main'; }) || p.publicImageUrl))) m.push('대표 이미지');
    if (fv('P.link') && !/^https:\/\//.test(fv('P.link'))) m.push('판매 링크 형식');
    return m;
  }
  function productPreview(p, draft) {
    var name = draft ? fv('P.name') : p.name, cat = draft ? fv('P.category') : pfield(p, 'category'), usp = draft ? [0, 1, 2].map(function (i) { return fv('P.usp.' + i); }) : pfield(p, 'usp').split('\n');
    var desc = draft ? fv('P.desc') : pfield(p, 'description'), how = draft ? fv('P.howto') : pfield(p, 'howto'), ship = draft ? fv('P.ship', []) : pfield(p, 'ship').split(',').filter(Boolean);
    var price = draft ? fv('P.price') : pfield(p, 'price'), cur = draft ? fv('P.currency') : pfield(p, 'currency');
    return '<p class="v6-kicker">크리에이터가 보는 제품 소개 (미리보기)</p><div class="v6-pv">' + pimg(p, 96, name) + '<div><p class="v6-meta">' + h(brandName()) + ' · ' + h(cat || '카테고리') + '</p><h3>' + h(name || '제품명') + '</h3></div></div>' +
      '<ul class="v6-usp">' + usp.slice(0, 3).map(function (u) { return '<li>' + h(u || '—') + '</li>'; }).join('') + '</ul><p>' + h(desc || '상세 설명이 아직 없어요.') + '</p>' + (how ? '<p class="v6-meta">사용 방법: ' + h(how) + '</p>' : '') +
      '<p class="v6-meta">배송 가능: ' + ctryText(ship) + (price ? ' · 정가 ' + h(price) + ' ' + h(cur || '') : '') + '</p>';
  }
  function scProducts() {
    need('prods', 'camps');
    if (U.editProd) return productEditor();
    var head = ctxHead('제품 라이브러리', '캠페인에 연결할 제품 정보예요. 크리에이터에게 보이는 소개를 미리 확인할 수 있어요.');
    if (!loaded('prods')) return '<div class="v6">' + head + loading('제품') + '</div>';
    if (D.prods === null) return '<div class="v6">' + head + failBox('prods', '제품') + '</div>';
    return '<div class="v6">' + head + '<div class="v6-actions"><a class="btn ghost" href="' + a((/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:5175' : 'https://app.theprlist.net') + '/products/') + '" target="_blank" rel="noopener">크리에이터 공개 목록에서 미리보기</a>' + btn('새 제품 등록', 'C8.newProd()', 'pri') + '</div>' +
      '<ul class="v6-list">' + (prods().map(function (p) { var m = missingOf(p), n = camps().filter(function (c) { return c.productId === p.productId; }).length; return '<li class="v6-row">' + pimg(p, 48) + '<div class="v6-grow"><b>' + h(p.name || '이름 없는 제품') + '</b><span class="v6-meta">' + h(pfield(p, 'category') || '카테고리 없음') + ' · 배송 ' + ctryText(pfield(p, 'ship').split(',').filter(Boolean)) + ' · 연결 캠페인 ' + n + '개' + (p.publicListed ? ' · 제품 모아보기 공개' : '') + '</span></div>' + (m.length ? chip('미완성: ' + h(m.join(', ')), 'warn') : chip('완료', 'ok')) + btn('편집', "C8.editProd('" + js(p.productId) + "')") + '</li>'; }).join('') || '<li class="v6-empty">등록한 제품이 없어요.</li>') + '</ul></div>';
  }
  function productEditor() {
    var p = curProd(); if (U.editProd !== 'new' && !p && !busy('psave')) { U.editProd = null; return scProducts(); }
    var m = draftMissing(p), imgs = p ? p.images || [] : [], main = imgs.find(function (i) { return i.slot === 'main'; }), extra = imgs.filter(function (i) { return i.slot === 'extra'; });
    var pubMissing = p ? (p.publicMissing || []) : ['먼저 제품을 저장하세요'];
    return '<div class="v6">' + ctxHead('제품 편집 · ' + h(fv('P.name') || '새 제품'), m.length ? '아직 부족: ' + h(m.join(', ')) : '필수 정보가 모두 채워졌어요.') +
      '<div class="v6-actions">' + btn('← 목록으로', 'C8.closeProd()', 'ghost') + '</div>' +
      '<div class="v6-split"><div class="v6-col">' +
      '<section class="v6-sec"><h2>이미지</h2>' +
      '<div class="v6-imgrow"><div class="v6-imgbox c8-newimg">' + (U.pendImg ? '<img src="' + a(U.pendImg.url) + '" width="120" height="120" alt="선택한 대표 이미지 미리보기">' : pimg(p, 120, fv('P.name'))) + '<span class="v6-meta">대표 이미지' + (U.pendImg ? ' · 선택함 (저장할 때 함께 올려요)' : main ? '' : p && p.publicImageUrl ? ' · 운영팀 등록 이미지 사용 중' : ' · 아직 없음 (공개·모집에 필수)') + '</span></div>' +
      '<div class="v6-actions"><label class="btn v6-file">' + (busy('img') || busy('psave') && U.pendImg ? '올리는 중…' : '대표 이미지 ' + (main || U.pendImg ? (p && !U.pendImg ? '교체' : '다시 선택') : '선택')) + '<input type="file" accept="image/jpeg,image/png,image/webp" onchange="C8.upload(this,\'main\')"' + (busy('img') || busy('psave') ? ' disabled' : '') + '></label>' + (U.pendImg ? btn('선택 취소', 'C8.clearPendImg()', 'ghost') : main ? btn('대표 이미지 삭제', "C8.delImg('" + js(main.imageId) + "')", 'ghost') : '') + '</div></div>' +
      '<div class="v6-thumbs">' + extra.map(function (i, n) { return '<div class="v6-thumb"><img src="' + a(imgSrc(i.url)) + '" data-fb="' + a(mono(fv('P.name'))) + '" width="72" height="72" alt="추가 이미지 ' + (n + 1) + '" referrerpolicy="no-referrer">' + btn('삭제', "C8.delImg('" + js(i.imageId) + "')", 'ghost') + '</div>'; }).join('') +
      (p && extra.length < 4 ? '<label class="btn v6-file">추가 이미지 (' + extra.length + '/4)<input type="file" accept="image/jpeg,image/png,image/webp" onchange="C8.upload(this,\'extra\')"' + (busy('img') ? ' disabled' : '') + '></label>' : '') + '</div>' +
      '<p class="v6-meta">JPG·PNG·WEBP, 2MB 이하. 서버에 저장되고 이 브랜드 콘솔과 멤버 크리에이터에게 보여요. 제품 모아보기에는 ‘공개’로 표시한 동안에만 보여요. 올리기에 실패하면 기존 사진이 그대로 남아요.</p>' + errOf('P.img') + '</section>' +
      '<section class="v6-sec"><h2>제품 정보</h2><div class="v6-form">' +
      inp('제품명', 'P.name', { req: true, max: 120 }) +
      sel('카테고리', 'P.category', [['', '고르세요'], ['스킨케어', '스킨케어'], ['헤어', '헤어'], ['생활', '생활'], ['식품', '식품']], { req: true }) +
      inp('USP 1', 'P.usp.0', { req: true, max: 200 }) + inp('USP 2', 'P.usp.1', { req: true, max: 200 }) + inp('USP 3', 'P.usp.2', { req: true, max: 200 }) +
      inp('상세 설명', 'P.desc', { req: true, area: true, wide: true, max: 2000 }) + inp('사용 방법', 'P.howto', { opt: true, area: true, max: 2000 }) + inp('사용 금지 표현', 'P.banned', { opt: true, area: true, max: 2000 }) +
      inp('판매 링크', 'P.link', { opt: true, type: 'url', ph: 'https://', max: 480 }) + inp('Shop 상품 ID', 'P.shopId', { opt: true, max: 300 }) + inp('정가', 'P.price', { opt: true, type: 'number' }) +
      sel('통화', 'P.currency', [['USD', 'USD'], ['KRW', 'KRW'], ['THB', 'THB'], ['VND', 'VND'], ['JPY', 'JPY']]) +
      checks('배송 가능 국가', 'P.ship', Object.keys(CTRY).map(function (k) { return [k, CTRY[k]]; }), { req: true, wide: true }) +
      '<div class="v6-field v6-wide"><label class="v6-inline"><input type="checkbox" id="P-public"' + (p && p.publicListed ? ' checked' : '') + (p && !busy('pub') ? '' : ' disabled') + (busy('pub') ? ' aria-busy="true"' : '') + ' onchange="C8.setPublic(this)"> 크리에이터 ‘제품 모아보기’에 공개 (필수 정보가 모두 채워지고 저장된 제품만 노출)</label>' +
      (p && !p.publicListed && pubMissing.length ? '<span class="hint">공개하려면: ' + h(pubMissing.join(', ')) + '</span>' : '') + errOf('P.public') + '</div>' +
      '</div></section>' + errOf('prod-save') +
      '<div class="v6-actions v6-bar">' + btn(busy('psave') ? '저장 중…' : (U.returnTo === 'wizard' ? '저장하고 캠페인으로 돌아가기' : '검증하고 저장'), 'C8.saveProd(true)', 'pri', busy('psave') ? ' disabled' : '') + btn('임시 저장', 'C8.saveProd(false)', '', busy('psave') ? ' disabled' : '') + '</div>' +
      '</div><aside class="v6-col v6-preview" aria-label="크리에이터가 보는 제품 소개">' + productPreview(p, true) + '</aside></div></div>';
  }

  /* =====================================================================
     화면: 캠페인 목록·상세
     ===================================================================== */
  function condOf(c, prefix) { var x = (c.conditions || []).find(function (s) { return s.indexOf(prefix) === 0; }); return x ? x.slice(prefix.length).trim() : ''; }
  function period(c) { var p = condOf(c, '모집 기간'); return p || ('— ~ ' + (c.deadline ? String(c.deadline).slice(0, 10) : '—')); }
  function campStatus(c) { return c.lifecycle === 'draft' ? chip('초안') : c.lifecycle === 'published' && c.status === 'open' ? chip('모집 중', 'ok') : chip('모집 마감', 'err'); }
  function rewardText(c) {
    if (c.rewardType === 'affiliate') return '판매 보상(판매금액의 ' + (c.affiliatePct != null ? c.affiliatePct : '?') + '%)' + (condOf(c, '샘플') ? ' · 샘플 ' + condOf(c, '샘플') : '');
    if (c.rewardType === 'paid') return '고정비 ' + (c.rewardAmount != null ? money(c.rewardAmount, c.rewardCurrency) : '금액 미정') + (condOf(c, '지급 시점:') ? ' · ' + condOf(c, '지급 시점:') : '');
    return '제품 제공 (금액 보상 없음)' + (condOf(c, '샘플') ? ' · 샘플 ' + condOf(c, '샘플') : '');
  }
  function contentText(c) { var main = (c.conditions || []).find(function (s) { return /^(TikTok|Instagram) 영상/.test(s); }); return main || ((PLATFORM[c.platform] || 'TikTok') + ' · 조건 미입력'); }
  function condSummary(c) {
    var p = prodById(c.productId);
    return '<div class="v6-cond">' + pimg(p, 64, c.product) + '<dl class="v6-kv"><dt>제품</dt><dd>' + h(p ? p.name : (c.product || '—')) + '</dd><dt>목적</dt><dd>' + h(GOAL[GOAL_OF[c.rewardType] || 'affiliate']) + '</dd><dt>보상</dt><dd>' + h(rewardText(c)) + '</dd>' +
      '<dt>콘텐츠</dt><dd>' + h(contentText(c)) + (condOf(c, '필수:') ? ' · 필수: ' + h(condOf(c, '필수:')) : '') + '</dd><dt>기한</dt><dd>' + h(condOf(c, '제출 기한:') || '—') + '</dd><dt>광고 사용</dt><dd>' + h(condOf(c, '광고 사용:') || '광고 사용 없음') + '</dd>' +
      '<dt>국가 · 인원</dt><dd>' + ctryText(c.countries) + ' · ' + h(c.capacity || '?') + '명</dd><dt>기간</dt><dd>' + h(period(c)) + '</dd></dl></div>';
  }
  function scCampaigns() {
    need('camps', 'prods');
    var head = ctxHead('캠페인 관리', '캠페인마다 연결 제품·참여 조건·지원자·샘플·콘텐츠를 한곳에서 관리해요.');
    if (!loaded('camps')) return '<div class="v6">' + head + loading('캠페인') + '</div>';
    if (D.camps === null) return '<div class="v6">' + head + failBox('camps', '캠페인') + '</div>';
    var c = U.id && campById(U.id);
    if (U.id && !c) return '<div class="v6">' + head + '<div class="v6-empty" role="alert"><b>이 브랜드의 캠페인을 찾지 못했어요.</b> ' + btn('캠페인 목록', "C8.go('b-campaigns')") + '</div></div>';
    if (c) return campaignDetail(c);
    return '<div class="v6">' + head + '<div class="v6-actions">' + btn('새 캠페인', 'C8.newCamp()', 'pri') + '</div>' +
      '<div class="v6-table" role="table" aria-label="캠페인 목록"><div class="v6-tr v6-th" role="row"><span role="columnheader">캠페인</span><span role="columnheader">목적</span><span role="columnheader">기간</span><span role="columnheader">지원자</span><span role="columnheader">상태</span><span role="columnheader"></span></div>' +
      (camps().map(function (x) { var p = prodById(x.productId); return '<div class="v6-tr" role="row"><span role="cell" class="v6-cellmain">' + pimg(p, 36, x.product) + '<span><b>' + h(x.name || '이름 없는 캠페인') + '</b><span class="v6-meta">' + h(p ? p.name : (x.product || '제품 미선택')) + ' · ' + h(x.campaignId) + '</span></span></span><span role="cell">' + h(GOAL[GOAL_OF[x.rewardType] || 'affiliate']) + '</span><span role="cell">' + h(period(x)) + '</span><span role="cell">' + (x.applicants || 0) + '명</span><span role="cell">' + campStatus(x) + '</span><span role="cell">' + btn('열기', "C8.go('b-campaigns','" + js(x.campaignId) + "')") + '</span></div>'; }).join('') || '<div class="v6-empty">아직 캠페인이 없어요.</div>') + '</div></div>';
  }
  function storyboard(c, p) {
    var usp = p ? pfield(p, 'usp').split('\n').filter(Boolean).join(' · ') : '';
    var sc = [['오프닝', (p ? p.name : '제품') + '을 손에 들고 첫인상 한마디'], ['사용', (p && pfield(p, 'howto')) || '실제 사용 장면'], ['USP', usp || 'USP'], ['구매 유도', c.rewardType === 'affiliate' ? '상품 연결 링크 안내' : '브랜드 계정 태그']];
    var ref = condOf(c, '참고 영상:');
    return '<section class="v6-sec"><h2>영상 브리프 · 장면별 스토리보드</h2><p class="v6-meta">브리프와 제품 정보로 만든 장면 구성 미리보기예요. 실제 영상이 아니에요.</p><ol class="v6-board">' + sc.map(function (x, i) { return '<li><div class="v6-frame">' + pimg(p, 56, c.product) + '<span>' + (i + 1) + '</span></div><b>' + x[0] + '</b><span class="v6-meta">' + h(x[1]) + '</span></li>'; }).join('') + '</ol>' +
      (ref && /^https:\/\//.test(ref) ? '<p class="v6-meta">참고 영상 링크: <a href="' + a(ref) + '" target="_blank" rel="noopener noreferrer">' + h(ref) + '</a></p>' : '') + '</section>';
  }
  function campaignDetail(c) {
    var p = prodById(c.productId); loadApps(c.campaignId);
    var apps = D.apps[c.campaignId], t = tabs('camp', [['ov', '개요'], ['prod', '제품'], ['app', '지원자 ' + (apps ? apps.length : c.applicants || 0)], ['sc', '샘플·콘텐츠'], ['msg', '메시지']], 'ov'), body = '';
    if (t.cur === 'ov') body = condSummary(c) + '<div class="v6-actions">' + (c.lifecycle === 'draft' ? btn(busy('cpub') ? '처리 중…' : '모집 시작', "C8.publish('" + js(c.campaignId) + "')", 'pri') : c.lifecycle === 'published' ? btn('모집 마감', "C8.closeCamp('" + js(c.campaignId) + "')") : '') + btn('조건 고치기', "C8.editCamp('" + js(c.campaignId) + "')") + (c.lifecycle === 'published' && c.status === 'open' ? btn('커뮤니티에 게시', "C8.goPost('" + js(c.campaignId) + "')") : '') + '</div>' + errOf('camp-status');
    if (t.cur === 'prod') body = p ? '<div class="v6-split"><div class="v6-col">' + productPreview(p) + '</div><div class="v6-col">' + btn('제품 편집', "C8.editProd('" + js(p.productId) + "')") + '</div></div>' : '<p class="v6-empty">연결된 제품이 없어요.</p>';
    if (t.cur === 'app') body = applicantsBody(c);
    if (t.cur === 'sc') body = apps === undefined ? loading('참여 건') : '<ul class="v6-list">' + ((apps || []).filter(function (x) { return x.termsState && x.termsState !== 'declined'; }).map(function (x) { return '<li class="v6-row"><div class="v6-grow"><b>@' + h(x.handle) + '</b><span class="v6-meta">' + h(PST[st(x)]) + (x.shipping ? ' · 주소 등록됨' : ' · 주소 미입력') + (x.contentUrl ? ' · 영상 제출됨' : '') + '</span></div>' + chip(PST[st(x)], PST_TONE[st(x)]) + btn('샘플·영상에서 처리', "C8.goSc('" + js(c.campaignId) + "','" + (st(x) === 'content_submitted' ? 'video' : 'ship') + "')") + '</li>'; }).join('') || '<li class="v6-empty">선정된 크리에이터가 없어요.</li>') + '</ul>' + storyboard(c, p);
    if (t.cur === 'msg') body = apps === undefined ? loading('대화') : '<ul class="v6-list">' + ((apps || []).map(function (x) { var cell = 'dm-' + D.bid + '--' + x.creatorId, u = D.unread[cell]; return '<li class="v6-row"><div class="v6-grow"><b>@' + h(x.handle) + '</b><span class="v6-meta">' + h(PST[st(x)]) + '</span></div>' + (u && u.unread ? chip('답장 필요 · ' + u.unread, 'warn') : chip('새 메시지 없음', 'ok')) + btn('대화 열기', "C8.openDm('" + js(cell) + "')") + '</li>'; }).join('') || '<li class="v6-empty">이 캠페인 대화가 없어요.</li>') + '</ul>';
    return '<div class="v6">' + ctxHead(h(c.name), h(GOAL[GOAL_OF[c.rewardType] || 'affiliate']) + ' · ' + h(c.campaignId), campStatus(c)) + '<div class="v6-actions">' + btn('← 캠페인 목록', "C8.go('b-campaigns')", 'ghost') + '</div>' + t.html + '<div class="v6-tabbody">' + body + '</div></div>';
  }

  /* =====================================================================
     화면: 새 캠페인 4단계 (실제 저장: 초안 → 모집 시작). 조건은 크리에이터가 그대로 읽는 문장으로 저장한다.
     ===================================================================== */
  var AD = { none: '광고 사용 없음', organic: '브랜드 계정 재게시만', ads: '브랜드 광고 사용' };
  function wizDefaults() {
    return { 'W.goal': 'affiliate', 'W.name': '', 'W.countries': [], 'W.start': '', 'W.end': '', 'W.productId': (prods()[0] || {}).productId || '', 'W.commission': '', 'W.sampleQty': '', 'W.shipping': '브랜드 부담', 'W.settle': 'TikTok Shop 주문 확정 후 플랫폼 정산',
      'W.fee': '', 'W.currency': 'USD', 'W.payAt': '', 'W.platform': 'tiktok', 'W.count': '1', 'W.length': '', 'W.must': '', 'W.banned': '', 'W.due': '', 'W.adUse': 'none', 'W.adDays': '', 'W.cap': '', 'W.videoUrl': '' };
  }
  function wizFrom(c) {
    var w = wizDefaults(), cond = c.conditions || [];
    w['W.goal'] = GOAL_OF[c.rewardType] || 'affiliate'; w['W.name'] = c.name || ''; w['W.countries'] = (c.countries || []).slice(); w['W.productId'] = c.productId || '';
    w['W.commission'] = c.affiliatePct != null ? String(c.affiliatePct) : ''; w['W.fee'] = c.rewardAmount != null ? String(c.rewardAmount) : ''; w['W.currency'] = c.rewardCurrency || 'KRW';
    w['W.platform'] = c.platform || 'tiktok'; w['W.cap'] = c.capacity ? String(c.capacity) : ''; w['W.end'] = c.deadline ? String(c.deadline).slice(0, 10) : '';
    cond.forEach(function (s) {
      var m;
      if ((m = s.match(/^(TikTok|Instagram) 영상 (\d+)개 · (.*)$/))) { w['W.count'] = m[2]; w['W.length'] = m[3]; }
      else if ((m = s.match(/^제출 기한: (.*)$/))) w['W.due'] = m[1];
      else if ((m = s.match(/^필수: (.*)$/))) w['W.must'] = m[1];
      else if ((m = s.match(/^금지: (.*)$/))) w['W.banned'] = m[1];
      else if ((m = s.match(/^광고 사용: 브랜드 광고 사용 (\d+)일$/))) { w['W.adUse'] = 'ads'; w['W.adDays'] = m[1]; }
      else if (/^광고 사용: 브랜드 계정 재게시만/.test(s)) w['W.adUse'] = 'organic';
      else if ((m = s.match(/^샘플 (\d+)개 · 배송비 (.*)$/))) { w['W.sampleQty'] = m[1]; w['W.shipping'] = m[2]; }
      else if (/^샘플 없음/.test(s)) w['W.sampleQty'] = '0';
      else if ((m = s.match(/^정산: (.*)$/))) w['W.settle'] = m[1];
      else if ((m = s.match(/^지급 시점: (.*)$/))) w['W.payAt'] = m[1];
      else if ((m = s.match(/^모집 기간 (\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})$/))) { w['W.start'] = m[1]; w['W.end'] = m[2]; }
      else if ((m = s.match(/^참고 영상: (.*)$/))) w['W.videoUrl'] = m[1];
    });
    if (c.sampleRequired === false) w['W.sampleQty'] = '0';
    return w;
  }
  function sampleQty() { return Number(fv('W.sampleQty')) || 0; }
  function wizConditions() {
    var g = fv('W.goal'), out = [(PLATFORM[fv('W.platform')] || 'TikTok') + ' 영상 ' + fv('W.count') + '개 · ' + fv('W.length').trim(), '제출 기한: ' + fv('W.due').trim()];
    if (fv('W.must').trim()) out.push('필수: ' + fv('W.must').trim());
    if (fv('W.banned').trim()) out.push('금지: ' + fv('W.banned').trim());
    out.push('광고 사용: ' + (fv('W.adUse') === 'ads' ? '브랜드 광고 사용 ' + fv('W.adDays') + '일' : AD[fv('W.adUse')] || AD.none));
    out.push(sampleQty() > 0 ? '샘플 ' + fv('W.sampleQty') + '개 · 배송비 ' + fv('W.shipping') : '샘플 없음 · 보유 제품으로 촬영');
    if (g === 'affiliate' && fv('W.settle').trim()) out.push('정산: ' + fv('W.settle').trim());
    if (g === 'ugc') out.push('지급 시점: ' + fv('W.payAt').trim());
    out.push('모집 기간 ' + fv('W.start') + ' ~ ' + fv('W.end'));
    if (fv('W.videoUrl').trim()) out.push('참고 영상: ' + fv('W.videoUrl').trim());
    return out.slice(0, 10);
  }
  function wizCamp() {   // 미리보기·검증용 — 저장할 값과 같은 모양
    var g = fv('W.goal'), p = prodById(fv('W.productId'));
    return { campaignId: U.wizId || '', name: fv('W.name'), rewardType: RT_OF[g], affiliatePct: g === 'affiliate' ? Number(fv('W.commission')) || null : null, rewardAmount: g === 'ugc' ? Number(fv('W.fee')) || null : null, rewardCurrency: fv('W.currency'),
      platform: fv('W.platform'), conditions: wizConditions(), capacity: Number(fv('W.cap')) || 0, deadline: fv('W.end'), countries: fv('W.countries', []), productId: p ? p.productId : null, product: p ? p.name : '', sampleRequired: sampleQty() > 0, lifecycle: 'draft' };
  }
  function stepErrors(step) {
    var e = {}, g = fv('W.goal'), d = /^\d{4}-\d{2}-\d{2}$/;
    if (step === 1) {
      if (!fv('W.name').trim() || fv('W.name').trim().length < 2) e['W.name'] = '캠페인 이름을 2자 이상 적어 주세요.';
      if (!fv('W.countries', []).length) e['W.countries'] = '모집 국가를 하나 이상 골라 주세요.';
      if (!d.test(fv('W.start'))) e['W.start'] = '시작일을 YYYY-MM-DD로 적어 주세요.';
      if (!d.test(fv('W.end'))) e['W.end'] = '종료일을 YYYY-MM-DD로 적어 주세요.';
      else if (fv('W.start') && fv('W.end') < fv('W.start')) e['W.end'] = '종료일이 시작일보다 빨라요.';
      else if (fv('W.end') < today()) e['W.end'] = '모집 종료일(' + fv('W.end') + ')이 이미 지났어요.';
    }
    if (step === 2) {
      var p = prodById(fv('W.productId'));
      if (!p) e['W.productId'] = '제품을 고르거나 새로 등록해 주세요.';
      else if (missingOf(p).length) e['W.productId'] = '제품 정보가 부족해요: ' + missingOf(p).join(', ');
      else if (g === 'affiliate' && (!p.tiktokProductRef || !/^https:\/\//.test(pfield(p, 'link')))) e['W.productId'] = '판매 연결 캠페인은 Shop 상품 ID와 판매 링크가 있는 제품을 골라 주세요.';
      else { var ship = pfield(p, 'ship').split(',').filter(Boolean), miss = fv('W.countries', []).filter(function (k) { return ship.indexOf(k) < 0; }); if (miss.length) e['W.productId'] = '제품 배송 가능 국가에 없는 모집 국가가 있어요: ' + ctryText(miss); }
    }
    if (step === 3) {
      if (g === 'affiliate') { var cm = Number(fv('W.commission')); if (!(cm > 0 && cm <= 80)) e['W.commission'] = '판매 커미션을 1~80 사이 숫자로 적어 주세요.'; }
      if ((fv('W.sampleQty') === '' || !(Number(fv('W.sampleQty')) >= 0))) e['W.sampleQty'] = '샘플 수량을 적어 주세요. 없으면 0.';
      if (g === 'ugc') { if (!/^\d+$/.test(fv('W.fee')) || !(Number(fv('W.fee')) > 0)) e['W.fee'] = '고정비 금액을 정수로 적어 주세요.'; if (!fv('W.payAt').trim()) e['W.payAt'] = '지급 시점을 적어 주세요.'; }
      if (!(Number(fv('W.count')) >= 1)) e['W.count'] = '영상 개수를 1개 이상 적어 주세요.';
      if (!fv('W.length').trim()) e['W.length'] = '영상 길이를 적어 주세요. 예: 30~60초';
      if (!fv('W.due').trim()) e['W.due'] = '제출 기한을 적어 주세요.';
      if (fv('W.adUse') === 'ads' && !(Number(fv('W.adDays')) > 0)) e['W.adDays'] = '광고 사용 기간(일)을 적어 주세요.';
      if (!(Number(fv('W.cap')) >= 1)) e['W.cap'] = '모집 인원을 1명 이상 적어 주세요.';
      if (fv('W.videoUrl') && !/^https:\/\//.test(fv('W.videoUrl'))) e['W.videoUrl'] = 'https://로 시작하는 영상 링크를 적어 주세요.';
    }
    return e;
  }
  function allErrors() { var out = []; [1, 2, 3].forEach(function (s) { var e = stepErrors(s); Object.keys(e).forEach(function (k) { out.push(e[k]); }); }); return out; }
  function scCreate() {
    need('prods', 'camps');
    if (!U.init.wiz) { U.init.wiz = true; var w = wizDefaults(); Object.keys(w).forEach(function (k) { if (U.f[k] === undefined) U.f[k] = w[k]; }); }
    var step = U.wiz, p = prodById(fv('W.productId')), g = fv('W.goal'), body = '';
    var steps = ['목적·이름·국가·기간', '제품', '참여 조건', '미리보기·모집 시작'];
    if (step === 1) body = '<div class="v6-form"><fieldset class="v6-field v6-fs v6-wide"><legend>캠페인 목적<span class="req">필수</span></legend><div class="v6-radios">' + Object.keys(GOAL).map(function (k) { return '<label><input type="radio" name="W-goal" data-f="W.goal" data-live value="' + k + '"' + (g === k ? ' checked' : '') + '> ' + GOAL[k] + (k === 'affiliate' ? ' <span class="v6-meta">기본</span>' : '') + '</label>'; }).join('') + '</div></fieldset>' +
      inp('캠페인 이름', 'W.name', { req: true, wide: true, ph: '예: 한방 앰플 미국 판매 영상', max: 120 }) + checks('모집 국가', 'W.countries', Object.keys(CTRY).map(function (k) { return [k, CTRY[k]]; }), { req: true, wide: true }) +
      inp('시작일', 'W.start', { req: true, ph: '2026-11-01', type: 'date' }) + inp('종료일', 'W.end', { req: true, ph: '2026-11-30', type: 'date' }) + '</div>';
    if (step === 2) body = '<div class="v6-form">' + sel('연결할 제품', 'W.productId', [['', '고르세요']].concat(prods().map(function (x) { return [x.productId, x.name + (missingOf(x).length ? ' (미완성)' : '')]; })), { req: true, wide: true, live: true }) + '</div>' +
      (p ? '<div class="v6-split"><div class="v6-col">' + productPreview(p) + '</div><div class="v6-col">' + (missingOf(p).length ? '<p class="ferr">부족: ' + h(missingOf(p).join(', ')) + '</p>' + btn('이 제품 보완하기', "C8.wizProd('" + js(p.productId) + "')") : chip('캠페인에 쓸 수 있어요', 'ok')) + '</div></div>' : '') +
      '<div class="v6-actions">' + btn('새 제품 바로 등록', 'C8.wizNewProd()') + '</div>';
    if (step === 3) body = '<div class="v6-form">' +
      (g === 'affiliate' ? '<p class="v6-wide v6-kicker">판매 연결 조건</p>' + inp('판매 커미션 (%)', 'W.commission', { req: true, type: 'number', hint: '판매 보상(판매금액의 n%) — 확인된 판매금액 기준, TikTok Shop에서 정산' }) + inp('샘플 수량', 'W.sampleQty', { req: true, type: 'number', hint: '0이면 샘플 없이 진행해요 — 합의 후 주소·발송 없이 바로 영상을 제출해요.' }) + sel('배송비', 'W.shipping', [['브랜드 부담', '브랜드 부담'], ['크리에이터 부담', '크리에이터 부담']]) + inp('정산 기준', 'W.settle', { opt: true, max: 150 }) + '<p class="v6-meta v6-wide">Shop 상품 링크는 제품 정보의 판매 링크를 써요: ' + h(p ? pfield(p, 'link') || '없음' : '제품 미선택') + '</p>' : '') +
      (g === 'ugc' ? '<p class="v6-wide v6-kicker">유료 UGC 조건</p>' + inp('고정비', 'W.fee', { req: true, type: 'number' }) + sel('통화', 'W.currency', [['USD', 'USD'], ['KRW', 'KRW'], ['THB', 'THB'], ['VND', 'VND'], ['JPY', 'JPY']]) + inp('지급 시점', 'W.payAt', { req: true, wide: true, ph: '예: 브랜드 확인 통과 후 14일 이내', max: 150 }) + inp('샘플 수량', 'W.sampleQty', { req: true, type: 'number', hint: '0이면 샘플 없이 진행해요 — 합의 후 주소·발송 없이 바로 영상을 제출해요.' }) + sel('배송비', 'W.shipping', [['브랜드 부담', '브랜드 부담'], ['크리에이터 부담', '크리에이터 부담']]) : '') +
      (g === 'sample' ? '<p class="v6-wide v6-kicker">샘플 협업 조건</p>' + inp('샘플 수량', 'W.sampleQty', { req: true, type: 'number', hint: '0이면 샘플 없이 진행해요 — 합의 후 주소·발송 없이 바로 영상을 제출해요.' }) + sel('배송비', 'W.shipping', [['브랜드 부담', '브랜드 부담'], ['크리에이터 부담', '크리에이터 부담']]) : '') +
      '<p class="v6-wide v6-kicker">요청 콘텐츠</p>' + sel('플랫폼', 'W.platform', [['tiktok', 'TikTok'], ['instagram', 'Instagram']], { hint: 'YouTube Shorts 는 아직 합의·제출 흐름을 지원하지 않아요.' }) + inp('영상 개수', 'W.count', { req: true, type: 'number' }) +
      inp('영상 길이', 'W.length', { req: true, ph: '30~60초', max: 60 }) + inp('제출 기한', 'W.due', { req: true, ph: '샘플 받은 날부터 14일', max: 120 }) +
      inp('필수 내용', 'W.must', { opt: true, wide: true, max: 180 }) + inp('금지 표현', 'W.banned', { opt: true, wide: true, max: 180 }) +
      sel('광고 사용 범위', 'W.adUse', [['none', '광고 사용 없음'], ['organic', '브랜드 계정 재게시만'], ['ads', '브랜드 광고 사용']], { live: true }) + (fv('W.adUse') === 'ads' ? inp('광고 사용 기간(일)', 'W.adDays', { req: true, type: 'number' }) : '') +
      inp('모집 인원', 'W.cap', { req: true, type: 'number' }) + inp('참고 영상 링크', 'W.videoUrl', { opt: true, type: 'url', hint: '직접 첨부하는 참고 링크예요. 크리에이터 조건에 링크로 보여요.', max: 180 }) + '</div>';
    if (step === 4) { var errs = allErrors(), c = wizCamp(); body = condSummary(c) + storyboard(c, p) + (errs.length ? '<div class="alert err" id="err-publish" tabindex="-1"><b>아직 모집을 시작할 수 없어요.</b><ul>' + errs.map(function (x) { return '<li>' + h(x) + '</li>'; }).join('') + '</ul></div>' : '<div class="alert ok">필수 정보가 모두 채워졌어요.</div>'); }
    return '<div class="v6">' + ctxHead(U.wizId ? '캠페인 조건 고치기' : '새 캠페인', '입력값은 단계를 오가도 유지돼요. ‘초안 저장’을 누르면 서버에 초안으로 저장돼요(크리에이터에게는 안 보임).' + (U.wizId ? ' 이미 합의한 크리에이터의 조건은 합의 당시 기록이 유지돼요.' : '')) +
      '<ol class="v6-steps">' + steps.map(function (l, i) { return '<li><button type="button" onclick="C8.wizGo(' + (i + 1) + ')" aria-current="' + (step === i + 1 ? 'step' : 'false') + '"' + (step === i + 1 ? ' class="on"' : '') + '>' + (i + 1) + '. ' + l + '</button></li>'; }).join('') + '</ol>' +
      '<section class="v6-sec">' + body + '</section><div class="v6-actions v6-bar">' + (step > 1 ? btn('이전', 'C8.wizGo(' + (step - 1) + ')') : '') + btn(busy('wsave') ? '저장 중…' : '초안 저장', 'C8.wizSave(false)', '', busy('wsave') ? ' disabled' : '') +
      (step < 4 ? btn('다음', 'C8.wizNext()', 'pri') : btn(busy('wsave') ? '처리 중…' : (U.wizId && (campById(U.wizId) || {}).lifecycle !== 'draft' ? '변경 저장' : '모집 시작'), 'C8.wizSave(true)', 'pri', busy('wsave') ? ' disabled' : '')) + '</div></div>';
  }

  /* =====================================================================
     화면: 지원자 (선정·미선정·재검토, 합의 대기·합의 기록)
     ===================================================================== */
  function campPick(key) {
    var list = camps().filter(function (c) { return c.lifecycle !== 'draft'; });
    if (!U[key] || !list.some(function (c) { return c.campaignId === U[key]; })) U[key] = (list[0] || {}).campaignId;
    return list.length ? '<div class="v6-field v6-inlinefield"><label for="' + key + '">캠페인</label><select id="' + key + '" onchange="C8.pick(\'' + key + '\',this.value)">' + list.map(function (c) { return '<option value="' + a(c.campaignId) + '"' + (c.campaignId === U[key] ? ' selected' : '') + '>' + h(c.name) + '</option>'; }).join('') + '</select></div>' : '';
  }
  function campBanner(c) { var p = prodById(c.productId); return '<div class="v6-sticky">' + pimg(p, 48, c.product) + '<div class="v6-grow"><b>' + h(c.name) + '</b><span class="v6-meta">' + h(brandName()) + ' · ' + h(p ? p.name : (c.product || '')) + ' · ' + h(rewardText(c)) + ' · ' + h(contentText(c)) + '</span></div>' + campStatus(c) + '</div>'; }
  function agreedText(x) {
    var t = x.agreedTerms; if (!t) return x.agreedCommissionPct != null ? '확정 수수료 ' + x.agreedCommissionPct + '% (합의 기록 이전 데이터)' : '';
    var rw = t.rewardType === 'paid' ? '고정비 ' + (t.rewardAmount != null ? money(t.rewardAmount, t.rewardCurrency) : '금액 미정') : t.rewardType === 'gifted' ? '제품 제공' : '판매 수수료 ' + (t.commissionPct != null ? t.commissionPct + '%' : '-');
    return (t.product ? '제품 ' + t.product + ' · ' : '') + rw + ' · ' + (PLATFORM[t.platform] || t.platform || '') + (t.handle ? ' 계정 ' + t.handle : '') + ((t.conditions || []).length ? ' · ' + t.conditions.join(' · ') : '');
  }
  function shipText(x) { var s = x.shipping; if (x.sampleRequired === false) return '샘플 없음'; return s ? [s.recipient, CTRY[s.country] || s.country, s.address].filter(Boolean).join(' · ') : '주소 미입력'; }
  function applicantsBody(c) {
    var all = D.apps[c.campaignId]; loadApps(c.campaignId);
    if (all === undefined) return loading('지원자');
    if (all === null) return '<div class="v6-empty" role="alert">지원자를 불러오지 못했어요. ' + btn('다시 불러오기', "C8.reloadApps('" + js(c.campaignId) + "')") + '</div>';
    var f = U.appFilter || '', list = all.filter(function (x) { return !f || st(x) === f; }), selP = all.find(function (x) { return x.creatorId === U.appSel; }) || list[0];
    var counts = Object.keys(PST).map(function (k) { return [k, all.filter(function (x) { return st(x) === k; }).length]; }).filter(function (x) { return x[1]; });
    var actions = '';
    if (selP) {
      var s = st(selP), id = js(selP.creatorId), cid = js(c.campaignId);
      if (s === 'applied') actions = (c.rewardType === 'affiliate' ? inp('제안 수수료 (%)', 'A.pct.' + selP.creatorId, { type: 'number', value: c.affiliatePct != null ? String(c.affiliatePct) : '', hint: '판매 수수료 캠페인은 제안 수수료가 필요해요.' }) : '') +
        inp('미선정 사유 (선택 · 크리에이터 화면에 보여요)', 'A.rej.' + selP.creatorId, { max: 300 }) + '<div class="v6-actions">' + btn(busy('sel') ? '처리 중…' : '선정', "C8.select('" + cid + "','" + id + "',false)", 'pri', busy('sel') ? ' disabled' : '') + btn('거절', "C8.reject('" + cid + "','" + id + "')", 'danger') + '</div>';
      else if (s === 'rejected') actions = '<p class="v6-meta">미선정 처리한 지원자예요' + (selP.rejectReason ? ' · 사유: ' + h(selP.rejectReason) : '') + '. 다시 선정하려면 재검토를 확인해야 해요(크리에이터에게 선정 알림이 가요).</p>' + (c.rewardType === 'affiliate' ? inp('제안 수수료 (%)', 'A.pct.' + selP.creatorId, { type: 'number', value: c.affiliatePct != null ? String(c.affiliatePct) : '' }) : '') +
        '<div class="v6-field v6-wide"><label class="v6-inline"><input type="checkbox" data-f="A.reconsider.' + a(selP.creatorId) + '"' + (fv('A.reconsider.' + selP.creatorId) ? ' checked' : '') + '> 결과를 다시 검토했고 선정으로 바꿔요</label></div><div class="v6-actions">' + btn('재검토 후 선정', "C8.select('" + cid + "','" + id + "',true)", 'pri') + '</div>';
      else if (s === 'selected') actions = '<p class="v6-meta">크리에이터 합의 대기 · 제안 ' + (selP.commissionPct != null ? '수수료 ' + selP.commissionPct + '%' : '조건') + '. 크리에이터가 화면에서 조건을 확인하고 합의해요.</p>';
      else actions = '<p class="v6-meta">합의한 조건: ' + h(agreedText(selP)) + '</p>' + btn('샘플·영상에서 처리', "C8.goSc('" + cid + "','" + (s === 'content_submitted' ? 'video' : 'ship') + "')");
    }
    return campBanner(c) + '<div class="v6-filters" role="group" aria-label="진행 단계 필터">' + [['', '전체 ' + all.length]].concat(counts.map(function (x) { return [x[0], PST[x[0]] + ' ' + x[1]]; })).map(function (x) { return '<button type="button" class="v6-pill" aria-pressed="' + (f === x[0]) + '" onclick="C8.appFilter(\'' + x[0] + '\')">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<div class="v6-split v6-split-list c8-md' + (U.appPicked && selP ? ' c8-has-sel' : '') + '"><ul class="v6-list">' + (list.map(function (x) { return '<li class="v6-row' + (selP && selP.creatorId === x.creatorId ? ' on' : '') + '"><div class="v6-grow"><b>@' + h(x.handle) + '</b><span class="v6-meta">' + h(PLATFORM[x.platform] || x.platform || '') + ' · ' + (x.verified ? '운영팀 확인 크리에이터' : '운영팀 확인 전') + ' · ' + h(String(x.appliedAt || '').slice(0, 10)) + ' 신청</span></div>' + chip(PST[st(x)], PST_TONE[st(x)]) + btn('보기', "C8.appSel('" + js(x.creatorId) + "')") + '</li>'; }).join('') || '<li class="v6-empty">이 단계의 지원자가 없어요.</li>') + '</ul>' +
      (selP ? '<div class="v6-col v6-panel"><div class="c8-back">' + btn('← 지원자 목록', 'C8.appBack()', 'ghost') + '</div><h3 id="c8-app-h" tabindex="-1">@' + h(selP.handle) + ' ' + chip(PST[st(selP)], PST_TONE[st(selP)]) + '</h3><dl class="v6-kv"><dt>플랫폼</dt><dd>' + h(PLATFORM[selP.platform] || selP.platform || '—') + (selP.platformHandle ? ' · ' + h(selP.platformHandle) : '') + '</dd><dt>신청일</dt><dd>' + h(String(selP.appliedAt || '').slice(0, 10)) + '</dd><dt>배송 주소</dt><dd>' + h(shipText(selP)) + ' <span class="v6-meta">이 캠페인 담당에게만 보여요</span></dd></dl>' + actions + '</div>' : '') + '</div>';
  }
  function scApplicants() {
    need('camps', 'prods');
    var head = ctxHead('지원자', '선택한 캠페인의 지원자만 보여요. 선정하면 크리에이터 화면의 같은 참여 건 상태가 바뀌어요.');
    if (!loaded('camps')) return '<div class="v6">' + head + loading('캠페인') + '</div>';
    var pick = campPick('appCamp'), c = campById(U.appCamp);
    if (!c) return '<div class="v6">' + head + '<p class="v6-empty">모집을 시작한 캠페인이 없어요. ' + btn('새 캠페인', 'C8.newCamp()') + '</p></div>';
    return '<div class="v6">' + head + pick + applicantsBody(c) + '</div>';
  }

  /* =====================================================================
     화면: 샘플·영상 (주소 대기 → 발송 처리 → 영상 검수 → 수정 요청/검수 완료). 검수 완료 ≠ 지급.
     ===================================================================== */
  function videoLink(u) { return /^https:\/\/[^\s"'<>`]{4,1000}$/.test(String(u || '')) ? '<a class="btn ghost" href="' + a(u) + '" target="_blank" rel="noopener noreferrer">제출 영상 보기</a> <span class="v6-meta v6-wrap">' + h(u) + '</span>' : '<span class="v6-wrap">' + h(u || '') + '</span>'; }
  function scSamples() {
    need('camps', 'prods');
    var head = ctxHead('샘플·영상', '선택한 캠페인의 주소·배송·영상 제출·수정 요청·검수를 처리해요. 크리에이터 화면과 보상에 같은 상태로 반영돼요.');
    if (!loaded('camps')) return '<div class="v6">' + head + loading('캠페인') + '</div>';
    var pick = campPick('scCamp'), c = campById(U.scCamp);
    if (!c) return '<div class="v6">' + head + '<p class="v6-empty">캠페인이 없어요.</p></div>';
    var all = D.apps[c.campaignId]; loadApps(c.campaignId);
    if (all === undefined) return '<div class="v6">' + head + pick + campBanner(c) + loading('참여 건') + '</div>';
    var ps = (all || []).filter(function (x) { return x.termsState && x.termsState !== 'declined'; }), t = tabs('sc', [['ship', '샘플 배송'], ['video', '영상 검수']], 'ship'), body = '', cid = js(c.campaignId);
    var name = function (x) { return '<div class="v6-grow"><b>@' + h(x.handle) + '</b><span class="v6-meta">' + h(shipText(x)) + '</span></div>'; };
    var linkRow = function (x) { return c.rewardType === 'affiliate' ? '<div class="v6-field v6-trk"><label for="' + fid('L.' + x.creatorId) + '">어필리에이트 링크</label><input id="' + fid('L.' + x.creatorId) + '" type="url" data-f="L.' + a(x.creatorId) + '" value="' + a(fv('L.' + x.creatorId, x.affiliateLink || '')) + '" placeholder="https:// (브랜드 발급)"></div>' + btn(x.affiliateLink ? '링크 수정' : '링크 발급', "C8.link('" + cid + "','" + js(x.creatorId) + "')") : ''; };
    if (t.cur === 'ship') body = '<ul class="v6-list">' + (ps.map(function (x) {
      var s = st(x), id = js(x.creatorId);
      if (s === 'selected') return '<li class="v6-row">' + name(x) + chip('조건 합의 대기', 'info') + '<span class="v6-meta">' + (x.sampleRequired === false ? '샘플 없는 캠페인 — 합의 후 바로 영상 제출' : '합의 후 주소를 받아요') + '</span></li>';
      if (s === 'terms_agreed' && x.sampleRequired === false) return '<li class="v6-row">' + name(x) + chip('샘플 없음', 'info') + '<span class="v6-meta">샘플 없이 진행하기로 합의했어요 · 크리에이터가 바로 영상을 제출해요</span>' + linkRow(x) + '</li>';
      if (s === 'terms_agreed' && !x.shipping) return '<li class="v6-row">' + name(x) + chip('주소 대기', 'warn') + btn('DM으로 주소 요청', "C8.openDm('dm-" + js(D.bid) + "--" + id + "')") + '</li>';
      if (s === 'terms_agreed') return '<li class="v6-row">' + name(x) + chip('발송 대기', 'info') + '<div class="v6-field v6-trk"><label for="' + fid('T.' + x.creatorId) + '">송장 번호</label><input id="' + fid('T.' + x.creatorId) + '" type="text" data-f="T.' + a(x.creatorId) + '" value="' + a(fv('T.' + x.creatorId)) + '" placeholder="예: USPS 9400 1234"' + inv('T.' + x.creatorId) + ' maxlength="120">' + errOf('T.' + x.creatorId) + '</div>' + btn(busy('ship' + x.creatorId) ? '처리 중…' : '발송 처리', "C8.ship('" + cid + "','" + id + "')", 'pri', busy('ship' + x.creatorId) ? ' disabled' : '') + linkRow(x) + '</li>';
      if (s === 'sample_shipped') return '<li class="v6-row">' + name(x) + chip('배송 중', 'warn') + '<span class="v6-meta">송장 ' + h(x.sampleTracking || '—') + ' · 크리에이터가 영상을 제출해요</span>' + linkRow(x) + '</li>';
      return '<li class="v6-row">' + name(x) + chip(PST[s], PST_TONE[s]) + '<span class="v6-meta">송장 ' + h(x.sampleTracking || '—') + '</span></li>';
    }).join('') || '<li class="v6-empty">선정된 크리에이터가 없어요.</li>') + '</ul>';
    if (t.cur === 'video') body = '<p class="v6-meta">요청: ' + h(contentText(c)) + (condOf(c, '필수:') ? ' · 필수: ' + h(condOf(c, '필수:')) : '') + (condOf(c, '금지:') ? ' · 금지: ' + h(condOf(c, '금지:')) : '') + ' · 기한: ' + h(condOf(c, '제출 기한:') || '—') + '</p><ul class="v6-list">' +
      (ps.filter(function (x) { return ['content_submitted', 'revision_requested', 'completed'].indexOf(st(x)) >= 0; }).map(function (x) {
        var s = st(x), id = js(x.creatorId);
        if (s === 'completed') return '<li class="v6-row">' + name(x) + videoLink(x.contentUrl) + chip('검수 완료', 'ok') + '<span class="v6-meta">지급은 별도로 확인해요 — 검수 완료는 지급 완료가 아니에요.</span></li>';
        if (s === 'revision_requested') return '<li class="v6-row">' + name(x) + chip('수정본 제출 대기', 'warn') + '<span class="v6-meta">요청: ' + h(x.revisionNote || '') + (x.contentUrl ? ' · 이전 제출 ' + h(x.contentUrl) : '') + '</span></li>';
        return '<li class="v6-row v6-editrow"><div class="v6-row" style="border:0;padding:0">' + name(x) + videoLink(x.contentUrl) + chip('검수 대기', 'info') + '</div>' + inp('수정 요청 사유 (수정 요청 시 필수)', 'R.' + x.creatorId, { area: true, ph: '예: 0:05~0:09 제품명을 정확히 말해 주세요', max: 500 }) +
          '<div class="v6-actions">' + btn('수정 요청', "C8.revise('" + js(c.campaignId) + "','" + id + "')", '', busy('rv' + x.creatorId) ? ' disabled' : '') + btn('검수 완료', "C8.approve('" + js(c.campaignId) + "','" + id + "')", 'pri', busy('ok' + x.creatorId) ? ' disabled' : '') + '</div></li>';
      }).join('') || '<li class="v6-empty">영상 단계의 크리에이터가 없어요.</li>') + '</ul>';
    return '<div class="v6">' + head + pick + campBanner(c) + t.html + '<div class="v6-tabbody">' + body + '</div></div>';
  }

  /* =====================================================================
     화면: 커뮤니티·DM (대화 / 채널 관리 / 캠페인 게시 / 멤버)
     ===================================================================== */
  function lounge() { return (Array.isArray(D.cells) ? D.cells : []).find(function (c) { return c.brandId === D.bid && c.kind !== 'dm'; }) || null; }
  function dmCells() { return (Array.isArray(D.cells) ? D.cells : []).filter(function (c) { return c.brandId === D.bid && c.kind === 'dm'; }); }
  function loadDm(cell, force) {
    if (!cell || (!force && D.dm[cell] !== undefined) || D.busy['dm:' + cell]) return;
    var key = D.key; D.busy['dm:' + cell] = true;
    req('GET', '/community/cells/' + encodeURIComponent(cell) + '/messages?limit=200').then(function (r) { if (D.key === key) { D.dm[cell] = r; markRead(cell, r); } })
      .catch(function (e) { if (D.key === key) { D.dm[cell] = null; D.err['dm:' + cell] = e.message; } }).then(function () { if (D.key === key) { D.busy['dm:' + cell] = false; paint(); } });
  }
  function loadChannels(force) {
    var l = lounge(); if (!l || (!force && D.channels !== undefined) || D.busy.channels) return;
    var key = D.key; D.busy.channels = true;
    req('GET', '/community/cells/' + encodeURIComponent(l.cellId) + '/channels').then(function (r) { if (D.key === key) D.channels = r; })
      .catch(function (e) { if (D.key === key) { D.channels = null; D.err.channels = e.message; } }).then(function () { if (D.key === key) { D.busy.channels = false; paint(); } });
  }
  function memberOf(cell) { return (Array.isArray(D.members) ? D.members : []).find(function (m) { return m.dmCellId === cell; }) || null; }
  function needsReply(cell) { var u = D.unread[cell]; if (u && u.unread) return true; var ms = D.dm[cell]; return !!(ms && ms.length && ms[ms.length - 1].authorKind === 'creator'); }
  /* 1:1 DM — 관련 캠페인은 명시적으로 고른 것만(기본: 일반 문의). 정보 패널·답장 태그·AI 초안이 같은 선택을 쓴다.
     모바일은 목록 → 대화 한 화면씩(뒤로 가기로 목록). */
  function dmRelated(mem) { return mem ? allApps().filter(function (r) { return r.x.creatorId === mem.creatorId; }) : []; }
  function dmCampOf(cell, rel) { var v = (U.dmCamp || {})[cell] || ''; return rel.find(function (r) { return r.c.campaignId === v; }) || null; }
  function dmInbox() {
    var list = dmCells().slice().sort(function (x, y) { return (needsReply(y.cellId) ? 1 : 0) - (needsReply(x.cellId) ? 1 : 0); });
    if (!U.dmSel || !list.some(function (c) { return c.cellId === U.dmSel; })) { U.dmSel = list.length ? list[0].cellId : null; U.dmPicked = false; }
    var cell = U.dmSel, msgs = cell ? D.dm[cell] : null, mem = cell ? memberOf(cell) : null; if (cell) loadDm(cell);
    var who = function (c) { var m = memberOf(c.cellId); return m ? '@' + m.handle : c.name; };
    var rel = dmRelated(mem), cur = cell ? dmCampOf(cell, rel) : null, ai = (U.dmAi || {})[cell];
    var campName = function (id) { return (campById(id) || {}).name || ''; };
    var picker = '<div class="v6-field c8-dmcamp"><label for="dm-camp">관련 캠페인</label><select id="dm-camp" onchange="C8.dmCamp(\'' + js(cell || '') + '\',this.value)"><option value="">일반 문의 (캠페인 없음)</option>' +
      rel.map(function (r) { return '<option value="' + a(r.c.campaignId) + '"' + (cur && cur.c.campaignId === r.c.campaignId ? ' selected' : '') + '>' + h(r.c.name) + ' · ' + h(PST[st(r.x)] || '') + '</option>'; }).join('') + '</select><span class="hint">' + (rel.length ? '고른 캠페인의 조건·기한만 보여주고, 답장과 AI 초안도 이 캠페인 기준으로 작성해요.' : '이 크리에이터가 신청한 캠페인이 없어요.') + '</span></div>';
    return '<div class="v6-inbox c8-md' + (U.dmPicked ? ' c8-has-sel' : '') + '"><ul class="v6-ilist" aria-label="대화 목록">' + (list.map(function (c) { var u = D.unread[c.cellId]; return '<li><button type="button" class="v6-ithread' + (c.cellId === cell ? ' on' : '') + '" onclick="C8.openDm(\'' + js(c.cellId) + '\')"><b>' + h(who(c)) + '</b><span class="v6-last">' + h(((D.dm[c.cellId] || []).slice(-1)[0] || {}).original || '') + '</span>' + (needsReply(c.cellId) ? chip('답장 필요' + (u && u.unread ? ' · ' + u.unread : ''), 'warn') : chip('완료', 'ok')) + '</button></li>'; }).join('') || '<li class="v6-empty">대화가 없어요. 크리에이터가 브랜드에 참여하면 1:1 대화가 생겨요.</li>') + '</ul>' +
      (cell ? '<div class="v6-iconvo"><div class="c8-back">' + btn('← 대화 목록', 'C8.dmBack()', 'ghost') + '</div><div class="v6-ihead"><b id="c8-dm-h" tabindex="-1">' + h(mem ? '@' + mem.handle : cell) + '</b>' + picker + '</div>' +
        '<div class="v6-feed">' + (msgs === undefined ? '<p class="v6-meta">불러오는 중…</p>' : msgs === null ? '<p class="alert warn">대화를 불러오지 못했어요.</p>' : (msgs.map(function (m) { var mine = m.authorKind !== 'creator'; return '<div class="v6-msg' + (mine ? ' me' : '') + '"><span class="v6-av" aria-hidden="true">' + h(initials(mine ? brandName() : m.author)) + '</span><div><p class="v6-mh">' + h(mine ? brandName() + ' 담당' : m.author) + ' · ' + h(String(m.at || '').slice(5, 16).replace('T', ' ')) + (m.campaignId && campName(m.campaignId) ? ' · ' + h(campName(m.campaignId)) : '') + '</p><p>' + h(m.original) + '</p></div></div>'; }).join('') || '<p class="v6-meta">아직 메시지가 없어요.</p>')) + '</div>' +
        '<div class="v6-compose c8-write"><label for="' + fid('DM.' + cell) + '">답장 입력 <span class="v6-meta">' + (cur ? h(cur.c.name) + ' 관련 답장으로 보내요' : '일반 문의 답장으로 보내요') + '</span></label><textarea id="' + fid('DM.' + cell) + '" data-f="DM.' + a(cell) + '" maxlength="2000" placeholder="답장을 입력하세요"' + inv('DM.' + cell) + '>' + h(fv('DM.' + cell)) + '</textarea>' + errOf('DM.' + cell) +
        (ai ? '<div class="alert info c8-ai" role="status"><b>AI 초안이에요 — 보내기 전에 내용을 확인하고 고쳐 주세요.</b> 자동으로 보내지 않아요.<ul>' + ai.evidence.map(function (e) { return '<li>' + h(e) + '</li>'; }).join('') + '</ul></div>' : '') +
        '<div class="v6-actions">' + btn(busy('aiDm') ? 'AI 초안 작성 중…' : 'AI 초안', "C8.aiDm('" + js(cell) + "')", '', busy('aiDm') ? ' disabled' : '') + btn(busy('dm') ? '보내는 중…' : '보내기', "C8.sendDm('" + js(cell) + "')", 'pri', busy('dm') ? ' disabled' : '') + '</div></div></div>' +
        '<aside class="v6-iinfo" aria-label="캠페인 정보">' + (cur ? pimg(prodById(cur.c.productId), 56, cur.c.product) + '<dl class="v6-kv"><dt>캠페인</dt><dd>' + h(cur.c.name) + '</dd><dt>보상</dt><dd>' + h(agreedText(cur.x) || rewardText(cur.c)) + '</dd><dt>샘플</dt><dd>' + (cur.x.sampleRequired === false ? '없음' : h(shipText(cur.x))) + '</dd><dt>제출 기한</dt><dd>' + h(condOf(cur.c, '제출 기한:') || '—') + '</dd><dt>상태</dt><dd>' + h(PST[st(cur.x)] || '') + '</dd></dl>' : '<p class="v6-meta"><b>일반 문의</b><br>관련 캠페인을 고르면 그 캠페인의 조건·기한만 여기에 보여요.</p>') + '</aside>' : '') + '</div>';
  }
  function channelAdmin() {
    loadChannels(); var l = lounge();
    if (!l) return '<p class="v6-empty">이 브랜드의 커뮤니티 공간이 아직 없어요.</p>';
    if (D.channels === undefined) return loading('채널');
    if (D.channels === null) return failBox('channels', '채널');
    var cs = camps().filter(function (c) { return c.lifecycle !== 'draft'; }), opt = [['', '없음']].concat(cs.map(function (c) { return [c.campaignId, c.name]; }));
    return '<p class="v6-meta">채널을 추가·수정하면 크리에이터 사이드바에 바로 보여요. 삭제 대신 보관해요.</p><ul class="v6-list">' + D.channels.map(function (c) {
      if (U.chEdit === c.key) return '<li class="v6-row v6-editrow"><div class="v6-form">' + inp('이름', 'CH.' + c.key + '.name', { req: true, value: c.name, max: 40 }) + inp('설명', 'CH.' + c.key + '.desc', { opt: true, value: c.description, max: 120 }) +
        (c.key === 'notice' ? '<p class="v6-meta">공지사항은 읽기 전용으로 고정돼요.</p>' : sel('공개 범위', 'CH.' + c.key + '.vis', [['public', '누구나 글쓰기'], ['readonly', '읽기 전용 (브랜드만 글쓰기)']], { value: c.visibility })) + sel('연결 캠페인', 'CH.' + c.key + '.camp', opt, { value: c.campaignId || '' }) + '</div><div class="v6-actions">' + btn(busy('ch') ? '저장 중…' : '완료', "C8.chSave('" + js(c.key) + "')", 'pri') + btn('취소', 'C8.chEdit(null)', 'ghost') + '</div></li>';
      return '<li class="v6-row"><div class="v6-grow"><b># ' + h(c.name) + '</b><span class="v6-meta">' + h(c.description || '설명 없음') + ' · ' + (c.visibility === 'readonly' ? '읽기 전용' : '누구나 글쓰기') + (c.campaignName ? ' · 연결: ' + h(c.campaignName) : '') + '</span></div>' + (c.archived ? chip('보관됨') : chip('사용 중', 'ok')) + btn('편집', "C8.chEdit('" + js(c.key) + "')") + (c.base ? '' : btn(c.archived ? '다시 사용' : '보관', "C8.chArchive('" + js(c.key) + "'," + !c.archived + ')', 'ghost')) + '</li>';
    }).join('') + '</ul><section class="v6-sec"><h3>채널 추가</h3><div class="v6-form">' + inp('이름', 'NC.name', { req: true, ph: '예: 촬영 팁', max: 40 }) + inp('설명', 'NC.desc', { opt: true, max: 120 }) +
      sel('공개 범위', 'NC.vis', [['public', '누구나 글쓰기'], ['readonly', '읽기 전용']]) + sel('연결 캠페인', 'NC.camp', opt) + '</div><div class="v6-actions">' + btn(busy('nc') ? '추가 중…' : '채널 추가', 'C8.chAdd()', 'pri', busy('nc') ? ' disabled' : '') + '</div></section>';
  }
  function postCard(c) { var p = prodById(c.productId); return '<div class="v6-postcard">' + pimg(p, 56, c.product) + '<div><p class="v6-mh">새 캠페인이 등록됐어요</p><b>' + h(c.name) + '</b><p class="v6-meta">' + h(rewardText(c)) + ' · ' + h(contentText(c)) + ' · ' + ctryText(c.countries) + '</p></div></div>'; }
  function campaignPost() {
    loadChannels();
    var list = camps().filter(function (c) { return c.lifecycle === 'published' && c.status === 'open'; });
    if (!U.postCamp || !list.some(function (c) { return c.campaignId === U.postCamp; })) U.postCamp = (list[0] || {}).campaignId;
    var chs = (Array.isArray(D.channels) ? D.channels : []).filter(function (c) { return !c.archived; });   // 기본 5채널 + 직접 추가한 사용 중 채널
    if (!U.postCh || !chs.some(function (c) { return c.key === U.postCh; })) U.postCh = 'notice';
    var c = campById(U.postCamp);
    return '<div class="v6-form"><div class="v6-field"><label for="post-camp">1. 캠페인</label><select id="post-camp" onchange="C8.pick(\'postCamp\',this.value)">' + list.map(function (x) { return '<option value="' + a(x.campaignId) + '"' + (x.campaignId === U.postCamp ? ' selected' : '') + '>' + h(x.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="v6-field"><label for="post-ch">2. 게시 채널</label><select id="post-ch" onchange="C8.pick(\'postCh\',this.value)">' + chs.map(function (x) { return '<option value="' + a(x.key) + '"' + (x.key === U.postCh ? ' selected' : '') + '># ' + h(x.name) + '</option>'; }).join('') + '</select><span class="hint">사용 중인 채널(직접 추가한 채널 포함)에 게시할 수 있어요. 보관한 채널은 목록에 없어요.</span></div></div>' +
      (c ? '<p class="v6-kicker">3. 미리보기 (크리에이터 채널·캠페인 공지에 이렇게 보여요)</p>' + postCard(c) + errOf('post') + '<div class="v6-actions">' + btn(busy('post') ? '게시 중…' : '4. 게시', 'C8.post()', 'pri', busy('post') ? ' disabled' : '') + '</div>' : '<p class="v6-empty">모집 중인 캠페인이 없어요.</p>');
  }
  function scCommunity() {
    need('cells', 'members', 'camps', 'prods'); allApps();
    var t = tabs('bc', [['dm', '대화'], ['ch', '채널 관리'], ['post', '캠페인 게시'], ['mem', '멤버']], 'dm'), body;
    if (!loaded('cells')) body = loading('대화');
    else if (t.cur === 'dm') body = dmInbox();
    else if (t.cur === 'ch') body = channelAdmin();
    else if (t.cur === 'post') body = campaignPost();
    else body = !loaded('members') ? loading('멤버') : D.members === null ? failBox('members', '멤버') : '<ul class="v6-list">' + (D.members.map(function (x) { return '<li class="v6-row"><div class="v6-grow"><b>@' + h(x.handle) + '</b><span class="v6-meta">' + h(CTRY[x.country] || x.country || '국가 미입력') + ' · ' + h(PLATFORM[x.platform] || x.platform || '') + (x.verified ? ' · 운영팀 확인 크리에이터' : '') + ' · ' + h(String(x.joinedAt).slice(0, 10)) + ' 참여</span></div>' + chip(x.collaborations ? '캠페인 참여' : x.applications ? '신청함' : '멤버', x.collaborations ? 'ok' : '') + btn('대화', "C8.openDm('" + js(x.dmCellId) + "')") + '</li>'; }).join('') || '<li class="v6-empty">아직 멤버가 없어요.</li>') + '</ul>';
    return '<div class="v6">' + ctxHead('커뮤니티·DM', '‘답장 필요’ 대화를 먼저 보여 줘요. 채널과 캠페인 게시도 여기서 관리해요.') + t.html + '<div class="v6-tabbody">' + body + '</div></div>';
  }

  /* =====================================================================
     화면: 아웃리치·인박스 (이메일 연결 / 받는 사람 / 메일 작성·검수 / 회신함 / 발송 로그)
     실제 발송은 기존 검수·승인 흐름(초안 저장 → 발송 로그에서 승인) 그대로. 이 화면은 메일을 직접 보내지 않는다.
     ===================================================================== */
  function accounts() { return (D.gmail && D.gmail.accounts) || []; }
  function scMailConnect() {
    need('gmail');
    var head = ctxHead('이메일 연결', '메일을 보내고 답장을 받으려면 먼저 보내는 계정을 연결해요.');
    if (!loaded('gmail')) return '<div class="v6">' + head + loading('연결 계정') + '</div>';
    if (D.gmail === null) return '<div class="v6">' + head + failBox('gmail', '연결 계정') + '</div>';
    var demo = D.gmail.demo;
    return '<div class="v6">' + head + '<div class="v6-provs"><div class="v6-prov"><b>Gmail (Google Workspace 포함)</b><span class="v6-meta">' + (demo ? '이 서버는 Google 연동 설정 전이에요. 운영 서버에서만 실제 Google 창이 열려요.' : '권한 안내를 확인하고 새 창에서 Google 로그인 후 허용을 눌러요.') + '</span>' + btn(busy('gconn') ? '여는 중…' : 'Google로 Gmail 연결', 'C8.gmailConnect()', 'pri', demo || busy('gconn') ? ' disabled' : '') + '</div>' +
      '<div class="v6-prov"><b>Outlook · Microsoft 365</b><span class="v6-meta">준비 중이에요.</span><button type="button" class="btn" disabled>준비 중</button></div><div class="v6-prov"><b>기타 이메일 (IMAP/SMTP)</b><span class="v6-meta">준비 중이에요.</span><button type="button" class="btn" disabled>준비 중</button></div></div>' +
      '<section class="v6-sec"><h2>연결된 계정</h2><ul class="v6-list">' + (accounts().map(function (x) { return '<li class="v6-row"><div class="v6-grow"><b class="v6-wrap">' + h(x.email) + '</b><span class="v6-meta">Gmail · 연결됨 · ' + h(String(x.connectedAt).slice(5, 10)) + ' · 오늘 남은 발송 ' + (x.remainingToday != null ? x.remainingToday : '—') + '/' + x.todayCap + (x.canRead ? ' · 답장 수신 가능' : ' · 답장 읽기 권한 없음') + (x.syncError ? ' · 동기화 오류: ' + h(x.syncError) : '') + '</span></div>' +
        chip(x.sendingPaused ? '발송 중지' + (x.pauseReason ? ' · ' + h(x.pauseReason) : '') : '정상', x.sendingPaused ? 'warn' : 'ok') + btn(x.sendingPaused ? '발송 재개' : '발송 중지', "C8.gmailSending('" + js(x.accountId) + "'," + !x.sendingPaused + ')') + btn('연결 해제', "C8.gmailDisconnect('" + js(x.accountId) + "')", 'ghost') + '</li>'; }).join('') || '<li class="v6-empty">연결된 계정이 없어요. 메일을 보내려면 먼저 연결하세요.</li>') + '</ul>' +
      '<p class="v6-meta">보내기 한도는 계정당 하루 ' + ((accounts()[0] || {}).todayCap || 200) + '통 이하(앱 기준)이며 메일 제공자 정책을 따라요. 여러 계정을 돌려 써서 한도를 피하는 방식은 쓰지 않아요.</p></section></div>';
  }
  function selAdd(rows) { var have = {}; U.sel.forEach(function (r) { have[r.email] = 1; }); rows.forEach(function (r) { if (!have[r.email]) { U.sel.push(r); have[r.email] = 1; } }); }
  function scInvite() {
    need('prods', 'inbox');
    var t = tabs('rc', [['db', '보유 크리에이터 DB'], ['inbox', '받은 메일'], ['csv', 'CSV 붙여넣기']], 'db'), body = '', picked = {}; U.sel.forEach(function (r) { picked[r.email] = 1; });
    if (t.cur === 'db') {
      if (!U.candProd || !prodById(U.candProd)) U.candProd = (prods()[0] || {}).productId;
      var key = U.candProd + '|' + (U.candCtry || ''), res = D.cand[key];
      body = '<div class="v6-filters"><div class="v6-field"><label for="cand-p">제품 (적합도 기준)</label><select id="cand-p" onchange="C8.pick(\'candProd\',this.value)">' + prods().map(function (p) { return '<option value="' + a(p.productId) + '"' + (p.productId === U.candProd ? ' selected' : '') + '>' + h(p.name) + '</option>'; }).join('') + '</select></div>' +
        '<div class="v6-field"><label for="cand-c">국가</label><select id="cand-c" onchange="C8.pick(\'candCtry\',this.value)"><option value="">전체</option>' + Object.keys(CTRY).map(function (k) { return '<option value="' + k + '"' + (U.candCtry === k ? ' selected' : '') + '>' + CTRY[k] + '</option>'; }).join('') + '</select></div>' + btn(busy('cand') ? '찾는 중…' : '후보 찾기', 'C8.cand()', '', !U.candProd || busy('cand') ? ' disabled' : '') + '</div>' +
        (!prods().length ? '<p class="v6-empty">제품을 먼저 등록하면 제품에 맞는 후보를 찾을 수 있어요.</p>' : !res ? '<p class="v6-meta">‘후보 찾기’를 누르면 보유 크리에이터 DB에서 이메일이 있는 후보를 제품 적합도 순으로 보여요.</p>' :
          '<p class="v6-meta">결과 ' + res.candidates.length + '명 · 선택 ' + U.sel.length + '명 · ' + h(res.note || '') + '</p><ul class="v6-list">' + (res.candidates.map(function (c) { var e = String(c.email || '').toLowerCase(); return '<li class="v6-row"><label class="v6-inline v6-grow"><input type="checkbox" onchange="C8.pickRecipient(this,\'' + js(e) + '\',\'' + js(c.handle || c.displayName || '') + '\',\'' + js(c.country || '') + '\')"' + (picked[e] ? ' checked' : '') + '><span><b>@' + h(c.handle) + '</b> <span class="v6-meta v6-wrap">' + h(e) + ' · ' + h(CTRY[c.country] || c.country || '') + ' · ' + h((c.evidence || []).slice(0, 2).join(' · ')) + '</span></span></label>' + (c.emailVerified ? '' : chip('이메일 미검증', 'warn')) + '</li>'; }).join('') || '<li class="v6-empty">조건에 맞는 후보가 없어요.</li>') + '</ul>');
    }
    if (t.cur === 'inbox') body = '<p class="v6-meta">회신함에 있는 사람을 다시 고를 수 있어요. 수신 거부로 분류한 사람은 고를 수 없어요.</p><ul class="v6-list">' + ((Array.isArray(D.inbox) ? D.inbox : []).map(function (x) { var e = String(x.creatorEmail || '').toLowerCase(), out = (x.task || {}).label === 'optout'; return '<li class="v6-row"><label class="v6-inline v6-grow">' + (out ? '' : '<input type="checkbox" onchange="C8.pickRecipient(this,\'' + js(e) + '\',\'' + js(x.handle || '') + '\',\'\')"' + (picked[e] ? ' checked' : '') + '>') + '<span><b>' + h(x.handle || e) + '</b> <span class="v6-meta v6-wrap">' + h(e) + ' · ' + h(x.subject || '') + '</span></span></label>' + (out ? chip('수신 거부', 'err') : '') + '</li>'; }).join('') || '<li class="v6-empty">회신이 아직 없어요.</li>') + '</ul>';
    if (t.cur === 'csv') body = inp('CSV 붙여넣기 (이름,이메일,국가)', 'CSV', { area: true, ph: 'Kai Lee,kai@example.com,US', hint: '한 줄에 한 명. 파일 업로드·발송은 하지 않아요. 수신 거부·최근 연락 여부는 ‘메일 작성·검수 > 제외 확인’에서 서버가 확인해요.' }) +
      '<div class="v6-actions">' + btn('검수 목록 만들기', 'C8.csvCheck()') + '</div>' + (U.csvReview ? '<ul class="v6-list">' + U.csvReview.map(function (r) { return '<li class="v6-row"><div class="v6-grow"><b>' + h(r.name || '(이름 없음)') + '</b><span class="v6-meta v6-wrap">' + h(r.email) + ' · ' + h(r.country) + '</span></div>' + chip(r.reason || '통과', r.reason ? 'err' : 'ok') + '</li>'; }).join('') + '</ul><div class="v6-actions">' + btn('검수 통과 ' + U.csvReview.filter(function (r) { return !r.reason; }).length + '명 선택에 추가', 'C8.csvAdd()', 'pri') + '</div>' : '');
    return '<div class="v6">' + ctxHead('받는 사람 찾기', '수신 메일·보유 DB·CSV에서 고르고 리스트로 저장해요.') + t.html + '<div class="v6-tabbody">' + body + '</div>' +
      '<section class="v6-sec"><h3>선택 ' + U.sel.length + '명</h3>' + (U.sel.length ? '<p class="v6-meta v6-wrap">' + h(U.sel.slice(0, 12).map(function (r) { return r.email; }).join(', ')) + (U.sel.length > 12 ? ' 외 ' + (U.sel.length - 12) + '명' : '') + '</p>' : '') +
      '<div class="v6-inlinefield"><div class="v6-field"><label for="list-name">리스트 이름</label><input id="list-name" type="text" data-f="listName" value="' + a(fv('listName')) + '" placeholder="예: 미국 스킨케어 1차"></div>' + btn('리스트로 저장', 'C8.saveList()') + btn('선택 비우기', 'C8.clearSel()', 'ghost') + '</div>' + errOf('list') +
      '<p class="v6-meta">리스트는 이 브라우저 탭에서만 유지돼요(서버 저장 기능은 아직 없어요). 받는 사람 이메일을 브라우저에 오래 남기지 않아요.</p>' +
      (U.lists.length ? '<ul class="v6-list">' + U.lists.map(function (l, i) { return '<li class="v6-row"><div class="v6-grow"><b>' + h(l.name) + '</b><span class="v6-meta">' + l.rows.length + '명</span></div>' + btn('불러오기', 'C8.loadList(' + i + ')') + '</li>'; }).join('') + '</ul>' : '') + '</section>' +
      '<div class="v6-actions v6-bar">' + btn('선택 ' + U.sel.length + '명으로 메일 작성', "C8.go('b-mailprep')", 'pri') + '</div></div>';
  }
  function scMailprep() {
    need('camps', 'prods', 'gmail');
    var step = U.mail, cp = function (k, d) { return fv('M.' + k, d); }, camp = campById(cp('camp')), p = camp ? prodById(camp.productId) : null;
    var conn = accounts().filter(function (x) { return !x.sendingPaused; }), sender = accounts().find(function (x) { return x.accountId === cp('sender'); });
    var steps = ['매칭', '내용', '수신자별 미리보기', '제외 확인', '승인·검수 목록'], body = '';
    if (step === 1) body = '<div class="v6-form">' + sel('캠페인', 'M.camp', [['', '고르세요']].concat(camps().filter(function (c) { return c.lifecycle === 'published'; }).map(function (c) { return [c.campaignId, c.name]; })), { req: true, live: true }) +
      '<div class="v6-field"><span class="lab">제품</span><p>' + (p ? pimg(p, 32) + ' ' + h(p.name) : '캠페인을 고르면 자동으로 연결돼요') + '</p></div>' +
      sel('보내는 계정', 'M.sender', [['', '고르세요']].concat(conn.map(function (x) { return [x.accountId, x.email + ' · 오늘 남은 ' + x.remainingToday + '통']; })), { req: true, hint: conn.length ? '' : '발송 가능한 연결 계정이 없어요. ‘이메일 연결’ 탭에서 먼저 연결하세요.' }) +
      '<div class="v6-field"><span class="lab">받는 사람</span><p>' + U.sel.length + '명 선택됨 ' + (U.sel.length ? '' : btn('받는 사람 찾기', "C8.go('b-invite')", 'ghost')) + '</p></div></div>';
    if (step === 2) body = '<div class="v6-form">' + inp('AI 초안 요청 (선택)', 'M.brief', { area: true, wide: true, ph: '제안할 제품, 협업 방식, 언어를 적어 주세요.', max: 2000, hint: btn(busy('compose') ? 'AI 작성 중…' : 'AI 초안 만들기', 'C8.compose()', 'ghost', busy('compose') ? ' disabled' : '') + ' 저장한 브랜드 정보로 초안만 써요. 내용을 확인한 뒤 저장하세요.' }) +
      inp('제목', 'M.subject', { req: true, wide: true, max: 150 }) + inp('본문', 'M.body', { req: true, area: true, wide: true, max: 9000, hint: '저장할 때 브랜드 참여 링크와 수신 거부 링크가 자동으로 붙어요. 받는 사람마다 개인 참여 링크가 들어가요.' }) + '</div>';
    if (step === 3) { var ok = U.sel; var pc = ok.find(function (r) { return r.email === U.previewTo; }) || ok[0]; body = ok.length ? '<div class="v6-field v6-inlinefield"><label for="pv-c">받는 사람</label><select id="pv-c" onchange="C8.pick(\'previewTo\',this.value)">' + ok.map(function (r) { return '<option value="' + a(r.email) + '"' + (pc && pc.email === r.email ? ' selected' : '') + '>' + h(r.name || r.email) + '</option>'; }).join('') + '</select></div>' +
      '<div class="v6-mail"><p class="v6-meta v6-wrap">보내는 사람: ' + h(sender ? sender.email : '—') + ' → ' + h(pc.email) + '</p><b>' + h(cp('subject')) + '</b>' + (p ? pimg(p, 80) : '') + '<p style="white-space:pre-wrap">' + h(cp('body')) + '</p><p class="v6-meta">+ 브랜드 참여 링크(개인별) · 수신 거부 링크</p></div>' : '<p class="v6-empty">받는 사람이 없어요.</p>'; }
    if (step === 4) { var pv = U.preview; body = !pv ? '<p class="v6-meta">서버가 수신 거부·최근 90일 연락·승인 대기 중복을 확인해요.</p>' + btn(busy('pv') ? '확인 중…' : '제외 확인', 'C8.preview()', 'pri', busy('pv') ? ' disabled' : '') :
      '<p>보낼 수 있음 <b>' + pv.eligibleCount + '명</b> · 자동 제외 <b>' + pv.excluded.length + '명</b> · 이 계정 오늘 남은 발송 ' + pv.remainingSystemCapacity + '통' + (pv.sendingPaused ? ' · <b>발송 중지 상태</b>' : '') + '</p><ul class="v6-list">' +
      pv.eligibleEmails.map(function (e) { return '<li class="v6-row"><div class="v6-grow"><b class="v6-wrap">' + h(e) + '</b></div>' + chip('보냄 가능', 'ok') + '</li>'; }).join('') + pv.excluded.map(function (x) { return '<li class="v6-row"><div class="v6-grow"><b class="v6-wrap">' + h(x.email) + '</b></div>' + chip({ opted_out: '수신 거부', recent_contact: '최근 90일 내 연락', approved_queue: '이미 승인 대기열' }[x.reason] || x.reason, 'err') + '</li>'; }).join('') + '</ul><p class="v6-meta">이메일 수는 고유 인원 수가 아니에요.</p>'; }
    if (step === 5) body = '<div class="v6-form">' + inp('승인자', 'M.approver', { req: true, ph: '예: 하린', max: 60, hint: '검수 목록을 만든 사람 이름이에요. 실제 발송 승인은 발송 로그에서 다시 해요.' }) + '</div><div class="v6-actions">' + (sender ? btn(busy('testSend') ? '테스트 보내는 중…' : '내 메일함으로 테스트 발송', 'C8.testSend()', '', busy('testSend') ? ' disabled' : '') : '') +
      btn(busy('mkq') ? '저장 중…' : '검수 목록 만들기 · ' + (U.preview ? U.preview.eligibleCount : U.sel.length) + '명', 'C8.makeQueue()', 'pri', busy('mkq') ? ' disabled' : '') + '</div><p class="v6-meta">이 단계에서는 메일을 보내지 않아요. 초안으로 저장되고, 발송 로그에서 내용을 확인해 승인해야 순차 발송돼요.</p>' +
      (sender ? '<p class="v6-meta">테스트 발송은 보내는 계정 자신(' + h(sender.email) + ')에게만 1통 보내요. 받는 사람 목록에는 보내지 않고, 계정의 하루 한도·일시중지 규칙을 그대로 따라요.</p>' : '') +
      (U.testResult ? '<div class="alert ' + (U.testResult.state === 'sent' ? 'ok' : 'warn') + '" role="status">' + h(U.testResult.state === 'sent' ? U.testResult.to + ' 로 테스트 메일을 보냈어요. 받은편지함에서 확인하세요.' : U.testResult.state === 'blocked' ? (U.testResult.message || '안전 규칙에 걸려 보내지 않았어요.') : '발송 결과를 확인해야 해요 — Gmail 보낸편지함을 확인하세요.') + '</div>' : '');
    return '<div class="v6">' + ctxHead('메일 작성·검수', '연결 → 받는 사람 → 매칭 → 내용 → 미리보기 → 제외 → 승인 순서예요. 저장 후 발송 로그에서 승인해야 보내져요.') +
      '<ol class="v6-steps">' + steps.map(function (l, i) { return '<li><button type="button" onclick="C8.mailGo(' + (i + 1) + ')" aria-current="' + (step === i + 1 ? 'step' : 'false') + '"' + (step === i + 1 ? ' class="on"' : '') + '>' + (i + 1) + '. ' + l + '</button></li>'; }).join('') + '</ol>' +
      '<section class="v6-sec">' + body + errOf('mail') + '</section><div class="v6-actions v6-bar">' + (step > 1 ? btn('이전', 'C8.mailGo(' + (step - 1) + ')') : '') + (step < 5 ? btn('다음', 'C8.mailNext()', 'pri') : '') + '</div></div>';
  }
  var RS = { unreviewed: '답장 필요', interested: '긍정', question: '질문', declined: '거절', optout: '수신 거부' };
  function loadThread(id, force) {
    if (!id || (!force && D.threads[id] !== undefined) || D.busy['t:' + id]) return;
    var key = D.key; D.busy['t:' + id] = true;
    req('GET', '/inbox/threads/' + encodeURIComponent(id)).then(function (r) { if (D.key === key) D.threads[id] = r; }).catch(function (e) { if (D.key === key) { D.threads[id] = null; D.err['t:' + id] = e.message; } })
      .then(function () { if (D.key === key) { D.busy['t:' + id] = false; paint(); } });
  }
  function scReply() {
    need('inbox', 'camps', 'gmail', 'team');
    var head = ctxHead('회신함', '답장 필요·긍정·질문·거절·수신 거부로 나눠 보고, 담당자와 후속 할 일을 정해요.');
    if (!loaded('inbox')) return '<div class="v6">' + head + loading('회신') + '</div>';
    if (D.inbox === null) return '<div class="v6">' + head + failBox('inbox', '회신') + '</div>';
    var all = D.inbox.filter(function (x) { return x.lastDirection === 'in' || (x.task && x.task.revision); });
    var list = all.filter(function (x) { return (!U.rfCamp || x.campaignId === U.rfCamp) && (!U.rfStatus || (x.task || {}).label === U.rfStatus) && (!U.rfSender || x.senderAccountId === U.rfSender); });
    if (U.id && list.some(function (x) { return x.threadId === U.id; })) { if (U.replySel !== U.id) U.replyPicked = true; U.replySel = U.id; }
    var r = list.find(function (x) { return x.threadId === U.replySel; }) || list[0], th = r ? D.threads[r.threadId] : null; if (r) loadThread(r.threadId);
    var acc = function (id) { var x = accounts().find(function (y) { return y.accountId === id; }); return x ? x.email : (id ? '연결 해제된 계정' : '—'); };
    var senders = all.map(function (x) { return x.senderAccountId; }).filter(function (v, i, s) { return v && s.indexOf(v) === i; });
    var task = r ? (r.task || {}) : {}, base = r ? 'RT.' + r.threadId + '.' : '';
    var owners = [['', '미배정']].concat((Array.isArray(D.team) ? D.team : []).map(function (m) { return [m.email, m.email]; }));
    return '<div class="v6">' + head + '<div class="v6-filters"><div class="v6-field"><label for="rf-c">캠페인</label><select id="rf-c" onchange="C8.pick(\'rfCamp\',this.value)"><option value="">전체</option>' + camps().map(function (c) { return '<option value="' + a(c.campaignId) + '"' + (U.rfCamp === c.campaignId ? ' selected' : '') + '>' + h(c.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="v6-field"><label for="rf-s">보내는 계정</label><select id="rf-s" onchange="C8.pick(\'rfSender\',this.value)"><option value="">전체</option>' + senders.map(function (s) { return '<option value="' + a(s) + '"' + (U.rfSender === s ? ' selected' : '') + '>' + h(acc(s)) + '</option>'; }).join('') + '</select></div>' +
      '<div class="v6-field"><label for="rf-st">상태</label><select id="rf-st" onchange="C8.pick(\'rfStatus\',this.value)"><option value="">전체</option>' + Object.keys(RS).map(function (k) { return '<option value="' + k + '"' + (U.rfStatus === k ? ' selected' : '') + '>' + RS[k] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="v6-inbox v6-inbox2 c8-md' + (U.replyPicked && r ? ' c8-has-sel' : '') + '"><ul class="v6-ilist">' + (list.map(function (x) { var lb = (x.task || {}).label || 'unreviewed'; return '<li><button type="button" class="v6-ithread' + (r && r.threadId === x.threadId ? ' on' : '') + '" onclick="C8.replySel(\'' + js(x.threadId) + '\')"><b>' + h(x.handle || x.creatorEmail) + '</b><span class="v6-meta">' + h((campById(x.campaignId) || {}).name || '') + '</span><span class="v6-last">' + h(x.subject || '') + '</span>' + chip(RS[lb] || lb, lb === 'interested' ? 'ok' : lb === 'optout' || lb === 'declined' ? 'err' : 'warn') + '</button></li>'; }).join('') || '<li class="v6-empty">조건에 맞는 회신이 없어요.</li>') + '</ul>' +
      (r ? '<div class="v6-iconvo"><div class="c8-back">' + btn('← 회신 목록', 'C8.replyBack()', 'ghost') + '</div><div class="v6-ihead"><b id="c8-reply-h" tabindex="-1">' + h(r.handle || r.creatorEmail) + '</b><span class="v6-meta v6-wrap">' + h(r.creatorEmail) + ' · ' + h(acc(r.senderAccountId)) + '</span></div>' +
        '<div class="v6-feed">' + (th === undefined || th === null && D.busy['t:' + r.threadId] ? '<p class="v6-meta">불러오는 중…</p>' : !th ? '<p class="alert warn">대화를 불러오지 못했어요.</p>' : th.messages.map(function (m) { var me_ = m.direction === 'out'; return '<div class="v6-msg' + (me_ ? ' me' : '') + '"><span class="v6-av" aria-hidden="true">' + h(initials(me_ ? brandName() : (r.handle || r.creatorEmail))) + '</span><div><p class="v6-mh">' + h(me_ ? (m.fromEmail || brandName()) : (m.fromEmail || r.creatorEmail)) + ' · ' + h(String(m.at).slice(5, 16).replace('T', ' ')) + (me_ ? ' · ' + h({ sent: '발송됨', pending_gate: '승인 대기', sending: '발송 중', review: '결과 확인 필요', failed: '실패' }[m.state] || m.state) : '') + '</p><p style="white-space:pre-wrap">' + h(m.body) + '</p>' + (me_ && m.state === 'pending_gate' ? btn('내용 승인하고 발송', "C8.replySend('" + js(r.threadId) + "'," + Number(m.msgId) + ')', 'pri') : '') + '</div></div>'; }).join('')) + '</div>' +
        '<div class="v6-form">' + sel('상태', base + 'label', Object.keys(RS).map(function (k) { return [k, RS[k]]; }), { value: task.label || 'unreviewed' }) + sel('담당자', base + 'owner', owners, { value: task.owner || '' }) + inp('후속 할 일', base + 'next', { opt: true, wide: true, value: task.nextAction || '', max: 500 }) +
        '<div class="v6-actions v6-wide">' + btn(busy('task') ? '저장 중…' : '후속 처리 저장', "C8.taskSave('" + js(r.threadId) + "')", '', busy('task') ? ' disabled' : '') + '<span class="v6-meta">수신 거부로 저장하면 이 브랜드 발송에서 실제로 제외돼요.</span></div></div>' +
        '<div class="v6-compose c8-write"><label for="' + fid(base + 'draft') + '">답장 초안</label><textarea id="' + fid(base + 'draft') + '" data-f="' + a(base + 'draft') + '" maxlength="20000">' + h(fv(base + 'draft')) + '</textarea>' +
        ((U.replyAi || {})[r.threadId] ? '<div class="alert info c8-ai" role="status"><b>AI 초안이에요 — 저장·발송 전에 내용을 확인하고 고쳐 주세요.</b><ul>' + U.replyAi[r.threadId].evidence.map(function (e) { return '<li>' + h(e) + '</li>'; }).join('') + '</ul></div>' : '') +
        '<div class="v6-actions">' + btn(busy('aiReply') ? 'AI 초안 작성 중…' : 'AI 초안' + (r.campaignId && campById(r.campaignId) ? ' (' + h(campById(r.campaignId).name) + ' 기준)' : ' (일반 문의)'), "C8.aiReply('" + js(r.threadId) + "')", '', busy('aiReply') ? ' disabled' : '') + btn(busy('reply') ? '저장 중…' : '답장 저장 (승인 대기)', "C8.reply('" + js(r.threadId) + "')", 'pri', busy('reply') ? ' disabled' : '') + '</div><p class="v6-meta">저장한 답장은 대화에서 ‘내용 승인하고 발송’을 눌러야 보내져요.</p></div></div>' : '') + '</div></div>';
  }
  var RST = { pending: ['대기', 'info'], sending: ['발송 중', 'info'], sent: ['메일 서비스 접수', 'ok'], review: ['결과 모름', 'warn'], blocked: ['제외', ''], failed: ['실패', 'err'] };
  function scSendlog() {
    need('outreach', 'camps', 'gmail');
    var head = ctxHead('발송 로그', '대기 / 메일 서비스 접수 / 제외 / 결과 모름 / 일시 중지를 구분해요.');
    if (!loaded('outreach')) return '<div class="v6">' + head + loading('발송 기록') + '</div>';
    if (D.outreach === null) return '<div class="v6">' + head + failBox('outreach', '발송 기록') + '</div>';
    var acc = function (id) { var x = accounts().find(function (y) { return y.accountId === id; }); return x ? x.email : '연결 상태 확인 필요'; };
    var rows = []; (D.outreach.batches || []).forEach(function (b) { (b.recipients || []).forEach(function (r) { rows.push({ b: b, r: r, k: b.paused && r.state === 'pending' ? 'paused' : r.state }); }); });
    var L = { pending: '대기', sent: '메일 서비스 접수', blocked: '제외', review: '결과 모름', paused: '일시 중지' }, f = U.logFilter || '';
    var list = rows.filter(function (x) { return !f || x.k === f; });
    var batches = (D.outreach.batches || []).filter(function (b) { return b.state !== 'cancelled'; });
    return '<div class="v6">' + head + '<div class="v6-filters" role="group" aria-label="발송 상태">' + [['', '전체 ' + rows.length]].concat(Object.keys(L).map(function (k) { return [k, L[k] + ' ' + rows.filter(function (x) { return x.k === k; }).length]; })).map(function (x) { return '<button type="button" class="v6-pill" aria-pressed="' + (f === x[0]) + '" onclick="C8.logFilter(\'' + x[0] + '\')">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<section class="v6-sec"><h2>검수·발송 묶음 <span class="v6-count-inline">' + batches.length + '개</span></h2><ul class="v6-list">' + (batches.map(function (b) {
        var pend = b.recipients.some(function (r) { return r.state === 'pending'; });
        return '<li class="v6-row"><div class="v6-grow"><b>' + h(b.subject) + '</b><span class="v6-meta">' + h((campById(b.campaignId) || {}).name || '캠페인 없음') + ' · ' + h(acc(b.gmailAccountId)) + ' · ' + b.recipients.length + '명 · ' + (b.state === 'draft' ? '승인 전 초안' : b.paused ? '일시 중지' : '승인됨') + '</span></div>' +
          (b.state === 'draft' ? btn('내용 승인하고 순차 발송', "C8.batchSend('" + js(b.id) + "')", 'pri') + btn('초안 취소', "C8.batchCancel('" + js(b.id) + "')", 'ghost') : '') +
          (b.state === 'approved' ? btn(b.paused ? '검토 후 재개' : '일시 중지', "C8.batchControl('" + js(b.id) + "'," + !b.paused + ')') + (pend && !b.paused ? btn('남은 수신자 발송', "C8.batchSend('" + js(b.id) + "')") : '') : '') + '</li>';
      }).join('') || '<li class="v6-empty">검수 목록이 없어요. ‘메일 작성·검수’에서 만들어요.</li>') + '</ul>' + (D.outreach.nextCursor ? btn('이전 기록 더 보기', 'C8.moreOutreach()') : '') + '</section>' +
      '<p class="v6-meta">‘메일 서비스 접수’는 받는 사람 수신함 도착 확인이 아니에요. ‘결과 모름’은 자동으로 다시 보내지 않고 담당자가 확인해요.</p>' +
      '<div class="v6-table" role="table"><div class="v6-tr v6-th" role="row"><span role="columnheader">받는 사람</span><span role="columnheader">캠페인</span><span role="columnheader">보내는 계정</span><span role="columnheader">상태</span></div>' +
      (list.map(function (x) { var s = x.k === 'paused' ? ['일시 중지', ''] : RST[x.r.state] || [x.r.state, '']; return '<div class="v6-tr" role="row"><span role="cell" class="v6-wrap"><b>' + h(x.r.email) + '</b></span><span role="cell">' + h((campById(x.b.campaignId) || {}).name || '—') + '</span><span role="cell" class="v6-wrap">' + h(acc(x.b.gmailAccountId)) + '</span><span role="cell">' + chip(s[0], s[1]) + (x.r.state === 'review' ? '<br><span class="v6-meta">자동 재전송 안 함 · 수동 확인</span>' : '') + '</span></div>'; }).join('') || '<div class="v6-empty">발송 기록이 없어요.</div>') + '</div></div>';
  }

  /* =====================================================================
     화면: 팀 (서버 역할 그대로: 소유자·운영자·조회자. owner 가 운영자·조회자 계정을 등록하고 초대 링크를 발급)
     ===================================================================== */
  var ROLE = { owner: '소유자 · 모든 기능 + 팀 역할 변경', manager: '운영자 · 이 브랜드 전체 운영(캠페인·제품·메일·DM·청구 결제) · 팀 역할 변경 불가', viewer: '조회자 · 보기만 (모든 변경은 서버에서 거부)' };
  function myRole() { if (me().kind === 'admin') return 'admin'; var m = (Array.isArray(D.team) ? D.team : []).find(function (x) { return x.userId === me().userId || x.email === me().email; }); return m ? m.role : ''; }
  function scTeam() {
    need('team');
    var head = ctxHead('팀', '비밀번호는 발급하지 않아요. 초대 링크로 본인이 직접 비밀번호를 정해요.');
    if (!loaded('team')) return '<div class="v6">' + head + loading('팀') + '</div>';
    if (D.team === null) return '<div class="v6">' + head + failBox('team', '팀') + '</div>';
    var mine = myRole(), canEdit = mine === 'owner' || mine === 'admin';
    var ST = { active: ['활성', 'ok'], suspended: ['접근 중지', 'err'], pending: ['초대 대기', 'info'] };
    return '<div class="v6">' + head + '<div class="v6-table" role="table"><div class="v6-tr v6-th" role="row"><span role="columnheader">계정</span><span role="columnheader">이메일</span><span role="columnheader">역할·권한</span><span role="columnheader">상태</span><span role="columnheader"></span></div>' +
      D.team.map(function (m) { var s = m.state === 'active' && m.passwordSet === false ? ST.pending : ST[m.state] || [m.state, '']; return '<div class="v6-tr" role="row"><span role="cell"><b>' + h(m.email.split('@')[0]) + '</b><br><span class="v6-meta">' + h(String(m.joinedAt).slice(0, 10)) + ' 생성' + (m.userId === me().userId ? ' · 나' : '') + '</span></span><span role="cell" class="v6-wrap">' + h(m.email) + '</span><span role="cell">' + h(ROLE[m.role] || m.role) + '</span><span role="cell">' + chip(s[0], s[1]) + '</span><span role="cell" class="v6-actions">' +
        (canEdit ? '<label class="sr" for="role-' + a(m.userId) + '">역할 변경</label><select id="role-' + a(m.userId) + '" onchange="C8.setRole(\'' + js(m.userId) + '\',this.value)"' + (busy('role') ? ' disabled' : '') + '>' + ['owner', 'manager', 'viewer'].map(function (r) { return '<option value="' + r + '"' + (m.role === r ? ' selected' : '') + '>' + { owner: '소유자', manager: '운영자', viewer: '조회자' }[r] + '</option>'; }).join('') + '</select>' : '') + (canEdit && m.state === 'active' && m.passwordSet === false ? btn(busy('tlink') ? '만드는 중…' : '초대 링크 다시 만들기', "C8.teamLink('" + js(m.userId) + "')", 'ghost', busy('tlink') ? ' disabled' : '') : '') + '</span></div>'; }).join('') + '</div>' +
      '<p class="v6-meta">역할을 바꾸면 그 사람의 기존 로그인은 끊기고 다시 로그인해야 해요. 마지막 활성 소유자는 강등할 수 없어요.' + (canEdit ? '' : ' 역할 변경은 소유자만 할 수 있어요.') + ' 캠페인별 담당 제한은 아직 지원하지 않아요 — 운영자는 이 브랜드의 모든 캠페인을 다뤄요.</p>' +
      '<section class="v6-sec"><h2>팀원 등록</h2>' + (canEdit ?
        '<p class="v6-meta">운영자·조회자 계정을 만들고 초대 링크를 받아요. 링크는 자동으로 보내지지 않아요 — 등록한 분에게 직접 전달하면 본인이 비밀번호를 정해요(72시간 후 만료).</p><div class="v6-form">' +
        inp('이메일', 'TM.email', { req: true, type: 'email', ph: 'name@company.com', max: 200 }) + sel('역할', 'TM.role', [['manager', '운영자'], ['viewer', '조회자 (보기만)']]) + '</div>' +
        '<div class="v6-actions">' + btn(busy('tinv') ? '등록 중…' : '등록하고 초대 링크 만들기', 'C8.teamInvite()', 'pri', busy('tinv') ? ' disabled' : '') + '</div>' +
        (U.invite ? '<div class="alert ok" role="status" id="c8-invite"><b>' + h(U.invite.email) + '</b> 초대 링크를 만들었어요. 72시간 안에 직접 전달하세요 — 다시 만들면 이전 링크는 쓸 수 없어요.<div class="v6-field v6-wide"><label for="c8-invite-link">초대 링크</label><input id="c8-invite-link" type="text" readonly value="' + a(U.invite.link) + '" onfocus="this.select()"></div>' + btn('링크 복사', 'C8.copyInvite()') + '</div>' : '')
        : '<p class="v6-meta">팀원 등록과 초대 링크 발급은 소유자만 할 수 있어요.</p>') + '</section></div>';
  }

  /* =====================================================================
     화면: 월별 청구 (현행 과금 정책·청구서·카드 결제는 engine-live 의 감사된 결제 화면을 그대로 쓴다)
     ===================================================================== */
  function scBilling() {
    var head = ctxHead('월별 청구', '현행 과금 기준과 월별 청구서를 확인해요. 결제는 청구서 단위로만 진행돼요.');
    if (!U.init.bill) { U.init.bill = true; if (typeof window.refreshBilling === 'function') window.refreshBilling(); }
    var b = window.__billing;
    var stats = b ? [['집계된 크리에이터(누적)', b.quantity], ['1명당 단가', money(b.unitPrice, 'KRW')], ['누적 사용 금액', money(b.usageAmount, 'KRW')], ['청구 방식', b.collection === 'monthly_invoice' ? '월말 합산 청구' : b.internal ? '청구 없음' : '—'], ['카드 결제', b.collectionEnabled ? '사용 가능' : '준비 중']] : [];
    return '<div class="v6">' + head + (b ? '<div class="v6-stats">' + stats.map(function (x) { return '<div class="v6-stat"><span>' + x[0] + '</span><b>' + h(x[1]) + '</b></div>'; }).join('') + '</div>' : loading('청구 요약')) +
      '<div class="v6-note"><p><b>청구 기준</b>: 크리에이터가 브랜드에 가입하고 운영팀이 계정 확인을 마치면 1명으로 집계돼요. 같은 크리에이터는 한 번만 집계돼요.' + (b && b.message ? ' (' + h(b.message) + ')' : '') + '</p>' +
      '<p>한 달 사용 금액은 월말에 청구서로 합산되고, 청구서 상태와 결제 내역은 아래에서 확인해요.</p></div>' +
      '<section class="v6-sec"><div class="v6-actions">' + btn('새로고침', 'C8.billRefresh()') + '</div>' +
      '<div class="c8-legacy-billing">' + (typeof window.billingCardHtml === 'function' ? window.billingCardHtml() : '') + (typeof window.billingInvoicesHtml === 'function' ? window.billingInvoicesHtml() : '<p>청구서를 불러오지 못했어요.</p>') + '</div></section></div>';
  }
  function scResults() {
    need('camps', 'prods');
    var head = ctxHead('결과·보상', '같은 참여 건에서 집계해요. 조회·판매 데이터는 연동 전이라 ‘미연동’으로 표시해요.');
    if (!loaded('camps')) return '<div class="v6">' + head + loading('캠페인') + '</div>';
    allApps();
    return '<div class="v6">' + head + '<div class="v6-table v6-results" role="table"><div class="v6-tr v6-th" role="row"><span role="columnheader">캠페인</span><span role="columnheader">지원</span><span role="columnheader">선정·진행</span><span role="columnheader">영상 제출</span><span role="columnheader">검수 완료</span><span role="columnheader">조회·판매</span><span role="columnheader">보상 상태</span></div>' +
      (camps().filter(function (c) { return c.lifecycle !== 'draft'; }).map(function (c) {
        var ps = D.apps[c.campaignId], ready = Array.isArray(ps); ps = ps || [];
        var done = ps.filter(function (x) { return st(x) === 'completed'; });
        var paid = function () { var by = {}; done.forEach(function (x) { var t = x.agreedTerms || {}; var cur = t.rewardCurrency || c.rewardCurrency || 'KRW'; by[cur] = (by[cur] || 0) + Number(t.rewardAmount != null ? t.rewardAmount : c.rewardAmount || 0); }); return Object.keys(by).map(function (k) { return money(by[k], k); }).join(' + ') || '0'; };
        var pay = c.rewardType === 'paid' ? '지급 대기 ' + done.length + '건 · ' + paid() + ' (합의 조건 기준, 지급 기록 아님)' : c.rewardType === 'affiliate' ? '플랫폼 정산 · 미연동' : '제품 제공만';
        var cell = function (v) { return ready ? v : '…'; };
        return '<div class="v6-tr" role="row"><span role="cell" class="v6-cellmain">' + pimg(prodById(c.productId), 32, c.product) + '<span><b>' + h(c.name) + '</b><span class="v6-meta">' + h(GOAL[GOAL_OF[c.rewardType] || 'affiliate']) + '</span></span></span><span role="cell">' + cell(ps.length) + '</span><span role="cell">' + cell(ps.filter(function (x) { return ['selected', 'terms_agreed', 'sample_shipped', 'revision_requested'].indexOf(st(x)) >= 0; }).length) + '</span><span role="cell">' + cell(ps.filter(function (x) { return x.contentUrl; }).length) + '</span><span role="cell">' + cell(done.length) + '</span><span role="cell">미연동</span><span role="cell">' + h(ready ? pay : '불러오는 중') + '</span></div>';
      }).join('') || '<div class="v6-empty">캠페인이 없어요.</div>') + '</div><p class="v6-meta">판매금액·조회수는 실제 플랫폼 연동 전까지 만들지 않아요. 지급 완료는 실제 지급 확인 후에만 기록돼요(현재 지급 기록 기능 없음).</p></div>';
  }

  /* =====================================================================
     동작 (window.C8.*) — 모두 실제 API. 실패하면 입력 유지 + 사유 안내.
     ===================================================================== */
  var B = function () { return '/brands/' + encodeURIComponent(D.bid); };
  var C8 = window.C8 = {};
  C8.reload = function (n) { if (n === 'channels') return loadChannels(true); load(n, true); paint(); };
  C8.tab = function (g, k) { U.tab[g] = k; U.err = {}; paint(); };
  C8.go = function (s, id) {
    if (SCREENS.indexOf(s) < 0) s = 'b-today';
    if (s === 'b-products' && U.screen !== 'b-products') U.editProd = null;
    // 참여 건을 보여 주는 화면에 들어올 때마다 지원자 목록을 새로 받는다(다른 사람·크리에이터가 바꾼 상태 반영)
    if (['b-today', 'b-applicants', 'b-samples', 'b-results', 'b-campaigns', 'b-community'].indexOf(s) >= 0) D.apps = {};
    if (s === 'b-reply') load('inbox', true);
    if (s === 'b-sendlog') load('outreach', true);
    U.screen = s; U.id = id || ''; U.err = {}; U.nav = false; U.rail = false; U.pop = false; U.acct = false; U.flash = '';
    pushHash(); paint(); try { var m = document.querySelector('.v2-main'); if (m) m.scrollTop = 0; window.scrollTo(0, 0); } catch (e) {}
  };
  C8.toggle = function (k) { U[k] = !U[k]; paint(); };
  C8.setBrand = function (b) {
    U.pop = false; U.rail = false;
    if (b === D.bid) return paint();
    if (me().kind === 'admin' && typeof window.adminPickBrand === 'function') { window.adminPickBrand(b); return; }
    paint();
  };
  C8.unpick = function () { if (typeof window.adminSwitchBrand === 'function') window.adminSwitchBrand(); };
  C8.account = function () { U.acct = !U.acct; paint(); };
  C8.logout = function () { if (typeof window.authLogout === 'function') window.authLogout(); };
  C8.addBrand = function () { toast(me().kind === 'admin' ? '다른 브랜드는 브랜드 메뉴(▾)의 ‘다른 브랜드 고르기’에서 선택해요.' : '새 브랜드는 가입 신청 후 운영팀 승인으로 추가돼요 (theprlist.net/signup).'); };
  function mobile() { return window.matchMedia && window.matchMedia('(max-width:719px)').matches; }
  function focusDetail(id) { var el = document.getElementById(id); if (!el) return; el.focus({ preventScroll: true }); if (mobile()) { var t = el.closest('.v6-panel, .v6-iconvo') || el; t.scrollIntoView({ block: 'start' }); } }
  C8.openDm = function (cell) { U.tab.bc = 'dm'; U.dmSel = cell; U.dmPicked = true; if (U.screen !== 'b-community') C8.go('b-community'); else paint(); loadDm(cell, true); if (mobile()) focusDetail('c8-dm-h'); else { var t = document.getElementById(fid('DM.' + cell)); if (t) t.focus(); } };
  C8.dmBack = function () { U.dmPicked = false; paint(); var b = document.querySelector('.v6-ithread.on'); if (b) b.focus(); };
  C8.dmCamp = function (cell, v) { U.dmCamp = U.dmCamp || {}; U.dmCamp[cell] = v; if (U.dmAi) delete U.dmAi[cell]; paint(); };
  C8.aiDm = function (cell) {
    var cur = (U.dmCamp || {})[cell] || null, key = D.key;
    if (String(fv('DM.' + cell)).trim() && !confirm('입력 중인 답장을 AI 초안으로 바꿀까요?')) return;
    act('aiDm', req('POST', B() + '/assist/dm-draft', { cell_id: cell, campaign_id: cur }), function (r) {
      if (D.key !== key || ((U.dmCamp || {})[cell] || null) !== (r.campaignId || null)) return;   // 그 사이 캠페인 선택이 바뀌면 버린다
      U.f['DM.' + cell] = r.text; U.dmAi = U.dmAi || {}; U.dmAi[cell] = { evidence: r.evidence || [] };
    }, 'AI 초안을 받지 못했어요. 직접 작성해 주세요.');
  };
  C8.goApp = function (cid, id) { U.appCamp = cid; U.appSel = id; U.appFilter = ''; C8.go('b-applicants'); };
  C8.goSc = function (cid, t) { U.scCamp = cid; U.tab.sc = t || 'ship'; C8.go('b-samples'); };
  C8.pick = function (k, v) { U[k] = v; if (k === 'appCamp') { U.appSel = null; U.appFilter = ''; } if (k === 'appCamp' || k === 'scCamp') loadApps(v, true); paint(); };
  C8.reloadApps = function (cid) { loadApps(cid, true); };
  C8.appFilter = function (k) { U.appFilter = k; U.appSel = null; paint(); };
  C8.appSel = function (id) { U.appSel = id; U.appPicked = true; paint(); if (mobile()) focusDetail('c8-app-h'); };
  C8.appBack = function () { U.appPicked = false; paint(); var b = document.querySelector('.v6-split-list .v6-row.on .btn'); if (b) b.focus(); };

  // 브랜드 학습
  C8.faqAdd = function () { (U.faq = U.faq || []).push({ q: '', a: '' }); paint(); var fs = document.querySelectorAll('.v6-faq input'); if (fs.length) fs[fs.length - 1].focus(); };
  C8.faqDel = function (i) { var L = curLearn(); L.faq.splice(i, 1); U.faq = L.faq; Object.keys(U.f).forEach(function (k) { if (/^L\.faq\./.test(k)) delete U.f[k]; }); paint(); };
  C8.learnSite = function () {
    var url = String(fv('L.homepage')).trim(); if (!/^https:\/\//.test(url)) { U.err['L.homepage'] = 'https://로 시작하는 주소를 적어 주세요.'; paint(); return focusErr(); }
    act('learn', req('POST', '/brand-learning', { url: url }), function (r) {
      var f = r.fields || {}, v = function (k) { return f[k] && (f[k].value || '') || ''; };
      if (!fv('L.intro').trim() && v('brand_one_liner')) U.f['L.intro'] = v('brand_one_liner');
      if (!fv('L.usp').trim() && (v('usp') || v('hero_product'))) U.f['L.usp'] = v('usp') || v('hero_product');
      if (!fv('L.banned').trim() && v('banned_words')) U.f['L.banned'] = v('banned_words');
      U.learnId = r.learningId; U.learnNote = '실제 페이지 ' + r.pagesRead + '개 · 본문 ' + r.charactersRead + '자 분석 — 빈 칸만 채웠어요. 확인한 뒤 저장하세요.';
    }, '홈페이지를 분석하지 못했어요. 직접 입력해 주세요.');
  };
  C8.learnSave = function () {
    var L = curLearn(); U.err = {};
    if (L.intro.trim().length < 20) U.err['L.intro'] = '브랜드 소개를 20자 이상 적어 주세요.';
    if (!/^https:\/\//.test(L.homepage.trim())) U.err['L.homepage'] = 'https://로 시작하는 주소를 적어 주세요. 예: https://brand.example';
    if (!L.countries.length) U.err['L.countries'] = '운영 국가를 하나 이상 골라 주세요.';
    if (Object.keys(U.err).length) { paint(); return focusErr(); }
    var faq = L.faq.filter(function (x) { return x.q.trim() || x.a.trim(); }).map(function (x) { return { q: x.q.trim(), a: x.a.trim() }; });
    act('lsave', req('POST', B() + '/profile/learned', { learning_id: U.learnId || null, answers: { brand_one_liner: L.intro.trim(), homepage: L.homepage.trim(), countries: L.countries.join(','), usp: L.usp.trim(), banned_words: L.banned.trim(), faq: JSON.stringify(faq) } }), function (r) {
      D.profile = { version: r.version, fields: r.fields }; U.init.learn = false; U.learnId = null; U.learnNote = ''; toast('브랜드 자료를 v' + r.version + '로 저장했어요. 이전 버전은 보존돼요.');
    });
  };

  // 제품
  function clearPend() { if (U.pendImg && U.pendImg.url) { try { URL.revokeObjectURL(U.pendImg.url); } catch (e) {} } U.pendImg = null; }
  C8.clearPendImg = function () { clearPend(); delete U.err['P.img']; paint(); };
  C8.newProd = function () { clearPend(); U.editProd = 'new'; initProd(null); paint(); var f = document.getElementById(fid('P.name')); if (f) f.focus(); };
  C8.editProd = function (pid) { var p = prodById(pid); if (!p) return; if (U.editProd !== pid) clearPend(); if (U.screen !== 'b-products') { U.screen = 'b-products'; U.id = ''; pushHash(); } U.editProd = pid; initProd(p); paint(); try { window.scrollTo(0, 0); } catch (e) {} };
  C8.closeProd = function () { clearPend(); U.editProd = null; U.err = {}; U.returnTo = null; paint(); };
  C8.upload = function (input, slot) {
    var f = input.files && input.files[0], p = curProd(); input.value = '';
    if (!f) return;
    if (['image/jpeg', 'image/png', 'image/webp'].indexOf(f.type) < 0) { U.err['P.img'] = 'JPG·PNG·WEBP 이미지만 올릴 수 있어요.'; return paint(); }
    if (f.size > 2000000) { U.err['P.img'] = '이미지는 2MB 이하만 올릴 수 있어요. (선택한 파일 ' + (f.size / 1e6).toFixed(1) + 'MB)'; return paint(); }
    delete U.err['P.img'];
    // 새 제품(또는 사진 업로드가 실패해 다시 저장할 제품)의 대표 사진: 폼 메모리에만 두고 저장 때 올린다
    if (slot === 'main' && (!p || U.pendImg)) { clearPend(); U.pendImg = { file: f, url: URL.createObjectURL(f) }; return paint(); }
    if (!p) return;
    act('img', req('POST', B() + '/products/' + p.productId + '/images?slot=' + slot, null, { type: f.type, body: f }), function () { toast(slot === 'main' ? '대표 이미지를 저장했어요.' : '추가 이미지를 저장했어요.'); return load('prods', true); }, '이미지를 저장하지 못했어요. 기존 사진은 그대로예요.');
  };
  C8.delImg = function (id) { var p = curProd(); if (!p || !confirm('이 이미지를 삭제할까요?')) return; act('img', req('DELETE', B() + '/products/' + p.productId + '/images/' + id), function () { return load('prods', true); }); };
  /* 공개 전환 — 처리 중엔 다시 누를 수 없고, 화면 상태는 서버 응답(제품)으로만 바뀐다.
     성공하면 오류를 지우고, 실패하면 오류만 남긴다(성공 토스트와 오류가 함께 뜨지 않는다). */
  C8.setPublic = function (el) {
    var p = curProd();
    if (!p || U.busy.pub) { if (el) el.checked = !!(p && p.publicListed); return; }
    var want = el.checked, key = D.key, pid = p.productId;
    delete U.err['P.public']; U.busy.pub = true; paint();
    req('POST', B() + '/products/' + pid + '/public', { listed: want }).then(function (r) {
      if (D.key !== key) return;
      putItem('prods', 'productId', r); delete U.err['P.public'];
      toast(r.publicListed ? '제품 모아보기에 공개했어요.' : '제품 모아보기에서 내렸어요.');
    }, function (e) {
      if (D.key !== key) return;
      U.err['P.public'] = (want ? '공개하지 못했어요: ' : '공개를 내리지 못했어요: ') + ((e && e.message) || '잠시 후 다시 시도해 주세요.');
    }).then(function () { if (D.key === key) { U.busy.pub = false; paint(); } });
  };
  C8.saveProd = function (full) {
    var p = curProd(); U.err = {};
    var name = fv('P.name').trim(), usp = [0, 1, 2].map(function (i) { return fv('P.usp.' + i).trim(); });
    if (!name) U.err['P.name'] = '제품명을 적어 주세요.';
    if (full) {
      if (!fv('P.category')) U.err['P.category'] = '카테고리를 골라 주세요.';
      if (usp.filter(Boolean).length < 3) U.err['P.usp.0'] = 'USP 3개를 모두 적어 주세요.';
      if (!fv('P.desc').trim()) U.err['P.desc'] = '상세 설명을 적어 주세요.';
      if (!fv('P.ship', []).length) U.err['P.ship'] = '배송 가능 국가를 하나 이상 골라 주세요.';
      if (!U.pendImg && !(p && ((p.images || []).some(function (i) { return i.slot === 'main'; }) || p.publicImageUrl))) U.err['P.img'] = '대표 이미지를 선택해 주세요.';
    }
    if (fv('P.link') && !/^https:\/\//.test(fv('P.link'))) U.err['P.link'] = 'https://로 시작하는 주소를 적어 주세요.';
    if (fv('P.price') && !/^\d{1,9}(\.\d{1,2})?$/.test(fv('P.price'))) U.err['P.price'] = '정가는 숫자로 적어 주세요.';
    if (Object.keys(U.err).length) { paint(); return focusErr(); }
    var answers = { category: fv('P.category'), usp: usp.join('\n').replace(/\n+$/, ''), description: fv('P.desc').trim(), howto: fv('P.howto').trim(), banned: fv('P.banned').trim(), link: fv('P.link').trim(), price: fv('P.price').trim(), currency: fv('P.currency'), ship: fv('P.ship', []).join(',') };
    var key = D.key, pend = U.pendImg, imgFail = null;
    /* 순서: 제품 생성(또는 수정) → 자료 저장 → 선택한 대표 사진 업로드. 생성 직후 이 편집기를 그 제품으로 고정해
       사진 업로드가 실패해도 다시 저장하면 같은 제품으로 재시도한다(입력·선택 사진 유지). */
    var work = (p ? (name !== p.name || fv('P.shopId').trim() !== (p.tiktokProductRef || '') ? req('PATCH', B() + '/products/' + p.productId, { name: name, tiktok_product_ref: fv('P.shopId').trim() }) : Promise.resolve(p))
      : req('POST', B() + '/products', { name: name, tiktok_product_ref: fv('P.shopId').trim() })).then(function (saved) {
      if (D.key !== key) return; var pid = saved.productId;
      if (!p) U.editProd = pid;
      return req('POST', B() + '/products/' + pid + '/profile', { answers: answers }).then(function () {
        if (!pend) return pid;
        return req('POST', B() + '/products/' + pid + '/images?slot=main', null, { type: pend.file.type, body: pend.file }).then(function () { return pid; }, function (e) { imgFail = e; return pid; });
      });
    });
    act('psave', work, function (pid) {
      return load('prods', true).then(function () {
        if (imgFail) {
          U.err['P.img'] = '제품 정보는 저장했지만 사진을 올리지 못했어요: ' + ((imgFail && imgFail.message) || '잠시 후 다시 시도해 주세요') + ' — 다시 저장하면 같은 제품에 사진을 올려요.';
          paint(); return focusErr();
        }
        if (pend && U.pendImg === pend) clearPend();
        toast(full ? '제품을 저장했어요.' : '임시 저장했어요. 미완성 제품은 캠페인 모집을 시작할 수 없어요.');
        if (U.returnTo === 'wizard' && full) { U.f = U.wizBackup || U.f; U.f['W.productId'] = pid; U.returnTo = null; U.editProd = null; U.wiz = 2; C8.go('b-create'); return; }
        if (!p) { initProd(prodById(pid)); paint(); }
      });
    }, '제품을 저장하지 못했어요. 입력은 그대로 남아 있어요.');
  };

  // 캠페인
  function wizReset(w) { Object.keys(U.f).forEach(function (k) { if (/^W\./.test(k)) delete U.f[k]; }); Object.keys(w).forEach(function (k) { U.f[k] = w[k]; }); U.init.wiz = true; U.wiz = 1; U.err = {}; }
  C8.newCamp = function () { U.wizId = null; wizReset(wizDefaults()); C8.go('b-create'); };
  C8.editCamp = function (cid) { var c = campById(cid); if (!c) return; U.wizId = cid; wizReset(wizFrom(c)); C8.go('b-create'); };
  C8.wizGo = function (n) { U.wiz = n; U.err = {}; paint(); };
  C8.wizNext = function () { U.err = stepErrors(U.wiz); if (Object.keys(U.err).length) { paint(); return focusErr(); } U.wiz++; paint(); var s = document.querySelector('.v6-steps .on'); if (s) s.focus(); };
  C8.wizProd = function (pid) { U.wizBackup = Object.assign({}, U.f); U.returnTo = 'wizard'; C8.go('b-products'); C8.editProd(pid); };
  C8.wizNewProd = function () { U.wizBackup = Object.assign({}, U.f); U.returnTo = 'wizard'; C8.go('b-products'); C8.newProd(); };
  C8.wizSave = function (publish) {
    var c = wizCamp(), cur = U.wizId && campById(U.wizId);
    if (publish) { var errs = allErrors(); if (errs.length) { U.wiz = 4; paint(); var el = document.getElementById('err-publish'); if (el) el.focus(); toast('필수 정보가 채워져야 모집을 시작할 수 있어요.'); return; } }
    else if (fv('W.name').trim().length < 2) { U.wiz = 1; U.err = { 'W.name': '초안도 캠페인 이름(2자 이상)이 필요해요.' }; paint(); return focusErr(); }
    var p = prodById(c.productId), body = { name: c.name.trim(), product: p ? p.name : '', usp: p ? (pfield(p, 'usp').split('\n')[0] || '') : '', reward_type: c.rewardType, affiliate_pct: c.affiliatePct, capacity: c.capacity, deadline: c.deadline || '', countries: c.countries,
      reward_amount: c.rewardAmount, reward_currency: /^(KRW|USD|THB|VND|JPY)$/.test(c.rewardCurrency) ? c.rewardCurrency : 'KRW', platform: c.platform, conditions: c.conditions, product_id: c.productId, sample_required: c.sampleRequired };
    var key = D.key;
    var work = (cur ? req('PATCH', B() + '/campaigns/' + encodeURIComponent(cur.campaignId), Object.assign({}, body, { deadline: body.deadline || null })).then(function () { return cur.campaignId; })
      : req('POST', B() + '/campaigns', body).then(function (r) { return r.campaignId; })).then(function (cid) {
      if (D.key !== key) return;
      U.wizId = cid;   // 저장 직후 실패해도 같은 초안을 다시 만들지 않도록
      if (publish && (!cur || cur.lifecycle === 'draft')) return req('POST', B() + '/campaigns/' + encodeURIComponent(cid) + '/publish').then(function () { return cid; });
      return cid;
    });
    act('wsave', work, function (cid) {
      return load('camps', true).then(function () {
        if (publish) { var w = wizDefaults(); wizReset(w); U.wizId = null; toast(cur && cur.lifecycle !== 'draft' ? '조건을 저장했어요. 이미 합의한 크리에이터는 합의 당시 조건이 유지돼요.' : '모집을 시작했어요. 브랜드 멤버에게 새 캠페인 알림이 가요.'); C8.go('b-campaigns', cid); }
        else toast('초안으로 저장했어요 (' + cid + '). 크리에이터에게는 아직 보이지 않아요.');
      });
    }, '저장하지 못했어요. 입력은 그대로 남아 있어요.');
  };
  C8.publish = function (cid) {
    var c = campById(cid); if (!c) return;
    var errs = (function () { var keep = U.f; U.f = Object.assign({}, keep, wizFrom(c)); var e = allErrors(); U.f = keep; return e; })();
    if (errs.length) { U.err['camp-status'] = '모집을 시작할 수 없어요: ' + errs.join(' / '); return paint(); }
    act('cpub', req('POST', B() + '/campaigns/' + encodeURIComponent(cid) + '/publish'), function () { toast('모집을 시작했어요.'); return load('camps', true); });
  };
  C8.closeCamp = function (cid) { if (!confirm('모집을 마감할까요? 새 신청을 받지 않아요.')) return; act('cclose', req('POST', B() + '/campaigns/' + encodeURIComponent(cid) + '/close'), function () { toast('모집을 마감했어요.'); return load('camps', true); }); };
  C8.goPost = function (cid) { U.tab.bc = 'post'; U.postCamp = cid; C8.go('b-community'); };

  // 지원자·샘플·영상
  function afterCollab(cid, msg) { toast(msg); load('camps', true); return loadApps(cid, true); }
  C8.select = function (cid, id, reconsider) {
    var c = campById(cid), body = { creator_id: id }; U.err = {};
    if (c && c.rewardType === 'affiliate') { var pct = Number(fv('A.pct.' + id, c.affiliatePct != null ? String(c.affiliatePct) : '')); if (!(pct > 0 && pct <= 80)) { U.err['A.pct.' + id] = '제안 수수료를 1~80 사이로 적어 주세요.'; paint(); return focusErr(); } body.commission_pct = pct; }
    if (reconsider) { if (!fv('A.reconsider.' + id)) { toast('재검토 확인에 체크해 주세요.'); return; } body.reconsider = true; }
    act('sel', req('POST', B() + '/campaigns/' + encodeURIComponent(cid) + '/select', body), function () { delete U.f['A.pct.' + id]; delete U.f['A.reconsider.' + id]; return afterCollab(cid, '선정했어요. 크리에이터가 조건을 확인하고 합의해요.'); });
  };
  C8.reject = function (cid, id) { if (!confirm('이 지원자를 미선정 처리할까요? 크리에이터 화면에 결과와 사유가 보여요.')) return; act('rej', req('POST', B() + '/campaigns/' + encodeURIComponent(cid) + '/applicants/' + encodeURIComponent(id) + '/reject', { reason: String(fv('A.rej.' + id)).trim() }), function () { delete U.f['A.rej.' + id]; return afterCollab(cid, '미선정 처리했어요.'); }); };
  C8.ship = function (cid, id) {
    var v = String(fv('T.' + id)).trim(); if (!v) { U.err['T.' + id] = '송장 번호를 적어 주세요.'; paint(); return focusErr(); }
    act('ship' + id, req('POST', B() + '/campaigns/' + encodeURIComponent(cid) + '/terms/' + encodeURIComponent(id) + '/sample-shipped', { tracking: v }), function () { delete U.f['T.' + id]; return afterCollab(cid, '발송 처리했어요. 크리에이터 화면에 송장이 보여요.'); });
  };
  C8.link = function (cid, id) { var v = String(fv('L.' + id)).trim(); if (!/^https:\/\//.test(v)) return toast('https://로 시작하는 링크를 적어 주세요.'); act('link' + id, req('POST', B() + '/campaigns/' + encodeURIComponent(cid) + '/terms/' + encodeURIComponent(id) + '/affiliate-link', { link: v }), function () { return afterCollab(cid, '어필리에이트 링크를 저장했어요.'); }); };
  C8.revise = function (cid, id) {
    var v = String(fv('R.' + id)).trim(); if (!v) { U.err['R.' + id] = '수정 요청 사유를 적어 주세요.'; paint(); return focusErr(); }
    act('rv' + id, req('POST', B() + '/campaigns/' + encodeURIComponent(cid) + '/terms/' + encodeURIComponent(id) + '/request-revision', { note: v }), function () { delete U.f['R.' + id]; return afterCollab(cid, '수정 요청을 보냈어요. 크리에이터가 사유를 보고 다시 제출해요.'); });
  };
  C8.approve = function (cid, id) { if (!confirm('검수 완료로 표시할까요? (지급 완료 기록이 아니에요)')) return; act('ok' + id, req('POST', B() + '/campaigns/' + encodeURIComponent(cid) + '/terms/' + encodeURIComponent(id) + '/complete'), function () { return afterCollab(cid, '검수 완료로 표시했어요. 지급은 별도로 확인해요.'); }); };

  // 커뮤니티
  C8.sendDm = function (cell) {
    var v = String(fv('DM.' + cell)).trim(); if (!v) { U.err['DM.' + cell] = '보낼 내용을 입력해 주세요.'; paint(); return focusErr(); }
    var camp = (U.dmCamp || {})[cell] || null;
    act('dm', req('POST', '/community/cells/' + encodeURIComponent(cell) + '/messages', Object.assign({ text: v, channel: 'chat', locale: 'ko' }, camp ? { campaign_id: camp } : {})), function () { delete U.f['DM.' + cell]; if (U.dmAi) delete U.dmAi[cell]; loadDm(cell, true); });
  };
  function lc() { var l = lounge(); return l ? '/community/cells/' + encodeURIComponent(l.cellId) + '/channels' : null; }
  C8.chEdit = function (k) { U.chEdit = k; U.err = {}; paint(); };
  C8.chSave = function (k) {
    var c = (D.channels || []).find(function (x) { return x.key === k; }); if (!c) return;
    var name = String(fv('CH.' + k + '.name', c.name)).trim(); if (!name) { U.err['CH.' + k + '.name'] = '채널 이름을 적어 주세요.'; paint(); return focusErr(); }
    var camp = fv('CH.' + k + '.camp', c.campaignId || ''), body = { name: name, description: String(fv('CH.' + k + '.desc', c.description)).trim() };
    if (k !== 'notice') body.visibility = fv('CH.' + k + '.vis', c.visibility);
    if (camp) body.campaign_id = camp; else body.clear_campaign = true;
    act('ch', req('PATCH', lc() + '/' + encodeURIComponent(k), body), function () { U.chEdit = null; toast('채널을 저장했어요. 크리에이터 사이드바에 바로 보여요.'); loadChannels(true); });
  };
  C8.chArchive = function (k, archived) { act('ch', req('PATCH', lc() + '/' + encodeURIComponent(k), { archived: archived }), function () { toast(archived ? '보관했어요. 크리에이터 사이드바에서 사라져요.' : '다시 사용해요.'); loadChannels(true); }); };
  C8.chAdd = function () {
    var n = String(fv('NC.name')).trim(); if (!n) { U.err['NC.name'] = '채널 이름을 적어 주세요.'; paint(); return focusErr(); }
    var body = { name: n, description: String(fv('NC.desc')).trim(), visibility: fv('NC.vis', 'public') }; if (fv('NC.camp')) body.campaign_id = fv('NC.camp');
    act('nc', req('POST', lc(), body), function () { ['NC.name', 'NC.desc', 'NC.vis', 'NC.camp'].forEach(function (k) { delete U.f[k]; }); toast('# ' + n + ' 채널을 만들었어요. 크리에이터 사이드바에 보여요.'); loadChannels(true); });
  };
  C8.post = function () {
    delete U.err.post;
    act('post', req('POST', B() + '/campaigns/' + encodeURIComponent(U.postCamp) + '/post', { channel: U.postCh }).then(null, function (e) { if (e.status === 409) { U.err.post = e.message; return; } throw e; }), function (r) { if (r) toast('게시했어요. 크리에이터 채널과 캠페인 공지에 카드가 보여요.'); });
  };

  // 메일
  C8.gmailConnect = function () {
    var popup = window.open('about:blank', '_blank');
    act('gconn', req('POST', B() + '/gmail/connect', {}), function (r) { if (r && r.authUrl) { if (popup) popup.location = r.authUrl; else location.href = r.authUrl; toast('새 창에서 회사 Gmail로 로그인하고 허용을 누르세요. 끝나면 이 화면을 새로고침해요.'); } else if (popup) popup.close(); })
      .then(function () { if (popup && !popup.location) popup.close(); });
  };
  C8.gmailSending = function (id, paused) { act('gs', req('POST', '/gmail/accounts/' + id + '/sending', { paused: paused }), function () { return load('gmail', true); }); };
  C8.gmailDisconnect = function (id) { if (!confirm('이 Gmail 연결을 해제할까요? 이 계정으로 더 이상 보내지 않아요.')) return; act('gd', req('DELETE', '/gmail/accounts/' + id), function () { toast('연결을 해제했어요.'); return load('gmail', true); }); };
  C8.cand = function () {
    var pid = U.candProd, key = pid + '|' + (U.candCtry || '');
    act('cand', req('GET', B() + '/products/' + pid + '/candidates?limit=50' + (U.candCtry ? '&country=' + U.candCtry : '')), function (r) { D.cand[key] = r; });
  };
  C8.pickRecipient = function (el, email, name, country) { if (el.checked) selAdd([{ email: email, name: name, country: country }]); else U.sel = U.sel.filter(function (r) { return r.email !== email; }); U.preview = null; paint(); };
  var EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
  C8.csvCheck = function () {
    var seen = {}, have = {}; U.sel.forEach(function (r) { have[r.email] = 1; });
    U.csvReview = String(fv('CSV')).split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 500).map(function (line) {
      var p = line.split(',').map(function (x) { return (x || '').trim(); }), email = (p[1] || '').toLowerCase(), reason = '';
      if (!EMAIL.test(email) || email.length > 254) reason = '이메일 형식 오류'; else if (seen[email]) reason = '중복'; else if (have[email]) reason = '이미 선택됨';
      seen[email] = 1; return { name: p[0] || '', email: email, country: (p[2] || '').toUpperCase(), reason: reason };
    });
    if (!U.csvReview.length) toast('붙여넣은 줄이 없어요.'); paint();
  };
  C8.csvAdd = function () { selAdd(U.csvReview.filter(function (r) { return !r.reason; })); U.csvReview = null; U.preview = null; toast('검수 통과한 사람을 선택에 추가했어요.'); paint(); };
  C8.saveList = function () { var n = String(fv('listName')).trim(); delete U.err.list; if (!n || !U.sel.length) { U.err.list = !n ? '리스트 이름을 적어 주세요.' : '먼저 사람을 선택해 주세요.'; return paint(); } U.lists.push({ name: n, rows: U.sel.slice() }); U.f.listName = ''; paint(); toast('리스트를 저장했어요 (이 탭에서만).'); };
  C8.clearSel = function () { U.sel = []; U.preview = null; paint(); };
  C8.loadList = function (i) { U.sel = U.lists[i].rows.slice(); U.preview = null; paint(); };
  C8.mailGo = function (n) { U.mail = n; U.err = {}; paint(); };
  function previewFp() { return fv('M.sender') + '|' + U.sel.map(function (r) { return r.email; }).sort().join(','); }
  C8.mailNext = function () {
    U.err = {};
    if (U.mail === 1) { if (!fv('M.camp')) U.err['M.camp'] = '캠페인을 골라 주세요.'; if (!fv('M.sender')) U.err['M.sender'] = '보내는 계정을 골라 주세요. 없으면 먼저 연결하세요.'; if (!U.sel.length) U.err.mail = '받는 사람을 먼저 선택해 주세요.'; if (U.sel.length > 200) U.err.mail = '한 번에 200명까지 저장할 수 있어요.'; }
    if (U.mail === 2) { if (!fv('M.subject').trim()) U.err['M.subject'] = '제목을 적어 주세요.'; else if (/[\r\n]/.test(fv('M.subject'))) U.err['M.subject'] = '제목에 줄바꿈을 넣을 수 없어요.'; if (!fv('M.body').trim()) U.err['M.body'] = '본문을 적어 주세요.'; }
    if (U.mail === 4) { if (!U.preview || U.preview.fp !== previewFp()) U.err.mail = '받는 사람이나 계정이 바뀌었어요. 제외 확인을 다시 해 주세요.'; else if (!U.preview.eligibleCount) U.err.mail = '보낼 수 있는 사람이 없어요. 대상과 제외 사유를 확인해 주세요.'; }
    if (Object.keys(U.err).length) { paint(); return focusErr(); }
    U.mail++; paint();
  };
  C8.compose = function () {
    var brief = String(fv('M.brief')).trim(); if (brief.length < 5) { U.err['M.brief'] = '제안 내용을 5자 이상 적어 주세요.'; paint(); return focusErr(); }
    var camp = campById(fv('M.camp'));
    act('compose', req('POST', B() + '/outreach/compose', { brief: brief, product_id: camp && camp.productId || null }), function (r) { U.f['M.subject'] = r.subject; U.f['M.body'] = r.body; toast('AI 초안을 넣었어요. 검토하고 고친 뒤 저장하세요.'); });
  };
  C8.preview = function () {
    var fp = previewFp();
    act('pv', req('POST', B() + '/outreach/preview', { gmail_account_id: fv('M.sender'), recipients: U.sel.map(function (r) { return r.email; }) }), function (r) { r.fp = fp; U.preview = r; });
  };
  C8.makeQueue = function () {
    U.err = {};
    if (!String(fv('M.approver')).trim()) { U.err['M.approver'] = '승인자를 적어 주세요.'; paint(); return focusErr(); }
    if (!U.preview || U.preview.fp !== previewFp() || !U.preview.eligibleCount) { U.mail = 4; U.err.mail = '제외 확인을 먼저 해 주세요.'; return paint(); }
    var camp = campById(fv('M.camp'));
    act('mkq', req('POST', B() + '/outreach', { campaign_id: camp ? camp.campaignId : null, product_id: camp && camp.productId || null, gmail_account_id: fv('M.sender'), recipients: U.preview.eligibleEmails, subject: fv('M.subject').trim(), body: fv('M.body').trim() }), function (r) {
      var n = r.recipients.length; U.sel = []; U.preview = null; U.mail = 1; ['M.brief', 'M.subject', 'M.body', 'M.approver'].forEach(function (k) { delete U.f[k]; });
      load('outreach', true); C8.go('b-sendlog'); toast(n + '명을 검수 목록(승인 전 초안)으로 저장했어요. 발송 로그에서 승인해야 보내져요.');
    });
  };
  C8.replySel = function (id) { U.replySel = id; U.id = id; U.replyPicked = true; pushHash(); paint(); if (mobile()) focusDetail('c8-reply-h'); };
  C8.replyBack = function () { U.replyPicked = false; paint(); var b = document.querySelector('.v6-ithread.on'); if (b) b.focus(); };
  C8.aiReply = function (tid) {
    var t = (D.inbox || []).find(function (x) { return x.threadId === tid; }), k = 'RT.' + tid + '.draft';
    if (!t) return;
    if (String(fv(k)).trim() && !confirm('입력 중인 답장을 AI 초안으로 바꿀까요?')) return;
    // 회신의 캠페인(후속 처리에 저장된 값)만 근거로 쓴다 — 없으면 일반 문의
    act('aiReply', req('POST', B() + '/assist/reply-draft', { thread_id: tid, campaign_id: t.campaignId && campById(t.campaignId) ? t.campaignId : null }), function (r) {
      U.f[k] = r.text; U.replyAi = U.replyAi || {}; U.replyAi[tid] = { evidence: r.evidence || [] };
    }, 'AI 초안을 받지 못했어요. 직접 작성해 주세요.');
  };
  C8.reply = function (tid) {
    var k = 'RT.' + tid + '.draft', v = String(fv(k)).trim(); if (!v) return toast('답장 내용을 입력해 주세요.');
    act('reply', req('POST', '/inbox/threads/' + encodeURIComponent(tid) + '/reply', { body: v }), function () { delete U.f[k]; toast('답장을 저장했어요. 대화에서 ‘내용 승인하고 발송’을 눌러야 보내져요.'); loadThread(tid, true); load('inbox', true); });
  };
  C8.replySend = function (tid, mid) {
    if (!confirm('이 답장을 Gmail로 보낼까요?')) return;
    act('rsend', req('POST', '/inbox/threads/' + encodeURIComponent(tid) + '/messages/' + mid + '/send', {}), function (r) { toast(r && r.state === 'sent' ? 'Gmail로 보냈어요.' : '발송 대기 — Gmail 연결이나 오늘 발송 한도를 확인해요.'); loadThread(tid, true); load('gmail', true); }, '발송 결과를 확인하지 못했어요. Gmail 보낸편지함을 확인하세요.');
  };
  C8.taskSave = function (tid) {
    var t = (D.inbox || []).find(function (x) { return x.threadId === tid; }); if (!t) return; var task = t.task || {}, base = 'RT.' + tid + '.';
    act('task', req('PUT', B() + '/inbox/threads/' + encodeURIComponent(tid) + '/task', { label: fv(base + 'label', task.label || 'unreviewed'), owner: fv(base + 'owner', task.owner || ''), next_action: String(fv(base + 'next', task.nextAction || '')).trim(), revision: task.revision || 0 }), function (r) {
      t.task = r.task; ['label', 'owner', 'next'].forEach(function (k) { delete U.f[base + k]; }); toast('후속 처리를 저장했어요.');
    }, '저장하지 못했어요 — 다른 담당자가 먼저 바꿨을 수 있어요. 새로고침해 주세요.').then(function () { load('inbox', true); });
  };
  C8.logFilter = function (k) { U.logFilter = k; paint(); };
  C8.batchSend = function (id) {
    var b = ((D.outreach || {}).batches || []).find(function (x) { return x.id === id; }); if (!b) return;
    if (!confirm('실제 메일이 ' + b.recipients.filter(function (r) { return r.state === 'pending'; }).length + '명에게 순차 발송돼요. 내용과 받는 사람을 확인했나요?')) return;
    act('bs', req('POST', B() + '/outreach/' + id + '/send', {}), function (r) { toast('Gmail 접수 ' + r.recipients.filter(function (x) { return x.state === 'sent'; }).length + '건. 배달 여부는 별도로 확인해야 해요.'); load('outreach', true); load('gmail', true); }, '발송 결과를 확인하지 못했어요. Gmail 연결과 발송 기록을 확인하세요.');
  };
  C8.batchCancel = function (id) { if (!confirm('이 초안을 취소할까요?')) return; act('bc', req('POST', B() + '/outreach/' + id + '/cancel', {}), function () { load('outreach', true); }); };
  C8.batchControl = function (id, paused) { act('bctl', req('POST', B() + '/outreach/' + id + '/control', { paused: paused }), function () { load('outreach', true); }); };
  C8.moreOutreach = function () { var cur = D.outreach && D.outreach.nextCursor; if (!cur) return; act('more', req('GET', B() + '/outreach?before=' + cur), function (r) { D.outreach.batches = D.outreach.batches.concat(r.batches || []); D.outreach.nextCursor = r.nextCursor; }); };
  C8.setRole = function (uid, role) {
    var m = (D.team || []).find(function (x) { return x.userId === uid; });
    if (!m || m.role === role) return;
    if (!confirm(m.email + ' 의 역할을 ' + { owner: '소유자', manager: '운영자', viewer: '조회자' }[role] + '(으)로 바꿀까요? 그 사람의 기존 로그인은 끊겨요.')) { paint(); return; }
    act('role', req('POST', B() + '/team/role', { user_id: uid, role: role }), function () { toast('역할을 바꿨어요.'); return load('team', true); }).then(function () { load('team', true); });
  };
  C8.teamInvite = function () {
    var email = fv('TM.email').trim(), role = fv('TM.role') || 'manager';
    U.err = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { U.err['TM.email'] = '이메일 형식을 확인해 주세요.'; paint(); return focusErr(); }
    act('tinv', req('POST', B() + '/team/members', { email: email, role: role }), function (r) {
      delete U.f['TM.email']; U.invite = { email: r.email, link: r.invite && r.invite.link };
      toast('팀원을 등록했어요. 초대 링크를 직접 전달하세요.'); return load('team', true);
    }, '팀원을 등록하지 못했어요. 입력은 그대로 남아 있어요.');
  };
  C8.teamLink = function (uid) {
    var m = (D.team || []).find(function (x) { return x.userId === uid; });
    if (!m || !confirm(m.email + ' 의 초대 링크를 새로 만들까요? 이전 링크는 쓸 수 없게 돼요.')) return;
    act('tlink', req('POST', B() + '/team/' + encodeURIComponent(uid) + '/invite-link', {}), function (r) { U.invite = { email: m.email, link: r.link }; toast('새 초대 링크를 만들었어요.'); });
  };
  C8.copyInvite = function () {
    var el = document.getElementById('c8-invite-link'); if (!el) return;
    el.select();
    (navigator.clipboard ? navigator.clipboard.writeText(el.value) : Promise.reject()).then(function () { toast('초대 링크를 복사했어요.'); }, function () { toast('링크를 선택했어요. 직접 복사해 주세요.'); });
  };
  C8.testSend = function () {
    var sender = accounts().find(function (x) { return x.accountId === fv('M.sender'); });
    var subject = String(fv('M.subject')).trim(), text = String(fv('M.body')).trim();
    if (!sender) { toast('보내는 계정을 먼저 고르세요.'); return; }
    if (!subject || !text) { toast('제목과 본문을 먼저 적어 주세요.'); return; }
    if (!confirm(sender.email + ' (내 연결 메일함)으로 테스트 메일 1통을 보낼까요?')) return;
    var sig = sender.accountId + '|' + subject + '|' + text;
    // 결과를 모르고 끝난 같은 내용 재시도는 같은 요청 번호로 — 서버가 재발송하지 않고 기록을 돌려준다
    if (!U.testReq || U.testReq.sig !== sig || U.testReq.done) U.testReq = { sig: sig, id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2) };
    var rq = U.testReq; U.testResult = null;
    act('testSend', req('POST', B() + '/gmail/accounts/' + encodeURIComponent(sender.accountId) + '/test-send', { request_id: rq.id, subject: subject, body: text, confirmed: true }), function (r) {
      rq.done = true; U.testResult = r; load('gmail', true);
    }, '테스트 메일을 보내지 못했어요.');
  };
  C8.billRefresh = function () { if (typeof window.refreshBilling === 'function') window.refreshBilling(); };
  C8.active = active;

  /* =====================================================================
     렌더 — v8 화면이면 시안 CSS, 아니면 기존 화면과 기존 CSS
     ===================================================================== */
  var PAGES = { 'b-today': scToday, 'b-learning': scLearning, 'b-campaigns': scCampaigns, 'b-create': scCreate, 'b-products': scProducts, 'b-applicants': scApplicants, 'b-samples': scSamples, 'b-community': scCommunity,
    'b-mailconnect': scMailConnect, 'b-invite': scInvite, 'b-mailprep': scMailprep, 'b-reply': scReply, 'b-sendlog': scSendlog, 'b-team': scTeam, 'b-billing': scBilling, 'b-results': scResults };
  var mode = null;
  function setMode(v8) {
    if (mode === v8) return; mode = v8;
    document.querySelectorAll('link[rel=stylesheet]').forEach(function (l) { var isV8 = l.hasAttribute('data-v8-css'); l.disabled = isV8 ? !v8 : v8; });
    ['v5', 'v5-root', 'sp-proposal', 'v8-live', 'c8'].forEach(function (c) { document.body.classList.toggle(c, v8); });
    var bar = document.querySelector('.svcbar'); if (bar) bar.style.display = 'none';
  }
  function pushHash() { var u = '#/' + U.screen + (U.id ? '/' + encodeURIComponent(U.id) : ''); try { if (location.hash !== u) history.pushState(null, '', u); } catch (e) {} }
  function route(fromLoad) {
    var m = String(location.hash || '').match(/^#\/(b-[a-z]+)(?:\/(.+))?$/);
    if (m && SCREENS.indexOf(m[1]) >= 0) { U.screen = m[1]; U.id = m[2] ? decodeURIComponent(m[2]) : ''; }
    else if (fromLoad) { U.screen = U.screen || 'b-today'; }
  }
  function labelCells() {
    document.querySelectorAll('.c8 .v6-table').forEach(function (t) {
      var heads = Array.prototype.map.call(t.querySelectorAll('.v6-th [role="columnheader"]'), function (x) { return x.textContent.trim(); });
      t.querySelectorAll('.v6-tr:not(.v6-th)').forEach(function (row) { Array.prototype.forEach.call(row.querySelectorAll(':scope > [role="cell"]'), function (cell, i) { if (!i || !heads[i] || cell.querySelector('.v7-cell-label')) return; var s = document.createElement('span'); s.className = 'v7-cell-label'; s.textContent = heads[i]; cell.insertBefore(s, cell.firstChild); }); });
    });
  }
  var painting = false;
  function paint() {
    if (painting) return;
    if (!active()) return legacyRender();
    ensure(); setMode(true); load('identity'); if (me().kind !== 'admin') load('team');
    var stage = document.getElementById('stage'); if (!stage) return;
    var act_ = document.activeElement, fidx = act_ && act_.id, caret = null;
    try { if (fidx && /^(INPUT|TEXTAREA)$/.test(act_.tagName) && act_.type !== 'file') caret = [act_.selectionStart, act_.selectionEnd]; } catch (e) {}
    var y = window.scrollY, main = document.querySelector('.v2-main'), my = main ? main.scrollTop : 0;
    painting = true;
    try {
      var body = (PAGES[U.screen] || scToday)();
      if (myRole() === 'viewer') body = '<div class="alert info" role="status">조회자(보기 전용) 계정이에요. 변경 기능은 꺼져 있어요 — 권한이 필요하면 소유자에게 요청하세요.</div>' + body;
      else if (me().kind !== 'admin' && D.team === null) body = '<div class="alert warn" role="status">권한을 확인하지 못해 변경 기능을 잠시 꺼 두었어요. ' + btn('다시 확인', "C8.reload('team')") + '</div>' + body;
      var html = shell(body);
      stage.innerHTML = '<main class="c8-app" aria-label="theprlist 콘솔">' + html + '</main>';
    } finally { painting = false; }
    labelCells(); lockWrites(stage);
    if (fidx) { var el = document.getElementById(fidx); if (el && el !== document.activeElement) { el.focus({ preventScroll: true }); try { if (caret) el.setSelectionRange(caret[0], caret[1]); } catch (e) {} } }
    var nm = document.querySelector('.v2-main'); if (nm) nm.scrollTop = my; if (typeof y === 'number') window.scrollTo(0, y);
  }
  var legacyRender = function () {};
  /* 조회자·권한 미확인: 처음 그릴 때부터 쓰기 컨트롤을 끈다(눌러서 403 받는 흐름 없음). 서버도 같은 규칙으로 거부한다. */
  var WRITE_RE = /C8\.(newCamp|editCamp|wizSave|wizProd|wizNewProd|upload|select|saveProd|newProd|delImg|chEdit|chSave|chArchive|chAdd|batchSend|batchControl|batchCancel|teamLink|teamInvite|taskSave|ship|setRole|setPublic|sendDm|saveList|revise|replySend|reply\(|reject|publish|post\(|makeQueue|link\(|learnSite|learnSave|gmailSending|gmailDisconnect|gmailConnect|faqDel|faqAdd|csvAdd|compose|closeCamp|approve|aiDm|aiReply|testSend|preview)/;
  function writeLocked() { var r = myRole(); return r === 'viewer' || r === ''; }
  function lockWrites(root) {
    if (!writeLocked()) return;
    root.querySelectorAll('[onclick],[onchange]').forEach(function (el) {
      if (WRITE_RE.test((el.getAttribute('onclick') || '') + (el.getAttribute('onchange') || ''))) { el.disabled = true; el.setAttribute('aria-disabled', 'true'); el.title = '조회자는 변경할 수 없어요'; }
    });
    root.querySelectorAll('.v6-form [data-f], .v6-form [data-farr], textarea[data-f], .c8-write [data-f], .v6-trk [data-f], .v6-editrow [data-f]').forEach(function (el) { el.disabled = true; });
  }

  /* 입력 → 상태 (다시 그려도 입력이 남는다) */
  document.addEventListener('input', function (e) {
    var t = e.target; if (!t || !t.dataset || !document.body.classList.contains('c8')) return;
    if (t.dataset.f && t.type !== 'checkbox' && t.type !== 'radio' && t.tagName !== 'SELECT') { U.f[t.dataset.f] = t.value; if (U.err[t.dataset.f]) { delete U.err[t.dataset.f]; t.removeAttribute('aria-invalid'); var m = document.getElementById('err-' + t.dataset.f); if (m) m.remove(); } }
  });
  document.addEventListener('change', function (e) {
    var t = e.target; if (!t || !t.dataset || !document.body.classList.contains('c8')) return;
    if (t.dataset.f) { U.f[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value; delete U.err[t.dataset.f]; if (t.tagName === 'SELECT' || t.type === 'radio') { if ('live' in t.dataset || t.type === 'radio') paint(); } }
    if (t.dataset.farr) { var k = t.dataset.farr, arr = (fv(k, []) || []).slice(), i = arr.indexOf(t.value); if (t.checked && i < 0) arr.push(t.value); if (!t.checked && i >= 0) arr.splice(i, 1); U.f[k] = arr; delete U.err[k]; }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && U && (U.pop || U.acct)) { U.pop = false; U.acct = false; paint(); } });
  document.addEventListener('click', function (e) { if (U && (U.pop || U.acct) && !e.target.closest('.v6-pop') && !e.target.closest('.v2-topbtn')) { U.pop = false; U.acct = false; paint(); } });
  window.addEventListener('hashchange', function () { if (active()) { ensure(); route(false); paint(); } });

  /* 기존 engine-live 렌더를 감싼다: 로그인 상태·브랜드 선택에 따라 v8 화면 또는 기존 화면 */
  var base = window.render;
  legacyRender = function () { setMode(false); return base.apply(window, arguments); };
  window.render = function () { if (active()) return paint(); return legacyRender.apply(window, arguments); };
  window.__C8 = { active: active, paint: paint };
  fresh(); route(true); window.render(); pollStart();
})();
