import { useEffect, useState } from "react";
import { Badge, Card, SectionTitle } from "@connection/ui";
import { api, type LedgerEntry } from "@connection/shared/api";

const FALLBACK: LedgerEntry[] = [
  { seq: 3, ts: "", actor: "system", type: "SNS_VERIFIED", subject: "c-mai", payload: {}, hash: "5b7e22aa" },
  { seq: 2, ts: "", actor: "ari:glowlab", type: "GATE_REQUESTED", subject: "PAYOUT ฿4,200", payload: {}, hash: "77aa04c1" },
  { seq: 1, ts: "", actor: "system", type: "SUBSCRIPTION", subject: "Growth ₩790,000", payload: {}, hash: "e3f08c9d" },
];

/** 정산 · 원장 — append-only 해시 체인. API 연결 시 실제 원장을 보여준다. */
export default function Ledger() {
  const [entries, setEntries] = useState<LedgerEntry[]>(FALLBACK);
  const [chainOk, setChainOk] = useState<boolean | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    api
      .ledger()
      .then((r) => {
        setEntries(r.entries);
        setChainOk(r.chain_ok);
        setLive(true);
      })
      .catch(() => setLive(false));
  }, []);

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>정산 · 원장</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>
        append-only — 수정도 삭제도 없어요. 모든 이벤트가 직전 해시를 물고 있어요.
        {!live && " (오프라인 데모 — API 서버를 켜면 실제 원장이 보여요)"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, margin: "16px 0" }}>
        <Card><div style={{ fontSize: 11, color: "var(--n500)" }}>이번 달 구독</div><div style={{ fontSize: 19, fontWeight: 900 }}>₩790,000</div><div style={{ fontSize: 11, color: "var(--n400)" }}>Growth</div></Card>
        <Card><div style={{ fontSize: 11, color: "var(--n500)" }}>검증 가입 과금</div><div style={{ fontSize: 19, fontWeight: 900 }}>₩170,000</div><div style={{ fontSize: 11, color: "var(--n400)" }}>17명 × ₩10,000</div></Card>
        <Card><div style={{ fontSize: 11, color: "var(--n500)" }}>원장 이벤트</div><div style={{ fontSize: 19, fontWeight: 900 }}>{entries.length}건</div><div style={{ fontSize: 11, color: "var(--n400)" }}>{live ? "실시간" : "데모"}</div></Card>
      </div>

      <SectionTitle
        right={
          chainOk === null ? undefined : chainOk
            ? <Badge color="sage">체인 무결성 ✓</Badge>
            : <Badge color="clay">체인 변조 감지!</Badge>
        }
      >
        이벤트
      </SectionTitle>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <tbody>
            {entries.map((e) => (
              <tr key={e.seq} style={{ borderTop: "1px solid var(--n100)" }}>
                <td style={{ padding: "8px 12px", fontFamily: "var(--mono)", color: "var(--n400)", width: 50 }}>#{e.seq}</td>
                <td style={{ padding: "8px 12px", width: 160 }}><Badge>{e.type}</Badge></td>
                <td style={{ padding: "8px 12px", fontWeight: 600 }}>
                  {e.subject.length > 24 ? `${e.subject.slice(0, 12)}…` : e.subject}
                  <span style={{ color: "var(--n400)", fontWeight: 400, marginLeft: 6, fontSize: 11 }}>{e.actor}</span>
                </td>
                <td style={{ padding: "8px 12px", color: "var(--n400)", width: 110, fontSize: 11 }}>
                  {e.ts ? new Date(e.ts).toLocaleString("ko", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                </td>
                <td style={{ padding: "8px 12px", fontFamily: "var(--mono)", color: "var(--n400)", width: 80 }}>{e.hash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
