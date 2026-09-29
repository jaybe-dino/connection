import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@connection/ui";
import { adminApi } from "../adminApi";

/** 후보 풀 — 운영자 수동/CSV 등록·미리보기·현황.
 *  이메일은 형식 검사만으로 '검증'이 되지 않는다: 등록분은 전부
 *  미검증(none)으로 저장되고 추천 화면에도 미검증으로 표시된다.
 *  실존하지 않는 인물/임의 이메일을 등록하면 안 된다. */
const TEMPLATE =
  "handle,email,country,platform,category,product_tags,followers\n" +
  "beauty.creator,creator@example.com,TH,tiktok,beauty;skincare,serum;ampoule,12000";

export default function Pool() {
  const [status, setStatus] = useState<any>(null);
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadStatus = () => adminApi.poolStatus().then(setStatus).catch((e) => setErr(String(e?.message || e)));
  useEffect(() => { void loadStatus(); }, []);

  const doPreview = async () => {
    setBusy(true); setErr(""); setResult(null);
    try { setPreview(await adminApi.poolPreview(csv)); }
    catch (e: any) { setPreview(null); setErr(e?.message || "미리보기 실패"); }
    finally { setBusy(false); }
  };
  const doImport = async () => {
    if (!preview || preview.counts?.insert === 0) return;
    setBusy(true); setErr("");
    try {
      const r = await adminApi.poolImport(csv);
      setResult(r); setPreview(null); setCsv("");
      await loadStatus();
    } catch (e: any) { setErr(e?.message || "등록 실패"); }
    finally { setBusy(false); }
  };

  const ex = status?.exclusions || {};
  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>후보 풀</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>
        공개 비즈니스 연락처 기반 후보만 등록하세요. 등록 이메일은 전부 <b>미검증</b>으로
        저장되며(형식 검사 ≠ 검증), 발송 전 확인이 필요합니다. 수신거부 이력은 보존됩니다.
      </div>
      {err && <div role="alert" style={{ color: "var(--c500)", marginTop: 8 }}>{err}</div>}

      <SectionTitle>현황</SectionTitle>
      <Card>
        {!status ? "불러오는 중…" : (
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>
            전체 후보 <b>{status.total}</b>명 · 추천 가능 <b>{status.recommendable}</b>명
            (검증 이메일 {status.verifiedEmail} · 미검증 {status.unverifiedEmail})
            <br />제외: 이메일 없음 {ex.noEmail} · 검증 실패(risky) {ex.riskyEmail} ·
            제외 상태 {ex.excludedState} · 수신거부 이메일 {ex.optedOutEmails}
            <br />국가별: {(status.byCountry || []).map((c: any) => `${c.country} ${c.count}`).join(" · ") || "—"}
            <div style={{ color: "var(--n500)", marginTop: 4 }}>{status.note}</div>
          </div>
        )}
        <button onClick={() => void loadStatus()} style={{ marginTop: 8 }}>새로고침</button>
      </Card>

      <SectionTitle>CSV 등록 (헤더 필수 · 최대 500행/256KB)</SectionTitle>
      <Card>
        <div style={{ fontSize: 12, color: "var(--n500)", marginBottom: 6 }}>
          컬럼: handle(필수) · email · country(ISO2) · platform(tiktok/instagram/youtube/manual) ·
          category · product_tags(구분자 ; ) · followers · display_name · lang · bio.
          수식 문자(= @ + -)로 시작하는 값은 거부됩니다.
        </div>
        <textarea value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }}
          rows={8} placeholder={TEMPLATE}
          style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace", fontSize: 12 }} />
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <button onClick={() => void doPreview()} disabled={busy || !csv.trim()}>
            {busy ? "처리 중…" : "미리보기 (저장 안 함)"}
          </button>
          <button onClick={() => void doImport()} disabled={busy || !preview || (preview.counts?.insert ?? 0) === 0}>
            {preview ? `등록 실행 (${preview.counts?.insert ?? 0}명)` : "먼저 미리보기"}
          </button>
        </div>
        {preview && (
          <div style={{ marginTop: 10, fontSize: 12 }}>
            <b>미리보기</b> — 등록 {preview.counts.insert} · 건너뜀 {preview.counts.skip} · 오류 {preview.counts.error}
            <div style={{ color: "var(--n500)" }}>{preview.note}</div>
            <table style={{ width: "100%", marginTop: 6, borderCollapse: "collapse" }}>
              <tbody>
                {(preview.rows || []).slice(0, 50).map((r: any) => (
                  <tr key={r.line} style={{ borderTop: "1px solid var(--n200)" }}>
                    <td style={{ padding: "3px 6px" }}>{r.line}행</td>
                    <td style={{ padding: "3px 6px" }}>
                      {r.action === "insert" ? "등록" : r.action === "skip" ? "건너뜀" : "오류"}
                    </td>
                    <td style={{ padding: "3px 6px", color: r.action === "error" ? "var(--c500)" : undefined }}>
                      {r.action === "insert" && r.preview
                        ? `@${r.preview.handle} · ${r.preview.email ?? "(이메일 없음)"} · ${r.preview.country ?? "?"} · ${r.preview.emailStatus}`
                        : r.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result && (
          <div style={{ marginTop: 10, fontSize: 12 }}>
            ✅ 등록 완료: <b>{result.inserted}</b>명 (건너뜀 {result.counts?.skip} · 오류 {result.counts?.error})
            — 출처와 등록자가 후보 sources에 기록되었습니다.
          </div>
        )}
      </Card>
    </div>
  );
}
