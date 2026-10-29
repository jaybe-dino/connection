import { useEffect, useState } from "react";
import { Card } from "@connection/ui";
import { adminApi, errText } from "../adminApi";
import { Chip, Head, LoadError } from "../v8/kit";

/** Gmail 운영 상태 — 읽기 전용. 실행기(러너)와 잡별 활성/비활성, 브랜드별
 *  계정(발신/수신·웜업·중지)과 동기화 상태를 본다. 어떤 발송·동의 변경도
 *  실행하지 않는다. 카운터는 프로세스 시작 이후 수치다. */

interface GmailAccount {
  email: string; state: string; canRead: boolean; syncedAt: string | null;
  syncError: string; syncCursorSet: boolean; sentToday: number; todayCap: number;
  remainingToday: number; sendingPaused: boolean; pauseReason: string;
  warmupDay: number;
}
interface GmailBrand {
  brandId: string; brandName: string; isDemo: boolean;
  pendingApprovedSends: number; accounts: GmailAccount[];
}
interface Job { enabled: boolean; reason: string; lastRunAt: string | null;
  count: number; recentErrors: string[]; }
interface GmailStatus {
  demoMode: boolean; brands: GmailBrand[]; note: string;
  runner: {
    enabled?: boolean; last_tick?: string | null; countersSince?: string;
    jobs?: Record<string, Job>;
  };
}

const JOB_LABEL: Record<string, string> = {
  sync: "수신 동기화", sendResume: "승인 발송 재개(자동)",
  translation: "번역 재시도", billing: "월마감 청구서", reconcile: "결제 대사",
  autocharge: "카드 자동청구(기본 차단)",
};

function ago(iso: string | null | undefined): string {
  if (!iso) return "기록 없음";
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}분 전`;
  if (h < 48) return `${Math.round(h)}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}
const stale = (iso: string | null | undefined) =>
  !iso || Date.now() - new Date(iso).getTime() > 24 * 3600000;

type Row = { email: string; brandId: string | null; brandName: string; owner: string; status: "connected" | "reauth" | "paused" | "off"; a?: GmailAccount & { owner?: string } };
const ST: Record<Row["status"], [string, "ok" | "warn" | "err" | ""]> = { connected: ["연결됨", "ok"], reauth: ["재연결 필요", "warn"], paused: ["발송 중지", "err"], off: ["연결 전", ""] };
const PAGE = 20;

export default function GmailOps() {
  const [data, setData] = useState<(GmailStatus & { pendingMeta?: { email: string; brandId: string | null; owner: string }[] }) | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState(""), [st, setSt] = useState(""), [brand, setBrand] = useState(""), [page, setPage] = useState(1);
  const [csv, setCsv] = useState(""), [review, setReview] = useState<{ row: number; email: string; brandId: string | null; owner: string; reason: string }[] | null>(null), [csvMsg, setCsvMsg] = useState(""), [csvBusy, setCsvBusy] = useState(false);
  const load = () =>
    adminApi.gmailStatus().then((d) => { setData(d); setErr(""); })
      .catch((e) => setErr(errText(e)));
  useEffect(() => { load(); }, []);

  const r = data?.runner;
  const runnerOff = !!data && !r?.enabled;
  const jobs = r?.jobs ?? {};
  const all: Row[] = data ? [
    ...data.brands.flatMap((b) => b.accounts.map((a: any) => ({ email: a.email, brandId: b.brandId, brandName: b.brandName, owner: a.owner || "", a,
      status: (a.sendingPaused ? "paused" : a.state !== "connected" || a.syncError ? "reauth" : "connected") as Row["status"] }))),
    ...(data.pendingMeta || []).map((m) => ({ email: m.email, brandId: m.brandId, brandName: data.brands.find((b) => b.brandId === m.brandId)?.brandName || m.brandId || "미배정", owner: m.owner, status: "off" as const })),
  ] : [];
  const ql = q.trim().toLowerCase();
  const list = all.filter((x) => (!ql || x.email.toLowerCase().includes(ql) || x.owner.toLowerCase().includes(ql)) && (!st || x.status === st) && (!brand || (brand === "-" ? !x.brandId : x.brandId === brand)));
  const pages = Math.max(1, Math.ceil(list.length / PAGE)), cur = Math.min(page, pages), rows = list.slice((cur - 1) * PAGE, cur * PAGE);
  const brandOpts = data ? Array.from(new Map(data.brands.map((b) => [b.brandId, b.brandName])).entries()) : [];
  const check = async () => { setCsvBusy(true); setCsvMsg(""); try { setReview((await adminApi.gmailMetaPreview(csv)).rows); } catch (e) { setCsvMsg(errText(e)); } finally { setCsvBusy(false); } };
  const register = async () => { setCsvBusy(true); try { const res = await adminApi.gmailMetaRegister(csv); setCsvMsg(`메타데이터 ${res.registered}개를 등록했어요. 연결은 계정마다 소유자가 Google 에서 직접 승인해야 해요.` + (res.skipped.length ? ` (제외 ${res.skipped.length}개)` : "")); setReview(null); setCsv(""); load(); } catch (e) { setCsvMsg(errText(e)); } finally { setCsvBusy(false); } };

  return (
    <div className="v6">
      <Head title="Gmail 운영 · 발신 계정" sub="연결된 실제 계정의 상태예요. 각 계정은 소유자가 Google 에서 직접 승인해야 연결되고, ‘잔여 설정량’은 운영 설정값 기준이며 제공자 한도가 아니에요." />
      {err && <LoadError what="Gmail 상태" error={err} onRetry={load} />}
      {data && <>
        <div className="v6-stats">{([["전체", all.length], ["연결됨", all.filter((x) => x.status === "connected").length], ["재연결 필요", all.filter((x) => x.status === "reauth").length], ["발송 중지", all.filter((x) => x.status === "paused").length], ["연결 전", all.filter((x) => x.status === "off").length]] as [string, number][]).map(([l, n]) => <div className="v6-stat" key={l}><span>{l}</span><b>{n}</b></div>)}</div>
        <div className="v6-filters">
          <div className="v6-field"><label htmlFor="sd-q">계정·담당자 검색</label><input id="sd-q" type="text" value={q} placeholder="이메일 또는 담당자" onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <div className="v6-field"><label htmlFor="sd-s">상태</label><select id="sd-s" value={st} onChange={(e) => { setSt(e.target.value); setPage(1); }}><option value="">전체</option>{Object.entries(ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="v6-field"><label htmlFor="sd-b">소속 브랜드</label><select id="sd-b" value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }}><option value="">전체</option>{brandOpts.map(([id, n]) => <option key={id} value={id}>{n}</option>)}<option value="-">미배정</option></select></div>
        </div>
        <p className="v6-meta" aria-live="polite">{list.length}개 중 {list.length ? (cur - 1) * PAGE + 1 : 0}–{Math.min(cur * PAGE, list.length)} · {cur}/{pages}쪽</p>
        <div className="v6-table v6-senders" role="table" aria-label="발신 계정">
          <div className="v6-tr v6-th" role="row">{["계정", "브랜드", "오늘 접수 / 잔여 설정량", "받기 · 최근 동기화", "담당", "상태"].map((h) => <span role="columnheader" key={h}>{h}</span>)}</div>
          {rows.map((x) => <div className="v6-tr" role="row" key={x.email}>
            <span role="cell" className="v6-wrap"><b>{x.email}</b></span>
            <span role="cell">{x.brandName}</span>
            <span role="cell">{x.a ? `${x.a.sentToday} / ${x.a.remainingToday}` : "—"}</span>
            <span role="cell">{x.a ? <>{x.a.canRead ? "받기 동의" : "받기 미동의"} · {ago(x.a.syncedAt)}{x.a.canRead && stale(x.a.syncedAt) ? " · 24시간 이상 지연" : ""}{x.a.syncError ? <><br /><span className="v6-meta">{x.a.syncError}</span></> : null}{x.a.sendingPaused && x.a.pauseReason ? <><br /><span className="v6-meta">중지: {x.a.pauseReason}</span></> : null}</> : "—"}</span>
            <span role="cell">{x.owner || "—"}</span>
            <span role="cell"><Chip tone={ST[x.status][1]}>{ST[x.status][0]}</Chip></span></div>)}
          {!rows.length && <div className="v6-empty">조건에 맞는 계정이 없어요.</div>}
        </div>
        <nav className="v6-pager" aria-label="페이지"><button type="button" className="btn" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>이전</button>
          {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => Math.abs(n - cur) <= 2 || n === 1 || n === pages).map((n) => <button key={n} type="button" className="v6-pill" aria-current={n === cur ? "page" : "false"} onClick={() => setPage(n)}>{n}</button>)}
          <button type="button" className="btn" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>다음</button></nav>
        <section className="v6-sec"><h2>계정 메타데이터 일괄 등록</h2>
          <div className="v6-field v6-wide"><label htmlFor="sd-csv">CSV 붙여넣기 (이메일,브랜드ID,담당자)</label><textarea id="sd-csv" value={csv} placeholder="sender-201@company.com,goryeo1392,하린" onChange={(e) => { setCsv(e.target.value); setReview(null); }} /><span className="hint">메타데이터만 등록돼요. 연결은 계정마다 소유자 승인이 필요해요.</span></div>
          <div className="v6-actions"><button type="button" className="btn" disabled={csvBusy || !csv.trim()} onClick={() => void check()}>검수</button></div>
          {csvMsg && <p className="v6-meta" role="status">{csvMsg}</p>}
          {review && <><ul className="v6-list">{review.map((x) => <li className="v6-row" key={x.row}><div className="v6-grow v6-wrap"><b>{x.email}</b><span className="v6-meta"> {x.brandId || "미배정"} · {x.owner || "담당자 없음"}</span></div><Chip tone={x.reason ? "err" : "ok"}>{x.reason || "통과"}</Chip></li>)}</ul>
            <div className="v6-actions"><button type="button" className="btn pri" disabled={csvBusy || !review.some((x) => !x.reason)} onClick={() => void register()}>검수 통과 {review.filter((x) => !x.reason).length}개 등록</button></div></>}
        </section>
      </>}
      {data && <section className="v6-sec"><h2>실행기·잡 상태</h2>
      {data && (
        <div className="v6-meta" style={{ marginBottom: 12 }}>
          <b>실행기</b>: {r?.enabled ? "가동 중" : "꺼짐"} · 마지막 실행{" "}
          {r?.last_tick ? `${r.last_tick.slice(0, 16).replace("T", " ")} UTC (${ago(r.last_tick)})` : "기록 없음"}
          <div style={{ color: "var(--n500)", marginTop: 2 }}>
            아래 카운터·오류는 프로세스 시작
            {r?.countersSince ? `(${r.countersSince.slice(0, 16).replace("T", " ")} UTC)` : ""} 이후
            수치입니다 — 재배포·재시작 시 0부터 다시 셉니다.
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        {Object.entries(JOB_LABEL).map(([key, label]) => {
          const j = jobs[key];
          return (
            <Card key={key} style={{ padding: 12,
              opacity: j?.enabled ? 1 : 0.75,
              border: j && !j.enabled ? "1px dashed var(--n400)" : undefined }}>
              <div style={{ fontSize: 11, color: "var(--n500)", fontWeight: 700 }}>
                {label} · {j ? (j.enabled ? "✅ 활성" : "⛔ 비활성") : "—"}
              </div>
              {j && !j.enabled && j.reason && (
                <div style={{ fontSize: 11, color: "#8a6d3b", marginTop: 2 }}>{j.reason}</div>
              )}
              <div style={{ fontSize: 13, fontWeight: 800, marginTop: 3 }}>
                누적 {j?.count ?? 0}건 · 마지막 실행 {ago(j?.lastRunAt)}
              </div>
              {!!j?.recentErrors?.length && (
                <div style={{ fontSize: 10.5, color: "#a33", marginTop: 3 }}>
                  최근 오류: {j.recentErrors.slice(0, 2).join(" · ")}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      </section>}
      {data && <p className="v6-meta">{data.note}{runnerOff ? " · 실행기가 꺼져 있어 수신 동기화·승인 발송 재개가 멈춰 있어요." : ""}</p>}
    </div>
  );
}
