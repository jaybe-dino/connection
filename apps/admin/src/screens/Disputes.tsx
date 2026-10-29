import { useEffect, useState } from "react";
import { adminApi, errText, type Dispute } from "../adminApi";
import { Chip, Head, LoadError } from "../v8/kit";

const KIND_LABEL: Record<string, string> = { review: "검수 이의", payout: "정산 불일치", selection: "선정 번복" };

/** 분쟁 심판 — 접수 → 판정. 불러오기·판정 실패는 0건이나 조용한 실패로 보이지 않게 알린다(D07). */
export default function Disputes({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Dispute[] | null>(null), [loadErr, setLoadErr] = useState("");
  const [verdicts, setVerdicts] = useState<Record<string, string>>({}), [errs, setErrs] = useState<Record<string, string>>({}), [busy, setBusy] = useState(""), [done, setDone] = useState("");
  const load = () => { setLoadErr(""); adminApi.disputes().then(setRows, (e) => setLoadErr(errText(e))); };
  useEffect(load, []);
  const resolve = async (id: string) => {
    const v = (verdicts[id] ?? "").trim();
    if (!v) { setErrs((x) => ({ ...x, [id]: "판정문을 근거와 함께 적어 주세요." })); return; }
    setBusy(id); setErrs((x) => ({ ...x, [id]: "" })); setDone("");
    try { await adminApi.resolveDispute(id, v); setVerdicts((x) => ({ ...x, [id]: "" })); setDone("판정을 확정했어요. 크리에이터에게 알림이 가요."); await load(); onChange(); }
    catch (e) { setErrs((x) => ({ ...x, [id]: errText(e) })); }
    finally { setBusy(""); }
  };
  return (
    <div className="v6">
      <Head title="분쟁 심판" sub="원 조건(원문 우선)과 원장 기록을 근거로 판정해요. 판정은 크리에이터에게 알림으로 전달돼요." />
      {done && <div className="alert ok" role="status">{done}</div>}
      {loadErr ? <LoadError what="분쟁" error={loadErr} onRetry={load} /> : rows === null ? <p className="v6-meta" role="status">불러오는 중이에요…</p> : <>
        <p className="v6-meta">대기 {rows.length}건 · 판정 기한 순</p>
        <ul className="v6-list">{rows.map((d) => (
          <li className="v6-row v6-editrow" key={d.disputeId}>
            <div className="v6-grow"><Chip tone="warn">{KIND_LABEL[d.kind] ?? d.kind}</Chip> <b>{d.brandId} ↔ {d.creatorId}</b>{d.campaignId && <span className="v6-meta"> · {d.campaignId}</span>}
              <span className="v6-meta"> · 판정 기한 {new Date(d.verdictDue).toLocaleString("ko")}</span><p>주장: {d.claim}</p></div>
            <div className="v6-field v6-wide"><label htmlFor={"vd-" + d.disputeId}>판정문</label><textarea id={"vd-" + d.disputeId} value={verdicts[d.disputeId] ?? ""} maxLength={2000} placeholder="근거와 함께 — 크리에이터에게 알림으로 전달돼요" aria-invalid={!!errs[d.disputeId]} onChange={(e) => setVerdicts((v) => ({ ...v, [d.disputeId]: e.target.value }))} />{errs[d.disputeId] && <span className="ferr" role="alert">{errs[d.disputeId]}</span>}</div>
            <div className="v6-actions"><button type="button" className="btn pri" disabled={busy === d.disputeId} onClick={() => void resolve(d.disputeId)}>{busy === d.disputeId ? "확정 중…" : "판정 확정"}</button></div>
          </li>))}
          {!rows.length && <li className="v6-empty">대기 중인 분쟁이 없어요 (불러오기 성공, 0건).</li>}
        </ul></>}
    </div>
  );
}
