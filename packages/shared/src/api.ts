/** 커넥션 API 클라이언트 — API가 죽어 있으면 호출부가 목데이터로 폴백한다.
 *
 * 사용: const gates = await api.gates().catch(() => mockGates)
 */

import type { AppNotification, Campaign, CellMessage, GateState } from "./index";

const BASE: string =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL) ||
  "http://localhost:8000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface ApiGate {
  id: string;
  kind: "PII" | "PAYOUT" | "OUTBOUND" | "PUBLISH";
  summary: string;
  detail: string;
  requestedBy: string;
  state: GateState;
  at: string;
}

export interface LedgerEntry {
  seq: number;
  ts: string;
  actor: string;
  type: string;
  subject: string;
  payload: Record<string, unknown>;
  hash: string;
}

export interface Me {
  id: string;
  handle: string;
  platform: string;
  displayName: string;
  verified: boolean;
  locale: string;
  grade: string;
  completionRate: number;
  memberships: string[];
  fields: Record<string, { value: string; basis: string }>;
}

export const api = {
  base: BASE,

  health: () => req<{ ok: boolean; ai: boolean }>("/health"),

  // 게이트
  gates: (brand = "glowlab") => req<ApiGate[]>(`/gates?brand=${brand}`),
  approveGate: (id: string, memberId: string) =>
    req<{ state: GateState }>(`/gates/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ member_id: memberId }),
    }),
  holdGate: (id: string, memberId: string, note?: string) =>
    req<{ state: GateState }>(`/gates/${id}/hold`, {
      method: "POST",
      body: JSON.stringify({ member_id: memberId, note }),
    }),
  rejectGate: (id: string, memberId: string, reason: string) =>
    req<{ state: GateState }>(`/gates/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ member_id: memberId, reason }),
    }),

  // 원장
  ledger: (limit = 50) =>
    req<{ chain_ok: boolean; entries: LedgerEntry[] }>(`/ledger?limit=${limit}`),

  // 알림
  notifications: (user: string) =>
    req<AppNotification[]>(`/notifications?user=${user}`),
  readNotification: (id: string) =>
    req<{ ok: boolean }>(`/notifications/${id}/read`, { method: "POST" }),

  // 셀
  cellMessages: (cellId: string) =>
    req<CellMessage[]>(`/cells/${cellId}/messages`),
  postCellMessage: (
    cellId: string,
    body: { author: string; author_kind: string; original: string; original_locale: string }
  ) =>
    req<{ id: string; translations: Record<string, string> }>(
      `/cells/${cellId}/messages`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  // 캠페인
  campaigns: (creator?: string, brand = "glowlab") =>
    req<Campaign[]>(`/campaigns?brand=${brand}${creator ? `&creator=${creator}` : ""}`),
  applyCampaign: (id: string, creatorId: string) =>
    req<{ myStatus: string }>(`/campaigns/${id}/apply`, {
      method: "POST",
      body: JSON.stringify({ creator_id: creatorId }),
    }),

  // 내 패스
  me: (creatorId: string) => req<Me>(`/me/${creatorId}`),
  updateField: (creatorId: string, field: string, value: string) =>
    req<{ ok: boolean }>(`/me/${creatorId}/fields`, {
      method: "PUT",
      body: JSON.stringify({ field, value }),
    }),
  updateLocale: (creatorId: string, locale: string) =>
    req<{ ok: boolean }>(`/me/${creatorId}/locale`, {
      method: "PUT",
      body: JSON.stringify({ locale }),
    }),

  // 아리
  ariChat: (message: string, history: { role: string; content: string }[] = []) =>
    req<{ reply: string; ai: boolean }>(`/ari/chat`, {
      method: "POST",
      body: JSON.stringify({ message, history }),
    }),
};
