// P0 콘솔 컨텍스트 + 매직링크 E2E — 페르소나별 browser context 격리(localStorage 간섭 차단)
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const API = "http://localhost:8765";
const results = [];
const ok = (n, p, note = "") => results.push(`${p ? "PASS" : "FAIL"} ${n}${note ? " — " + note : ""}`);
const api = (m, p, b, tok) => fetch(API + p, { method: m,
  headers: { "Content-Type": "application/json",
             ...(tok ? { Authorization: "Bearer " + tok } : {}) },
  body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errors = [];
const newPage = async (tag) => {
  const ctx = await browser.newContext();          // 페르소나별 격리 컨텍스트
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(tag + ":" + e));
  return p;
};

// 브랜드 계정 준비(회귀용, 멱등 — 이미 있으면 invite가 실패해도 무시)
try {
  const inv = await api("POST", "/auth/invite", { email: "cmo@glowlab.co", brand_id: "glowlab" });
  if (inv.demoLink) await api("POST", "/auth/accept", { token: inv.demoLink.split("invite=")[1], password: "glowlab-pw-123" });
} catch {}

// ── 관리자: 로그인 → 선택 전 브랜드 API 0건 + 선택 화면 ──
const pa = await newPage("admin");
const brandReqs = [];
pa.on("request", (r) => { if (r.url().includes("/brands/")) brandReqs.push(r.url()); });
await pa.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`);
await pa.waitForTimeout(1000);
ok("로그인 전 브랜드 API 0건(glowlab 기본값 제거)", brandReqs.length === 0, brandReqs[0] || "");
await pa.click("#authChip");
await pa.fill("#axEmail", "admin.ctx@ex.com");
await pa.fill("#axPw", "admin-ctx-pass-1");
await pa.click('button.cbt:text-is("로그인")');
await pa.waitForTimeout(1600);
const t1 = await pa.evaluate(() => document.body.innerText);
ok("관리자 선택 화면 표시", t1.includes("브랜드 선택") && t1.includes("명시적으로 선택"));
ok("선택 전 브랜드 API 0건", brandReqs.length === 0, brandReqs[0] || "");
ok("데모 브랜드 명시 라벨", t1.includes("데모 브랜드") && t1.includes("REALCO"));

// ── glowlab 명시 선택 → 동일 컨텍스트 연결 ──
await pa.click("text=GLOWLAB");
await pa.waitForTimeout(1600);
const t2 = await pa.evaluate(() => document.body.innerText);
ok("컨텍스트 표시(관리자·브랜드·전환)", t2.includes("관리자") && t2.includes("glowlab") && t2.includes("전환"));
ok("선택 후에만 브랜드 API 호출", brandReqs.length > 0 && brandReqs.every((u) => u.includes("/brands/glowlab/")));
await pa.click('button:has-text("아웃리치·인박스")');
await pa.waitForTimeout(1400);
const t3 = await pa.evaluate(() => document.body.innerText);
ok("로고 카드 거짓 안내 없음(관리자도 설정 가능)", !t3.includes("서버에 연결되면") && t3.includes("브랜드 로고"),
  t3.split("\n").find((l) => l.includes("로고")) || "");

// ── 전환 → 선택 화면 복귀 + 신규 브랜드 API 0건 + realco 혼입 없음 ──
brandReqs.length = 0;
await pa.click('button:has-text("전환")');
await pa.waitForTimeout(1000);
const t4 = await pa.evaluate(() => document.body.innerText);
ok("전환 시 선택 화면 복귀", t4.includes("브랜드 선택"));
ok("전환 후 브랜드 API 0건", brandReqs.length === 0, brandReqs[0] || "");
await pa.click("text=REALCO");
await pa.waitForTimeout(1600);
await pa.click('button:has-text("제품·캠페인")');
await pa.waitForTimeout(1200);
const t5 = await pa.evaluate(() => document.body.innerText);
ok("realco 컨텍스트 전환·혼입 없음", t5.includes("realco") && !t5.includes("GLOWLAB 포켓")
  && brandReqs.every((u) => u.includes("/brands/realco/")),
  brandReqs.find((u) => !u.includes("/brands/realco/")) || "");

// ── 크리에이터 계정: 콘솔 업무 차단 ──
const magic = await api("POST", "/auth/magic", { email: "ctx.creator@ex.com" });
const ver = await api("POST", "/auth/magic/verify", { token: magic.demoLink.split("magic=")[1] });
const pc2 = await newPage("creator-console");
const cReqs = [];
pc2.on("request", (r) => { if (r.url().includes("/brands/")) cReqs.push(r.url()); });
await pc2.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`);
await pc2.evaluate((t) => localStorage.setItem("CONNECTION_JWT", t), ver.token);
await pc2.reload();
await pc2.waitForTimeout(1400);
const t6 = await pc2.evaluate(() => document.body.innerText);
ok("크리에이터 콘솔 차단 화면", t6.includes("크리에이터 계정입니다") && t6.includes("크리에이터 앱"));
ok("크리에이터 브랜드 API 0건", cReqs.length === 0, cReqs[0] || "");

// ── 브랜드 계정 회귀: 선택 화면 없이 자기 브랜드 즉시 ──
const pb = await newPage("brand");
await pb.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`);
await pb.waitForTimeout(900);
await pb.click("#authChip");
await pb.fill("#axEmail", "cmo@glowlab.co");
await pb.fill("#axPw", "glowlab-pw-123");
await pb.click('button.cbt:text-is("로그인")');
await pb.waitForTimeout(1600);
const t7 = await pb.evaluate(() => document.body.innerText);
ok("브랜드 계정 즉시 자기 컨텍스트", t7.includes("glowlab") && !t7.includes("브랜드 선택"));

// ── 인박스 더보기: 스레드 8개 시드 후 mail 페이지 ──
const { execSync } = await import("node:child_process");
execSync(`PGUSER=postgres PGPASSWORD=postgres PGHOST=localhost psql -d e2e_c3 -c "INSERT INTO mail_threads (brand_id,creator_email,subject) SELECT 'glowlab','many'||g||'@ex.com','스레드 '||g FROM generate_series(1,8) g ON CONFLICT DO NOTHING;" >/dev/null`);
await pb.click('button:has-text("아웃리치·인박스")');
await pb.waitForTimeout(1600);
let t8 = await pb.evaluate(() => document.body.innerText);
ok("기본 6개 + 더보기 버튼", t8.includes("최근 6 / 전체") && t8.includes("더보기 — 전체"));
await pb.click("text=더보기 — 전체");
await pb.waitForTimeout(800);
t8 = await pb.evaluate(() => document.body.innerText);
ok("전체 표시 + 접기", t8.includes("전체 8개") && t8.includes("many1@ex.com") && t8.includes("many8@ex.com") && t8.includes("접기"));

// ── 매직링크 경로 A: 기존 회원 재로그인 — 콘솔 표면 랜딩 → 소비 전 크리에이터 앱 전달 ──
await api("POST", "/auth/magic/verify",
  { token: (await api("POST", "/auth/magic", { email: "ctx.magic.a@ex.com" })).demoLink.split("magic=")[1] }); // 기존 회원화
const linkA = (await api("POST", "/auth/magic", { email: "ctx.magic.a@ex.com", brand: "glowlab" })).demoLink;
ok("매직 링크는 고정 앱 origin+brand 보존", linkA.startsWith("https://app.theprlist.net/?brand=glowlab&magic="));
const tokA = linkA.split("magic=")[1];
const pmA = await newPage("magicA");
await pmA.goto(`http://localhost:5175/?api=${encodeURIComponent(API)}`);          // 5175 origin에 API 저장
await pmA.goto(`http://localhost:5174/?api=${encodeURIComponent(API)}`);          // 5174 origin에 API 저장
await pmA.evaluate(() => localStorage.setItem("CONNECTION_CREATOR_APP_URL", "http://localhost:5175"));
await pmA.goto(`http://localhost:5174/?brand=glowlab&magic=${encodeURIComponent(tokA)}`);
await pmA.waitForURL((u) => u.origin === "http://localhost:5175", { timeout: 8000 });
await pmA.waitForTimeout(1800);
const tA = await pmA.evaluate(() => document.body.innerText);
const uA = await pmA.evaluate(() => location.origin + location.pathname + location.search);
ok("경로A: 콘솔 랜딩 → 앱 전달 후 로그인 완료", tA.includes("ctx.magic.a@ex.com"));
ok("경로A: 초대 브랜드 카드 유지", tA.includes("GLOWLAB") && (tA.includes("합류") || tA.includes("멤버입니다")));
ok("경로A: 토큰이 URL에서 제거되고 brand만 유지", !uA.includes("magic=") && uA.includes("brand=glowlab"));
await pmA.reload();
await pmA.waitForTimeout(1600);
const tA2 = await pmA.evaluate(() => document.body.innerText);
ok("경로A: 새로고침 후 로그인·브랜드 카드 유지", tA2.includes("ctx.magic.a@ex.com") && tA2.includes("GLOWLAB"));

// ── 매직링크 경로 B: 미가입자 — ?brand= 초대 카드(로그인 전) → 링크 로그인 후 합류 버튼 ──
const pmB = await newPage("magicB");
await pmB.goto(`http://localhost:5175/?api=${encodeURIComponent(API)}&brand=glowlab`);
await pmB.waitForTimeout(1400);
const tB0 = await pmB.evaluate(() => document.body.innerText);
ok("경로B: 미가입자에게 초대 브랜드 안내 표시", tB0.includes("GLOWLAB") && tB0.includes("초대") && tB0.includes("로그인"));
const linkB = (await api("POST", "/auth/magic", { email: "ctx.magic.b@ex.com", brand: "glowlab" })).demoLink;
await pmB.goto(`http://localhost:5175/?brand=glowlab&magic=${encodeURIComponent(linkB.split("magic=")[1])}`);
await pmB.waitForTimeout(1800);
const tB1 = await pmB.evaluate(() => document.body.innerText);
ok("경로B: 미가입자 로그인 후 초대 브랜드 합류 카드", tB1.includes("ctx.magic.b@ex.com") && tB1.includes("GLOWLAB") && tB1.includes("합류"));

ok("JS 에러 없음", errors.length === 0, errors.join("|").slice(0, 200));
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
