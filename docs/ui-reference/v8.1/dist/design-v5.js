/* v5 — 독립 제품 페이지 + 공통 디자인 정돈. v1~v4 다음, 맨 마지막에 읽는다.
   기존 데이터·업무 흐름·ACT/SHEETS 위임은 그대로 쓰고, 셸과 DOM 후처리만 바꾼다. 서버·외부 요청 없음. */
(function () {
  const IS_PRODUCTS = /products\.html$/i.test(location.pathname);
  const ROOT = './';
  const PRODUCTS = 'products.html';
  const qp = new URLSearchParams(location.search);
  const rootUrl = (role, mode, screen, extra) => {
    const u = new URLSearchParams();
    if (role) u.set('role', role); if (mode) u.set('mode', mode); if (screen) u.set('screen', screen);
    Object.entries(extra || {}).forEach(([k, v]) => u.set(k, v));
    return ROOT + '?' + u.toString();
  };

  /* ---------- 자체 SVG 아이콘 (18px, stroke) ---------- */
  const P = {
    home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5',
    box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
    chat: 'M4 5h16v11H9l-5 4z',
    mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
    users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 20a5 5 0 0 0-4-5',
    card: 'M3 6h18v12H3zM3 10h18M7 15h4',
    check: 'M4 12l5 5L20 6',
    compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    megaphone: 'M3 10v4h4l8 4V6l-8 4zM18 9a4 4 0 0 1 0 6',
    hash: 'M5 9h15M4 15h15M10 3L8 21M16 3l-2 18',
    trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
    briefcase: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
    flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
    scale: 'M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    plug: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4',
    plus: 'M12 5v14M5 12h14',
    chevron: 'M6 9l6 6 6-6',
    bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
    dot: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  };
  const icon = (k, cls = '') => `<svg class="v5-ic ${cls}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${P[k] || P.dot}"/></svg>`;
  const NAV_ICON = [
    ['캠페인 관리', 'box'], ['내 캠페인', 'briefcase'], ['캠페인 공지', 'megaphone'],
    ['홈', 'home'], ['브랜드 학습', 'book'], ['제품·캠페인', 'box'], ['커뮤니티·DM', 'chat'], ['아웃리치', 'mail'], ['팀', 'users'], ['월별 청구', 'card'],
    ['내 할 일', 'check'], ['캠페인 둘러보기', 'compass'], ['내 공간', 'user'], ['공지사항', 'megaphone'], ['자유대화', 'hash'], ['제품-후기', 'hash'], ['콘텐츠-팁', 'hash'],
    ['더보기', 'chevron'], ['브랜드 랭킹', 'trophy'], ['미션', 'star'], ['모집채널', 'hash'], ['선정된 나의 협업', 'briefcase'], ['브랜드 담당자', 'chat'], ['도움말', 'help'],
    ['대시보드', 'grid'], ['브랜드 신청', 'inbox'], ['신고 처리함', 'flag'], ['분쟁 심판', 'scale'], ['검수 현황', 'eye'], ['디노 공용 모집', 'megaphone'], ['브랜드 운영', 'gear'],
    ['계정별 메일함', 'mail'], ['Gmail 운영', 'plug'], ['후보 풀', 'users'],
  ];
  const iconFor = label => (NAV_ICON.find(([t]) => label.includes(t)) || [null, 'dot'])[1];

  /* ---------- 커뮤니티(루트): 제품 메뉴 제거, 이전 북마크·고유 링크 처리 ---------- */
  if (!IS_PRODUCTS) {
    if (typeof MENUS === 'object') MENUS.creator = MENUS.creator.filter(m => !m.screens.some(s => s[0] === 'c-products'));
    if (qp.get('screen') === 'c-products') { location.replace(PRODUCTS); return; }
    if (view.screen.creator === 'c-products') view.screen.creator = 'c-community';
  }

  // 41번 설명도 독립 페이지 구조와 맞춘다.
  if (BY_ID.C13) {
    BY_ID.C13.screen = '독립 제품 모아보기 페이지 → 필터/검색 → 상세 → 조건 확인 → 신청';
    BY_ID.C13.ui[0] = '브랜드 커뮤니티 밖의 독립 페이지에서 전체 브랜드 공개 제품을 탐색. 브랜드·분야·신청 국가·보상 방식·신청 가능 필터와 검색 제공';
    BY_ID.C13.ui[1] = '카드에는 브랜드·제품·모집 상태와 신청 국가·보상·요청 콘텐츠·마감만 간결히 표시. 배송·샘플·광고 범위는 상세에서 확인';
    if (typeof EXIST === 'object') EXIST.C13[1] = '브랜드 커뮤니티와 분리된 제품 페이지에서 전체 공개 제품을 비교하고, 모집 중이면 신청·모집 전이면 관심 등록을 합니다.';
  }

  /* ---------- 다른 페이지로 넘어가야 하는 이동 ---------- */
  const baseGotoProposal = gotoProposal;
  gotoProposal = function (id) {
    const toProducts = COV[id] && COV[id].screen === 'c-products';
    if (toProducts && !IS_PRODUCTS) { location.href = PRODUCTS; return; }
    if (!toProducts && IS_PRODUCTS) { location.href = rootUrl(null, null, null, { goto: id }); return; }
    baseGotoProposal(id);
  };
  const baseGotoCurrent = gotoCurrent;
  gotoCurrent = function (id) {
    if (IS_PRODUCTS) { location.href = rootUrl(null, null, null, { goto: id, gotomode: 'current' }); return; }
    baseGotoCurrent(id);
  };
  ACT['pm-preview'] = () => { location.href = PRODUCTS; };
  if (IS_PRODUCTS) {
    // 검토 바의 역할·보기 전환은 커뮤니티 페이지로 보낸다
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-role],[data-mode]'); if (!t || !t.closest('.rv-bar')) return;
      e.preventDefault(); e.stopPropagation();
      const role = t.dataset.role || 'creator', mode = t.dataset.mode || 'proposal';
      location.href = rootUrl(role, mode, role === 'creator' && mode === 'proposal' ? 'c-community' : null);
    }, true);
  }

  /* ---------- 검토 바 링크 (채널 메뉴가 아닌 검토 바 바깥 영역) ---------- */
  const row = document.querySelector('.rv-bar .rv-row');
  if (row && !row.querySelector('.v5-pagelink')) {
    const a = document.createElement('a');
    a.className = 'v5-pagelink';
    a.href = IS_PRODUCTS ? rootUrl('creator', 'proposal', 'c-community') : PRODUCTS;
    a.innerHTML = IS_PRODUCTS ? `${icon('chat')}<span>내 커뮤니티로</span>` : `${icon('bag')}<span>제품 모아보기 페이지</span>`;
    row.appendChild(a);
  }
  document.body.classList.add('v5', IS_PRODUCTS ? 'v5-products' : 'v5-root');

  /* ---------- 독립 제품 페이지 셸 ---------- */
  if (IS_PRODUCTS) {
    renderShell = function () {
      view.role = 'creator'; view.mode = 'proposal'; view.screen.creator = 'c-products';
      return `<div class="catalog">
        <header class="catalog-top"><a class="catalog-logo" href="${rootUrl('creator', 'proposal', 'c-community')}">THEPRLIST</a>
          <nav class="catalog-nav" aria-label="전역 메뉴"><a href="${PRODUCTS}" aria-current="page">${icon('bag')}<span>제품 모아보기</span></a><a href="${rootUrl('creator', 'proposal', 'c-community')}">${icon('chat')}<span>내 커뮤니티</span></a></nav>
          <span class="catalog-sp"></span><span class="catalog-tag">디자인 예시 · 검토용</span></header>
        <div class="catalog-main" role="region" aria-label="제품 모아보기">${RENDER['c-products']()}</div>
      </div>`;
    };
  }

  /* ---------- DOM 후처리 ---------- */
  function decorateNav(root) {
    root.querySelectorAll('.v2-side .v2-navbtn:not([data-v5])').forEach(bn => {
      bn.setAttribute('data-v5', '');
      const more = bn.classList.contains('v2-moretoggle');
      const label = bn.textContent.replace(/[▾▴]/g, '').replace(/^#\s*/, '').trim();
      bn.innerHTML = `${icon(iconFor(label), more && bn.getAttribute('aria-expanded') === 'true' ? 'v5-rot' : '')}<span class="v5-lab">${esc(label)}</span>`;
    });
    root.querySelectorAll('.v2-rail button:not([data-v5])').forEach(bn => {
      bn.setAttribute('data-v5', '');
      const t = bn.textContent.trim();
      if (t === '+') bn.innerHTML = icon('plus'); else if (t === '⚙') bn.innerHTML = icon('gear');
    });
  }
  function compactCards(root) {
    root.querySelectorAll('.pm-card:not([data-v5])').forEach(cardEl => {
      cardEl.setAttribute('data-v5', '');
      const dts = [...cardEl.querySelectorAll('.pm-kv dt')];
      const hasApply = dts.some(d => /신청/.test(d.textContent));
      dts.forEach(dt => {
        const t = dt.textContent.trim();
        const keep = (hasApply ? /신청/.test(t) : /대상 국가/.test(t)) || /보상|콘텐츠|마감/.test(t);
        if (!keep) { dt.classList.add('v5-hide'); if (dt.nextElementSibling && dt.nextElementSibling.tagName === 'DD') dt.nextElementSibling.classList.add('v5-hide'); }
      });
    });
  }
  let pending = false;
  const post = () => { pending = false; const st = document.getElementById('stage'); if (!st) return; decorateNav(st); compactCards(st); };
  new MutationObserver(() => { if (!pending) { pending = true; requestAnimationFrame(post); } }).observe(document.getElementById('stage'), { childList: true, subtree: true });

  /* ---------- render 감싸기: 현재 render 호출 후 후처리만 ---------- */
  const baseRender = render;
  render = function () {
    if (IS_PRODUCTS) { view.role = 'creator'; view.mode = 'proposal'; view.screen.creator = 'c-products'; }
    baseRender.apply(this, arguments); post();
  };

  render();
  // 다른 페이지에서 넘어온 번호 이동
  const g = !IS_PRODUCTS && qp.get('goto');
  if (g && BY_ID[g]) { if (qp.get('gotomode') === 'current') gotoCurrent(g); else gotoProposal(g); }
})();
