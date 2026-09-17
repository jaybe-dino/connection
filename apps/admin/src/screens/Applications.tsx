import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, SectionTitle } from "@connection/ui";
import { adminApi, type Application } from "../adminApi";

const ANSWER_LABEL: Record<string, string> = {
  brand_one_liner: "한 문장", ideal_creator: "맞는 크리에이터像",
  banned_words: "금지어", sample_criteria: "샘플 기준", voice: "말투",
};

/** 브랜드 신청 승인 — 승인하면 브랜드 생성 + theprlist 학습 답변으로 프로필 v1 발행 */
export default function Applications({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Application[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    adminApi.applications().then(setRows).catch((e) => setError(String(e)));
  useEffect(() => { void load(); }, []);

  const decide = async (id: string, ok: boolean) => {
    setBusy(id);
    try {
      if (ok) { const result = await adminApi.approveApplication(id); setInvitation(result.inviteLink || null); }
      else {
        const reason = prompt("거절 사유 (신청자에게 전달됩니다)") ?? "";
        if (!reason) { setBusy(null); return; }
        await adminApi.rejectApplication(id, reason);
      }
      await load();
      onChange();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>브랜드 신청</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>
        가입 위저드를 마친 브랜드가 여기서 대기합니다. 승인하면 브랜드가 생성되고,
        theprlist 학습 답변이 브랜드 프로필로 저장됩니다. 승인 후 표시되는 초대 링크를 담당자에게 전달하세요.
      </div>
      {invitation && <Card><b>승인 완료 · 계정 초대 링크</b><p>메일은 자동 발송되지 않습니다. 담당자에게 이 링크를 전달하세요 (72시간 유효).</p><input aria-label="계정 초대 링크" readOnly value={invitation} style={{width:"100%"}} onFocus={(e)=>e.target.select()} /></Card>}
      {error && (
        <Card style={{ marginTop: 12, borderColor: "var(--c300)", background: "var(--c50)" }}>
          <span style={{ fontSize: 12, color: "var(--c500)" }}>{error}</span>
        </Card>
      )}
      <SectionTitle>대기 {rows.length}건</SectionTitle>
      {rows.length === 0 && <EmptyState>대기 중인 신청이 없어요</EmptyState>}
      {rows.map((a) => (
        <Card key={a.appId}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontWeight: 900, fontSize: 15 }}>{a.name}</span>
            <Badge color="terra">{a.plan}</Badge>
            <Badge>{a.category || "카테고리 미기재"}</Badge>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--n400)" }}>
              {new Date(a.at).toLocaleString("ko")}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--n600)", lineHeight: 1.8 }}>
            주소 <b style={{ fontFamily: "var(--mono)" }}>{a.slug}</b> ·
            사업자 {a.bizNo || "—"} · 타깃 {a.countries.join("·") || "—"} ·
            사이트 {a.siteUrl || "—"} · 담당 {a.contact || "—"}
          </div>
          {Object.keys(a.answers).length > 0 && (
            <div style={{ marginTop: 8, background: "var(--n50)", borderRadius: 9, padding: "8px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: "var(--n500)", marginBottom: 4 }}>
                브랜드 프로필 확인 내용 (승인 시 프로필 v1로 발행)
              </div>
              {Object.entries(a.answers).map(([k, v]) => (
                <div key={k} style={{ fontSize: 12, padding: "2px 0" }}>
                  <b>{ANSWER_LABEL[k] ?? k}</b> — {v}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button disabled={busy === a.appId} onClick={() => void decide(a.appId, true)}
              style={{ padding: "8px 18px", border: "none", borderRadius: 9, background: "var(--s500)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              승인 — 브랜드 생성
            </button>
            <button disabled={busy === a.appId} onClick={() => void decide(a.appId, false)}
              style={{ padding: "8px 18px", border: "none", borderRadius: 9, background: "var(--c50)", color: "var(--c500)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              거절
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
