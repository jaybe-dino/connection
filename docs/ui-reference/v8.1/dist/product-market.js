/* v4 제품 모아보기 — v1 app.js, v2 live-reference.js, v3 slack-preserve.js 다음(맨 마지막)에 읽는다.
   정적 예시 데이터와 브라우저 저장소만 쓴다. 서버 전송·외부 요청 없음. */
(function () {
  /* ---------- 신규 개선 C13 (번호 41) 등록 ---------- */
  if (!BY_ID.C13) {
    const item = {
      number: '41', id: 'C13', role: '크리에이터', roleKey: 'creator',
      title: '전체 브랜드 공개 제품 모아보기와 신청',
      job: '여러 브랜드가 올린 공개 제품을 한곳에서 비교하고, 모집 중인 협업은 조건을 보고 신청하며, 모집이 없는 제품은 관심을 남긴다.',
      screen: '제품 모아보기 → 필터/검색 → 제품 상세 → 협업 조건 선택 → 신청',
      ui: [
        '전체 브랜드 공개 제품을 기본으로 보여 주고 브랜드·분야·지원 국가·보상 방식·신청 가능 필터와 검색(제품명·브랜드) 제공',
        '카드에 썸네일·브랜드·제품명·분야·대상 국가·샘플 제공·보상·요청 콘텐츠·모집 상태 표시',
        '모집 중 → 조건 보고 신청 / 모집 없음 → 관심 등록 / 모집 마감 → 마감 표시·알림 받기(신청 불가)',
        '제품 정보와 협업 조건을 구분하고, 한 제품에 여러 협업 조건(샘플 협업·유료 영상)을 표시',
        '신청: 조건 선택 → 활동 국가 확인 → 간단 메시지 → 필수 조건 동의 → 신청. 국가 불일치·동의 누락은 해당 칸 옆에 오류',
        '저장·관심·신청 기록을 다시 볼 수 있고 같은 제품 중복 신청을 막음',
      ],
      depends: ['B03', 'X02', 'C04'],
      easyName: '제품 모아보기',
      pain: '기존 검토본은 캠페인 단위 탐색 중심이어서, 전체 브랜드의 공개 제품을 모아 비교하는 별도 화면이 필요했습니다.',
      observedNow: '기존 검토본의 캠페인 탐색과 별도로, 전체 브랜드의 공개 제품을 찾고 신청하는 화면을 확장 제안합니다. 실제 운영 DB와는 연결하지 않았습니다.',
      changeType: '확장 제안', priority: 'P1',
      proposal: { role: 'creator', screen: 'c-products', hotspot: 'hs-C13' },
    };
    IMPROVEMENTS.push(item);
    BY_ID.C13 = item;
    const cov = { id: 'C13', number: '41', role: 'creator', proposalRole: 'creator', screen: 'c-products', screenLabel: '제품 모아보기', hotspot: 'hs-C13', currentCapture: null, currentHotspot: null };
    COVERAGE.items.push(cov);
    COV.C13 = cov;
    if (!SCREENS.creator.some(s => s[0] === 'c-products')) SCREENS.creator.splice(2, 0, ['c-products', '제품 모아보기']);
    if (typeof SCREEN_LABEL === 'object') SCREEN_LABEL['c-products'] = '제품 모아보기';
    if (typeof MENUS === 'object' && !MENUS.creator.some(m => m.screens.some(s => s[0] === 'c-products'))) {
      const at = MENUS.creator.findIndex(m => m.screens.some(s => s[0] === 'c-campaigns'));
      MENUS.creator.splice(at >= 0 ? at + 1 : 2, 0, { label: '제품 모아보기', screens: [['c-products', '제품 모아보기']] });
    }
    if (typeof EXIST === 'object') EXIST.C13 = ['캠페인 둘러보기는 캠페인 단위 목록입니다. 브랜드 제품 전체를 모은 목록은 관찰한 화면에서 확인되지 않았습니다.', '전체 브랜드의 공개 제품을 모아 보고, 모집 중이면 신청·모집 전이면 관심 등록을 합니다.'];
    // v1이 불러올 때 C13을 몰라서 걸러낸 선택을 되살린다
    try { if ((lsGet(LS_SEL, []) || []).includes('C13')) selected.add('C13'); } catch (e) { /* 저장소 없음 */ }
  }
  const TOTAL = IMPROVEMENTS.length;
  const fixSelTitle = () => { const t = document.getElementById('rv-sel-title'); if (t) t.textContent = `선택한 개선 (${selected.size}/${TOTAL})`; };
  const baseRenderSel = renderSel;
  renderSel = function () { baseRenderSel.apply(this, arguments); fixSelTitle(); };
  document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.selbox) fixSelTitle(); });

  /* ---------- 예시 데이터 (공개 목록 샘플, 실제 제품 DB 아님) ---------- */
  const CTRY = { US: '미국', TH: '태국', VN: '베트남', JP: '일본', KR: '한국' };
  const CATS = ['스킨케어', '헤어', '생활', '식품'];
  const RTYPE = { gift: '샘플(제품 제공)', fixed: '고정비', sales: '판매 보상' };
  const P = [
    { id: 'p1', brand: '고려공작1392(디자인 예시)', name: '한방 진정 앰플(예시)', cat: '스킨케어', shape: 'bottle', color: '#7a5c8e', ship: ['US', 'TH'], intro: '민감한 피부를 위한 가벼운 앰플(예시 설명).',
      offers: [
        { id: 'o1', title: '샘플 협업', type: 'gift', reward: '제품 1개 제공 (금액 보상 없음)', due: '샘플 받은 날부터 14일', content: 'TikTok 영상 1개', ad: '광고 사용 없음 (내 계정 게시만)', sample: '무료 · 배송비 브랜드 부담', countries: ['US', 'TH'], status: 'open', until: '11/10' },
        { id: 'o2', title: '유료 영상', type: 'fixed', reward: '고정비 100 USD (브랜드 확인 통과 후 14일 이내 지급)', due: '샘플 받은 날부터 10일', content: 'TikTok 영상 1개 + 원본 파일', ad: '브랜드 광고 사용 30일 · 미국', sample: '무료 · 배송비 브랜드 부담', countries: ['US'], status: 'open', until: '11/05' }] },
    { id: 'p2', brand: '고려공작1392(디자인 예시)', name: '자개 손거울(예시)', cat: '생활', shape: 'box', color: '#3d6f8e', ship: ['US', 'JP'], intro: '자개 장식 손거울(예시 설명).', offers: [] },
    { id: 'p3', brand: 'FAU(디자인 예시)', name: '수분 선크림(예시)', cat: '스킨케어', shape: 'tube', color: '#d08a3c', ship: ['US', 'VN'], intro: '끈적임이 적은 선크림(예시 설명).',
      offers: [{ id: 'o1', title: '판매 연결 영상', type: 'sales', reward: '판매 보상(판매금액의 15%) · 확인된 판매금액 기준, TikTok에서 지급', due: '샘플 받은 날부터 14일', content: '영상 1개 + 상품 연결', ad: '광고 사용 없음', sample: '무료 샘플 1개', countries: ['US'], status: 'open', until: '11/15' }] },
    { id: 'p4', brand: 'FAU(디자인 예시)', name: '컬링 헤어 에센스(예시)', cat: '헤어', shape: 'bottle', color: '#5b8a5a', ship: ['TH'], intro: '컬을 오래 유지하는 에센스(예시 설명).',
      offers: [{ id: 'o1', title: '샘플 협업', type: 'gift', reward: '제품 1개 제공 (금액 보상 없음)', due: '샘플 받은 날부터 14일', content: 'Instagram 릴스 1개', ad: '광고 사용 없음', sample: '무료', countries: ['TH'], status: 'closed', until: '10/20' }] },
    { id: 'p5', brand: '하루담(디자인 예시)', name: '보리차 티백(예시)', cat: '식품', shape: 'pouch', color: '#a0743e', ship: ['US', 'TH', 'VN'], intro: '구수한 보리차 티백(예시 설명).',
      offers: [{ id: 'o1', title: '유료 영상', type: 'fixed', reward: '고정비 60 USD (게시 확인 후 14일 이내 지급)', due: '샘플 받은 날부터 10일', content: 'Instagram 릴스 1개', ad: '광고 사용 없음', sample: '무료 · 배송비 브랜드 부담', countries: ['TH', 'VN'], status: 'open', until: '11/12' }] },
    { id: 'p6', brand: '하루담(디자인 예시)', name: '꿀 스틱(예시)', cat: '식품', shape: 'pouch', color: '#c9a227', ship: ['US'], intro: '한 번에 먹는 꿀 스틱(예시 설명).', offers: [] },
    { id: 'p7', brand: '노을공방(디자인 예시)', name: '향초 세트(예시)', cat: '생활', shape: 'jar', color: '#b5655a', ship: ['US', 'JP', 'KR'], intro: '은은한 향의 향초 3종(예시 설명).',
      offers: [{ id: 'o1', title: '샘플 협업', type: 'gift', reward: '제품 1세트 제공 (금액 보상 없음)', due: '샘플 받은 날부터 21일', content: 'TikTok 영상 1개', ad: '광고 사용 없음', sample: '무료 · 배송비 브랜드 부담', countries: ['JP', 'KR'], status: 'open', until: '11/20' }] },
    { id: 'p8', brand: '노을공방(디자인 예시)', name: '핸드크림(예시)', cat: '스킨케어', shape: 'tube', color: '#8e6f9e', ship: ['US'], intro: '향이 은은한 핸드크림(예시 설명).',
      offers: [{ id: 'o1', title: '판매 연결 영상', type: 'sales', reward: '판매 보상(판매금액의 15%)', due: '샘플 받은 날부터 14일', content: '영상 1개 + 상품 연결', ad: '광고 사용 없음', sample: '무료 샘플 1개', countries: ['US'], status: 'closed', until: '10/15' }] },
  ];
  const BRANDS = [...new Set(P.map(p => p.brand))];
  const byPid = id => P.find(p => p.id === id);
  const openOffers = p => p.offers.filter(o => o.status === 'open');
  const pStatus = p => (!p.offers.length ? 'none' : openOffers(p).length ? 'open' : 'closed');
  const STATUS_LABEL = { open: ['협업 모집 중', 'ok'], none: ['모집 중인 협업 없음', ''], closed: ['모집 마감', 'err'] };

  /* ---------- 로컬 저장 (이 브라우저에만) ---------- */
  const LS = 'product-market-v4:state';
  const st = Object.assign({ saved: [], interest: [], applied: {} }, lsGet(LS, {}));
  const saveSt = () => lsSet(LS, st);
  const flt = { brand: '', cat: '', ctry: '', rtype: '', canApply: false, view: 'all', q: '' };

  /* ---------- 썸네일 (SVG 코드) ---------- */
  function thumb(p) {
    const c = p.color, shapes = {
      bottle: `<rect x="26" y="8" width="12" height="8" rx="2" fill="#333"/><rect x="20" y="16" width="24" height="40" rx="6" fill="${c}"/><rect x="24" y="28" width="16" height="12" rx="2" fill="#fff" opacity=".8"/>`,
      tube: `<path d="M22 10h20l-3 42H25z" fill="${c}"/><rect x="26" y="52" width="12" height="6" rx="1" fill="#333"/><rect x="26" y="20" width="12" height="14" rx="2" fill="#fff" opacity=".8"/>`,
      jar: `<rect x="18" y="18" width="28" height="8" rx="2" fill="#333"/><rect x="16" y="26" width="32" height="28" rx="6" fill="${c}"/><rect x="22" y="34" width="20" height="10" rx="2" fill="#fff" opacity=".8"/>`,
      pouch: `<path d="M18 12h28l2 44H16z" fill="${c}"/><rect x="18" y="12" width="28" height="5" fill="#000" opacity=".2"/><circle cx="32" cy="34" r="7" fill="#fff" opacity=".8"/>`,
      box: `<rect x="14" y="16" width="36" height="36" rx="4" fill="${c}"/><circle cx="32" cy="32" r="10" fill="#fff" opacity=".85"/><circle cx="32" cy="32" r="6" fill="${c}" opacity=".6"/>`,
    };
    return `<svg class="pm-thumb" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="10" fill="#f3eff6"/>${shapes[p.shape]}</svg>`;
  }

  /* ---------- 목록 ---------- */
  function matches(p) {
    if (flt.brand && p.brand !== flt.brand) return false;
    if (flt.cat && p.cat !== flt.cat) return false;
    const relevantOffers = pStatus(p) === 'open' ? openOffers(p) : p.offers;
    if (flt.ctry && !relevantOffers.length && !p.ship.includes(flt.ctry)) return false;
    if ((flt.ctry || flt.rtype) && relevantOffers.length && !relevantOffers.some(o =>
      (!flt.ctry || o.countries.includes(flt.ctry)) && (!flt.rtype || o.type === flt.rtype))) return false;
    if (flt.rtype && !relevantOffers.length) return false;
    if (flt.canApply && (pStatus(p) !== 'open' || st.applied[p.id])) return false;
    if (flt.view === 'saved' && !st.saved.includes(p.id)) return false;
    if (flt.view === 'interest' && !st.interest.includes(p.id)) return false;
    if (flt.view === 'applied' && !st.applied[p.id]) return false;
    const q = flt.q.trim().toLowerCase();
    if (q && !(p.name + ' ' + p.brand).toLowerCase().includes(q)) return false;
    return true;
  }
  function rewardLine(p) {
    const s = pStatus(p);
    if (s === 'none') return '<span class="muted">모집 조건 없음 · 보상 정보 없음</span>';
    const list = (s === 'open' ? openOffers(p) : p.offers);
    return list.map(o => `${esc(o.title)}: ${o.type === 'gift' ? '제품 제공' : o.type === 'fixed' ? esc(o.reward.split(' (')[0]) : '판매 보상(판매금액의 15%)'}`).join(' · ') + (s === 'closed' ? ' <span class="muted">(마감)</span>' : '');
  }
  function card(p) {
    const s = pStatus(p), [sl, tone] = STATUS_LABEL[s], ap = st.applied[p.id];
    const saved = st.saved.includes(p.id), intr = st.interest.includes(p.id);
    const offers = s === 'open' ? openOffers(p) : p.offers;
    const primary = ap ? `<button type="button" class="btn" disabled>신청함 (시안)</button>`
      : s === 'open' ? `<button type="button" class="btn pri" data-act="pm-apply" data-p="${p.id}">조건 보고 신청</button>`
      : `<button type="button" class="btn${intr ? '' : ' pri'}" data-act="pm-interest" data-p="${p.id}" aria-pressed="${intr}">${intr ? (s === 'closed' ? '알림 받는 중' : '관심 등록됨') : (s === 'closed' ? '다음 모집 알림 받기' : '관심 등록')}</button>`;
    return `<li class="pm-card" data-pid="${p.id}">
      <div class="pm-top">${thumb(p)}<div class="pm-head"><span class="pm-brand">${esc(p.brand)}</span><h3 class="pm-name">${esc(p.name)}</h3>
        <span class="chip ${tone}">${sl}</span>${ap ? ' <span class="chip info">신청함 (시안)</span>' : ''}${offers.length > 1 ? ` <span class="chip plum">협업 조건 ${offers.length}개</span>` : ''}</div></div>
      <dl class="pm-kv"><dt>분야</dt><dd>${esc(p.cat)}</dd><dt>배송 국가</dt><dd>${p.ship.map(c => CTRY[c]).join(', ')}</dd>
        <dt>신청 국가</dt><dd>${offers.length ? [...new Set(offers.flatMap(o => o.countries))].map(c => CTRY[c]).join(', ') : '<span class="muted">모집 없음</span>'}</dd>
        <dt>샘플</dt><dd>${offers.length ? esc(offers[0].sample) : '<span class="muted">정보 없음</span>'}</dd>
        <dt>보상</dt><dd>${rewardLine(p)}</dd><dt>요청 콘텐츠</dt><dd>${offers.length ? [...new Set(offers.map(o => o.content))].map(esc).join(' / ') : '<span class="muted">없음</span>'}</dd>
        ${s !== 'none' ? `<dt>${s === 'closed' ? '마감' : '모집 마감'}</dt><dd>${offers.map(o => o.until).join(', ')}</dd>` : ''}</dl>
      <div class="pm-actions">${primary}<button type="button" class="btn" data-act="pm-open" data-p="${p.id}">상세 보기</button>
        <button type="button" class="btn ghost" data-act="pm-save" data-p="${p.id}" aria-pressed="${saved}">${saved ? '저장됨' : '저장'}</button></div>
    </li>`;
  }
  function gridHtml() {
    const list = P.filter(matches);
    return { count: list.length, html: list.length ? `<ul class="pm-grid">${list.map(card).join('')}</ul>`
      : `<div class="alert info">조건에 맞는 제품이 없어요. ${flt.view !== 'all' ? '저장·관심·신청한 제품이 아직 없을 수 있어요. ' : ''}<button type="button" class="btn" data-act="pm-reset">필터 초기화</button></div>` };
  }
  const sel = (id, label, opts, val) => `<div class="pm-f"><label for="${id}">${label}</label><select id="${id}" data-pmf="${id.slice(3)}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  RENDER['c-products'] = () => {
    const g = gridHtml();
    return `<div class="pm"><div class="page-head"><div><h1>제품 모아보기 ${b('C13')}</h1>
      <p>전체 브랜드가 공개한 제품을 모아 봐요. 모집 중이면 신청, 아니면 관심을 남길 수 있어요.</p></div></div>
    <p class="pm-note small">검토용 예시 데이터 — 브랜드 4곳·제품 8개의 공개 목록 샘플이며 실제 제품 목록이 아닙니다. 저장·관심·신청은 이 브라우저에만 표시되고 서버로 보내지 않습니다.</p>
    <div class="pm-filters" role="search">
      <div class="pm-f pm-q"><label for="pm-q">검색</label><input id="pm-q" type="text" value="${esc(flt.q)}" placeholder="제품명 또는 브랜드"></div>
      ${sel('pm-brand', '브랜드', [['', '전체 브랜드'], ...BRANDS.map(x => [x, x])], flt.brand)}
      ${sel('pm-cat', '분야', [['', '전체'], ...CATS.map(x => [x, x])], flt.cat)}
      ${sel('pm-ctry', '지원 국가', [['', '전체'], ...Object.entries(CTRY)], flt.ctry)}
      ${sel('pm-rtype', '보상 방식', [['', '전체'], ...Object.entries(RTYPE)], flt.rtype)}
      ${sel('pm-view', '보기', [['all', '전체 제품'], ['saved', '저장한 제품'], ['interest', '관심 등록한 제품'], ['applied', '신청한 제품']], flt.view)}
      <label class="pm-chk"><input type="checkbox" id="pm-can" data-pmf="can" ${flt.canApply ? 'checked' : ''}> 신청 가능만</label>
      <button type="button" class="btn" data-act="pm-reset">초기화</button>
    </div>
    <p class="pm-count" id="pm-count" aria-live="polite">결과 ${g.count}개</p>
    <div id="pm-grid">${g.html}</div></div>`;
  };
  function refreshGrid(focusSel) {
    const g = gridHtml(), grid = document.getElementById('pm-grid'), cnt = document.getElementById('pm-count');
    if (!grid) return;
    grid.innerHTML = g.html; if (cnt) cnt.textContent = `결과 ${g.count}개`;
    updateCount();
    if (focusSel) { const el = document.querySelector(focusSel); if (el) el.focus(); }
  }
  document.addEventListener('input', e => { if (e.target.id === 'pm-q') { flt.q = e.target.value; refreshGrid(); } });
  document.addEventListener('change', e => {
    const k = e.target.dataset && e.target.dataset.pmf; if (!k) return;
    if (k === 'can') flt.canApply = e.target.checked; else if (k === 'brand') flt.brand = e.target.value; else if (k === 'cat') flt.cat = e.target.value;
    else if (k === 'ctry') flt.ctry = e.target.value; else if (k === 'rtype') flt.rtype = e.target.value; else if (k === 'view') flt.view = e.target.value;
    refreshGrid();
  });
  ACT['pm-reset'] = () => { Object.assign(flt, { brand: '', cat: '', ctry: '', rtype: '', canApply: false, view: 'all', q: '' }); render(); const q = document.getElementById('pm-q'); if (q) q.focus(); };
  function toggle(list, id) { const i = st[list].indexOf(id); if (i >= 0) st[list].splice(i, 1); else st[list].push(id); saveSt(); return i < 0; }
  ACT['pm-save'] = el => { const on = toggle('saved', el.dataset.p); toast(on ? '저장했어요 (이 브라우저에만).' : '저장을 해제했어요.'); refreshGrid(`[data-act="pm-save"][data-p="${el.dataset.p}"]`); syncSheet(el.dataset.p); };
  ACT['pm-interest'] = el => {
    const p = byPid(el.dataset.p), on = toggle('interest', p.id);
    toast(on ? (pStatus(p) === 'closed' ? '다음 모집이 열리면 알려 드릴게요 (시안·실제 알림 없음).' : '관심 등록했어요. 모집이 열리면 알려 드릴게요 (시안·실제 알림 없음).') : '관심 등록을 해제했어요.');
    refreshGrid(`[data-act="pm-interest"][data-p="${p.id}"]`); syncSheet(p.id);
  };

  /* ---------- 상세·신청 (기존 pd-sheet 재사용) ---------- */
  let cur = null; // {pid, step:'detail'|1..4|'done', offer, country, msg, agree:[]}
  SHEETS['pm-detail'] = { get title() { const p = cur && byPid(cur.pid); return p ? esc(p.name) : '제품'; }, html: () => `<div id="pm-sheet">${sheetBody()}</div>` };
  function offerBlock(o) {
    return `<div class="pm-offer"><h4>${esc(o.title)} <span class="chip ${o.status === 'open' ? 'ok' : 'err'}">${o.status === 'open' ? `모집 중 · ${o.until} 마감` : `모집 마감 (${o.until})`}</span></h4>
      <dl class="kv small"><dt>보상</dt><dd>${esc(o.reward)}</dd><dt>기한</dt><dd>${esc(o.due)}</dd><dt>요청 영상</dt><dd>${esc(o.content)}</dd><dt>광고 사용 범위</dt><dd>${esc(o.ad)}</dd><dt>샘플 조건</dt><dd>${esc(o.sample)}</dd><dt>신청 가능 국가</dt><dd>${o.countries.map(c => CTRY[c]).join(', ')}</dd></dl></div>`;
  }
  function sheetBody() {
    const p = byPid(cur.pid), s = pStatus(p), ap = st.applied[p.id];
    if (cur.step === 'detail') {
      const intr = st.interest.includes(p.id);
      return `<div class="pm-dtop">${thumb(p)}<div><p class="small muted">${esc(p.brand)} · ${esc(p.cat)}</p><p>${esc(p.intro)}</p><p class="small">배송 가능 국가: ${p.ship.map(c => CTRY[c]).join(', ')}</p></div></div>
        <h3 class="pm-sub">협업 조건 ${b('X02', { noId: true })}</h3>
        ${p.offers.length ? p.offers.map(offerBlock).join('') : '<div class="alert info">지금 모집 중인 협업이 없어요. 보상·기한 정보도 아직 없어요. 관심 등록하면 모집이 열릴 때 알려 드려요 (시안).</div>'}
        ${ap ? `<div class="alert ok">이 제품은 <b>신청함 (시안)</b>으로 표시돼 있어요 · ${esc(ap.offerTitle)} · 활동 국가 ${CTRY[ap.country]}. 실제로 브랜드에 전송되지 않았습니다.</div>` : ''}
        <div class="btns">${ap ? '' : s === 'open' ? `<button type="button" class="btn pri" data-act="pm-start">조건 보고 신청</button>`
          : `<button type="button" class="btn${intr ? '' : ' pri'}" data-act="pm-interest" data-p="${p.id}" aria-pressed="${intr}">${intr ? '관심 등록됨' : s === 'closed' ? '다음 모집 알림 받기' : '관심 등록'}</button>`}
          <button type="button" class="btn" data-act="pm-save" data-p="${p.id}" aria-pressed="${st.saved.includes(p.id)}">${st.saved.includes(p.id) ? '저장됨' : '저장'}</button>
          <button type="button" class="btn" data-close-sheet>닫기</button></div>`;
    }
    if (cur.step === 'done') {
      return `<div class="alert ok"><b>신청함 (시안)으로 표시했어요.</b> 이 브라우저에만 저장됐고 실제로 브랜드에 전송되지 않았습니다. 실제 서비스에서는 서버가 마감·국가 조건을 다시 확인한 뒤 접수됩니다.</div>
        <dl class="kv small"><dt>제품</dt><dd>${esc(p.name)}</dd><dt>협업</dt><dd>${esc(ap.offerTitle)}</dd><dt>활동 국가</dt><dd>${CTRY[ap.country]}</dd></dl>
        <div class="btns"><button type="button" class="btn pri" data-act="pm-show-applied">신청한 제품 보기</button><button type="button" class="btn" data-close-sheet>닫기</button></div>`;
    }
    const steps = ['조건 선택', '활동 국가', '메시지', '필수 동의'];
    const bar = `<ol class="steps pm-steps" aria-label="신청 단계">${steps.map((l, i) => `<li><span class="chip ${cur.step === i + 1 ? 'plum' : cur.step > i + 1 ? 'ok' : ''}">${i + 1} ${l}</span></li>`).join('')}</ol>`;
    const o = openOffers(p).find(x => x.id === cur.offer);
    let body = '';
    if (cur.step === 1) body = `<fieldset class="pm-fs"><legend>어떤 협업에 신청할까요?<span class="req">필수</span></legend><div class="radios">${openOffers(p).map(x => `<label><input type="radio" name="pm-offer" value="${x.id}" ${cur.offer === x.id ? 'checked' : ''}>${esc(x.title)}<small>${esc(x.reward)} · ${esc(x.content)} · ${esc(x.ad)}</small></label>`).join('')}</div><p class="ferr" id="pm-err" hidden></p></fieldset>`;
    if (cur.step === 2) body = `<div class="field"><label for="pm-country">내 활동 국가 (1개)<span class="req">필수</span></label><select id="pm-country" aria-describedby="pm-err"><option value="">고르세요</option>${Object.entries(CTRY).map(([k, l]) => `<option value="${k}" ${cur.country === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="hint">‘${esc(o.title)}’ 신청 가능 국가: ${o.countries.map(c => CTRY[c]).join(', ')}</span><p class="ferr" id="pm-err" hidden></p></div>`;
    if (cur.step === 3) body = `<div class="field"><label for="pm-msg">브랜드에 남길 말<span class="opt">선택</span></label><textarea id="pm-msg" maxlength="300" placeholder="예: 민감 피부 루틴 영상을 주로 올려요.">${esc(cur.msg || '')}</textarea><span class="hint">300자까지</span></div>`;
    if (cur.step === 4) body = `<fieldset class="pm-fs"><legend>필수 조건에 동의해 주세요<span class="req">필수</span></legend><div class="radios">
        <label><input type="checkbox" name="pm-agree" value="a1" ${cur.agree.includes('a1') ? 'checked' : ''}>보상·기한 확인<small>${esc(o.reward)} · ${esc(o.due)}</small></label>
        <label><input type="checkbox" name="pm-agree" value="a2" ${cur.agree.includes('a2') ? 'checked' : ''}>요청 콘텐츠·광고 사용 범위 확인<small>${esc(o.content)} · ${esc(o.ad)}</small></label>
        <label><input type="checkbox" name="pm-agree" value="a3" ${cur.agree.includes('a3') ? 'checked' : ''}>샘플 주소는 선정된 뒤 협업별로 입력<small>${esc(o.sample)}</small></label></div><p class="ferr" id="pm-err" hidden></p></fieldset>
        <p class="small muted">이 시안은 서버로 보내지 않습니다.</p>`;
    return `${bar}${body}<div class="btns"><button type="button" class="btn" data-act="pm-back">${cur.step === 1 ? '상세로' : '이전'}</button>
      <button type="button" class="btn pri" data-act="pm-next">${cur.step === 4 ? '신청하기 (시안)' : '다음'}</button></div>`;
  }
  function paint(focusSel) {
    const box = document.getElementById('pm-sheet'); if (!box) return;
    box.innerHTML = sheetBody(); updateCount();
    const f = (focusSel && box.querySelector(focusSel)) || box.querySelector('input, select, textarea, button');
    if (f) f.focus();
  }
  function syncSheet(pid) { if (cur && cur.pid === pid && cur.step === 'detail' && document.getElementById('pm-sheet')) paint(`[data-p="${pid}"][aria-pressed]`); }
  function showErr(msg, field) {
    const e = document.getElementById('pm-err'); if (!e) return;
    e.textContent = msg; e.hidden = false;
    if (field) { field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', 'pm-err'); field.focus(); }
  }
  ACT['pm-open'] = el => { cur = { pid: el.dataset.p, step: 'detail', offer: null, country: '', msg: '', agree: [] }; openSheet('pm-detail'); };
  ACT['pm-apply'] = el => {
    const p = byPid(el.dataset.p);
    cur = { pid: p.id, step: 1, offer: openOffers(p).length === 1 ? openOffers(p)[0].id : null, country: '', msg: '', agree: [] };
    openSheet('pm-detail');
  };
  ACT['pm-start'] = () => { if (st.applied[cur.pid]) return; const p = byPid(cur.pid); Object.assign(cur, { step: 1, offer: openOffers(p).length === 1 ? openOffers(p)[0].id : null }); paint(); };
  ACT['pm-back'] = () => { cur.step = cur.step === 1 ? 'detail' : cur.step - 1; paint(); };
  ACT['pm-next'] = () => {
    const p = byPid(cur.pid);
    if (st.applied[p.id]) { cur.step = 'detail'; paint(); toast('이미 신청함 (시안)으로 표시된 제품이에요. 다시 신청할 수 없어요.'); return; }
    if (cur.step === 1) {
      const r = document.querySelector('input[name="pm-offer"]:checked');
      if (!r) { showErr('신청할 협업 조건을 하나 골라 주세요.', document.querySelector('input[name="pm-offer"]')); return; }
      cur.offer = r.value; cur.step = 2; paint(); return;
    }
    const o = openOffers(p).find(x => x.id === cur.offer);
    if (cur.step === 2) {
      const s = document.getElementById('pm-country'); cur.country = s.value;
      if (!s.value) { showErr('활동 국가를 하나 골라 주세요.', s); return; }
      if (!o.countries.includes(s.value)) { showErr(`‘${o.title}’은 ${o.countries.map(c => CTRY[c]).join(', ')}에서 활동하는 크리에이터만 신청할 수 있어요. 고른 국가: ${CTRY[s.value]}.`, s); return; }
      cur.step = 3; paint(); return;
    }
    if (cur.step === 3) { cur.msg = document.getElementById('pm-msg').value; cur.step = 4; paint(); return; }
    if (cur.step === 4) {
      cur.agree = [...document.querySelectorAll('input[name="pm-agree"]:checked')].map(x => x.value);
      if (cur.agree.length < 3) { showErr(`필수 조건 3개에 모두 동의해야 신청할 수 있어요. (${3 - cur.agree.length}개 남음)`, document.querySelector('input[name="pm-agree"]:not(:checked)')); return; }
      st.applied[p.id] = { offer: o.id, offerTitle: o.title, country: cur.country, at: new Date().toISOString() }; saveSt();
      cur.step = 'done'; paint(); refreshGrid();
    }
  };
  ACT['pm-show-applied'] = () => { closeDialog(document.getElementById('pd-sheet')); flt.view = 'applied'; render(); const v = document.getElementById('pm-view'); if (v) v.focus(); };
  ACT['pm-preview'] = () => { view.role = 'creator'; view.mode = 'proposal'; view.screen.creator = 'c-products'; saveView(); render(); window.scrollTo(0, 0); };

  /* ---------- 링크 직접 진입: ?role=creator&mode=proposal&screen=c-products ---------- */
  try {
    const qp = new URLSearchParams(location.search);
    if (qp.has('role') || qp.has('mode') || qp.has('screen')) {
      const r = qp.get('role'), m = qp.get('mode'), s = qp.get('screen');
      if (['brand', 'creator', 'admin'].includes(r)) view.role = r;
      if (m === 'current' || m === 'proposal') view.mode = m;
      if (s && view.mode === 'proposal' && (typeof findMenu !== 'function' || findMenu(view.role, s))) view.screen[view.role] = s;
      saveView();
    }
  } catch (e) { /* URL 해석 불가 시 무시 */ }

  /* ---------- render 감싸기: 현재 render 호출 후 필요한 DOM 후처리만 ---------- */
  const baseRender = render;
  render = function () {
    baseRender.apply(this, arguments);
    if (view.mode === 'proposal' && view.role === 'creator' && view.screen.creator === 'c-products') {
      const workspace = document.querySelector('.v2-ws');
      if (workspace) { workspace.querySelector('b').textContent = '전체 브랜드'; workspace.querySelector('span').textContent = '제품 모아보기'; }
      document.querySelectorAll('.v2-rail [aria-current]').forEach(e => e.removeAttribute('aria-current'));
      const home = document.querySelector('.v2-rail [data-nav="c-rewards"]');
      if (home) home.setAttribute('aria-current', 'true');
      const search = document.querySelector('.v2-search input');
      if (search) search.placeholder = '전체 브랜드에서 검색';
    }
    if (view.mode === 'proposal' && view.role === 'brand' && view.screen.brand === 'b-products') {
      const head = document.querySelector('.v2-main .page-head');
      if (head && !head.querySelector('[data-act="pm-preview"]')) head.insertAdjacentHTML('beforeend', '<button type="button" class="btn" data-act="pm-preview">크리에이터 공개 목록에서 미리보기</button>');
    }
  };
  render();
})();
