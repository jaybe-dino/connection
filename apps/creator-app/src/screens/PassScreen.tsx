import { useEffect, useState } from "react";
import { Badge, Card, SectionTitle } from "@connection/ui";
import { LOCALE_LABEL, type Locale } from "@connection/shared";
import { api } from "@connection/shared/api";
import { mockMe } from "@connection/shared/mock";
import { useAppState } from "../state";

/** 내 패스 — 프로필 · 내 정보 관리(본인 수정→콘솔 실시간) · 동의 설정 · 언어(P0) */
export default function PassScreen() {
  const { locale, setLocale } = useAppState();
  const [crossReco, setCrossReco] = useState(false);
  const [fields, setFields] = useState({
    address: "123/45 Sukhumvit Rd, Bangkok",
    phone: "+66 81 234 5678",
    skinType: "복합성 · 민감",
    bank: "PingPong 연결됨",
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    api
      .me(mockMe.id)
      .then((me) => {
        setFields((f) => ({
          address: me.fields.address?.value ?? f.address,
          phone: me.fields.phone?.value ?? f.phone,
          skinType: me.fields.skinType?.value ?? f.skinType,
          bank: me.fields.bank?.value ?? f.bank,
        }));
        setLive(true);
      })
      .catch(() => setLive(false));
  }, []);

  const saveField = (key: string, value: string) => {
    setSavedAt(new Date().toLocaleTimeString("ko", { hour: "2-digit", minute: "2-digit" }));
    if (live) void api.updateField(mockMe.id, key, value).catch(() => {});
  };

  const changeLocale = (l: Locale) => {
    setLocale(l);
    if (live) void api.updateLocale(mockMe.id, l).catch(() => {});
  };

  return (
    <div>
      <Card>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--t100)", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 900, color: "var(--t500)" }}>
            M
          </div>
          <div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontWeight: 900, fontSize: 16 }}>@{mockMe.handle}</span>
              {mockMe.verified && <Badge color="sage">✓ 검증</Badge>}
            </div>
            <div style={{ fontSize: 12, color: "var(--n500)" }}>
              완주율 {Math.round(mockMe.completionRate * 100)}% · {mockMe.grade} · 브랜드 {mockMe.memberships.length}곳
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--n400)" }}>
          기록은 본인 소유예요 — 브랜드가 바뀌어도 따라갑니다
        </div>
      </Card>

      <SectionTitle>언어</SectionTitle>
      <Card>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(Object.keys(LOCALE_LABEL) as Locale[]).map((l) => (
            <button
              key={l}
              onClick={() => changeLocale(l)}
              style={{
                padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: "1px solid", borderColor: locale === l ? "var(--t500)" : "var(--n200)",
                background: locale === l ? "var(--t100)" : "var(--n0)",
                color: locale === l ? "var(--t500)" : "var(--n600)",
              }}
            >
              {LOCALE_LABEL[l]}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--n400)", marginTop: 8 }}>
          IP로 자동 설정된 초기값이에요 — 언제든 바꿀 수 있어요
        </div>
      </Card>

      <SectionTitle right={savedAt && <span style={{ fontSize: 11, color: "var(--s700)" }}>✓ {savedAt} 저장 · 브랜드 DB 실시간 반영</span>}>
        내 정보 관리
      </SectionTitle>
      <Card>
        {(
          [["address", "배송 주소"], ["phone", "연락처"], ["skinType", "피부 타입"], ["bank", "계좌"]] as const
        ).map(([key, label]) => (
          <div key={key} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--n500)", marginBottom: 3 }}>{label}</div>
            <input
              value={fields[key]}
              onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
              onBlur={(e) => saveField(key, e.target.value)}
              style={{ width: "100%", padding: "9px 11px", border: "1px solid var(--n200)", borderRadius: 9, fontSize: 13, background: "var(--n50)" }}
            />
          </div>
        ))}
      </Card>

      <SectionTitle>동의 설정</SectionTitle>
      <Card>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={crossReco} onChange={(e) => setCrossReco(e.target.checked)} style={{ marginTop: 3 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>교차 브랜드 추천 받기</div>
            <div style={{ fontSize: 11, color: "var(--n500)", lineHeight: 1.5 }}>
              담당자 대화로만 · 월 1회 이하 · 같은 카테고리 브랜드는 제외돼요
            </div>
          </div>
        </label>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--n100)", fontSize: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>초대 링크 입장</div>
          <div style={{ color: "var(--n500)", fontSize: 11 }}>
            셀 탐색 기능은 없어요 — 초대 링크로만 새 브랜드에 합류합니다
          </div>
        </div>
      </Card>

      <div style={{ margin: "16px 0", textAlign: "center" }}>
        <button style={{ border: "none", background: "none", fontSize: 11, color: "var(--n400)", cursor: "pointer" }}>
          탈퇴 · 데이터 내보내기 (준비 중 · P1)
        </button>
      </div>
    </div>
  );
}
