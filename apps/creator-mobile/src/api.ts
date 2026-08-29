/** API 클라이언트 — 웹·네이티브 공용 (fetch 표준).
 *
 * 주소는 EXPO_PUBLIC_API_URL (빌드타임 공개 환경변수). 미설정·서버 다운 시
 * 호출부가 목데이터로 폴백한다 — 오프라인 데모 유지.
 */

import type { AppNotification, Campaign, CellMessage } from "@connection/shared";

const BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  base: BASE,
  notifications: (user: string) => req<AppNotification[]>(`/notifications?user=${user}`),
  readNotification: (id: string) =>
    req<{ ok: boolean }>(`/notifications/${id}/read`, { method: "POST" }),
  cellMessages: (cellId: string) => req<CellMessage[]>(`/cells/${cellId}/messages`),
  campaigns: (creator: string) => req<Campaign[]>(`/campaigns?creator=${creator}`),
  applyCampaign: (id: string, creatorId: string) =>
    req<{ myStatus: string }>(`/campaigns/${id}/apply`, {
      method: "POST", body: JSON.stringify({ creator_id: creatorId }),
    }),
  me: (creatorId: string) =>
    req<{ locale: string; fields: Record<string, { value: string }> }>(`/me/${creatorId}`),
  updateField: (creatorId: string, field: string, value: string) =>
    req<{ ok: boolean }>(`/me/${creatorId}/fields`, {
      method: "PUT", body: JSON.stringify({ field, value }),
    }),
  updateLocale: (creatorId: string, locale: string) =>
    req<{ ok: boolean }>(`/me/${creatorId}/locale`, {
      method: "PUT", body: JSON.stringify({ locale }),
    }),
};
