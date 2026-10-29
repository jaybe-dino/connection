/* v8.1 관리자 시안(docs/ui-reference/v8.1)의 공통 마크업 — 아이콘·화면 머리·탭·상태 표시.
   클래스 이름은 시안 생성 CSS(v8-kit.css)와 같다. */
import type { ReactNode } from "react";

const P: Record<string, string> = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  inbox: "M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5",
  flag: "M5 21V4M5 4h12l-2 4 2 4H5",
  scale: "M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  megaphone: "M3 10v4h4l8 4V6l-8 4zM18 9a4 4 0 0 1 0 6",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  plug: "M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 20a5 5 0 0 0-4-5",
  dot: "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
};
export function Icon({ k }: { k: string }) {
  return <svg className="v5-ic " width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={P[k] || P.dot} /></svg>;
}

/** 화면 머리 — 시안 v6-head */
export function Head({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return <div className="v6-head"><div className="v6-head-t"><h1>{title}</h1>{sub ? <p className="v6-sub">{sub}</p> : null}</div>{children}</div>;
}

/** 시안 tabs6 — 탭 목록 + 현재 탭 */
export function Tabs({ label, items, cur, onPick }: { label: string; items: [string, string][]; cur: string; onPick: (k: string) => void }) {
  return <div className="v6-tabs" role="tablist" aria-label={label}>{items.map(([k, l]) =>
    <button key={k} type="button" role="tab" aria-selected={cur === k} className={cur === k ? "on" : undefined} onClick={() => onPick(k)}>{l}</button>)}</div>;
}

export function Chip({ tone, children }: { tone?: "ok" | "warn" | "err" | "info" | ""; children: ReactNode }) {
  return <span className={"chip" + (tone ? " " + tone : "")}>{children}</span>;
}

/** 불러오기 실패는 0건과 다르게 — D07 */
export function LoadError({ what, error, onRetry }: { what: string; error: string; onRetry: () => void }) {
  return <div className="alert err" role="alert"><b>{what}을(를) 불러오지 못했어요.</b> 0건이 아니에요. {error}{" "}
    <button type="button" className="btn" onClick={onRetry}>다시 시도</button></div>;
}
