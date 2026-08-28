/** 목데이터 — API 연동 전 화면 개발용. 프로토타입 데모 시나리오(GLOWLAB) 재현. */

import type {
  AppNotification,
  Brand,
  Campaign,
  Cell,
  CreatorPass,
  DbCreatorRow,
  GateCard,
  PayoutItem,
  Submission,
} from "./index";

export const mockBrand: Brand = {
  id: "glowlab",
  name: "GLOWLAB",
  category: "선케어·스킨케어",
  locale: "ko",
  plan: "growth",
};

export const mockMe: CreatorPass = {
  id: "c-mai",
  handle: "beauty.mai",
  platform: "tiktok",
  displayName: "Mai",
  verified: true,
  locale: "th",
  grade: "mid",
  completionRate: 0.92,
  memberships: ["glowlab", "aura"],
};

export const mockCells: Cell[] = [
  {
    id: "cell-glowlab-th",
    brandId: "glowlab",
    name: "GLOWLAB 태국 셀",
    memberCount: 34,
    visibility: "apply_approve",
    messages: [
      {
        id: "m1",
        channel: "chat",
        author: "ari",
        authorKind: "ari",
        original: "วันนี้ลองเล่าให้ฟังหน่อย — ครีมกันแดดที่ใช้แล้วไม่วอกแวก ตัวไหนดีสุด?",
        originalLocale: "th",
        translations: {
          ko: "오늘은 이야기해봐요 — 밀리지 않는 선크림, 어떤 게 제일 좋았어요?",
          en: "Tell us today — which sunscreen never budges for you?",
        },
        at: "09:00",
      },
      {
        id: "m2",
        channel: "chat",
        author: "nong.skin",
        authorKind: "creator",
        original: "ตัวใหม่ของ GLOWLAB เนื้อบางมาก ไม่เป็นคราบขาวเลยค่ะ",
        originalLocale: "th",
        translations: {
          ko: "GLOWLAB 신제품 발림이 진짜 얇아요, 백탁이 아예 없어요",
          en: "GLOWLAB's new one is so light, zero white cast",
        },
        at: "09:12",
      },
      {
        id: "m3",
        channel: "notice",
        author: "ari",
        authorKind: "ari",
        original: "[캠페인] 톤업 선세럼 리뷰 — 유가 · 정원 10명 · 9/15 마감",
        originalLocale: "ko",
        translations: {
          th: "[แคมเปญ] รีวิวโทนอัพซันเซรั่ม — มีค่าตอบแทน · รับ 10 คน · ปิด 15 ก.ย.",
          en: "[Campaign] Tone-up sun serum review — paid · 10 slots · closes Sep 15",
        },
        at: "어제",
        campaignCardId: "cmp-1",
      },
      {
        id: "m4",
        channel: "tips",
        author: "glow.linh",
        authorKind: "creator",
        original: "Quay ngoài trời lúc 4-5h chiều, ánh sáng đẹp nhất nhé",
        originalLocale: "vi",
        translations: {
          ko: "야외 촬영은 오후 4~5시가 빛이 제일 예뻐요",
          th: "ถ่ายกลางแจ้งช่วง 4-5 โมงเย็น แสงสวยที่สุด",
        },
        at: "2일 전",
      },
    ],
  },
  {
    id: "cell-aura-th",
    brandId: "aura",
    name: "AURA 태국 셀",
    memberCount: 21,
    visibility: "invite_only",
    messages: [],
  },
];

export const mockCampaigns: Campaign[] = [
  {
    id: "cmp-1",
    brandId: "glowlab",
    name: "톤업 선세럼 리뷰",
    product: "GLOWLAB 톤업 선세럼 SPF50+",
    imageEmoji: "🧴",
    usp: "백탁 없이 한 톤 환하게",
    rewardType: "paid",
    rewardAmount: 1500,
    conditions: ["30초 이상", "얼굴 노출", "#ad 표기"],
    capacity: 10,
    deadline: "2026-09-15",
    status: "open",
    myStatus: "selected",
    tracking: {
      carrier: "Flash Express",
      trackingNo: "TH2026082801",
      steps: [
        { label: "PII 승인", done: true, at: "8/26" },
        { label: "발송", done: true, at: "8/27" },
        { label: "배송 중", done: true },
        { label: "배송 완료", done: false },
      ],
    },
  },
  {
    id: "cmp-2",
    brandId: "glowlab",
    name: "수분 크림 체험단",
    product: "GLOWLAB 워터배리어 크림",
    imageEmoji: "🫧",
    usp: "속당김 잡는 수분막",
    rewardType: "gifted",
    conditions: ["게시 의무 없음"],
    capacity: 30,
    deadline: "2026-09-30",
    status: "open",
    myStatus: "none",
  },
  {
    id: "cmp-3",
    brandId: "glowlab",
    name: "선스틱 어필리에이트",
    product: "GLOWLAB 포켓 선스틱",
    imageEmoji: "🖍️",
    usp: "화장 위에 바로 덧바르는",
    rewardType: "affiliate",
    affiliatePct: 12,
    conditions: ["전용 링크 사용", "#ad 표기"],
    capacity: 50,
    deadline: "2026-10-15",
    status: "open",
    myStatus: "applied",
  },
];

export const mockSubmissions: Submission[] = [
  {
    id: "sub-1",
    campaignId: "cmp-1",
    url: "https://www.tiktok.com/@beauty.mai/video/731…",
    autoChecks: [
      { label: "길이 30초+", pass: true },
      { label: "얼굴 노출", pass: true },
      { label: "#ad 표기", pass: false },
      { label: "금지어 없음", pass: true },
    ],
    status: "needs_fix",
  },
];

export const mockPayouts: PayoutItem[] = [
  {
    id: "pay-1",
    campaignId: "cmp-1",
    brandId: "glowlab",
    amount: 1500,
    currency: "THB",
    status: "scheduled",
    at: "검수 통과 시",
  },
  {
    id: "pay-0",
    campaignId: "cmp-0",
    brandId: "aura",
    amount: 1200,
    currency: "THB",
    status: "paid",
    at: "2026-08-10",
  },
];

export const mockGates: GateCard[] = [
  {
    id: "g1",
    kind: "PII",
    summary: "cmp-1 선정 10명 배송 주소 전달",
    detail: "물류사 CSV 내보내기 — 주소·연락처 포함",
    requestedBy: "ari",
    state: "PENDING",
    at: "10분 전",
  },
  {
    id: "g2",
    kind: "OUTBOUND",
    summary: "메일 시퀀스 1단 80건 발송",
    detail: "태국 mid 등급 · 검증 이메일만 · 스팸 점수 0.4",
    requestedBy: "ari",
    state: "PENDING",
    at: "1시간 전",
  },
  {
    id: "g3",
    kind: "PAYOUT",
    summary: "8월 정산 3건 ฿4,200 실행",
    detail: "검수 통과 3건 — PingPong 일괄",
    requestedBy: "ari",
    state: "PENDING",
    at: "2시간 전",
  },
  {
    id: "g4",
    kind: "PUBLISH",
    summary: "주간 피드 공지 게시 (태국 셀)",
    detail: "멤버 콘텐츠 큐레이션 4건 — 아리 초안",
    requestedBy: "ari",
    state: "PENDING",
    at: "어제",
  },
];

export const mockNotifications: AppNotification[] = [
  {
    id: "n1",
    type: "selected",
    title: "톤업 선세럼 리뷰에 선정되었습니다",
    body: "배송 준비가 시작돼요",
    read: false,
    at: "오늘 10:02",
  },
  {
    id: "n2",
    type: "shipping",
    title: "샘플이 배송 중입니다",
    body: "Flash Express TH2026082801",
    read: false,
    at: "오늘 09:40",
  },
  {
    id: "n3",
    type: "deadline_d3",
    title: "제출 마감 D-3",
    body: "톤업 선세럼 리뷰 · 9/15 마감",
    read: true,
    at: "어제",
  },
];

export const mockDbRows: DbCreatorRow[] = [
  {
    id: "c-mai",
    handle: "beauty.mai",
    platform: "tiktok",
    country: "TH",
    grade: "mid",
    segment: "active",
    influence: 64,
    fieldsWithBasis: [
      { field: "배송 주소", basis: "브랜드 동의 (8/20)" },
      { field: "이메일", basis: "본인 입력 (8/20)" },
      { field: "피부 타입", basis: "본인 입력 (8/22)" },
    ],
  },
  {
    id: "c-linh",
    handle: "glow.linh",
    platform: "tiktok",
    country: "VN",
    grade: "micro",
    segment: "new",
    influence: 61,
    fieldsWithBasis: [{ field: "이메일", basis: "본인 입력 (8/25)" }],
  },
  {
    id: "c-nong",
    handle: "nong.skin",
    platform: "instagram",
    country: "TH",
    grade: "micro",
    segment: "active",
    influence: 58,
    fieldsWithBasis: [
      { field: "배송 주소", basis: "브랜드 동의 (8/18)" },
      { field: "계좌", basis: "본인 입력 (8/19)" },
    ],
  },
  {
    id: "c-kate",
    handle: "sunlover.us",
    platform: "tiktok",
    country: "US",
    grade: "macro",
    segment: "billing_excluded",
    influence: 51,
    fieldsWithBasis: [{ field: "이메일", basis: "공개 bio (8/15)" }],
  },
];
