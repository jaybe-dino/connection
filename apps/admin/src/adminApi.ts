/** 어드민 API 클라이언트 — X-Admin-Id 헤더 스텁 (오픈 전 실인증·2FA 필수). */

const BASE: string =
  (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL ||
  new URLSearchParams(location.search).get("api") ||
  "http://localhost:8000";

const ADMIN_ID = "jay";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", "X-Admin-Id": ADMIN_ID },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface Summary {
  pendingApplications: number;
  openReports: number;
  openDisputes: number;
  inReviewSubmissions: number;
  brands: number;
  creators: number;
  pendingGates: number;
  ledgerEvents: number;
}

export interface Application {
  appId: string; slug: string; name: string; bizNo: string; category: string;
  countries: string[]; plan: string; siteUrl: string;
  answers: Record<string, string>; contact: string; at: string;
}

export interface Report {
  reportId: string; cellId: string; msgText: string | null; reason: string;
  detail: string; aiClass: string; severity: string; slaDue: string; at: string;
}

export interface Dispute {
  disputeId: string; kind: string; brandId: string; creatorId: string;
  campaignId: string | null; claim: string; state: string;
  verdictDue: string; at: string;
}

export interface Submission {
  submissionId: string; campaignId: string; campaignName: string; handle: string;
  url: string; caption: string; status: string;
  autoChecks: { label: string; pass: boolean; fix?: string | null }[]; at: string;
}

export const adminApi = {
  base: BASE,
  summary: () => req<Summary>("/admin/summary"),
  applications: (status = "pending") =>
    req<Application[]>(`/admin/applications?status=${status}`),
  approveApplication: (id: string) =>
    req<{ brandId: string }>(`/admin/applications/${id}/approve`, { method: "POST" }),
  rejectApplication: (id: string, reason: string) =>
    req(`/admin/applications/${id}/reject`, {
      method: "POST", body: JSON.stringify({ reason }),
    }),
  reports: (status = "open") => req<Report[]>(`/admin/reports?status=${status}`),
  actionReport: (id: string, action: string) =>
    req(`/admin/reports/${id}/action`, {
      method: "POST", body: JSON.stringify({ action }),
    }),
  disputes: () => req<Dispute[]>("/admin/disputes"),
  resolveDispute: (id: string, verdict: string) =>
    req(`/admin/disputes/${id}/resolve`, {
      method: "POST", body: JSON.stringify({ verdict }),
    }),
  submissions: (status = "in_review") =>
    req<Submission[]>(`/submissions?status=${status}`),
  reviewSubmission: (id: string, result: "passed" | "needs_fix", note = "") =>
    req(`/submissions/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ result, reviewer: ADMIN_ID, note }),
    }),
};
