# v8.1 화면 · API 연결표

기준 시안: `docs/ui-reference/v8.1/dist` + `DESIGN.md`. 브랜치 `claude/epic-cerf-bpwx7m`.
상태 표기: **실연결**은 실제 API·DB에 저장·조회됨, **미연동(표시)**는 외부 연동 전이라 값이 없음을 화면에 그대로 적음, **범위 밖**은 원래 시안에서 '준비 중'이던 외부 연동.

## 크리에이터 — app.theprlist.net (`apps/creator-app`, `public/v8/creator-v8.js`)

| 화면(시안 id) | 주요 동작 | API | 권한·격리 | 상태 |
|---|---|---|---|---|
| 내 할 일 `c-tasks` | 캠페인별 지금 할 일 1개, 알림으로 상세 이동 | `GET /me/campaign-offers`, `GET /me/campaigns`, `GET /me/notifications` | 크리에이터 JWT 본인 행만, 브랜드 범위(v8-scope) | 실연결 |
| 캠페인 둘러보기 `c-campaigns` | 조건 요약·상세·신청(국가·메시지·조건 확인) | `GET /me/campaigns`, `POST /campaigns/{id}/apply` | 가입한 브랜드 캠페인만. 다른 브랜드 혼입 없음 | 실연결 |
| 선정된 나의 협업 `c-work` | 조건 합의(확인값), 주소, 영상 제출, Spark, 수정본 | `POST /me/campaign-offers/{id}/agree`(terms_fingerprint), `…/shipping`, `…/content`, `…/spark-code` | 합의 스냅샷 기준(보상·플랫폼·제품·샘플 필요 여부). 샘플 없음이면 주소·발송 없이 바로 제출 | 실연결 |
| 받을 보상 `c-rewards` | 합의 조건 기준 보상, 지급은 미연동 표시 | `GET /me/campaign-offers` | 검수 완료 ≠ 지급 | 실연결 / 지급 미연동(표시) |
| 내 정보 `c-profile` | 프로필·알림 설정·TikTok 소유 인증·로그아웃 | `GET/PUT /me/profile`, `GET/PUT /me/notification-prefs`, `/me/tiktok*` | TikTok 실인증은 운영 앱 승인 필요 | 실연결 / TikTok 실인증 미실행 |
| 공지사항 `c-announcements` | 공지 채널, 공지 스레드(msgId) | `GET /community/cells/{cell}/messages?channel=notice`, `GET …/messages/{id}/thread` | 멤버만 | 실연결 |
| 채널 `c-community` | 채널 목록(브랜드 관리값), 메시지·스레드·반응, 신고 숨김 반영 | `GET /community/cells/{cell}/channels`, `GET/POST …/messages` | 숨긴 메시지는 멤버에게 안 보임, 쓰기 제한 시 403 | 실연결 |
| 모집채널 `c-recruit` | 캠페인 카드 게시물 | `GET …/messages?campaign_posts=true` | 이 브랜드만 | 실연결 |
| 브랜드 랭킹·미션 `c-ranking` `c-missions` | 브랜드별 XP 합계·미션 | `GET /me/xp?brand=`, `GET /me/missions?brand=` | 브랜드별 분리 | 실연결 |
| 브랜드 담당자 `c-messages` | 1:1 DM(계정별 채팅 초안) | `POST /community/dm/{brand}`, `GET/POST /community/cells/{dm}/messages` | 본인 DM만 | 실연결 |
| 제품 모아보기 `/products/` (독립 페이지) | 공개 등록 제품만, 필터, 상세 | `GET /public/products`, 서명 이미지 `/public/product-images/{id}` | 비로그인 가능, 공개 등록 중에만 이미지 | 실연결 |

세션: v8 폼·선택·오류·busy 를 (사용자 ID, 세션 세대)에 묶음. 로그아웃·같은 SPA 계정 교체 때 즉시 비우고 이전 세션 응답은 버림(`tests_e2e/creator-session-v8.mjs`).

## 브랜드 콘솔 — console.theprlist.net (`apps/console`, `packages/demo-core/src/v8/console-v8.js`)

| 화면 | 주요 동작 | API | 권한·격리 | 상태 |
|---|---|---|---|---|
| 홈 `b-today` | 답장·선정·주소·발송·영상 확인 할 일 | 같은 캠페인·지원자·DM·회신 데이터 | 브랜드 JWT 또는 관리자+선택 브랜드 | 실연결 |
| 브랜드 학습 `b-learning` | 소개·홈페이지·국가·USP·금지어·FAQ, 버전 저장 | `GET/POST /brands/{b}/profile/learned`, `POST /brand-learning` | 이전 버전 보존 | 실연결 |
| 캠페인 관리·새 캠페인 `b-campaigns` `b-create` | 4단계(목적·제품·조건·확인), 샘플 0 = 샘플 없음, 발행·마감 | `POST/PATCH /brands/{b}/campaigns`, `…/publish`, `…/close` | 합의 후 수정은 기존 합의에 영향 없음(확인값·스냅샷) | 실연결 |
| 제품 라이브러리 `b-products` | 사진 먼저 선택 → 저장 시 생성·업로드, 공개 전환 | `POST/PATCH /brands/{b}/products`, `…/profile`, `POST …/images?slot=`, `POST …/public` | 업로드 실패 시 같은 제품으로 재시도, 공개 전환은 서버 응답만 반영 | 실연결 |
| 지원자 `b-applicants` | 선정(수수료)·미선정 사유·재검토 선정, 운영팀 확인 라벨 | `GET …/applicants`, `POST …/select`, `…/reject` | 모바일은 목록→상세 | 실연결 |
| 샘플·영상 `b-samples` | 송장 발송, 영상 검수·수정 요청·완료, 어필리에이트 링크 | `…/terms/{c}/sample-shipped`, `…/request-revision`, `…/complete`, `…/link` | 샘플 없음 합의는 주소·발송 단계 없음 | 실연결 |
| 커뮤니티·DM `b-community` | 채널 추가·수정·보관, 캠페인 카드 게시(추가 채널 포함), DM(관련 캠페인 선택·AI 초안), 멤버 | `/community/cells/{cell}/channels`, `POST /brands/{b}/campaigns/{c}/post`, `POST /brands/{b}/assist/dm-draft`, `GET /brands/{b}/members` | AI 초안은 초안만(자동 발송 없음), 미연결이면 503 표시 | 실연결 / AI 키 미설정 환경은 실오류 표시 |
| 이메일 연결 `b-mailconnect` | Gmail 연결(OAuth)·중지·해제 | `POST /brands/{b}/gmail/connect`, `/gmail/accounts/{id}/sending`, `DELETE /gmail/accounts/{id}` | 소유자 Google 승인 필요 | OAuth 실연결은 운영에서만 |
| 받는 사람·메일 작성·발송 로그 `b-invite` `b-mailprep` `b-sendlog` | CSV 검수, 미리보기·제외, 검수 목록(초안), 승인 후 발송, 내 메일함 테스트 발송 | `/brands/{b}/outreach*`, `POST /brands/{b}/gmail/accounts/{id}/test-send` | 테스트는 보내는 계정 자신에게만, 데모 모드 503 | 실연결 / 운영 메일 미발송 |
| 회신함 `b-reply` | 상태·담당·후속 할 일(낙관적 잠금), 답장 승인 대기, AI 초안 | `GET /brands/{b}/inbox`, `PUT …/inbox/threads/{id}/task`, `POST /inbox/threads/{id}/reply`, `POST /brands/{b}/assist/reply-draft` | 수신 거부 저장 = 실제 발송 제외 | 실연결 |
| 팀 `b-team` | owner가 운영자·조회자 등록 + 초대 링크(72h), 역할 변경 | `GET /brands/{b}/team`, `POST …/team/members`, `…/team/{id}/invite-link`, `…/team/role` | 조회자는 첫 화면부터 쓰기 잠금, 서버도 403. 역할 변경 시 세션 철회 | 실연결 |
| 청구·비용·결과 `b-billing` `b-results` | 청구 기준·단가·월 청구서·카드 결제(기존), 결과 집계 | 기존 billing API | 청구 계산·결제 변경 없음 | 실연결 / 판매·조회 미연동(표시) |

세션: C8 req 가 요청 시점 JWT 를 기억. 현재 세션 401 만 로그아웃, 다른 탭 로그아웃·교체 동기화, 활성 세션마다 폴러 1개(`tests_e2e/console-session-v8.mjs`).

## 관리자 — admin.theprlist.net (`apps/admin`)

| 메뉴(시안 id) | 경로 | API | 상태 |
|---|---|---|---|
| 대시보드 › 오늘 처리할 일 `a-today` | `/dashboard` | `GET /admin/summary` | 실연결 |
| 대시보드 › 비용·성과 `a-finance` | `/finance` | `GET /admin/recruitment/metrics` | 실연결(게시·주문 미연동 = 미확인) |
| 브랜드 신청 `a-onboard` | `/applications` | `/admin/applications*`, `/admin/prelaunch-applications` | 실연결 |
| 신고 처리함 `a-reports` | `/reports` | `GET /admin/reports`, `POST …/{id}/action`(숨김·7일·무기한 제한), `POST …/{id}/restore`, `GET /admin/reports/handled` | 실연결(D05 실제 효과) |
| 분쟁 심판 `a-reports-dis` | `/disputes` | `GET /admin/disputes`, `POST …/resolve` | 실연결(실패 표시 D07) |
| 검수 현황 `a-review` | `/submissions` | `GET /submissions?status=in_review`, `POST /submissions/{id}/review` | 실연결(D03 협업 제출 버전) |
| 디노 공용 모집 `a-recruit` | `/recruitment` | `/admin/recruitment/*`(options·mappings·cohort·multi preview/drafts·batches·repeat-plans·test-mail·setup) | 실연결. 8탭·5단계, 발신 200개 상한 |
| 브랜드 운영 › 브랜드 목록 `a-brands` | `/brands` | `/admin/brands*`, `POST /auth/console-handoff` → 콘솔 `POST /auth/console-handoff/redeem` | 실연결(대리운영 1회용 전환) |
| 브랜드 운영 › 사람·권한 `a-people` | `/people` | `GET /admin/brands/{b}/accounts` | 실연결 |
| 계정별 메일함 `a-mailbox` | `/mail` | `/admin/recruitment/mailboxes/*`, CRM | 실연결 |
| Gmail 운영 `a-connections` | `/gmail` | `GET /admin/gmail/status`, `POST /admin/gmail/meta/preview`, `POST /admin/gmail/meta` | 실연결(연결은 소유자 승인) |
| 후보 풀 `a-pool` | `/pool` | `/admin/pool/*` | 실연결 |

## 이번 작업에서 추가·변경한 마이그레이션

| 번호 | 내용 |
|---|---|
| 060 | `brand_channels` 브랜드 채널 관리 |
| 061 | `product_images` 제품 이미지(bytea, 서명 URL) |
| 062 | 팀 역할 `viewer` |
| 063 | `campaigns.sample_required`(기본 true) |
| 064 | `brand_ai_draft_requests`, `brand_test_mail` |
| 065 | `submissions.source/version`, `cell_messages.author_id/hidden_at/hidden_by`, `creator_sanctions`, `reports.effect/restored_at` |
| 066 | `gmail_account_meta`(이메일·브랜드·담당자 메타데이터) |

모두 `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`. 기존 데이터를 지우거나 바꾸는 마이그레이션은 없음.
