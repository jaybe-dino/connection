/** 어드민 API 클라이언트 — X-Admin-Id 헤더 스텁 (오픈 전 실인증·2FA 필수). */

const BASE: string =
  (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL ||
  (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? new URLSearchParams(location.search).get("api") : null) ||
  (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? "http://localhost:8000"
    : "https://api.theprlist.net");

const ADMIN_ID = "jay";

// 간이 키 인증: ?key=… 로 접속하면 저장되고, 서버에 ADMIN_KEY 가 설정돼 있으면 검증된다.
const keyParam = new URLSearchParams(location.search).get("key");
if (keyParam) localStorage.setItem("CONNECTION_ADMIN_KEY", keyParam);
const ADMIN_KEY = localStorage.getItem("CONNECTION_ADMIN_KEY") || "";

const jwt = () => localStorage.getItem("CONNECTION_JWT") || "";
export const setJwt = (t: string) => localStorage.setItem("CONNECTION_JWT", t);
export const clearJwt = () => localStorage.removeItem("CONNECTION_JWT");

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const t = jwt();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Id": ADMIN_ID,
      ...(ADMIN_KEY ? { "X-Admin-Key": ADMIN_KEY } : {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/* ── 실인증 ── */
export interface AuthUser {
  userId: string; kind: string; email: string;
  brandId: string | null; totpEnabled: boolean;
}
export const authApi = {
  status: () => req<{ authRequired: boolean; hasAdmin: boolean }>("/auth/status"),
  bootstrap: (email: string, password: string) =>
    req<{ token: string; user: AuthUser }>("/auth/bootstrap",
      { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    req<{ token: string; user: AuthUser; needOtp?: boolean }>("/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }),
  otpVerify: (pending: string, code: string) =>
    fetch(`${BASE}/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json",
                 Authorization: `Bearer ${pending}` },
      body: JSON.stringify({ code }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<{ token: string; user: AuthUser }>;
    }),
  me: () => req<AuthUser>("/auth/me"),
  otpSetup: () =>
    req<{ secret: string; otpauthUri: string }>("/auth/otp/setup",
      { method: "POST", body: "{}" }),
  otpEnable: (code: string) =>
    req<{ ok: boolean }>("/auth/otp/enable",
      { method: "POST", body: JSON.stringify({ code }) }),
};

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
    req<{ brandId: string; inviteLink?: string }>(`/admin/applications/${id}/approve`, { method: "POST" }),
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
