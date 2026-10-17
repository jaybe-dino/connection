# theprlist 서비스 전환 계획 (2026-10-17)

기준 커밋 **d3886a9** (origin/codex/creator-community-restore 전체 포함,
origin/claude 구브랜치 대비 15커밋 앞 — 운영 기능 유실 없음 확인).
작업 브랜치 **claude/theprlist-service**. 검수 기준의 정본은
`docs/THEPRLIST_SERVICE_ACCEPTANCE_2026-10-17.md`, 디자인 정본은
`docs/ui-reference/slack-v3/`(플럼 Aubergine: 탑바 #350D36 · 사이드
#F9EDFF · 포인트 #4A154B · 활성 #1264A3 · 기본버튼 #007A5A · 66/244px
그리드 · 모바일 4열 하단 네비). 시안의 샘플 localStorage 데이터는
운영으로 이전하지 않는다.

## 도메인 맵

| 도메인 | 앱 소스 | 역할 |
|---|---|---|
| theprlist.net | apps/signup | 공개 랜딩·브랜드 신청(유지) |
| app.theprlist.net | apps/creator-app (engine-live creator 표면) | 크리에이터 |
| console.theprlist.net | apps/console (engine-live brand 표면) | 브랜드 담당자(자기 브랜드만) |
| admin.theprlist.net | apps/admin (React) | 회사 최종관리자 |
| api.theprlist.net | services/api (FastAPI) | 인증·역할·소속 검증의 유일한 관문 |

도메인 연결은 검증된 production 배포에만 — preview alias로 운영을 덮지
않는다(배포는 소유자/Codex 확인 절차).

## 현재/재사용/신규/외부승인 매트릭스

| 기능 | 현재(그대로) | 재사용(확장) | 신규 | 외부 승인 필요(pending) |
|---|---|---|---|---|
| 초대 토큰·귀속 | routes_recruitment_links(불투명 토큰+DB 해시·만료·취소·수신거부·이메일 일치·target 브랜드 한정) | 전환 이벤트(click/join/verify/apply) 기록 추가 | — | — |
| 중앙 발송 | routes_outreach_bulk(중앙 workspace·target_brand 분리)·점진 한도 | 어드민 전환 현황 | — | 외부 아웃리치 시스템 계약 합의(링크 대기)·실발송 |
| 이메일 로그인 | magic(brand 귀속) | — | — | — |
| TikTok 소유 인증 | — | — | 상태 모델+연결 시작/콜백 자리(키 없으면 '미연결') | **TikTok 개발자 앱 승인/키** |
| TikTok Shop 자격 | — | — | 별개 상태 필드(표시 전용) | **Shop API 계약** |
| 온보딩(국가/언어/배송/동의) | — | — | creator_profiles + /me/profile | — |
| 커뮤니티 채팅/번역 | routes_community(원문 보존·5개 언어·재시도) | 스레드/고정/읽음/검색/미읽음 | — | — |
| 알림 | notifications 테이블(레거시) | 인증형 /me/notifications·배지 | 공지/캠페인 발행 팬아웃 | — |
| 캠페인 | 생성(products)·지원·선정·합의·배송·Spark·콘텐츠·완료 | 초안/발행/마감/수정·반려·국가 조건 사유 | — | — |
| XP/랭킹/미션 | — | — | xp_events(서버 이벤트 1회) | — |
| 브랜드 팀 | invite(복수 brand 계정 가능) | 팀 목록·역할(owner/manager) | brand_team_roles | — |
| 청구 | 5,000원 VAT·월합산·계산서 우선·중복방지(usage.invoice 연결) | 그대로 | — | 실결제/실계산서 |
| 어드민 | 승인/신고/분쟁/후보풀/Gmail/모집 매핑 | 브랜드 정지·감사 로그 뷰·역할 | — | — |

## 3역할 화면·권한 맵 (요지)

- **크리에이터(app)**: 커뮤니티(채널+스레드+미읽음+검색+번역/재시도) /
  캠페인(국가 조건 사유 포함) / 내 협업(단계별 다음 행동) / 메시지(DM)
  / 내 공간(XP·랭킹·미션·설정·TikTok 연결 상태). 서버 가드:
  membership 없는 cell 403, 미발행 캠페인 비노출, 온보딩 미완료 시
  신규 회원은 쓰기/신청 403(기존 회원은 안내+재연결 여정).
- **브랜드(console)**: 기존 전 기능 + 공지 작성·고정, 캠페인
  초안→발행→수정→마감·지원자 선정/반려, 팀 역할, 알림. 서버 가드:
  모든 요청 brand_id ↔ JWT 소속 대조(기존 require_brand), 전사
  발송·타 브랜드 데이터 제공 없음.
- **어드민(admin)**: 신청 승인 + **정지/재개**, 감사 로그(원장) 조회,
  모집(중앙) 매핑·전환, 후보풀, Gmail 운영, 청구. 전사 권한은 admin
  JWT에만.

## 마이그레이션 / 롤백

- 신규: `db/migrations/044_service_community.sql` — 전부 추가형(ALTER
  ADD COLUMN·CREATE TABLE)으로 **기존 데이터 무변경·무파괴**. 자동
  적용(run_migrations).
- 롤백: 코드 롤백(이전 커밋 재배포)만으로 안전 — 새 컬럼/테이블은
  구버전이 읽지 않으며 제약이 기존 쓰기를 막지 않는다(기본값 완비).
  완전 제거가 필요하면 역순 DROP 스크립트(문서 하단) 수동 실행.
  campaigns.lifecycle 기본 'published'라 기존 캠페인 노출 불변.
- 데이터 보존: force push 금지·기존 테이블 DROP/ALTER TYPE 없음.

역순 제거(수동, 필요시):
```sql
ALTER TABLE campaigns DROP COLUMN lifecycle, DROP COLUMN countries, DROP COLUMN updated_at;
ALTER TABLE cell_messages DROP COLUMN thread_parent, DROP COLUMN pinned_at, DROP COLUMN pinned_by;
ALTER TABLE brands DROP COLUMN suspended_at;
ALTER TABLE campaign_applications DROP COLUMN rejected_at;
DROP TABLE IF EXISTS brand_team_roles, xp_events, creator_profiles, cell_reads;
```

## 환경변수 (이름만 — 값 금지)

기존: DATABASE_URL, JWT_SECRET, AUTH_REQUIRED, SITE_URL, CREATOR_APP_URL,
GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI, TOKEN_ENC_KEY, ANTHROPIC_API_KEY,
SENDGRID_API_KEY, NICEPAY_*(ENABLED/CLIENT_KEY/SECRET_KEY/BILLING_ENABLED/
AUTOCHARGE_ENABLED/BILLING_ENC_MODE/API_BASE), GMAIL_OPS_ENABLED,
GMAIL_SEND_RESUME_ENABLED, RUNNER_ENABLED, ADMIN_KEY(전환기),
INBOUND_REPLY, AI_MATCH_*.
신규(이번 추가, 기본 미설정=기능 비활성·정직 표시):
- `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` —
  TikTok 계정 소유 인증(OAuth). 미설정이면 연결 시작이 503과 함께
  "운영 승인 대기"로 표시되고, 어떤 경로로도 verified가 되지 않는다.

## 이번 구현에서 하지 않는 것 (pending/blocker)

1. TikTok 실제 OAuth 승인·키 발급(외부) — 상태 모델·화면·콜백 자리만.
2. TikTok Shop 어필리에이트 자격 실연동(외부 계약) — 별개 상태 표시만.
3. 실제 대량 이메일 발송·3만 명 처리 검증(금지 유지).
4. 외부 아웃리치 시스템과의 최종 계약 확정(협의 중) —
   docs/OUTREACH_CONTRACT.md 초안으로 대체, 기존 recruitment_links 재사용.
5. 운영 도메인 연결/배포(소유자·Codex), 실결제.
6. 디자인 픽셀 대조 스크린샷(샌드박스 캡처 불안정) — 구조·토큰은
   레퍼런스 원본 기준 구현, 육안 대조는 Codex.
