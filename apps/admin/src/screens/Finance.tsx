/* 대시보드 › 비용·성과 — 서버 집계(/admin/recruitment/metrics) 그대로. 확인되지 않은 값은 '미확인'으로 두고 추정하지 않는다. */
import { useEffect, useState } from "react";
import { adminApi, errText, type AdminBrand } from "../adminApi";
import { Head, LoadError } from "../v8/kit";

const kst = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const n = (v: unknown) => v === null || v === undefined ? "미확인" : Number(v).toLocaleString("ko-KR");
const won = (v: unknown) => v === null || v === undefined ? "미기록" : "₩" + Number(v).toLocaleString("ko-KR");

export default function Finance() {
  const today = new Date(), first = kst(new Date(today.getFullYear(), today.getMonth(), 1)), tomorrow = kst(new Date(today.getTime() + 86400000));
  const [start, setStart] = useState(first), [end, setEnd] = useState(tomorrow), [brand, setBrand] = useState("");
  const [brands, setBrands] = useState<AdminBrand[]>([]), [data, setData] = useState<any>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const load = () => { setBusy(true); setErr(""); adminApi.recruitmentMetrics(start, end, brand).then(setData, (e) => { setData(null); setErr(errText(e)); }).finally(() => setBusy(false)); };
  useEffect(() => { adminApi.brands().then((b) => setBrands(b.filter((x) => !x.demo)), () => setBrands([])); }, []);
  useEffect(load, []);
  const rows: any[] = data ? [{ ...data.total, brandId: "" }, ...data.byBrand] : [];
  const name = (id: string) => id ? (brands.find((b) => b.brandId === id)?.name || id) : "전체";
  return <div className="v6">
    <Head title="비용·성과" sub={`정의: ${start} ~ ${end} 미만(KST) · 발송은 제공자 접수 기준(받은편지함 도착 아님) · 확인되지 않은 값은 ‘미확인’`} />
    <div className="v6-filters">
      <div className="v6-field"><label htmlFor="fi-s">시작일</label><input id="fi-s" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
      <div className="v6-field"><label htmlFor="fi-e">종료일(미포함)</label><input id="fi-e" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      <div className="v6-field"><label htmlFor="fi-b">브랜드</label><select id="fi-b" value={brand} onChange={(e) => setBrand(e.target.value)}><option value="">전체</option>{brands.map((b) => <option key={b.brandId} value={b.brandId}>{b.name}</option>)}</select></div>
      <div className="v6-field"><span className="lab">&nbsp;</span><button type="button" className="btn pri" disabled={busy} onClick={load}>{busy ? "불러오는 중…" : "조회"}</button></div>
    </div>
    {err ? <LoadError what="비용·성과" error={err} onRetry={load} /> : !data ? <p className="v6-meta" role="status">불러오는 중이에요…</p> : <>
      <div className="v6-stats">{[["제공자 접수", n(data.total.providerAcceptedMessages)], ["회신", n(data.total.replyMessages)], ["신청자", n(data.total.uniqueApplicants)], ["조건 확정", n(data.total.confirmedCreators)], ["기록 비용", won(data.total.recordedCostKRW)], ["신청자당 비용", won(data.total.costPerApplicantKRW)]].map(([l, v]) => <div className="v6-stat" key={l}><span>{l}</span><b>{v}</b></div>)}</div>
      <div className="v6-table" role="table" aria-label="브랜드별 성과">
        <div className="v6-tr v6-th" role="row">{["브랜드", "접수·고유 주소", "회신", "신청·참여", "확정·출고·링크", "게시·주문", "비용·매출"].map((h) => <span role="columnheader" key={h}>{h}</span>)}</div>
        {rows.map((r) => <div className="v6-tr" role="row" key={r.brandId || "total"}>
          <span role="cell"><b>{name(r.brandId)}</b></span>
          <span role="cell">{n(r.providerAcceptedMessages)} · {n(r.uniqueContactEmails)}</span>
          <span role="cell">{n(r.replyMessages)} · 고유 {n(r.uniqueReplyEmails)}</span>
          <span role="cell">{n(r.uniqueApplicants)} · {n(r.campaignParticipations)}</span>
          <span role="cell">{n(r.confirmedCreators)} · {n(r.shippedCreators)} · {n(r.contentLinkSubmittedCreators)}</span>
          <span role="cell">{n(r.postedCreators)} · {n(r.orders)}</span>
          <span role="cell">{won(r.recordedCostKRW)} · {won(r.recordedRevenueKRW)}</span></div>)}
        {rows.length === 1 && <div className="v6-empty">이 기간에 브랜드별 기록이 없어요 (불러오기 성공, 0건).</div>}
      </div>
      <p className="v6-meta">반송 {n(data.hardBounceMessages)} · 불만 {n(data.complaintMessages)} · 배달 근거 {n(data.deliveredEvidenceMessages)} · 게시·주문은 연동 전이라 미확인이에요.</p>
      <section className="v6-sec"><h2>검증 가입 사용량(청구 기준)</h2><ul className="v6-list">{(data.verifiedSignupUsage || []).map((u: any) => <li className="v6-row" key={u.brandId}><div className="v6-grow"><b>{name(u.brandId)}</b></div><span>{n(u.n)}명 · {won(u.amount)}</span></li>)}{!(data.verifiedSignupUsage || []).length && <li className="v6-empty">이 기간 검증 가입 사용량이 없어요.</li>}</ul></section>
    </>}
  </div>;
}
