import { useEffect, useState } from "react";
import { adminApi, errText, type HandledReport, type Report } from "../adminApi";
import { Chip, Head, LoadError, Tabs } from "../v8/kit";

const ACTIONS: [string, string, string][] = [
  ["dismiss", "기각", "ghost"],
  ["warn", "경고(기록)", ""],
  ["hide", "메시지 숨김", ""],
  ["suspend_7d", "숨김 + 7일 쓰기 제한", "danger"],
  ["suspend", "숨김 + 쓰기 제한(해제 전까지)", "danger"],
];
const LABEL: Record<string, string> = Object.fromEntries(ACTIONS.map(([k, l]) => [k, l]));

/** 신고 처리함 — 조치가 실제로 적용된다(D05): 숨김은 멤버 화면에서 사라지고, 제한은 작성자 글쓰기를 막는다(기간 만료 시 자동 해제).
 *  불러오기·처리 실패는 0건이나 조용한 실패로 보이지 않게 알린다(D07). */
export default function Reports({ onChange }: { onChange: () => void }) {
  const [tab, setTab] = useState("open");
  const [rows, setRows] = useState<Report[] | null>(null), [handled, setHandled] = useState<HandledReport[] | null>(null);
  const [loadErr, setLoadErr] = useState(""), [actErr, setActErr] = useState<Record<string, string>>({}), [busy, setBusy] = useState(""), [done, setDone] = useState("");
  const load = () => { setLoadErr(""); (tab === "open" ? adminApi.reports().then((r) => setRows(r)) : adminApi.reportsHandled().then((r) => setHandled(r))).catch((e) => setLoadErr(errText(e))); };
  useEffect(load, [tab]);

  const act = async (r: Report, action: string) => {
    if (action !== "dismiss" && action !== "warn" && !confirm(`${LABEL[action]} 조치를 적용할까요? 실제로 메시지가 숨겨지거나 작성자의 글쓰기가 제한돼요.`)) return;
    setBusy(r.reportId); setActErr((v) => ({ ...v, [r.reportId]: "" })); setDone("");
    try {
      const res = await adminApi.actionReport(r.reportId, action);
      const e = res.effect || {};
      setDone(`${LABEL[action]} 적용됨` + (e.hiddenMsgId ? " · 메시지 숨김" : "") + (e.creatorId ? ` · 쓰기 제한 ${e.until ? e.until.slice(0, 16).replace("T", " ") + "까지" : "(해제 전까지)"}` : ""));
      await load(); onChange();
    } catch (e) { setActErr((v) => ({ ...v, [r.reportId]: errText(e) })); }
    finally { setBusy(""); }
  };
  const restore = async (h: HandledReport) => {
    if (!confirm("이 조치를 복구할까요? 숨긴 메시지가 다시 보이고 쓰기 제한이 풀려요.")) return;
    setBusy(h.reportId); setActErr((v) => ({ ...v, [h.reportId]: "" }));
    try { await adminApi.restoreReport(h.reportId); setDone("복구했어요."); await load(); } catch (e) { setActErr((v) => ({ ...v, [h.reportId]: errText(e) })); } finally { setBusy(""); }
  };

  return (
    <div className="v6">
      <Head title="신고 처리함" sub="신고자는 익명으로 처리돼요. 숨김·쓰기 제한은 실제로 적용되고, 복구도 원장에 기록돼요. SLA 심각 24시간 · 일반 72시간." />
      <Tabs label="신고 보기" items={[["open", "대기"], ["handled", "처리한 신고·효과"]]} cur={tab} onPick={setTab} />
      {done && <div className="alert ok" role="status">{done}</div>}
      {loadErr ? <LoadError what="신고" error={loadErr} onRetry={load} /> : tab === "open" ? (
        rows === null ? <p className="v6-meta" role="status">불러오는 중이에요…</p> : <>
          <p className="v6-meta">대기 {rows.length}건 · SLA 순</p>
          <ul className="v6-list">
            {rows.map((r) => { const overdue = new Date(r.slaDue) < new Date(); return (
              <li className="v6-row v6-editrow" key={r.reportId}>
                <div className="v6-grow">
                  <Chip tone={r.severity === "severe" ? "err" : "warn"}>{r.severity === "severe" ? "심각 · 24h" : "일반 · 72h"}</Chip> <Chip>{r.aiClass}</Chip>
                  <span className="v6-meta"> {r.cellId} · SLA {new Date(r.slaDue).toLocaleString("ko")}{overdue ? " · 초과" : ""}</span>
                  {r.msgText ? <p>“{r.msgText}”</p> : <p className="v6-meta">메시지 원문 없음(삭제됐거나 메시지 신고가 아님) — 숨김·제한은 적용할 수 없어요.</p>}
                  {r.detail && <p className="v6-meta">신고 내용: {r.detail}</p>}
                  {actErr[r.reportId] && <p className="ferr" role="alert">처리하지 못했어요: {actErr[r.reportId]}</p>}
                </div>
                <div className="v6-actions">{ACTIONS.map(([a, l, cls]) => <button key={a} type="button" className={"btn " + cls} disabled={busy === r.reportId} onClick={() => void act(r, a)}>{l}</button>)}</div>
              </li>); })}
            {!rows.length && <li className="v6-empty">대기 중인 신고가 없어요 (불러오기 성공, 0건).</li>}
          </ul></>
      ) : (
        handled === null ? <p className="v6-meta" role="status">불러오는 중이에요…</p> :
          <ul className="v6-list">
            {handled.map((h) => (
              <li className="v6-row" key={h.reportId}>
                <div className="v6-grow"><b>{LABEL[h.action] || h.action}</b>
                  <span className="v6-meta"> {h.msgText ? "“" + h.msgText.slice(0, 80) + "”" : "메시지 없음"} · {h.at.slice(0, 16).replace("T", " ")}</span>
                  <p className="v6-meta">효과: {h.hidden ? "숨김 중" : h.effect.hiddenMsgId ? "숨김 해제됨" : "숨김 없음"}{h.effect.sanctionId ? ` · 쓰기 제한 ${h.lifted ? "해제됨" : h.until ? (new Date(h.until) < new Date() ? "기간 만료" : h.until.slice(0, 16).replace("T", " ") + "까지") : "해제 전까지"}` : ""}{h.restoredAt ? ` · 복구 ${h.restoredAt.slice(0, 10)}` : ""}</p>
                  {actErr[h.reportId] && <p className="ferr" role="alert">복구하지 못했어요: {actErr[h.reportId]}</p>}
                </div>
                {h.status === "actioned" && !h.restoredAt && (h.effect.hiddenMsgId || h.effect.sanctionId) ? <button type="button" className="btn" disabled={busy === h.reportId} onClick={() => void restore(h)}>복구</button> : <Chip tone={h.status === "dismissed" ? "" : "ok"}>{h.status === "dismissed" ? "기각" : h.restoredAt ? "복구됨" : "처리됨"}</Chip>}
              </li>))}
            {!handled.length && <li className="v6-empty">처리한 신고가 없어요.</li>}
          </ul>
      )}
    </div>
  );
}
