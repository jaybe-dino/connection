/* v8.1 브랜드 경계 — 브랜드 공간 안에서는 선택한 브랜드의 캠페인·참여·협업·알림만 보인다.
   전체 브랜드 보기 필터는 두지 않는다(독립 제품 목록은 커뮤니티 밖 별도 페이지).
   서버 응답(LIVE.*)은 그대로 두고, 화면이 읽는 접근자만 현재 브랜드로 좁힌다. */
(function () {
  function bid() { var b = currentBrand(); return b ? b.brandId : null; }
  function mine(x) { var id = bid(); return !!x && !!id && x.brandId === id; }

  window.campaignsLive = function () { return (LIVE.campaigns || []).filter(mine); };
  window.offersLive = function () { return (LIVE.offers || []).filter(mine); };
  window.actionableOffers = function () {
    return offersLive().filter(function (o) { return ['selected', 'terms_agreed', 'sample_shipped', 'revision_requested'].indexOf(o.state) >= 0; });
  };

  /* 알림: 대상 브랜드가 현재 브랜드인 것 + 브랜드와 무관한 계정 알림만 */
  function notifScoped() {
    var n = LIVE.notifs; if (!n) return null;
    var id = bid(), items = [];
    (n.items || []).forEach(function (i, idx) {
      var b = (i.target || {}).brandId;
      // 이미 범위화된 목록(렌더 중 LIVE.notifs)을 다시 좁혀도 원래 서버 목록의 인덱스를 유지한다
      if (!b || b === id) items.push(Object.assign({}, i, { _idx: i._idx != null ? i._idx : idx }));
    });
    return { items: items, unreadCount: items.filter(function (i) { return !i.read; }).length };
  }
  window.notifScoped = notifScoped;

  /* LIVE.offers / LIVE.notifs 를 직접 읽는 기존 화면은 렌더하는 동안만 현재 브랜드 범위로 본다 */
  function scopedRun(fn, self, args) {
    var o = LIVE.offers, n = LIVE.notifs;
    if (o) LIVE.offers = offersLive();
    if (n) LIVE.notifs = notifScoped();
    try { return fn.apply(self, args); } finally { LIVE.offers = o; LIVE.notifs = n; }
  }

  /* 브랜드를 바꾸면 이전 브랜드의 캠페인 상세·협업 상세가 남지 않게 목록으로 돌린다.
     알림 등으로 다른 브랜드의 캠페인을 직접 연 경우에는 그 브랜드로 전환한다. */
  var lastBrand = null;
  function reconcile() {
    if (!window.__ME || !LIVE.campaigns) return;
    var cur = bid(), changed = lastBrand !== null && cur !== lastBrand;
    var target = null, list = null;
    if (ui.page === 'detail' || ui.page === 'application' || ui.page === 'applied' || ui.page === 'applicationstatus') { target = (LIVE.campaigns || []).find(function (c) { return c.campaignId === (ui.campaign || ui.routeId); }); list = 'campaigns'; }
    if (ui.page === 'collaboration' || ui.page === 'submission') { var cid = ui.activeCollab || ui.routeId; target = (LIVE.offers || []).find(function (x) { return x.campaignId === cid; }); list = 'work'; }
    if (target && target.brandId !== cur) {
      if (changed) { ui.page = list; ui.routeId = ''; ui.campaign = null; ui.activeCollab = null; try { history.replaceState(null, '', '#' + list); } catch (e) {} }
      else { ui.brand = target.brandId; cur = target.brandId; }
    }
    if (changed && ui.activeCollab && !(LIVE.offers || []).some(function (x) { return x.campaignId === ui.activeCollab && x.brandId === cur; })) ui.activeCollab = null;
    lastBrand = cur;
  }

  var baseRender = render;
  render = function () { reconcile(); return scopedRun(baseRender, this, arguments); };
  if (typeof window.softRender === 'function') {
    var baseSoft = window.softRender;
    window.softRender = function () { reconcile(); return scopedRun(baseSoft, this, arguments); };
  }

  /* 알림 패널: 현재 브랜드 범위. 원래 인덱스로 열어 기존 읽음·딥링크 처리를 그대로 쓴다 */
  notifications = function () {
    var n = notifScoped(), b = currentBrand();
    modal('<span class="eyebrow">YOUR UPDATES</span><h2 id="modalTitle">새로운 소식</h2><p class="muted">' + E(b ? b.name : '') + ' 알림 · 선정·공지·담당자 메시지' + (n && n.unreadCount ? ' · 안 읽음 ' + n.unreadCount + '건' : '') + '</p>' +
      (n && n.items.length ? '<div style="text-align:right"><button class="text-link" onclick="notifReadScoped()">이 브랜드 알림 모두 읽음 →</button></div>' : '') +
      (!n ? '<div class="loading-lines" role="status"><div></div><div></div><div></div></div>' : n.items.length ? n.items.map(function (i) {
        var t = i.target || {};
        return '<button class="event-row" onclick="notifGo(' + i._idx + ')">' + avatar((i.title || '알')[0], i.read ? '' : 'olive') + '<div><b>' + E(i.title) + '</b><p>' + E(i.body || '') + '</p><time>' + E((i.at || '').slice(0, 16).replace('T', ' ')) + (i.read ? '' : ' · 안 읽음') + (t.brandId ? '' : ' · 계정 알림') + '</time></div>' + ((t.cellId || t.campaignId) ? I('arrow', 12) : '') + '</button>';
      }).join('') : '<div class="empty"><h3>이 브랜드의 새 알림이 없어요.</h3><p>선정·공지·담당자 메시지가 오면 여기에 표시돼요.</p></div>'));
  };
  window.notifReadScoped = function () {
    var n = notifScoped(); if (!n) return;
    var ids = n.items.filter(function (i) { return !i.read; }).map(function (i) { return i.id; });
    if (!ids.length) { closeModal(); return; }
    liveReq('POST', '/me/notifications/read', { ids: ids }).then(function () { return liveReq('GET', '/me/notifications?limit=30'); })
      .then(function (x) { LIVE.notifs = x; closeModal(); render(); })
      .catch(function () { toast('읽음 처리에 실패했습니다 — 다시 시도해 주세요.'); });
  };
})();
