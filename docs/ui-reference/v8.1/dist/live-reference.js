/* v2 실제 화면 참조 어댑터 — numbered-20261025 의 app.js 다음에 읽는다.
   app.js 의 IMPROVEMENTS/BY_ID/COV/COVERAGE/view/RENDER/AFTER/ACT/CHG/SHEETS/b()/render() 를 재사용하고
   renderShell()/renderCurrent()/gotoCurrent()/openLayer() 만 바꾼다. 네트워크·실제 저장·발송 없음.
   REFS 는 references.json 과 같은 내용이다 (V2_NOTES.md 의 방법으로 다시 넣을 수 있다). */
/*__REFS_START__*/
const REFS = {"note": "직접 확인한 운영 화면 캡처. 번호 위치는 해당 화면의 실제 요소 좌표로 지정. 데이터 변경이나 운영 반영 없음.", "roles": {"brand": {"default": "brand-home", "pages": [{"key": "brand-home", "label": "홈", "file": "references/brand-home.png", "url": "https://console.theprlist.net/", "checked": "2026-10-26 00:17 KST", "observed": "FAU 워크스페이스 · 브랜드 학습/메일링 카드 · theprlist에게 물어보세요 입력", "hotspots": {"B01": [63.9, 13.5], "B02": [58.6, 27.8], "B12": [65.3, 44.7]}, "width": 807, "height": 917}, {"key": "brand-learning", "label": "브랜드 학습", "file": "references/brand-learning.png", "url": "https://console.theprlist.net/", "checked": "2026-10-26 00:17 KST", "width": 807, "height": 917, "hotspots": {"B02": [81, 8.2], "B03": [35.6, 64.9], "B12": [55.7, 29.3]}, "observed": "홈페이지 분석·직접 수정·저장된 브랜드 자료가 있음. 분석·저장 버튼은 실행하지 않음."}, {"key": "brand-products", "label": "제품·캠페인", "file": "references/brand-products.png", "url": "https://console.theprlist.net/", "checked": "2026-10-26 00:17 KST", "observed": "새 제품(이름/Shop 상품 ID/커미션) · 등록 제품 카드(프로필/캠페인 개설/후보/AI 추천) · 새 캠페인 초안 폼 · 대상 국가 ISO 2자리 직접 입력", "hotspots": {"B03": [92.4, 70.5], "B05": [55.3, 91.1]}, "width": 807, "height": 917}, {"key": "brand-community", "label": "커뮤니티·DM", "file": "references/brand-community.png", "url": "https://console.theprlist.net/", "checked": "2026-10-26 00:17 KST", "observed": "대화 목록 새로고침 · 표시할 대화 없음", "hotspots": {"B11": [67.5, 8.2], "B07": [59.1, 17.3]}, "width": 807, "height": 917}, {"key": "brand-outreach", "label": "아웃리치·인박스", "file": "references/brand-outreach.png", "url": "https://console.theprlist.net/", "checked": "2026-10-26 00:17 KST", "observed": "Google 송수신 연결 설명 · AI 메일 초안 · 수신자 200명 사전 검수/초안/내역 · 제품별 매핑+시트 10,000행 검수/배치 승인 · 대화 내역", "hotspots": {"B06": [58.2, 8.2]}, "width": 807, "height": 917}, {"key": "brand-team", "label": "팀", "file": "references/brand-team.png", "url": "https://console.theprlist.net/", "checked": "2026-10-26 00:17 KST", "width": 807, "height": 917, "hotspots": {"B14": [44.9, 8.2]}, "observed": "소유자 계정·역할 변경·팀원 초대 운영 안내가 실제로 있음. 권한 변경은 실행하지 않음."}, {"key": "brand-billing", "label": "월별 청구", "file": "references/brand-billing.png", "url": "https://console.theprlist.net/", "checked": "2026-10-26 00:17 KST", "width": 807, "height": 917, "hotspots": {"B13": [53.1, 8.2]}, "observed": "월별 청구·수기 청구 안내·카드 자동청구 준비 중·청구서 없음 표시를 확인. 결제는 실행하지 않음."}, {"key": "brand-campaign-draft", "label": "제품·캠페인 · 새 캠페인 초안(아래 구간)", "file": "references/brand-campaign-draft.png", "url": "https://console.theprlist.net/", "checked": "2026-10-26 00:19 KST", "width": 807, "height": 917, "hotspots": {"B04": [57.6, 40.1]}, "observed": "실제 제품·캠페인 메뉴 아래 구간의 새 캠페인 초안 폼. 보상 유형·마감일·ISO 국가 코드 입력과 초안 저장이 있음."}]}, "creator": {"default": "creator-community", "pages": [{"key": "creator-community", "label": "자유 대화", "file": "references/creator-community.png", "url": "https://app.theprlist.net/?brand=goryeo1392#community", "checked": "2026-10-26 00:18 KST", "observed": "고려공작1392 실제 채널: 브랜드 레일·채널 목록·메시지/캠페인 정보/내 협업·제출·번역·입력창. 앱 내부 세션에서 빈 대화 상태를 확인.", "hotspots": {"C11": [87, 20.8], "C10": [80.2, 7.3], "X03": [94, 3.2], "C05": [59.5, 12.6], "C08": [72.1, 12.6], "C12": [37.8, 61]}, "width": 807, "height": 917}, {"key": "creator-campaigns", "label": "캠페인 둘러보기", "file": "references/creator-campaigns.png", "url": "https://app.theprlist.net/?brand=goryeo1392#community", "checked": "2026-10-26 00:18 KST", "observed": "모든 캠페인/저장/신청 탭 · 빈 화면", "hotspots": {"C03": [60, 15], "C04": [81.5, 25.1]}, "width": 807, "height": 917}, {"key": "creator-work", "label": "내 할 일·협업", "file": "references/creator-work.png", "url": "https://app.theprlist.net/?brand=goryeo1392#community", "checked": "2026-10-26 00:18 KST", "observed": "내 할 일 · 선정된 나의 협업", "hotspots": {"C06": [51.2, 15], "C04": [55.9, 39], "C09": [88, 82.1]}, "width": 807, "height": 917}, {"key": "creator-ranking", "label": "브랜드 랭킹", "file": "references/creator-ranking.png", "url": "https://app.theprlist.net/?brand=goryeo1392#community", "checked": "2026-10-26 00:18 KST", "observed": "랭킹 표와 내 레벨 데이터 표시를 확인. 주간 활동 XP와 누적 레벨 XP가 구분되는 화면. 기능은 이미 존재함.", "hotspots": {"C11": [70.2, 15]}, "width": 807, "height": 917}, {"key": "creator-missions", "label": "미션·배지", "file": "references/creator-missions.png", "url": "https://app.theprlist.net/?brand=goryeo1392#community", "checked": "2026-10-26 00:18 KST", "observed": "완료 미션·진행 미션·배지 데이터 표시를 확인. 기능은 이미 존재하며 가능한 다음 행동 구분을 개선 제안.", "hotspots": {"C11": [71.7, 15]}, "width": 807, "height": 917}, {"key": "creator-announcements", "label": "공지사항", "file": "references/creator-announcements.png", "url": "https://app.theprlist.net/?brand=goryeo1392#community", "checked": "2026-10-26 00:18 KST", "observed": "공지 채널은 읽기 전용이며 현재 공지 없음 상태를 확인.", "hotspots": {"C11": [87, 20.8]}, "width": 807, "height": 917}]}, "admin": {"default": "admin-dashboard", "pages": [{"key": "admin-dashboard", "label": "대시보드", "file": "references/admin-dashboard.png", "url": "https://admin.theprlist.net/dashboard", "checked": "2026-10-26 00:18 KST", "observed": "신청/신고/분쟁/검수 · 브랜드/creator/게이트/원장 이벤트 카드 (저장값·테스트 포함 가능)", "hotspots": {"A01": [24.9, 9.4], "A08": [87, 25.5]}, "width": 1280, "height": 720}, {"key": "admin-applications", "label": "브랜드 신청", "file": "references/admin-applications.png", "url": "https://admin.theprlist.net/applications", "checked": "2026-10-26 00:18 KST", "observed": "브랜드 신청 목록", "hotspots": {"A02": [26.6, 9.4]}, "width": 1280, "height": 720}, {"key": "admin-reports", "label": "신고 처리함", "file": "references/admin-reports.png", "url": "https://admin.theprlist.net/reports", "checked": "2026-10-26 00:18 KST", "observed": "신고 처리함", "hotspots": {"A04": [26.6, 9.4]}, "width": 1280, "height": 720}, {"key": "admin-disputes", "label": "분쟁 심판", "file": "references/admin-disputes.png", "url": "https://admin.theprlist.net/disputes", "checked": "2026-10-26 00:18 KST", "observed": "분쟁 심판", "hotspots": {"A05": [25.3, 9.4]}, "width": 1280, "height": 720}, {"key": "admin-submissions", "label": "검수 현황", "file": "references/admin-submissions.png", "url": "https://admin.theprlist.net/submissions", "checked": "2026-10-26 00:18 KST", "observed": "빈 검수 화면 · ‘자동 체크가 이미 돌렸습니다’ 고정 문구", "hotspots": {"A03": [25.3, 9.4], "X04": [80.4, 24.5]}, "width": 1280, "height": 720}, {"key": "admin-recruitment", "label": "디노 공용 모집", "file": "references/admin-recruitment.png", "url": "https://admin.theprlist.net/recruitment", "checked": "2026-10-26 00:18 KST", "observed": "5단계 + 보조 탭(모집 시작/반복 모집/발송 내역/크리에이터·메일/회신·성과/테스트 발송/브랜드 승인·커뮤니티/브랜드·메일 설정)", "hotspots": {"X06": [27.8, 14.6]}, "width": 1280, "height": 720}, {"key": "admin-brands", "label": "브랜드 운영", "file": "references/admin-brands.png", "url": "https://admin.theprlist.net/brands", "checked": "2026-10-26 00:18 KST", "observed": "브랜드 목록 · 운영 상태 · 멤버·팀 수 · 정지 사유 · 정지 · 감사 로그", "hotspots": {"A07": [26.6, 9.4]}, "width": 1280, "height": 720}, {"key": "admin-gmail", "label": "Gmail 운영", "file": "references/admin-gmail.png", "url": "https://admin.theprlist.net/gmail", "checked": "2026-10-26 00:19 KST", "width": 1280, "height": 720, "hotspots": {"A06": [26.5, 9.4]}, "observed": "실행기·수신 동기화·승인 발송 재개·계정별 한도·최근 동기화·재연결 오류가 실제로 표시됨."}, {"key": "admin-pool", "label": "후보 풀", "file": "references/admin-pool.png", "url": "https://admin.theprlist.net/pool", "checked": "2026-10-26 00:19 KST", "width": 1280, "height": 720, "hotspots": {"B05": [23.9, 9.4]}, "observed": "현황·대량 DB 반입/재개·CSV 미리보기 진입을 확인. 실제 데이터 반입은 실행하지 않음."}]}}};
/*__REFS_END__*/

const V2_CHECKED = "2026-10-26 00:17–2026-10-26 00:19 KST";
const V2_LS_REF = 'live-reference-v2:refPage';
const ROLE_SITE = { brand: 'console.theprlist.net', creator: 'app.theprlist.net/?brand=goryeo1392#community', admin: 'admin.theprlist.net' };

/* ---------- 실제 메뉴 (이름·순서 유지) ---------- */
const MENUS = {
  brand: [
    { label: '홈', screens: [['b-today', '홈']] },
    { label: '브랜드 학습', screens: [['b-learning', '브랜드 학습']] },
    { label: '제품·캠페인', screens: [['b-products', '제품'], ['b-create', '협업 만들기'], ['b-applicants', '지원자'], ['b-samples', '샘플·영상']] },
    { label: '커뮤니티·DM', screens: [['b-community', '커뮤니티·DM']] },
    { label: '아웃리치·인박스', screens: [['b-invite', '초대할 사람'], ['b-mailprep', '메일 준비'], ['b-reply', '답장'], ['b-sendlog', '발송 내역']] },
    { label: '팀', screens: [['b-team', '팀']] },
    { label: '월별 청구', screens: [['b-billing', '청구'], ['b-results', '비용·결과']] },
  ],
  creator: [
    { label: '내 할 일', screens: [['c-tasks', '내 할 일']] },
    { label: '캠페인 둘러보기', screens: [['c-campaigns', '캠페인 둘러보기']] },
    { label: '내 공간', screens: [['c-rewards', '받을 보상'], ['c-profile', '내 정보']] },
    { group: '커뮤니티', label: '공지사항', screens: [['c-announcements', '공지사항']] },
    { label: '# 자유대화', screens: [['c-community', '# 자유대화']] },
    { label: '브랜드 랭킹', screens: [['c-ranking', '브랜드 랭킹']], more: true },
    { label: '미션·배지 Lv.1', screens: [['c-missions', '미션·배지']] },
    { group: '캠페인', label: '모집채널', screens: [['c-recruit', '모집채널']] },
    { label: '선정된 나의 협업', screens: [['c-work', '선정된 나의 협업']] },
    { group: '다이렉트 메시지', label: '브랜드 담당자', screens: [['c-messages', '브랜드 담당자']] },
    { group: ' ', label: '도움말', screens: [['c-helpdesk', '도움말']] },
  ],
  admin: [
    { label: '대시보드', screens: [['a-today', '오늘 처리할 일'], ['a-finance', '비용·성과']] },
    { label: '브랜드 신청', screens: [['a-onboard', '브랜드 신청']] },
    { label: '신고 처리함', screens: [['a-reports', '신고 처리함']] },
    { label: '분쟁 심판', screens: [['a-reports-dis', '분쟁 심판']] },
    { label: '검수 현황', screens: [['a-review', '검수 현황']] },
    { label: '디노 공용 모집', screens: [['a-recruit', '디노 공용 모집']] },
    { label: '브랜드 운영', screens: [['a-brands', '브랜드 목록'], ['a-people', '사람·권한']] },
    { label: '계정별 메일함', screens: [['a-mailbox', '계정별 메일함']] },
    { label: 'Gmail 운영', screens: [['a-connections', 'Gmail 운영']] },
    { label: '후보 풀', screens: [['a-pool', '후보 풀']] },
  ],
};
function findMenu(role, screen) {
  for (const m of MENUS[role]) { const s = m.screens.find(x => x[0] === screen); if (s) return { m, sub: s[1] }; }
  return null;
}

/* ---------- 표시 이름 통일 (디자인 예시) ---------- */
const V2_NAME = { brand: 'FAU(디자인 예시)', creator: '고려공작1392(디자인 예시)', admin: 'FAU(디자인 예시)' };
function brandify(html, role) {
  return html
    .replace(/새봄 진정 세럼 50ml\(예시\)|새봄 진정 세럼\(예시\)/g, '예시 제품 A')
    .replace(/새봄 수분 크림\(예시\)/g, '예시 제품 B')
    .replace(/새봄뷰티\(예시\)/g, V2_NAME[role])
    .replace(/새봄 마케팅팀장\(예시\)/g, '고객사 팀장(예시)').replace(/새봄 대표\(예시\)/g, '고객사 대표(예시)')
    .replace(/saebom/g, 'fau-example')
    .replace(/새봄뷰티/g, role === 'creator' ? '고려공작1392' : 'FAU')
    .replace(/진정 세럼/g, '예시 제품 A').replace(/수분 크림/g, '예시 제품 B').replace(/새봄 ?/g, '');
}
const roleOfScreen = k => (k[0] === 'b' ? 'brand' : k[0] === 'c' ? 'creator' : 'admin');
const V1 = Object.assign({}, RENDER);
Object.keys(V1).forEach(k => { RENDER[k] = () => brandify(V1[k](), roleOfScreen(k)); });
Object.values(SHEETS).forEach(s => { const h = s.html; s.html = () => brandify(h(), view.role); });

/* ---------- ‘현재 있는 기능’ / ‘추가로 바꿀 점’ ---------- */
const EXIST = {
  B01: ['홈에 FAU 워크스페이스, 브랜드 학습·메일링 카드, ‘theprlist에게 물어보세요’ 입력이 있습니다.', '같은 홈 안에 오늘 할 일과 준비 체크를 넣습니다.'],
  B02: ['브랜드 학습 메뉴가 있습니다.', '국가·목적별 시작 준비 상태와 막힌 이유를 함께 보여 줍니다.'],
  B03: ['제품·캠페인에서 새 제품(이름/Shop 상품 ID/커미션) 등록과 등록 제품 카드가 있습니다.', '공개 소개·내부 가이드·미리보기를 나누고 준비 상태를 표시합니다.'],
  B04: ['같은 화면에 새 캠페인 초안 폼이 있고, 대상 국가는 2자리 코드를 쉼표로 직접 입력합니다.', '‘협업 만들기’ 하위 탭의 5단계로 정리하고, 국가는 목록에서 고릅니다.'],
  B05: ['등록 제품 카드에 후보·AI 추천 버튼이 있습니다.', '추천 이유·연락 기록을 보고 고르는 흐름으로 잇습니다.'],
  B06: ['아웃리치·인박스에 Google 송수신 연결 설명, AI 메일 초안, 수신자 200명 사전 검수/초안/내역, 제품별 매핑+시트 10,000행 검수/배치 승인이 이미 있습니다.', '새로 만드는 기능이 아니라, 복잡한 폼을 연결→대상→내용→검수→실행 5단계로 쉽게 정리합니다. 시안에서는 실제 전송이 없습니다.'],
  B07: ['아웃리치·인박스에 대화 내역이 있습니다.', '답장마다 협업·담당자·다음 할 일을 함께 보여 줍니다.'],
  B11: ['커뮤니티·DM에 대화 목록과 새로고침이 있습니다 (관찰 당시 ‘표시할 대화 없음’).', '같은 메뉴 안에 대화/질문/멤버/공지/캠페인/랭킹 하위 탭을 더합니다. DM은 기존 기능입니다.'],
  B12: ['아웃리치에 AI 메일 초안이 있습니다.', '근거→담당자 검토→보내기 순서를 분명히 합니다.'],
  B14: ['팀 메뉴가 있습니다.', '고객 브랜드 범위와 승인 흐름을 더합니다.'],
  B13: ['월별 청구 메뉴가 있습니다.', '같은 메뉴 안에 비용·결과 패널을 둡니다.'],
  C03: ['캠페인 둘러보기에 모든 캠페인/저장/신청 탭이 있습니다 (관찰 당시 0건).', '범위(이 브랜드/전체 브랜드)와 0건 이유를 구분해 보여 줍니다.'],
  C05: ['#자유 대화 채널에 ‘캠페인 정보’ 탭이 있습니다.', '보상·광고 사용 조건을 접지 않고 요약합니다.'],
  C06: ['내 할 일 메뉴가 있습니다.', '내가 할 일 / 브랜드 답변 기다림 / 배송 중으로 나눕니다.'],
  C08: ['#자유 대화 채널에 ‘내 협업·제출’ 탭이 있습니다.', '검토본·수정본·게시 링크를 단계로 나눕니다.'],
  C10: ['채널에 언어 버튼과 번역 언어 안내가 있습니다.', '화면 언어와 번역 언어를 따로 저장합니다.'],
  C11: ['#자유 대화 채널(메시지/캠페인 정보/내 협업·제출 탭), 브랜드 랭킹, 미션·배지 Lv.1 메뉴가 이미 있습니다.', '같은 틀 안에 새 멤버 환영·첫 행동·이번 주 기회·질문 바로가기를 더하고, 랭킹 기준과 미션 상태를 알기 쉽게 합니다.'],
  C12: ['도움말 메뉴가 있습니다.', '문의 접수번호와 처리 상태를 보여 줍니다.'],
  A01: ['대시보드에 신청/신고/분쟁/검수, 브랜드/creator/게이트/원장 이벤트 카드가 있습니다.', '같은 본문에 긴급·지연·담당자·다음 행동 큐를 더합니다.'],
  A02: ['브랜드 신청 메뉴가 있습니다.', '승인 후 첫 협업까지 준비 상태를 추적합니다.'],
  A03: ['검수 현황 메뉴가 있고, 빈 화면에도 ‘자동 체크가 이미 돌렸습니다’ 문구가 고정으로 보입니다.', '자동 점검이 실제로 실행됐는지(결과/미실행)를 구분해 보여 줍니다.'],
  A04: ['신고 처리함 메뉴가 있습니다.', '처리 기록과 실제 숨김·제한 적용, 통보 상태를 따로 확인합니다.'],
  A05: ['분쟁 심판 메뉴가 있습니다.', '증거 타임라인·판정문·이의 절차를 나눠 보여 줍니다.'],
  A06: ['Gmail 운영·계정별 메일함 메뉴가 있습니다.', '로그인/보내기/받기/한도를 따로 표시합니다.'],
  A07: ['브랜드 운영에 브랜드 목록·운영 상태·멤버·팀 수·정지 사유·정지·감사 로그가 있습니다.', '고객 선택 → 사람·권한 하위 탭으로 민감 정보 접근을 관리합니다.'],
  A08: ['대시보드 카드 수치는 저장값·테스트 데이터를 포함할 수 있습니다.', '대시보드 안 ‘비용·성과’ 탭에서 정의·기간·테스트 제외를 분리합니다.'],
  X04: ['관찰 당시 크리에이터 공지/랭킹/미션 조회가 세션 서명 불일치로 실패했습니다. 기능이 없거나 0건이라는 뜻은 아닙니다.', '세션 만료(다시 로그인·입력 보존) / 성공 0건 / 불러오기 실패를 따로 보여 줍니다. 실제 장애를 고쳤다는 뜻은 아닙니다.'],
};
IMPROVEMENTS.forEach(it => { if (it.observedNow) EXIST[it.id] = [it.observedNow, (EXIST[it.id] || [null, it.ui[0]])[1]]; });
const exist = (now, change) => `<div class="v2-exist"><div><b>현재 확인한 내용</b><p>${now}</p></div><div><b>제안하는 변화</b><p>${change}</p></div></div>`;
const existFor = id => (EXIST[id] ? exist(EXIST[id][0], EXIST[id][1]) : '');

/* ---------- 좌표·위치 정보 ---------- */
const LOC = {}; // id -> [{role, page, label}]
Object.entries(REFS.roles).forEach(([role, r]) => r.pages.forEach(p => Object.keys(p.hotspots).forEach(id => {
  (LOC[id] = LOC[id] || []).push({ role, page: p.key, label: p.label });
})));
const refSel = Object.assign({}, lsGet(V2_LS_REF, {}));
// 시안 위치 갱신 (v2 메뉴 안으로)
const V2_SCREEN = { B03: 'b-products', B06: 'b-mailprep', B08: 'b-applicants', A05: 'a-reports-dis' };
COVERAGE.items.forEach(it => {
  if (V2_SCREEN[it.id]) { it.screen = V2_SCREEN[it.id]; }
  const f = findMenu(it.proposalRole, it.screen);
  if (f) it.screenLabel = f.m.screens.length > 1 ? `${f.m.label} › ${f.sub}` : f.m.label;
  const own = (LOC[it.id] || []).sort((a, c) => (a.role === it.proposalRole ? -1 : 0) - (c.role === it.proposalRole ? -1 : 0));
  it.currentCapture = own.length ? own[0].role : null;
});
Object.keys(COVERAGE.captures).forEach(r => { COVERAGE.captures[r].label = `${ROLE_LABEL[r]} 실제 화면 캡처`; });

/* ---------- 검토용 바: v2 표시 ---------- */
(function addV2Flag() {
  const p = document.createElement('details');
  p.className = 'rv-notice v2-flag';
  p.innerHTML = `<summary>검토용 v2 · 실제 참조 정보 보기</summary><p><b>v2 · 실제 화면 참조</b> — console.theprlist.net(브랜드 FAU) · app.theprlist.net(고려공작1392) · admin.theprlist.net · 확인 ${V2_CHECKED}. 현재 메뉴·프레임은 유지하고 개선만 넣은 시안입니다. v1은 개선 요구사항 예시로만 남깁니다.</p>`;
  document.querySelector('.rv-bar').appendChild(p);
})();

/* ---------- 레이어: 현재 있는 기능 / 추가로 바꿀 점 ---------- */
const v1OpenLayer = openLayer;
openLayer = function (id) {
  v1OpenLayer(id);
  const first = document.querySelector('#rv-layer section');
  const locs = (LOC[id] || []).map(l => `${ROLE_LABEL[l.role]} · ${l.label}`).join(', ');
  if (first) first.insertAdjacentHTML('afterend', `${existFor(id)}<section><h3>참조한 실제 화면</h3><p class="small">${locs || '캡처한 실제 화면에는 없음 → 개선 후 시안에서 확인'}</p></section>`);
  if (first && BY_ID[id].observedNow) first.remove();
  const type = document.createElement('p'); type.className='small'; type.textContent='분류: '+(BY_ID[id].changeType || '개선 제안'); document.querySelector('#rv-layer-title').after(type);
};

/* ---------- 현재 UI 모드 (실제 캡처 넓게) ---------- */
renderCurrent = function () {
  const role = view.role, r = REFS.roles[role];
  const pg = r.pages.find(p => p.key === refSel[role]) || r.pages.find(p => p.key === r.default);
  const here = Object.keys(pg.hotspots);
  const others = IMPROVEMENTS.filter(i => !here.includes(i.id) && (i.roleKey === role || COV[i.id].proposalRole === role)).map(i => i.id);
  const rest = IMPROVEMENTS.filter(i => !here.includes(i.id) && !others.includes(i.id)).map(i => i.id);
  const extra = id => { const o = (LOC[id] || []).filter(l => l.page !== pg.key); return o.length ? ` · 다른 캡처: ${o.map(l => esc(l.label)).join(', ')}` : ''; };
  return `<section class="v2-ref" aria-labelledby="ref-title">
    <div class="v2-ref-tools">
      <div class="field"><label for="ref-page">참조한 실제 화면 고르기</label>
        <select id="ref-page" data-chg="ref-page">${r.pages.map(p => `<option value="${p.key}" ${p.key === pg.key ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>
      <div class="v2-ref-meta"><h1 id="ref-title">현재 UI: ${esc(pg.label)}</h1>
        <p class="small">실제 주소 <code>${esc(pg.url)}</code> · 확인 ${esc(pg.checked)}</p>
        <p class="small muted">관찰: ${esc(pg.observed)}</p>
        <p class="small muted">번호는 이 실제 화면의 관련 요소 옆에 배치했습니다. 클릭해서 변경 내용을 확인하세요.</p></div>
      <a class="btn" href="${pg.file}" target="_blank" rel="noopener">원본 이미지 열기</a>
    </div>
    <div class="cap-wrap v2-cap-wrap"><div class="cap" data-cap style="aspect-ratio:1440/1000">
      <img src="${pg.file}" alt="${esc(pg.label)} 실제 화면 캡처" data-capimg>
      <div class="missing" data-missing hidden><p><b>캡처 이미지가 아직 없습니다.</b></p><p><code>${pg.file}</code>를 넣으면 원래 비율로 표시됩니다.</p><p class="small">가짜 화면은 만들지 않았습니다.</p></div>
      ${here.map(id => b(id, { pos: pg.hotspots[id] })).join('')}
    </div></div>
    <details class="v2-list" open><summary>이 화면의 개선 (${here.length})</summary><ul class="ilist">${here.map(id => itemLine(id, extra(id))).join('')}</ul></details>
    <details class="v2-list"><summary>${ROLE_LABEL[role]} 다른 화면 개선 (${others.length})</summary><ul class="ilist">${others.map(id => itemLine(id, extra(id))).join('')}</ul></details>
    <details class="v2-list"><summary>다른 역할·공통 개선 (${rest.length})</summary><ul class="ilist">${rest.map(id => itemLine(id, extra(id))).join('')}</ul></details>
  </section>`;
};
CHG['ref-page'] = el => { refSel[view.role] = el.value; lsSet(V2_LS_REF, refSel); render(); const s = document.getElementById('ref-page'); if (s) s.focus(); };
gotoCurrent = function (id) {
  const loc = (LOC[id] || []).find(l => l.role === COV[id].proposalRole) || (LOC[id] || [])[0];
  if (!loc) { gotoProposal(id); return; }
  while (stack.length) closeTop();
  view.role = loc.role; view.mode = 'current'; refSel[loc.role] = loc.page; lsSet(V2_LS_REF, refSel); saveView(); render();
  revealHotspot(id);
};

/* ---------- 제품 프레임 (실제 메뉴·레일·사이드바) ---------- */
let v2Nav = false, v2Rail = false, v2More = false, v2LastScreen = '';
ACT['v2-nav'] = () => { v2Nav = !v2Nav; render(); const t = document.querySelector('[data-act="v2-nav"]'); if (t) t.focus(); };
ACT['v2-rail'] = () => { v2Rail = !v2Rail; render(); const t = document.querySelector('[data-act="v2-rail"]'); if (t) t.focus(); };
ACT['v2-more'] = () => { v2More = !v2More; render(); const t = document.querySelector('[data-act="v2-more"]'); if (t) t.focus(); };

function v2Top(role) {
  if (role === 'brand') return `<span class="v2-logo">theprlist <b>CONSOLE</b></span><button type="button" class="v2-topbtn" data-demo="브랜드 전환은 실제 화면 기능입니다(시안).">FAU ▾</button><span class="v2-sp"></span><button type="button" class="v2-topbtn" data-demo="계정 메뉴(시안)">계정</button>`;
  if (role === 'creator') return `<span class="v2-logo">theprlist</span><label class="v2-search hide-m"><span class="sr">검색</span><input type="text" placeholder="고려공작1392 안에서 검색"></label><span class="v2-sp"></span><button type="button" class="v2-topbtn" data-go="c-helpdesk">이용안내</button><button type="button" class="v2-topbtn" data-demo="알림을 누르면 해당 업무로 바로 이동합니다(시안).">알림</button>`;
  return `<span class="v2-logo">theprlist <b>ADMIN</b> · 전사운영</span><span class="v2-sp"></span><button type="button" class="v2-topbtn" data-demo="서버 상태 표시는 실제 화면에 있습니다. 시안은 값을 표시하지 않습니다.">서버 상태</button>`;
}
function v2RailHtml(role) {
  if (role === 'brand') return `<button type="button" aria-current="true" aria-label="FAU 워크스페이스">FAU</button><button type="button" data-demo="브랜드 추가(시안)" aria-label="브랜드 추가">+</button>`;
  if (role === 'creator') return `<button type="button" data-nav="c-rewards" aria-label="내 공간">pr.</button><button type="button" data-demo="다른 브랜드로 전환(시안)" aria-label="F 브랜드">F</button><button type="button" aria-current="true" aria-label="고려공작1392">고</button><button type="button" data-demo="브랜드 찾기(시안)" aria-label="브랜드 추가">+</button><button type="button" data-nav="c-profile" aria-label="설정">⚙</button>`;
  return '';
}
function v2Side(role, cur) {
  let html = role === 'creator' ? `<div class="v2-ws"><b>고려공작1392</b><span class="small">브랜드 커뮤니티</span></div>` : role === 'brand' ? `<div class="v2-ws"><b>FAU</b><span class="small">브랜드 콘솔</span></div>` : '';
  let lastGroup = null;
  MENUS[role].forEach(m => {
    if (m.group && m.group !== lastGroup) { html += `<p class="v2-grp">${m.group.trim() ? m.group : ''}</p>`; lastGroup = m.group; }
    if (m.more) {
      html += `<button type="button" class="v2-navbtn v2-moretoggle" data-act="v2-more" aria-expanded="${v2More}">제품·콘텐츠 더보기 ${v2More ? '▴' : '▾'}</button>`;
      if (v2More) html += `<button type="button" class="v2-navbtn v2-sub1" data-nav="c-community"># 제품-후기 (예시)</button><button type="button" class="v2-navbtn v2-sub1" data-nav="c-community"># 콘텐츠-팁 (예시)</button>`;
    }
    const on = m.screens.some(s => s[0] === cur);
    html += `<button type="button" class="v2-navbtn" data-nav="${m.screens[0][0]}"${on ? ' aria-current="page"' : ''}>${m.label}</button>`;
  });
  return html;
}

renderShell = function () {
  const role = view.role;
  let cur = view.screen[role];
  let f = findMenu(role, cur);
  if (!f) { cur = MENUS[role][0].screens[0][0]; view.screen[role] = cur; f = findMenu(role, cur); }
  if (cur !== v2LastScreen) { v2Nav = false; v2Rail = false; v2LastScreen = cur; }
  const sub = f.m.screens.length > 1 ? `<nav class="tabs v2-subtabs" aria-label="${f.m.label} 하위 메뉴">${f.m.screens.map(([k, l]) => `<button type="button" data-nav="${k}"${k === cur ? ' aria-current="page" aria-selected="true"' : ' aria-selected="false"'}>${l}</button>`).join('')}</nav>` : '';
  const body = (RENDER[cur] || (() => '<p>준비 중</p>'))();
  const hasRail = role !== 'admin';
  const navLabel = role === 'creator' ? '채널·메뉴' : '메뉴';
  return `<div class="v2 v2-${role}${v2Nav ? ' nav-open' : ''}${v2Rail ? ' rail-open' : ''}" data-role-app="${role}">
    <div class="v2-top">${v2Top(role)}</div>
    <div class="v2-mobilebar">${hasRail ? `<button type="button" class="btn" data-act="v2-rail" aria-expanded="${v2Rail}">브랜드 선택 ${v2Rail ? '닫기' : '열기'}</button>` : ''}
      <button type="button" class="btn pri" data-act="v2-nav" aria-expanded="${v2Nav}">${navLabel} ${v2Nav ? '닫기' : '열기'}</button><span class="small">지금: <b>${f.m.label}</b></span></div>
    <div class="v2-body">
      ${hasRail ? `<nav class="v2-rail" aria-label="브랜드 선택">${v2RailHtml(role)}</nav>` : ''}
      <nav class="v2-side" aria-label="${ROLE_LABEL[role]} ${navLabel}">${v2Side(role, cur)}</nav>
      <div class="v2-main" role="region" aria-label="${f.m.label}">${sub}<span class="demo-note">v2 시안 · 실제 메뉴 구조 유지 · 디자인 예시 데이터 · 버튼은 시안에서만 동작</span>${body}</div>
    </div></div>`;
};

/* ---------- 공통: 상태 예시 토글 (세션 만료 / 성공 0건 / 불러오기 실패) ---------- */
const v2State = {};
function stateDemo(key) {
  const s = v2State[key] || 'ok';
  const btn = (k, l) => `<button type="button" class="btn${s === k ? ' pri' : ''}" data-act="v2-state" data-key="${key}" data-k="${k}" aria-pressed="${s === k}">${l}</button>`;
  const msg = {
    ok: '',
    expired: `<div class="alert warn"><b>로그인이 만료됐어요.</b> 쓰던 내용은 이 기기에 보관했어요. ${demoBtn('다시 로그인', 'pri', '시안: 실제 로그인은 하지 않아요.')}</div>`,
    zero: `<div class="alert info"><b>아직 항목이 없어요 (불러오기 성공, 0건).</b> 새 항목이 생기면 알려 드려요.</div>`,
    error: `<div class="alert err"><b>불러오지 못했어요.</b> 0건이 아니에요. ${demoBtn('다시 시도')} ${demoBtn('문의하기')}</div>`,
  }[s];
  return `<details class="v2-state-review"><summary>검토용: 오류·빈 화면 예시 보기</summary><div class="v2-state"><span class="small muted">상태 예시 ${b('X04', { noId: true })}</span> ${btn('ok', '정상')}${btn('expired', '세션 만료')}${btn('zero', '성공 0건')}${btn('error', '불러오기 실패')}</div></details>${msg}`;
}
ACT['v2-state'] = el => { v2State[el.dataset.key] = el.dataset.k; render(); const t = document.querySelector(`[data-act="v2-state"][data-key="${el.dataset.key}"][data-k="${el.dataset.k}"]`); if (t) t.focus(); };
const stateOk = key => !v2State[key] || v2State[key] === 'ok';

/* =====================================================================
   브랜드 (console.theprlist.net · FAU)
   ===================================================================== */
RENDER['b-today'] = () => `${brandify(V1['b-today'](), 'brand')}
  <details class="card" style="margin-top:16px"><summary>브랜드 자료와 메일 준비</summary><div class="grid g2" style="margin-top:12px">
    <div class="card"><h3>브랜드 학습</h3><p class="small">저장한 자료를 답변과 초안에 써요.</p>${goBtn('브랜드 자료 보기', 'b-learning')}</div>
    <div class="card"><h3>메일링</h3><p class="small">보낼 사람과 내용을 먼저 확인해요.</p>${goBtn('메일 준비하기', 'b-mailprep')}</div></div>
  <div class="card v2-ask"><label for="v2-ask"><b>theprlist에게 물어보세요</b></label>
    <div class="v2-row"><input id="v2-ask" type="text" placeholder="예: 답장하지 않은 사람이 있나요?">${demoBtn('물어보기', 'pri', '시안: 질문은 보내지 않아요.')}</div></div></details>`;

RENDER['b-learning'] = () => `<div class="page-head"><div><h1>브랜드 학습</h1><p>학습 자료와 공개 제품 자료를 한곳에서 확인해요.</p></div></div>
  ${exist('브랜드 학습 메뉴와 자료 학습 기능이 있습니다.', '무엇이 준비됐고 무엇이 비었는지, 어디에 쓰이는지 보여 줍니다.')}
  <div class="grid g2"><div class="card"><h3>학습 자료 ${b('B12', { noId: true })}</h3><ul class="check">
    <li><span class="ic ok">✓</span><div>브랜드 소개 문서 <span class="small muted">· 답변·초안 근거로 쓰여요</span></div></li>
    <li><span class="ic ok">✓</span><div>자주 묻는 질문 12개 (예시)</div></li>
    <li><span class="ic no">!</span><div><b>금지 표현 목록 없음</b><div class="small muted">없으면 AI 초안이 과장 표현을 걸러내지 못해요.</div>${demoBtn('금지 표현 추가')}</div></li></ul></div>
  <div class="card"><h3>공개 제품 자료 ${b('B03', { noId: true })}</h3><p class="small">초대 페이지와 메일에 그대로 쓰여요.</p><ul class="check">
    <li><span class="ic ok">✓</span><div>예시 제품 A — 사진 3장·설명·판매 링크</div></li>
    <li><span class="ic wait">…</span><div>예시 제품 B — 설명 없음 (미완성으로 표시)</div></li></ul>${goBtn('제품에서 보완하기', 'b-products', 'pri')}</div>
  <div class="card"><h3>시작 준비 ${b('B02', { noId: true })}</h3><p class="small">국가·목적별 준비 상태는 홈의 ‘시작 준비’ 카드에서 이어서 확인해요.</p>${goBtn('홈에서 보기', 'b-today')}</div></div>`;

RENDER['b-products'] = () => `<div class="page-head"><div><h1>제품 ${b('B03')}</h1><p>제품을 등록하고, 크리에이터가 받는 소개를 확인해요.</p></div></div>
  ${exist(EXIST.B03[0] + ' 같은 화면에 새 캠페인 초안 폼도 함께 있습니다.', '제품 / 협업 만들기 / 지원자 / 샘플·영상 하위 탭으로 나눕니다.')}
  <div class="split"><div class="card"><h3>등록 제품</h3><ul class="rows">
    <li class="rowi"><div class="grow"><b>예시 제품 A</b><div class="sub">미국 · 판매 보상(판매금액의 15%) · ${chip('초대 준비 완료', 'ok')} · 마지막 검토 10/20</div></div>
      ${demoBtn('프로필')}${goBtn('협업 만들기', 'b-create', 'pri')}${goBtn('후보', 'b-invite')}${goBtn('AI 추천', 'b-invite')}<span>${b('B05', { noId: true })}</span></li>
    <li class="rowi"><div class="grow"><b>예시 제품 B</b><div class="sub">${chip('공개 설명 없음 · 미완성', 'warn')}</div></div>${demoBtn('설명 보완')}</li></ul></div>
  <div class="card"><h3>새 제품</h3>
    <div class="field"><label for="np-name">제품 이름<span class="req">필수</span></label><input id="np-name" type="text" placeholder="예: 예시 제품 C"></div>
    <div class="field"><label for="np-id">Shop 상품 ID<span class="opt">선택</span></label><input id="np-id" type="text" placeholder="예: 1729 0000 0000 (예시)"><span class="hint">TikTok Shop에 연결할 때만 필요해요.</span></div>
    <div class="field"><label for="np-rate">판매 보상 비율<span class="req">필수</span></label><input id="np-rate" type="number" value="15"><span class="hint">판매 보상(판매금액의 15%) — 확인된 판매금액 기준</span></div>
    <div class="field"><span class="lab">대상 국가<span class="req">필수</span> ${b('X02', { noId: true })}</span><div class="v2-checks">${['미국', '태국', '베트남', '일본', '말레이시아'].map((c, i) => `<label><input type="checkbox" ${i === 0 ? 'checked' : ''}> ${c}</label>`).join('')}</div><span class="hint">대상 국가를 하나 이상 골라 주세요.</span></div>
    ${demoBtn('제품 저장', 'pri', '시안: 실제 저장은 없어요.')}</div></div>`;

RENDER['b-applicants'] = () => brandify(V1['b-invite'](), 'brand');
AFTER['b-applicants'] = root => { activateTab('inv', 'app'); const t = root.querySelector('[data-tabgroup="inv"]'); if (t) t.hidden = true; };
AFTER['b-invite'] = root => { activateTab('inv', 'rec'); const t = root.querySelector('[data-tabgroup="inv"]'); if (t) t.hidden = true; };

RENDER['b-community'] = () => `<div class="page-head"><div><h1>커뮤니티·DM ${b('B11')}</h1><p>멤버의 대화와 질문을 확인하고 새 협업을 알려 주세요.</p></div></div>
  ${existFor('B11')}
  ${tabs('bc', [['talk', '대화'], ['q', '질문 3'], ['mem', '멤버'], ['notice', '공지'], ['camp', '캠페인'], ['rank', '랭킹']], 'talk')}
  ${panel('bc', 'talk', 'talk', `<div class="btns" style="margin-top:0">${demoBtn('새로고침', '', '시안: 실제로 다시 불러오지 않아요.')}</div>${stateDemo('bc-talk')}
    ${stateOk('bc-talk') ? `<ul class="rows"><li class="rowi"><div class="grow"><b>민지(예시)</b><div class="sub">“샘플 받았어요! 영상은 이번 주에 올릴게요.” · 2시간 전</div></div>${chip('답장 필요', 'warn')}${demoBtn('열기')}</li>
      <li class="rowi"><div class="grow"><b>Jordan(예시)</b><div class="sub">조건 질문 · 협업: 예시 제품 A 미국 영상</div></div>${demoBtn('열기')}</li></ul>` : ''}`)}
  ${panel('bc', 'q', 'talk', `<ul class="rows"><li class="rowi"><div class="grow"><b>“샘플은 언제 와요?”</b><div class="sub">Ava(예시) · #자유대화 · 5시간 전</div></div>${chip('답변 없음', 'warn')}${demoBtn('나에게 배정')}</li></ul>
    <div class="card soft" style="margin-top:12px"><h3>AI 답변 초안 — 근거 확인 후 검토 ${b('B12', { noId: true })}</h3><p>“출고 후 보통 5–7일 걸려요. 송장이 등록되면 내 협업에서 확인할 수 있어요.”</p>
      <p class="small muted">근거: 협업 조건 v1 · 자주 묻는 질문 v3</p><div class="btns">${demoBtn('고쳐 쓰기')}${demoBtn('확인하고 게시', 'pri', '시안: 실제 게시 없음')}</div></div>`)}
  ${panel('bc', 'mem', 'talk', `<ul class="rows"><li class="rowi"><div class="grow"><b>민지(예시)</b><div class="sub">10/02 가입 · 관심: 예시 제품 A · 단계: 샘플 받음 · 최근 기여 답변 2</div></div>${chip('다음: 영상 제출', 'info')}</li>
    <li class="rowi"><div class="grow"><b>Ken(예시)</b><div class="sub">30일 활동 없음</div></div>${chip('휴면')}${demoBtn('다시 초대')}</li></ul>`)}
  ${panel('bc', 'notice', 'talk', `<div class="card"><h3>공지 게시 시안</h3><div class="field"><label for="bn-t">제목<span class="req">필수</span></label><input id="bn-t" type="text" value="예시 제품 A 영상 협업이 열렸어요"></div>
    <div class="field"><label for="bn-a">대상<span class="req">필수</span></label><select id="bn-a"><option>미국 멤버 · 영어</option><option>전체 멤버</option></select></div>
    <div class="field"><label for="bn-d">예약<span class="opt">선택</span></label><input id="bn-d" type="text" placeholder="예: 10/26 10:00 (뉴욕 시간)"></div>${demoBtn('미리보기')}${demoBtn('예약하기', 'pri', '시안: 실제 공지는 보내지 않아요.')}</div>`)}
  ${panel('bc', 'camp', 'talk', `<div class="card"><h3>캠페인을 채널에 게시</h3><p class="small">게시하면 크리에이터 #자유대화와 모집채널에 협업 카드가 보여요.</p><div class="cond"><b>예시 제품 A 영상 1개</b> · 고정비 100 USD · 받은 뒤 14일 · 광고 사용 미포함</div>${goBtn('협업 만들기에서 고치기', 'b-create')} ${demoBtn('게시하기', 'pri', '시안: 실제 게시 없음')}</div>`)}
  ${panel('bc', 'rank', 'talk', `<div class="card"><h3>랭킹 기준</h3><dl class="kv"><dt>점수</dt><dd>질문 답변 +5 · 후기 공유 +10 · 협업 완료 +30 (예시)</dd><dt>공개 범위</dt><dd>이름 숨기기 선택 가능</dd><dt>제외</dt><dd>개인 보상·주소는 순위에 쓰지 않아요</dd></dl>${demoBtn('기준 저장', 'pri')}</div>`)}`;

const MP = [['m1', '1 연결'], ['m2', '2 대상'], ['m3', '3 내용'], ['m4', '4 검수'], ['m5', '5 실행']];
RENDER['b-mailprep'] = () => `<div class="page-head"><div><h1>메일 준비 ${b('B06')}</h1><p>지금 있는 기능을 5단계로 정리했어요. 실제 전송은 없어요.</p></div></div>
  ${existFor('B06')}
  <div class="steps" role="tablist" data-tabgroup="mp">${MP.map(([k, l], i) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${i === 0}">${l}</button>`).join('')}</div>
  <div class="card">
  ${panel('mp', 'm1', 'm1', `<h2>1. 보내는 계정 연결</h2><p>brand@fau-example.com(예시) · 보내기 ${chip('정상', 'ok')} 받기 ${chip('정상', 'ok')} · 마지막 성공 10/25 09:12 (예시)</p><p class="small muted">Google 계정으로 보내고, 답장도 같은 계정으로 받아요.</p>`)}
  ${panel('mp', 'm2', 'm1', `<h2>2. 받는 사람</h2><p>시트 200행 → 보낼 사람 163명 (예시)</p><ul class="small"><li>중복 12</li><li>수신 거부 9</li><li>최근 30일 연락 14</li><li>주소 형식 오류 2</li></ul><p class="small muted">제품별 매핑: 예시 제품 A 120명 · 예시 제품 B 43명. 시트는 10,000행까지 검수할 수 있어요.</p>`)}
  ${panel('mp', 'm3', 'm1', `<h2>3. 내용</h2><div class="field"><label for="mp-s">제목<span class="req">필수</span></label><input id="mp-s" type="text" value="예시 제품 A 영상 협업 제안"></div><p class="small">AI 초안 ${b('B12', { noId: true })}: 받는 사람의 최근 영상을 근거로 첫 문장을 써요. 근거가 없으면 비워 둬요.</p>`)}
  ${panel('mp', 'm4', 'm1', `<h2>4. 검수 (3명 표본)</h2><p class="small"><b>민지(예시)</b> — 선정 이유: 최근 리뷰 영상 ✓</p><p class="small"><b>Ava(예시)</b> — ${chip('선정 이유 비어 있음', 'err')} 보내기 전에 채워 주세요.</p>${demoBtn('배치 승인 요청', 'pri', '시안: 실제 승인 요청 없음')}`)}
  ${panel('mp', 'm5', 'm1', `<h2>5. 실행</h2><p>승인자: 고객사 팀장(예시) · 대상 버전 v3 · 163명</p><button type="button" class="btn pri" disabled>보내기 (시안에서는 보낼 수 없음)</button><p class="small muted">실제 화면에서는 대기/시도/접수/실패/결과 불명과 중지·재개가 보여요.</p>`)}
  </div>`;

RENDER['b-sendlog'] = () => `<div class="page-head"><div><h1>발송 내역</h1><p>보낸 묶음마다 결과를 나눠 보여요. 숫자는 예시예요.</p></div></div>
  <ul class="rows"><li class="rowi"><div class="grow"><b>v3 · 예시 제품 A · 163명</b><div class="sub">메일 서비스 접수 140 · 대기 12 · 반송 3 · 결과 모름 8 → 직접 확인 ${b('A06', { noId: true })}</div></div>${chip('일부 확인 필요', 'warn')}${demoBtn('결과 모름 8명 보기')}</li>
    <li class="rowi"><div class="grow"><b>v2 · 예시 제품 B · 40명</b><div class="sub">접수 40 · 답장 6</div></div>${chip('완료', 'ok')}${goBtn('답장 보기', 'b-reply')}</li></ul>`;

RENDER['b-billing'] = () => `<div class="page-head"><div><h1>월별 청구 ${b('B13', { noId: true })}</h1><p>이번 달 이용료와 사용 내역. 금액은 디자인 예시예요.</p></div></div>
  ${existFor('B13')}
  <div class="grid g3"><div class="stat"><span class="l">이번 달 청구 예정</span><br><span class="n">— USD</span><br><span class="s">실제 금액은 실제 화면 참조</span></div><div class="stat"><span class="l">운영 서비스</span><br><span class="s">사용 내역 보기</span></div><div class="stat"><span class="l">비용·결과</span><br>${goBtn('비용·결과 보기', 'b-results')}</div></div>`;

/* =====================================================================
   크리에이터 (app.theprlist.net · 고려공작1392)
   ===================================================================== */
const chLocal = [];
RENDER['c-community'] = () => `<div class="v2-ch">
  <div class="v2-chhead"><h1># 자유 대화 <span class="small muted">고려공작1392(디자인 예시)</span></h1>
    <div class="btns" style="margin:0">${demoBtn('채널 검색', '', '채널 안 검색(시안)')}${demoBtn('언어', '', '번역 언어 선택(시안)')}${demoBtn('정보', '', '채널 정보(시안)')}</div></div>
  ${tabs('ch', [['msg', '메시지'], ['camp', '캠페인 정보'], ['work', '내 협업·제출']], 'msg')}
  ${panel('ch', 'msg', 'msg', `<p class="alert info small">메시지는 내 번역 언어(English)로 함께 보여요. 원문 보기 가능. ${b('C10', { noId: true })}</p>
    <div class="card primary-card v2-welcome"><h3>새로 오셨군요, 환영해요 ${b('C11')}</h3>
      <ol class="small"><li><b>첫 행동:</b> 자기소개 한 줄 남기기 ${demoBtn('자기소개 쓰기')}</li>
      <li><b>이번 주 기회:</b> 예시 제품 A 영상 1개 · 마감 10/30 ${sheetBtn('조건 보기', 'c-detail', 'pri')}</li>
      <li><b>질문 바로가기:</b> 운영 시간 평일 9–18시 ${demoBtn('질문 남기기')}</li></ol></div>
    <div class="v2-feed">
      <div class="msg"><p class="small muted">브랜드 담당자(예시) · 09:10</p><p>예시 제품 A 영상 협업을 열었어요. 조건은 ‘캠페인 정보’ 탭에서 볼 수 있어요.</p><button type="button" class="btn" data-act="ch-tab" data-k="camp">캠페인 정보 보기</button></div>
      <div class="msg"><p class="small muted">민지(예시) · 09:40</p><p>Got my sample today! 😊</p><p class="small muted">번역: 오늘 샘플 받았어요!</p></div>
      ${chLocal.map(t => `<div class="msg me"><p class="small muted">나 · 방금 (시안·전송 안 됨)</p><p>${esc(t)}</p></div>`).join('')}
    </div>
    <div class="v2-compose"><label class="sr" for="ch-in">메시지 입력</label><textarea id="ch-in" placeholder="메시지 입력 (시안: 전송되지 않아요)"></textarea>
      <div class="btns" style="margin:0">${demoBtn('첨부', '', '시안: 파일을 올리지 않아요.')}<button type="button" class="btn pri" data-act="ch-send">전송</button></div></div>`)}
  ${panel('ch', 'camp', 'msg', `<div class="cond"><h3>예시 제품 A 영상 1개 ${b('C05', { noId: true })} ${b('X02', { noId: true })} ${chip('조건 v1', 'plum')}</h3>
      <div class="big"><div>받는 것<b>100 USD</b>+ 제품 1개</div><div>할 일<b>영상 1개</b>TikTok</div><div>기한<b>받은 뒤 14일</b>수정 최대 2회</div><div>광고 사용<b>없음</b>내 계정만</div></div>
      <p class="small">범위: 고려공작1392(디자인 예시) 캠페인만 · 지급: 브랜드 확인 통과 후 14일 이내</p></div>
    <div class="btns">${sheetBtn('조건 보고 지원하기', 'c-detail', 'pri')}${goBtn('전체 캠페인 보기', 'c-campaigns')}</div>`)}
  ${panel('ch', 'work', 'msg', `<ul class="rows"><li class="rowi"><div class="grow"><b>주소 입력하기</b><div class="sub">오늘 23:59 (ET)까지 · 샘플 출발에 필요</div></div>${sheetBtn('주소 입력', 'c-address', 'pri')}<span>${b('C07', { noId: true })}</span></li>
    <li class="rowi"><div class="grow"><b>영상 수정본 내기</b><div class="sub">11/2까지 · 남은 수정 1회</div></div>${sheetBtn('제출·수정', 'c-submit')}<span>${b('C08', { noId: true })}</span></li>
    <li class="rowi"><div class="grow"><b>브랜드 답변 기다림</b><div class="sub">주말 촬영 질문 · 2일째</div></div>${goBtn('내 할 일 전체', 'c-tasks')}</li></ul>`)}
  </div>`;
ACT['ch-tab'] = el => { activateTab('ch', el.dataset.k); const t = document.querySelector('[data-tabgroup="ch"] [aria-selected="true"]'); if (t) t.focus(); };
ACT['ch-send'] = () => {
  const i = document.getElementById('ch-in'); const v = i.value.trim();
  if (!v) { i.setAttribute('aria-invalid', 'true'); toast('메시지를 입력해 주세요.'); i.focus(); return; }
  chLocal.push(v); render(); toast('시안: 이 화면에만 표시했어요. 실제로 전송되지 않습니다.'); const n = document.getElementById('ch-in'); if (n) n.focus();
};

RENDER['c-campaigns'] = () => `<div class="creator-wrap">${tabs('cc', [['all', '모든 캠페인 3'], ['saved', '저장 0'], ['applied', '신청 1']], 'all')}
  <p class="small muted">범위: <b>고려공작1392(디자인 예시)</b> 안의 캠페인 · ${demoBtn('참여 브랜드 전체 보기', 'ghost', '참여 중인 모든 브랜드의 캠페인(시안)')}</p>
  ${panel('cc', 'all', 'all', brandify(V1['c-campaigns'](), 'creator'))}
  ${panel('cc', 'saved', 'all', `<div class="alert info">저장한 캠페인이 없어요 (불러오기 성공, 0건). 캠페인 카드의 ‘저장’을 누르면 여기에 모여요.</div>`)}
  ${panel('cc', 'applied', 'all', `<ul class="rows"><li class="rowi"><div class="grow"><b>예시 제품 A 영상</b><div class="sub">신청번호 AP-1042(예시) · 결과 예정 10/29</div></div>${chip('검토 중', 'info')}${goBtn('신청 기록', 'c-tasks')}</li></ul>`)}</div>`;

RENDER['c-work'] = () => `<div class="creator-wrap"><p class="small muted">‘선정된 나의 협업’은 ‘내 할 일’과 같은 기록을 진행 탭 중심으로 보여 줘요.</p></div>${brandify(V1['c-tasks'](), 'creator')}`;

RENDER['c-ranking'] = () => `<div class="creator-wrap"><div class="page-head"><div><h1>브랜드 랭킹 ${b('C11', { noId: true })}</h1><p>이미 있는 랭킹 화면을 알기 쉽게 바꾸는 예시예요.</p></div></div>
  ${stateDemo('c-rank')}
  ${stateOk('c-rank') ? `<div class="card"><h3>점수 기준</h3><p class="small">질문 답변 +5 · 후기 공유 +10 · 협업 완료 +30 (예시). 판매 성과·보상은 랭킹에 쓰지 않아요.</p></div>
  <div class="card" style="margin-top:12px"><h3>내 위치</h3><p>아직 점수가 없어요. <b>첫 점수 받는 법:</b> #자유대화에서 질문에 답해 보세요.</p>${goBtn('#자유대화로', 'c-community', 'pri')}
    <div class="radios" style="margin-top:10px"><label><input type="checkbox" checked> 랭킹에 내 이름 숨기기</label></div></div>
  <div class="card" style="margin-top:12px"><h3>이번 달 (예시)</h3><ol class="small"><li>크리에이터 A(예시) · 85점</li><li>크리에이터 B(예시) · 60점</li><li>크리에이터 C(예시) · 45점</li></ol></div>` : ''}</div>`;

RENDER['c-missions'] = () => `<div class="creator-wrap"><div class="page-head"><div><h1>미션·배지 <span class="chip plum">Lv.1</span> ${b('C11', { noId: true })}</h1><p>지금 할 수 있는 것과 기다리는 것을 나눠 보여 줘요.</p></div></div>
  ${stateDemo('c-mis')}
  ${stateOk('c-mis') ? `<div class="card"><h3>지금 할 수 있어요</h3><ul class="check"><li><span class="ic todo">○</span><div>자기소개 남기기 ${goBtn('하러 가기', 'c-community', 'pri')}</div></li></ul></div>
  <div class="card" style="margin-top:12px"><h3>기다리는 중</h3><ul class="check"><li><span class="ic wait">…</span><div>첫 영상 올리기 <div class="small muted">샘플을 받으면 시작돼요 · 배송 중 (도착 예정 10/28)</div></div></li></ul></div>
  <div class="card" style="margin-top:12px"><h3>완료</h3><ul class="check"><li><span class="ic ok">✓</span><div>커뮤니티 가입</div></li><li><span class="ic no">!</span><div>‘첫 질문’ 배지 받기 실패 ${demoBtn('다시 시도')}</div></li></ul></div>` : ''}</div>`;

RENDER['c-announcements'] = () => `<div class="creator-wrap"><div class="page-head"><div><h1>공지사항</h1><p>공지를 누르면 관련 협업으로 바로 이동해요. ${b('X03', { noId: true })}</p></div></div>
  ${stateDemo('c-ann')}
  ${stateOk('c-ann') ? `<ul class="rows"><li class="rowi"><div class="grow"><b>예시 제품 A 영상 협업이 열렸어요</b><div class="sub">10/26 · 미국 멤버 대상</div></div>${goBtn('협업 보기', 'c-campaigns', 'pri')}</li>
    <li class="rowi"><div class="grow"><b>운영 시간 안내</b><div class="sub">10/02</div></div>${chip('읽음')}</li></ul>` : ''}</div>`;

RENDER['c-recruit'] = () => `<div class="creator-wrap"><div class="page-head"><div><h1># 모집채널</h1><p>새 협업 모집 글이 올라오는 채널이에요.</p></div></div>
  <div class="msg"><p class="small muted">브랜드 담당자(예시) · 10/26 09:00</p><p><b>예시 제품 A 영상 1개</b> — 100 USD + 제품 · 받은 뒤 14일 · 광고 사용 없음</p>${sheetBtn('조건 보기', 'c-detail', 'pri')}</div>
  <div class="msg"><p class="small muted">10/12</p><p>예시 제품 B 체험 — 모집 마감</p>${chip('마감')}</div></div>`;

RENDER['c-helpdesk'] = () => `<div class="creator-wrap"><div class="page-head"><div><h1>도움말</h1><p>막혔을 때 어디에 물어볼지 알려 드려요.</p></div>${sheetBtn('도움 요청·신고', 'c-help', 'pri')}</div>
  ${existFor('C12')}<ul class="rows"><li class="rowi"><div class="grow"><b>보상이 언제 들어와요?</b></div>${goBtn('받을 보상 보기', 'c-rewards')}</li><li class="rowi"><div class="grow"><b>주소를 바꾸고 싶어요</b></div>${goBtn('내 할 일', 'c-tasks')}</li><li class="rowi"><div class="grow"><b>내 문의 보기</b></div>${goBtn('브랜드 담당자', 'c-messages')}</li></ul></div>`;

/* =====================================================================
   관리자 (admin.theprlist.net)
   ===================================================================== */
RENDER['a-today'] = () => brandify(V1['a-today'](), 'admin');

const SCREEN_EXIST = { 'a-onboard': 'A02', 'a-reports': 'A04', 'a-reports-dis': 'A05', 'a-review': 'A03', 'a-connections': 'A06', 'a-people': 'A07', 'a-finance': 'A08', 'c-tasks': 'C06', 'b-reply': 'B07', 'b-team': 'B14', 'b-create': 'B04' };
RENDER['a-reports-dis'] = () => brandify(V1['a-reports'](), 'admin');
AFTER['a-reports-dis'] = () => activateTab('rp', 'dis');

const RC = [['r1', '1 브랜드 선택'], ['r2', '2 제안 확인'], ['r3', '3 대상 찾기'], ['r4', '4 메일 나누기'], ['r5', '5 최종 확인']];
const RS = [['s1', '모집 시작'], ['s2', '반복 모집'], ['s3', '발송 내역'], ['s4', '크리에이터·메일'], ['s5', '회신·성과'], ['s6', '테스트 발송'], ['s7', '브랜드 승인·커뮤니티'], ['s8', '브랜드·메일 설정']];
RENDER['a-recruit'] = () => `<div class="page-head"><div><h1>디노 공용 모집 ${b('B06', { noId: true })}</h1><p>현재 있는 5단계와 보조 탭을 유지하고 각 단계의 할 일을 분명히 하는 예시예요. 실제 발송 없음.</p></div></div>
  ${tabs('rs', RS, 's1')}
  ${panel('rs', 's1', 's1', `<div class="steps" role="tablist" data-tabgroup="rc">${RC.map(([k, l], i) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${i === 0}">${l}</button>`).join('')}</div>
    <div class="card">${panel('rc', 'r1', 'r1', `<div class="field"><label for="rc-b">브랜드<span class="req">필수</span></label><select id="rc-b"><option>FAU(디자인 예시)</option><option>고려공작1392(디자인 예시)</option></select><span class="hint">브랜드 승인·메일 설정이 끝난 브랜드만 고를 수 있어요.</span></div>`)}
      ${panel('rc', 'r2', 'r1', `<div class="cond"><b>예시 제품 A 영상 1개</b> · 고정비 100 USD · 받은 뒤 14일 · 광고 사용 미포함 ${chip('조건 v1', 'plum')}</div>`)}
      ${panel('rc', 'r3', 'r1', `<p>후보 풀에서 미국·스킨케어·연락 가능 조건으로 180명 (예시)</p>${goBtn('후보 풀 보기', 'a-pool')}`)}
      ${panel('rc', 'r4', 'r1', `<p>보내는 계정 3개에 하루 한도 안에서 나눠요: 60 / 60 / 60 (예시) ${b('A06', { noId: true })}</p>`)}
      ${panel('rc', 'r5', 'r1', `<p>대상 180명 · 제외 이유 확인 완료 · 승인자 지정</p><button type="button" class="btn pri" disabled>보내기 (시안에서는 불가)</button>`)}</div>`)}
  ${RS.slice(1).map(([k, l]) => panel('rs', k, 's1', `<div class="card"><h3>${l}</h3><p class="small muted">현재 있는 보조 탭입니다. 시안에서는 구조만 보여 주고 실제 데이터는 표시하지 않아요.</p>${k === 's3' ? goBtn('Gmail 운영에서 결과 보기', 'a-connections') : k === 's6' ? demoBtn('테스트 발송', '', '시안: 실제 테스트 메일도 보내지 않아요.') : ''}</div>`)).join('')}`;

RENDER['a-brands'] = () => `<div class="page-head"><div><h1>브랜드 운영 ${b('A07', { noId: true })}</h1><p>브랜드를 고르고 팀과 접근 권한을 확인하세요.</p></div></div>
  ${existFor('A07')}<ul class="rows">
    <li class="rowi"><div class="grow"><b>FAU(디자인 예시)</b><div class="sub">운영 중 · 멤버 4 · 팀 1 (예시)</div></div>${chip('운영 중', 'ok')}${goBtn('사람·권한', 'a-people', 'pri')}${demoBtn('감사 로그')}${demoBtn('정지', 'danger', '시안: 실제 정지는 없어요. 실제 화면에서는 사유 입력 후 확인 단계를 거쳐요.')}</li>
    <li class="rowi"><div class="grow"><b>고려공작1392(디자인 예시)</b><div class="sub">운영 중 · 멤버 2 (예시)</div></div>${chip('운영 중', 'ok')}${goBtn('사람·권한', 'a-people')}</li>
    <li class="rowi"><div class="grow"><b>브랜드 C(예시)</b><div class="sub">정지 사유: 결제 미확인 (예시)</div></div>${chip('정지', 'err')}${demoBtn('감사 로그')}</li></ul>`;

RENDER['a-mailbox'] = () => `<div class="page-head"><div><h1>계정별 메일함</h1><p>계정을 고른 뒤 메일과 관련 협업을 확인하세요.</p></div></div>
  <div class="three"><div class="card"><h3>계정 ${b('A06', { noId: true })}</h3><ul class="rows"><li class="rowi"><div class="grow"><b>brand@fau-example.com</b><div class="sub">받기 끊김 · 5시간 전 (예시)</div></div>${chip('확인 필요', 'warn')}</li><li class="rowi"><div class="grow"><b>recruit@dino-example.com</b></div>${chip('정상', 'ok')}</li></ul></div>
  <div class="card"><h3>목록</h3><ul class="rows"><li class="rowi"><div class="grow"><b>민지(예시)</b><div class="sub">Re: 예시 제품 A 협업 · 협업 연결됨 ${b('B07', { noId: true })}</div></div></li><li class="rowi"><div class="grow"><b>Jordan(예시)</b><div class="sub">협업 연결 안 됨 → 연결하기</div></div></li></ul></div>
  <div class="card"><h3>메일</h3><div class="msg"><p class="small muted">민지(예시) · 10/24</p><p>Is the 100 USD per video?</p></div><p class="small muted">답장은 브랜드 담당자가 아웃리치·인박스에서 해요.</p></div></div>`;

RENDER['a-pool'] = () => `<div class="page-head"><div><h1>후보 풀 ${b('B05', { noId: true })}</h1><p>후보 목록 · 분류 · 근거를 함께 보여 줘요. 이름·연락처는 예시예요.</p></div></div>
  <div class="btns" style="margin-top:0">${['미국', '스킨케어', '연락 가능', '수신 거부 제외'].map(f => `<span class="chip plum">${f} ✓</span>`).join(' ')}</div>
  <ul class="rows" style="margin-top:12px"><li class="rowi"><div class="grow"><b>크리에이터 A(예시)</b><div class="sub">분류: 스킨케어 · 근거: 최근 30일 리뷰 영상 2개 · 출처 공개 프로필, 10/20 조회</div></div>${chip('연락 가능', 'ok')}</li>
    <li class="rowi"><div class="grow"><b>크리에이터 B(예시)</b><div class="sub">분류: 미확인 · 팔로워 수 미확인</div></div>${chip('근거 부족', 'warn')}${demoBtn('분류 고치기')}</li></ul>`;

/* 화면별 ‘현재 있는 기능’ 상자 */
Object.entries(SCREEN_EXIST).forEach(([k, id]) => { const f = RENDER[k]; RENDER[k] = () => existFor(id) + f(); });

/* 현재 캡처와 개선 시안의 같은 업무 화면을 연결 */
const REF_SCREEN = {'brand-home':'b-today','brand-learning':'b-learning','brand-products':'b-products','brand-campaign-draft':'b-create','brand-community':'b-community','brand-outreach':'b-mailprep','brand-team':'b-team','brand-billing':'b-billing','creator-community':'c-community','creator-work':'c-tasks','creator-campaigns':'c-campaigns','creator-ranking':'c-ranking','creator-missions':'c-missions','creator-announcements':'c-announcements','admin-dashboard':'a-today','admin-applications':'a-onboard','admin-reports':'a-reports','admin-disputes':'a-reports-dis','admin-submissions':'a-review','admin-recruitment':'a-recruit','admin-brands':'a-brands','admin-gmail':'a-connections','admin-pool':'a-pool'};
document.addEventListener('click', e => {
  const mode = e.target.closest('[data-mode]'); if (!mode) return;
  if (mode.dataset.mode === 'proposal' && view.mode === 'current') {
    const page = refSel[view.role] || REFS.roles[view.role].default;
    if (REF_SCREEN[page]) view.screen[view.role] = REF_SCREEN[page];
  } else if (mode.dataset.mode === 'current' && view.mode === 'proposal') {
    const page = Object.keys(REF_SCREEN).find(k => REF_SCREEN[k] === view.screen[view.role]);
    if (page) { refSel[view.role] = page; lsSet(V2_LS_REF, refSel); }
  }
}, true);
/* ---------- 시작 ---------- */
render();
