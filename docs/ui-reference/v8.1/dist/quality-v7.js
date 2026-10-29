/* v7 디자인 품질 — 검토 툴바 접기만 담당한다. campaign-v6.js 다음, 맨 마지막에 읽는다.
   기존 노드를 옮기기만 하므로(복제·재생성 없음) 기존 리스너·id·ResizeObserver는 그대로 동작한다. */
(function () {
  const bar = document.querySelector('.rv-bar'), row = bar && bar.querySelector('.rv-row');
  if (!row || row.querySelector('.v7-rv-toggle')) return;
  const more = document.createElement('div');
  more.id = 'v7-rv-more'; more.className = 'v7-rv-more'; more.setAttribute('role', 'group'); more.setAttribute('aria-label', '검토 도구');
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'v7-rv-toggle'; toggle.setAttribute('aria-controls', 'v7-rv-more'); toggle.setAttribute('aria-expanded', 'false');
  [row.querySelector('.rv-toggle'), row.querySelector('#rv-open-sel'), row.querySelector('.sp-rv-toggle'), row.querySelector('.v5-pagelink')]
    .filter(Boolean).forEach(n => more.appendChild(n));
  bar.querySelectorAll(':scope > .rv-notice').forEach(n => more.appendChild(n));
  row.appendChild(toggle); row.appendChild(more);
  const count = () => { const c = document.getElementById('rv-count'); return c ? c.textContent : '0'; };
  const label = () => { const open = toggle.getAttribute('aria-expanded') === 'true'; toggle.textContent = `검토 도구 · 선택 ${count()} ${open ? '▴' : '▾'}`; };
  const set = open => { toggle.setAttribute('aria-expanded', String(open)); more.classList.toggle('is-open', open); label(); };
  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  bar.addEventListener('keydown', e => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true' && (more.contains(document.activeElement) || document.activeElement === toggle)) { e.stopPropagation(); set(false); toggle.focus(); }
  });
  const rc = document.getElementById('rv-count');
  if (rc && window.MutationObserver) new MutationObserver(label).observe(rc, { childList: true, characterData: true, subtree: true });
  label();

  // 모바일에서 표가 세로 목록으로 바뀌어도 각 값의 의미를 유지한다.
  function labelTableCells() {
    document.querySelectorAll('.v6-table').forEach(table => {
      const heads = Array.from(table.querySelectorAll('.v6-th [role="columnheader"]'), h => h.textContent.trim());
      table.querySelectorAll('.v6-tr:not(.v6-th)').forEach(row => {
        row.querySelectorAll(':scope > [role="cell"]').forEach((cell, i) => {
          if (!i || !heads[i] || cell.querySelector('.v7-cell-label')) return;
          const text = document.createElement('span'); text.className = 'v7-cell-label'; text.textContent = heads[i]; cell.prepend(text);
        });
      });
    });
  }
  const priorRender = render;
  render = function () { const result = priorRender.apply(this, arguments); labelTableCells(); return result; };
  labelTableCells();
})();
