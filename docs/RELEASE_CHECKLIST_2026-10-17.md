# 릴리즈 체크리스트 — theprlist 서비스 전환 1차 (claude/theprlist-service)

대상 커밋: 이 브랜치 HEAD. 비밀값은 적지 않는다(이름만). 운영 배포 실행은
소유자(Codex 검증 후)가 한다.

## 1. DB 마이그레이션 — 044 → 045 (순서 고정)

적용 방식: API 컨테이너 **첫 기동 시 자동** — `run_migrations()`가
`schema_migrations`에 없는 `db/migrations/*.sql`을 **파일명 순서**로
적용·기록한다(044_service_community.sql → 045_onboarding_fixes.sql).
수동 적용이 필요하면 같은 순서로:

    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/044_service_community.sql
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/045_onboarding_fixes.sql
    INSERT INTO schema_migrations(name) VALUES ('044_service_community.sql'),('045_onboarding_fixes.sql');

사전: `pg_dump`(Railway Postgres 백업) 1회. 적용 확인:
`SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 3;`

### 기존 데이터 보존 (둘 다 추가형 — 기존 행 무변경)

- 044: cell_messages 스레드/고정 컬럼, cell_reads, creator_profiles,
  xp_events, brand_team_roles, campaigns.lifecycle(**기본 'published' —
  기존 캠페인 노출 그대로**)/countries, campaign_applications 반려 컬럼,
  brands.suspended_at(NULL=운영 중), recruitment_link_events.
- 045: `legacy_creators` — **적용 시점에 memberships를 보유한 기존
  크리에이터를 legacy로 고정**(이후 신규는 온보딩+TikTok 인증 필수).
  → 반드시 운영 실데이터가 있는 DB에서, 신규 가입을 열기 **전에** 1회
  적용한다. creator_profiles.tiktok_open_id(유니크), notifications.target.

### 롤백

1순위는 **코드 롤백**(Railway 이전 배포로 되돌리기) — 이전 코드는 새
컬럼/테이블을 몰라도 무해하게 동작한다(전부 기본값 보유). 스키마까지
되돌려야 할 때만(신규 테이블 데이터 소실 주의, 역순):

    -- 045 롤백
    DROP TABLE IF EXISTS legacy_creators;
    DROP INDEX IF EXISTS creator_profiles_tiktok_open_id;
    ALTER TABLE creator_profiles DROP COLUMN IF EXISTS tiktok_open_id;
    ALTER TABLE notifications DROP COLUMN IF EXISTS target;
    DELETE FROM schema_migrations WHERE name='045_onboarding_fixes.sql';
    -- 044 롤백 (xp/읽음/전환이벤트/프로필 데이터 소실)
    DROP TABLE IF EXISTS recruitment_link_events, brand_team_roles, xp_events, cell_reads, creator_profiles;
    ALTER TABLE brands DROP COLUMN IF EXISTS suspended_at;
    ALTER TABLE campaign_applications DROP COLUMN IF EXISTS rejected_at, DROP COLUMN IF EXISTS reject_reason;
    ALTER TABLE campaigns DROP COLUMN IF EXISTS lifecycle, DROP COLUMN IF EXISTS countries, DROP COLUMN IF EXISTS updated_at;
    DROP INDEX IF EXISTS cell_messages_thread; DROP INDEX IF EXISTS cell_messages_pinned;
    ALTER TABLE cell_messages DROP COLUMN IF EXISTS thread_parent, DROP COLUMN IF EXISTS pinned_at, DROP COLUMN IF EXISTS pinned_by;
    DELETE FROM schema_migrations WHERE name='044_service_community.sql';

## 2. 배포 대상·설정명 (값 제외 — 상세 절차는 docs/DEPLOY.md)

| 대상 | 플랫폼 | Root | 도메인(production에만 연결, preview alias 금지) |
|---|---|---|---|
| API | Railway (`Dockerfile.api`, Root `/`) | services/api 구동 | api.theprlist.net |
| connection-signup | Vercel(Vite) | apps/signup | theprlist.net (랜딩/가입 신청 유지) |
| connection-creator | Vercel(Vite) | apps/creator-app | app.theprlist.net |
| connection-console | Vercel(Vite) | apps/console | console.theprlist.net |
| connection-admin | Vercel(Vite) | apps/admin | admin.theprlist.net |

Railway(API) 환경변수 — 이름만:
- 필수: `DATABASE_URL`, `JWT_SECRET`(미설정이면 재시작마다 세션 무효),
  `AUTH_REQUIRED=1`, `ALLOWED_ORIGINS`(4개 도메인 콤마),
  `CREATOR_APP_URL=https://app.theprlist.net`, `SITE_URL`
- 운영 기능: `ADMIN_KEY`, `ANTHROPIC_API_KEY`(번역/아리),
  `SENDGRID_API_KEY`(시스템 메일), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
  (Gmail 연동), `TOKEN_ENC_KEY`, `NICEPAY_CLIENT_KEY`/`NICEPAY_SECRET_KEY`
  (카드 등록 — 실결제 흐름은 보류 정책 유지), `RUNNER_ENABLED=1`,
  `RUNNER_INTERVAL_SEC`, `INBOUND_REPLY`/`INBOUND_REPLY_KEY`/`REPLY_DOMAIN`,
  `SYSTEM_MAIL_BRAND`, `GMAIL_DAILY_CAP`/`GMAIL_OPS_ENABLED`/
  `GMAIL_SEND_RESUME_ENABLED`
- **이번 릴리즈 신규(아래 §3 승인 전까지 미설정 = 정직한 '미연결')**:
  `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`

Vercel 환경변수: `connection-admin`만 `VITE_API_URL=https://api.theprlist.net`
(빌드타임 — 변경 시 Redeploy). 나머지 3표면은 코드 기본값이 운영 도메인.

## 3. TikTok 외부 설정 (pending — 외부 승인 blocker)

- developers.tiktok.com 앱 생성 → **Login Kit**, scope `user.info.basic`
  심사/승인(소유 검증은 불변 `open_id` 기준 — username 스코프 불필요).
- Redirect URI 등록 = `TIKTOK_REDIRECT_URI`
  (기본값 `https://api.theprlist.net/tiktok/callback`).
- 승인 후 키 2종을 Railway에 등록하면 신규 회원 입장(온보딩+소유 인증)이
  열린다. **승인 전에는 신규 가입 검수 자체가 blocker** — 수동 확인으로
  대체하지 않는다(서버 게이트). legacy 기존 회원은 영향 없음.

## 4. 배포 후 스모크 (읽기/자기계정 범위만, 실발송·실결제 없음)

1. `GET /health` → `{"ok":true,"db":"ok"}`; schema_migrations에 044·045.
2. 기존(legacy) 크리에이터 로그인 → 채널/DM/알림 폴링 동작, 강제 이동 없음.
3. 신규 테스트 계정: 프로필만 저장 → `/me/join` 403(TikTok 필수 안내) 확인.
4. 콘솔: 캠페인 초안 저장→발행(멤버 알림 수), 공지 게시→고정.
5. 어드민: 브랜드 목록/감사 로그 조회(정지·재개는 실브랜드에 실행 금지).
6. 모바일 390: 헤더 알림/계정/버거 44×44 터치, 하단 네비 가림 없음.
