import { useMemo, useState } from "react";
import { Badge, Card } from "@connection/ui";

/** 브랜드 가입 위저드 — 5단계. 가입이 곧 아리 세팅이다. */
const STEPS = ["계정 · 사업자", "브랜드 프로필", "플랜 선택", "아리 학습", "완료"];

const FIVE_QUESTIONS = [
  { key: "one_liner", q: "브랜드를 한 문장으로 하면?", ph: "예: 민감성 피부를 위한 저자극 선케어" },
  { key: "creator", q: "맞는 크리에이터像은?", ph: "예: 꾸밈없는 리얼 리뷰, 팔로워 수보다 신뢰" },
  { key: "banned", q: "금지어가 있다면?", ph: "예: 미백, 화이트닝 (표시광고법)" },
  { key: "sample", q: "샘플 제공 기준은?", ph: "예: 본품만, 월 30개 한도" },
  { key: "voice", q: "말투·톤은 어때야 하나요?", ph: "예: 존댓말, 친근하지만 과장 없이" },
];

export default function App() {
  const [step, setStep] = useState(0);
  const [bizNo, setBizNo] = useState("");
  const [bizVerified, setBizVerified] = useState(false);
  const [slug, setSlug] = useState("");
  const [countries, setCountries] = useState<string[]>(["TH"]);
  const [plan, setPlan] = useState("growth");
  const [siteUrl, setSiteUrl] = useState("");
  const [learned, setLearned] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const slugOk = useMemo(() => /^[a-z0-9-]{3,20}$/.test(slug) && slug !== "glowlab", [slug]);
  const answersDone = FIVE_QUESTIONS.every((f) => (answers[f.key] ?? "").trim().length > 0);

  const canNext = [
    bizVerified,
    slugOk && countries.length > 0,
    !!plan,
    learned && answersDone, // 학습 없이는 완료 불가
    true,
  ][step];

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 18px 60px" }}>
      <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>커넥션 — 브랜드 가입</div>
      <div style={{ fontSize: 12, color: "var(--n500)", marginBottom: 20 }}>
        가입이 곧 아리 세팅이에요 — 학습 없이는 모집을 시작할 수 없어요
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1 }}>
            <div style={{ height: 4, borderRadius: 2, background: i <= step ? "var(--t500)" : "var(--n200)" }} />
            <div style={{ fontSize: 10, marginTop: 4, fontWeight: 700, color: i <= step ? "var(--n800)" : "var(--n400)" }}>
              {i + 1}. {s}
            </div>
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <Label>사업자등록번호</Label>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={bizNo} onChange={(e) => { setBizNo(e.target.value); setBizVerified(false); }} placeholder="000-00-00000" style={inp} />
            <button
              onClick={() => setBizVerified(bizNo.replace(/\D/g, "").length === 10)}
              style={btnDark}
            >
              국세청 조회
            </button>
          </div>
          {bizVerified && <Badge color="sage">✓ 확인됨 — 담당자 메일 인증 발송</Badge>}
          <div style={{ marginTop: 14, fontSize: 12, color: "var(--n600)", lineHeight: 1.7 }}>
            동의: 약관 + <b>DPA</b>(개인정보 처리 위탁) + 데이터 이용 원칙
            (과금 제외≠차단 · 크리에이터 열람·이의 · 철회 전파)
          </div>
          <label style={{ display: "flex", gap: 6, fontSize: 12, marginTop: 6 }}>
            <input type="checkbox" defaultChecked /> 전체 동의
          </label>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <Label>슬러그 예약 — 주소는 브랜드명 하나</Label>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            <span style={{ color: "var(--n400)" }}>connection.app/</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="yourbrand" style={{ ...inp, flex: 1 }} />
          </div>
          {slug && (
            <div style={{ marginTop: 6 }}>
              {slugOk ? <Badge color="sage">✓ 사용 가능 — 변경은 곤란해요</Badge> : <Badge color="clay">사용 불가 (3~20자 소문자·숫자·하이픈, 중복 제외)</Badge>}
            </div>
          )}
          <Label style={{ marginTop: 16 }}>타깃 국가 (= 번역 언어)</Label>
          <div style={{ display: "flex", gap: 6 }}>
            {["TH", "US", "VN"].map((c) => (
              <button
                key={c}
                onClick={() => setCountries((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c])}
                style={{
                  ...chip,
                  borderColor: countries.includes(c) ? "var(--t500)" : "var(--n200)",
                  background: countries.includes(c) ? "var(--t100)" : "var(--n0)",
                  color: countries.includes(c) ? "var(--t500)" : "var(--n600)",
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <Label style={{ marginTop: 16 }}>카테고리</Label>
          <select style={inp}><option>선케어 · 스킨케어</option><option>메이크업</option><option>헤어 · 바디</option></select>
        </Card>
      )}

      {step === 2 && (
        <div style={{ display: "grid", gap: 8 }}>
          {[
            { id: "starter", name: "Starter", price: "₩290,000/월", desc: "셀 1개 · 아리 L1 · 에이전트 3종 · DB 500명" },
            { id: "growth", name: "Growth", price: "₩790,000/월", desc: "셀 무제한 · 아리 L2 · 에이전트 8종 · DB 무제한 · 전 언어 번역", best: true },
            { id: "enterprise", name: "Enterprise", price: "별도 문의", desc: "멀티 브랜드 · 전용 인프라 · DPA 커스텀 · SLA · 추천 배타권 옵션" },
          ].map((p) => (
            <Card key={p.id} onClick={() => setPlan(p.id)} style={{ borderColor: plan === p.id ? "var(--t500)" : undefined, borderWidth: plan === p.id ? 2 : 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontWeight: 900, fontSize: 15 }}>{p.name}</span>
                {p.best && <Badge color="terra">권장</Badge>}
                <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 13 }}>{p.price}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--n500)", marginTop: 4 }}>{p.desc}</div>
            </Card>
          ))}
          <div style={{ fontSize: 11, color: "var(--n400)" }}>
            공통 과금: 검증 가입 1명 ₩10,000 (일회성) — 두 번째 브랜드 가입도 동일
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: "grid", gap: 10 }}>
          <Card>
            <Label>① 사이트 링크 학습</Label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://yourbrand.com" style={{ ...inp, flex: 1 }} />
              <button onClick={() => setLearned(!!siteUrl)} style={btnDark}>학습 시작</button>
            </div>
            {learned && (
              <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.8, background: "var(--p50)", borderRadius: 10, padding: 12 }}>
                <b>6축 추출 완료 (출처 표기 · 확인·수정 필요)</b><br />
                포지셔닝: 저자극 선케어 <i style={{ color: "var(--n400)" }}>(제품 상세 12건)</i><br />
                고객의 언어: "백탁 없이", "속당김" <i style={{ color: "var(--n400)" }}>(리뷰 340건)</i><br />
                가격대: 2~3만원 · 톤: 차분한 존댓말 <i style={{ color: "var(--n400)" }}>(인스타 90일)</i>
              </div>
            )}
          </Card>
          <Card>
            <Label>② 사이트가 말해주지 않는 5문항</Label>
            {FIVE_QUESTIONS.map((f) => (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>{f.q}</div>
                <input
                  value={answers[f.key] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={inp}
                />
              </div>
            ))}
          </Card>
        </div>
      )}

      {step === 4 && (
        <Card style={{ textAlign: "center", padding: 28 }}>
          <div style={{ fontSize: 40 }}>🎉</div>
          <div style={{ fontWeight: 900, fontSize: 17, margin: "8px 0 4px" }}>
            브랜드 프로필 v1이 만들어졌어요
          </div>
          <div style={{ fontSize: 13, color: "var(--n500)", lineHeight: 1.7 }}>
            connection.app/<b>{slug || "yourbrand"}</b> 예약 완료<br />
            아리가 첫 주 계획을 세웠어요 — 콘솔 브리핑에서 확인하세요
          </div>
          <button style={{ ...btnDark, marginTop: 16, background: "var(--t500)" }}>콘솔로 가기 →</button>
        </Card>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        {step > 0 && step < 4 && (
          <button onClick={() => setStep((s) => s - 1)} style={{ ...btnLight }}>← 이전</button>
        )}
        {step < 4 && (
          <button
            onClick={() => canNext && setStep((s) => s + 1)}
            disabled={!canNext}
            style={{ ...btnDark, marginLeft: "auto", opacity: canNext ? 1 : 0.4, background: "var(--t500)" }}
          >
            {step === 3 ? "학습 완료 · 가입" : "다음 →"}
          </button>
        )}
      </div>
      {step === 3 && !canNext && (
        <div style={{ fontSize: 11, color: "var(--a700)", marginTop: 8, textAlign: "right" }}>
          사이트 학습과 5문항을 모두 마쳐야 가입이 완료돼요
        </div>
      )}
    </div>
  );
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 12, fontWeight: 800, color: "var(--n600)", marginBottom: 6, ...style }}>{children}</div>;
}

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", border: "1px solid var(--n200)",
  borderRadius: 9, fontSize: 13, background: "var(--n50)",
};
const btnDark: React.CSSProperties = {
  padding: "10px 18px", border: "none", borderRadius: 9, background: "var(--n800)",
  color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
};
const btnLight: React.CSSProperties = {
  padding: "10px 18px", border: "1px solid var(--n200)", borderRadius: 9,
  background: "var(--n0)", fontWeight: 700, fontSize: 13, cursor: "pointer",
};
const chip: React.CSSProperties = {
  padding: "6px 16px", borderRadius: 999, fontSize: 13, fontWeight: 800,
  cursor: "pointer", border: "1px solid",
};
