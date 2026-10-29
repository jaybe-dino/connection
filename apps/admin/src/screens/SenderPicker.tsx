/* 4단계 '메일 나누기' 발신 계정 선택 — 계정 수가 많아도(최대 200개 선택) 찾고 고를 수 있게:
   검색·상태 필터·20개씩 페이지·필터 결과 한 번에 선택(상한 200). 서버(sender_ids max 200)와 같은 상한. */
import { useMemo, useState } from 'react';

export const SENDER_LIMIT = 200;
const PAGE = 20;
type Account = { account_id: string; email: string; state: string; sending_paused?: boolean; available?: number; reserved?: number };
const statusOf = (a: Account) => a.sending_paused ? 'paused' : a.state !== 'connected' ? 'reconnect' : (a.available || 0) > 0 ? 'ok' : 'full';
const LABEL: Record<string, string> = { ok: '신규 배정 가능', full: '오늘 잔여량 없음', paused: '발송 중지', reconnect: '연결 필요' };

export default function SenderPicker({ accounts, selected, onChange, disabled }: { accounts: Account[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const [q, setQ] = useState(''), [st, setSt] = useState(''), [page, setPage] = useState(1);
  const usable = (a: Account) => statusOf(a) === 'ok';
  const list = useMemo(() => accounts.filter(a => (!q || a.email.toLowerCase().includes(q.trim().toLowerCase())) && (!st || statusOf(a) === st)), [accounts, q, st]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE)), cur = Math.min(page, pages), rows = list.slice((cur - 1) * PAGE, cur * PAGE);
  const sel = new Set(selected), full = selected.length >= SENDER_LIMIT;
  const counts = { ok: 0, full: 0, paused: 0, reconnect: 0 } as Record<string, number>; accounts.forEach(a => { counts[statusOf(a)]++; });
  const toggle = (id: string, on: boolean) => onChange(on ? (full ? selected : [...selected, id]) : selected.filter(x => x !== id));
  const addFiltered = () => { const next = [...selected]; for (const a of list) { if (next.length >= SENDER_LIMIT) break; if (usable(a) && !sel.has(a.account_id)) next.push(a.account_id); } onChange(next); };
  const addable = list.filter(a => usable(a) && !sel.has(a.account_id)).length;
  return <div className="v6 v8-senders">
    <div className="v6-stats">{[['전체 계정', accounts.length], ['신규 배정 가능', counts.ok], ['잔여량 없음', counts.full], ['중지', counts.paused], ['연결 필요', counts.reconnect]].map(([l, n]) => <div className="v6-stat" key={l}><span>{l}</span><b>{n}</b></div>)}</div>
    <div className="v6-filters">
      <div className="v6-field"><label htmlFor="sp-q">계정 검색</label><input id="sp-q" type="text" value={q} placeholder="이메일 일부" onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
      <div className="v6-field"><label htmlFor="sp-s">상태</label><select id="sp-s" value={st} onChange={e => { setSt(e.target.value); setPage(1); }}><option value="">전체</option>{Object.entries(LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
    </div>
    <div className="v6-actions">
      <button type="button" className="btn" disabled={disabled || full || !addable} onClick={addFiltered}>검색 결과 중 배정 가능 {Math.min(addable, SENDER_LIMIT - selected.length)}개 선택</button>
      <button type="button" className="btn ghost" disabled={disabled || !selected.length} onClick={() => onChange([])}>선택 모두 해제</button>
      <span className={'v6-meta' + (full ? ' ferr' : '')} aria-live="polite">선택 {selected.length} / 최대 {SENDER_LIMIT}개{full ? ' — 한 번에 200개까지 선택할 수 있어요' : ''}</span>
    </div>
    <p className="v6-meta" aria-live="polite">{list.length}개 중 {list.length ? (cur - 1) * PAGE + 1 : 0}–{Math.min(cur * PAGE, list.length)} · {cur}/{pages}쪽 · 잔여량은 운영 설정값 기준이며 제공자 한도가 아니에요.</p>
    <div className="v6-table v6-senders" role="table" aria-label="발신 계정">
      <div className="v6-tr v6-th" role="row"><span role="columnheader">선택</span><span role="columnheader">계정</span><span role="columnheader">오늘 배정 가능 · 예약</span><span role="columnheader">상태</span></div>
      {rows.map(a => { const s = statusOf(a), on = sel.has(a.account_id); return <div className="v6-tr" role="row" key={a.account_id}>
        <span role="cell"><input type="checkbox" aria-label={a.email + ' 선택'} checked={on} disabled={disabled || (!on && (!usable(a) || full))} onChange={e => toggle(a.account_id, e.target.checked)} /></span>
        <span role="cell" className="v6-wrap"><b>{a.email}</b></span>
        <span role="cell">{(a.available || 0).toLocaleString('ko-KR')} · {a.reserved || 0}</span>
        <span role="cell"><span className={'chip ' + (s === 'ok' ? 'ok' : s === 'full' ? 'warn' : 'err')}>{LABEL[s]}</span></span></div>; })}
      {!rows.length && <div className="v6-empty">조건에 맞는 계정이 없어요.</div>}
    </div>
    <nav className="v6-pager" aria-label="계정 페이지">
      <button type="button" className="btn" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>이전</button>
      {Array.from({ length: pages }, (_, i) => i + 1).filter(n => Math.abs(n - cur) <= 2 || n === 1 || n === pages).map(n => <button key={n} type="button" className="v6-pill" aria-current={n === cur ? 'page' : 'false'} onClick={() => setPage(n)}>{n}</button>)}
      <button type="button" className="btn" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>다음</button>
    </nav>
  </div>;
}
