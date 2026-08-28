import { Badge, Card, SectionTitle } from "@connection/ui";

const ENTRIES = [
  { seq: 1042, type: "GATE_EXECUTED", subject: "PAYOUT ฿4,200 · 3건", at: "08-28 10:44", hash: "9f2c…b1" },
  { seq: 1041, type: "GATE_APPROVED", subject: "PAYOUT ฿4,200 · kim", at: "08-28 10:44", hash: "77aa…04" },
  { seq: 1040, type: "JUDGMENT", subject: "@mint.review 적합 0.86", at: "08-28 09:12", hash: "c01d…9e" },
  { seq: 1039, type: "PROFILE_UPDATED", subject: "@beauty.mai 주소 변경", at: "08-28 08:31", hash: "5b7e…22" },
  { seq: 1038, type: "SUBSCRIPTION", subject: "Growth ₩790,000 · 8월", at: "08-28 00:00", hash: "e3f0…8c" },
  { seq: 1037, type: "SIGNUP_FEE", subject: "검증 가입 ₩10,000 · @glow.linh", at: "08-27 22:10", hash: "1a9b…f4" },
];

/** 정산 · 원장 — append-only · 전 이벤트 해시 체인 */
export default function Ledger() {
  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>정산 · 원장</h1>
      <div style={{ fontSize: 12, color: "var(--n500)" }}>
        append-only — 수정도 삭제도 없어요. 모든 이벤트가 직전 해시를 물고 있어요.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, margin: "16px 0" }}>
        <Card><div style={{ fontSize: 11, color: "var(--n500)" }}>이번 달 구독</div><div style={{ fontSize: 19, fontWeight: 900 }}>₩790,000</div><div style={{ fontSize: 11, color: "var(--n400)" }}>Growth</div></Card>
        <Card><div style={{ fontSize: 11, color: "var(--n500)" }}>검증 가입 과금</div><div style={{ fontSize: 19, fontWeight: 900 }}>₩170,000</div><div style={{ fontSize: 11, color: "var(--n400)" }}>17명 × ₩10,000</div></Card>
        <Card><div style={{ fontSize: 11, color: "var(--n500)" }}>크리에이터 지급</div><div style={{ fontSize: 19, fontWeight: 900 }}>฿4,200</div><div style={{ fontSize: 11, color: "var(--n400)" }}>검수 통과 3건</div></Card>
      </div>

      <SectionTitle right={<Badge color="sage">체인 무결성 ✓</Badge>}>이벤트</SectionTitle>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <tbody>
            {ENTRIES.map((e) => (
              <tr key={e.seq} style={{ borderTop: "1px solid var(--n100)" }}>
                <td style={{ padding: "8px 12px", fontFamily: "var(--mono)", color: "var(--n400)", width: 50 }}>#{e.seq}</td>
                <td style={{ padding: "8px 12px", width: 150 }}><Badge>{e.type}</Badge></td>
                <td style={{ padding: "8px 12px", fontWeight: 600 }}>{e.subject}</td>
                <td style={{ padding: "8px 12px", color: "var(--n400)", width: 100 }}>{e.at}</td>
                <td style={{ padding: "8px 12px", fontFamily: "var(--mono)", color: "var(--n400)", width: 80 }}>{e.hash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
