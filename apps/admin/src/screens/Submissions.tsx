import { useEffect, useState } from "react";
import { adminApi, errText, type Submission } from "../adminApi";
import { Chip, Head, LoadError } from "../v8/kit";

const TERMS: Record<string, string> = { content_submitted: "브랜드 확인 대기", revision_requested: "브랜드 수정 요청", completed: "브랜드 검수 완료" };

/** 검수 현황 — 크리에이터가 협업에서 제출한 영상(source=collab)도 같은 기록으로 보인다(D03, 버전별).
 *  전사 검수는 기록이며 브랜드 확인·지급을 대신 바꾸지 않는다. 실패는 0건으로 보이지 않게(D07). */
export default function Submissions({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Submission[] | null>(null), [loadErr, setLoadErr] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({}), [busy, setBusy] = useState(""), [done, setDone] = useState("");
  const load = () => { setLoadErr(""); adminApi.submissions().then(setRows, (e) => setLoadErr(errText(e))); };
  useEffect(load, []);
  const review = async (s: Submission, result: "passed" | "needs_fix") => {
    setBusy(s.submissionId); setErrs((x) => ({ ...x, [s.submissionId]: "" })); setDone("");
    try { await adminApi.reviewSubmission(s.submissionId, result); setDone(result === "passed" ? "검수 통과로 기록했어요." : "보완 요청으로 기록했어요."); await load(); onChange(); }
    catch (e) { setErrs((x) => ({ ...x, [s.submissionId]: errText(e) })); }
    finally { setBusy(""); }
  };
  return (
    <div className="v6">
      <Head title="검수 현황" sub="크리에이터 협업 제출과 같은 건을 봐요(제출할 때마다 새 버전). 결과는 통과 / 보완 요청 두 가지이며, 검수 통과는 지급 완료가 아니에요." />
      {done && <div className="alert ok" role="status">{done}</div>}
      {loadErr ? <LoadError what="검수 대기" error={loadErr} onRetry={load} /> : rows === null ? <p className="v6-meta" role="status">불러오는 중이에요…</p> : <>
        <p className="v6-meta">검수 대기 {rows.length}건</p>
        <ul className="v6-list">{rows.map((s) => (
          <li className="v6-row v6-editrow" key={s.submissionId}>
            <div className="v6-grow"><b>@{s.handle}</b> <Chip>{s.campaignName}</Chip> {s.source === "collab" ? <Chip tone="info">협업 제출 v{s.version}</Chip> : <Chip>직접 제출</Chip>}
              {s.termsState && <span className="v6-meta"> · {TERMS[s.termsState] || s.termsState}</span>}
              <span className="v6-meta"> · {new Date(s.at).toLocaleString("ko")}</span>
              <p className="v6-wrap">{/^https:\/\//.test(s.url) ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a> : s.url}</p>
              {s.caption && <p>{s.caption}</p>}
              <div>{s.autoChecks.map((c, i) => <Chip key={c.label + i} tone={c.pass ? "ok" : "warn"}>{c.pass ? "✓" : "!"} {c.label}{c.fix ? ": " + c.fix : ""}</Chip>)}</div>
              {errs[s.submissionId] && <p className="ferr" role="alert">처리하지 못했어요: {errs[s.submissionId]}</p>}
            </div>
            <div className="v6-actions"><button type="button" className="btn pri" disabled={busy === s.submissionId} onClick={() => void review(s, "passed")}>{s.source === "collab" ? "통과로 기록" : "통과 → 정산 대상"}</button>
              <button type="button" className="btn" disabled={busy === s.submissionId} onClick={() => void review(s, "needs_fix")}>보완 요청</button></div>
          </li>))}
          {!rows.length && <li className="v6-empty">검수 대기 제출물이 없어요 (불러오기 성공, 0건).</li>}
        </ul></>}
    </div>
  );
}
