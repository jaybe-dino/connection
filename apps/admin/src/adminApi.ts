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
  resetRequest: (email: string) =>
    req<{ ok: boolean; message: string }>("/auth/reset/request",
      { method: "POST", body: JSON.stringify({ email }) }),
  resetConfirm: (token: string, password: string) =>
    req<{ ok: boolean; kind: string; message: string }>("/auth/reset/confirm",
      { method: "POST", body: JSON.stringify({ token, password }) }),
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
  batchMail:(id:string,q='',view='all',offset=0)=>req<any>('/admin/recruitment/mail/batches/'+encodeURIComponent(id)+'?'+new URLSearchParams({q,view,offset:String(offset)})),
  batchMailRecipient:(id:string,rid:string,cursor:any={})=>req<any>('/admin/recruitment/mail/batches/'+encodeURIComponent(id)+'/recipients/'+encodeURIComponent(rid)+'?'+new URLSearchParams(cursor)),
  crmMessage:(id:string,mid:number,account_id='')=>req<any>('/admin/recruitment/contacts/'+encodeURIComponent(id)+'/message/'+mid+'?'+new URLSearchParams(account_id?{account_id}:{})),
  crmList:(q='',status='',offset=0,account_id='',folder='replied')=>req<any>('/admin/recruitment/contacts?'+new URLSearchParams({q,status,offset:String(offset),...(account_id?{account_id}:{}),folder})),
  mailboxAuthentication:(aid:string)=>req<any>('/admin/recruitment/mailboxes/'+encodeURIComponent(aid)+'/authentication'),
  mailboxMessages:(aid:string,folder:string,q:string,offset=0)=>req<any>('/admin/recruitment/mailboxes/'+encodeURIComponent(aid)+'/messages?'+new URLSearchParams({folder,q,offset:String(offset)})),
  crmMailboxes:()=>req<any>('/admin/recruitment/contacts/mailboxes'),
  crmRead:(id:string,account_id:string,through_msg_id:number)=>req<any>('/admin/recruitment/contacts/'+encodeURIComponent(id)+'/read',{method:'POST',body:JSON.stringify({account_id,through_msg_id})}),
  crmRefresh:()=>req<any>('/admin/recruitment/contacts/refresh-records',{method:'POST'}),
  crmUnlinked:(account_id='',offset=0)=>req<any>('/admin/recruitment/contacts/unlinked?'+new URLSearchParams({...(account_id?{account_id}:{}),offset:String(offset)})),
  crmUnlinkedThread:(id:string,account_id='')=>req<any>('/admin/recruitment/contacts/unlinked/'+encodeURIComponent(id)+'?'+new URLSearchParams(account_id?{account_id}:{})),
  crmRegister:(id:string)=>req<any>('/admin/recruitment/contacts/register-thread',{method:'POST',body:JSON.stringify({thread_id:id,confirmed_creator:true})}),
  crmDetail:(id:string,account_id='')=>req<any>('/admin/recruitment/contacts/'+encodeURIComponent(id)+'?'+new URLSearchParams(account_id?{account_id}:{})),
  crmMessages:(id:string,cursor:any,account_id='')=>req<any>('/admin/recruitment/contacts/'+encodeURIComponent(id)+'/messages?'+new URLSearchParams({...cursor,...(account_id?{account_id}:{})})),
  crmSave:(id:string,body:unknown)=>req<any>('/admin/recruitment/contacts/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(body)}),
  crmNote:(id:string,body:unknown)=>req<any>('/admin/recruitment/contacts/'+encodeURIComponent(id)+'/notes',{method:'POST',body:JSON.stringify(body)}),
  crmAIReply:(id:string,body:unknown)=>req<any>('/admin/recruitment/contacts/'+encodeURIComponent(id)+'/ai-reply',{method:'POST',body:JSON.stringify(body)}),
  crmDraft:(id:string,body:unknown)=>req<any>('/admin/recruitment/contacts/'+encodeURIComponent(id)+'/drafts',{method:'POST',body:JSON.stringify(body)}),
  crmSend:(id:string,mid:number)=>req<any>(`/admin/recruitment/contacts/${encodeURIComponent(id)}/drafts/${mid}/send`,{method:'POST',body:JSON.stringify({confirmed:true})}),
  crmCancel:(id:string,mid:number)=>req<any>(`/admin/recruitment/contacts/${encodeURIComponent(id)}/drafts/${mid}/cancel`,{method:'POST'}),
  crmSync:(account_id='')=>req<any>('/admin/recruitment/contacts/sync?'+new URLSearchParams(account_id?{account_id}:{}),{method:'POST'}),
  recruitmentCohort:(id:string,body:unknown)=>req<any>(`/admin/recruitment/mappings/${encodeURIComponent(id)}/cohort`,{method:'POST',body:JSON.stringify(body)}),
  recruitmentInbox:(label='')=>req<any>('/admin/recruitment/inbox?label='+encodeURIComponent(label)),
  recruitmentTask:(id:string,body:unknown)=>req<any>('/admin/recruitment/inbox/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(body)}),
  recruitmentReplyDraft:(id:string,body:string)=>req<any>('/inbox/threads/'+encodeURIComponent(id)+'/reply',{method:'POST',body:JSON.stringify({body})}),
  recruitmentSafety:()=>req<any>('/admin/recruitment/safety'),
  recruitmentFeedback:(body:unknown)=>req<any>('/admin/recruitment/feedback',{method:'POST',body:JSON.stringify(body)}),
  recruitmentMetrics:(start:string,end:string,brand='')=>req<any>('/admin/recruitment/metrics?start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end)+'&brand='+encodeURIComponent(brand)),
  recruitmentCost:(body:unknown)=>req<any>('/admin/recruitment/costs',{method:'POST',body:JSON.stringify(body)}),
  recruitmentApplications: (brand:string) => req<any>('/recruitment-links/brands/'+encodeURIComponent(brand)+'/applications'),
  base: BASE,
  summary: () => req<Summary>("/admin/summary"),
  recruitmentWorkspace: () => req<{workspace: {brandId:string;name:string;internal:boolean}|null}>("/admin/recruitment/workspace"),
  createRecruitmentWorkspace: () => req<{brandId:string;internal:boolean;created:boolean}>("/admin/recruitment/workspace", {method:"POST"}),
  recruitmentOptions: () => req<any>("/admin/recruitment/options"),
  repeatPlans: () => req<any>('/admin/recruitment/repeat-plans'),
  saveRepeatPlan: (body:unknown,id?:string) => req<any>('/admin/recruitment/repeat-plans'+(id?'/'+encodeURIComponent(id):''),{method:id?'PUT':'POST',body:JSON.stringify(body)}),
  archiveRepeatPlan: (id:string) => req<any>('/admin/recruitment/repeat-plans/'+encodeURIComponent(id)+'/archive',{method:'POST',body:'{}'}),
  multiRecruitmentPreview: (body:unknown) => req<any>('/admin/recruitment/repeat-plans/multi/preview',{method:'POST',body:JSON.stringify(body)}),
  multiRecruitmentDrafts: (body:unknown) => req<any>('/admin/recruitment/repeat-plans/multi/drafts',{method:'POST',body:JSON.stringify(body)}),
  setupBrands: () => req<any>('/admin/recruitment/setup/brands'),
  setupBrand: (body:unknown) => req<any>('/admin/recruitment/setup/brands',{method:'POST',body:JSON.stringify(body)}),
  setupBrandActivation: (id:string) => req<any>(`/admin/recruitment/setup/brands/${encodeURIComponent(id)}/activation-link`,{method:'POST',body:'{}'}),
  poolImportJobs: () => req<any>('/admin/recruitment/setup/imports'),
  startPoolImport: (body:unknown) => req<any>('/admin/recruitment/setup/imports',{method:'POST',body:JSON.stringify(body)}),
  poolImportChunk: (id:string,index:number,rows:unknown[]) => req<any>(`/admin/recruitment/setup/imports/${id}/chunks/${index}`,{method:'POST',body:JSON.stringify({rows})}),
  registerRecruitmentProduct: (body: unknown) => req<any>("/admin/recruitment/catalog",{method:"POST",body:JSON.stringify(body)}),
  connectRecruitmentGmail: () => req<{authUrl?:string}>("/brands/dino-recruitment/gmail/connect",{method:"POST",body:"{}"}),
  recruitmentMappings: () => req<any>("/admin/recruitment/mappings"),
  saveRecruitmentMapping: (body: unknown, id?: string) => req<any>("/admin/recruitment/mappings"+(id?"/"+encodeURIComponent(id):""), {method:id?"PUT":"POST",body:JSON.stringify(body)}),
  recruitmentBatches: (id: string) => req<any>(`/admin/recruitment/mappings/${encodeURIComponent(id)}/batches`),
  previewRecruitment: (id: string, body: unknown) => req<any>(`/admin/recruitment/mappings/${encodeURIComponent(id)}/preview`,{method:"POST",body:JSON.stringify(body)}),
  draftRecruitment: (id: string, body: unknown) => req<any>(`/admin/recruitment/mappings/${encodeURIComponent(id)}/drafts`,{method:"POST",body:JSON.stringify(body)}),
  previewDistributedRecruitment: (id:string,body:unknown) => req<any>(`/admin/recruitment/mappings/${encodeURIComponent(id)}/distributed/preview`,{method:"POST",body:JSON.stringify(body)}),
  draftDistributedRecruitment: (id:string,body:unknown) => req<any>(`/admin/recruitment/mappings/${encodeURIComponent(id)}/distributed/drafts`,{method:"POST",body:JSON.stringify(body)}),
  sendRecruitmentBatch: (id:string) => req<any>(`/brands/dino-recruitment/outreach/${encodeURIComponent(id)}/send`,{method:"POST"}),
  cancelRecruitmentBatch: (id: string) => req<any>(`/brands/dino-recruitment/outreach/${encodeURIComponent(id)}/cancel`,{method:"POST"}),
  pauseRecruitmentBatch: (id: string) => req<any>(`/brands/dino-recruitment/outreach/${encodeURIComponent(id)}/control`,{method:"POST",body:JSON.stringify({paused:true})}),
  reviewRecruitmentBatch: (id: string) => req<any>(`/brands/dino-recruitment/outreach/${encodeURIComponent(id)}/review`),
  invitationProduct: (brand:string,id:string) => req<any>(`/brands/${encodeURIComponent(brand)}/products/${encodeURIComponent(id)}/invitation`),
  saveInvitationProduct: (brand:string,id:string,body:unknown) => req<any>(`/admin/recruitment/setup/brands/${encodeURIComponent(brand)}/products/${encodeURIComponent(id)}/invitation`,{method:"PUT",body:JSON.stringify(body)}),
  testMailPreview: (body: unknown) => req<any>("/admin/recruitment/test-mail/preview",{method:"POST",body:JSON.stringify(body)}),
  testMailSend: (body: unknown) => req<any>("/admin/recruitment/test-mail/send",{method:"POST",body:JSON.stringify(body)}),
  testMailHistory: () => req<any>("/admin/recruitment/test-mail/history"),
  communitySetup: () => req<any>("/admin/recruitment/setup/communities"),
  saveCommunity: (id:string,name:string) => req<any>(`/admin/recruitment/setup/brands/${encodeURIComponent(id)}/community`,{method:"PUT",body:JSON.stringify({name})}),
  gmailStatus: () => req<any>("/admin/gmail/status"),
  brands: () => req<AdminBrand[]>("/admin/brands"),
  suspendBrand: (id: string, reason: string) =>
    req<{ ok: boolean; suspended: boolean; already?: boolean }>(
      `/admin/brands/${encodeURIComponent(id)}/suspend`,
      { method: "POST", body: JSON.stringify({ reason }) }),
  resumeBrand: (id: string) =>
    req<{ ok: boolean; suspended: boolean }>(
      `/admin/brands/${encodeURIComponent(id)}/resume`, { method: "POST" }),
  audit: (actor = "", event = "", limit = 100) =>
    req<AuditRow[]>(`/admin/audit?actor=${encodeURIComponent(actor)}&event=${encodeURIComponent(event)}&limit=${limit}`),
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
  poolStatus: () => req<any>("/admin/pool/status"),
  poolPreview: (csv: string) =>
    req<any>("/admin/pool/candidates/preview", {
      method: "POST", body: JSON.stringify({ csv }),
    }),
  poolImport: (csv: string) =>
    req<any>("/admin/pool/candidates", {
      method: "POST", body: JSON.stringify({ csv }),
    }),
  submissions: (status = "in_review") =>
    req<Submission[]>(`/submissions?status=${status}`),
  reviewSubmission: (id: string, result: "passed" | "needs_fix", note = "") =>
    req(`/submissions/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ result, reviewer: ADMIN_ID, note }),
    }),
};

export interface AdminBrand {
  brandId: string; name: string; demo: boolean;
  members: number; team: number; suspendedAt: string | null;
}
export interface AuditRow {
  actor: string; event: string; subject: string;
  payload: Record<string, unknown>; at: string;
}
