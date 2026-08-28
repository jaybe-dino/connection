/** 커넥션 도메인 타입 — 기획안 v1.0 §4 기능 명세 기준. */

export type Platform = "tiktok" | "instagram";
export type Locale = "ko" | "th" | "en" | "vi";

/** 크리에이터 패스 — 계정 1개 = N개 브랜드 멤버십 */
export interface CreatorPass {
  id: string;
  handle: string;
  platform: Platform;
  displayName: string;
  verified: boolean; // SNS_VERIFIED
  locale: Locale; // IP 초기값 · 수동 변경 가능 (P0)
  grade: "mega" | "macro" | "mid" | "micro" | "nano";
  completionRate: number; // 완주율 — 기록은 본인 소유
  memberships: string[]; // brandId[]
}

export interface Brand {
  id: string; // slug — connection.app/{brand}
  name: string;
  category: string;
  locale: Locale;
  plan: "starter" | "growth" | "enterprise";
}

/** 셀 — 브랜드가 소유하는 커뮤니티 방. 채널 3개 고정. */
export type CellChannel = "chat" | "tips" | "notice";

export interface CellMessage {
  id: string;
  channel: CellChannel;
  author: string; // handle 또는 'ari' 또는 브랜드 멤버
  authorKind: "creator" | "ari" | "brand";
  original: string; // 원문
  originalLocale: Locale;
  translations: Partial<Record<Locale, string>>; // 시청자 언어 자동 표시
  at: string;
  campaignCardId?: string; // 공지 채널 캠페인 카드
}

export interface Cell {
  id: string;
  brandId: string;
  name: string;
  memberCount: number; // 상한 없음
  visibility: "invite_only" | "apply_approve" | "public";
  messages: CellMessage[];
}

/** 캠페인 — 보상 유형 3종 */
export type RewardType = "paid" | "gifted" | "affiliate";

export interface Campaign {
  id: string;
  brandId: string;
  name: string;
  product: string;
  imageEmoji: string; // 데모용 — 프로덕션은 이미지 URL
  usp: string; // 브랜드 프로필 '고객의 언어'에서 선택
  rewardType: RewardType;
  rewardAmount?: number; // 유가: 고정 보상(현지 통화 표기)
  affiliatePct?: number;
  conditions: string[]; // 길이·노출·표기(#ad)
  capacity: number;
  deadline: string;
  status: "draft" | "open" | "selecting" | "shipping" | "reviewing" | "done";
  myStatus?: "none" | "applied" | "selected" | "shipping" | "submitted" | "passed";
  tracking?: ShippingInfo; // P0 배송 추적
}

export interface ShippingInfo {
  carrier: string;
  trackingNo: string;
  steps: { label: string; done: boolean; at?: string }[];
}

export interface Submission {
  id: string;
  campaignId: string;
  url: string;
  autoChecks: { label: string; pass: boolean }[]; // 길이·노출·#ad·금지어 4종
  status: "checking" | "needs_fix" | "in_review" | "passed";
}

export interface PayoutItem {
  id: string;
  campaignId: string;
  brandId: string;
  amount: number;
  currency: string;
  status: "scheduled" | "paid";
  at: string;
}

/** 게이트 — 4종, 항상 사람 승인 */
export type GateKind = "PII" | "PAYOUT" | "OUTBOUND" | "PUBLISH";
export type GateState = "PENDING" | "HELD" | "APPROVED" | "REJECTED";

export interface GateCard {
  id: string;
  kind: GateKind;
  summary: string;
  detail: string;
  requestedBy: string; // 'ari'
  state: GateState;
  at: string;
}

export type NotifType =
  | "selected"
  | "shipping"
  | "review_result"
  | "payout"
  | "deadline_d3";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  read: boolean;
  at: string;
}

/** DB 세그먼트 (콘솔 §4.6) */
export type Segment =
  | "all"
  | "active"
  | "new"
  | "invited"
  | "dormant"
  | "churned"
  | "billing_excluded";

export interface DbCreatorRow {
  id: string;
  handle: string;
  platform: Platform;
  country: string;
  grade: CreatorPass["grade"];
  segment: Segment;
  influence: number;
  fieldsWithBasis: { field: string; basis: string }[]; // 보유 필드와 근거
}

export const LOCALE_LABEL: Record<Locale, string> = {
  ko: "한국어",
  th: "ไทย",
  en: "English",
  vi: "Tiếng Việt",
};

export const GATE_LABEL: Record<GateKind, string> = {
  PII: "개인정보 제공",
  PAYOUT: "정산 실행",
  OUTBOUND: "외부 발송",
  PUBLISH: "공개 게시",
};
