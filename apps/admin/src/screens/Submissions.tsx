import { useEffect, useState } from "react";
import { adminApi, errText, type Submission } from "../adminApi";
import { Chip, Head, LoadError, Tabs } from "../v8/kit";

const TERMS: Record<string, string> = { content_submitted: "브랜드 확인 대기", revision_requested: "브랜드 수정 요청", completed: "브랜드 검수 완료" };
const ST: Record<string, [string, "ok" | "warn" | "err" | "info" | ""]> = { in_review: ["검수 대기", "info"], needs_fix: ["보완 요청", "warn"], passed: ["통과", "ok"], superseded: ["새 버전으로 대체", ""] };
const pair = (s: Submission) => s.campaignId + "|" + s.handle;
const noteOf = (s: Submission) => s.autoChecks.filter((c) => c.label === "브랜드 수정 요청" && c.fix).map((c) => c.fix).join(" · ");
const link = (u: string) => /^https:\/\//.test(u) ? <a href={u} target="_blank" rel="noopener noreferrer">{u}</a> : u;

/** 검수 현황 — 크리에이터가 협업에서 제출한 영상(source=collab)도 같은 기록으로 보인다(D03, 버전별).
 *  이전 버전의 링크·브랜드 수정 요청 메모는 읽기 전용으로 보존돼 보인다(D10). 검수 버튼은 대기 건에만.
 *  전사 검수는 기록이며 브랜드 확인·지급을 대신 바꾸지 않는다. 실패는 0건으로 보이지 않게(D07). */
export default function Submissions({ onChange }: { onChange: () => void }) {
  const [tab, setTab] = useState("wait");
  const [all, setAll] = useState<Submission[] | null>(null), [loadErr, setLoadErr] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({}), [busy, setBusy] = useState(""), [done, setDone] = useState("");
  const load = () => { setLoadErr(""); adminApi.submissions("").then(setAll, (e) => setLoadErr(errText(e))); };
  useEffect(load, []);
  const review = async (s: Submission, result: "passed" | "needs_fix") => {
    setBusy(s.submissionId); setErrs((x) => ({ ...x, [s.submissionId]: "" })); setDone("");
    try { await adminApi.reviewSubmission(s.submissionId, result); setDone(result === "passed" ? "검수 통과로 기록했어요." : "보완 요청으로 기록했어요."); await load(); onChange(); }
    catch (e) { setErrs((x) => ({ ...x, [s.submissionId]: errText(e) })); }
    finally { setBusy(""); }
  };
  const history = (s: Submission) => (all || []).filter((x) => x.source === "collab" && pair(x) === pair(s) && (x.version || 0) < (s.version || 0)).sort((a, b) => (b.version || 0) - (a.version || 0));
  const row = (s: Submission, withHistory: boolean) => {
    const prev = withHistory && s.source === "collab" ? history(s) : [];
    return (
      <li className="v6-row v6-editrow" key={s.submissionId}>
        <div className="v6-grow"><b>@{s.handle}</b> <Chip>{s.campaignName}</Chip> {s.source === "collab" ? <Chip tone="info">협업 제출 v{s.version}</Chip> : <Chip>직접 제출</Chip>} <Chip tone={(ST[s.status] || [s.status, ""])[1]}>{(ST[s.status] || [s.status])[0]}</Chip>
          {s.termsState && <span className="v6-meta"> · {TERMS[s.termsState] || s.termsState}</span>}
          <span className="v6-meta"> · {new Date(s.at).toLocaleString("ko")}{s.reviewedBy ? ` · 처리 ${s.reviewedBy}` : ""}</span>
          <p className="v6-wrap">{link(s.url)}</p>
          {s.caption && <p>{s.caption}</p>}
          <div>{s.autoChecks.map((c, i) => <Chip key={c.label + i} tone={c.pass ? "ok" : "warn"}>{c.pass ? "✓" : "!"} {c.label}{c.fix ? ": " + c.fix : ""}</Chip>)}</div>
          {prev.length > 0 && <details className="a8-history"><summary>이전 제출 {prev.length}건 · 링크·수정 요청 메모 보기</summary>
            <ol>{prev.map((h) => <li key={h.submissionId}><b>v{h.version}</b> <Chip tone={(ST[h.status] || [h.status, ""])[1]}>{(ST[h.status] || [h.status])[0]}</Chip> <span className="v6-meta">{new Date(h.at).toLocaleString("ko")}{h.reviewedBy ? ` · ${h.reviewedBy}` : ""}</span>
              <p className="v6-wrap">{link(h.url)}</p>{noteOf(h) && <p>수정 요청 메모: {noteOf(h)}</p>}</li>)}</ol></details>}
          {errs[s.submissionId] && <p className="ferr" role="alert">처리하지 못했어요: {errs[s.submissionId]}</p>}
        </div>
        {s.status === "in_review" && <div className="v6-actions"><button type="button" className="btn pri" disabled={busy === s.submissionId} onClick={() => void review(s, "passed")}>{s.source === "collab" ? "통과로 기록" : "통과 → 정산 대상"}</button>
          <button type="button" className="btn" disabled={busy === s.submissionId} onClick={() => void review(s, "needs_fix")}>보완 요청</button></div>}
      </li>);
  };
  const waiting = (all || []).filter((s) => s.status === "in_review");
  return (
    <div className="v6">
      <Head title="검수 현황" sub="크리에이터 협업 제출과 같은 건을 봐요(제출할 때마다 새 버전). 이전 버전의 링크와 브랜드 수정 요청 메모도 남아 있어요. 결과는 통과 / 보완 요청 두 가지이며, 검수 통과는 지급 완료가 아니에요." />
      <Tabs label="검수 보기" items={[["wait", "검수 대기"], ["all", "전체 이력(읽기 전용)"]]} cur={tab} onPick={setTab} />
      {done && <div className="alert ok" role="status">{done}</div>}
      {loadErr ? <LoadError what="검수 기록" error={loadErr} onRetry={load} /> : all === null ? <p className="v6-meta" role="status">불러오는 중이에요…</p> : tab === "wait" ? <>
        <p className="v6-meta">검수 대기 {waiting.length}건</p>
        <ul className="v6-list">{waiting.map((s) => row(s, true))}
          {!waiting.length && <li className="v6-empty">검수 대기 제출물이 없어요 (불러오기 성공, 0건).</li>}</ul></> : <>
        <p className="v6-meta">전체 {all.length}건 · 최신순 · 검수 버튼은 대기 건에만 있어요</p>
        <ul className="v6-list">{all.map((s) => row(s, false))}{!all.length && <li className="v6-empty">기록이 없어요.</li>}</ul></>}
    </div>
  );
}
