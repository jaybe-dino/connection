/* v6 캠페인 중심 검토 시안 — v1~v5 다음, 두 HTML(index.html, products.html)에서 맨 마지막에 읽는다.
   구조: 브랜드 → 캠페인 → (제품·참여 조건) → 지원자(참여 건) → 선정/샘플/콘텐츠/지급 → 성과.
   세 역할이 같은 상태(localStorage 'campaign-v6:state')를 읽는다. 서버·메일·OAuth·결제·외부 요청 없음. */
(function () {
  const NS = 'campaign-v6:state';
  const IS_PRODUCTS = /products\.html$/i.test(location.pathname);
  const e = s => esc(s == null ? '' : String(s));
  const uid = p => p + Math.random().toString(36).slice(2, 8);
  const CTRY = { US: '미국', TH: '태국', VN: '베트남', JP: '일본', KR: '한국' };
  const GOAL = { affiliate: 'TikTok Shop 판매 연결 (어필리에이트)', ugc: '유료 UGC', sample: '샘플 협업' };
  const PST = { applied: '신청', review: '검토 중', selected: '선정', rejected: '거절', sample: '샘플 배송', video: '영상 제작·제출', done: '완료' };
  const PST_TONE = { applied: 'info', review: 'info', selected: 'ok', rejected: 'err', sample: 'warn', video: 'warn', done: 'ok' };
  const CR = {
    me: { name: '민지(예시)', country: 'US', handle: '@minji.daily' },
    jordan: { name: 'Jordan(예시)', country: 'US', handle: '@jordan.skin' },
    ava: { name: 'Ava(예시)', country: 'US', handle: '@ava.glow' },
    noah: { name: 'Noah(예시)', country: 'TH', handle: '@noah.th' },
    lena: { name: 'Lena(예시)', country: 'US', handle: '@lena.daily' },
    mia: { name: 'Mia(예시)', country: 'VN', handle: '@mia.vn' },
  };

  /* ---------------- 예시 상태 (브랜드 2곳 · 제품 4개 · 캠페인 3개) ---------------- */
  function seed() {
    const P = (id, brandId, o) => Object.assign({ id, brandId, name: '', category: '', usp: ['', '', ''], desc: '', howto: '', banned: '', link: '', shopId: '', price: '', currency: 'USD', ship: [], img: '', imgs: [] }, o);
    return {
      ver: 1, brandId: 'goryeo', creatorBrand: 'goryeo',
      brands: {
        goryeo: { id: 'goryeo', name: '고려공작1392(디자인 예시)', short: '고려공작1392', ownerEmail: 'owner@goryeo1392.example', country: 'KR', manager: '하린(예시)', mode: '자체 운영', status: '운영 중' },
        fau: { id: 'fau', name: 'FAU(디자인 예시)', short: 'FAU', ownerEmail: 'owner@fau.example', country: 'US', manager: '지윤(예시)', mode: '운영 대행', status: '운영 중' },
      },
      memberships: ['goryeo', 'fau'],
      apps: [{ id: 'ap1', name: '하루담(디자인 예시)', ownerEmail: 'hello@harudam.example', country: 'KR', status: 'pending' }],
      learning: {
        goryeo: { intro: '전통 한방 원료로 민감 피부를 위한 스킨케어를 만드는 브랜드입니다 (예시).', homepage: 'https://goryeo1392.example', countries: ['US', 'TH'], usp: '한방 원료 · 저자극 테스트 완료 (예시)', banned: '치료, 완치, 의약품', faq: [{ q: '샘플은 언제 오나요?', a: '선정 후 주소를 받으면 5~7일 안에 출고해요.' }], savedAt: '' },
        fau: { intro: '', homepage: '', countries: ['US'], usp: '', banned: '', faq: [], savedAt: '' },
      },
      products: {
        'p-amp': P('p-amp', 'goryeo', { name: '한방 진정 앰플(예시)', category: '스킨케어', usp: ['한방 원료 7종', '가벼운 흡수감', '민감 피부 테스트 완료'], desc: '붉어진 피부를 편안하게 정돈하는 앰플입니다 (예시 설명).', howto: '세안 후 2~3방울을 얼굴 전체에 펴 바릅니다.', banned: '치료, 완치', link: 'https://shop.example/goryeo/ampoule', shopId: '1729-0001(예시)', price: '32', ship: ['US', 'TH'], img: 'assets/demo-ampoule.png' }),
        'p-mirror': P('p-mirror', 'goryeo', { name: '자개 손거울(예시)', category: '생활', usp: ['자개 장식', '', ''], ship: ['US'] }),
        'p-sun': P('p-sun', 'fau', { name: '수분 선크림(예시)', category: '스킨케어', usp: ['끈적임 적음', '백탁 없음', '데일리 사용'], desc: '가볍게 발리는 선크림입니다 (예시 설명).', howto: '외출 15분 전 충분히 바릅니다.', link: 'https://shop.example/fau/sun', price: '24', ship: ['US', 'VN'] }),
        'p-hair': P('p-hair', 'fau', { name: '컬링 헤어 에센스(예시)', category: '헤어', usp: ['컬 유지', '가벼운 마무리', '열 보호'], desc: '컬을 오래 유지하는 에센스입니다 (예시 설명).', link: 'https://shop.example/fau/hair', price: '18', ship: ['TH'] }),
      },
      campaigns: {
        c1: { id: 'c1', brandId: 'goryeo', productId: 'p-amp', name: '한방 앰플 미국 판매 영상', goal: 'affiliate', countries: ['US'], start: '2026-11-01', end: '2026-11-30', status: 'recruiting', cap: '20',
          affiliate: { commission: '15', sampleQty: '30', shipping: '브랜드 부담', settle: 'TikTok Shop 주문 확정 후 플랫폼 정산' }, ugc: { fee: '', currency: 'USD', payAt: '' },
          content: { platform: 'TikTok', count: '1', length: '30~60초', must: '제품명, 사용 장면, USP 1개', banned: '치료, 완치', due: '샘플 받은 날부터 14일', adUse: 'none', adDays: '' }, videoUrl: '' },
        c2: { id: 'c2', brandId: 'goryeo', productId: 'p-amp', name: '앰플 유료 UGC', goal: 'ugc', countries: ['US'], start: '2026-11-05', end: '2026-11-25', status: 'recruiting', cap: '5',
          affiliate: { commission: '', sampleQty: '5', shipping: '브랜드 부담', settle: '' }, ugc: { fee: '100', currency: 'USD', payAt: '브랜드 확인 통과 후 14일 이내' },
          content: { platform: 'TikTok', count: '1', length: '30초', must: '사용 전후 장면', banned: '치료, 완치', due: '샘플 받은 날부터 10일', adUse: 'ads', adDays: '30' }, videoUrl: '' },
        c3: { id: 'c3', brandId: 'fau', productId: 'p-sun', name: '선크림 샘플 협업', goal: 'sample', countries: ['US', 'VN'], start: '2026-10-20', end: '2026-11-20', status: 'recruiting', cap: '10',
          affiliate: { commission: '', sampleQty: '10', shipping: '브랜드 부담', settle: '' }, ugc: { fee: '', currency: 'USD', payAt: '' },
          content: { platform: 'Instagram', count: '1', length: '15~30초', must: '바르는 장면', banned: '', due: '샘플 받은 날부터 14일', adUse: 'none', adDays: '' }, videoUrl: '' },
      },
      parts: [
        { id: 'pa1', campaignId: 'c1', creatorId: 'me', status: 'selected', msg: '민감 피부 루틴 영상을 올려요.', addr: '', due: '11/03 주소 입력' },
        { id: 'pa2', campaignId: 'c2', creatorId: 'me', status: 'applied', msg: '전후 비교 영상 가능해요.', addr: '', due: '결과 예정 11/07' },
        { id: 'pa3', campaignId: 'c3', creatorId: 'me', status: 'video', msg: '', addr: 'NY 11*** (가상·마스킹)', due: '11/09 영상 제출', videoUrl: '' },
        { id: 'pa4', campaignId: 'c1', creatorId: 'jordan', status: 'applied', msg: '판매 영상 경험 있어요.', addr: '', due: '' },
        { id: 'pa5', campaignId: 'c1', creatorId: 'ava', status: 'review', msg: '', addr: '', due: '' },
        { id: 'pa6', campaignId: 'c1', creatorId: 'noah', status: 'rejected', msg: '', addr: '', due: '' },
        { id: 'pa7', campaignId: 'c2', creatorId: 'lena', status: 'sample', msg: '', addr: 'CA 90*** (가상·마스킹)', due: '' },
        { id: 'pa8', campaignId: 'c3', creatorId: 'mia', status: 'done', msg: '', addr: 'HCM 7**** (가상·마스킹)', due: '' },
      ],
      channels: {
        'g-free': { brandId: 'goryeo', name: '자유대화', desc: '멤버 누구나 이야기해요', vis: 'public', campaignId: '', archived: false, base: 'free' },
        'g-review': { brandId: 'goryeo', name: '제품후기', desc: '사용 후기를 나눠요', vis: 'public', campaignId: 'c1', archived: false },
        'g-qna': { brandId: 'goryeo', name: '질문', desc: '협업·배송 질문', vis: 'public', campaignId: '', archived: false },
        'g-notice': { brandId: 'goryeo', name: '캠페인 공지', desc: '브랜드만 글을 올려요', vis: 'readonly', campaignId: '', archived: false, base: 'notice' },
        'f-free': { brandId: 'fau', name: '자유대화', desc: '', vis: 'public', campaignId: '', archived: false, base: 'free' },
        'f-notice': { brandId: 'fau', name: '캠페인 공지', desc: '', vis: 'readonly', campaignId: '', archived: false, base: 'notice' },
      },
      chMsgs: {
        'g-free': [{ who: '고려공작1392 담당(예시)', text: '이번 주 질문은 #질문 채널에 남겨 주세요.', at: '09:10' }, { who: 'Ava(예시)', text: 'Got my sample today!', at: '09:40' }],
        'f-free': [{ who: 'FAU 담당(예시)', text: '선크림 샘플 협업 모집 중이에요.', at: '어제' }],
      },
      dms: {
        dm1: { brandId: 'goryeo', campaignId: 'c1', creatorId: 'me', status: 'needs', since: '3시간째', msgs: [{ from: 'creator', text: '샘플 받을 주소는 어디에 입력하나요?', at: '10/29 09:20' }], drafts: { brand: '', creator: '' } },
        dm2: { brandId: 'goryeo', campaignId: 'c2', creatorId: 'jordan', status: 'needs', since: '1일째', msgs: [{ from: 'creator', text: '고정비는 영상 1개 기준인가요?', at: '10/28 15:02' }], drafts: { brand: '', creator: '' } },
        dm3: { brandId: 'fau', campaignId: 'c3', creatorId: 'me', status: 'done', since: '', msgs: [{ from: 'brand', text: '영상 제출 기한은 11/09이에요.', at: '10/27 10:00' }, { from: 'creator', text: '확인했어요!', at: '10/27 10:30' }], drafts: { brand: '', creator: '' } },
      },
      xp: { goryeo: { weekly: 20, total: 140, hist: [{ t: '질문에 답변', pts: 10, at: '10/27' }, { t: '후기 공유', pts: 10, at: '10/28' }] }, fau: { weekly: 0, total: 30, hist: [] } },
      missionsDone: { goryeo: ['m-intro'], fau: [] },
      mail: {
        accounts: { goryeo: [{ id: 'ma1', provider: 'Gmail', email: 'team@goryeo1392.example', status: 'connected', at: '10/20' }], fau: [] },
        sel: {}, lists: {}, csv: {}, compose: {}, queue: [], paused: false,
        replies: [
          { id: 'r1', brandId: 'goryeo', campaignId: 'c1', senderId: 'ma1', name: 'Kai Lee(예시)', email: 'kai@creator.example', status: 'positive', text: '관심 있어요! 샘플은 언제 오나요?', assignee: '', todo: '', at: '10/28', draft: '', sent: [] },
          { id: 'r2', brandId: 'goryeo', campaignId: 'c1', senderId: 'ma1', name: 'Sora Park(예시)', email: 'sora@creator.example', status: 'question', text: '태국에서도 참여 가능한가요?', assignee: '하린(예시)', todo: '국가 조건 확인', at: '10/28', draft: '', sent: [] },
          { id: 'r3', brandId: 'goryeo', campaignId: 'c2', senderId: 'ma1', name: 'Ben Cho(예시)', email: 'ben@creator.example', status: 'decline', text: '이번엔 일정이 안 맞아요.', assignee: '', todo: '', at: '10/27', draft: '', sent: [] },
          { id: 'r4', brandId: 'goryeo', campaignId: 'c1', senderId: 'ma1', name: 'Yuna Han(예시)', email: 'yuna@creator.example', status: 'optout', text: '더 이상 메일을 받지 않을게요.', assignee: '', todo: '', at: '10/26', draft: '', sent: [] },
          { id: 'r5', brandId: 'fau', campaignId: 'c3', senderId: 's002', name: 'Tom Ng(예시)', email: 'tom@creator.example', status: 'needs', text: 'Instagram만 해도 되나요?', assignee: '', todo: '', at: '10/28', draft: '', sent: [] },
        ],
        adminRows: [], senderOv: {}, extraSenders: [],
      },
      team: {
        goryeo: [
          { id: 't1', name: '하린(예시)', loginId: 'harin', email: 'harin@goryeo1392.example', role: 'owner', scope: ['c1', 'c2'], status: 'active', link: '' },
          { id: 't2', name: '수진(예시)', loginId: 'sujin', email: 'sujin@goryeo1392.example', role: 'manager', scope: ['c1'], status: 'invited', link: 'https://console.example/invite/demo-7f3a (시안 · 7일 후 만료)' },
        ],
        fau: [{ id: 't3', name: '지윤(예시)', loginId: 'jiyoon', email: 'jiyoon@fau.example', role: 'owner', scope: ['c3'], status: 'active', link: '' }],
      },
      bill: {
        goryeo: [
          { id: 'bc1', name: '민지(예시)', joined: '2026-10-03', person: true, addr: 'confirmed', campaign: 'c1', demo: false },
          { id: 'bc2', name: 'Jordan(예시)', joined: '2026-10-08', person: true, addr: 'registered', campaign: 'c1', demo: false },
          { id: 'bc3', name: 'Ava(예시)', joined: '2026-10-11', person: false, addr: 'confirmed', campaign: 'c1', demo: false },
          { id: 'bc4', name: 'Lena(예시)', joined: '2026-10-15', person: true, addr: 'confirmed', campaign: 'c2', demo: false },
          { id: 'bc5', name: 'Noah(예시)', joined: '2026-10-18', person: true, addr: 'none', campaign: 'c1', demo: false },
          { id: 'bc6', name: '테스트 계정(예시)', joined: '2026-10-19', person: true, addr: 'confirmed', campaign: '', demo: true },
        ],
        fau: [{ id: 'bc7', name: 'Mia(예시)', joined: '2026-10-21', person: true, addr: 'confirmed', campaign: 'c3', demo: false }],
      },
      drafts: {},
    };
  }
  let S = (() => { try { const v = JSON.parse(localStorage.getItem(NS)); if (v && v.ver === 1) return v; } catch (x) { /* 저장소 없음 */ } return seed(); })();
  const seedMailAliases = { r1: ['kai@creator.example','kailee@creator.example'], r2: ['sora@creator.example','sorapark@creator.example'], r3: ['ben@creator.example','bencho@creator.example'], r4: ['yuna@creator.example','yunahan@creator.example'], r5: ['tom@creator.example','tomng@creator.example'] };
  S.mail.replies.forEach(r => { const a = seedMailAliases[r.id]; if (a && r.email === a[0]) r.email = a[1]; });
  let saveT;
  function save() { try { localStorage.setItem(NS, JSON.stringify(S)); } catch (x) { toast('브라우저 저장 공간이 부족해요. 이미지를 줄이거나 지워 주세요.'); } }
  const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(save, 250); };
  const TODAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  ['p-sun', 'p-hair'].forEach(id => { const p = S.products && S.products[id]; if (p && !p.img && p.seedPlaceholder === undefined) p.seedPlaceholder = true; });
  S.saved = S.saved || {};
  const ui = { tab: {}, err: {}, wiz: 1, campSel: null, editProduct: null, returnTo: null, appCamp: null, appSel: null, appFilter: '', dmSel: null, chEdit: null, cCampSel: null, cWorkSel: null, cDmSel: null, ch: {}, adminBrand: null, senderPage: 1, senderQ: '', senderSt: '', senderBrand: '', csvReview: null, senderCsv: '', senderCsvReview: null, poolQ: '', poolCtry: '', poolCat: '', brandPop: false, replySel: null, mailStep: 1, previewCand: null, logFilter: '' };

  /* ---------------- 공통 도우미 ---------------- */
  function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
  function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] == null ? (a[k] = {}) : a[k]), o); t[last] = v; }
  const brand = id => S.brands[id] || Object.values(S.brands)[0];
  const curBrandId = () => (view.role === 'admin' && ui.adminBrand ? ui.adminBrand : S.brandId);
  const camps = bid => Object.values(S.campaigns).filter(c => c.brandId === bid);
  const prods = bid => Object.values(S.products).filter(p => p.brandId === bid);
  const partsOf = cid => S.parts.filter(p => p.campaignId === cid);
  const myParts = () => S.parts.filter(p => p.creatorId === 'me');
  const isUrl = v => /^https?:\/\/[^\s.]+\.[^\s]+$/.test(String(v || '').trim());
  const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
  function go(screen, role) { if (role) view.role = role; view.mode = 'proposal'; view.screen[view.role] = screen; ui.err = {}; saveView(); render(); window.scrollTo(0, 0); const m = document.querySelector('.v2-main'); if (m) m.scrollTop = 0; }
  const chip2 = (t, tone) => `<span class="chip ${tone || ''}">${t}</span>`;
  const btn = (label, act, data = {}, cls = '') => `<button type="button" class="btn ${cls}" data-act="${act}"${Object.entries(data).map(([k, v]) => ` data-${k}="${e(v)}"`).join('')}>${label}</button>`;
  const errOf = k => ui.err[k] ? `<p class="ferr" id="err-${k}">${e(ui.err[k])}</p>` : '';
  const fid = p => 'f-' + p.replace(/[^a-zA-Z0-9]/g, '-');
  function inp(label, path, o = {}) {
    const id = fid(path), v = getPath(S, path), k = o.err || path;
    const req = o.req ? '<span class="req">필수</span>' : (o.opt ? '<span class="opt">선택</span>' : '');
    const inv = ui.err[k] ? ` aria-invalid="true" aria-describedby="err-${k}"` : '';
    const ctl = o.area ? `<textarea id="${id}" data-v6b="${path}"${inv} placeholder="${e(o.ph || '')}">${e(v)}</textarea>`
      : `<input id="${id}" type="${o.type || 'text'}" data-v6b="${path}" value="${e(v)}"${inv} placeholder="${e(o.ph || '')}"${o.live ? ' data-v6live' : ''}>`;
    return `<div class="v6-field${o.wide ? ' v6-wide' : ''}"><label for="${id}">${label}${req}</label>${ctl}${o.hint ? `<span class="hint">${o.hint}</span>` : ''}${errOf(k)}</div>`;
  }
  function sel(label, path, opts, o = {}) {
    const id = fid(path), v = getPath(S, path), k = o.err || path;
    const inv = ui.err[k] ? ` aria-invalid="true" aria-describedby="err-${k}"` : '';
    return `<div class="v6-field${o.wide ? ' v6-wide' : ''}"><label for="${id}">${label}${o.req ? '<span class="req">필수</span>' : ''}</label><select id="${id}" data-v6b="${path}"${o.live ? ' data-v6live' : ''}${inv}>${opts.map(([val, l]) => `<option value="${e(val)}" ${String(v) === String(val) ? 'selected' : ''}>${e(l)}</option>`).join('')}</select>${o.hint ? `<span class="hint">${o.hint}</span>` : ''}${errOf(k)}</div>`;
  }
  function checks(label, path, opts, o = {}) {
    const v = getPath(S, path) || [], k = o.err || path;
    return `<fieldset class="v6-field v6-fs${o.wide ? ' v6-wide' : ''}"${ui.err[k] ? ` aria-describedby="err-${k}"` : ''}><legend>${label}${o.req ? '<span class="req">필수</span>' : ''}</legend><div class="v6-checks">${opts.map(([val, l]) => `<label><input type="checkbox" data-v6arr="${path}" value="${e(val)}" ${v.includes(val) ? 'checked' : ''}> ${e(l)}</label>`).join('')}</div>${errOf(k)}</fieldset>`;
  }
  function tabs6(g, items, def) {
    const cur = ui.tab[g] || def || items[0][0];
    return { cur, html: `<div class="v6-tabs" role="tablist">${items.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === cur}" data-act="v6-tab" data-g="${g}" data-k="${k}">${l}</button>`).join('')}</div>` };
  }
  function focusFirstErr() { const k = Object.keys(ui.err)[0]; if (!k) return; const el = document.querySelector(`[aria-describedby="err-${k}"]`); if (el) { const f = el.matches('fieldset') ? el.querySelector('input') : el; f && f.focus(); } }
  const ctryText = arr => (arr || []).map(c => CTRY[c] || c).join(', ') || '—';

  /* 제품 이미지: 기본 앰플은 assets/demo-ampoule.png, 없으면 SVG 대체 */
  const SHAPE = { 스킨케어: 'bottle', 헤어: 'bottle', 생활: 'box', 식품: 'pouch' };
  const COLOR = ['#7a5c8e', '#3d6f8e', '#d08a3c', '#5b8a5a', '#b5655a', '#8e6f9e'];
  function svgUri(p) {
    const c = COLOR[(p.name || '').length % COLOR.length], s = SHAPE[p.category] || 'bottle';
    const body = s === 'box' ? `<rect x="14" y="16" width="36" height="36" rx="5" fill="${c}"/><circle cx="32" cy="34" r="9" fill="#fff" opacity=".85"/>`
      : s === 'pouch' ? `<path d="M18 12h28l2 44H16z" fill="${c}"/><circle cx="32" cy="34" r="7" fill="#fff" opacity=".85"/>`
      : `<rect x="26" y="8" width="12" height="8" rx="2" fill="#333"/><rect x="20" y="16" width="24" height="40" rx="6" fill="${c}"/><rect x="24" y="28" width="16" height="12" rx="2" fill="#fff" opacity=".85"/>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#f3eff6"/>${body}</svg>`);
  }
  const pimg = (p, size = 48, extra = '') => p ? `<img class="v6-pimg" width="${size}" height="${size}" src="${e(p.img || svgUri(p))}" data-fb="${e(svgUri(p))}" alt="${e(p.name)} 이미지"${extra}>` : '';
  document.addEventListener('error', ev => { const t = ev.target; if (t && t.matches && t.matches('img[data-fb]') && t.src !== t.dataset.fb) t.src = t.dataset.fb; }, true);
  function missingOf(p) {
    const m = [];
    if (!p.name.trim()) m.push('제품명'); if (!p.category) m.push('카테고리'); if (p.usp.filter(x => x.trim()).length < 3) m.push('USP 3개');
    if (!p.desc.trim()) m.push('상세 설명'); if (!p.ship.length) m.push('배송 가능 국가'); if (!p.img && !p.seedPlaceholder) m.push('대표 이미지'); if (p.link && !isUrl(p.link)) m.push('판매 링크 형식');
    return m;
  }
  function rewardText(c) {
    if (c.goal === 'affiliate') return `판매 보상(판매금액의 ${c.affiliate.commission || '?'}%) · 샘플 ${c.affiliate.sampleQty || '?'}개`;
    if (c.goal === 'ugc') return `고정비 ${c.ugc.fee || '?'} ${c.ugc.currency} · ${c.ugc.payAt || '지급 시점 미정'}`;
    return `제품 제공 (금액 보상 없음) · 샘플 ${c.affiliate.sampleQty || '?'}개`;
  }
  const adText = c => c.content.adUse === 'ads' ? `브랜드 광고 사용 ${c.content.adDays || '?'}일` : c.content.adUse === 'organic' ? '브랜드 계정 재게시만' : '광고 사용 없음';
  const contentText = c => `${c.content.platform} 영상 ${c.content.count}개 · ${c.content.length}`;
  function campStatus(c) { return c.status === 'recruiting' ? chip2('모집 중', 'ok') : c.status === 'draft' ? chip2('초안') : chip2('모집 마감', 'err'); }

  /* ---------------- 입력 바인딩 (초안 자동 보존) ---------------- */
  document.addEventListener('input', ev => {
    const t = ev.target, p = t.dataset && t.dataset.v6b; if (!p || t.tagName === 'SELECT' || t.type === 'checkbox' || t.type === 'radio') return;
    setPath(S, p, t.value); saveSoon();
    if (ui.err[p]) { delete ui.err[p]; t.removeAttribute('aria-invalid'); const m = document.getElementById('err-' + p); if (m) m.remove(); }
    if ('v6live' in t.dataset) render();
  });
  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.dataset && t.dataset.v6b && (t.tagName === 'SELECT' || t.type === 'radio')) { setPath(S, t.dataset.v6b, t.value); save(); render(); return; }
    if (t.dataset && t.dataset.v6arr) { const arr = getPath(S, t.dataset.v6arr) || []; const i = arr.indexOf(t.value); if (t.checked && i < 0) arr.push(t.value); if (!t.checked && i >= 0) arr.splice(i, 1); setPath(S, t.dataset.v6arr, arr); save(); return; }
    if (t.dataset && t.dataset.v6ui && t.type !== 'text') { ui[t.dataset.v6ui] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.v6ui === 'senderQ' || t.dataset.v6ui === 'senderSt' || t.dataset.v6ui === 'senderBrand') ui.senderPage = 1; render(); return; }
    if (t.dataset && t.dataset.v6img) readImg(t);
  });
  document.addEventListener('input', ev => { const t = ev.target; if (t.dataset && t.dataset.v6ui && t.type === 'text') { ui[t.dataset.v6ui] = t.value; if (t.dataset.v6ui === 'senderQ') ui.senderPage = 1; render(); } });
  function readImg(input) {
    const f = input.files && input.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) { toast('이미지 파일만 올릴 수 있어요.'); return; }
    const [pid, slot] = input.dataset.v6img.split('|');
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 480 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
        cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        const url = cv.toDataURL('image/jpeg', 0.82), p = S.products[pid];
        if (slot === 'main') p.img = url; else if (p.imgs.length < 4) p.imgs.push(url); else { toast('추가 이미지는 4장까지예요.'); return; }
        save(); render(); toast('이미지를 이 브라우저에만 저장했어요 (서버 업로드 없음).');
      };
      im.src = r.result;
    };
    r.readAsDataURL(f);
  }
  ACT['v6-tab'] = el => { ui.tab[el.dataset.g] = el.dataset.k; ui.err = {}; render(); const t = document.querySelector(`[data-act="v6-tab"][data-g="${el.dataset.g}"][data-k="${el.dataset.k}"]`); if (t) t.focus(); };

  /* ---------------- 메뉴·번호 매핑 ---------------- */
  function setMenu(role, label, screens) { const m = MENUS[role].find(x => x.label === label || x.screens.some(s => screens.some(n => n[0] === s[0]))); if (m) m.screens = screens; }
  setMenu('brand', '제품·캠페인', [['b-campaigns', '캠페인 관리'], ['b-create', '새 캠페인'], ['b-products', '제품 라이브러리'], ['b-applicants', '지원자'], ['b-samples', '샘플·영상']]);
  setMenu('brand', '아웃리치·인박스', [['b-mailconnect', '이메일 연결'], ['b-invite', '받는 사람 찾기'], ['b-mailprep', '메일 작성·검수'], ['b-reply', '회신함'], ['b-sendlog', '발송 로그']]);
  MENUS.brand.forEach(m => { if (m.label === '제품·캠페인') m.label = '캠페인 관리'; });
  MENUS.creator.forEach(m => { if (m.label === '선정된 나의 협업') m.label = '내 캠페인'; if (m.label === '모집채널') m.label = '캠페인 공지'; });
  if (!SCREENS.brand.some(s => s[0] === 'b-campaigns')) SCREENS.brand.splice(1, 0, ['b-campaigns', '캠페인 관리'], ['b-mailconnect', '이메일 연결']);
  COVERAGE.items.forEach(it => { if (typeof findMenu === 'function') { const f = findMenu(it.proposalRole, it.screen); if (f) it.screenLabel = f.m.screens.length > 1 ? `${f.m.label} › ${f.sub}` : f.m.label; } });
  /* 기존 번호에 v6 요구 반영 (번호 추가 없음) */
  const V6NOTE = {
    B02: '브랜드 학습 폼(소개·홈페이지·국가·USP·금지 표현·FAQ)과 완료/부족 표시, 미완성 제품 편집기로 바로 이동',
    B03: '제품 라이브러리: 대표·추가 이미지, USP 3개, 상세·사용법·금지 표현, 판매 링크·Shop ID·가격·배송 국가, 크리에이터 화면 미리보기',
    B04: '캠페인 관리 중심 재구성, 새 캠페인 4단계(목적·이름·국가·기간 / 제품 / 참여 조건 / 미리보기·모집 시작)',
    B06: '이메일 연결 → 받는 사람 찾기 → 매칭 → 내용 → 수신자별 미리보기 → 제외 → 승인·테스트(시안) → 대기열',
    B07: '회신함: 캠페인·발신 계정·상태(답장 필요/긍정/질문/거절/수신 거부), 담당자 배정, 후속 할 일',
    B11: '커뮤니티·DM 3영역(목록/대화/캠페인 정보), 채널 관리(추가·이름·공개 범위·연결 캠페인·보관), 캠페인 게시 → 크리에이터 채널',
    B12: 'AI는 답장 초안만 만들고 담당자가 검토 후 보내기',
    B13: '청구: 가입·사람 검증·주소 등록/확인·청구 대상 분리, 계약 단가 미설정',
    B14: '팀: 등록 → 이메일 확인 → 초대 링크(시안) → 활성, 역할 권한 미리보기, 중복 이메일 오류',
    C03: '캠페인 리스트(신청 전/신청함/선정됨/진행 중/완료)와 내 캠페인 분리',
    C06: '내 할 일: 브랜드 > 캠페인, 제품 이미지, 단계, 마감, 다음 행동 하나',
    C11: '브랜드가 만든 채널과 캠페인 게시 카드가 크리에이터 채널에 보임, 랭킹·미션 XP 분리',
    C12: '브랜드 담당자 DM: 브랜드·캠페인별 대화, 브랜드 회신함과 같은 메시지',
    A02: '브랜드 가입 승인(시안) + 관리 브랜드 직접 등록 → 브랜드 콘솔',
    A06: '발신 계정 200개(.example 가상) 검색·필터·20개씩 페이지, 하나씩 연결(시안), CSV 메타데이터 검수 등록',
    A07: '브랜드 콘솔 컨텍스트: 선택한 브랜드 데이터만 관리',
    X01: '세 역할이 같은 캠페인·참여 건 상태를 공유',
    X02: '참여 조건(보상·콘텐츠·광고 사용 범위·기한)을 캠페인에 묶어 미리보기',
  };
  Object.entries(V6NOTE).forEach(([id, t]) => { const it = BY_ID[id]; if (it && !it.ui.some(u => u.startsWith('[v6]'))) it.ui.push('[v6] ' + t); });
  const COV6 = { B02: 'b-learning', B05: 'b-invite', B06: 'b-mailprep', B07: 'b-reply', B12: 'b-reply' };
  Object.entries(COV6).forEach(([id, s]) => { if (COV[id]) COV[id].screen = s; });

  /* ---------------- 브랜드 전환 (상단·레일) / 크리에이터 브랜드 ---------------- */
  ACT['v6-brandpop'] = () => { ui.brandPop = !ui.brandPop; render(); const f = document.querySelector('.v6-pop button'); if (f) f.focus(); };
  ACT['v6-setbrand'] = el => { S.brandId = el.dataset.b; ui.brandPop = false; ui.campSel = null; ui.editProduct = null; ui.appCamp = null; ui.dmSel = null; save(); render(); toast(`${brand(S.brandId).short} 콘솔로 바꿨어요.`); };
  ACT['v6-setcbrand'] = el => { S.creatorBrand = el.dataset.b; ui.cCampSel = null; ui.cWorkSel = null; ui.cDmCamp = null; ui.ap = null; ui.addr = null; ui.err = {}; save(); render(); };
  const initials = b => b.short.slice(0, 1);
  function decorateFrame() {
    const app = document.querySelector('.v2'); if (!app) return;
    app.querySelectorAll('.v2-side .v2-navbtn').forEach(bn => { if (bn.textContent.trim() === '캠페인 관리') { bn.setAttribute('data-v5', ''); bn.innerHTML = '<svg class="v5-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/></svg><span class="v5-lab">캠페인 관리</span>'; } });
    if (app.classList.contains('v2-brand')) {
      const b = brand(S.brandId);
      const tb = app.querySelector('.v2-top .v2-topbtn');
      if (tb) { tb.removeAttribute('data-demo'); tb.setAttribute('data-act', 'v6-brandpop'); tb.setAttribute('aria-expanded', String(ui.brandPop)); tb.textContent = `${b.short} ▾`; }
      if (ui.brandPop && tb && !app.querySelector('.v6-pop')) tb.insertAdjacentHTML('afterend', `<div class="v6-pop" role="menu">${Object.values(S.brands).map(x => `<button type="button" role="menuitem" data-act="v6-setbrand" data-b="${x.id}"${x.id === S.brandId ? ' aria-current="true"' : ''}>${e(x.name)}</button>`).join('')}</div>`);
      const rail = app.querySelector('.v2-rail');
      if (rail) rail.innerHTML = Object.values(S.brands).map(x => `<button type="button" data-act="v6-setbrand" data-b="${x.id}" aria-label="${e(x.short)}"${x.id === S.brandId ? ' aria-current="true"' : ''}>${e(initials(x))}</button>`).join('') + `<button type="button" data-demo="새 브랜드는 관리자 승인 또는 직접 등록 후 추가돼요 (시안)." aria-label="브랜드 추가">+</button>`;
      const ws = app.querySelector('.v2-ws b'); if (ws) ws.textContent = b.short;
    }
    if (app.classList.contains('v2-creator')) {
      const b = brand(S.creatorBrand);
      const rail = app.querySelector('.v2-rail');
      if (rail) rail.innerHTML = `<button type="button" data-nav="c-rewards" aria-label="내 공간">pr.</button>` + S.memberships.map(id => brand(id)).map(x => `<button type="button" data-act="v6-setcbrand" data-b="${x.id}" aria-label="${e(x.short)}"${x.id === S.creatorBrand ? ' aria-current="true"' : ''}>${e(initials(x))}</button>`).join('') + `<button type="button" data-demo="브랜드 찾기는 제품 모아보기 페이지에서 해요 (시안)." aria-label="브랜드 찾기">+</button><button type="button" data-nav="c-profile" aria-label="설정">⚙</button>`;
      const ws = app.querySelector('.v2-ws b'); if (ws) ws.textContent = b.short;
      const si = app.querySelector('.v2-search input'); if (si) si.placeholder = `${b.short} 안에서 검색`;
      const missionLabel = `미션·배지 Lv.${level(xpOf(S.creatorBrand).total).l}`;
      const ml = app.querySelector('.v2-side [data-nav="c-missions"] .v5-lab'); if (ml) ml.textContent = missionLabel;
      if (view.screen.creator === 'c-missions') { const currentMenu = app.querySelector('.v2-mobilebar .small b'); if (currentMenu) currentMenu.textContent = missionLabel; }
      // 브랜드가 만든 채널 (자유대화 다음에)
      const free = app.querySelector('.v2-side [data-nav="c-community"]');
      if (free) {
        const chs = Object.entries(S.channels).filter(([, c]) => c.brandId === S.creatorBrand && !c.archived && !c.base);
        const cur = ui.ch[S.creatorBrand] || chFree(S.creatorBrand);
        if (view.screen.creator === 'c-community' && cur !== chFree(S.creatorBrand)) free.removeAttribute('aria-current');
        free.insertAdjacentHTML('afterend', chs.map(([id, c]) => `<button type="button" class="v2-navbtn v6-chbtn" data-v5 data-act="v6-cch" data-ch="${id}"${view.screen.creator === 'c-community' && cur === id ? ' aria-current="page"' : ''}><svg class="v5-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M5 9h15M4 15h15M10 3L8 21M16 3l-2 18"/></svg><span class="v5-lab">${e(c.name)}</span></button>`).join(''));
      }
    }
  }
  const chFree = bid => (Object.entries(S.channels).find(([, c]) => c.brandId === bid && c.base === 'free') || [''])[0];
  const chNotice = bid => (Object.entries(S.channels).find(([, c]) => c.brandId === bid && c.base === 'notice') || [''])[0];
  ACT['v6-cch'] = el => { ui.ch[S.creatorBrand] = el.dataset.ch; view.screen.creator = 'c-community'; saveView(); render(); };
  document.addEventListener('click', ev => { const t = ev.target.closest('.v2-side [data-nav="c-community"]'); if (t) ui.ch[S.creatorBrand] = chFree(S.creatorBrand); }, true);
  document.addEventListener('click', ev => { if (ui.brandPop && !ev.target.closest('.v6-pop') && !ev.target.closest('[data-act="v6-brandpop"]')) { ui.brandPop = false; render(); } });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && ui.brandPop) { ui.brandPop = false; render(); const t = document.querySelector('[data-act="v6-brandpop"]'); if (t) t.focus(); } });

  /* 기존 화면의 예시 브랜드명을 현재 선택 브랜드로 */
  const swap = html => { const b = brand(S.brandId); return html.replace(/FAU\(디자인 예시\)/g, b.name).replace(/FAU 워크스페이스/g, `${b.short} 워크스페이스`); };
  ['b-today', 'b-samples', 'b-results', 'b-learning-old'].forEach(k => { const f = RENDER[k]; if (f) RENDER[k] = () => swap(f()); });

  window.__v6 = { S: () => S, ui, seed, save, reset: () => { S = seed(); save(); render(); } };

  /* =====================================================================
     브랜드 공통 컴포넌트 (브랜드 화면과 관리자 브랜드 콘솔이 같은 함수를 쓴다)
     ===================================================================== */
  function ctxHead(bid, title, sub, badges = '') {
    const b = brand(bid);
    return `<div class="v6-head"><div class="v6-head-t"><p class="v6-ctx">${e(b.name)}${view.role === 'admin' ? ' · 관리자 브랜드 콘솔' : ''}</p><h1>${title} ${badges}</h1>${sub ? `<p class="v6-sub">${sub}</p>` : ''}</div></div>`;
  }
  /* ----- 브랜드 학습 ----- */
  function learnStatus(L) {
    return [['브랜드 소개', L.intro.trim().length >= 20], ['홈페이지', isUrl(L.homepage)], ['국가', L.countries.length > 0], ['USP', L.usp.trim().length >= 5], ['사용 금지 표현', L.banned.trim().length > 0], ['FAQ 2개 이상', L.faq.filter(f => f.q.trim() && f.a.trim()).length >= 2]];
  }
  function compLearning(bid) {
    const L = S.learning[bid] || (S.learning[bid] = { intro: '', homepage: '', countries: [], usp: '', banned: '', faq: [], savedAt: '' });
    const st = learnStatus(L), done = st.filter(x => x[1]).length;
    const base = `learning.${bid}`;
    const incomplete = prods(bid).filter(p => missingOf(p).length);
    const faqDone = L.faq.filter(f => f.q.trim() && f.a.trim()).length;
    const todo = st.filter(x => !x[1]).map(([l]) => l === 'FAQ 2개 이상' ? `FAQ ${Math.max(1, 2 - faqDone)}개 더 작성` : `${l} 보완`);
    return `<div class="v6 v6-learn">${ctxHead(bid, '브랜드 학습', '브랜드 자료는 AI 답장 초안과 캠페인 미리보기의 근거로 쓰여요.', b('B02', { noId: true }))}
      <p class="v7-ready-mobile"><span><b>준비 ${done}/${st.length}</b>${todo.length ? ' · ' + e(todo.join(', ')) : ' · 모두 준비됐어요'}</span><a href="#v6-ready-h">준비 현황 보기</a></p>
      <div class="v6-layout"><div class="v6-main">
        <section class="v6-sec v6-block"><h2>브랜드 기본 자료</h2><p class="v6-sec-sub">크리에이터가 초대·캠페인에서 처음 읽는 소개예요.</p><div class="v6-form">
          ${inp('브랜드 소개', base + '.intro', { req: true, area: true, wide: true, hint: '20자 이상. 크리에이터에게 보이는 첫 문장이에요.' })}
          ${inp('홈페이지', base + '.homepage', { req: true, type: 'url', ph: 'https://', wide: true })}
          ${checks('운영 국가', base + '.countries', Object.entries(CTRY), { req: true, wide: true })}
        </div></section>
        <section class="v6-sec v6-block"><h2>크리에이터용 표현</h2><p class="v6-sec-sub">AI 답장 초안과 캠페인 미리보기에 그대로 쓰여요.</p><div class="v6-form">
          ${inp('USP (핵심 장점)', base + '.usp', { req: true, area: true, wide: true })}
          ${inp('사용 금지 표현', base + '.banned', { req: true, area: true, wide: true, hint: '쉼표로 구분. 예: 치료, 완치' })}
        </div></section>
        <section class="v6-sec v6-block"><h2>자주 묻는 질문 <span class="v6-count-inline">${L.faq.length}개</span></h2><p class="v6-sec-sub">질문과 답변을 모두 채운 항목이 2개 이상이면 준비 완료예요.</p>
          <ul class="v6-list">${L.faq.map((f, i) => `<li class="v6-row v6-faq">${inp(`질문 ${i + 1}`, `${base}.faq.${i}.q`)}${inp('답변', `${base}.faq.${i}.a`, { area: true })}<div class="v6-actions">${btn('삭제', 'v6-faqdel', { b: bid, i }, 'ghost danger')}</div></li>`).join('') || '<li class="v6-empty">아직 FAQ가 없어요. ‘FAQ 추가’로 첫 질문을 적어 주세요.</li>'}</ul>
          <div class="v6-actions">${btn('FAQ 추가', 'v6-faqadd', { b: bid })}</div></section>
        <div class="v6-savebar"><p class="v6-meta">입력 내용은 이 브라우저에 자동 저장돼요. ‘검증하고 저장’을 누르면 필수 항목을 확인해요.${L.savedAt ? ` 마지막 확정 ${e(L.savedAt)}` : ''}</p>${btn('검증하고 저장', 'v6-learnsave', { b: bid }, 'pri')}</div>
      </div>
      <aside class="v6-aside" aria-labelledby="v6-ready-h"><h2 id="v6-ready-h">준비 현황</h2>
        <p class="v6-summary"><b>준비 ${done}/${st.length}</b>${todo.length ? ' · ' + e(todo.join(', ')) : ' · 모두 준비됐어요'}</p>
        <div class="v6-progress" role="progressbar" aria-label="브랜드 학습 준비" aria-valuemin="0" aria-valuemax="${st.length}" aria-valuenow="${done}"><span style="width:${Math.round(done / st.length * 100)}%"></span></div>
        <ul class="v6-checklist">${st.map(([l, ok]) => `<li class="${ok ? 'is-ok' : 'is-todo'}"><span class="v6-mark" aria-hidden="true">${ok ? '✓' : '!'}</span>${e(l)}<span class="v6-sr">${ok ? ' 완료' : ' 부족'}</span></li>`).join('')}</ul>
        <h3>제품 자료</h3>
        <ul class="v6-mini">${prods(bid).map(p => { const m = missingOf(p); return `<li>${pimg(p, 32)}<div class="v6-grow"><b>${e(p.name || '이름 없는 제품')}</b><span class="v6-meta">${m.length ? '부족: ' + m.join(', ') : '초대·캠페인에 쓸 수 있어요'}</span></div>${m.length ? btn('제품에서 보완', 'v6-fixprod', { p: p.id }) : `<span class="v6-meta">완료</span>`}</li>`; }).join('') || '<li class="v6-empty">등록한 제품이 없어요.</li>'}</ul>
        ${incomplete.length ? '' : '<p class="v6-meta">모든 제품 자료가 준비됐어요.</p>'}
      </aside></div></div>`;
  }
  ACT['v6-faqadd'] = el => { S.learning[el.dataset.b].faq.push({ q: '', a: '' }); save(); render(); const fs = document.querySelectorAll('.v6-faq input'); if (fs.length) fs[fs.length - 1].focus(); };
  ACT['v6-faqdel'] = el => { S.learning[el.dataset.b].faq.splice(Number(el.dataset.i), 1); save(); render(); };
  ACT['v6-learnsave'] = el => {
    const bid = el.dataset.b, L = S.learning[bid], base = `learning.${bid}`; ui.err = {};
    if (L.intro.trim().length < 20) ui.err[base + '.intro'] = '브랜드 소개를 20자 이상 적어 주세요.';
    if (!isUrl(L.homepage)) ui.err[base + '.homepage'] = 'https://로 시작하는 주소를 적어 주세요. 예: https://brand.example';
    if (!L.countries.length) ui.err[base + '.countries'] = '운영 국가를 하나 이상 골라 주세요.';
    if (Object.keys(ui.err).length) { render(); focusFirstErr(); return; }
    L.savedAt = new Date().toLocaleString('ko-KR'); save(); render(); toast('검증 후 이 브라우저에 저장했어요 (서버 저장 없음).');
  };
  ACT['v6-fixprod'] = el => { ui.editProduct = el.dataset.p; ui.returnTo = null; ui.err = {}; if (view.role === 'admin') { ui.tab.console = 'products'; render(); } else go('b-products'); const f = document.getElementById(fid(`products.${el.dataset.p}.name`)); if (f) f.focus(); };

  /* ----- 제품 라이브러리·편집기 ----- */
  function compProducts(bid) {
    if (ui.editProduct && S.products[ui.editProduct] && S.products[ui.editProduct].brandId === bid) return productEditor(S.products[ui.editProduct]);
    const list = prods(bid);
    return `<div class="v6">${ctxHead(bid, '제품 라이브러리', '캠페인에 연결할 제품 정보예요. 크리에이터에게 보이는 소개를 미리 확인할 수 있어요.', b('B03'))}
      <div class="v6-actions">${btn('새 제품 등록', 'v6-newprod', { b: bid }, 'pri')}</div>
      <ul class="v6-list">${list.map(p => { const m = missingOf(p), c = camps(bid).filter(x => x.productId === p.id); return `<li class="v6-row">${pimg(p, 48)}<div class="v6-grow"><b>${e(p.name || '이름 없는 제품')}</b><span class="v6-meta">${e(p.category || '카테고리 없음')} · 배송 ${ctryText(p.ship)} · 연결 캠페인 ${c.length}개${p.public ? ' · 제품 모아보기 공개' : ''}</span></div>${m.length ? chip2('미완성: ' + m.join(', '), 'warn') : chip2('완료', 'ok')}${btn('편집', 'v6-editprod', { p: p.id })}</li>`; }).join('') || '<li class="v6-empty">등록한 제품이 없어요.</li>'}</ul></div>`;
  }
  function productEditor(p) {
    const base = `products.${p.id}`, m = missingOf(p);
    return `<div class="v6">${ctxHead(p.brandId, `제품 편집 · ${e(p.name || '새 제품')}`, m.length ? `아직 부족: ${m.join(', ')}` : '필수 정보가 모두 채워졌어요.', b('B03', { noId: true }))}
      <div class="v6-actions">${btn('← 목록으로', 'v6-closeprod', {}, 'ghost')}</div>
      <div class="v6-split"><div class="v6-col">
        <section class="v6-sec"><h2>이미지</h2>
          <div class="v6-imgrow"><div class="v6-imgbox">${pimg(p, 120)}<span class="v6-meta">대표 이미지${p.img ? '' : p.seedPlaceholder ? ' · 예시 SVG 그림 (시드 데이터)' : ' · 아직 없음 (공개·모집에 필수)'}</span></div>
            <div class="v6-actions"><label class="btn v6-file">대표 이미지 ${p.img ? '교체' : '선택'}<input type="file" accept="image/*" data-v6img="${p.id}|main"></label>${p.img ? btn('대표 이미지 삭제', 'v6-imgdel', { p: p.id, i: 'main' }, 'ghost') : ''}</div></div>
          <div class="v6-thumbs">${p.imgs.map((src, i) => `<div class="v6-thumb"><img src="${e(src)}" width="72" height="72" alt="추가 이미지 ${i + 1}">${btn('삭제', 'v6-imgdel', { p: p.id, i }, 'ghost')}</div>`).join('')}
            ${p.imgs.length < 4 ? `<label class="btn v6-file">추가 이미지 (${p.imgs.length}/4)<input type="file" accept="image/*" data-v6img="${p.id}|extra"></label>` : ''}</div>
          <p class="v6-meta">이미지는 이 브라우저에만 저장돼요. 서버 업로드는 없어요. 공개·모집 시작에는 대표 이미지 등록이 필수예요${p.seedPlaceholder ? ' — 이 예시 제품은 시드 데이터라 SVG 그림으로 대신 보여 줘요' : ''}.</p>${errOf(`products.${p.id}.img`)}</section>
        <section class="v6-sec"><h2>제품 정보</h2><div class="v6-form">
          ${inp('제품명', base + '.name', { req: true })}
          ${sel('카테고리', base + '.category', [['', '고르세요'], ['스킨케어', '스킨케어'], ['헤어', '헤어'], ['생활', '생활'], ['식품', '식품']], { req: true })}
          ${inp('USP 1', base + '.usp.0', { req: true, err: base + '.usp' })}${inp('USP 2', base + '.usp.1', { req: true })}${inp('USP 3', base + '.usp.2', { req: true })}
          ${inp('상세 설명', base + '.desc', { req: true, area: true, wide: true })}
          ${inp('사용 방법', base + '.howto', { opt: true, area: true })}
          ${inp('사용 금지 표현', base + '.banned', { opt: true, area: true })}
          ${inp('판매 링크', base + '.link', { opt: true, type: 'url', ph: 'https://' })}
          ${inp('Shop 상품 ID', base + '.shopId', { opt: true })}
          ${inp('정가', base + '.price', { opt: true, type: 'number' })}
          ${sel('통화', base + '.currency', [['USD', 'USD'], ['KRW', 'KRW'], ['THB', 'THB']])}
          ${checks('배송 가능 국가', base + '.ship', Object.entries(CTRY), { req: true, wide: true })}
          <div class="v6-field v6-wide"><label class="v6-inline"><input type="checkbox" data-v6pub="${p.id}" ${p.public ? 'checked' : ''}> 크리에이터 ‘제품 모아보기’에 공개 (필수 정보가 모두 채워지고 저장된 제품만 노출)</label></div>
        </div></section>
        ${errOf('prod-save')}
        <div class="v6-actions v6-bar">${btn(ui.returnTo === 'wizard' ? '저장하고 캠페인으로 돌아가기' : '검증하고 저장', 'v6-saveprod', { p: p.id }, 'pri')}${btn('임시 저장', 'v6-draftprod', { p: p.id })}</div>
      </div>
      <aside class="v6-col v6-preview" aria-label="크리에이터가 보는 제품 소개">${productPreview(p)}</aside></div></div>`;
  }
  function productPreview(p) {
    return `<p class="v6-kicker">크리에이터가 보는 제품 소개 (미리보기)</p>
      <div class="v6-pv">${pimg(p, 96)}<div><p class="v6-meta">${e(brand(p.brandId).short)} · ${e(p.category || '카테고리')}</p><h3>${e(p.name || '제품명')}</h3></div></div>
      <ul class="v6-usp">${p.usp.map(u => `<li>${e(u || '—')}</li>`).join('')}</ul>
      <p>${e(p.desc || '상세 설명이 아직 없어요.')}</p>${p.howto ? `<p class="v6-meta">사용 방법: ${e(p.howto)}</p>` : ''}
      <p class="v6-meta">배송 가능: ${ctryText(p.ship)}${p.price ? ` · 정가 ${e(p.price)} ${e(p.currency)}` : ''}</p>`;
  }
  ACT['v6-newprod'] = el => { const id = uid('p-'); S.products[id] = { id, brandId: el.dataset.b, name: '', category: '', usp: ['', '', ''], desc: '', howto: '', banned: '', link: '', shopId: '', price: '', currency: 'USD', ship: [], img: '', imgs: [], public: false }; ui.editProduct = id; save(); render(); };
  ACT['v6-editprod'] = el => { ui.editProduct = el.dataset.p; ui.err = {}; render(); };
  ACT['v6-closeprod'] = () => { ui.editProduct = null; ui.err = {}; render(); };
  ACT['v6-imgdel'] = el => { const p = S.products[el.dataset.p]; if (el.dataset.i === 'main') { p.img = ''; p.seedPlaceholder = false; } else p.imgs.splice(Number(el.dataset.i), 1); save(); render(); };
  ACT['v6-draftprod'] = () => { save(); toast('임시 저장했어요. 미완성 제품은 캠페인 모집을 시작할 수 없어요.'); };
  ACT['v6-saveprod'] = el => {
    const p = S.products[el.dataset.p], base = `products.${p.id}`; ui.err = {};
    if (!p.name.trim()) ui.err[base + '.name'] = '제품명을 적어 주세요.';
    if (!p.category) ui.err[base + '.category'] = '카테고리를 골라 주세요.';
    if (p.usp.filter(x => x.trim()).length < 3) ui.err[base + '.usp'] = 'USP 3개를 모두 적어 주세요.';
    if (!p.desc.trim()) ui.err[base + '.desc'] = '상세 설명을 적어 주세요.';
    if (!p.ship.length) ui.err[base + '.ship'] = '배송 가능 국가를 하나 이상 골라 주세요.';
    if (!p.img && !p.seedPlaceholder) ui.err[base + '.img'] = '대표 이미지를 등록해 주세요.';
    if (p.link && !isUrl(p.link)) ui.err[base + '.link'] = 'https://로 시작하는 주소를 적어 주세요.';
    if (Object.keys(ui.err).length) { render(); focusFirstErr(); return; }
    p.saved = true; save();
    if (ui.returnTo === 'wizard') { draftOf(p.brandId).productId = p.id; ui.editProduct = null; ui.returnTo = null; ui.wiz = 2; save(); go('b-create'); toast('제품을 저장하고 캠페인에 연결했어요.'); return; }
    ui.editProduct = null; render(); toast('제품을 저장했어요 (이 브라우저에만).');
  };
  document.addEventListener('change', ev => { const t = ev.target; if (t.dataset && t.dataset.v6pub) { const p = S.products[t.dataset.v6pub]; p.public = t.checked; save(); toast(t.checked ? (missingOf(p).length ? '공개로 표시했지만 필수 정보가 채워져야 제품 모아보기에 노출돼요.' : '제품 모아보기에 공개돼요 (시안 · 같은 브라우저).') : '제품 모아보기에서 내렸어요.'); } });

  /* ----- 캠페인 목록·상세 ----- */
  function compCampaigns(bid) {
    const c = ui.campSel && S.campaigns[ui.campSel] && S.campaigns[ui.campSel].brandId === bid ? S.campaigns[ui.campSel] : null;
    if (c) return campaignDetail(c);
    const list = camps(bid);
    return `<div class="v6">${ctxHead(bid, '캠페인 관리', '캠페인마다 연결 제품·참여 조건·지원자·샘플·콘텐츠를 한곳에서 관리해요.', b('B04', { noId: true }))}
      <div class="v6-actions">${btn('새 캠페인', 'v6-newcamp', { b: bid }, 'pri')}</div>
      <div class="v6-table" role="table" aria-label="캠페인 목록"><div class="v6-tr v6-th" role="row"><span role="columnheader">캠페인</span><span role="columnheader">목적</span><span role="columnheader">기간</span><span role="columnheader">지원자</span><span role="columnheader">상태</span><span role="columnheader"></span></div>
      ${list.map(x => { const p = S.products[x.productId]; return `<div class="v6-tr" role="row"><span role="cell" class="v6-cellmain">${pimg(p, 36)}<span><b>${e(x.name || '이름 없는 캠페인')}</b><span class="v6-meta">${e(p ? p.name : '제품 미선택')} · ${e(x.id)}</span></span></span><span role="cell">${e(GOAL[x.goal])}</span><span role="cell">${e(x.start || '—')} ~ ${e(x.end || '—')}</span><span role="cell">${partsOf(x.id).length}명</span><span role="cell">${campStatus(x)}</span><span role="cell">${btn('열기', 'v6-opencamp', { c: x.id })}</span></div>`; }).join('') || '<div class="v6-empty">아직 캠페인이 없어요.</div>'}</div></div>`;
  }
  function campaignDetail(c) {
    const p = S.products[c.productId], t = tabs6('camp', [['ov', '개요'], ['prod', '제품'], ['app', `지원자 ${partsOf(c.id).length}`], ['sc', '샘플·콘텐츠'], ['msg', '메시지']], 'ov');
    let body = '';
    if (t.cur === 'ov') body = `${condSummary(c)}<div class="v6-actions">${c.status === 'recruiting' ? btn('모집 마감 (시안)', 'v6-campstatus', { c: c.id, s: 'closed' }) : btn('모집 시작 (시안)', 'v6-campstatus', { c: c.id, s: 'recruiting' }, 'pri')}${btn('조건 고치기', 'v6-editcamp', { c: c.id })}${btn('커뮤니티에 게시', 'v6-gopost', { c: c.id })}</div>${errOf('camp-status')}`;
    if (t.cur === 'prod') body = p ? `<div class="v6-split"><div class="v6-col">${productPreview(p)}</div><div class="v6-col">${btn('제품 편집', 'v6-fixprod', { p: p.id })}</div></div>` : '<p class="v6-empty">연결된 제품이 없어요.</p>';
    if (t.cur === 'app') body = applicantsBody(c);
    if (t.cur === 'sc') body = `<ul class="v6-list">${partsOf(c.id).filter(x => ['selected', 'sample', 'video', 'done'].includes(x.status)).map(x => `<li class="v6-row"><div class="v6-grow"><b>${e(CR[x.creatorId].name)}</b><span class="v6-meta">${PST[x.status]}${x.addr ? ' · 주소 ' + e(x.addr) : ' · 주소 미입력'}${x.videoUrl ? ' · 영상 ' + e(x.videoUrl) : ''}</span></div>${chip2(PST[x.status], PST_TONE[x.status])}${nextBrandAction(x)}</li>`).join('') || '<li class="v6-empty">선정된 크리에이터가 없어요.</li>'}</ul>${storyboard(c, p)}`;
    if (t.cur === 'msg') body = `<ul class="v6-list">${Object.entries(S.dms).filter(([, d]) => d.campaignId === c.id).map(([id, d]) => `<li class="v6-row"><div class="v6-grow"><b>${e(CR[d.creatorId].name)}</b><span class="v6-meta">${e(d.msgs[d.msgs.length - 1].text)}</span></div>${needsReply(d) ? chip2('답장 필요', 'warn') : chip2('완료', 'ok')}${btn('대화 열기', 'v6-opendm', { d: id })}</li>`).join('') || '<li class="v6-empty">이 캠페인 대화가 없어요.</li>'}</ul>`;
    return `<div class="v6">${ctxHead(c.brandId, e(c.name), `${e(GOAL[c.goal])} · ${e(c.id)}`, campStatus(c))}
      <div class="v6-actions">${btn('← 캠페인 목록', 'v6-closecamp', {}, 'ghost')}</div>${t.html}<div class="v6-tabbody">${body}</div></div>`;
  }
  function condSummary(c) {
    const p = S.products[c.productId];
    return `<div class="v6-cond">${pimg(p, 64)}<dl class="v6-kv"><dt>제품</dt><dd>${e(p ? p.name : '—')}</dd><dt>목적</dt><dd>${e(GOAL[c.goal])}</dd><dt>보상</dt><dd>${e(rewardText(c))}</dd><dt>콘텐츠</dt><dd>${e(contentText(c))} · 필수: ${e(c.content.must || '—')}</dd><dt>기한</dt><dd>${e(c.content.due || '—')}</dd><dt>광고 사용</dt><dd>${e(adText(c))}</dd><dt>국가 · 인원</dt><dd>${ctryText(c.countries)} · ${e(c.cap || '?')}명</dd><dt>기간</dt><dd>${e(c.start)} ~ ${e(c.end)}</dd></dl></div>`;
  }
  function storyboard(c, p) {
    const sc = [['오프닝', `${p ? p.name : '제품'}을 손에 들고 첫인상 한마디`], ['사용', p && p.howto ? p.howto : '실제 사용 장면'], ['USP', p ? p.usp.filter(Boolean).join(' · ') : 'USP'], ['구매 유도', c.goal === 'affiliate' ? '상품 연결 링크 안내' : '브랜드 계정 태그']];
    return `<section class="v6-sec"><h2>영상 브리프 · 장면별 스토리보드</h2><p class="v6-meta">실제 영상은 없어요. 브리프와 제품 이미지로 만든 장면 구성 미리보기예요.</p>
      <ol class="v6-board">${sc.map(([t, d], i) => `<li><div class="v6-frame">${pimg(p, 56)}<span>${i + 1}</span></div><b>${t}</b><span class="v6-meta">${e(d)}</span></li>`).join('')}</ol>
      ${c.videoUrl ? `<p class="v6-meta">참고 영상 링크(직접 첨부): ${e(c.videoUrl)}</p>` : ''}</section>`;
  }
  const needsReply = d => d.status !== 'done' && d.msgs.length && d.msgs[d.msgs.length - 1].from === 'creator';
  function nextBrandAction(x) {
    if (x.status === 'selected') return x.addr ? btn('샘플 발송 처리 (시안)', 'v6-pstatus', { p: x.id, s: 'sample' }) : '<span class="v6-meta">크리에이터 주소 입력 대기</span>';
    if (x.status === 'video') return x.videoUrl ? btn('영상 확인 완료 (시안)', 'v6-pstatus', { p: x.id, s: 'done' }, 'pri') : '<span class="v6-meta">영상 제출 대기</span>';
    if (x.status === 'sample') return '<span class="v6-meta">크리에이터 수령 확인 대기</span>';
    return '';
  }
  ACT['v6-newcamp'] = el => { const bid = el.dataset.b; S.drafts[bid] = null; draftOf(bid); ui.wiz = 1; save(); if (view.role === 'admin') { ui.tab.console = 'create'; render(); } else go('b-create'); };
  ACT['v6-opencamp'] = el => { ui.campSel = el.dataset.c; ui.tab.camp = 'ov'; render(); };
  ACT['v6-closecamp'] = () => { ui.campSel = null; render(); };
  ACT['v6-editcamp'] = el => { const c = S.campaigns[el.dataset.c]; S.drafts[c.brandId] = JSON.parse(JSON.stringify(c)); ui.wiz = 1; save(); if (view.role === 'admin') { ui.tab.console = 'create'; render(); } else go('b-create'); };
  ACT['v6-campstatus'] = el => {
    const c = S.campaigns[el.dataset.c];
    if (el.dataset.s === 'recruiting') { const errs = campErrors(c); if (errs.length) { ui.err['camp-status'] = '모집을 시작할 수 없어요: ' + errs.join(' / '); render(); return; } }
    c.status = el.dataset.s; save(); render(); toast(el.dataset.s === 'recruiting' ? '모집 중으로 표시했어요 (시안).' : '모집 마감으로 표시했어요 (시안).');
  };
  ACT['v6-pstatus'] = el => { const x = S.parts.find(p => p.id === el.dataset.p); x.status = el.dataset.s; save(); render(); toast(`${CR[x.creatorId].name}: ${PST[x.status]} (크리에이터 화면에도 같은 상태로 보여요)`); };
  ACT['v6-gopost'] = el => { ui.tab.bc = 'post'; ui.postCamp = el.dataset.c; if (view.role === 'admin') { ui.tab.console = 'channels'; render(); } else go('b-community'); };

  /* ----- 새 캠페인 4단계 ----- */
  function draftOf(bid) {
    if (!S.drafts[bid]) {
      S.drafts[bid] = { id: '', brandId: bid, productId: (prods(bid)[0] || {}).id || '', name: '', goal: 'affiliate', countries: [], start: '', end: '', status: 'draft', cap: '',
        affiliate: { commission: '', sampleQty: '', shipping: '브랜드 부담', settle: 'TikTok Shop 주문 확정 후 플랫폼 정산' }, ugc: { fee: '', currency: 'USD', payAt: '' },
        content: { platform: 'TikTok', count: '1', length: '', must: '', banned: '', due: '', adUse: 'none', adDays: '' }, videoUrl: '' };
    }
    return S.drafts[bid];
  }
  function stepErrors(d, step) {
    const err = {}, b2 = `drafts.${d.brandId}`;
    if (step === 1) {
      if (!d.name.trim()) err[b2 + '.name'] = '캠페인 이름을 적어 주세요.';
      if (!d.countries.length) err[b2 + '.countries'] = '모집 국가를 하나 이상 골라 주세요.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.start)) err[b2 + '.start'] = '시작일을 YYYY-MM-DD로 적어 주세요.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.end)) err[b2 + '.end'] = '종료일을 YYYY-MM-DD로 적어 주세요.';
      else if (d.start && d.end < d.start) err[b2 + '.end'] = '종료일이 시작일보다 빨라요.';
      else if (d.end < TODAY) err[b2 + '.end'] = `모집 종료일(${d.end})이 이미 지났어요.`;
    }
    if (step === 2) { const p = S.products[d.productId]; if (!p) err[b2 + '.productId'] = '제품을 고르거나 새로 등록해 주세요.'; else if (missingOf(p).length) err[b2 + '.productId'] = `제품 정보가 부족해요: ${missingOf(p).join(', ')}`; else if (d.goal === 'affiliate' && (!p.shopId || !isUrl(p.link))) err[b2 + '.productId'] = '판매 연결 캠페인은 Shop 상품 ID와 판매 링크가 있는 제품을 골라 주세요.'; else { const miss = d.countries.filter(k => !p.ship.includes(k)); if (miss.length) err[b2 + '.productId'] = `제품 배송 가능 국가에 없는 모집 국가가 있어요: ${ctryText(miss)}`; } }
    if (step === 3) {
      if (d.goal === 'affiliate') { if (!(Number(d.affiliate.commission) > 0 && Number(d.affiliate.commission) <= 100)) err[b2 + '.affiliate.commission'] = '판매 커미션을 1~100 사이 숫자로 적어 주세요.'; if (!(Number(d.affiliate.sampleQty) >= 0) || d.affiliate.sampleQty === '') err[b2 + '.affiliate.sampleQty'] = '샘플 수량을 적어 주세요. 없으면 0.'; }
      if (d.goal === 'ugc') { if (!(Number(d.ugc.fee) > 0)) err[b2 + '.ugc.fee'] = '고정비 금액을 적어 주세요.'; if (!d.ugc.payAt.trim()) err[b2 + '.ugc.payAt'] = '지급 시점을 적어 주세요.'; }
      if (d.goal === 'sample' && d.affiliate.sampleQty === '') err[b2 + '.affiliate.sampleQty'] = '샘플 수량을 적어 주세요.';
      if (!(Number(d.content.count) >= 1)) err[b2 + '.content.count'] = '영상 개수를 1개 이상 적어 주세요.';
      if (!d.content.length.trim()) err[b2 + '.content.length'] = '영상 길이를 적어 주세요. 예: 30~60초';
      if (!d.content.due.trim()) err[b2 + '.content.due'] = '제출 기한을 적어 주세요.';
      if (d.content.adUse === 'ads' && !(Number(d.content.adDays) > 0)) err[b2 + '.content.adDays'] = '광고 사용 기간(일)을 적어 주세요.';
      if (!(Number(d.cap) >= 1)) err[b2 + '.cap'] = '모집 인원을 1명 이상 적어 주세요.';
      if (d.videoUrl && !isUrl(d.videoUrl)) err[b2 + '.videoUrl'] = 'https://로 시작하는 영상 링크를 적어 주세요.';
    }
    return err;
  }
  const campErrors = c => [1, 2, 3].flatMap(s => Object.values(stepErrors(Object.assign({}, c, { brandId: c.brandId }), s)));
  function compCreate(bid) {
    const d = draftOf(bid), b2 = `drafts.${bid}`, step = ui.wiz, p = S.products[d.productId];
    const steps = ['목적·이름·국가·기간', '제품', '참여 조건', '미리보기·모집 시작'];
    let body = '';
    if (step === 1) body = `<div class="v6-form">
      <fieldset class="v6-field v6-fs v6-wide"><legend>캠페인 목적<span class="req">필수</span></legend><div class="v6-radios">${Object.entries(GOAL).map(([k, l]) => `<label><input type="radio" name="goal-${bid}" data-v6b="${b2}.goal" value="${k}" ${d.goal === k ? 'checked' : ''}> ${l}${k === 'affiliate' ? ' <span class="v6-meta">기본</span>' : ''}</label>`).join('')}</div></fieldset>
      ${inp('캠페인 이름', b2 + '.name', { req: true, wide: true, ph: '예: 한방 앰플 미국 판매 영상' })}
      ${checks('모집 국가', b2 + '.countries', Object.entries(CTRY), { req: true, wide: true })}
      ${inp('시작일', b2 + '.start', { req: true, ph: '2026-11-01' })}${inp('종료일', b2 + '.end', { req: true, ph: '2026-11-30' })}</div>`;
    if (step === 2) body = `<div class="v6-form">${sel('연결할 제품', b2 + '.productId', [['', '고르세요'], ...prods(bid).map(x => [x.id, x.name + (missingOf(x).length ? ' (미완성)' : '')])], { req: true, wide: true })}</div>
      ${p ? `<div class="v6-split"><div class="v6-col">${productPreview(p)}</div><div class="v6-col">${missingOf(p).length ? `<p class="ferr">부족: ${missingOf(p).join(', ')}</p>${btn('이 제품 보완하기', 'v6-wizprod', { p: p.id })}` : chip2('캠페인에 쓸 수 있어요', 'ok')}</div></div>` : ''}
      <div class="v6-actions">${btn('새 제품 바로 등록', 'v6-wiznewprod', { b: bid })}</div>`;
    if (step === 3) body = `<div class="v6-form">
      ${d.goal === 'affiliate' ? `<p class="v6-wide v6-kicker">판매 연결 조건</p>${inp('판매 커미션 (%)', b2 + '.affiliate.commission', { req: true, type: 'number', hint: '판매 보상(판매금액의 n%) — 확인된 판매금액 기준, TikTok Shop에서 정산' })}${inp('샘플 수량', b2 + '.affiliate.sampleQty', { req: true, type: 'number' })}${sel('배송비', b2 + '.affiliate.shipping', [['브랜드 부담', '브랜드 부담'], ['크리에이터 부담', '크리에이터 부담']])}${inp('정산 기준', b2 + '.affiliate.settle', { opt: true })}<p class="v6-meta v6-wide">Shop 상품 링크는 제품 정보의 판매 링크를 써요: ${e(p ? p.link || '없음' : '제품 미선택')}</p>` : ''}
      ${d.goal === 'ugc' ? `<p class="v6-wide v6-kicker">유료 UGC 조건</p>${inp('고정비', b2 + '.ugc.fee', { req: true, type: 'number' })}${sel('통화', b2 + '.ugc.currency', [['USD', 'USD'], ['KRW', 'KRW']])}${inp('지급 시점', b2 + '.ugc.payAt', { req: true, wide: true, ph: '예: 브랜드 확인 통과 후 14일 이내' })}` : ''}
      ${d.goal === 'sample' ? `<p class="v6-wide v6-kicker">샘플 협업 조건</p>${inp('샘플 수량', b2 + '.affiliate.sampleQty', { req: true, type: 'number' })}${sel('배송비', b2 + '.affiliate.shipping', [['브랜드 부담', '브랜드 부담'], ['크리에이터 부담', '크리에이터 부담']])}` : ''}
      <p class="v6-wide v6-kicker">요청 콘텐츠</p>
      ${sel('플랫폼', b2 + '.content.platform', [['TikTok', 'TikTok'], ['Instagram', 'Instagram'], ['YouTube Shorts', 'YouTube Shorts']])}${inp('영상 개수', b2 + '.content.count', { req: true, type: 'number' })}
      ${inp('영상 길이', b2 + '.content.length', { req: true, ph: '30~60초' })}${inp('제출 기한', b2 + '.content.due', { req: true, ph: '샘플 받은 날부터 14일' })}
      ${inp('필수 내용', b2 + '.content.must', { opt: true, wide: true })}${inp('금지 표현', b2 + '.content.banned', { opt: true, wide: true })}
      ${sel('광고 사용 범위', b2 + '.content.adUse', [['none', '광고 사용 없음'], ['organic', '브랜드 계정 재게시만'], ['ads', '브랜드 광고 사용']])}${d.content.adUse === 'ads' ? inp('광고 사용 기간(일)', b2 + '.content.adDays', { req: true, type: 'number' }) : ''}
      ${inp('모집 인원', b2 + '.cap', { req: true, type: 'number' })}${inp('참고 영상 링크', b2 + '.videoUrl', { opt: true, type: 'url', hint: '직접 첨부하는 참고 링크예요. 시안에서 재생하지 않아요.' })}</div>`;
    if (step === 4) { const errs = campErrors(d); body = `${condSummary(d)}${storyboard(d, p)}${errs.length ? `<div class="alert err" id="err-publish"><b>아직 모집을 시작할 수 없어요.</b><ul>${errs.map(x => `<li>${e(x)}</li>`).join('')}</ul></div>` : '<div class="alert ok">필수 정보가 모두 채워졌어요.</div>'}`; }
    return `<div class="v6">${ctxHead(bid, '새 캠페인', '입력값은 단계를 오가도 유지되고 이 브라우저에 초안으로 저장돼요.', b('B04') + ' ' + b('X02'))}
      <ol class="v6-steps">${steps.map((l, i) => `<li><button type="button" data-act="v6-wizgo" data-s="${i + 1}" aria-current="${step === i + 1 ? 'step' : 'false'}"${step === i + 1 ? ' class="on"' : ''}>${i + 1}. ${l}</button></li>`).join('')}</ol>
      <section class="v6-sec">${body}</section>
      <div class="v6-actions v6-bar">${step > 1 ? btn('이전', 'v6-wizprev', { b: bid }) : ''}${btn('초안 저장', 'v6-wizdraft', { b: bid })}${step < 4 ? btn('다음', 'v6-wiznext', { b: bid }, 'pri') : btn('모집 시작 (시안)', 'v6-wizpublish', { b: bid }, 'pri')}</div></div>`;
  }
  ACT['v6-wizgo'] = el => { ui.wiz = Number(el.dataset.s); ui.err = {}; render(); };
  ACT['v6-wizprev'] = () => { ui.wiz = Math.max(1, ui.wiz - 1); ui.err = {}; render(); };
  ACT['v6-wiznext'] = el => { const d = draftOf(el.dataset.b); ui.err = stepErrors(d, ui.wiz); if (Object.keys(ui.err).length) { render(); focusFirstErr(); return; } ui.wiz++; save(); render(); const s = document.querySelector('.v6-steps .on'); if (s) s.focus(); };
  ACT['v6-wizprod'] = el => { ui.editProduct = el.dataset.p; ui.returnTo = 'wizard'; if (view.role === 'admin') { ui.tab.console = 'products'; render(); } else go('b-products'); };
  ACT['v6-wiznewprod'] = el => { ACT['v6-newprod'](el); ui.returnTo = 'wizard'; if (view.role !== 'admin') go('b-products'); else { ui.tab.console = 'products'; render(); } };
  function commitDraft(bid, status) {
    const d = draftOf(bid); if (!d.id) d.id = 'c' + (Object.keys(S.campaigns).length + 1) + '-' + Math.random().toString(36).slice(2, 5);
    d.status = status; S.campaigns[d.id] = JSON.parse(JSON.stringify(d)); return d.id;
  }
  ACT['v6-wizdraft'] = el => { const id = commitDraft(el.dataset.b, S.campaigns[draftOf(el.dataset.b).id] && S.campaigns[draftOf(el.dataset.b).id].status === 'recruiting' ? 'recruiting' : 'draft'); save(); render(); toast(`초안으로 저장했어요 (${id}). 캠페인 목록에서 볼 수 있어요.`); };
  ACT['v6-wizpublish'] = el => {
    const bid = el.dataset.b, d = draftOf(bid), errs = campErrors(d);
    if (errs.length) { render(); const a = document.getElementById('err-publish'); if (a) { a.setAttribute('tabindex', '-1'); a.focus(); } toast('미완성 캠페인은 모집을 시작할 수 없어요.'); return; }
    const id = commitDraft(bid, 'recruiting'); S.drafts[bid] = null; ui.campSel = id; ui.tab.camp = 'ov'; save();
    if (view.role === 'admin') { ui.tab.console = 'campaigns'; render(); } else go('b-campaigns');
    toast('모집 중으로 표시했어요 (시안 · 실제 공개·알림 없음).');
  };

  /* ----- 지원자 ----- */
  function applicantsBody(c) {
    const p = S.products[c.productId], all = partsOf(c.id), f = ui.appFilter;
    const list = all.filter(x => !f || x.status === f), selP = all.find(x => x.id === ui.appSel) || list[0];
    const counts = Object.keys(PST).map(k => [k, all.filter(x => x.status === k).length]);
    return `<div class="v6-sticky">${pimg(p, 48)}<div class="v6-grow"><b>${e(c.name)}</b><span class="v6-meta">${e(brand(c.brandId).short)} · ${e(p ? p.name : '')} · ${e(rewardText(c))} · ${e(contentText(c))}</span></div>${campStatus(c)}</div>
      <div class="v6-filters" role="group" aria-label="진행 단계 필터">${[['', `전체 ${all.length}`], ...counts.map(([k, n]) => [k, `${PST[k]} ${n}`])].map(([k, l]) => `<button type="button" class="v6-pill" aria-pressed="${f === k}" data-act="v6-appfilter" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="v6-split v6-split-list"><ul class="v6-list">${list.map(x => `<li class="v6-row${selP && selP.id === x.id ? ' on' : ''}"><div class="v6-grow"><b>${e(CR[x.creatorId].name)}</b><span class="v6-meta">${CTRY[CR[x.creatorId].country]} · ${e(CR[x.creatorId].handle)}</span></div>${chip2(PST[x.status], PST_TONE[x.status])}${btn('보기', 'v6-appsel', { p: x.id })}</li>`).join('') || '<li class="v6-empty">이 단계의 지원자가 없어요.</li>'}</ul>
      ${selP ? `<div class="v6-col v6-panel"><h3>${e(CR[selP.creatorId].name)} ${chip2(PST[selP.status], PST_TONE[selP.status])}</h3><dl class="v6-kv"><dt>국가</dt><dd>${CTRY[CR[selP.creatorId].country]}</dd><dt>신청 메시지</dt><dd>${e(selP.msg || '—')}</dd><dt>배송 주소</dt><dd>${e(selP.addr || '미입력')} <span class="v6-meta">가상·마스킹</span></dd></dl>
        <div class="v6-actions">${['applied', 'review'].includes(selP.status) ? btn('선정 (시안)', 'v6-pstatus', { p: selP.id, s: 'selected' }, 'pri') + btn('검토 중', 'v6-pstatus', { p: selP.id, s: 'review' }) + btn('거절', 'v6-pstatus', { p: selP.id, s: 'rejected' }, 'danger') : nextBrandAction(selP)}</div></div>` : ''}</div>`;
  }
  function compApplicants(bid) {
    const list = camps(bid); if (!list.length) return `<div class="v6">${ctxHead(bid, '지원자', '')}<p class="v6-empty">캠페인이 없어요.</p></div>`;
    if (!ui.appCamp || !S.campaigns[ui.appCamp] || S.campaigns[ui.appCamp].brandId !== bid) ui.appCamp = list[0].id;
    return `<div class="v6">${ctxHead(bid, '지원자', '선택한 캠페인의 지원자만 보여요. 선정하면 크리에이터 화면의 같은 참여 건 상태가 바뀌어요.', b('B08'))}
      <div class="v6-field v6-inlinefield"><label for="v6-appcamp">캠페인</label><select id="v6-appcamp" data-v6ui="appCamp">${list.map(c => `<option value="${c.id}" ${c.id === ui.appCamp ? 'selected' : ''}>${e(c.name)}</option>`).join('')}</select></div>
      ${applicantsBody(S.campaigns[ui.appCamp])}</div>`;
  }
  ACT['v6-appfilter'] = el => { ui.appFilter = el.dataset.k; ui.appSel = null; render(); };
  ACT['v6-appsel'] = el => { ui.appSel = el.dataset.p; render(); };

  /* ----- 커뮤니티·DM (목록 / 대화 / 캠페인 정보) + 채널 관리 + 캠페인 게시 ----- */
  function aiDraft(d) {
    const c = S.campaigns[d.campaignId], p = c && S.products[c.productId], q = d.msgs[d.msgs.length - 1].text;
    if (/주소/.test(q)) return `안녕하세요 ${CR[d.creatorId].name}님! ‘${c.name}’ 샘플 주소는 ‘내 캠페인 > ${c.name}’에서 입력하실 수 있어요. 입력해 주시면 ${c.content.due} 기준으로 일정이 시작돼요.`;
    if (/고정비|금액|USD/.test(q)) return `문의 주셔서 감사해요. ‘${c.name}’ 보상은 ${rewardText(c)}이며, 요청 콘텐츠는 ${contentText(c)}예요.`;
    return `안녕하세요! ‘${c ? c.name : '캠페인'}’ 관련 문의 확인했어요. ${p ? p.name + ' ' : ''}조건은 캠페인 정보 탭에서 보실 수 있어요.`;
  }
  function dmInbox(bid) {
    const list = Object.entries(S.dms).filter(([, d]) => d.brandId === bid).sort((a, c) => needsReply(c[1]) - needsReply(a[1]));
    if (!ui.dmSel || !S.dms[ui.dmSel] || S.dms[ui.dmSel].brandId !== bid) ui.dmSel = list.length ? list[0][0] : null;
    const d = ui.dmSel && S.dms[ui.dmSel], c = d && S.campaigns[d.campaignId], p = c && S.products[c.productId];
    return `<div class="v6-inbox"><ul class="v6-ilist" aria-label="대화 목록">${list.map(([id, x]) => { const cc = S.campaigns[x.campaignId]; return `<li><button type="button" class="v6-ithread${id === ui.dmSel ? ' on' : ''}" data-act="v6-opendm" data-d="${id}"><b>${e(CR[x.creatorId].name)}</b><span class="v6-meta">${e(cc ? cc.name : '')}</span><span class="v6-last">${e(x.msgs[x.msgs.length - 1].text)}</span>${needsReply(x) ? chip2(`답장 필요${x.since ? ' · ' + x.since : ''}`, 'warn') : chip2('완료', 'ok')}</button></li>`; }).join('') || '<li class="v6-empty">대화가 없어요.</li>'}</ul>
      ${d ? `<div class="v6-iconvo"><div class="v6-ihead"><b>${e(CR[d.creatorId].name)}</b><span class="v6-meta">${e(c ? c.name : '')}</span></div>
        <div class="v6-feed">${d.msgs.map(m => `<div class="v6-msg${m.from === 'brand' ? ' me' : ''}"><span class="v6-av" aria-hidden="true">${e(m.from === 'brand' ? initials(brand(bid)) : CR[d.creatorId].name.slice(0, 1))}</span><div><p class="v6-mh">${e(m.from === 'brand' ? brand(bid).short + ' 담당' : CR[d.creatorId].name)} · ${e(m.at)}${m.ai ? ' · AI 초안 검토 후 보냄' : ''}</p><p>${e(m.text)}</p></div></div>`).join('')}</div>
        <div class="v6-compose"><label for="dm-brand-${ui.dmSel}">답장 입력 <span class="v6-meta">초안은 크리에이터 쪽 입력과 따로 저장돼요</span></label><textarea id="dm-brand-${ui.dmSel}" data-v6b="dms.${ui.dmSel}.drafts.brand" placeholder="답장을 입력하세요">${e(d.drafts.brand)}</textarea>${errOf('dm-brand')}
          <div class="v6-actions">${btn('AI 초안 만들기', 'v6-dmai', { d: ui.dmSel })} ${b('B12', { noId: true })}${btn('보내기 (로컬)', 'v6-dmsend', { d: ui.dmSel, from: 'brand' }, 'pri')}${needsReply(d) ? btn('답장 완료로 표시', 'v6-dmdone', { d: ui.dmSel }) : ''}</div></div></div>
      <aside class="v6-iinfo" aria-label="캠페인 정보">${pimg(p, 56)}<dl class="v6-kv"><dt>캠페인</dt><dd>${e(c ? c.name : '—')}</dd><dt>보상</dt><dd>${e(c ? rewardText(c) : '—')}</dd><dt>제출 기한</dt><dd>${e(c ? c.content.due : '—')}</dd><dt>담당</dt><dd>${e(brand(bid).manager)}</dd><dt>상태</dt><dd>${needsReply(d) ? '답장 필요' : '완료'}</dd></dl></aside>` : ''}</div>`;
  }
  ACT['v6-opendm'] = el => { ui.dmSel = el.dataset.d; ui.tab.bc = 'dm'; if (view.role === 'brand' && view.screen.brand !== 'b-community') go('b-community'); else render(); const t = document.getElementById(`dm-brand-${ui.dmSel}`); if (t) t.focus(); };
  ACT['v6-dmai'] = el => { const d = S.dms[el.dataset.d]; d.drafts.brand = aiDraft(d); d.aiDraft = true; save(); render(); toast('AI 초안을 넣었어요. 검토하고 고친 뒤 보내 주세요.'); const t = document.getElementById(`dm-brand-${el.dataset.d}`); if (t) t.focus(); };
  ACT['v6-dmsend'] = el => {
    const d = S.dms[el.dataset.d], from = el.dataset.from, text = (d.drafts[from] || '').trim();
    if (!text) { ui.err[from === 'brand' ? 'dm-brand' : 'dm-creator'] = '보낼 내용을 입력해 주세요.'; render(); return; }
    d.msgs.push({ from, text, at: '방금', ai: from === 'brand' && !!d.aiDraft }); d.drafts[from] = ''; d.aiDraft = false;
    d.status = from === 'brand' ? 'done' : 'needs'; d.since = from === 'creator' ? '방금' : ''; ui.err = {}; save(); render();
    toast('이 브라우저에서 상대 화면에도 보여요 (시안 · 실제 전송 없음).');
  };
  ACT['v6-dmdone'] = el => { S.dms[el.dataset.d].status = 'done'; save(); render(); };
  function channelAdmin(bid) {
    const list = Object.entries(S.channels).filter(([, c]) => c.brandId === bid);
    const nb = `ui.newch`; ui.newch = ui.newch || { name: '', desc: '', vis: 'public', campaignId: '' };
    return `<p class="v6-meta">채널을 추가하면 크리에이터 사이드바에 바로 보여요. 삭제 대신 보관해요.</p>
      <ul class="v6-list">${list.map(([id, c]) => ui.chEdit === id ? `<li class="v6-row v6-editrow"><div class="v6-form">${inp('이름', `channels.${id}.name`, { req: true })}${inp('설명', `channels.${id}.desc`, { opt: true })}${sel('공개 범위', `channels.${id}.vis`, [['public', '누구나 글쓰기'], ['readonly', '읽기 전용 (브랜드만 글쓰기)']])}${sel('연결 캠페인', `channels.${id}.campaignId`, [['', '없음'], ...camps(bid).map(x => [x.id, x.name])])}</div><div class="v6-actions">${btn('완료', 'v6-chdone', { c: id }, 'pri')}</div></li>`
        : `<li class="v6-row"><div class="v6-grow"><b># ${e(c.name)}</b><span class="v6-meta">${e(c.desc || '설명 없음')} · ${c.vis === 'readonly' ? '읽기 전용' : '누구나 글쓰기'}${c.campaignId && S.campaigns[c.campaignId] ? ' · 연결: ' + e(S.campaigns[c.campaignId].name) : ''}</span></div>${c.archived ? chip2('보관됨') : chip2('사용 중', 'ok')}${btn('편집', 'v6-chedit', { c: id })}${c.base ? '' : btn(c.archived ? '다시 사용' : '보관', 'v6-charch', { c: id }, 'ghost')}</li>`).join('')}</ul>
      <section class="v6-sec"><h3>채널 추가</h3><div class="v6-form">
        <div class="v6-field"><label for="newch-name">이름<span class="req">필수</span></label><input id="newch-name" type="text" data-v6nc="name" value="${e(ui.newch.name)}" placeholder="예: 촬영 팁"${ui.err['newch'] ? ' aria-invalid="true" aria-describedby="err-newch"' : ''}>${errOf('newch')}</div>
        <div class="v6-field"><label for="newch-desc">설명<span class="opt">선택</span></label><input id="newch-desc" type="text" data-v6nc="desc" value="${e(ui.newch.desc)}"></div>
        <div class="v6-field"><label for="newch-vis">공개 범위</label><select id="newch-vis" data-v6nc="vis"><option value="public">누구나 글쓰기</option><option value="readonly" ${ui.newch.vis === 'readonly' ? 'selected' : ''}>읽기 전용</option></select></div>
        <div class="v6-field"><label for="newch-camp">연결 캠페인</label><select id="newch-camp" data-v6nc="campaignId"><option value="">없음</option>${camps(bid).map(x => `<option value="${x.id}" ${ui.newch.campaignId === x.id ? 'selected' : ''}>${e(x.name)}</option>`).join('')}</select></div>
      </div><div class="v6-actions">${btn('채널 추가', 'v6-chadd', { b: bid }, 'pri')}</div></section>`;
  }
  document.addEventListener('input', ev => { const t = ev.target; if (t.dataset && t.dataset.v6nc) ui.newch[t.dataset.v6nc] = t.value; });
  document.addEventListener('change', ev => { const t = ev.target; if (t.dataset && t.dataset.v6nc) ui.newch[t.dataset.v6nc] = t.value; });
  ACT['v6-chedit'] = el => { ui.chEdit = el.dataset.c; render(); };
  ACT['v6-chdone'] = el => { const c = S.channels[el.dataset.c]; if (!c.name.trim()) { ui.err[`channels.${el.dataset.c}.name`] = '채널 이름을 적어 주세요.'; render(); return; } ui.chEdit = null; ui.err = {}; save(); render(); };
  ACT['v6-charch'] = el => { const c = S.channels[el.dataset.c]; c.archived = !c.archived; save(); render(); toast(c.archived ? '보관했어요. 크리에이터 사이드바에서 사라져요.' : '다시 사용해요.'); };
  ACT['v6-chadd'] = el => {
    const bid = el.dataset.b, n = ui.newch.name.trim();
    if (!n) { ui.err.newch = '채널 이름을 적어 주세요.'; render(); document.getElementById('newch-name').focus(); return; }
    if (Object.values(S.channels).some(c => c.brandId === bid && !c.archived && c.name === n)) { ui.err.newch = '같은 이름의 채널이 이미 있어요.'; render(); document.getElementById('newch-name').focus(); return; }
    S.channels[uid('ch-')] = { brandId: bid, name: n, desc: ui.newch.desc, vis: ui.newch.vis, campaignId: ui.newch.campaignId, archived: false };
    ui.newch = null; ui.err = {}; save(); render(); toast(`# ${n} 채널을 만들었어요. 크리에이터 사이드바에 보여요.`);
  };
  function postCard(c) { const p = S.products[c.productId]; return `<div class="v6-postcard">${pimg(p, 56)}<div><p class="v6-mh">새 캠페인이 등록됐어요</p><b>${e(c.name)}</b><p class="v6-meta">${e(rewardText(c))} · ${e(contentText(c))} · ${ctryText(c.countries)}</p></div></div>`; }
  function campaignPost(bid) {
    const list = camps(bid).filter(c => c.status === 'recruiting');
    ui.postCamp = ui.postCamp && S.campaigns[ui.postCamp] && S.campaigns[ui.postCamp].brandId === bid ? ui.postCamp : (list[0] || {}).id;
    const chs = Object.entries(S.channels).filter(([, c]) => c.brandId === bid && !c.archived);
    ui.postCh = ui.postCh && S.channels[ui.postCh] && S.channels[ui.postCh].brandId === bid ? ui.postCh : (chFree(bid));
    const c = S.campaigns[ui.postCamp];
    return `<div class="v6-form"><div class="v6-field"><label for="post-camp">1. 캠페인</label><select id="post-camp" data-v6ui="postCamp">${list.map(x => `<option value="${x.id}" ${x.id === ui.postCamp ? 'selected' : ''}>${e(x.name)}</option>`).join('')}</select></div>
      <div class="v6-field"><label for="post-ch">2. 게시 채널</label><select id="post-ch" data-v6ui="postCh">${chs.map(([id, x]) => `<option value="${id}" ${id === ui.postCh ? 'selected' : ''}># ${e(x.name)}</option>`).join('')}</select></div></div>
      ${c ? `<p class="v6-kicker">3. 미리보기 (크리에이터 채널에 이렇게 보여요)</p>${postCard(c)}${errOf('post')}<div class="v6-actions">${btn('4. 게시 (시안)', 'v6-post', { b: bid }, 'pri')}</div>` : '<p class="v6-empty">모집 중인 캠페인이 없어요.</p>'}`;
  }
  ACT['v6-post'] = () => {
    const arr = S.chMsgs[ui.postCh] || (S.chMsgs[ui.postCh] = []);
    if (arr.some(m => m.post === ui.postCamp)) { ui.err.post = '이 채널에는 이미 같은 캠페인을 게시했어요 (중복 게시 방지).'; render(); return; }
    arr.push({ who: brand(S.campaigns[ui.postCamp].brandId).short + ' · 캠페인', post: ui.postCamp, at: '방금' }); ui.err = {}; save(); render();
    toast(`# ${S.channels[ui.postCh].name}에 게시했어요. 크리에이터 채널에 카드가 보여요 (시안).`);
  };
  function compCommunity(bid) {
    const t = tabs6('bc', [['dm', '대화'], ['ch', '채널 관리'], ['post', '캠페인 게시'], ['mem', '멤버']], 'dm');
    let body = t.cur === 'dm' ? dmInbox(bid) : t.cur === 'ch' ? channelAdmin(bid) : t.cur === 'post' ? campaignPost(bid)
      : `<ul class="v6-list">${Object.values(CR).map(x => `<li class="v6-row"><div class="v6-grow"><b>${e(x.name)}</b><span class="v6-meta">${CTRY[x.country]} · ${e(x.handle)}</span></div>${chip2(S.parts.some(p => p.creatorId === Object.keys(CR).find(k => CR[k] === x) && S.campaigns[p.campaignId].brandId === bid) ? '캠페인 참여' : '멤버')}</li>`).join('')}</ul>`;
    return `<div class="v6">${ctxHead(bid, '커뮤니티·DM', '‘답장 필요’ 대화를 먼저 보여 줘요. 채널과 캠페인 게시도 여기서 관리해요.', b('B11'))}${t.html}<div class="v6-tabbody">${body}</div></div>`;
  }

  /* ----- 메일 (브랜드 화면과 관리자 화면이 같은 흐름을 쓴다) ----- */
  const CANDS = ['Kai Lee', 'Sora Park', 'Ben Cho', 'Yuna Han', 'Leo Kim', 'Nina Choi', 'Omar Ali', 'Pim S.', 'Linh Tran', 'Aki Mori', 'Grace Oh', 'Dan Yu', 'Elle Park', 'Max Lin', 'Jin Seo', 'Rae Kim', 'Tom Ng', 'Ivy Lam', 'Zoe Ha', 'Kenji Ito', 'Mai Vu', 'Noel Kang', 'Uma Rao', 'Hana Lee']
    .map((n, i) => ({ id: 'k' + (i + 1), name: n + '(예시)', email: n.toLowerCase().replace(/[^a-z]/g, '') + '@creator.example', country: ['US', 'TH', 'VN', 'JP', 'US', 'KR'][i % 6], cat: ['스킨케어', '헤어', '생활', '스킨케어'][i % 4], campaigns: i % 5 === 0 ? ['c1'] : i % 7 === 0 ? ['c3'] : [], optout: i === 3, bounced: i === 9, recentDays: i % 8 === 2 ? 7 : null }));
  const cand = id => CANDS.find(c => c.id === id) || (S.mail.extraCands || {})[id];
  const scopeKey = () => (view.role === 'admin' ? 'admin' : S.brandId);
  const selOf = k => S.mail.sel[k] || (S.mail.sel[k] = []);
  function accountsOf(bid) { return S.mail.accounts[bid] || (S.mail.accounts[bid] = []); }
  function compMailConnect(bid) {
    const acc = accountsOf(bid);
    return `<div class="v6">${ctxHead(bid, '이메일 연결', '메일을 보내고 답장을 받으려면 먼저 보내는 계정을 연결해요.', b('B06', { noId: true }))}
      <div class="v6-provs">
        <div class="v6-prov"><b>Gmail (Google Workspace 포함)</b><span class="v6-meta">권한 안내를 확인하고 연결해요. 시안에서는 실제 Google 창을 열지 않아요.</span>${btn('Google로 Gmail 연결 (시안)', 'v6-gmail', { b: bid }, 'pri')}</div>
        <div class="v6-prov"><b>Outlook · Microsoft 365</b><span class="v6-meta">준비 중이에요.</span><button type="button" class="btn" disabled>준비 중</button></div>
        <div class="v6-prov"><b>기타 이메일 (IMAP/SMTP)</b><span class="v6-meta">준비 중이에요.</span><button type="button" class="btn" disabled>준비 중</button></div></div>
      <section class="v6-sec"><h2>연결된 계정</h2><ul class="v6-list">${acc.map((a, i) => `<li class="v6-row"><div class="v6-grow"><b class="v6-wrap">${e(a.email)}</b><span class="v6-meta">${e(a.provider)} · ${a.status === 'connected' ? `연결됨 · ${e(a.at)}` : a.status === 'reauth' ? '다시 연결 필요' : '연결 해제됨'}</span></div>${chip2(a.status === 'connected' ? '정상' : a.status === 'reauth' ? '재연결 필요' : '해제', a.status === 'connected' ? 'ok' : 'warn')}${btn('재연결 (시안)', 'v6-acc', { b: bid, i, s: 'connected' })}${a.status !== 'off' ? btn('연결 해제', 'v6-acc', { b: bid, i, s: 'off' }, 'ghost') : ''}</li>`).join('') || '<li class="v6-empty">연결된 계정이 없어요. 메일을 보내려면 먼저 연결하세요.</li>'}</ul>
      <p class="v6-meta">보내기 한도는 메일 제공자 정책과 계정 설정을 따라요. 여러 계정을 돌려 써서 한도를 피하는 방식은 쓰지 않아요.</p></section></div>`;
  }
  let gmailStep = 1, gmailBid = '';
  SHEETS['v6-gmail'] = { title: 'Google로 Gmail 연결 (시안)', html: () => gmailStep === 1
    ? `<p>연결하면 이 서비스가 다음 일을 할 수 있어요.</p><ul><li>내가 승인한 메일 보내기</li><li>받은 답장 읽기 (회신함에 표시)</li><li>보낸 메일에 라벨 붙이기</li></ul><p class="v6-meta">시안에서는 실제 Google 로그인 창을 열지 않고, 예시 계정만 연결된 것처럼 표시해요.</p><div class="v6-actions">${btn('다음', 'v6-gmailnext', {}, 'pri')}<button type="button" class="btn" data-close-sheet>취소</button></div>`
    : `<div class="v6-field"><label for="gm-email">연결할 Gmail 주소 (예시)<span class="req">필수</span></label><input id="gm-email" type="text" value="${e(ui.gmEmail || `team2@${brand(gmailBid).short.toLowerCase().replace(/[^a-z0-9]/g, '') || 'brand'}.example`)}"${ui.err.gm ? ' aria-invalid="true" aria-describedby="err-gm"' : ''}>${errOf('gm')}</div><div class="v6-actions">${btn('예시 계정 연결 (시안)', 'v6-gmailok', {}, 'pri')}<button type="button" class="btn" data-close-sheet>취소</button></div>` };
  ACT['v6-gmail'] = el => { gmailStep = 1; gmailBid = el.dataset.b; ui.err = {}; openSheet('v6-gmail'); };
  ACT['v6-gmailnext'] = () => { gmailStep = 2; openSheet('v6-gmail'); };
  ACT['v6-gmailok'] = () => {
    const v = document.getElementById('gm-email').value.trim().toLowerCase(); ui.gmEmail = v;
    if (!isEmail(v)) { ui.err.gm = '이메일 형식이 맞지 않아요.'; openSheet('v6-gmail'); return; }
    if (accountsOf(gmailBid).some(a => a.email === v)) { ui.err.gm = '이미 연결된 계정이에요.'; openSheet('v6-gmail'); return; }
    accountsOf(gmailBid).push({ id: uid('ma'), provider: 'Gmail', email: v, status: 'connected', at: '방금' }); ui.err = {}; ui.gmEmail = ''; save();
    closeDialog(document.getElementById('pd-sheet')); render(); toast('예시 계정을 연결한 것처럼 표시했어요 (실제 OAuth 없음).');
  };
  ACT['v6-acc'] = el => { accountsOf(el.dataset.b)[Number(el.dataset.i)].status = el.dataset.s; save(); render(); };

  function compRecipients(bid, scope) {
    const t = tabs6('rc-' + scope, [['db', '보유 크리에이터 DB'], ['inbox', '받은 메일'], ['csv', 'CSV 붙여넣기']], 'db');
    const s = selOf(scope); let body = '';
    if (t.cur === 'db') {
      const q = ui.poolQ.toLowerCase();
      const list = CANDS.filter(c => (!q || (c.name + c.email + c.cat + c.campaigns.join(' ')).toLowerCase().includes(q)) && (!ui.poolCtry || c.country === ui.poolCtry) && (!ui.poolCat || c.cat === ui.poolCat));
      body = `<div class="v6-filters"><div class="v6-field"><label for="pool-q">검색 (이름·이메일·분야·참여 캠페인)</label><input id="pool-q" type="text" data-v6ui="poolQ" value="${e(ui.poolQ)}"></div>
        <div class="v6-field"><label for="pool-c">국가</label><select id="pool-c" data-v6ui="poolCtry"><option value="">전체</option>${Object.entries(CTRY).map(([k, l]) => `<option value="${k}" ${ui.poolCtry === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="v6-field"><label for="pool-k">분야</label><select id="pool-k" data-v6ui="poolCat"><option value="">전체</option>${['스킨케어', '헤어', '생활'].map(k => `<option ${ui.poolCat === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
        <p class="v6-meta">결과 ${list.length}명 · 선택 ${s.length}명</p>
        <ul class="v6-list">${list.map(c => `<li class="v6-row"><label class="v6-inline v6-grow"><input type="checkbox" data-v6pick="${scope}" value="${c.id}" ${s.includes(c.id) ? 'checked' : ''}><span><b>${e(c.name)}</b> <span class="v6-meta v6-wrap">${e(c.email)} · ${CTRY[c.country]} · ${e(c.cat)}${c.campaigns.length ? ' · 참여 ' + c.campaigns.join(',') : ''}</span></span></label>${c.optout ? chip2('수신 거부', 'err') : ''}${c.bounced ? chip2('반송 이력', 'warn') : ''}${c.recentDays ? chip2(`${c.recentDays}일 전 연락`, 'warn') : ''}</li>`).join('')}</ul>`;
    }
    if (t.cur === 'inbox') body = `<p class="v6-meta">회신함에 있는 사람을 다시 고를 수 있어요.</p><ul class="v6-list">${S.mail.replies.filter(r => scope === 'admin' || r.brandId === bid).map(r => { const c = CANDS.find(x => x.email === r.email); return `<li class="v6-row"><label class="v6-inline v6-grow">${c ? `<input type="checkbox" data-v6pick="${scope}" value="${c.id}" ${s.includes(c.id) ? 'checked' : ''}>` : ''}<span><b>${e(r.name)}</b> <span class="v6-meta v6-wrap">${e(r.email)} · ${e(r.text)}</span></span></label></li>`; }).join('')}</ul>`;
    if (t.cur === 'csv') {
      const rv = ui.csvReview;
      body = `<div class="v6-field"><label for="csv-${scope}">CSV 붙여넣기 (이름,이메일,국가)</label><textarea id="csv-${scope}" data-v6b="mail.csv.${scope}" placeholder="Kai Lee(예시),kai@creator.example,US">${e(S.mail.csv[scope] || '')}</textarea><span class="hint">한 줄에 한 명. 실제 파일 업로드·발송 없음.</span></div>
        <div class="v6-actions">${btn('검수 목록 만들기 (시안)', 'v6-csvcheck', { s: scope })}</div>
        ${rv ? `<ul class="v6-list">${rv.map(r => `<li class="v6-row"><div class="v6-grow"><b>${e(r.name || '(이름 없음)')}</b><span class="v6-meta v6-wrap">${e(r.email)} · ${e(r.country)}</span></div>${chip2(r.reason || '통과', r.reason ? 'err' : 'ok')}</li>`).join('')}</ul><div class="v6-actions">${btn(`검수 통과 ${rv.filter(r => !r.reason).length}명 선택에 추가`, 'v6-csvadd', { s: scope }, 'pri')}</div>` : ''}`;
    }
    const lists = (S.mail.lists[scope] || []);
    return `${t.html}<div class="v6-tabbody">${body}</div>
      <section class="v6-sec"><h3>선택 ${s.length}명</h3><div class="v6-inlinefield"><div class="v6-field"><label for="list-name">리스트 이름</label><input id="list-name" type="text" data-v6ui="listName" value="${e(ui.listName || '')}" placeholder="예: 미국 스킨케어 1차"></div>${btn('리스트로 저장', 'v6-savelist', { s: scope })}${btn('선택 비우기', 'v6-clearsel', { s: scope }, 'ghost')}</div>${errOf('list')}
        ${lists.length ? `<ul class="v6-list">${lists.map((l, i) => `<li class="v6-row"><div class="v6-grow"><b>${e(l.name)}</b><span class="v6-meta">${l.ids.length}명</span></div>${btn('불러오기', 'v6-loadlist', { s: scope, i })}</li>`).join('')}</ul>` : ''}</section>`;
  }
  document.addEventListener('change', ev => { const t = ev.target; if (t.dataset && t.dataset.v6pick) { const s = selOf(t.dataset.v6pick), i = s.indexOf(t.value); if (t.checked && i < 0) s.push(t.value); if (!t.checked && i >= 0) s.splice(i, 1); save(); render(); } });
  ACT['v6-csvcheck'] = el => {
    const seen = new Set(), s = selOf(el.dataset.s);
    ui.csvReview = String(S.mail.csv[el.dataset.s] || '').split('\n').map(x => x.trim()).filter(Boolean).map(line => {
      const [name, rawEmail, country] = line.split(',').map(x => (x || '').trim()); const email = rawEmail.toLowerCase();
      let reason = '';
      if (!isEmail(email)) reason = '이메일 형식 오류'; else if (seen.has(email)) reason = '중복';
      else if (CANDS.some(c => c.email === email && c.optout)) reason = '수신 거부'; else if (s.some(id => (cand(id) || {}).email === email)) reason = '이미 선택됨';
      seen.add(email); return { name, email, country: country || '', reason };
    });
    if (!ui.csvReview.length) toast('붙여넣은 줄이 없어요.'); render();
  };
  ACT['v6-csvadd'] = el => {
    S.mail.extraCands = S.mail.extraCands || {};
    ui.csvReview.filter(r => !r.reason).forEach(r => { const ex = CANDS.find(c => c.email === r.email); const id = ex ? ex.id : 'x' + r.email.replace(/\W/g, ''); if (!ex) S.mail.extraCands[id] = { id, name: r.name || r.email, email: r.email, country: r.country || 'US', cat: '미분류', campaigns: [], optout: false, bounced: false, recentDays: null }; if (!selOf(el.dataset.s).includes(id)) selOf(el.dataset.s).push(id); });
    ui.csvReview = null; save(); render(); toast('검수 통과한 사람을 선택에 추가했어요.');
  };
  ACT['v6-savelist'] = el => { const n = (ui.listName || '').trim(), s = selOf(el.dataset.s); if (!n || !s.length) { ui.err.list = !n ? '리스트 이름을 적어 주세요.' : '먼저 사람을 선택해 주세요.'; render(); return; } (S.mail.lists[el.dataset.s] = S.mail.lists[el.dataset.s] || []).push({ name: n, ids: s.slice() }); ui.listName = ''; ui.err = {}; save(); render(); toast('리스트를 저장했어요 (이 브라우저).'); };
  ACT['v6-loadlist'] = el => { S.mail.sel[el.dataset.s] = S.mail.lists[el.dataset.s][Number(el.dataset.i)].ids.slice(); save(); render(); };
  ACT['v6-clearsel'] = el => { S.mail.sel[el.dataset.s] = []; save(); render(); };
  function exclusion(c, campaignId, seen) {
    if (!c) return '정보 없음'; const cc = S.campaigns[campaignId]; if (c.optout) return '수신 거부'; if (c.bounced) return '반송 이력'; if (c.recentDays != null && c.recentDays < 30) return '최근 30일 내 연락';
    if (cc && c.country && !cc.countries.includes(c.country)) return '캠페인 활동 국가 불일치'; if (seen && seen.has(c.email)) return '중복'; if (S.mail.queue.some(q => q.email === c.email && q.campaignId === campaignId)) return '이미 대기열/발송됨'; return '';
  }
  const fill = (tpl, c, camp, p) => String(tpl || '').replace(/\{\{name\}\}/g, c ? c.name : '').replace(/\{\{reason\}\}/g, c ? `${c.cat} 콘텐츠를 꾸준히 올려 주셔서` : '').replace(/\{\{brand\}\}/g, camp ? brand(camp.brandId).short : '').replace(/\{\{product\}\}/g, p ? p.name : '').replace(/\{이름\}/g, c ? c.name : '').replace(/\{제품\}/g, p ? p.name : '').replace(/\{캠페인\}/g, camp ? camp.name : '').replace(/\{제품소개링크\}/g, camp ? `https://app.example/campaign/${camp.id} (예시)` : '');
  function compCompose(bid) {
    const cp = S.mail.compose[bid] || (S.mail.compose[bid] = { campaignId: (camps(bid)[0] || {}).id || '', senderId: (accountsOf(bid).find(a => a.status === 'connected') || {}).id || '', subject: '{{brand}} {{product}} 협업 제안', body: '안녕하세요 {{name}}님, {{reason}} {{brand}}의 {{product}}를 소개해 주실 분을 찾고 있어요. 조건은 {제품소개링크}에서 확인해 주세요.', withImg: true, approver: '' });
    const camp = S.campaigns[cp.campaignId], p = camp && S.products[camp.productId], sender = accountsOf(bid).find(a => a.id === cp.senderId);
    const s = selOf(bid), seen = new Set(), rows = s.map(id => { const c = cand(id), r = exclusion(c, cp.campaignId, seen); if (c) seen.add(c.email); return { c, r }; });
    const ok = rows.filter(r => !r.r), step = ui.mailStep, base = `mail.compose.${bid}`;
    const steps = ['매칭', '내용', '수신자별 미리보기', '제외 확인', '승인·테스트'];
    let body = '';
    if (step === 1) body = `<div class="v6-form">${sel('캠페인', base + '.campaignId', [['', '고르세요'], ...camps(bid).map(c => [c.id, c.name])], { req: true })}<div class="v6-field"><span class="lab">제품</span><p>${p ? pimg(p, 32) + ' ' + e(p.name) : '캠페인을 고르면 자동으로 연결돼요'}</p></div>
      ${sel('보내는 계정', base + '.senderId', [['', '고르세요'], ...accountsOf(bid).filter(a => a.status === 'connected').map(a => [a.id, a.email])], { req: true, hint: accountsOf(bid).some(a => a.status === 'connected') ? '' : '연결된 계정이 없어요. ‘이메일 연결’ 탭에서 먼저 연결하세요.' })}
      <div class="v6-field"><span class="lab">받는 사람</span><p>${s.length}명 선택됨 ${s.length ? '' : `<button type="button" class="btn ghost" data-act="v6-gomail" data-s="b-invite">받는 사람 찾기</button>`}</p></div></div>`;
    if (step === 2) body = `<div class="v6-form">${inp('제목', base + '.subject', { req: true, wide: true })}${inp('본문', base + '.body', { req: true, area: true, wide: true, hint: '개인화: {{name}} {{reason}} {{brand}} {{product}} · 신청 링크 {제품소개링크} (이전 변수 {이름} {제품} {캠페인}도 계속 지원)' })}<div class="v6-field v6-wide"><label class="v6-inline"><input type="checkbox" data-v6chk="${base}.withImg" ${cp.withImg ? 'checked' : ''}> 제품 이미지 넣기</label></div></div>`;
    if (step === 3) { const pc = ok.find(r => r.c.id === ui.previewCand) || ok[0]; body = ok.length ? `<div class="v6-field v6-inlinefield"><label for="pv-c">받는 사람</label><select id="pv-c" data-v6ui="previewCand">${ok.map(r => `<option value="${r.c.id}" ${pc && pc.c.id === r.c.id ? 'selected' : ''}>${e(r.c.name)}</option>`).join('')}</select></div>
      <div class="v6-mail"><p class="v6-meta v6-wrap">보내는 사람: ${e(sender ? sender.email : '—')} → ${e(pc.c.email)}</p><b>${e(fill(cp.subject, pc.c, camp, p))}</b>${cp.withImg && p ? pimg(p, 80) : ''}<p>${e(fill(cp.body, pc.c, camp, p))}</p></div>` : '<p class="v6-empty">보낼 수 있는 사람이 없어요.</p>'; }
    if (step === 4) body = `<p>보낼 수 있음 <b>${ok.length}명</b> · 자동 제외 <b>${rows.length - ok.length}명</b></p><ul class="v6-list">${rows.map(r => `<li class="v6-row"><div class="v6-grow"><b>${e(r.c ? r.c.name : '?')}</b><span class="v6-meta v6-wrap">${e(r.c ? r.c.email : '')}</span></div>${chip2(r.r || '보냄 가능', r.r ? 'err' : 'ok')}</li>`).join('')}</ul>`;
    if (step === 5) body = `<div class="v6-form">${inp('승인자', base + '.approver', { req: true, ph: '예: 하린(예시)' })}</div><div class="v6-actions">${btn('나에게 테스트 발송 (시안)', 'v6-testmail', { b: bid })}${btn(`검수 목록 만들기 (시안) · ${ok.length}명`, 'v6-makequeue', { b: bid }, 'pri')}</div>${ui.testShown ? `<div class="alert info">테스트 미리보기를 만들었어요. 실제로 메일을 보내지 않았어요.</div>` : ''}<p class="v6-meta">실제 메일은 보내지 않아요. 대기열은 발송 로그에서 시뮬레이션해요.</p>`;
    return `<div class="v6">${ctxHead(bid, '메일 작성·검수', '연결 → 받는 사람 → 매칭 → 내용 → 미리보기 → 제외 → 승인 순서예요. 기존 제품별 매핑·대량 검수 기능을 단계로 정리했어요.', b('B06'))}
      <ol class="v6-steps">${steps.map((l, i) => `<li><button type="button" data-act="v6-mailgo" data-s="${i + 1}" aria-current="${step === i + 1 ? 'step' : 'false'}"${step === i + 1 ? ' class="on"' : ''}>${i + 1}. ${l}</button></li>`).join('')}</ol>
      <section class="v6-sec">${body}${errOf('mail')}</section><div class="v6-actions v6-bar">${step > 1 ? btn('이전', 'v6-mailgo', { s: step - 1 }) : ''}${step < 5 ? btn('다음', 'v6-mailnext', { b: bid }, 'pri') : ''}</div></div>`;
  }
  document.addEventListener('change', ev => { const t = ev.target; if (t.dataset && t.dataset.v6chk) { setPath(S, t.dataset.v6chk, t.checked); save(); } });
  ACT['v6-gomail'] = el => go(el.dataset.s);
  ACT['v6-mailgo'] = el => { ui.mailStep = Number(el.dataset.s); ui.err = {}; render(); };
  ACT['v6-mailnext'] = el => {
    const bid = el.dataset.b, cp = S.mail.compose[bid], base = `mail.compose.${bid}`; ui.err = {};
    if (ui.mailStep === 1) { if (!cp.campaignId) ui.err[base + '.campaignId'] = '캠페인을 골라 주세요.'; if (!cp.senderId) ui.err[base + '.senderId'] = '보내는 계정을 골라 주세요. 없으면 먼저 연결하세요.'; if (!selOf(bid).length) ui.err.mail = '받는 사람을 먼저 선택해 주세요.'; }
    if (ui.mailStep === 2) { if (!cp.subject.trim()) ui.err[base + '.subject'] = '제목을 적어 주세요.'; if (!cp.body.trim()) ui.err[base + '.body'] = '본문을 적어 주세요.'; }
    if (Object.keys(ui.err).length) { render(); focusFirstErr(); return; }
    ui.mailStep++; render();
  };
  ACT['v6-testmail'] = () => { ui.testShown = true; render(); toast('테스트 미리보기만 만들었어요 (실제 발송 없음).'); };
  ACT['v6-makequeue'] = el => {
    const bid = el.dataset.b, cp = S.mail.compose[bid];
    const activeSender = cp && accountsOf(bid).find(a => a.id === cp.senderId && a.status === 'connected');
    if (!cp || !S.campaigns[cp.campaignId] || S.campaigns[cp.campaignId].brandId !== bid || !activeSender || !selOf(bid).length || !cp.subject.trim() || !cp.body.trim()) { ui.err.mail = '캠페인·연결된 발신 계정·받는 사람·제목·본문을 확인해 주세요.'; ui.mailStep = 1; render(); return; }
    if (!selOf(bid).some(id => !exclusion(cand(id), cp.campaignId, new Set()))) { ui.err.mail = '검수를 통과한 받는 사람이 없어요. 대상과 제외 사유를 확인해 주세요.'; render(); return; }
    if (!cp.approver.trim()) { ui.err[`mail.compose.${bid}.approver`] = '승인자를 적어 주세요.'; render(); focusFirstErr(); return; }
    const seen = new Set(); let n = 0;
    selOf(bid).forEach(id => { const c = cand(id); if (!exclusion(c, cp.campaignId, seen)) { seen.add(c.email); S.mail.queue.push({ id: uid('q'), brandId: bid, campaignId: cp.campaignId, senderId: cp.senderId, name: c.name, email: c.email, status: 'queued' }); n++; } });
    S.mail.sel[bid] = []; ui.mailStep = 1; ui.testShown = false; save(); go(view.role === 'admin' ? 'a-mailbox' : 'b-sendlog'); toast(`${n}명을 검수 대기열에 넣었어요 (시안 · 실제 발송 없음).`);
  };
  function compLog(bid) {
    const all = S.mail.queue.filter(q => !bid || q.brandId === bid), f = ui.logFilter, list = all.filter(q => !f || q.status === f);
    const L = { queued: '대기', accepted: '메일 서비스 접수', bounced: '반송', unknown: '결과 모름', paused: '일시 중지' };
    return `<div class="v6-filters" role="group" aria-label="발송 상태">${[['', `전체 ${all.length}`], ...Object.entries(L).map(([k, l]) => [k, `${l} ${all.filter(q => q.status === k).length}`])].map(([k, l]) => `<button type="button" class="v6-pill" aria-pressed="${f === k}" data-act="v6-logf" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="v6-actions">${btn('대기열 진행 (시뮬레이션)', 'v6-qsim', { b: bid || '' }, 'pri')}${btn(S.mail.paused ? '재개' : '일시 중지', 'v6-qpause')}</div>
      <p class="v6-meta">‘메일 서비스 접수’는 받는 사람 수신함 도착 확인이 아니에요. ‘결과 모름’은 자동으로 다시 보내지 않고 담당자가 확인해요.</p>
      <div class="v6-table" role="table"><div class="v6-tr v6-th" role="row"><span role="columnheader">받는 사람</span><span role="columnheader">캠페인</span><span role="columnheader">보내는 계정</span><span role="columnheader">상태</span></div>
      ${list.map(q => `<div class="v6-tr" role="row"><span role="cell" class="v6-wrap"><b>${e(q.name)}</b><br><span class="v6-meta">${e(q.email)}</span></span><span role="cell">${e((S.campaigns[q.campaignId] || {}).name || q.campaignId)}</span><span role="cell" class="v6-wrap">${e(senderEmail(q.senderId, q.brandId))}</span><span role="cell">${chip2(L[q.status], { accepted: 'ok', bounced: 'err', unknown: 'warn', paused: '' }[q.status] || 'info')}${q.status === 'unknown' ? '<br><span class="v6-meta">자동 재전송 안 함 · 수동 확인</span>' : ''}</span></div>`).join('') || '<div class="v6-empty">대기열이 비어 있어요.</div>'}</div>`;
  }
  const senderEmail = (sid, bid) => { const a = (S.mail.accounts[bid] || []).find(x => x.id === sid); if (a) return a.email; const s = allSenders().find(x => x.id === sid); return s ? s.email : sid; };
  ACT['v6-logf'] = el => { ui.logFilter = el.dataset.k; render(); };
  ACT['v6-qpause'] = () => { S.mail.paused = !S.mail.paused; S.mail.queue.forEach(q => { if (S.mail.paused && q.status === 'queued') q.status = 'paused'; else if (!S.mail.paused && q.status === 'paused') q.status = 'queued'; }); save(); render(); };
  ACT['v6-qsim'] = el => {
    if (S.mail.paused) { toast('일시 중지 상태예요. 재개 후 진행하세요.'); return; }
    let i = 0; S.mail.queue.forEach(q => { if (q.status !== 'queued' || (el.dataset.b && q.brandId !== el.dataset.b)) return; i++; q.status = i % 7 === 0 ? 'bounced' : i % 9 === 0 ? 'unknown' : 'accepted'; });
    save(); render(); toast(i ? `${i}건 결과를 시뮬레이션했어요 (실제 발송 없음).` : '진행할 대기 항목이 없어요.');
  };
  function compReplies(bid) {
    const RS = { needs: '답장 필요', positive: '긍정', question: '질문', decline: '거절', optout: '수신 거부' };
    const all = S.mail.replies.filter(r => !bid || r.brandId === bid);
    const list = all.filter(r => (!ui.rfCamp || r.campaignId === ui.rfCamp) && (!ui.rfStatus || r.status === ui.rfStatus) && (!ui.rfSender || r.senderId === ui.rfSender) && (!ui.rfBrand || r.brandId === ui.rfBrand));
    const r = list.find(x => x.id === ui.replySel) || list[0], idx = r ? S.mail.replies.indexOf(r) : -1;
    const sendersIn = [...new Set(all.map(x => x.senderId))];
    return `<div class="v6-filters">${!bid ? `<div class="v6-field"><label for="rf-b">브랜드</label><select id="rf-b" data-v6ui="rfBrand"><option value="">전체</option>${Object.values(S.brands).map(x => `<option value="${x.id}" ${ui.rfBrand === x.id ? 'selected' : ''}>${e(x.short)}</option>`).join('')}</select></div>` : ''}
      <div class="v6-field"><label for="rf-c">캠페인</label><select id="rf-c" data-v6ui="rfCamp"><option value="">전체</option>${Object.values(S.campaigns).filter(c => !bid || c.brandId === bid).map(c => `<option value="${c.id}" ${ui.rfCamp === c.id ? 'selected' : ''}>${e(c.name)}</option>`).join('')}</select></div>
      <div class="v6-field"><label for="rf-s">보내는 계정</label><select id="rf-s" data-v6ui="rfSender"><option value="">전체</option>${sendersIn.map(s => `<option value="${s}" ${ui.rfSender === s ? 'selected' : ''}>${e(senderEmail(s, (all.find(x => x.senderId === s) || {}).brandId))}</option>`).join('')}</select></div>
      <div class="v6-field"><label for="rf-st">상태</label><select id="rf-st" data-v6ui="rfStatus"><option value="">전체</option>${Object.entries(RS).map(([k, l]) => `<option value="${k}" ${ui.rfStatus === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="v6-inbox v6-inbox2"><ul class="v6-ilist">${list.map(x => `<li><button type="button" class="v6-ithread${r && r.id === x.id ? ' on' : ''}" data-act="v6-replysel" data-r="${x.id}"><b>${e(x.name)}</b><span class="v6-meta">${e((S.campaigns[x.campaignId] || {}).name || '')}${!bid ? ' · ' + e(brand(x.brandId).short) : ''}</span><span class="v6-last">${e(x.text)}</span>${chip2(RS[x.status], x.status === 'positive' ? 'ok' : x.status === 'optout' || x.status === 'decline' ? 'err' : 'warn')}</button></li>`).join('') || '<li class="v6-empty">조건에 맞는 회신이 없어요.</li>'}</ul>
      ${r ? `<div class="v6-iconvo"><div class="v6-ihead"><b>${e(r.name)}</b><span class="v6-meta v6-wrap">${e(r.email)} · ${e(senderEmail(r.senderId, r.brandId))}</span></div>
        <div class="v6-feed"><div class="v6-msg"><span class="v6-av" aria-hidden="true">${e(r.name.slice(0, 1))}</span><div><p class="v6-mh">${e(r.name)} · ${e(r.at)}</p><p>${e(r.text)}</p></div></div>${r.sent.map(t => `<div class="v6-msg me"><span class="v6-av" aria-hidden="true">${e(initials(brand(r.brandId)))}</span><div><p class="v6-mh">답장 (로컬 기록 · 실제 발송 없음)</p><p>${e(t)}</p></div></div>`).join('')}</div>
        <div class="v6-form">${sel('상태', `mail.replies.${idx}.status`, Object.entries(RS))}${sel('담당자', `mail.replies.${idx}.assignee`, [['', '미배정'], ['하린(예시)', '하린(예시)'], ['지윤(예시)', '지윤(예시)'], ['수진(예시)', '수진(예시)']])}${inp('후속 할 일', `mail.replies.${idx}.todo`, { opt: true, wide: true })}</div>
        <div class="v6-compose"><label for="f-mail-replies-${idx}-draft">답장 초안</label><textarea id="f-mail-replies-${idx}-draft" data-v6b="mail.replies.${idx}.draft">${e(r.draft)}</textarea>
          <div class="v6-actions">${btn('AI 초안 만들기', 'v6-replyai', { i: idx })}${b('B12')}${btn('로컬 답장 기록', 'v6-replysend', { i: idx }, 'pri')}</div></div></div>` : ''}</div>`;
  }
  ACT['v6-replysel'] = el => { ui.replySel = el.dataset.r; render(); };
  ACT['v6-replyai'] = el => { const r = S.mail.replies[Number(el.dataset.i)], c = S.campaigns[r.campaignId]; r.draft = `안녕하세요 ${r.name}님, 답장 감사해요. ‘${c ? c.name : ''}’ 조건은 ${c ? rewardText(c) : ''}이에요. 궁금한 점(${r.text.slice(0, 20)}…)은 담당자가 확인해 다시 안내드릴게요.`; save(); render(); toast('AI 초안을 넣었어요. 검토 후 기록하세요.'); };
  ACT['v6-replysend'] = el => { const r = S.mail.replies[Number(el.dataset.i)]; if (!r.draft.trim()) { toast('답장 내용을 입력해 주세요.'); return; } r.sent.push(r.draft.trim()); r.draft = ''; save(); render(); toast('답장을 로컬 기록에 추가했어요 (실제 발송 없음).'); };

  /* ----- 팀 ----- */
  function compTeam(bid) {
    const list = S.team[bid] || (S.team[bid] = []); ui.nm = ui.nm || { name: '', loginId: '', email: '', role: 'manager', scope: [] };
    const ROLE = { owner: '소유자 · 모든 설정·청구', manager: '운영자 · 담당 캠페인 관리·메일', viewer: '조회자 · 보기만' };
    const ST = { active: ['활성', 'ok'], verify: ['이메일 확인 대기', 'warn'], invited: ['초대 대기', 'info'], suspended: ['접근 중지', 'err'] };
    return `<div class="v6">${ctxHead(bid, '팀', '비밀번호는 발급하지 않아요. 초대 링크로 본인이 직접 비밀번호를 정해요.', b('B14', view.role === 'admin' ? { noId: true } : {}))}
      <div class="v6-table" role="table"><div class="v6-tr v6-th" role="row"><span role="columnheader">이름·로그인 ID</span><span role="columnheader">이메일</span><span role="columnheader">역할·담당</span><span role="columnheader">상태</span><span role="columnheader"></span></div>
      ${list.map(m => `<div class="v6-tr" role="row"><span role="cell"><b>${e(m.name)}</b><br><span class="v6-meta">${e(m.loginId)}</span></span><span role="cell" class="v6-wrap">${e(m.email)}</span><span role="cell">${e(ROLE[m.role])}<br><span class="v6-meta">${m.scope.map(id => (S.campaigns[id] || {}).name || id).join(', ') || '담당 캠페인 없음'}</span></span><span role="cell">${chip2(ST[m.status][0], ST[m.status][1])}${m.link ? `<br><span class="v6-meta v6-wrap">${e(m.link)}</span>` : ''}</span><span role="cell" class="v6-actions">${m.status === 'verify' ? btn('이메일 확인 완료 (시안)', 'v6-tm', { b: bid, id: m.id, s: 'invited' }) : ''}${m.status === 'invited' ? btn('수락 처리 (시안)', 'v6-tm', { b: bid, id: m.id, s: 'active' }) : ''}${m.status === 'active' && m.role !== 'owner' ? btn('접근 중지', 'v6-tm', { b: bid, id: m.id, s: 'suspended' }, 'ghost') : ''}${m.status === 'suspended' ? btn('다시 허용', 'v6-tm', { b: bid, id: m.id, s: 'active' }, 'ghost') : ''}</span></div>`).join('')}</div>
      <section class="v6-sec"><h2>팀원 등록</h2><div class="v6-form">
        ${['name|이름', 'loginId|로그인 ID', 'email|이메일'].map(x => { const [k, l] = x.split('|'); return `<div class="v6-field"><label for="nm-${k}">${l}<span class="req">필수</span></label><input id="nm-${k}" type="text" data-v6nm="${k}" value="${e(ui.nm[k])}"${ui.err['nm-' + k] ? ` aria-invalid="true" aria-describedby="err-nm-${k}"` : ''}>${errOf('nm-' + k)}</div>`; }).join('')}
        <div class="v6-field"><label for="nm-role">역할</label><select id="nm-role" data-v6nm="role">${Object.entries(ROLE).filter(([k]) => k !== 'owner').map(([k, l]) => `<option value="${k}" ${ui.nm.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <fieldset class="v6-field v6-fs v6-wide"><legend>담당 캠페인</legend><div class="v6-checks">${camps(bid).map(c => `<label><input type="checkbox" data-v6nmscope value="${c.id}" ${ui.nm.scope.includes(c.id) ? 'checked' : ''}> ${e(c.name)}</label>`).join('')}</div></fieldset>
        <div class="v6-field v6-wide"><span class="lab">권한 미리보기</span><p class="v6-meta">${e(ROLE[ui.nm.role])} · ${ui.nm.role === 'manager' ? '담당 캠페인의 지원자·메일·DM만' : '모든 캠페인 읽기만'} · 청구·팀 설정 불가</p></div>
      </div><div class="v6-actions">${btn('등록하고 이메일 확인 요청 (시안)', 'v6-tmadd', { b: bid }, 'pri')}</div></section></div>`;
  }
  document.addEventListener('input', ev => { const t = ev.target; if (t.dataset && t.dataset.v6nm && ui.nm) ui.nm[t.dataset.v6nm] = t.value; });
  document.addEventListener('change', ev => { const t = ev.target; if (t.dataset && t.dataset.v6nm && ui.nm) { ui.nm[t.dataset.v6nm] = t.value; if (t.tagName === 'SELECT') render(); } if (t.dataset && 'v6nmscope' in t.dataset) { const s = ui.nm.scope, i = s.indexOf(t.value); if (t.checked && i < 0) s.push(t.value); if (!t.checked && i >= 0) s.splice(i, 1); } });
  ACT['v6-tmadd'] = el => {
    const bid = el.dataset.b, m = ui.nm; ui.err = {};
    if (!m.name.trim()) ui.err['nm-name'] = '이름을 적어 주세요.'; if (!/^[a-z0-9._-]{3,}$/.test(m.loginId)) ui.err['nm-loginId'] = '로그인 ID는 영문 소문자·숫자 3자 이상이에요.';
    if (Object.values(S.team).flat().some(x => x.loginId === m.loginId)) ui.err['nm-loginId'] = '이미 등록된 로그인 ID예요.';
    if (!isEmail(m.email)) ui.err['nm-email'] = '이메일 형식이 맞지 않아요.'; else if (Object.values(S.team).flat().some(x => x.email.toLowerCase() === m.email.trim().toLowerCase())) ui.err['nm-email'] = '이미 등록된 이메일이에요.';
    if (Object.keys(ui.err).length) { render(); focusFirstErr(); return; }
    S.team[bid].push({ id: uid('t'), name: m.name.trim(), loginId: m.loginId, email: m.email.trim(), role: m.role, scope: m.scope.slice(), status: 'verify', link: '' }); ui.nm = null; save(); render(); toast('등록했어요. 이메일 확인 후 초대 링크를 발급해요 (시안 · 실제 메일 없음).');
  };
  ACT['v6-tm'] = el => { const m = S.team[el.dataset.b].find(x => x.id === el.dataset.id); m.status = el.dataset.s; if (el.dataset.s === 'invited') m.link = `https://console.example/invite/demo-${Math.random().toString(36).slice(2, 6)} (시안 · 7일 후 만료 · 본인이 비밀번호 설정)`; if (el.dataset.s === 'active') m.link = ''; save(); render(); };

  /* ----- 청구 (현행 구현 기준과 검토 정책 분리) ----- */
  function compBilling(bid) {
    const list = S.bill[bid] || [];
    const curr = x => x.person && !x.demo, policy = x => x.addr === 'confirmed' && !x.demo;
    const ADDR = { confirmed: '주소 확인 완료', registered: '주소 등록 (확인 전)', none: '주소 없음' };
    const why = x => x.demo ? '테스트·데모 계정' : !x.person ? '사람 검증 전' : x.addr !== 'confirmed' ? '주소 확인 전 (검토 정책 기준)' : '';
    return `<div class="v6">${ctxHead(bid, '월별 청구', '실제 청구·결제는 일어나지 않아요. 금액은 계약 단가를 정한 뒤 계산해요.', b('B13', { noId: true }))}
      <div class="v6-stats">${[['전체 가입', list.length], ['사람 검증 완료', list.filter(x => x.person).length], ['주소 확인 완료', list.filter(x => x.addr === 'confirmed').length], ['과금 제외', list.filter(x => x.demo).length], ['현행 기준 대상', list.filter(curr).length], ['검토 정책 대상', list.filter(policy).length]].map(([l, n]) => `<div class="v6-stat"><span>${l}</span><b>${n}</b></div>`).join('')}</div>
      <div class="v6-note"><p><b>현행 구현</b>: 브랜드 가입(멤버십) + 관리자의 계정·사람 검증 완료 시 사용량 기록. 같은 브랜드·크리에이터는 한 번만, 데모 브랜드 제외.</p><p><b>검토 정책 (사용자 요청)</b>: ‘주소 인증 완료 등록 크리에이터 수’ 기준. 확정되지 않았어요.</p><p><b>금액</b>: 대상 수 × 계약 단가 → <b>계약 단가 설정 후 계산</b>. 월별 포함 기준·중복 크리에이터 처리·재청구는 정책 미확정이며, 현행은 같은 브랜드·크리에이터를 다시 과금하지 않아요.</p></div>
      <div class="v6-table v6-bill" role="table"><div class="v6-tr v6-th" role="row"><span role="columnheader">크리에이터</span><span role="columnheader">가입</span><span role="columnheader">계정·사람 검증</span><span role="columnheader">주소 등록·확인</span><span role="columnheader">현행 대상</span><span role="columnheader">검토 정책 대상</span><span role="columnheader">제외 사유</span></div>
      ${list.map(x => `<div class="v6-tr" role="row"><span role="cell"><b>${e(x.name)}</b><br><span class="v6-meta">${e((S.campaigns[x.campaign] || {}).name || '캠페인 없음')}</span></span><span role="cell">${e(x.joined)}</span><span role="cell">${x.person ? chip2('완료', 'ok') : chip2('대기', 'warn')}</span><span role="cell">${e(ADDR[x.addr])}</span><span role="cell">${curr(x) ? '대상' : '—'}</span><span role="cell">${policy(x) ? '대상' : '—'}</span><span role="cell">${e(why(x) || '—')}</span></div>`).join('')}</div></div>`;
  }

  /* =====================================================================
     크리에이터
     ===================================================================== */
  const myState = c => { const p = S.parts.find(x => x.campaignId === c.id && x.creatorId === 'me'); if (!p) return ['신청 전', '']; if (['applied', 'review'].includes(p.status)) return ['신청함', 'info']; if (p.status === 'selected') return ['선정됨', 'ok']; if (['sample', 'video'].includes(p.status)) return ['진행 중', 'warn']; if (p.status === 'done') return ['완료', 'ok']; return ['거절됨', 'err']; };
  const crumb = c => `${e(brand(c.brandId).short)} › ${e(c.name)}`;
  function nextAction(p) {
    const c = S.campaigns[p.campaignId];
    if (['applied', 'review'].includes(p.status)) return ['브랜드 검토를 기다리는 중', btn('신청 내용 보기', 'v6-cwork', { p: p.id })];
    if (p.status === 'selected') return p.addr ? ['샘플 발송을 기다리는 중', btn('상세 보기', 'v6-cwork', { p: p.id })] : [p.addrRequested ? '브랜드가 샘플 주소를 요청했어요' : '샘플 받을 주소를 입력해요', btn('샘플 주소 입력', 'v6-cwork', { p: p.id }, 'pri')];
    if (p.status === 'sample') return [`샘플이 오고 있어요${p.tracking ? ' · 송장 ' + e(p.tracking) : ''}`, btn('샘플 받음 확인', 'v6-cgot', { p: p.id }, 'pri')];
    if (p.status === 'video') return p.videoUrl ? ['브랜드 확인을 기다리는 중', btn('상세 보기', 'v6-cwork', { p: p.id })] : [p.revision ? `브랜드 수정 요청을 반영해 다시 제출해요` : `영상을 제출해요 · ${e(c.content.due)}`, btn(p.revision ? '수정본 제출' : '영상 제출', 'v6-cwork', { p: p.id }, 'pri')];
    if (p.status === 'done') return ['완료됐어요', goBtn('보상 보기', 'c-rewards')];
    return ['이번에는 선정되지 않았어요', goBtn('다른 캠페인 보기', 'c-campaigns')];
  }
  RENDER['c-tasks'] = () => {
    const f = ui.taskBrand || '', list = myParts().filter(p => !f || S.campaigns[p.campaignId].brandId === f);
    const ev = list.find(p => p.status === 'selected') || list[0];
    return `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>내 할 일 ${b('C06')} ${b('C04')}</h1><p class="v6-sub">캠페인마다 지금 할 일 하나만 보여 줘요. 조건 확인 ${b('C05')} · 주소 ${b('C07')} · 영상 제출 ${b('C08')}은 각 캠페인 상세에서 해요.</p></div></div>
      ${ev ? `<div class="v6-notice">${b('X03')}<span>${crumb(S.campaigns[ev.campaignId])}: ${PST[ev.status]} — 알림을 누르면 이 캠페인 상세로 바로 가요.</span>${btn('열기', 'v6-cwork', { p: ev.id })}</div>` : ''}
      <div class="v6-filters" role="group" aria-label="브랜드">${[['', '전체 브랜드'], ...S.memberships.map(id => [id, brand(id).short])].map(([k, l]) => `<button type="button" class="v6-pill" aria-pressed="${f === k}" data-act="v6-taskbrand" data-k="${k}">${e(l)}</button>`).join('')}</div>
      <ul class="v6-list">${list.map(p => { const c = S.campaigns[p.campaignId], pr = S.products[c.productId], [t, a] = nextAction(p); return `<li class="v6-row">${pimg(pr, 48)}<div class="v6-grow"><b>${crumb(c)}</b><span class="v6-meta">${t}${p.due ? ' · ' + e(p.due) : ''}</span></div>${chip2(PST[p.status], PST_TONE[p.status])}${a}</li>`; }).join('') || '<li class="v6-empty">할 일이 없어요.</li>'}</ul></div>`;
  };
  ACT['v6-taskbrand'] = el => { ui.taskBrand = el.dataset.k; render(); };
  ACT['v6-cwork'] = el => { ui.cWorkSel = el.dataset.p; go('c-work'); };
  ACT['v6-cgot'] = el => { const p = S.parts.find(x => x.id === el.dataset.p); p.status = 'video'; p.due = S.campaigns[p.campaignId].content.due; save(); render(); toast('샘플 받음으로 표시했어요. 이제 영상을 만들어요.'); };
  RENDER['c-work'] = () => {
    const list = myParts(), p = list.find(x => x.id === ui.cWorkSel) || list[0];
    const c = p && S.campaigns[p.campaignId];
    ui.addr = ui.addr || { country: 'US', line: '', city: '', zip: '' };
    let act = '';
    if (p && p.status === 'selected' && p.addr) act = `<section class="v6-sec"><h2>샘플 발송 대기</h2><p>등록한 주소: ${e(p.addr)}</p><p class="v6-meta">브랜드가 발송하면 송장과 배송 상태가 여기에 표시돼요.</p></section>`;
    if (p && p.status === 'sample') act = `<section class="v6-sec"><h2>샘플 배송</h2><p>송장: ${e(p.tracking || '브랜드 등록 대기')}</p><p class="v6-meta">실제로 샘플을 받은 뒤 확인해 주세요.</p><div class="v6-actions">${btn('샘플 받음 확인', 'v6-cgot', {p:p.id}, 'pri')}</div></section>`;
    if (p && p.status === 'selected' && !p.addr) act = `<section class="v6-sec"><h2>샘플 받을 주소 ${b('C07', { noId: true })}</h2><p class="v6-meta">${e(brand(c.brandId).short)} 배송 담당에게만 샘플 발송 목적으로 전달돼요. 시안에서는 마스킹해서 저장해요.</p><div class="v6-form">
      <div class="v6-field"><label for="ad-country">국가</label><select id="ad-country" data-v6ad="country">${c.countries.map(k => `<option value="${k}" ${ui.addr.country === k ? 'selected' : ''}>${CTRY[k]}</option>`).join('')}</select></div>
      ${[['line', '도로명 주소', '123 Main St'], ['city', ui.addr.country === 'US' ? '도시·주' : '도시·도', 'Brooklyn NY'], ['zip', ui.addr.country === 'US' ? 'ZIP 코드' : '우편번호', '11201']].map(([k, l, ph]) => `<div class="v6-field"><label for="ad-${k}">${l}<span class="req">필수</span></label><input id="ad-${k}" type="text" data-v6ad="${k}" value="${e(ui.addr[k])}" placeholder="예: ${ph}"${ui.err['ad-' + k] ? ` aria-invalid="true" aria-describedby="err-ad-${k}"` : ''}>${errOf('ad-' + k)}</div>`).join('')}
      </div><div class="v6-actions">${btn('주소 저장', 'v6-addrsave', { p: p.id }, 'pri')}</div></section>`;
    if (p && p.status === 'video') act = `<section class="v6-sec"><h2>영상 제출 ${b('C08', { noId: true })}</h2>${p.revision && !p.videoUrl ? `<div class="alert warn">브랜드 수정 요청: ${e(p.revision)}${p.videoPrev && p.videoPrev.length ? ` · 이전 제출 ${p.videoPrev.length}회` : ''}</div>` : ''}${p.videoUrl ? `<p>제출함: <span class="v6-wrap">${e(p.videoUrl)}</span> · 브랜드 확인 대기</p>` : `<div class="v6-form"><div class="v6-field v6-wide"><label for="vd-url">영상 링크<span class="req">필수</span></label><input id="vd-url" type="url" data-v6ad="video" value="${e(ui.addr.video || '')}" placeholder="https://"${ui.err.vd ? ' aria-invalid="true" aria-describedby="err-vd"' : ''}>${errOf('vd')}<span class="hint">요청: ${e(contentText(c))} · 필수 내용: ${e(c.content.must || '—')} · 금지: ${e(c.content.banned || '—')}</span></div></div><div class="v6-actions">${btn('영상 제출 (시안)', 'v6-vidsave', { p: p.id }, 'pri')}</div>`}</section>`;
    return `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>내 캠페인</h1><p class="v6-sub">신청·선정·진행·완료한 캠페인. 조건·주소·영상·보상은 각 캠페인 안에서 봐요.</p></div></div>
      <div class="v6-split v6-split-list"><ul class="v6-list">${list.map(x => { const cc = S.campaigns[x.campaignId]; return `<li class="v6-row${p && p.id === x.id ? ' on' : ''}">${pimg(S.products[cc.productId], 36)}<div class="v6-grow"><b>${crumb(cc)}</b></div>${chip2(PST[x.status], PST_TONE[x.status])}${btn('보기', 'v6-cworksel', { p: x.id })}</li>`; }).join('')}</ul>
      ${p ? `<div class="v6-col v6-panel"><h2>${crumb(c)} ${chip2(PST[p.status], PST_TONE[p.status])}</h2>${condSummary(c)} ${b('C05', { noId: true })}${act}
        <div class="v6-actions">${btn('브랜드 담당자에게 묻기', 'v6-cdm', { c: c.id })}${goBtn('보상 보기', 'c-rewards', 'ghost')}</div></div>` : '<p class="v6-empty">참여한 캠페인이 없어요.</p>'}</div></div>`;
  };
  document.addEventListener('input', ev => { const t = ev.target; if (t.dataset && t.dataset.v6ad && ui.addr) ui.addr[t.dataset.v6ad] = t.value; });
  document.addEventListener('change', ev => { const t = ev.target; if (t.dataset && t.dataset.v6ad === 'country') { ui.addr.country = t.value; render(); } });
  ACT['v6-cworksel'] = el => { ui.cWorkSel = el.dataset.p; render(); };
  ACT['v6-addrsave'] = el => {
    const a = ui.addr; ui.err = {};
    ['line', 'city', 'zip'].forEach(k => { if (!a[k].trim()) ui.err['ad-' + k] = '이 칸을 채워 주세요.'; });
    if (Object.keys(ui.err).length) { render(); focusFirstErr(); return; }
    const p = S.parts.find(x => x.id === el.dataset.p); p.addr = `${a.city.trim().slice(0, 6)} ${a.zip.trim().slice(0, 2)}*** (가상·마스킹)`; p.due = '샘플 발송 대기';
    ui.addr = null; save(); render(); toast('주소를 저장했어요. 브랜드 지원자 화면에서 ‘샘플 발송 처리’를 할 수 있어요.');
  };
  ACT['v6-vidsave'] = el => { const v = (ui.addr.video || '').trim(); if (!isUrl(v)) { ui.err.vd = 'https://로 시작하는 영상 링크를 적어 주세요.'; render(); focusFirstErr(); return; } const p = S.parts.find(x => x.id === el.dataset.p); p.videoUrl = v; p.due = p.revision ? '수정본 브랜드 확인 대기' : '브랜드 확인 대기'; ui.err = {}; ui.addr.video = ''; save(); render(); toast('영상을 제출한 것으로 표시했어요 (시안).'); };
  ACT['v6-cdm'] = el => { const c = S.campaigns[el.dataset.c]; S.creatorBrand = c.brandId; ui.cDmCamp = c.id; save(); go('c-messages'); };

  RENDER['c-campaigns'] = () => {
    const list = camps(S.creatorBrand).filter(campOpen);
    const selected = ui.cCampSel && S.campaigns[ui.cCampSel];
    const c = selected && selected.brandId === S.creatorBrand ? selected : null;
    ui.ap = ui.ap || { country: '', msg: '', agree: false };
    return `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>캠페인 둘러보기 ${b('C03')}</h1><p class="v6-sub">신청 전 / 신청함 / 선정됨 / 진행 중 / 완료 상태를 함께 보여 줘요. 참여 중인 건은 ‘내 캠페인’에서 관리해요.</p></div><a class="btn ghost" href="products.html">전체 제품 모아보기 (별도 페이지)</a></div>
      ${scopeBar('campaignScope', '캠페인')}
      <p class="v6-kicker">조건 요약 ${b('C01')}</p>
      <ul class="v6-list">${list.map(x => { const [st, tone] = myState(x); return `<li class="v6-row${c && c.id === x.id ? ' on' : ''}">${pimg(S.products[x.productId], 48)}<div class="v6-grow"><b>${crumb(x)}</b><span class="v6-meta">${e(rewardText(x))} · ${e(contentText(x))} · ${ctryText(x.countries)} · ~${e(x.end)}</span></div>${chip2(st, tone)}${btn('조건 보기', 'v6-ccamp', { c: x.id })}</li>`; }).join('') || '<li class="v6-empty">모집 중인 캠페인이 없어요 (불러오기 성공, 0건).</li>'}</ul>
      ${c ? `<section class="v6-sec v6-panel" id="v6-cdetail"><h2>${crumb(c)}</h2>${condSummary(c)}${storyboard(c, S.products[c.productId])}
        ${!campOpen(c) ? '<p class="alert warn">모집이 마감된 캠페인이에요. 신청할 수 없어요.</p>' : myState(c)[0] === '신청 전' ? `<h3>신청하기</h3><div class="v6-form"><div class="v6-field"><label for="ap-c">내 활동 국가<span class="req">필수</span></label><select id="ap-c" data-v6ap="country"><option value="">고르세요</option>${Object.entries(CTRY).map(([k, l]) => `<option value="${k}" ${ui.ap.country === k ? 'selected' : ''}>${l}</option>`).join('')}</select>${errOf('ap-c')}</div>
          <div class="v6-field"><label for="ap-m">브랜드에 남길 말<span class="opt">선택</span></label><input id="ap-m" type="text" data-v6ap="msg" value="${e(ui.ap.msg)}"></div>
          <div class="v6-field v6-wide"><label class="v6-inline"><input type="checkbox" data-v6ap="agree" ${ui.ap.agree ? 'checked' : ''}> 보상·콘텐츠·광고 사용 범위·기한을 확인했어요<span class="req">필수</span></label>${errOf('ap-a')}</div></div>
          <div class="v6-actions">${btn('신청하기 (시안)', 'v6-capply', { c: c.id }, 'pri')}</div>` : `<p>${chip2(myState(c)[0], myState(c)[1])} 이미 참여 기록이 있어요. ${btn('내 캠페인에서 보기', 'v6-cwork', { p: S.parts.find(x => x.campaignId === c.id && x.creatorId === 'me').id })}</p>`}</section>` : ''}</div>`;
  };
  document.addEventListener('input', ev => { const t = ev.target; if (t.dataset && t.dataset.v6ap && ui.ap && t.type !== 'checkbox') ui.ap[t.dataset.v6ap] = t.value; });
  document.addEventListener('change', ev => { const t = ev.target; if (t.dataset && t.dataset.v6ap && ui.ap) ui.ap[t.dataset.v6ap] = t.type === 'checkbox' ? t.checked : t.value; });
  ACT['v6-cscope'] = () => { ui.cScope = ''; render(); };
  ACT['v6-ccamp'] = el => { ui.cCampSel = el.dataset.c; ui.err = {}; render(); const d = document.getElementById('v6-cdetail'); if (d) d.scrollIntoView({ block: 'start' }); };
  ACT['v6-capply'] = el => {
    const c = S.campaigns[el.dataset.c]; ui.err = {};
    if (!c || !campOpen(c)) { ui.err['ap-c'] = '모집이 마감된 캠페인이에요.'; render(); return; }
    if (!ui.ap.country) ui.err['ap-c'] = '활동 국가를 골라 주세요.'; else if (!c.countries.includes(ui.ap.country)) ui.err['ap-c'] = `이 캠페인은 ${ctryText(c.countries)}에서 활동하는 크리에이터만 신청할 수 있어요.`;
    if (!ui.ap.agree) ui.err['ap-a'] = '조건 확인에 동의해 주세요.';
    if (Object.keys(ui.err).length) { render(); const f = document.getElementById(ui.err['ap-c'] ? 'ap-c' : 'ap-m'); if (f) f.focus(); return; }
    if (S.parts.some(x => x.campaignId === c.id && x.creatorId === 'me')) { toast('이미 신청한 캠페인이에요.'); return; }
    S.parts.push({ id: uid('pa'), campaignId: c.id, creatorId: 'me', status: 'applied', msg: ui.ap.msg, addr: '', due: '브랜드 검토 중' }); ui.ap = null; save(); render(); toast('신청함으로 표시했어요. 브랜드 지원자 목록에도 보여요 (시안 · 서버 전송 없음).');
  };
  RENDER['c-recruit'] = () => {
    const bid = S.creatorBrand, n = chNotice(bid), posts = Object.entries(S.chMsgs).filter(([id]) => S.channels[id] && S.channels[id].brandId === bid).flatMap(([id, ms]) => ms.filter(m => m.post).map(m => ({ ch: id, m })));
    return `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>캠페인 공지</h1><p class="v6-sub">${e(brand(bid).short)}가 채널에 게시한 캠페인 카드를 모아 봐요 (읽기 전용).</p></div></div>
      <ul class="v6-list">${posts.map(({ ch, m }) => { const c = S.campaigns[m.post]; return c ? `<li class="v6-row"><div class="v6-grow">${postCard(c)}<span class="v6-meta"># ${e(S.channels[ch].name)} · ${e(m.at)}</span></div>${btn('캠페인 보기', 'v6-gocamp', { c: c.id })}</li>` : ''; }).join('') || `<li class="v6-empty">아직 게시된 캠페인이 없어요.${n ? '' : ''}</li>`}</ul></div>`;
  };
  ACT['v6-gocamp'] = el => { ui.cCampSel = el.dataset.c; S.creatorBrand = S.campaigns[el.dataset.c].brandId; save(); go('c-campaigns'); };
  RENDER['c-community'] = () => {
    const bid = S.creatorBrand; let chId = ui.ch[bid] || chFree(bid); if (!S.channels[chId] || S.channels[chId].archived) chId = chFree(bid);
    const ch = S.channels[chId], msgs = S.chMsgs[chId] || [], nextCamp = camps(bid).find(c => c.status === 'recruiting');
    const feed = msgs.map(m => m.post && S.campaigns[m.post] ? `<div class="msg"><p class="small muted">${e(m.who)} · ${e(m.at)}</p>${postCard(S.campaigns[m.post])}<button type="button" class="btn" data-act="v6-gocamp" data-c="${m.post}">캠페인 보기</button></div>`
      : `<div class="msg${m.me ? ' me' : ''}"><p class="small muted">${e(m.who)} · ${e(m.at)}</p><p>${e(m.text)}</p></div>`).join('');
    return `<div class="v2-ch"><div class="v2-chhead"><h1># ${e(ch.name)} <span class="small muted">${e(brand(bid).short)}(디자인 예시)</span></h1><div class="btns" style="margin:0">${demoBtn('채널 검색', '', '채널 안 검색 (시안)')}${demoBtn('정보', '', e(ch.desc || '채널 정보'))}</div></div>
      ${tabs('ch', [['msg', '메시지'], ['camp', '캠페인 정보'], ['work', '내 협업·제출']], 'msg')}
      ${panel('ch', 'msg', 'msg', `<p class="alert info small">메시지는 내 번역 언어로 함께 보여요. ${b('C10', { noId: true })}</p>
        <div class="card primary-card v2-welcome"><h3>새로 오셨군요 ${b('C11')}</h3><ol class="small"><li>첫 행동: 자기소개 한 줄 남기기</li><li>이번 주 기회: ${nextCamp ? `${e(nextCamp.name)} <button type="button" class="btn" data-act="v6-gocamp" data-c="${nextCamp.id}">조건 보기</button>` : '없음'}</li><li>질문은 # 질문 채널에 남겨 주세요</li></ol></div>
        <div class="v2-feed">${feed || '<p class="v6-meta">아직 메시지가 없어요.</p>'}</div>
        ${ch.vis === 'readonly' ? '<p class="v6-meta v6-ro">읽기 전용 채널이에요. 브랜드만 글을 올려요.</p>' : `<div class="v2-compose"><label class="sr" for="ch-in">메시지 입력</label><textarea id="ch-in" placeholder="# ${e(ch.name)}에 메시지 입력 (시안: 전송되지 않아요)"></textarea><div class="btns" style="margin:0">${demoBtn('첨부', '', '시안: 파일을 올리지 않아요.')}<button type="button" class="btn pri" data-act="ch-send">전송</button></div></div>`}`)}
      ${panel('ch', 'camp', 'msg', `<ul class="v6-list">${camps(bid).filter(c => c.status === 'recruiting').map(c => `<li class="v6-row">${pimg(S.products[c.productId], 40)}<div class="v6-grow"><b>${e(c.name)}</b><span class="v6-meta">${e(rewardText(c))} · ${e(contentText(c))}</span></div>${btn('조건 보기', 'v6-gocamp', { c: c.id })}</li>`).join('') || '<li class="v6-empty">모집 중인 캠페인이 없어요.</li>'}</ul>`)}
      ${panel('ch', 'work', 'msg', `<ul class="v6-list">${myParts().filter(p => S.campaigns[p.campaignId].brandId === bid).map(p => { const [t, a] = nextAction(p); return `<li class="v6-row"><div class="v6-grow"><b>${crumb(S.campaigns[p.campaignId])}</b><span class="v6-meta">${t}</span></div>${a}</li>`; }).join('') || '<li class="v6-empty">이 브랜드에서 참여 중인 캠페인이 없어요.</li>'}</ul>`)}</div>`;
  };
  ACT['ch-send'] = () => {
    const i = document.getElementById('ch-in'), v = i.value.trim(), bid = S.creatorBrand, chId = ui.ch[bid] || chFree(bid);
    if (!v) { i.setAttribute('aria-invalid', 'true'); toast('메시지를 입력해 주세요.'); i.focus(); return; }
    (S.chMsgs[chId] = S.chMsgs[chId] || []).push({ who: '나 · 민지(예시)', text: v, at: '방금', me: true }); i.value = ''; save(); render(); toast('이 브라우저에만 표시했어요 (실제 전송 없음).'); const n = document.getElementById('ch-in'); if (n) n.focus();
  };
  const LV = [0, 100, 250, 500, 1000];
  const level = t => { let l = 1; LV.forEach((v, i) => { if (t >= v) l = i + 1; }); return { l, next: LV[l] != null ? LV[l] : null }; };
  const MISSIONS = [{ id: 'm-intro', t: '자기소개 남기기', pts: 10 }, { id: 'm-answer', t: '다른 멤버 질문에 답하기', pts: 10 }, { id: 'm-review', t: '제품 후기 공유', pts: 20 }, { id: 'm-video', t: '캠페인 영상 제출', pts: 30, cond: bid => myParts().some(p => S.campaigns[p.campaignId].brandId === bid && p.videoUrl), why: '선정된 캠페인에서 영상을 제출하면 할 수 있어요' }];
  function xpOf(bid) { return S.xp[bid] || (S.xp[bid] = { weekly: 0, total: 0, hist: [] }); }
  RENDER['c-ranking'] = () => {
    const bid = S.creatorBrand, x = xpOf(bid), lv = level(x.total);
    const rows = [{ n: '크리에이터 A(예시)', w: 60 }, { n: '크리에이터 B(예시)', w: 35 }, { n: '나 · 민지(예시)', w: x.weekly, me: true }, { n: '크리에이터 C(예시)', w: 15 }].sort((a, c) => c.w - a.w);
    return `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>브랜드 랭킹 ${b('C11', { noId: true })}</h1><p class="v6-sub">${e(brand(bid).short)} 기준. 주간 점수와 누적 레벨 XP는 따로 계산하고, 돈·정산과 관계없어요.</p></div></div>
      <div class="v6-stats"><div class="v6-stat"><span>이번 주 점수</span><b>${x.weekly}</b></div><div class="v6-stat"><span>내 순위 (주간)</span><b>${rows.findIndex(r => r.me) + 1}위</b></div><div class="v6-stat"><span>누적 XP · 레벨</span><b>${x.total} · Lv.${lv.l}</b></div><div class="v6-stat"><span>다음 레벨까지</span><b>${lv.next != null ? lv.next - x.total + ' XP' : '최고 레벨'}</b></div></div>
      <div class="v6-split"><section class="v6-col"><h2>이번 주 순위</h2><ol class="v6-list v6-rank">${rows.map(r => `<li class="v6-row${r.me ? ' on' : ''}"><div class="v6-grow"><b>${e(r.n)}</b></div><span>${r.w}점</span></li>`).join('')}</ol></section>
      <section class="v6-col"><h2>점수 내역</h2><ul class="v6-list">${x.hist.slice().reverse().map(h => `<li class="v6-row"><div class="v6-grow">${e(h.t)}</div><span class="v6-meta">+${h.pts} · ${e(h.at)}</span></li>`).join('') || '<li class="v6-empty">아직 점수가 없어요.</li>'}</ul>
        <p class="v6-meta">제외 기준: 같은 미션 반복, 같은 문장 반복, 자기 글에 반응하기는 점수에 넣지 않아요.</p>${goBtn('획득 가능한 미션 보기', 'c-missions')}</section></div></div>`;
  };
  RENDER['c-missions'] = () => {
    const bid = S.creatorBrand, done = S.missionsDone[bid] || (S.missionsDone[bid] = []), x = xpOf(bid);
    return `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>미션·배지 <span class="chip plum">Lv.${level(x.total).l}</span> ${b('C11', { noId: true })}</h1><p class="v6-sub">${e(brand(bid).short)} 미션. 포인트는 랭킹과 같은 기록에 쌓이고, 현금·정산이 아니에요.</p></div></div>
      <ul class="v6-list">${MISSIONS.map(m => { const d = done.includes(m.id), ok = !m.cond || m.cond(bid); return `<li class="v6-row"><div class="v6-grow"><b>${e(m.t)}</b><span class="v6-meta">+${m.pts} XP${!ok ? ' · ' + e(m.why) : ''}</span></div>${d ? chip2('완료', 'ok') : ok ? btn('수행 (시안)', 'v6-mission', { m: m.id }, 'pri') : chip2('조건 대기', 'warn')}</li>`; }).join('')}</ul>
      <p class="v6-meta">배지: ${done.length >= 1 ? '첫 걸음' : '—'}${done.length >= 3 ? ' · 열심 멤버' : ''}</p></div>`;
  };
  ACT['v6-mission'] = el => {
    const bid = S.creatorBrand, done = S.missionsDone[bid], m = MISSIONS.find(x => x.id === el.dataset.m);
    if (done.includes(m.id)) { toast('이미 완료한 미션이에요 (반복 제외).'); return; }
    done.push(m.id); const x = xpOf(bid); x.weekly += m.pts; x.total += m.pts; x.hist.push({ t: m.t, pts: m.pts, at: '방금' }); save(); render(); toast(`+${m.pts} XP · 랭킹에도 반영돼요 (시안).`);
  };
  RENDER['c-messages'] = () => {
    const bid = S.creatorBrand, mine = myParts().filter(p => S.campaigns[p.campaignId].brandId === bid);
    if (!ui.cDmCamp || !S.campaigns[ui.cDmCamp] || S.campaigns[ui.cDmCamp].brandId !== bid) ui.cDmCamp = (mine[0] || {}).campaignId || (camps(bid)[0] || {}).id;
    let id = Object.keys(S.dms).find(k => S.dms[k].brandId === bid && S.dms[k].campaignId === ui.cDmCamp && S.dms[k].creatorId === 'me');
    const d = id && S.dms[id];
    return `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>브랜드 담당자 ${b('C12')}</h1><p class="v6-sub">브랜드와 캠페인을 고르면 그 대화가 열려요. 브랜드 회신함과 같은 메시지예요.</p></div>${sheetBtn('도움 요청·신고', 'c-help')}</div>
      <div class="v6-filters"><div class="v6-field"><label for="cdm-b">브랜드</label><select id="cdm-b" data-v6b="creatorBrand">${S.memberships.map(k => `<option value="${k}" ${k === bid ? 'selected' : ''}>${e(brand(k).short)}</option>`).join('')}</select></div>
        <div class="v6-field"><label for="cdm-c">캠페인</label><select id="cdm-c" data-v6ui="cDmCamp">${camps(bid).map(c => `<option value="${c.id}" ${c.id === ui.cDmCamp ? 'selected' : ''}>${e(c.name)}</option>`).join('')}</select></div></div>
      <div class="v6-iconvo v6-solo"><div class="v6-ihead"><b>${e(brand(bid).short)} 담당</b><span class="v6-meta">${e((S.campaigns[ui.cDmCamp] || {}).name || '')}</span></div>
        <div class="v6-feed">${d ? d.msgs.map(m => `<div class="v6-msg${m.from === 'creator' ? ' me' : ''}"><span class="v6-av" aria-hidden="true">${e(m.from === 'creator' ? '나' : initials(brand(bid)))}</span><div><p class="v6-mh">${m.from === 'creator' ? '나' : e(brand(bid).short) + ' 담당'} · ${e(m.at)}</p><p>${e(m.text)}</p></div></div>`).join('') : '<p class="v6-meta">아직 대화가 없어요. 첫 메시지를 보내 보세요.</p>'}</div>
        <div class="v6-compose"><label for="dm-cr">메시지</label>${d ? `<textarea id="dm-cr" data-v6b="dms.${id}.drafts.creator">${e(d.drafts.creator)}</textarea>` : `<textarea id="dm-cr" data-v6new="1"></textarea>`}${errOf('dm-creator')}<div class="v6-actions">${btn('보내기 (로컬)', d ? 'v6-dmsend' : 'v6-dmnew', d ? { d: id, from: 'creator' } : {}, 'pri')}</div></div></div></div>`;
  };
  ACT['v6-dmnew'] = () => { const v = document.getElementById('dm-cr').value.trim(); if (!v) { ui.err['dm-creator'] = '보낼 내용을 입력해 주세요.'; render(); return; } const id = uid('dm'); S.dms[id] = { brandId: S.creatorBrand, campaignId: ui.cDmCamp, creatorId: 'me', status: 'needs', since: '방금', msgs: [{ from: 'creator', text: v, at: '방금' }], drafts: { brand: '', creator: '' } }; ui.err = {}; save(); render(); toast('브랜드 회신함에도 보여요 (시안).'); };

  /* =====================================================================
     관리자
     ===================================================================== */
  RENDER['a-onboard'] = () => {
    ui.nb = ui.nb || { name: '', ownerEmail: '', country: 'KR', manager: '', mode: '자체 운영', status: '운영 중' };
    return `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>브랜드 신청·등록 ${b('A02')}</h1><p class="v6-sub">가입 신청 승인과 관리 브랜드 직접 등록 모두 여기서 해요. 실제 계정·초대 메일은 만들지 않아요.</p></div></div>
      <section class="v6-sec"><h2>가입 신청</h2><ul class="v6-list">${S.apps.map(a => `<li class="v6-row"><div class="v6-grow"><b>${e(a.name)}</b><span class="v6-meta v6-wrap">${e(a.ownerEmail)} · ${CTRY[a.country]}</span></div>${a.status === 'pending' ? btn('승인 (시안)', 'v6-appok', { a: a.id }, 'pri') + btn('반려', 'v6-appno', { a: a.id }, 'ghost') : chip2(a.status === 'approved' ? '승인됨' : '반려됨', a.status === 'approved' ? 'ok' : 'err')}</li>`).join('')}</ul></section>
      <section class="v6-sec"><h2>관리 브랜드 직접 등록</h2><div class="v6-form">
        ${[['name', '브랜드 이름', '예: 하루담(디자인 예시)'], ['ownerEmail', '소유자 이메일', 'owner@brand.example'], ['manager', '운영 담당', '하린(예시)']].map(([k, l, ph]) => `<div class="v6-field"><label for="nb-${k}">${l}<span class="req">필수</span></label><input id="nb-${k}" type="text" data-v6nb="${k}" value="${e(ui.nb[k])}" placeholder="${ph}"${ui.err['nb-' + k] ? ` aria-invalid="true" aria-describedby="err-nb-${k}"` : ''}>${errOf('nb-' + k)}</div>`).join('')}
        <div class="v6-field"><label for="nb-country">국가</label><select id="nb-country" data-v6nb="country">${Object.entries(CTRY).map(([k, l]) => `<option value="${k}" ${ui.nb.country === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="v6-field"><label for="nb-mode">운영 방식</label><select id="nb-mode" data-v6nb="mode">${['자체 운영', '운영 대행'].map(k => `<option ${ui.nb.mode === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div class="v6-field"><label for="nb-status">상태</label><select id="nb-status" data-v6nb="status">${['준비 중', '운영 중'].map(k => `<option ${ui.nb.status === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
        <div class="v6-actions">${btn('브랜드 등록 (시안)', 'v6-nbadd', {}, 'pri')}</div></section>
      <section class="v6-sec"><h2>등록된 브랜드</h2><ul class="v6-list">${Object.values(S.brands).map(x => `<li class="v6-row"><div class="v6-grow"><b>${e(x.name)}</b><span class="v6-meta">${e(x.mode)} · ${e(x.status)} · 담당 ${e(x.manager)} · 캠페인 ${camps(x.id).length}개</span></div>${btn('브랜드 콘솔 열기', 'v6-console', { b: x.id }, 'pri')}</li>`).join('')}</ul></section></div>`;
  };
  document.addEventListener('input', ev => { const t = ev.target; if (t.dataset && t.dataset.v6nb && ui.nb) ui.nb[t.dataset.v6nb] = t.value; });
  document.addEventListener('change', ev => { const t = ev.target; if (t.dataset && t.dataset.v6nb && ui.nb) ui.nb[t.dataset.v6nb] = t.value; });
  function addBrand(o) { const id = 'b' + Math.random().toString(36).slice(2, 7); S.brands[id] = Object.assign({ id, short: o.name.replace(/\(.*\)/, '').trim() || o.name }, o); S.learning[id] = { intro: '', homepage: '', countries: [o.country], usp: '', banned: '', faq: [], savedAt: '' }; S.team[id] = []; S.bill[id] = []; S.mail.accounts[id] = []; S.channels[uid('ch-')] = { brandId: id, name: '자유대화', desc: '', vis: 'public', campaignId: '', archived: false, base: 'free' }; S.channels[uid('ch-')] = { brandId: id, name: '캠페인 공지', desc: '', vis: 'readonly', campaignId: '', archived: false, base: 'notice' }; return id; }
  ACT['v6-appok'] = el => { const a = S.apps.find(x => x.id === el.dataset.a); a.status = 'approved'; const id = addBrand({ name: a.name, ownerEmail: a.ownerEmail, country: a.country, manager: '미배정', mode: '자체 운영', status: '준비 중' }); save(); render(); toast(`승인했어요. ${brand(id).short} 브랜드가 생겼어요 (시안).`); };
  ACT['v6-appno'] = el => { S.apps.find(x => x.id === el.dataset.a).status = 'rejected'; save(); render(); };
  ACT['v6-nbadd'] = () => {
    const n = ui.nb; ui.err = {};
    if (!n.name.trim()) ui.err['nb-name'] = '브랜드 이름을 적어 주세요.'; else if (Object.values(S.brands).some(x => x.name === n.name.trim())) ui.err['nb-name'] = '같은 이름의 브랜드가 있어요.';
    if (!isEmail(n.ownerEmail)) ui.err['nb-ownerEmail'] = '소유자 이메일 형식이 맞지 않아요.'; if (!n.manager.trim()) ui.err['nb-manager'] = '운영 담당을 적어 주세요.';
    if (Object.keys(ui.err).length) { render(); focusFirstErr(); return; }
    const id = addBrand({ name: n.name.trim(), ownerEmail: n.ownerEmail.trim(), country: n.country, manager: n.manager.trim(), mode: n.mode, status: n.status }); ui.nb = null; save();
    ui.adminBrand = id; ui.tab.console = 'products'; go('a-brands'); toast('브랜드를 등록했어요. 이 브랜드의 콘솔이 열렸어요 (시안).');
  };
  ACT['v6-console'] = el => { ui.adminBrand = el.dataset.b; ui.tab.console = 'products'; ui.campSel = null; ui.editProduct = null; go('a-brands'); };
  RENDER['a-brands'] = () => {
    const bid = ui.adminBrand && S.brands[ui.adminBrand] ? ui.adminBrand : null;
    if (!bid) return `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>브랜드 목록·콘솔 ${b('A07', { noId: true })}</h1><p class="v6-sub">브랜드를 고르면 그 브랜드 데이터만 관리하는 콘솔이 열려요.</p></div></div><ul class="v6-list">${Object.values(S.brands).map(x => `<li class="v6-row"><div class="v6-grow"><b>${e(x.name)}</b><span class="v6-meta">${e(x.mode)} · ${e(x.status)} · 캠페인 ${camps(x.id).length} · 제품 ${prods(x.id).length}</span></div>${btn('콘솔 열기', 'v6-console', { b: x.id }, 'pri')}</li>`).join('')}</ul></div>`;
    const t = tabs6('console', [['products', '제품'], ['campaigns', '캠페인'], ['create', '새 캠페인'], ['apps', '지원자'], ['channels', '커뮤니티 채널'], ['mail', '메일'], ['samples', '샘플·영상'], ['results', '결과·보상'], ['team', '팀'], ['bill', '청구'], ['learn', '브랜드 학습']], 'products');
    const body = { products: () => compProducts(bid), campaigns: () => compCampaigns(bid), create: () => compCreate(bid), apps: () => compApplicants(bid), channels: () => `<div class="v6">${channelAdmin(bid)}<section class="v6-sec"><h2>캠페인 게시</h2>${campaignPost(bid)}</section></div>`, mail: () => compMailConnect(bid) + `<section class="v6-sec"><h2>이 브랜드 회신</h2>${compReplies(bid)}</section>`, samples: () => compSamples(bid), results: () => compResults(bid), team: () => compTeam(bid), bill: () => compBilling(bid), learn: () => compLearning(bid) }[t.cur]();
    return `<div class="v6"><div class="v6-ctxbar"><span>관리 중인 브랜드 <b>${e(brand(bid).name)}</b> · 다른 브랜드 데이터는 보이지 않아요</span>${btn('브랜드 화면으로 열기', 'v6-asbrand', { b: bid })}${btn('← 브랜드 목록', 'v6-console', { b: '' }, 'ghost')}</div>${t.html}<div class="v6-tabbody">${body}</div></div>`;
  };
  ACT['v6-asbrand'] = el => { S.brandId = el.dataset.b; save(); go('b-campaigns', 'brand'); };
  function allSenders() {
    const out = [];
    for (let i = 1; i <= 200; i++) {
      const n = String(i).padStart(3, '0'), bid = i % 3 === 0 ? '' : i % 3 === 1 ? 'goryeo' : 'fau', st = i % 17 === 0 ? 'reauth' : i % 11 === 0 ? 'off' : 'connected';
      out.push({ id: 's' + n, email: `sender-${n}@dino-mail.example`, brandId: bid, allowed: bid === 'goryeo' ? ['c1', 'c2'] : bid === 'fau' ? ['c3'] : [], today: st === 'connected' ? (i * 7) % 23 : 0, cap: 200, consent: st === 'reauth' ? '재동의 필요' : st === 'off' ? '—' : '동의', syncErr: st === 'reauth' ? '토큰 갱신 오류' : '', stopReason: st === 'off' ? '운영자 중지(예시)' : '', recv: st === 'connected' ? '정상' : '중지', sync: st === 'connected' ? `${(i % 50) + 1}분 전` : '—', owner: ['하린', '지윤', '수진'][i % 3] + '(예시)', status: st });
    }
    return out.concat(S.mail.extraSenders || []).map(s => Object.assign({}, s, S.mail.senderOv[s.id] || {}));
  }
  RENDER['a-connections'] = () => {
    const all = allSenders(), q = ui.senderQ.toLowerCase();
    const list = all.filter(s => (!q || s.email.includes(q) || (s.owner || '').toLowerCase().includes(q)) && (!ui.senderSt || s.status === ui.senderSt) && (!ui.senderBrand || (ui.senderBrand === '-' ? !s.brandId : s.brandId === ui.senderBrand)));
    const pages = Math.max(1, Math.ceil(list.length / 20)); ui.senderPage = Math.min(ui.senderPage, pages); const page = list.slice((ui.senderPage - 1) * 20, ui.senderPage * 20);
    const ST = { connected: ['연결됨', 'ok'], reauth: ['재연결 필요', 'warn'], off: ['연결 전', ''] };
    const rv = ui.senderCsvReview;
    return `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>Gmail 운영 · 발신 계정 ${b('A06')}</h1><p class="v6-sub">.example 가상 계정 ${all.length}개로 보여 주는 시안이에요. 실제 계정이 아니고, 대량 발송 실적도 없어요. 각 계정은 소유자가 Google에서 직접 승인해야 연결돼요.</p></div></div>
      <div class="v6-stats">${[['전체', all.length], ['연결됨', all.filter(s => s.status === 'connected').length], ['재연결 필요', all.filter(s => s.status === 'reauth').length], ['연결 전', all.filter(s => s.status === 'off').length]].map(([l, n]) => `<div class="v6-stat"><span>${l}</span><b>${n}</b></div>`).join('')}</div>
      <div class="v6-filters"><div class="v6-field"><label for="sd-q">계정·담당자 검색</label><input id="sd-q" type="text" data-v6ui="senderQ" value="${e(ui.senderQ)}" placeholder="sender-012"></div>
        <div class="v6-field"><label for="sd-s">상태</label><select id="sd-s" data-v6ui="senderSt"><option value="">전체</option>${Object.entries(ST).map(([k, [l]]) => `<option value="${k}" ${ui.senderSt === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="v6-field"><label for="sd-b">소속 브랜드</label><select id="sd-b" data-v6ui="senderBrand"><option value="">전체</option>${Object.values(S.brands).map(x => `<option value="${x.id}" ${ui.senderBrand === x.id ? 'selected' : ''}>${e(x.short)}</option>`).join('')}<option value="-" ${ui.senderBrand === '-' ? 'selected' : ''}>미배정</option></select></div></div>
      <p class="v6-meta" aria-live="polite">${list.length}개 중 ${list.length ? (ui.senderPage - 1) * 20 + 1 : 0}–${Math.min(ui.senderPage * 20, list.length)} · ${ui.senderPage}/${pages}쪽 · ‘잔여 설정량’은 운영 설정값 기준이며 제공자 한도가 아니에요.</p>
      <div class="v6-table v6-senders" role="table"><div class="v6-tr v6-th" role="row"><span role="columnheader">계정</span><span role="columnheader">브랜드·허용 캠페인</span><span role="columnheader">오늘 접수 / 잔여 설정량</span><span role="columnheader">받기 · 최근 동기화</span><span role="columnheader">담당</span><span role="columnheader">상태</span></div>
      ${page.map(s => `<div class="v6-tr" role="row"><span role="cell" class="v6-wrap"><b>${e(s.email)}</b></span><span role="cell">${e(s.brandId ? brand(s.brandId).short : '미배정')}<br><span class="v6-meta">${s.allowed.join(', ') || '—'}</span></span><span role="cell">${s.today} / ${Math.max(0, s.cap - s.today)}</span><span role="cell">${e(s.recv)} · ${e(s.sync)}<br><span class="v6-meta">읽기 동의 ${e(s.consent || '—')}${s.syncErr ? ' · ' + e(s.syncErr) : ''}${s.stopReason ? ' · ' + e(s.stopReason) : ''}</span></span><span role="cell">${e(s.owner)}</span><span role="cell">${chip2(ST[s.status][0], ST[s.status][1])}${s.status !== 'connected' ? btn('연결 (시안)', 'v6-sconn', { s: s.id }) : ''}</span></div>`).join('') || '<div class="v6-empty">조건에 맞는 계정이 없어요.</div>'}</div>
      <nav class="v6-pager" aria-label="페이지">${btn('이전', 'v6-spage', { p: ui.senderPage - 1 })}${Array.from({ length: pages }, (_, i) => i + 1).filter(n => Math.abs(n - ui.senderPage) <= 2 || n === 1 || n === pages).map(n => `<button type="button" class="v6-pill" aria-current="${n === ui.senderPage ? 'page' : 'false'}" data-act="v6-spage" data-p="${n}">${n}</button>`).join('')}${btn('다음', 'v6-spage', { p: ui.senderPage + 1 })}</nav>
      <section class="v6-sec"><h2>계정 메타데이터 일괄 등록</h2><div class="v6-field"><label for="sd-csv">CSV 붙여넣기 (이메일,브랜드ID,담당자)</label><textarea id="sd-csv" data-v6ui2="senderCsv" placeholder="sender-201@dino-mail.example,goryeo,하린(예시)">${e(ui.senderCsv)}</textarea><span class="hint">메타데이터만 등록돼요. 연결은 계정마다 소유자 승인이 필요해요.</span></div>
        <div class="v6-actions">${btn('검수', 'v6-scsv')}</div>
        ${rv ? `<ul class="v6-list">${rv.map(r => `<li class="v6-row"><div class="v6-grow v6-wrap"><b>${e(r.email)}</b><span class="v6-meta">${e(r.brandId || '미배정')} · ${e(r.owner)}</span></div>${chip2(r.reason || '통과', r.reason ? 'err' : 'ok')}</li>`).join('')}</ul><div class="v6-actions">${btn(`검수 통과 ${rv.filter(r => !r.reason).length}개 등록`, 'v6-sadd', {}, 'pri')}</div>` : ''}</section></div>`;
  };
  document.addEventListener('input', ev => { const t = ev.target; if (t.dataset && t.dataset.v6ui2) ui[t.dataset.v6ui2] = t.value; });
  ACT['v6-spage'] = el => { const n = Number(el.dataset.p); if (n < 1) return; ui.senderPage = n; render(); };
  ACT['v6-sconn'] = el => { S.mail.senderOv[el.dataset.s] = { status: 'connected', recv: '정상', sync: '방금' }; save(); render(); toast('연결된 것처럼 표시했어요 (실제 OAuth 없음).'); };
  ACT['v6-scsv'] = () => {
    const ex = new Set(allSenders().map(s => s.email)), seen = new Set();
    ui.senderCsvReview = ui.senderCsv.split('\n').map(x => x.trim()).filter(Boolean).map(line => { const [rawEmail, brandId, owner] = line.split(',').map(x => (x || '').trim()); const email = rawEmail.toLowerCase(); let reason = ''; if (!isEmail(email)) reason = '이메일 형식 오류'; else if (ex.has(email) || seen.has(email)) reason = '이미 등록됨'; else if (brandId && !S.brands[brandId]) reason = '없는 브랜드 ID'; seen.add(email); return { email, brandId, owner: owner || '미배정', reason }; });
    render();
  };
  ACT['v6-sadd'] = () => { ui.senderCsvReview.filter(r => !r.reason).forEach(r => S.mail.extraSenders.push({ id: uid('sx'), email: r.email, brandId: r.brandId || '', allowed: [], today: 0, cap: 50, recv: '중지', sync: '—', owner: r.owner, status: 'off' })); ui.senderCsvReview = null; ui.senderCsv = ''; save(); render(); toast('메타데이터를 등록했어요. 연결은 계정마다 따로 해요.'); };
  RENDER['a-pool'] = () => `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>후보 풀</h1><p class="v6-sub">보유 크리에이터 DB에서 찾고 고른 뒤, 디노 공용 모집에서 브랜드·캠페인·제품·발신 계정에 매핑해요.</p></div></div>${compRecipients('', 'admin')}<div class="v6-actions v6-bar">${btn(`선택 ${selOf('admin').length}명으로 매핑 행 만들기`, 'v6-mkrows', {}, 'pri')}</div></div>`;
  ACT['v6-mkrows'] = () => {
    const ids = selOf('admin'); if (!ids.length) { toast('먼저 사람을 선택해 주세요.'); return; }
    const conn = allSenders().filter(s => s.status === 'connected');
    S.mail.adminRows = ids.map(id => { const c = Object.values(S.campaigns).find(x => x.status === 'recruiting') || {}; const s = conn.find(x => x.brandId === c.brandId) || conn[0]; return { candId: id, brandId: c.brandId, campaignId: c.id, senderId: s ? s.id : '' }; });
    save(); go('a-recruit');
  };
  function rowIssue(r, i, rows) {
    const c = cand(r.candId), camp = S.campaigns[r.campaignId], s = allSenders().find(x => x.id === r.senderId);
    if (!c) return '후보 정보 없음'; if (c.optout) return '수신 거부'; if (c.bounced) return '반송 이력'; if (c.recentDays != null && c.recentDays < 30) return '최근 30일 내 연락';
    if (!camp || camp.brandId !== r.brandId) return '브랜드·캠페인 불일치'; if (c.country && !camp.countries.includes(c.country)) return '캠페인 활동 국가 불일치'; if (camp.status !== 'recruiting') return '모집 중 아님';
    if (!s || s.status !== 'connected') return '발신 계정 미연결'; if (s.brandId && s.brandId !== r.brandId) return '다른 브랜드 소속 발신 계정';
    if (rows.findIndex(x => x.candId === r.candId && x.campaignId === r.campaignId) !== i) return '중복';
    if (S.mail.queue.some(q => q.email === c.email && q.campaignId === r.campaignId)) return '이미 대기열'; return '';
  }
  RENDER['a-recruit'] = () => {
    const rows = S.mail.adminRows || [], issues = rows.map((r, i) => rowIssue(r, i, rows)), okN = issues.filter(x => !x).length;
    const conn = allSenders().filter(s => s.status === 'connected');
    const pv = ui.previewRow != null && rows[ui.previewRow] ? rows[ui.previewRow] : null;
    return `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>디노 공용 모집 · 매핑</h1><p class="v6-sub">후보 → 브랜드·캠페인·제품·발신 계정 매핑 → 충돌·중복 제외 → 수신자별 미리보기 → 로컬 검수 배치. 실제 발송은 없어요.</p></div>${goBtn('후보 풀에서 고르기', 'a-pool')}</div>
      <p>보낼 수 있음 <b>${okN}</b> · 제외 <b>${rows.length - okN}</b> · 총 대기열 예정 ${okN}건</p>
      <div class="v6-table v6-map" role="table"><div class="v6-tr v6-th" role="row"><span role="columnheader">후보</span><span role="columnheader">브랜드</span><span role="columnheader">캠페인 (제품)</span><span role="columnheader">발신 계정</span><span role="columnheader">검수</span></div>
      ${rows.map((r, i) => { const c = cand(r.candId) || {}; return `<div class="v6-tr" role="row"><span role="cell" class="v6-wrap"><b>${e(c.name)}</b><br><span class="v6-meta">${e(c.email)}</span></span>
        <span role="cell"><label class="sr" for="mr-b-${i}">브랜드</label><select id="mr-b-${i}" data-v6b="mail.adminRows.${i}.brandId">${Object.values(S.brands).map(x => `<option value="${x.id}" ${r.brandId === x.id ? 'selected' : ''}>${e(x.short)}</option>`).join('')}</select></span>
        <span role="cell"><label class="sr" for="mr-c-${i}">캠페인</label><select id="mr-c-${i}" data-v6b="mail.adminRows.${i}.campaignId"><option value="">고르세요</option>${camps(r.brandId).map(x => `<option value="${x.id}" ${r.campaignId === x.id ? 'selected' : ''}>${e(x.name)} (${e((S.products[x.productId] || {}).name || '')})</option>`).join('')}</select></span>
        <span role="cell"><label class="sr" for="mr-s-${i}">발신 계정</label><select id="mr-s-${i}" data-v6b="mail.adminRows.${i}.senderId"><option value="">고르세요</option>${conn.filter(s => !s.brandId || s.brandId === r.brandId).map(s => `<option value="${s.id}" ${r.senderId === s.id ? 'selected' : ''}>${e(s.email)}</option>`).join('')}</select></span>
        <span role="cell">${chip2(issues[i] || '통과', issues[i] ? 'err' : 'ok')}${!issues[i] ? btn('미리보기', 'v6-rowpv', { i }, 'ghost') : ''}</span></div>`; }).join('') || '<div class="v6-empty">매핑 행이 없어요. 후보 풀에서 사람을 골라 주세요.</div>'}</div>
      ${pv ? (() => { const c = cand(pv.candId), camp = S.campaigns[pv.campaignId], p = camp && S.products[camp.productId]; return `<div class="v6-mail"><p class="v6-meta v6-wrap">${e(senderEmail(pv.senderId))} → ${e(c.email)}</p><b>${e(camp.name)} 협업 제안</b>${pimg(p, 72)}<p>안녕하세요 ${e(c.name)}님, ${e(brand(camp.brandId).short)}의 ${e(p ? p.name : '')} 캠페인(${e(rewardText(camp))})에 초대하고 싶어요.</p></div>`; })() : ''}
      <div class="v6-actions v6-bar">${btn(`로컬 검수 배치 만들기 · ${okN}건`, 'v6-mkbatch', {}, 'pri')}</div></div>`;
  };
  ACT['v6-rowpv'] = el => { ui.previewRow = Number(el.dataset.i); render(); };
  ACT['v6-mkbatch'] = () => {
    const rows = S.mail.adminRows || []; let n = 0;
    rows.forEach((r, i) => { if (!rowIssue(r, i, rows)) { const c = cand(r.candId); S.mail.queue.push({ id: uid('q'), brandId: r.brandId, campaignId: r.campaignId, senderId: r.senderId, name: c.name, email: c.email, status: 'queued' }); n++; } });
    S.mail.adminRows = []; S.mail.sel.admin = []; save(); ui.tab.mb = 'log'; go('a-mailbox'); toast(`${n}건을 로컬 검수 배치로 만들었어요 (실제 발송 없음).`);
  };
  RENDER['a-mailbox'] = () => { const t = tabs6('mb', [['reply', '회신 통합함'], ['log', '발송 로그']], 'reply'); return `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>계정별 메일함</h1><p class="v6-sub">발신 계정·브랜드·캠페인별 회신과 발송 로그를 한곳에서 봐요.</p></div></div>${t.html}<div class="v6-tabbody">${t.cur === 'reply' ? compReplies(null) : compLog(null)}</div></div>`; };

  /* =====================================================================
     브랜드 화면 등록
     ===================================================================== */
  RENDER['b-learning'] = () => compLearning(S.brandId);
  RENDER['b-campaigns'] = () => compCampaigns(S.brandId);
  RENDER['b-create'] = () => compCreate(S.brandId);
  RENDER['b-products'] = () => compProducts(S.brandId).replace('<div class="v6-actions">', `<div class="v6-actions"><a class="btn ghost" href="products.html">크리에이터 공개 목록에서 미리보기</a>`);
  RENDER['b-applicants'] = () => compApplicants(S.brandId);
  RENDER['b-community'] = () => compCommunity(S.brandId);
  RENDER['b-mailconnect'] = () => compMailConnect(S.brandId);
  RENDER['b-invite'] = () => `<div class="v6">${ctxHead(S.brandId, '받는 사람 찾기', '수신 메일·보유 DB·CSV에서 고르고 리스트로 저장해요.', b('B05'))}${compRecipients(S.brandId, S.brandId)}<div class="v6-actions v6-bar">${btn(`선택 ${selOf(S.brandId).length}명으로 메일 작성`, 'v6-gomail', { s: 'b-mailprep' }, 'pri')}</div></div>`;
  RENDER['b-mailprep'] = () => compCompose(S.brandId);
  RENDER['b-reply'] = () => `<div class="v6">${ctxHead(S.brandId, '회신함', '답장 필요·긍정·질문·거절·수신 거부로 나눠 보고, 담당자와 후속 할 일을 정해요.', b('B07'))}${compReplies(S.brandId)}</div>`;
  RENDER['b-sendlog'] = () => `<div class="v6">${ctxHead(S.brandId, '발송 로그', '대기 / 메일 서비스 접수 / 반송 / 결과 모름 / 일시 중지를 구분해요.')}${compLog(S.brandId)}</div>`;
  RENDER['b-team'] = () => compTeam(S.brandId);
  RENDER['b-billing'] = () => compBilling(S.brandId);
  delete AFTER['b-invite']; delete AFTER['b-applicants'];
  MENUS.admin.forEach(m => { if (m.label === '브랜드 운영') m.screens = [['a-brands', '브랜드 목록·콘솔'], ['a-people', '사람·권한']]; });

  /* =====================================================================
     캠페인별 샘플·영상 / 보상 / 결과 (모두 S.campaigns · S.parts · S.products에서)
     ===================================================================== */
  function campPick(bid, key) {
    const list = camps(bid);
    if (!ui[key] || !S.campaigns[ui[key]] || S.campaigns[ui[key]].brandId !== bid) ui[key] = (list[0] || {}).id;
    return list.length ? `<div class="v6-field v6-inlinefield"><label for="${key}">캠페인</label><select id="${key}" data-v6ui="${key}">${list.map(c => `<option value="${c.id}" ${c.id === ui[key] ? 'selected' : ''}>${e(c.name)}</option>`).join('')}</select></div>` : '';
  }
  const campBanner = c => { const p = S.products[c.productId]; return `<div class="v6-sticky">${pimg(p, 48)}<div class="v6-grow"><b>${e(c.name)}</b><span class="v6-meta">${e(brand(c.brandId).short)} · ${e(p ? p.name : '')} · ${e(rewardText(c))} · ${e(contentText(c))}</span></div>${campStatus(c)}</div>`; };
  const noIdIfAdmin = id => b(id, view.role === 'admin' ? { noId: true } : {});
  ui.trk = {}; ui.rev = {};
  function compSamples(bid) {
    const pick = campPick(bid, 'scCamp'), c = S.campaigns[ui.scCamp];
    const head = ctxHead(bid, '샘플·영상', '선택한 캠페인의 주소·배송·영상 제출·수정 요청·검수를 처리해요. 크리에이터 화면과 보상에 같은 상태로 반영돼요.', noIdIfAdmin('B09') + ' ' + noIdIfAdmin('B10'));
    if (!c) return `<div class="v6">${head}<p class="v6-empty">캠페인이 없어요.</p></div>`;
    const ps = partsOf(c.id).filter(x => ['selected', 'sample', 'video', 'done'].includes(x.status));
    const t = tabs6('sc', [['ship', '샘플 배송'], ['video', '영상 검수']], 'ship');
    const name = x => `<div class="v6-grow"><b>${e(CR[x.creatorId].name)}</b><span class="v6-meta">${CTRY[CR[x.creatorId].country]} · ${e(x.addr || '주소 미입력')}</span></div>`;
    let body = '';
    if (t.cur === 'ship') body = `<ul class="v6-list">${ps.map(x => {
      if (x.status === 'selected' && !x.addr) return `<li class="v6-row">${name(x)}${chip2('주소 대기', 'warn')}${x.addrRequested ? '<span class="v6-meta">요청함</span>' : btn('주소 입력 요청 (시안)', 'v6-addrreq', { p: x.id })}</li>`;
      if (x.status === 'selected') return `<li class="v6-row">${name(x)}${chip2('발송 대기', 'info')}<div class="v6-field v6-trk"><label for="trk-${x.id}">송장 번호</label><input id="trk-${x.id}" type="text" data-v6trk="${x.id}" value="${e(ui.trk[x.id] || '')}" placeholder="예: USPS 9400-1234 (예시)"${ui.err['trk-' + x.id] ? ` aria-invalid="true" aria-describedby="err-trk-${x.id}"` : ''}>${errOf('trk-' + x.id)}</div>${btn('발송 처리 (시안)', 'v6-ship', { p: x.id }, 'pri')}</li>`;
      if (x.status === 'sample') return `<li class="v6-row">${name(x)}${chip2('배송 중', 'warn')}<span class="v6-meta">송장 ${e(x.tracking || '—')} · 크리에이터가 수령을 확인해요</span></li>`;
      return `<li class="v6-row">${name(x)}${chip2('수령 완료', 'ok')}</li>`; }).join('') || '<li class="v6-empty">선정된 크리에이터가 없어요.</li>'}</ul>`;
    if (t.cur === 'video') body = `<p class="v6-meta">요청: ${e(contentText(c))} · 필수: ${e(c.content.must || '—')} · 금지: ${e(c.content.banned || '—')} · 기한: ${e(c.content.due)}</p><ul class="v6-list">${ps.filter(x => ['video', 'done'].includes(x.status)).map(x => {
      if (x.status === 'done') return `<li class="v6-row">${name(x)}<span class="v6-meta v6-wrap">${e(x.videoUrl || '')}</span>${chip2('검수 완료', 'ok')}</li>`;
      if (!x.videoUrl) return `<li class="v6-row">${name(x)}${chip2(x.revision ? '수정본 제출 대기' : '제출 대기', 'warn')}${x.revision ? `<span class="v6-meta">요청: ${e(x.revision)}</span>` : ''}</li>`;
      return `<li class="v6-row v6-editrow"><div class="v6-row" style="border:0;padding:0">${name(x)}<span class="v6-wrap">${e(x.videoUrl)}</span>${chip2('검수 대기', 'info')}</div><div class="v6-field"><label for="rev-${x.id}">수정 요청 사유 (수정 요청 시 필수)</label><textarea id="rev-${x.id}" data-v6rev="${x.id}" placeholder="예: 0:05~0:09 제품명을 정확히 말해 주세요"${ui.err['rev-' + x.id] ? ` aria-invalid="true" aria-describedby="err-rev-${x.id}"` : ''}>${e(ui.rev[x.id] || '')}</textarea>${errOf('rev-' + x.id)}</div><div class="v6-actions">${btn('수정 요청 (시안)', 'v6-revise', { p: x.id })}${btn('검수 완료 (시안)', 'v6-approve', { p: x.id }, 'pri')}</div></li>`; }).join('') || '<li class="v6-empty">영상 단계의 크리에이터가 없어요.</li>'}</ul>`;
    return `<div class="v6">${head}${pick}${campBanner(c)}${t.html}<div class="v6-tabbody">${body}</div></div>`;
  }
  document.addEventListener('input', ev => { const t = ev.target; if (!t.dataset) return; if (t.dataset.v6trk) ui.trk[t.dataset.v6trk] = t.value; if (t.dataset.v6rev) ui.rev[t.dataset.v6rev] = t.value; });
  const partBy = id => S.parts.find(x => x.id === id);
  ACT['v6-addrreq'] = el => { partBy(el.dataset.p).addrRequested = true; save(); render(); toast('주소 입력을 요청했어요. 크리에이터 내 할 일에 표시돼요 (시안).'); };
  ACT['v6-ship'] = el => { const x = partBy(el.dataset.p), v = (ui.trk[x.id] || '').trim(); if (!v) { ui.err['trk-' + x.id] = '송장 번호를 적어 주세요.'; render(); focusFirstErr(); return; } x.tracking = v; x.status = 'sample'; x.due = '배송 중'; delete ui.err['trk-' + x.id]; save(); render(); toast('발송 처리했어요. 크리에이터 화면에 송장이 보여요 (시안).'); };
  ACT['v6-revise'] = el => { const x = partBy(el.dataset.p), v = (ui.rev[x.id] || '').trim(); if (!v) { ui.err['rev-' + x.id] = '수정 요청 사유를 적어 주세요.'; render(); focusFirstErr(); return; } (x.videoPrev = x.videoPrev || []).push(x.videoUrl); x.videoUrl = ''; x.revision = v; x.due = '수정본 제출'; ui.rev[x.id] = ''; delete ui.err['rev-' + x.id]; save(); render(); toast('수정 요청을 보냈어요. 크리에이터가 사유를 보고 다시 제출해요 (시안).'); };
  ACT['v6-approve'] = el => { const x = partBy(el.dataset.p); x.status = 'done'; x.revision = ''; x.due = '검수 완료'; save(); render(); toast('검수 완료로 표시했어요. 보상 화면에 같은 상태로 반영돼요.'); };
  function rewardInfo(p) {
    const c = S.campaigns[p.campaignId];
    if (p.status === 'rejected') return { type: '해당 없음', amount: '—', status: '선정되지 않음', tone: '', note: '' };
    if (c.goal === 'affiliate') return { type: '판매 보상 · 플랫폼 정산', amount: `판매금액의 ${c.affiliate.commission}%`, status: '판매·정산 데이터 미연동', tone: 'info', note: 'TikTok Shop이 주문 확정 후 정산해요. 이 시안은 판매·정산 데이터를 연동하지 않아 금액을 표시하지 않아요.' };
    if (c.goal === 'ugc') return { type: '고정비 · 브랜드 지급', amount: `${c.ugc.fee} ${c.ugc.currency}`, status: p.status === 'done' ? '조건 확인 완료 · 지급 대기' : '조건 확인 전 (영상 검수 완료 후 지급 대기)', tone: p.status === 'done' ? 'warn' : '', note: `지급 시점: ${c.ugc.payAt || '미정'}. 지급 완료 기록은 실제 지급이 확인된 뒤에만 생겨요 (시안에는 없음).` };
    return { type: '제품 제공', amount: '금액 보상 없음', status: ['sample', 'video', 'done'].includes(p.status) ? '제품 제공됨' : '제품 제공 예정', tone: 'ok', note: '샘플 협업은 제품만 제공해요.' };
  }
  RENDER['c-rewards'] = () => {
    const list = myParts().filter(p => S.campaigns[p.campaignId]?.brandId === S.creatorBrand && !['applied', 'review'].includes(p.status));
    return `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>받을 보상 ${b('C09')}</h1><p class="v6-sub">캠페인 조건별로 보상 방식이 달라요. ‘지급 대기’는 아직 받지 않은 상태예요.</p></div></div>
      ${scopeBar('rewardScope', '보상')}<ul class="v6-list">${list.map(p => { const c = S.campaigns[p.campaignId], r = rewardInfo(p); return `<li class="v6-row">${pimg(S.products[c.productId], 40)}<div class="v6-grow"><b>${crumb(c)}</b><span class="v6-meta">${e(r.type)} · ${e(r.amount)} · 참여 단계 ${PST[p.status]}</span><span class="v6-meta">${e(r.note)}</span></div>${chip2(r.status, r.tone)}</li>`; }).join('') || '<li class="v6-empty">이 브랜드에서 선정된 캠페인이 없어요.</li>'}</ul>
      <p class="v6-meta">신청 중인 캠페인은 선정 후 여기에 보여요. 문제가 있으면 ‘도움말’에서 문의해요.</p></div>`;
  };
  function compResults(bid) {
    const list = camps(bid);
    return `<div class="v6">${ctxHead(bid, '결과·보상', '같은 참여 건에서 집계해요. 조회·판매 데이터는 연동 전이라 ‘미연동’으로 표시해요.', noIdIfAdmin('B13'))}
      <div class="v6-table v6-results" role="table"><div class="v6-tr v6-th" role="row"><span role="columnheader">캠페인</span><span role="columnheader">지원</span><span role="columnheader">선정·진행</span><span role="columnheader">영상 제출</span><span role="columnheader">검수 완료</span><span role="columnheader">조회·판매</span><span role="columnheader">보상 상태</span></div>
      ${list.map(c => { const ps = partsOf(c.id), done = ps.filter(x => x.status === 'done').length; const pay = c.goal === 'ugc' ? `지급 대기 ${done}건 · ${done * Number(c.ugc.fee || 0)} ${c.ugc.currency} (조건 확인 기준, 지급 기록 아님)` : c.goal === 'affiliate' ? '플랫폼 정산 · 미연동' : '제품 제공만'; return `<div class="v6-tr" role="row"><span role="cell" class="v6-cellmain">${pimg(S.products[c.productId], 32)}<span><b>${e(c.name)}</b><span class="v6-meta">${e(GOAL[c.goal])}</span></span></span><span role="cell">${ps.length}</span><span role="cell">${ps.filter(x => ['selected', 'sample', 'video'].includes(x.status)).length}</span><span role="cell">${ps.filter(x => x.videoUrl || x.status === 'done').length}</span><span role="cell">${done}</span><span role="cell">미연동</span><span role="cell">${e(pay)}</span></div>`; }).join('') || '<div class="v6-empty">캠페인이 없어요.</div>'}</div>
      <p class="v6-meta">판매금액·조회수는 실제 플랫폼 연동 전까지 만들지 않아요. 지급 완료는 실제 지급 확인 후에만 기록돼요.</p></div>`;
  }
  RENDER['b-samples'] = () => compSamples(S.brandId);
  RENDER['b-results'] = () => compResults(S.brandId);

  /* =====================================================================
     독립 제품 모아보기: 공개 제품 한 목록 (v6 상태만 사용, v6 전용 ID)
     ===================================================================== */
  const campOpen = c => c.status === 'recruiting' && (!c.end || c.end >= TODAY);
  const RT = { affiliate: '판매 보상', ugc: '고정비 (유료 UGC)', sample: '샘플 (제품 제공)' };
  const pubProducts = () => Object.values(S.products).filter(p => p.public && p.saved !== false && !missingOf(p).length);
  ui.pf = { q: '', brand: '', cat: '', ctry: '', rtype: '', view: 'all', can: false };
  const pcamps = p => camps(p.brandId).filter(c => c.productId === p.id && c.status !== 'draft');
  const matchC = c => (!ui.pf.ctry || c.countries.includes(ui.pf.ctry)) && (!ui.pf.rtype || c.goal === ui.pf.rtype);
  const appliedTo = p => myParts().some(x => pcamps(p).some(c => c.id === x.campaignId));
  function pfList() {
    const q = ui.pf.q.trim().toLowerCase();
    return pubProducts().filter(p => {
      if (ui.pf.brand && p.brandId !== ui.pf.brand) return false; if (ui.pf.cat && p.category !== ui.pf.cat) return false;
      if (q && !(p.name + ' ' + brand(p.brandId).name).toLowerCase().includes(q)) return false;
      if (ui.pf.view === 'saved' && !S.saved[p.id]) return false; if (ui.pf.view === 'interest' && !S.interest[p.id]) return false; if (ui.pf.view === 'applied' && !appliedTo(p)) return false;
      if ((ui.pf.ctry || ui.pf.rtype) && !pcamps(p).some(matchC)) return false;
      if (ui.pf.can && !pcamps(p).some(c => campOpen(c) && matchC(c) && !myParts().some(x => x.campaignId === c.id))) return false;
      return true;
    });
  }
  const applyHref = c => `./?role=creator&mode=proposal&screen=c-campaigns&camp=${encodeURIComponent(c.id)}`;
  function pcard(p) {
    const all = pcamps(p), open = all.filter(c => campOpen(c) && matchC(c)), closed = all.filter(c => !campOpen(c) && matchC(c)), applied = appliedTo(p);
    const st = open.length ? chip2(`모집 중${open.length > 1 ? ' ' + open.length + '개' : ''}`, 'ok') : closed.length ? chip2('모집 마감', 'err') : chip2('모집 없음');
    const show = open.length ? open : closed;
    const available = open.filter(c => !myParts().some(x => x.campaignId === c.id));
    const primary = applied && !available.length ? '<button type="button" class="btn" disabled>신청함</button>' : available.length === 1 ? `<a class="btn pri" href="${applyHref(available[0])}">조건 보고 신청</a>` : available.length > 1 ? btn(`조건 ${available.length}개 비교`, 'v6-pubdetail', { p: p.id }, 'pri') : btn(S.interest[p.id] ? '관심 등록됨' : (closed.length ? '다음 모집 알림 받기' : '관심 등록'), 'v6-interest', { p: p.id }, S.interest[p.id] ? '' : 'pri');
    return `<li class="v6-pcard" data-pid="${p.id}"><div class="v6-ptop">${pimg(p, 56)}<div class="v6-grow"><span class="v6-meta">${e(brand(p.brandId).name)}</span><h3>${e(p.name)}</h3><div>${st}${applied ? ' ' + chip2('신청함', 'info') : ''}${p.seedPlaceholder ? ' ' + chip2('예시 SVG 그림') : ''}</div></div></div>
      <dl class="v6-kv"><dt>신청 국가</dt><dd>${show.length ? ctryText([...new Set(show.flatMap(c => c.countries))]) : '—'}</dd><dt>보상</dt><dd>${show.length ? show.map(c => e(rewardText(c))).join(' / ') : '모집 조건 없음 · 보상 정보 없음'}</dd><dt>콘텐츠</dt><dd>${show.length ? [...new Set(show.map(contentText))].map(e).join(' / ') : '—'}</dd><dt>마감</dt><dd>${show.length ? show.map(c => e(c.end)).join(', ') : '—'}</dd></dl>
      <div class="v6-actions">${primary}${btn('상세', 'v6-pubdetail', { p: p.id }, 'ghost')}${btn(S.saved[p.id] ? '저장됨' : '저장', 'v6-psave', { p: p.id }, 'ghost')}</div></li>`;
  }
  const pfSel = (id, k, label, opts) => `<div class="v6-field"><label for="${id}">${label}</label><select id="${id}" data-v6pf="${k}">${opts.map(([v, l]) => `<option value="${e(v)}" ${String(ui.pf[k]) === String(v) ? 'selected' : ''}>${e(l)}</option>`).join('')}</select></div>`;
  RENDER['c-products'] = () => {
    const list = pfList();
    return `<div class="v6 v6-market"><div class="v6-head"><div class="v6-head-t"><h1>제품 모아보기 ${b('C13')}</h1><p class="v6-sub">브랜드가 공개한 제품을 한 목록으로 봐요. 모집 중이면 조건을 보고 신청하고, 모집이 없으면 관심을 남겨요.</p></div></div>
      <p class="v6-note v6-meta">디자인 예시 데이터 · 공개·운영 승인된 제품만 보여요 (비공개·초안·미완성 제외). 저장·관심은 이 브라우저에만 남고 서버로 보내지 않아요.</p>
      <div class="v6-filters" role="search"><div class="v6-field v6-q"><label for="v6pf-q">검색 (제품명·브랜드)</label><input id="v6pf-q" type="text" data-v6pf="q" value="${e(ui.pf.q)}"></div>
        ${pfSel('v6pf-brand', 'brand', '브랜드', [['', '전체 브랜드'], ...Object.values(S.brands).map(x => [x.id, x.short])])}
        ${pfSel('v6pf-cat', 'cat', '분야', [['', '전체'], ['스킨케어', '스킨케어'], ['헤어', '헤어'], ['생활', '생활'], ['식품', '식품']])}
        ${pfSel('v6pf-ctry', 'ctry', '신청 국가', [['', '전체'], ...Object.entries(CTRY)])}
        ${pfSel('v6pf-rtype', 'rtype', '보상 방식', [['', '전체'], ...Object.entries(RT)])}
        ${pfSel('v6pf-view', 'view', '보기', [['all', '전체 제품'], ['saved', '저장한 제품'], ['interest', '관심 등록한 제품'], ['applied', '신청한 제품']])}
        <label class="v6-inline"><input type="checkbox" id="v6pf-can" data-v6pf="can" ${ui.pf.can ? 'checked' : ''}> 신청 가능만</label>${btn('초기화', 'v6-pfreset')}</div>
      <p class="v6-count" id="v6pf-count" aria-live="polite">결과 ${list.length}개</p>
      ${list.length ? `<ul class="v6-pgrid">${list.map(pcard).join('')}</ul>` : `<div class="v6-empty">조건에 맞는 제품이 없어요. ${btn('필터 초기화', 'v6-pfreset')}</div>`}</div>`;
  };
  document.addEventListener('input', ev => { const t = ev.target; if (t.dataset && t.dataset.v6pf === 'q') { ui.pf.q = t.value; render(); } });
  document.addEventListener('change', ev => { const t = ev.target, k = t.dataset && t.dataset.v6pf; if (!k || k === 'q') return; ui.pf[k] = t.type === 'checkbox' ? t.checked : t.value; render(); });
  ACT['v6-pfreset'] = () => { ui.pf = { q: '', brand: '', cat: '', ctry: '', rtype: '', view: 'all', can: false }; render(); const q = document.getElementById('v6pf-q'); if (q) q.focus(); };
  ACT['v6-psave'] = el => { S.saved[el.dataset.p] = !S.saved[el.dataset.p]; save(); render(); const t = document.querySelector(`[data-act="v6-psave"][data-p="${el.dataset.p}"]`); if (t) t.focus(); };
  let pubSel = null;
  SHEETS['v6-pub'] = { get title() { return pubSel ? e(S.products[pubSel].name) : '제품'; }, html: () => { const p = S.products[pubSel], cs = pcamps(p); return `${productPreview(p)}<h3>협업 조건</h3>${cs.map(c => `<h4>${e(c.name)}</h4>${condSummary(c)}${campOpen(c) ? (myParts().some(x => x.campaignId === c.id) ? '<p>' + chip2('신청함', 'info') + '</p>' : `<a class="btn pri" href="${applyHref(c)}">이 조건으로 신청하기</a>`) : `<p>${chip2('모집 마감 · 신청 불가', 'err')}</p>`}`).join('<hr>') || '<p class="v6-meta">모집 중인 캠페인이 없어요. 관심 등록만 할 수 있어요.</p>'}<div class="v6-actions">${btn(S.interest[p.id] ? '관심 등록됨' : '관심 등록', 'v6-interest', { p: p.id })}<button type="button" class="btn" data-close-sheet>닫기</button></div>`; } };
  ACT['v6-pubdetail'] = el => { pubSel = el.dataset.p; openSheet('v6-pub'); };
  ACT['v6-interest'] = el => { S.interest[el.dataset.p] = !S.interest[el.dataset.p]; save(); if (document.getElementById('pd-sheet').hidden) { render(); const t = document.querySelector(`.v6-pcard [data-act="v6-interest"][data-p="${el.dataset.p}"]`); if (t) t.focus(); } else { render(); openSheet('v6-pub'); } toast(S.interest[el.dataset.p] ? '관심 등록했어요. 모집이 열리면 알려 드려요 (시안 · 실제 알림 없음).' : '관심 등록을 해제했어요.'); };
  S.interest = S.interest || {};
  ['p-amp', 'p-sun', 'p-hair'].forEach(id => { if (S.products[id] && S.products[id].public === undefined) { S.products[id].public = true; S.products[id].saved = true; } });


  /* ----- 브랜드 홈: 같은 상태에서 오늘 할 일만 ----- */
  RENDER['b-today'] = () => {
    const bid = S.brandId, cs = camps(bid), cids = cs.map(c => c.id), bp = S.parts.filter(x => cids.includes(x.campaignId));
    const dms = Object.entries(S.dms).filter(([, d]) => d.brandId === bid && needsReply(d));
    const reps = S.mail.replies.filter(r => r.brandId === bid && ['needs', 'question', 'positive'].includes(r.status) && !r.sent.length);
    const wait = bp.filter(x => ['applied', 'review'].includes(x.status)), addr = bp.filter(x => x.status === 'selected' && !x.addr), ship = bp.filter(x => x.status === 'selected' && x.addr), vid = bp.filter(x => x.status === 'video' && x.videoUrl);
    const cn = id => e(S.campaigns[id].name), nm = x => e(CR[x.creatorId].name);
    const items = [
      ...dms.map(([id, d]) => [`${e(CR[d.creatorId].name)}의 DM에 답장`, `${cn(d.campaignId)} · ${e(d.since || '')}`, btn('답장하기', 'v6-opendm', { d: id }, 'pri')]),
      ...reps.map(r => [`${e(r.name)}의 메일 회신 확인`, `${cn(r.campaignId)}`, btn('회신함', 'v6-today', { s: 'b-reply', r: r.id })]),
      ...wait.map(x => [`${nm(x)} 지원 검토`, cn(x.campaignId), btn('지원자 보기', 'v6-today', { s: 'b-applicants', c: x.campaignId, p: x.id })]),
      ...addr.map(x => [`${nm(x)} 샘플 주소 대기`, cn(x.campaignId), btn('샘플·영상', 'v6-today', { s: 'b-samples', c: x.campaignId })]),
      ...ship.map(x => [`${nm(x)} 샘플 발송 처리`, cn(x.campaignId), btn('발송 처리', 'v6-today', { s: 'b-samples', c: x.campaignId }, 'pri')]),
      ...vid.map(x => [`${nm(x)} 영상 검수`, cn(x.campaignId), btn('영상 확인', 'v6-today', { s: 'b-samples', c: x.campaignId, t: 'video' }, 'pri')]),
    ];
    const L = S.learning[bid] || { intro: '', homepage: '', countries: [], usp: '', banned: '', faq: [] }, ls = learnStatus(L), lsDone = ls.filter(x => x[1]).length;
    const steps = [['제품 자료 완성', prods(bid).some(p => !missingOf(p).length)], ['캠페인 모집 시작', cs.some(c => c.status === 'recruiting')], ['첫 지원 받기', bp.length > 0], ['선정·주소 받기', bp.some(x => x.addr)], ['샘플 발송', bp.some(x => ['sample', 'video', 'done'].includes(x.status))]];
    return `<div class="v6">${ctxHead(bid, `${e(brand(bid).short)} 오늘 할 일`, '같은 캠페인·참여 건·대화 데이터에서 지금 처리할 일만 모아요.', b('B01'))}
      <div class="v6-stats">${[['답장 필요', dms.length + reps.length], ['선정 대기', wait.length], ['주소 대기', addr.length], ['발송 대기', ship.length], ['영상 확인', vid.length]].map(([l, n]) => `<div class="v6-stat"><span>${l}</span><b>${n}</b></div>`).join('')}</div>
      <section class="v6-sec"><h2>다음 행동 ${b('X01')}</h2><ul class="v6-list">${items.map(([t, m, a]) => `<li class="v6-row"><div class="v6-grow"><b>${t}</b><span class="v6-meta">${m}</span></div>${a}</li>`).join('') || '<li class="v6-empty">지금 처리할 일이 없어요.</li>'}</ul></section>
      <div class="v6-split"><section class="v6-col v6-panel"><h3>시작 진행 ${b('X06')}</h3><ul class="v6-steplist">${steps.map(([t, ok], i) => `<li>${chip2(ok ? '완료' : '대기', ok ? 'ok' : '')} ${i + 1}. ${t}</li>`).join('')}</ul></section>
      <section class="v6-col v6-panel"><h3>브랜드 학습 ${b('B02')}</h3><p class="v6-meta">${lsDone}/${ls.length} 완료${lsDone < ls.length ? ' · 부족: ' + ls.filter(x => !x[1]).map(x => x[0]).join(', ') : ''}</p>${goBtn('브랜드 학습 열기', 'b-learning')}</section></div></div>`;
  };
  ACT['v6-today'] = el => { const d = el.dataset; if (d.c) { ui.appCamp = d.c; ui.scCamp = d.c; } if (d.p) ui.appSel = d.p; if (d.r) ui.replySel = d.r; if (d.t) ui.tab.sc = d.t; else if (d.s === 'b-samples') ui.tab.sc = 'ship'; go(d.s); };
  /* =====================================================================
     v8 시각·흐름 보완 (같은 상태 S를 그대로 사용, 새 상태 복제 없음)
     ===================================================================== */
  const daysLeft = end => { if (!end) return null; const d = Math.round((new Date(end + 'T00:00:00') - new Date(TODAY + 'T00:00:00')) / 86400000); return d; };
  const dLabel = end => { const d = daysLeft(end); return d == null ? '' : d < 0 ? '마감됨' : d === 0 ? '오늘 마감' : `D-${d}`; };
  const rewardKind = c => c.goal === 'affiliate' ? `판매 수수료 ${c.affiliate.commission}%` : c.goal === 'ugc' ? `고정비 ${c.ugc.fee} ${c.ugc.currency}` : '제품 제공';
  const needsMe = p => (p.status === 'selected' && !p.addr) || p.status === 'sample' || (p.status === 'video' && !p.videoUrl);
  const urgency = p => p.status === 'video' && !p.videoUrl ? 0 : p.status === 'selected' && !p.addr ? 1 : p.status === 'sample' ? 2 : ['applied', 'review'].includes(p.status) ? 3 : p.status === 'selected' ? 4 : 5;
  function scopeBar(key, label) {
    const b2 = brand(S.creatorBrand);
    return `<div class="v8-scope" role="group" aria-label="보기 범위"><span class="v8-scope-t"><b>${e(b2.short)}</b> 커뮤니티의 ${label}만 보여요</span></div>`;
  }
  ACT['v8-scope'] = () => { render(); };
  const scoped = () => myParts().filter(p => S.campaigns[p.campaignId]?.brandId === S.creatorBrand);

  RENDER['c-tasks'] = () => {
    const list = scoped('taskScope').slice().sort((a, c) => urgency(a) - urgency(c));
    const todo = list.filter(needsMe), waiting = list.filter(p => !needsMe(p) && !['done', 'rejected'].includes(p.status));
    const top = list[0] && urgency(list[0]) < 5 ? list[0] : null, rest = top ? list.slice(1) : list;
    const ev = list.find(p => p.status === 'selected') || list[0];
    let feature = '';
    if (top) { const c = S.campaigns[top.campaignId], pr = S.products[c.productId], [t, a] = nextAction(top); feature = `<section class="v8-feature" aria-labelledby="v8-top-h"><div class="v8-feature-img">${pimg(pr, 96)}</div><div class="v8-feature-body"><p class="v8-eyebrow">${needsMe(top) ? '지금 가장 먼저 할 일' : '진행 중인 일'}</p><h2 id="v8-top-h">${crumb(c)}</h2><p class="v8-feature-t">${t}</p><p class="v6-meta">${chip2(PST[top.status], PST_TONE[top.status])} ${top.due ? '· ' + e(top.due) : ''} · ${e(rewardKind(c))}</p><div class="v6-actions">${a}</div></div></section>`; }
    return `<div class="v6 v8-creator"><div class="v6-head"><div class="v6-head-t"><h1>내 할 일 ${b('C06')} ${b('C04')}</h1><p class="v6-sub">민지님, ${todo.length ? `지금 직접 처리할 일이 <b>${todo.length}개</b> 있어요` : '지금 직접 처리할 일은 없어요'}${waiting.length ? ` · 브랜드 답을 기다리는 일 ${waiting.length}개` : ''}. 조건 확인 ${b('C05')} · 주소 ${b('C07')} · 영상 제출 ${b('C08')}은 각 캠페인 상세에서 해요.</p></div></div>
      ${scopeBar('taskScope', '할 일')}
      ${feature}
      ${ev ? `<div class="v6-notice v8-notice">${b('X03')}<span>최근 알림 · ${crumb(S.campaigns[ev.campaignId])}: ${PST[ev.status]}</span>${btn('열기', 'v6-cwork', { p: ev.id })}</div>` : ''}
      ${rest.length ? `<h2 class="v8-h2">다른 할 일 <span class="v6-count-inline">${rest.length}개</span></h2><ul class="v6-list">${rest.map(p => { const c = S.campaigns[p.campaignId], pr = S.products[c.productId], [t, a] = nextAction(p); return `<li class="v6-row">${pimg(pr, 48)}<div class="v6-grow"><b>${crumb(c)}</b><span class="v6-meta">${t}${p.due ? ' · ' + e(p.due) : ''}</span></div>${chip2(PST[p.status], PST_TONE[p.status])}${a}</li>`; }).join('')}</ul>` : ''}
      ${!list.length ? `<div class="v6-empty">이 브랜드에서 할 일이 없어요. ${goBtn('이 브랜드 캠페인 보기', 'c-campaigns', 'ghost')}</div>` : ''}</div>`;
  };

  const v6CampaignsDetail = RENDER['c-campaigns'];
  RENDER['c-campaigns'] = () => {
    const html = v6CampaignsDetail();
    const list = camps(S.creatorBrand).filter(campOpen);
    const cards = `<ul class="v8-cgrid">${list.map(x => { const [st, tone] = myState(x), mine = S.parts.find(p => p.campaignId === x.id && p.creatorId === 'me'), p = S.products[x.productId];
      const cta = mine ? btn('내 캠페인에서 보기', 'v6-cwork', { p: mine.id }) : btn('조건 보고 신청', 'v6-ccamp', { c: x.id }, 'pri');
      return `<li class="v8-ccard${ui.cCampSel === x.id ? ' on' : ''}"><div class="v8-ccard-top">${pimg(p, 88)}<div class="v6-grow"><span class="v6-meta">${e(brand(x.brandId).short)}</span><h3>${e(x.name)}</h3><span class="v6-meta">${e(p ? p.name : '')}</span></div></div>
        <dl class="v8-facts"><div><dt>보상</dt><dd>${e(rewardKind(x))}</dd></div><div><dt>신청 국가</dt><dd>${ctryText(x.countries)}</dd></div><div><dt>콘텐츠</dt><dd>${e(contentText(x))}</dd></div><div><dt>모집 마감</dt><dd>${e(x.end)} <span class="v6-meta">${dLabel(x.end)}</span></dd></div></dl>
        <div class="v8-ccard-foot">${chip2(`내 상태: ${st}`, tone)}${cta}</div></li>`; }).join('')}</ul>`;
    return html.replace(/<p class="v6-kicker">조건 요약 ([\s\S]*?)<\/p>\s*<ul class="v6-list">[\s\S]*?<\/ul>/, (m, badge) => `<p class="v6-kicker">조건 요약 ${badge}</p>${list.length ? cards : '<div class="v6-empty">이 브랜드에서 모집 중인 캠페인이 없어요. 다른 브랜드 제품은 별도 제품 모아보기 페이지에서 확인해 주세요.</div>'}`);
  };

  const STEPS8 = ['신청', '선정', '조건·주소', '샘플', '영상', '검수'];
  const stepIdx = p => ({ applied: 0, review: 0, selected: p.addr ? 2 : 1, sample: 3, video: 4, done: 6 })[p.status] ?? 0;
  const v6Work = RENDER['c-work'];
  RENDER['c-work'] = () => {
    const list = scoped('workScope');
    if (list.length && !list.some(x => x.id === ui.cWorkSel)) ui.cWorkSel = list[0].id;
    const realParts = S.parts; let html;
    try { S.parts = realParts.filter(x => x.creatorId !== 'me' || list.includes(x)); html = v6Work(); } finally { S.parts = realParts; }
    const p = list.find(x => x.id === ui.cWorkSel);
    if (!p) return `<div class="v6 v8-creator"><div class="v6-head"><div class="v6-head-t"><h1>내 캠페인</h1></div></div>${scopeBar('workScope', '캠페인')}<div class="v6-empty">이 브랜드에서 참여한 캠페인이 없어요. ${goBtn('이 브랜드 캠페인 보기', 'c-campaigns')}</div></div>`;
    const si = stepIdx(p), [t, a] = nextAction(p), rej = p.status === 'rejected';
    const stepper = `<ol class="v8-stepper" aria-label="진행 단계">${STEPS8.map((l, i) => `<li class="${rej ? '' : i < si ? 'is-done' : i === si ? 'is-now' : ''}"${i === si && !rej ? ' aria-current="step"' : ''}><span class="v8-dot" aria-hidden="true">${i < si ? '✓' : i + 1}</span>${l}</li>`).join('')}</ol>
      <div class="v8-now"><p class="v8-eyebrow">${rej ? '결과' : '지금 할 일'}</p><p class="v8-feature-t">${t}</p>${p.videoUrl ? `<p class="v6-meta v6-wrap">제출물: ${e(p.videoUrl)}</p>` : ''}${p.tracking ? `<p class="v6-meta">송장: ${e(p.tracking)}</p>` : ''}<div class="v6-actions">${a}${btn('담당자에게 묻기', 'v6-cdm', { c: p.campaignId })}</div></div>`;
    return html.replace('<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>내 캠페인</h1>', '<div class="v6 v8-creator"><div class="v6-head"><div class="v6-head-t"><h1>내 캠페인</h1>')
      .replace('<div class="v6-split v6-split-list">', scopeBar('workScope', '캠페인') + '<div class="v6-split v6-split-list">')
      .replace(/(<div class="v6-col v6-panel"><h2>[\s\S]*?<\/h2>)/, `$1${stepper}`);
  };

  const v6Community = RENDER['c-community'];
  RENDER['c-community'] = () => {
    const bid = S.creatorBrand, b2 = brand(bid); let chId = ui.ch[bid] || chFree(bid); if (!S.channels[chId] || S.channels[chId].archived) chId = chFree(bid);
    const ch = S.channels[chId], pin = camps(bid).find(c => campOpen(c));
    let html = v6Community();
    html = html.replace('<div class="v2-chhead"><h1>', `<div class="v2-chhead"><h1><span class="v8-brandmark" aria-hidden="true">${e(b2.short.slice(0, 1))}</span>`)
      .replace(/(<div class="v2-chhead"><h1>[\s\S]*?<\/h1>)/, `$1<p class="v8-chdesc">${e(ch.desc || `${b2.short} 멤버가 함께 쓰는 채널`)} · ${ch.vis === 'readonly' ? '읽기 전용' : '누구나 글쓰기'}</p>`);
    if (pin) html = html.replace('<div class="v2-feed">', `<div class="v2-feed"><div class="v8-pin"><span class="v8-pin-l">고정</span>${pimg(S.products[pin.productId], 40)}<div class="v6-grow"><b>${e(pin.name)}</b><span class="v6-meta">${e(rewardKind(pin))} · ${ctryText(pin.countries)} · ${dLabel(pin.end)}</span></div><button type="button" class="btn" data-act="v6-gocamp" data-c="${pin.id}">조건 보기</button></div><div class="v8-day"><span>최근 대화</span></div>`);
    else html = html.replace('<div class="v2-feed">', '<div class="v2-feed"><div class="v8-day"><span>최근 대화</span></div>');
    return html;
  };

  const levelInfo = t => { const l = level(t).l, lo = LV[l - 1] || 0, hi = LV[l]; return { l, lo, hi, pct: hi ? Math.round((t - lo) / (hi - lo) * 100) : 100 }; };
  const levelBar = x => { const li = levelInfo(x.total); return `<div class="v8-level"><div class="v8-level-t"><b>Lv.${li.l}</b><span class="v6-meta">누적 ${x.total} XP${li.hi ? ` · 다음 레벨까지 ${li.hi - x.total} XP` : ' · 최고 레벨'}</span></div><div class="v6-progress" role="progressbar" aria-label="레벨 진행" aria-valuemin="${li.lo}" aria-valuemax="${li.hi || x.total}" aria-valuenow="${x.total}"><span style="width:${li.pct}%"></span></div><p class="v6-meta">XP는 활동 기록이에요. 현금·정산·운영 성과와 관계없어요.</p></div>`; };
  RENDER['c-ranking'] = () => {
    const bid = S.creatorBrand, x = xpOf(bid);
    const rows = [{ n: '크리에이터 A(예시)', w: 60 }, { n: '크리에이터 B(예시)', w: 35 }, { n: '나 · 민지(예시)', w: x.weekly, me: true }, { n: '크리에이터 C(예시)', w: 15 }].sort((a, c) => c.w - a.w);
    const max = Math.max(...rows.map(r => r.w), 1), myRank = rows.findIndex(r => r.me) + 1;
    return `<div class="v6 v8-creator"><div class="v6-head"><div class="v6-head-t"><h1>브랜드 랭킹 ${b('C11', { noId: true })}</h1><p class="v6-sub">${e(brand(bid).short)} 기준 예시 점수예요. 주간 점수와 누적 레벨 XP를 따로 계산해요.</p></div></div>
      ${levelBar(x)}
      <div class="v6-split"><section class="v6-col"><h2>이번 주 순위 <span class="v6-count-inline">내 순위 ${myRank}위 · ${x.weekly}점</span></h2>
        <ol class="v8-rank">${rows.map((r, i) => `<li class="${r.me ? 'is-me' : ''}${i < 3 ? ' is-top' : ''}"><span class="v8-rank-n">${i + 1}</span><span class="v8-rank-name">${e(r.n)}${r.me ? ' <span class="chip plum">나</span>' : ''}</span><span class="v8-rank-bar" aria-hidden="true"><span style="width:${Math.round(r.w / max * 100)}%"></span></span><span class="v8-rank-pt">${r.w}점</span></li>`).join('')}</ol></section>
      <section class="v6-col"><h2>점수 내역</h2><ul class="v6-list">${x.hist.slice().reverse().map(h => `<li class="v6-row"><div class="v6-grow">${e(h.t)}</div><span class="v6-meta">+${h.pts} · ${e(h.at)}</span></li>`).join('') || '<li class="v6-empty">아직 점수가 없어요.</li>'}</ul>
        <p class="v6-meta">제외 기준: 같은 미션 반복, 같은 문장 반복, 자기 글에 반응하기는 점수에 넣지 않아요.</p>${goBtn('할 수 있는 미션 보기', 'c-missions')}</section></div></div>`;
  };
  const MISSION_UI = { 'm-intro': ['#자유대화로 가서 자기소개 쓰기', '#자유대화에서 해요', 'c-community', 'free'], 'm-answer': ['#질문으로 가서 답하기', '#질문 채널에서 해요', 'c-community', '질문'], 'm-review': ['#제품후기로 가서 후기 쓰기', '#제품후기 채널에서 해요', 'c-community', '제품후기'], 'm-video': ['내 캠페인에서 영상 제출', '내 캠페인에서 해요', 'c-work', ''] };
  ACT['v8-mgo'] = el => { const [, , to, ch] = MISSION_UI[el.dataset.m] || []; const bid = S.creatorBrand; if (to === 'c-community') { const id = ch === 'free' ? chFree(bid) : (Object.entries(S.channels).find(([, c]) => c.brandId === bid && c.name === ch && !c.archived) || [chFree(bid)])[0]; if (id) ui.ch[bid] = id; } view.screen[view.role] = to || 'c-community'; saveView(); render(); window.scrollTo(0, 0); };
  RENDER['c-missions'] = () => {
    const bid = S.creatorBrand, done = S.missionsDone[bid] || (S.missionsDone[bid] = []), x = xpOf(bid);
    const groups = { can: [], wait: [], done: [] };
    MISSIONS.forEach(m => { const ok = !m.cond || m.cond(bid); (done.includes(m.id) ? groups.done : ok ? groups.can : groups.wait).push(m); });
    const card = (m, kind) => { const [act, where, to] = MISSION_UI[m.id] || [m.t, '', '']; return `<li class="v8-mission is-${kind}"><span class="v8-mission-ic" aria-hidden="true">${kind === 'done' ? '✓' : kind === 'wait' ? '…' : '+'}</span><div class="v6-grow"><b>${e(m.t)}</b><span class="v6-meta">${e(where)} · +${m.pts} XP${kind === 'wait' ? ' · ' + e(m.why) : ''}</span></div>${kind === 'can' ? `<span class="v6-actions">${btn(act, 'v8-mgo', { m: m.id })}${btn('완료 체험 (시안 · XP만 표시)', 'v6-mission', { m: m.id }, 'ghost')}</span>` : kind === 'wait' ? goBtn('조건 보러 가기', to, 'ghost') : chip2('완료', 'ok')}</li>`; };
    const sec = (title, kind, arr) => arr.length ? `<section class="v8-msec"><h2>${title} <span class="v6-count-inline">${arr.length}개</span></h2><ul class="v8-missions">${arr.map(m => card(m, kind)).join('')}</ul></section>` : '';
    return `<div class="v6 v8-creator"><div class="v6-head"><div class="v6-head-t"><h1>미션·배지 ${b('C11', { noId: true })}</h1><p class="v6-sub">${e(brand(bid).short)} 미션. 첫 버튼은 실제로 활동할 채널·화면으로 이동만 해요. ‘완료 체험’은 시안에서 XP 표시만 바꾸고 활동·보상을 확정하지 않아요.</p></div></div>
      ${levelBar(x)}
      ${sec('지금 할 수 있어요', 'can', groups.can)}${sec('조건을 기다려요', 'wait', groups.wait)}${sec('완료했어요', 'done', groups.done)}
      <section class="v8-msec"><h2>배지</h2><ul class="v8-badges"><li class="${done.length >= 1 ? 'is-on' : ''}">첫 걸음 <span class="v6-meta">미션 1개</span></li><li class="${done.length >= 3 ? 'is-on' : ''}">열심 멤버 <span class="v6-meta">미션 3개</span></li><li class="${done.length >= MISSIONS.length ? 'is-on' : ''}">모두 완료 <span class="v6-meta">미션 ${MISSIONS.length}개</span></li></ul></section></div>`;
  };

  /* 공지와 비어 있는 캠페인 공지를 선택 브랜드 데이터에 연결한다. */
  const v8AnnouncementsBase = RENDER['c-announcements'];
  RENDER['c-announcements'] = () => {
    const c = camps(S.creatorBrand).find(campOpen);
    let html = v8AnnouncementsBase();
    if (c) html = html.replace('예시 제품 A 영상 협업이 열렸어요', e(c.name) + ' 모집을 확인해 보세요')
      .replace('10/26 · 미국 멤버 대상', ctryText(c.countries) + ' 활동 크리에이터 대상')
      .replace(goBtn('협업 보기', 'c-campaigns', 'pri'), btn('캠페인 보기', 'v6-gocamp', { c: c.id }, 'pri'));
    else html = html.replace('예시 제품 A 영상 협업이 열렸어요', '브랜드 캠페인 안내를 기다리고 있어요').replace('10/26 · 미국 멤버 대상', '새 모집은 캠페인 둘러보기에서 확인하세요');
    return html.replace('운영 시간 안내', '커뮤니티 이용 안내').replace('10/02</div>', '질문은 브랜드 담당자에게 남겨 주세요.</div>');
  };
  const v8RecruitNoticeBase = RENDER['c-recruit'];
  RENDER['c-recruit'] = () => v8RecruitNoticeBase().replace('<li class="v6-empty">아직 게시된 캠페인이 없어요.</li>', '<li class="v6-empty"><b>아직 채널에 게시된 캠페인이 없어요.</b><p>모집 중인 캠페인은 캠페인 둘러보기에서 확인할 수 있어요.</p>' + goBtn('캠페인 둘러보기', 'c-campaigns') + '</li>');

  /* ----- 관리자 대량 모집 (현재 운영 메뉴·5단계에 맞춘 로컬 시연) ----- */
  const V8 = () => { const m = S.mail; if (!m.v8) m.v8 = { camps: [], prop: {}, saved: false, step: 1, assign: {}, draftSaved: false, approved: false, plans: [], progress: {} }; return m.v8; };
  const v8fill = (tpl, c, camp, p, reason) => String(tpl || '').replace(/\{\{name\}\}/g, c ? c.name : '').replace(/\{\{reason\}\}/g, reason || '').replace(/\{\{brand\}\}/g, camp ? brand(camp.brandId).short : '').replace(/\{\{product\}\}/g, p ? p.name : '');
  const reasonOf = c => c ? [c.cat ? `선택 분야: ${c.cat}` : '', c.country && CTRY[c.country] ? `활동 국가: ${CTRY[c.country]}` : ''].filter(Boolean).join(' · ') : '';  /* DB에 있는 값만. 활동 빈도·성과 같은 확인 안 된 주장은 만들지 않음 */
  const applyUrl = camp => `https://app.example/apply/${camp.brandId}/${camp.id} (예시)`;
  const propOf = cid => { const v = V8(); return v.prop[cid] || (v.prop[cid] = { subject: '{{brand}} {{product}} 협업 제안', body: '안녕하세요 {{name}}님, {{brand}}의 {{product}}를 소개해 주실 분을 찾고 있어요. (연락 근거 · {{reason}})', memo: '', open: '', ok: false }); };
  /* 같은 사람 판단: 정규화한 이메일, 그리고 확인된 personId가 있을 때만 personId. 이름 유사도로 추정하지 않음 */
  const v8email = c => String(c && c.email || '').trim().toLowerCase();
  const v8keys = c => [v8email(c) && 'e:' + v8email(c), c && c.personId ? 'p:' + c.personId : ''].filter(Boolean);
  function v8issue(c, cid, seen) {
    const camp = S.campaigns[cid]; if (!c) return '후보 정보 없음'; if (!isEmail(v8email(c))) return '이메일 형식 오류'; if (c.optout) return '수신 거부'; if (c.bounced) return '반송 이력'; if (c.recentDays != null && c.recentDays < 30) return '최근 30일 내 연락';
    if (!camp || !campOpen(camp)) return '캠페인이 열려 있지 않음'; if (c.country && !camp.countries.includes(c.country)) return '활동 국가 불일치';
    if (seen && v8keys(c).some(k => seen.has(k))) return '같은 사람 중복 (한 제안에만 배정)';
    if (S.mail.queue.some(q => q.status === 'queued' && (String(q.email).trim().toLowerCase() === v8email(c) || (c.personId && q.personId === c.personId)))) return '이미 대기열 (예약됨)'; return '';
  }
  function v8plan() {
    const v = V8(), seen = new Set();
    return [...new Set(selOf('v8'))].map(id => { const c = cand(id); let cid = v.assign[id] && v.camps.includes(v.assign[id]) ? v.assign[id] : v.camps.find(x => c && S.campaigns[x] && (!c.country || S.campaigns[x].countries.includes(c.country))) || v.camps[0]; const r = v8issue(c, cid, seen); if (c && !r) v8keys(c).forEach(k => seen.add(k)); return { id, c, cid, r }; });
  }
  /* 발신 계정 잔여량은 계정 ID별 전역 값: 설정량 - 오늘 사용 - 로컬 대기열(queued) 예약. 여러 캠페인이 같은 계정을 나눠 써도 중복 사용하지 않음 */
  function v8left() { const left = {}, held = {}; S.mail.queue.forEach(q => { if (q.status === 'queued' && q.senderId) held[q.senderId] = (held[q.senderId] || 0) + 1; }); allSenders().forEach(s => { left[s.id] = Math.max(0, (Number(s.cap) || 0) - (s.today || 0) - (held[s.id] || 0)); }); return left; }
  const v8allowed = (s, cid) => !(s.allowed && s.allowed.length) || s.allowed.includes(cid);
  function v8senders(cid, left) {
    const camp = S.campaigns[cid]; left = left || v8left(); if (!camp) return { ok: [], ex: { reauth: 0, off: 0, full: 0, scope: 0 }, room: 0 };
    const all = allSenders().filter(s => !s.brandId || s.brandId === camp.brandId), conn = all.filter(s => s.status === 'connected');
    const ok = conn.filter(s => v8allowed(s, cid) && left[s.id] > 0), ex = { reauth: all.filter(s => s.status === 'reauth').length, off: all.filter(s => s.status === 'off').length, full: conn.filter(s => v8allowed(s, cid) && !(left[s.id] > 0)).length, scope: conn.filter(s => !v8allowed(s, cid)).length };
    return { ok, ex, room: ok.reduce((n, s) => n + left[s.id], 0) };
  }
  function v8distribute(rows) {
    const out = [], left = v8left(), idx = {};
    rows.forEach(r => { if (r.r) { out.push(r); return; } const ok = v8senders(r.cid, left).ok; let slot = null; for (let k = 0; k < ok.length && !slot; k++) { const s = ok[((idx[r.cid] || 0) + k) % ok.length]; if (left[s.id] > 0) { slot = s; idx[r.cid] = ((idx[r.cid] || 0) + k + 1) % ok.length; } }
      if (slot) { left[slot.id]--; out.push(Object.assign({}, r, { senderId: slot.id })); } else out.push(Object.assign({}, r, { r: '배정 가능한 발신 계정 없음 (잔여량·허용 캠페인)' })); });
    return out;
  }
  /* 검수 지문: 저장·초안은 이 지문에 묶이고, 관련 편집이 있으면 자동으로 무효 */
  const v8propFp = () => { const v = V8(); return JSON.stringify([...v.camps].sort().map(cid => { const p = v.prop[cid] || {}; return [cid, p.subject, p.body, !!p.ok]; })); };
  const v8fullFp = () => { const v = V8(); return JSON.stringify([v8propFp(), [...new Set(selOf('v8'))].sort().map(id => [id, v.assign[id] || ''])]); };
  const v8saved = () => { const v = V8(); return !!(v.saved && v.savedFp === v8propFp()); };
  const v8drafted = () => { const v = V8(); return !!(v.draftSaved && v.batch && v.batch.fp === v8fullFp()); };
  /* 단계 s로 들어가기 전 다시 검사. 빈 문자열이면 통과 */
  function v8gate(s) {
    const v = V8();
    if (s >= 2) { if (!v.camps.length) return '캠페인을 하나 이상 골라 주세요.'; const bad = v.camps.filter(cid => !S.campaigns[cid] || !campOpen(S.campaigns[cid])); if (bad.length) return '선택한 캠페인 중 없거나 모집이 닫힌 것이 있어요. 1단계에서 다시 골라 주세요.'; }
    if (s >= 3) { const bad = v.camps.filter(cid => { const p = v.prop[cid]; return !p || !p.ok || !String(p.subject || '').trim() || !String(p.body || '').trim(); }); if (bad.length) return `확인 체크·제목·본문이 빠진 제안이 있어요: ${bad.map(c => S.campaigns[c].name).join(', ')}`; if (!v8saved()) return '제안이 바뀌었거나 아직 저장 전이에요. 2단계에서 ‘확인한 제안 저장’을 다시 눌러 주세요.'; }
    if (s >= 4 && !v8plan().some(r => !r.r)) return '배정 가능한 대상이 없어요. 대상을 고르거나 제외 사유를 확인해 주세요.';
    if (s >= 5 && !v8distribute(v8plan()).some(d => !d.r)) return '배정 가능한 발신 계정이 없어요. 재연결·중지·잔여량·허용 캠페인을 확인해 주세요.';
    return '';
  }
  RENDER['a-recruit'] = () => {
    const v = V8(), t = tabs6('rc8', [['start', '모집 시작'], ['repeat', '반복 모집'], ['log', '발송 내역'], ['contacts', '크리에이터·메일'], ['perf', '회신·성과'], ['test', '테스트 발송'], ['approve', '브랜드 승인·커뮤니티'], ['settings', '브랜드·메일 설정']], 'start');
    let body = '';
    if (t.cur === 'start') {
      const steps = ['브랜드 선택', '제안 확인', '대상 찾기', '메일 나누기', '최종 확인']; const doneBatch = v.batch && v.approvedBatch === v.batch.id && v8drafted(); while (!doneBatch && (v.step || 1) > 1 && v8gate(v.step)) v.step--;  /* 승인 직후에는 같은 묶음 결과를 5단계에 그대로 보여 줌 */ const st = v.step || 1;
      let inner = '';
      if (st === 1) inner = `<p class="v6-sec-sub">여러 브랜드의 제품 연결 캠페인을 함께 고를 수 있어요.</p>${Object.values(S.brands).map(br => { const cs = camps(br.id).filter(campOpen); return cs.length ? `<fieldset class="v6-fs v8-group"><legend>${e(br.name)}</legend><div class="v8-pick">${cs.map(c => `<label class="v8-pickrow"><input type="checkbox" data-v8camp="${c.id}" ${v.camps.includes(c.id) ? 'checked' : ''}>${pimg(S.products[c.productId], 40)}<span class="v6-grow"><b>${e(c.name)}</b><span class="v6-meta">${e((S.products[c.productId] || {}).name || '')} · ${e(rewardKind(c))} · ${ctryText(c.countries)}</span></span></label>`).join('')}</div></fieldset>` : ''; }).join('')}`;
      if (st === 2) inner = v.camps.map(cid => { const c = S.campaigns[cid], p = S.products[c.productId], pr = propOf(cid), base = `mail.v8.prop.${cid}`; return `<section class="v8-prop">${condSummary(c)}<dl class="v6-kv v8-kv"><dt>재고(샘플)</dt><dd>${e(c.affiliate.sampleQty || '—')}개</dd><dt>배송</dt><dd>${e(c.affiliate.shipping)} · ${ctryText(c.countries)}</dd><dt>신청 링크</dt><dd class="v6-wrap">${e(applyUrl(c))}</dd></dl>
          <div class="v6-form">${inp('메일 제목', base + '.subject', { req: true, wide: true })}${inp('메일 본문', base + '.body', { req: true, area: true, wide: true, hint: '개인화: {{name}} {{reason}} {{brand}} {{product}} · 신청 링크는 브랜드별로 자동으로 붙어요' })}${inp('담당자 메모', base + '.memo', { opt: true })}${inp('미확정 조건', base + '.open', { opt: true, hint: '예: 재고 수량 확인 중' })}
          <div class="v6-field v6-wide"><label class="v6-inline"><input type="checkbox" data-v6chk="${base}.ok" ${pr.ok ? 'checked' : ''}> 제품·보상·재고·배송·콘텐츠·일정을 확인했어요</label></div></div></section>`; }).join('') || '<p class="v6-empty">먼저 1단계에서 캠페인을 골라 주세요.</p>';
      if (st === 3) { const rows = v8plan(); inner = `${compRecipients('', 'v8')}<h3>제안 배정 <span class="v6-count-inline">${rows.filter(r => !r.r).length}명 가능 · ${rows.filter(r => r.r).length}명 제외</span></h3><p class="v6-meta">같은 이메일·알려진 동일인은 이번에 준비한 제안 하나에만 배정해요.</p>
          <ul class="v6-list">${rows.map(r => `<li class="v6-row"><div class="v6-grow"><b>${e(r.c ? r.c.name : r.id)}</b><span class="v6-meta v6-wrap">${e(r.c ? r.c.email : '')} · ${r.c ? CTRY[r.c.country] || '' : ''}</span></div><label class="v6-sr" for="as-${r.id}">배정 제안</label><select id="as-${r.id}" data-v8assign="${r.id}">${v.camps.map(cid => `<option value="${cid}" ${cid === r.cid ? 'selected' : ''}>${e(S.campaigns[cid].name)}</option>`).join('')}</select>${chip2(r.r || '배정 가능', r.r ? 'err' : 'ok')}</li>`).join('') || '<li class="v6-empty">위에서 대상을 골라 주세요.</li>'}</ul>`; }
      if (st === 4) { const dist = v8distribute(v8plan()); inner = `<p class="v6-sec-sub">공용 계정을 고객 브랜드·제품에 맞게 나눠요. 재연결 필요·중지·오늘 설정량을 다 쓴 계정은 빠져요. 설정량은 운영 설정값 예시이고 제공자 한도가 아니에요. 아래 숫자는 200개 가상 확장 예시로 계산했어요 — 2026-10-30 운영 관찰 시점에는 공용 계정 9개 중 새 모집 배정 가능 8개였어요(고정값 아님).</p>
          ${v.camps.map(cid => { const s = v8senders(cid), n = dist.filter(d => d.cid === cid && !d.r).length; return `<div class="v8-alloc"><div class="v6-grow"><b>${e(S.campaigns[cid].name)}</b><span class="v6-meta">200개 가상 확장 예시 기준 · 배정 가능 계정 ${s.ok.length}개 · 오늘 신규 배정 가능 ${s.room}건(설정값 예시) · 제외: 재연결 필요 ${s.ex.reauth} · 중지 ${s.ex.off} · 잔여량 없음(오늘 사용·대기 예약 포함) ${s.ex.full} · 허용 캠페인 아님 ${s.ex.scope}</span></div><span class="chip info">이번 배정 ${n}명</span></div>`; }).join('')}
          <ul class="v6-list">${dist.map(d => `<li class="v6-row"><div class="v6-grow"><b>${e(d.c ? d.c.name : d.id)}</b><span class="v6-meta">${e(S.campaigns[d.cid] ? S.campaigns[d.cid].name : '')}</span></div><span class="v6-meta v6-wrap">${d.r ? '' : e(senderEmail(d.senderId))}</span>${chip2(d.r || '배정', d.r ? 'err' : 'ok')}</li>`).join('')}</ul>`; }
      if (st === 5) { const dist = v8distribute(v8plan()).filter(d => !d.r), pv = dist.find(d => d.id === ui.v8pv) || dist[0];
        inner = `<p>보낼 준비 <b>${dist.length}명</b> · 제안 ${v.camps.length}개</p>${pv ? (() => { const camp = S.campaigns[pv.cid], p = S.products[camp.productId], pr = propOf(pv.cid); return `<div class="v6-field v6-inlinefield"><label for="v8pv">받는 사람 미리보기</label><select id="v8pv" data-v6ui="v8pv">${dist.map(d => `<option value="${d.id}" ${d.id === pv.id ? 'selected' : ''}>${e(d.c.name)}</option>`).join('')}</select></div><div class="v6-mail"><p class="v6-meta v6-wrap">${e(senderEmail(pv.senderId))} → ${e(pv.c.email)}</p><b>${e(v8fill(pr.subject, pv.c, camp, p))}</b>${pimg(p, 72)}<p>${e(v8fill(pr.body, pv.c, camp, p, reasonOf(pv.c)))}</p><p class="v6-meta v6-wrap">신청: ${e(applyUrl(camp))}</p></div>`; })() : '<p class="v6-empty">보낼 사람이 없어요.</p>'}
          <div class="v8-states"><span>${v8drafted() ? '✓ 검수 초안 저장 (현재 내용)' : v.draftSaved ? '! 검수 후 내용이 바뀌어 초안이 무효예요' : '○ 검수 초안 저장'}</span><span>${v8drafted() && v.approvedBatch === v.batch.id ? '✓ 발송 승인 (시안)' : '○ 발송 승인 (시안)'}</span><span class="v8-unk">? 브랜드 신청 페이지의 로그인·가입·신청 흐름 확인 — 미확인 (신규 가입 인증 대기 · TikTok 승인 후 실제 화면에서 검수)</span></div>
          <div class="v6-actions">${btn('검수 초안 저장 (시안)', 'v8-draft')}${btn('발송 승인 (시안)', 'v8-approve', {}, 'pri')}${btn('대기분 중지', 'v8-pause', {}, 'ghost danger')}</div>
          <p class="v6-meta">초안 저장과 발송 승인은 따로예요. 시안에서는 승인해도 로컬 대기열에만 들어가고 실제 메일은 보내지 않아요. ‘메일 서비스 접수’는 받은편지함 도착을 뜻하지 않아요.</p>`; }
      const gate = `<div class="v6-notice v8-gate" role="note"><span><b>운영 관찰 (2026-10-30):</b> 모집 준비는 가능 · 신규 가입 인증은 대기 중이에요. TikTok 승인 후 브랜드 신청 페이지의 가입·신청까지 검수해야 실제 모집을 시작해요. 시안은 연동 완료를 가정하지 않아요.</span></div>`;
      body = gate + `<ol class="v6-steps">${steps.map((l, i) => `<li><button type="button" data-act="v8-step" data-s="${i + 1}" aria-current="${st === i + 1 ? 'step' : 'false'}"${st === i + 1 ? ' class="on"' : ''}>${i + 1}. ${l}</button></li>`).join('')}</ol><section class="v6-sec">${inner}${errOf('v8')}</section>
        <div class="v6-actions v6-bar">${st > 1 ? btn('이전', 'v8-step', { s: st - 1 }) : ''}${st === 2 ? btn('확인한 제안 저장 (시안)', 'v8-saveprop', {}, 'pri') : st < 5 ? btn('다음', 'v8-next', {}, 'pri') : ''}</div>`;
    }
    if (t.cur === 'repeat') { v.newPlan = v.newPlan || { name: '', every: 'weekly', next: '', prepAuto: false, sendAuto: false };
      body = `<p class="v6-sec-sub">반복 계획은 이 브라우저에만 저장돼요. 시안에서는 예약·자동 준비·자동 발송이 실행되지 않아요.</p><div class="v6-form">${inp('계획 이름', 'mail.v8.newPlan.name', { req: true, ph: '예: 매주 스킨케어 신규 모집' })}${sel('주기', 'mail.v8.newPlan.every', [['weekly', '매주'], ['monthly', '매월']])}${inp('다음 준비 날짜 (한국 시간)', 'mail.v8.newPlan.next', { req: true, ph: '2026-11-03' })}
        <div class="v6-field v6-wide"><label class="v6-inline"><input type="checkbox" data-v6chk="mail.v8.newPlan.prepAuto" ${v.newPlan.prepAuto ? 'checked' : ''}> 대상 준비 자동 실행 (운영 기능 — 시안에서는 실행 안 함)</label><label class="v6-inline"><input type="checkbox" data-v6chk="mail.v8.newPlan.sendAuto" ${v.newPlan.sendAuto ? 'checked' : ''}> 발송 자동 실행 (준비와 별도 — 시안에서는 실행 안 함)</label></div></div>${errOf('plan')}
        <div class="v6-actions">${btn('계획 저장 (브라우저)', 'v8-plan', {}, 'pri')}</div><ul class="v6-list">${v.plans.map(pl => `<li class="v6-row"><div class="v6-grow"><b>${e(pl.name)}</b><span class="v6-meta">${pl.every === 'weekly' ? '매주' : '매월'} · 다음 준비 ${e(pl.next)} KST · 준비 자동 ${pl.prepAuto ? '켬' : '끔'} · 발송 자동 ${pl.sendAuto ? '켬' : '끔'}</span></div>${chip2('저장만 됨 (실행 없음)')}</li>`).join('') || '<li class="v6-empty">저장된 반복 계획이 없어요.</li>'}</ul>`; }
    if (t.cur === 'log') body = compLog(null);
    if (t.cur === 'contacts') { const F = [['', '전체 기록'], ['replied', '회신 온 대상'], ['needs', '답장 필요'], ['new', '새 수신'], ['sent', '발송만'], ['draft', '답장 초안'], ['result', '결과 확인']], f = ui.v8f || '', q = (ui.v8q || '').toLowerCase();
      const PG = ['새 연락처', '진행 중', '크리에이터 답변 대기', '내부 확인', '이번 협업 완료', '보류'];
      const people = [...S.mail.replies.map(r => ({ k: r.email, name: r.name, email: r.email, rep: r })), ...S.mail.queue.filter(x => !S.mail.replies.some(r => r.email === x.email)).map(x => ({ k: x.email, name: x.name, email: x.email, q: x }))]
        .filter(x => (!q || (x.name + x.email).toLowerCase().includes(q)) && (!f || (f === 'replied' && x.rep) || (f === 'needs' && x.rep && ['needs', 'question'].includes(x.rep.status) && !x.rep.sent.length) || (f === 'new' && x.rep && !x.rep.assignee) || (f === 'sent' && x.q) || (f === 'draft' && x.rep && x.rep.draft) || (f === 'result' && x.q && x.q.status !== 'queued')));
      body = `<div class="v6-filters"><div class="v6-field"><label for="v8q">통합 검색 (이메일·이름·핸들)</label><input id="v8q" type="text" data-v6ui="v8q" value="${e(ui.v8q || '')}"></div></div><div class="v6-filters" role="group" aria-label="보기">${F.map(([k, l]) => `<button type="button" class="v6-pill" aria-pressed="${f === k}" data-act="v8-f" data-k="${k}">${l}</button>`).join('')}</div>
        <ul class="v6-list">${people.map(x => `<li class="v6-row"><div class="v6-grow"><b>${e(x.name)}</b><span class="v6-meta v6-wrap">${e(x.email)}${x.rep ? ' · 회신: ' + e(x.rep.text) : ' · 발송만'}</span></div><label class="v6-sr" for="pg-${e(x.k)}">진행 상태</label><select id="pg-${e(x.k)}" data-v8pg="${e(x.k)}">${PG.map(s => `<option ${(v.progress[x.k] || '새 연락처') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></li>`).join('') || '<li class="v6-empty">조건에 맞는 사람이 없어요.</li>'}</ul><p class="v6-meta">미연결 수신 대화: ${S.mail.replies.filter(r => !S.campaigns[r.campaignId]).length}건</p>`; }
    if (t.cur === 'perf') body = `<div class="v6-table" role="table"><div class="v6-tr v6-th" role="row"><span role="columnheader">제품 제안</span><span role="columnheader">대기·접수</span><span role="columnheader">반송·결과 모름</span><span role="columnheader">긍정·질문</span><span role="columnheader">거절·수신 거부</span></div>${Object.values(S.campaigns).map(c => { const q = S.mail.queue.filter(x => x.campaignId === c.id), r = S.mail.replies.filter(x => x.campaignId === c.id); return `<div class="v6-tr" role="row"><span role="cell" class="v6-cellmain">${pimg(S.products[c.productId], 32)}<span><b>${e(c.name)}</b><span class="v6-meta">${e(brand(c.brandId).short)}</span></span></span><span role="cell">${q.filter(x => x.status === 'queued' || x.status === 'paused').length} · ${q.filter(x => x.status === 'accepted').length}</span><span role="cell">${q.filter(x => x.status === 'bounced').length} · ${q.filter(x => x.status === 'unknown').length}</span><span role="cell">${r.filter(x => x.status === 'positive').length} · ${r.filter(x => x.status === 'question').length}</span><span role="cell">${r.filter(x => x.status === 'decline').length} · ${r.filter(x => x.status === 'optout').length}</span></div>`; }).join('')}</div><p class="v6-meta">로컬 대기열·회신 기록에서 센 숫자예요. 실제 발송 실적이 아니에요.</p>`;
    if (t.cur === 'test') { const cid = v.camps[0] || (Object.values(S.campaigns).find(campOpen) || {}).id, camp = S.campaigns[cid], p = camp && S.products[camp.productId], pr = cid && propOf(cid), me = { name: '운영자(예시)', email: 'ops@dino.example', cat: '테스트' };
      body = camp ? `<p class="v6-sec-sub">테스트 발송은 시안에서 미리보기만 만들어요. 실제 메일은 보내지 않아요.</p><div class="v6-mail"><p class="v6-meta v6-wrap">테스트 받는 주소: ${e(me.email)}</p><b>${e(v8fill(pr.subject, me, camp, p))}</b>${pimg(p, 64)}<p>${e(v8fill(pr.body, me, camp, p, '테스트로'))}</p></div>` : '<p class="v6-empty">모집 중인 캠페인이 없어요.</p>'; }
    if (t.cur === 'approve') body = `<ul class="v6-list">${Object.values(S.brands).map(br => `<li class="v6-row"><div class="v6-grow"><b>${e(br.name)}</b><span class="v6-meta">${e(br.status)} · 커뮤니티 채널 ${Object.values(S.channels).filter(c => c.brandId === br.id && !c.archived).length}개 · 모집 중 캠페인 ${camps(br.id).filter(campOpen).length}개</span></div>${btn('브랜드 콘솔', 'v6-console', { b: br.id })}</li>`).join('')}</ul>`;
    if (t.cur === 'settings') body = `<ul class="v6-list">${Object.values(S.brands).map(br => { const n = allSenders().filter(s => s.brandId === br.id && s.status === 'connected').length; return `<li class="v6-row"><div class="v6-grow"><b>${e(br.name)}</b><span class="v6-meta v6-wrap">신청 링크: https://app.example/apply/${e(br.id)} (예시) · 연결 가능 발신 계정 ${n}개 (가상 예시)</span></div></li>`; }).join('')}</ul>`;
    return `<div class="v6"><div class="v6-head"><div class="v6-head-t"><h1>디노 공용 모집 ${b('B06', { noId: true })}</h1><p class="v6-sub">현재 운영 메뉴 구성(모집 시작 5단계와 보조 탭)을 따른 로컬 시연이에요. 실제 저장·승인·메일 발송은 하지 않아요.</p></div></div>${t.html}<div class="v6-tabbody">${body}</div></div>`;
  };
  document.addEventListener('change', ev => { const t = ev.target, d = t.dataset || {};
    if (d.v8camp) { const v = V8(), i = v.camps.indexOf(d.v8camp); if (t.checked && i < 0) v.camps.push(d.v8camp); if (!t.checked && i >= 0) v.camps.splice(i, 1); save(); render(); }
    if (d.v8assign) { V8().assign[d.v8assign] = t.value; save(); render(); }
    if (d.v8pg) { V8().progress[d.v8pg] = t.value; save(); } });
  const v8fail = msg => { ui.err.v8 = msg; render(); return true; };
  ACT['v8-step'] = el => { const v = V8(), s = Number(el.dataset.s); ui.err = {}; const g = s > v.step ? v8gate(s) : ''; if (g) { v8fail(g); return; } v.step = s; save(); render(); };
  ACT['v8-next'] = () => { const v = V8(); ui.err = {}; const g = v8gate((v.step || 1) + 1); if (g) { v8fail(g); return; } v.step++; save(); render(); };
  ACT['v8-saveprop'] = () => { const v = V8(); ui.err = {}; v.saved = true; v.savedFp = v8propFp(); const g = v8gate(3); if (g) { v.saved = false; v.savedFp = ''; v8fail(g); return; } v.step = 3; save(); render(); toast('확인한 제안을 이 브라우저에 저장했어요 (운영 저장 없음).'); };
  ACT['v8-draft'] = () => { const v = V8(); ui.err = {}; const g = v8gate(5); if (g) { v8fail(g); return; } const n = v8distribute(v8plan()).filter(d => !d.r).length; if (!n) { v8fail('보낼 대상이 0명이라 초안을 저장하지 않았어요.'); return; } if (v8drafted()) { toast('이미 현재 내용으로 검수 초안이 저장돼 있어요.'); return; } v.draftSaved = true; v.batch = { id: uid('bk'), fp: v8fullFp(), n }; save(); render(); toast(`검수 초안을 저장했어요 (로컬 · ${n}명).`); };
  ACT['v8-approve'] = () => { const v = V8(); ui.err = {}; if (!v8drafted()) { v8fail(v.draftSaved ? '검수한 뒤 제안·대상·배정이 바뀌었어요. 검수 초안을 다시 저장해 주세요.' : '검수 초안을 먼저 저장해 주세요. 초안 저장과 발송 승인은 따로예요.'); return; } if (v.approvedBatch === v.batch.id) { v8fail('이 검수 초안은 이미 승인했어요. 같은 묶음을 다시 승인할 수 없어요.'); return; } const g = v8gate(5); if (g) { v8fail(g); return; }
    const dist = v8distribute(v8plan()).filter(d => !d.r); if (!dist.length) { v8fail('보낼 대상이 0명이에요.'); return; }
    dist.forEach(d => S.mail.queue.push({ id: uid('q'), batchId: v.batch.id, brandId: S.campaigns[d.cid].brandId, campaignId: d.cid, senderId: d.senderId, name: d.c.name, email: d.c.email, personId: d.c.personId || '', status: 'queued' })); v.approvedBatch = v.batch.id; v.approved = true; save(); render(); toast(`${dist.length}건을 로컬 대기열에 넣었어요 (묶음 ${v.batch.id} · 시안 · 실제 발송 없음).`); };
  ACT['v8-pause'] = () => { const v = V8(), bid = v.approvedBatch; let n = 0; if (bid) S.mail.queue.forEach(q => { if (q.batchId === bid && q.status === 'queued') { q.status = 'paused'; n++; } }); save(); render(); toast(bid ? `이번 모집 묶음의 대기 ${n}건만 중지했어요 (로컬 · 다른 발송 건은 그대로).` : '승인한 모집 묶음이 없어요.'); };
  ACT['v8-f'] = el => { ui.v8f = el.dataset.k; render(); };
  ACT['v8-plan'] = () => { const v = V8(), n = v.newPlan; ui.err = {}; if (!n.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(n.next)) { ui.err.plan = '계획 이름과 다음 준비 날짜(YYYY-MM-DD)를 적어 주세요.'; render(); return; } v.plans.push(Object.assign({}, n)); v.newPlan = null; save(); render(); toast('반복 계획을 브라우저에 저장했어요. 자동 실행은 없어요.'); };

  /* Gmail 운영: 현재 운영 관찰(시점값)과 200개 가상 확장 예시를 분리 */
  const v6Conn = RENDER['a-connections'];
  RENDER['a-connections'] = () => v6Conn().replace('<div class="v6-stats">', `<section class="v8-observe" aria-labelledby="v8-obs-h"><h2 id="v8-obs-h">현재 운영 관찰 <span class="v6-count-inline">2026-10-30 · 읽기 전용 화면 확인</span></h2>
      <ul class="v8-obs"><li><b>공용 계정 9개</b><span class="v6-meta">그중 1개 토큰 갱신 오류 · 수신 동기화 약 9일 지연</span></li><li><b>새 모집 배정 가능 8개</b><span class="v6-meta">오류 계정 제외</span></li><li><b>데모 브랜드 계정 1개</b><span class="v6-meta">공용 계정과 별도</span></li></ul>
      <p class="v6-meta">관찰 시점의 상태예요. 실적·보장 한도·제공자 최대치가 아니며, 이 시안은 운영 화면과 연동하지 않아요.</p></section>
      <h2 class="v8-h2">200개 가상 확장 예시 <span class="v6-count-inline">실계정 아님 · 운영 한도는 설정값 예시</span></h2><div class="v6-stats">`);
  /* ---------------- 링크 파라미터 ---------------- */
  try {
    const qp = new URLSearchParams(location.search), r = qp.get('role'), m = qp.get('mode'), sc = qp.get('screen');
    if (!IS_PRODUCTS && (r || m || sc)) {
      if (['brand', 'creator', 'admin'].includes(r)) view.role = r;
      if (m === 'current' || m === 'proposal') view.mode = m;
      if (sc && view.mode === 'proposal' && typeof findMenu === 'function' && findMenu(view.role, sc)) view.screen[view.role] = sc;
      saveView();
    }
    const jump = qp.get('goto');
    if (!IS_PRODUCTS && jump && COV[jump] && qp.get('gotomode') !== 'current') {
      const target = COV[jump]; view.role = target.proposalRole; view.mode = 'proposal'; view.screen[target.proposalRole] = target.screen; saveView();
    }
  } catch (x) { /* 무시 */ }
  function syncUrl() {
    if (IS_PRODUCTS || !history.replaceState) return;
    try {
      const u = new URL(location.href); u.searchParams.set('role', view.role); u.searchParams.set('mode', view.mode);
      if (view.mode === 'proposal') u.searchParams.set('screen', view.screen[view.role]); else u.searchParams.delete('screen');
      ['goto', 'gotomode'].forEach(k => u.searchParams.delete(k));
      if (u.searchParams.get('camp') && !(view.role === 'creator' && view.screen.creator === 'c-campaigns')) u.searchParams.delete('camp');
      if (u.href !== location.href) history.replaceState(null, '', u.href);
    } catch (x) { /* 무시 */ }
  }
  try { const qp = new URLSearchParams(location.search); const c = qp.get('camp'); if (c && S.campaigns[c] && !IS_PRODUCTS) { ui.cCampSel = c; S.creatorBrand = S.campaigns[c].brandId; view.role = 'creator'; view.mode = 'proposal'; view.screen.creator = 'c-campaigns'; } } catch (x) { /* 무시 */ }

  /* ---------------- render 감싸기 (포커스·커서 유지 + 프레임 후처리) ---------------- */
  const baseRender = render;
  render = function () {
    const a = document.activeElement, id = a && a.id, s = a && 'selectionStart' in a ? (() => { try { return a.selectionStart; } catch (x) { return null; } })() : null;
    baseRender.apply(this, arguments);
    if (view.mode === 'proposal') decorateFrame();
    syncUrl();
    if (id) { const n = document.getElementById(id); if (n && n !== document.activeElement && /INPUT|TEXTAREA|SELECT/.test(n.tagName) && !document.querySelector('#rv-layer:not([hidden]), #pd-sheet:not([hidden])')) { n.focus({ preventScroll: true }); if (s != null && n.setSelectionRange && n.type !== 'number' && n.type !== 'checkbox') try { n.setSelectionRange(s, s); } catch (x) { /* 무시 */ } } }
  };
  COVERAGE.items.forEach(it => { const f = findMenu(it.proposalRole, it.screen); if (f) it.screenLabel = f.m.screens.length > 1 ? `${f.m.label} › ${f.sub}` : f.m.label; });
  save();
  render();
})();
