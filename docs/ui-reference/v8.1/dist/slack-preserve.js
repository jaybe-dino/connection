/* v3 Slack형 구조 보존 — live-reference.js 다음(맨 마지막)에 읽는다.
   현재 render()를 감싸서 DOM 후처리만 한다. 데이터·참조·원본 렌더 함수는 바꾸지 않는다. */
(function () {
  const LS_RV = 'slack-preserve-v3:rvMin';
  let thread = null;        // {i} 메시지 스레드 | {info:true} 채널 정보 | null
  let threadReturn = null;  // 닫을 때 포커스 돌려줄 선택자
  let welcomeOpen = false;
  let dmSel = 0;
  let lastScreen = '';
  const localReplies = {};
  const drafts = new Map();
  let lastChannelContext = '';
  const channelContext = () => (document.querySelector('.v2-chhead h1')?.textContent || '').trim();
  const replyKey = i => `${channelContext()}:${i}`;
  function rememberDrafts() {

    document.querySelectorAll('#ch-in,#sp-tin,#sp-dmin').forEach(el => {
      if (el.dataset.spDraft) drafts.set(el.dataset.spDraft, el.value);
    });
  }
  function restoreDrafts(cur) {
    document.querySelectorAll('#ch-in,#sp-tin,#sp-dmin').forEach(el => {
      const context = el.id === 'sp-dmin' ? dmSel : el.id === 'sp-tin' && thread ? replyKey(thread.i) : el.id === 'ch-in' ? channelContext() : '';
      const key = `${view.role}:${cur}:${el.id}:${context}`;
      el.dataset.spDraft = key;

      if (drafts.has(key)) el.value = drafts.get(key);
    });
  }

  /* ---------- 검토 도구: 높이 측정 + 접기 ---------- */
  const bar = document.querySelector('.rv-bar');
  const setRv = () => document.documentElement.style.setProperty('--sp-rv', (bar ? bar.offsetHeight : 0) + 'px');
  if (bar) {
    const row = bar.querySelector('.rv-row');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'rv-seg sp-rv-toggle'; btn.setAttribute('data-act', 'sp-rv');
    row.appendChild(btn);
    if (window.ResizeObserver) new ResizeObserver(setRv).observe(bar);
    window.addEventListener('resize', setRv);
  }
  function applyRvMin(min) {
    document.body.classList.toggle('sp-rv-min', min);
    const t = document.querySelector('.sp-rv-toggle');
    if (t) { t.textContent = min ? '안내 펼치기' : '안내 접기'; t.setAttribute('aria-expanded', String(!min)); }
    setRv();
  }
  applyRvMin(!!lsGet(LS_RV, true));
  ACT['sp-rv'] = () => { const min = !document.body.classList.contains('sp-rv-min'); lsSet(LS_RV, min); applyRvMin(min); };

  /* ---------- 크리에이터 #자유 대화: 평평한 메시지 행 + 고정 입력 + 스레드/정보 패널 ---------- */
  const esc2 = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function msgParts(m) {
    const meta = m.querySelector('p.small.muted');
    const t = meta ? meta.textContent : '';
    const [who, time] = t.split(' · ');
    return { who: (who || '').trim(), time: (time || '').trim() };
  }
  function postChannel(main) {
    const ch = main.querySelector('.v2-ch'); if (!ch) return;
    const nextChannelContext = channelContext();
    if (lastChannelContext && lastChannelContext !== nextChannelContext) { thread = null; threadReturn = null; }
    lastChannelContext = nextChannelContext;
    main.classList.add('sp-chat');
    const head = ch.querySelector('.v2-chhead');
    const note = main.querySelector(':scope > .demo-note');
    if (head && note) head.appendChild(note);
    // 정보 버튼 → 우측 정보 패널
    head && head.querySelectorAll('button[data-demo]').forEach(bn => {
      if (bn.textContent.trim() === '정보') { bn.removeAttribute('data-demo'); bn.setAttribute('data-act', 'sp-info'); bn.setAttribute('aria-expanded', String(!!(thread && thread.info))); }
    });
    // 환영 카드 → 한 줄 안내 + 펼치기
    const msgPanel = ch.querySelector('[data-group="ch"][data-panel="msg"]');
    if (msgPanel) {
      msgPanel.classList.add('sp-msgpanel');
      const card = msgPanel.querySelector('.v2-welcome');
      if (card) {
        const badge = card.querySelector('#hs-C11');
        const line = document.createElement('div');
        line.className = 'sp-welcome';
        line.innerHTML = `<span class="sp-welcome-t">새로 오셨군요 · 첫 행동, 이번 주 기회, 질문 바로가기</span>`;
        if (badge) line.appendChild(badge);
        const tg = document.createElement('button');
        tg.type = 'button'; tg.className = 'btn ghost sp-welcome-btn'; tg.setAttribute('data-act', 'sp-welcome');
        tg.setAttribute('aria-expanded', String(welcomeOpen)); tg.textContent = welcomeOpen ? '접기' : '펼치기';
        line.appendChild(tg);
        card.classList.add('sp-welcome-card');
        const h = card.querySelector('h3'); if (h) h.remove();
        card.hidden = !welcomeOpen;
        card.parentNode.insertBefore(line, card);
      }
      const feed = msgPanel.querySelector('.v2-feed');
      if (feed) {
        feed.querySelectorAll('.msg').forEach((m, i) => {
          const { who } = msgParts(m);
          m.classList.add('sp-msg');
          const av = document.createElement('span'); av.className = 'sp-av'; av.setAttribute('aria-hidden', 'true'); av.textContent = (who || '?').slice(0, 1);
          const body = document.createElement('div'); body.className = 'sp-body';
          while (m.firstChild) body.appendChild(m.firstChild);
          const n = (localReplies[replyKey(i)] || []).length;
          const rb = document.createElement('button');
          rb.type = 'button'; rb.className = 'sp-reply'; rb.setAttribute('data-act', 'sp-thread'); rb.dataset.i = i;
          rb.setAttribute('aria-expanded', String(!!(thread && thread.i === i)));
          rb.textContent = n ? `답글 ${n}개` : '답글';
          body.appendChild(rb);
          m.append(av, body);
          if (thread && thread.i === i) m.classList.add('sp-active');
        });
        requestAnimationFrame(() => { feed.scrollTop = feed.scrollHeight; });
      }
    }
    // 스레드/정보 패널
    if (thread) {
      const aside = document.createElement('aside');
      aside.className = 'sp-thread'; aside.setAttribute('aria-label', thread.info ? '채널 정보' : '스레드');
      if (thread.info) {
        aside.innerHTML = `<div class="sp-thead"><b>채널 정보</b><button type="button" class="xbtn" data-act="sp-close" aria-label="정보 닫기">✕</button></div>
          <div class="sp-tbody"><p><b>${esc2(channelContext())}</b></p><p class="small muted">현재 선택한 브랜드 채널의 대화와 캠페인 정보</p>
          <p class="small">운영 시간: 평일 9–18시</p><p class="small">번역: 내 번역 언어로 함께 표시</p></div>`;
      } else {
        const src = feed2(main)[thread.i];
        const p = src ? msgParts(src) : { who: '', time: '' };
        const text = src ? (src.querySelector('.sp-body p:not(.small)') || {}).textContent || '' : '';
        aside.innerHTML = `<div class="sp-thead"><b>스레드</b><button type="button" class="xbtn" data-act="sp-close" aria-label="스레드 닫기">✕</button></div>
          <div class="sp-tbody"><div class="sp-msg sp-root"><span class="sp-av" aria-hidden="true">${esc2(p.who.slice(0, 1) || '?')}</span><div class="sp-body"><p class="small muted">${esc2(p.who)} · ${esc2(p.time)}</p><p>${esc2(text)}</p></div></div>
          ${(localReplies[replyKey(thread.i)] || []).map(r => `<div class="sp-msg"><span class="sp-av" aria-hidden="true">나</span><div class="sp-body"><p class="small muted">나 · 방금 (시안·전송 안 됨)</p><p>${esc2(r)}</p></div></div>`).join('') || '<p class="small muted">아직 답글이 없어요.</p>'}</div>
          <div class="sp-tcompose"><label class="sr" for="sp-tin">답글 입력</label><textarea id="sp-tin" placeholder="답글 입력 (시안: 전송되지 않아요)"></textarea><button type="button" class="btn pri" data-act="sp-tsend">보내기</button></div>`;
      }
      main.appendChild(aside);
      main.classList.add('sp-has-thread');
    }
  }
  const feed2 = main => Array.from(main.querySelectorAll('.v2-feed .msg'));
  function focusIn(sel) { const el = document.querySelector(sel); if (el) el.focus(); }
  ACT['sp-welcome'] = () => { welcomeOpen = !welcomeOpen; render(); focusIn('[data-act="sp-welcome"]'); };
  ACT['sp-thread'] = el => { const i = Number(el.dataset.i); thread = { i }; threadReturn = `[data-act="sp-thread"][data-i="${i}"]`; render(); focusIn('.sp-thread [data-act="sp-close"]'); };
  ACT['sp-info'] = () => { if (thread && thread.info) { closeThread(); return; } thread = { info: true }; threadReturn = '[data-act="sp-info"]'; render(); focusIn('.sp-thread [data-act="sp-close"]'); };
  function closeThread() { const r = threadReturn; thread = null; threadReturn = null; render(); if (r) focusIn(r); }
  ACT['sp-close'] = closeThread;
  ACT['sp-tsend'] = () => {
    const t = document.getElementById('sp-tin'); const v = t.value.trim();
    if (!v) { t.setAttribute('aria-invalid', 'true'); toast('답글을 입력해 주세요.'); t.focus(); return; }
    t.value = '';
    (localReplies[replyKey(thread.i)] = localReplies[replyKey(thread.i)] || []).push(v);
    render(); toast('시안: 이 화면에만 표시했어요. 실제로 전송되지 않습니다.'); focusIn('#sp-tin');
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && thread && !stack.length && !document.querySelector('.rv-layer:not([hidden]), .pd-sheet:not([hidden])')) { e.preventDefault(); closeThread(); }
  });

  /* ---------- 브랜드 커뮤니티·DM: 대화 탭을 inbox(목록/대화/정보)로 ---------- */
  const DM = [
    { who: '민지(예시)', camp: '예시 제품 A 미국 영상', step: '샘플 받음 → 영상 제출 대기', owner: '지윤(예시)', msgs: [['민지(예시)', '09:40', '샘플 받았어요! 영상은 이번 주에 올릴게요.'], ['FAU 담당(예시)', '09:52', '좋아요! 올리기 전에 검토본을 먼저 보내 주세요.']] },
    { who: 'Jordan(예시)', camp: '예시 제품 A 미국 영상', step: '조건 협의 중', owner: '지윤(예시)', msgs: [['Jordan(예시)', '어제', '고정비는 영상 1개 기준인가요?']] },
  ];
  function postBrandDm(main) {
    const talk = main.querySelector('[data-group="bc"][data-panel="talk"]'); if (!talk) return;
    const list = talk.querySelector('ul.rows'); if (!list) return; // 상태 예시(0건/실패/만료)일 때는 그대로
    const rows = Array.from(list.children);
    rows.forEach((li, i) => {
      li.classList.add('sp-dmrow'); if (i === dmSel) li.classList.add('sp-active');
      li.querySelectorAll('button[data-demo]').forEach(bn => { if (bn.textContent.trim() === '열기') { bn.removeAttribute('data-demo'); bn.setAttribute('data-act', 'sp-dm'); bn.dataset.i = i; bn.setAttribute('aria-pressed', String(i === dmSel)); } });
    });
    const d = DM[dmSel] || DM[0];
    const inbox = document.createElement('div'); inbox.className = 'sp-inbox';
    const colL = document.createElement('div'); colL.className = 'sp-inbox-list'; colL.appendChild(list);
    const colC = document.createElement('div'); colC.className = 'sp-inbox-convo';
    colC.innerHTML = `<div class="sp-thead"><b>${esc2(d.who)}</b><span class="small muted">${esc2(d.camp)}</span></div>
      <div class="sp-convo-feed">${d.msgs.map(([w, t, x]) => `<div class="sp-msg"><span class="sp-av" aria-hidden="true">${esc2(w.slice(0, 1))}</span><div class="sp-body"><p class="small muted">${esc2(w)} · ${esc2(t)}</p><p>${esc2(x)}</p></div></div>`).join('')}</div>
      <div class="sp-tcompose"><label class="sr" for="sp-dmin">답장 입력</label><textarea id="sp-dmin" placeholder="답장 입력 (시안: 전송되지 않아요)"></textarea><button type="button" class="btn pri" data-demo="시안: 실제로 보내지 않아요.">보내기</button></div>`;
    const colR = document.createElement('div'); colR.className = 'sp-inbox-info';
    colR.innerHTML = `<b>선택한 대화</b><dl class="kv small"><dt>협업</dt><dd>${esc2(d.camp)}</dd><dt>단계</dt><dd>${esc2(d.step)}</dd><dt>담당</dt><dd>${esc2(d.owner)}</dd></dl>`;
    inbox.append(colL, colC, colR);
    talk.appendChild(inbox);
    const stateReview = talk.querySelector('.v2-state-review');
    if (stateReview) talk.appendChild(stateReview);
  }
  ACT['sp-dm'] = el => { dmSel = Number(el.dataset.i); render(); activateTab('bc', 'talk'); focusIn(`[data-act="sp-dm"][data-i="${dmSel}"]`); };

  /* ---------- render 감싸기 (현재 render를 잡아서 호출 후 DOM 후처리) ---------- */
  const baseRender = render;
  render = function () {
    rememberDrafts();
    baseRender.apply(this, arguments);
    const proposal = view.mode === 'proposal';
    document.body.classList.toggle('sp-proposal', proposal);
    const cur = view.screen[view.role];
    if (cur !== lastScreen || view.role !== 'creator') { if (cur !== lastScreen) { thread = null; welcomeOpen = false; } lastScreen = cur; }
    if (!proposal) return;
    const main = document.querySelector('.v2-main'); if (!main) return;
    main.querySelectorAll('.demo-note').forEach(n => { n.textContent = '디자인 예시'; });
    if (view.role === 'creator' && cur === 'c-community') postChannel(main);
    if (view.role === 'brand' && cur === 'b-community') postBrandDm(main);
    restoreDrafts(cur);
    setRv();
  };
  const baseSend = ACT['ch-send'];
  ACT['ch-send'] = function () {
    const input = document.getElementById('ch-in');
    const sent = input && input.value.trim();
    const key = input && input.dataset.spDraft;
    baseSend.apply(this, arguments);
    if (sent) {
      if (key) drafts.delete(key);
      const next = document.getElementById('ch-in');
      if (next) next.value = '';
    }
  };
  const flag = document.querySelector('.v2-flag summary');
  if (flag) flag.textContent = '검토용 v4 · 실제 참조 정보 보기';
  render();
})();
