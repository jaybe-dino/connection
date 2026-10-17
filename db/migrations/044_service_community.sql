-- 044: 서비스 전환 — 커뮤니티 고도화·온보딩·XP·캠페인 라이프사이클·팀·정지.
-- 전부 추가형(기본값 완비): 기존 데이터 무변경, 구버전 코드와 공존 가능.

-- 스레드·공지 고정
ALTER TABLE cell_messages ADD COLUMN thread_parent bigint REFERENCES cell_messages(msg_id);
ALTER TABLE cell_messages ADD COLUMN pinned_at timestamptz;
ALTER TABLE cell_messages ADD COLUMN pinned_by text NOT NULL DEFAULT '';
CREATE INDEX cell_messages_thread ON cell_messages(thread_parent) WHERE thread_parent IS NOT NULL;
CREATE INDEX cell_messages_pinned ON cell_messages(cell_id) WHERE pinned_at IS NOT NULL;

-- 읽음/미읽음 (사용자×셀 커서)
CREATE TABLE cell_reads (
    cell_id       text NOT NULL REFERENCES cells(cell_id),
    user_id       text NOT NULL,                 -- users.user_id (JWT sub)
    last_read_msg bigint NOT NULL DEFAULT 0,
    read_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (cell_id, user_id)
);

-- 크리에이터 온보딩·연동 상태 (별개 상태: 이메일 로그인 / TikTok 소유 /
-- Shop 자격 / 운영 검증(creators.verified)은 서로 독립)
CREATE TABLE creator_profiles (
    creator_id        text PRIMARY KEY REFERENCES creators(creator_id),
    country           char(2),
    languages         text[] NOT NULL DEFAULT '{}',
    ship_countries    text[] NOT NULL DEFAULT '{}',
    consents          jsonb  NOT NULL DEFAULT '{}',   -- {terms: iso시각, privacy: ...}
    consent_version   text   NOT NULL DEFAULT '',
    tiktok_handle     text   NOT NULL DEFAULT '',
    -- 소유 인증: provider 콜백으로만 connected 가능. 성공 가장 금지.
    tiktok_owner_state text  NOT NULL DEFAULT 'none'
        CHECK (tiktok_owner_state IN ('none','pending','connected','failed','expired','revoked')),
    tiktok_owner_checked_at timestamptz,
    tiktok_shop_state  text  NOT NULL DEFAULT 'none'
        CHECK (tiktok_shop_state IN ('none','pending','eligible','rejected')),
    onboarded_at      timestamptz,
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- XP: 검증된 서버 이벤트에만 1회 지급 (유니크가 중복 지급을 구조적으로 차단)
CREATE TABLE xp_events (
    xp_id      bigserial PRIMARY KEY,
    creator_id text NOT NULL REFERENCES creators(creator_id),
    brand_id   text NOT NULL REFERENCES brands(brand_id),
    kind       text NOT NULL,
    subject    text NOT NULL,
    points     integer NOT NULL CHECK (points BETWEEN 1 AND 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (creator_id, brand_id, kind, subject)
);
CREATE INDEX xp_events_rank ON xp_events(brand_id, creator_id);

-- 브랜드 팀 역할 (같은 brand_id의 복수 사용자: owner/manager)
CREATE TABLE brand_team_roles (
    brand_id text NOT NULL REFERENCES brands(brand_id),
    user_id  uuid NOT NULL,
    role     text NOT NULL DEFAULT 'manager' CHECK (role IN ('owner','manager')),
    PRIMARY KEY (brand_id, user_id)
);

-- 캠페인 라이프사이클 + 국가 조건 (기존 status='open|closed'는 모집중 여부로
-- 유지, lifecycle은 초안/발행/마감 편집 흐름)
ALTER TABLE campaigns ADD COLUMN lifecycle text NOT NULL DEFAULT 'published'
    CHECK (lifecycle IN ('draft','published','closed'));
ALTER TABLE campaigns ADD COLUMN countries text[] NOT NULL DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN updated_at timestamptz;
ALTER TABLE campaign_applications ADD COLUMN rejected_at timestamptz;
ALTER TABLE campaign_applications ADD COLUMN reject_reason text NOT NULL DEFAULT '';

-- 브랜드 정지 (어드민)
ALTER TABLE brands ADD COLUMN suspended_at timestamptz;

-- 중앙 모집 전환 이벤트 (OUTREACH_CONTRACT.md §3, append-only·멱등)
CREATE TABLE recruitment_link_events (
    event_id   bigserial PRIMARY KEY,
    link_id    uuid NOT NULL REFERENCES recruitment_application_links(link_id),
    kind       text NOT NULL CHECK (kind IN ('click','blocked','join','verify','apply')),
    detail     jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (link_id, kind)
);
