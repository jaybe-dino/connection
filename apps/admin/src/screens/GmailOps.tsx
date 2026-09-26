import { useEffect, useState } from "react";
import { Card } from "@connection/ui";
import { adminApi } from "../adminApi";

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

export default function GmailOps() {
  const [data, setData] = useState<GmailStatus | null>(null);
  const [err, setErr] = useState("");
  const load = () =>
    adminApi.gmailStatus().then((d) => { setData(d); setErr(""); })
      .catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, []);

  const r = data?.runner;
  const runnerOff = !!data && !r?.enabled;
  const jobs = r?.jobs ?? {};

  return (
    <div style={{ maxWidth: 940 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>Gmail 운영</h1>
      <div style={{ fontSize: 12, color: "var(--n500)", marginBottom: 12 }}>
        읽기 전용 상태 화면 — 발송은 브랜드가 승인한 배치만 러너가 웜업 한도 안에서 재개합니다.
        {data?.demoMode ? " (현재 데모 모드: 실제 Google 연동 키 없음)" : ""}
        <button onClick={load} style={{ marginLeft: 10, fontSize: 11, cursor: "pointer" }}>새로고침</button>
      </div>
      {err && <Card style={{ padding: 12, color: "#a33" }}>상태 조회 실패: {err}</Card>}

      {runnerOff && (
        <Card style={{ padding: 12, marginBottom: 12, border: "1px solid #d9534f",
          background: "#fdf2f2", color: "#8a1f1b", fontSize: 13, fontWeight: 700 }}>
          ⚠ 실행기(러너)가 꺼져 있습니다 — 자동 수신 동기화·번역 재시도·월마감·결제 대사가
          전혀 돌지 않습니다. 운영 환경변수 RUNNER_ENABLED=1(또는 GMAIL_OPS_ENABLED=1)로
          켜고, 승인 발송 자동 재개까지 원치 않으면 GMAIL_SEND_RESUME_ENABLED=0을 함께 설정하세요.
        </Card>
      )}
      {data && (
        <Card style={{ padding: 12, marginBottom: 12, fontSize: 12.5 }}>
          <b>실행기</b>: {r?.enabled ? "가동 중" : "꺼짐"} · 마지막 실행{" "}
          {r?.last_tick ? `${r.last_tick.slice(0, 16).replace("T", " ")} UTC (${ago(r.last_tick)})` : "기록 없음"}
          <div style={{ color: "var(--n500)", marginTop: 2 }}>
            아래 카운터·오류는 프로세스 시작
            {r?.countersSince ? `(${r.countersSince.slice(0, 16).replace("T", " ")} UTC)` : ""} 이후
            수치입니다 — 재배포·재시작 시 0부터 다시 셉니다.
          </div>
        </Card>
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

      {(data?.brands ?? []).map((b) => (
        <Card key={b.brandId} style={{ padding: 14, marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>
            {b.brandName} <span style={{ fontSize: 11, color: "var(--n500)" }}>
              {b.brandId}{b.isDemo ? " · 데모" : ""} · 승인 발송 대기 {b.pendingApprovedSends}건
            </span>
          </div>
          {b.accounts.map((a) => (
            <div key={a.email} style={{ borderTop: "1px solid var(--n200)", padding: "8px 0", fontSize: 12.5 }}>
              <b>{a.email}</b> · {a.state}
              {a.sendingPaused ? " · ⏸ 발송 중지" : ` · 오늘 발송 ${a.sentToday}/${a.todayCap} (웜업 ${a.warmupDay}일차)`}
              <div style={{ color: "var(--n500)", marginTop: 2 }}>
                수신: {a.canRead ? (
                  <>
                    읽기 동의 있음 · 마지막 동기화{" "}
                    {a.syncedAt ? `${a.syncedAt.slice(0, 16).replace("T", " ")} (${ago(a.syncedAt)})` : "아직 없음"}
                    {stale(a.syncedAt) && (
                      <b style={{ color: "#a33" }}>
                        {" "}⚠ {a.syncedAt ? "24시간 이상 오래됨" : "동기화 기록 없음"} — 새 답장이 반영되지 않고 있습니다
                      </b>
                    )}
                    {a.syncCursorSet ? " · 이어받기 커서 있음" : ""}
                  </>
                ) : "발송 전용 (읽기 동의 없음 — 동기화 대상 아님)"}
                {a.syncError && <span style={{ color: "#a33" }}> · 오류: {a.syncError}</span>}
                {a.sendingPaused && a.pauseReason && <span> · {a.pauseReason}</span>}
              </div>
            </div>
          ))}
          {!b.accounts.length && <div style={{ fontSize: 12, color: "var(--n500)" }}>연결된 계정 없음</div>}
        </Card>
      ))}
      {data && !data.brands.length && <Card style={{ padding: 14 }}>연결된 Gmail 계정이 없습니다.</Card>}
      {data && <div style={{ fontSize: 11, color: "var(--n400)", marginTop: 8 }}>{data.note}</div>}
    </div>
  );
}
