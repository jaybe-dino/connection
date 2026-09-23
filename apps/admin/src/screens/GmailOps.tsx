import { useEffect, useState } from "react";
import { Card } from "@connection/ui";
import { adminApi } from "../adminApi";

/** Gmail 운영 상태 — 읽기 전용. 브랜드별 계정(발신/수신 권한·웜업·중지)과
 *  동기화 커서/오류, 승인 발송 큐, 러너 잡 상태를 한 화면에서 본다.
 *  여기서는 어떤 발송·동의 변경도 실행하지 않는다. */

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
interface GmailStatus {
  demoMode: boolean; brands: GmailBrand[]; note: string;
  runner: {
    enabled?: boolean; last_tick?: string | null;
    gmailOps?: { synced: number; resumed: number; recentErrors: string[] };
    translation?: { done: number; failed: number; recentErrors: string[] };
    billing?: { closedInvoices: number; recentErrors: string[] };
    reconcile?: { checked: number; settled: number; recentErrors: string[] };
  };
}

export default function GmailOps() {
  const [data, setData] = useState<GmailStatus | null>(null);
  const [err, setErr] = useState("");
  const load = () =>
    adminApi.gmailStatus().then((d) => { setData(d); setErr(""); })
      .catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, []);

  const r = data?.runner;
  const runnerTiles: [string, string][] = [
    ["러너", r?.enabled ? `가동 · 마지막 틱 ${r?.last_tick?.slice(11, 19) ?? "—"}` : "꺼짐 (RUNNER_ENABLED/GMAIL_OPS_ENABLED)"],
    ["수신 동기화", `${r?.gmailOps?.synced ?? 0}회 · 오류 ${r?.gmailOps?.recentErrors?.length ?? 0}`],
    ["승인 발송 재개", `${r?.gmailOps?.resumed ?? 0}건`],
    ["번역 재시도", `완료 ${r?.translation?.done ?? 0} · 포기 ${r?.translation?.failed ?? 0}`],
    ["월마감 청구서", `${r?.billing?.closedInvoices ?? 0}건`],
    ["결제 대사", `확인 ${r?.reconcile?.checked ?? 0} · 확정 ${r?.reconcile?.settled ?? 0}`],
  ];

  return (
    <div style={{ maxWidth: 940 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>Gmail 운영</h1>
      <div style={{ fontSize: 12, color: "var(--n500)", marginBottom: 12 }}>
        읽기 전용 상태 화면 — 발송은 브랜드가 승인한 배치만 러너가 웜업 한도 안에서 재개합니다.
        {data?.demoMode ? " (현재 데모 모드: 실제 Google 연동 키 없음)" : ""}
        <button onClick={load} style={{ marginLeft: 10, fontSize: 11, cursor: "pointer" }}>새로고침</button>
      </div>
      {err && <Card style={{ padding: 12, color: "#a33" }}>상태 조회 실패: {err}</Card>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        {runnerTiles.map(([label, value]) => (
          <Card key={label} style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: "var(--n500)", fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 3 }}>{value}</div>
          </Card>
        ))}
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
                수신: {a.canRead
                  ? `읽기 동의 있음 · 마지막 동기화 ${a.syncedAt ? a.syncedAt.slice(0, 16).replace("T", " ") : "아직 없음"}${a.syncCursorSet ? " · 이어받기 커서 있음" : ""}`
                  : "발송 전용 (읽기 동의 없음 — 동기화 대상 아님)"}
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
