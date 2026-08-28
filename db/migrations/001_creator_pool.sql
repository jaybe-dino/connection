-- 母 DB · creator_pool
-- 출처: 수집 엔진 구현 상세 명세 §1 (필드 스키마), 기술스택 명세 §5 (인덱스)
-- 숫자·컷은 설계 기준값 — 운영에서 캘리브레이션.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 플랫폼: 가입은 틱톡/인스타 OAuth만 (기획안 §4.1)
CREATE TYPE platform_t AS ENUM ('tiktok', 'instagram');

-- 이메일 검증 상태 (구현상세 §5.2: valid 저장 / risky 저장·발송 제외 / invalid 드롭)
CREATE TYPE email_status_t AS ENUM ('valid', 'risky', 'none');

-- 등급 컷 (구현상세 §7.3)
CREATE TYPE grade_t AS ENUM ('mega', 'macro', 'mid', 'micro', 'nano');

-- 라이프사이클 상태 (구현상세 §1)
CREATE TYPE pool_state_t AS ENUM ('POOL', 'DORMANT', 'INVITED', 'MEMBER', 'EXCLUDED');

CREATE TABLE creator_pool (
    -- 식별
    creator_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- DER · 1회
    platform         platform_t  NOT NULL,                        -- REQ · 1회
    platform_uid     text        NOT NULL,                        -- SRC/REQ · 핸들 변경돼도 불변
    handle           text,                                        -- SRC · 리프레시
    handle_history   jsonb       NOT NULL DEFAULT '[]',           -- @핸들 변경 이력 배열
    display_name     text,                                        -- SRC · 리프레시

    -- 국가 · 언어 · 분류
    country          char(2),                                     -- DER/REQ · ISO2 다신호 합의(§5)
    country_conf     real,                                        -- DER · 판정 신뢰도 0~1
    lang             text[]      NOT NULL DEFAULT '{}',           -- DER · bio·캡션 언어 감지
    category         text[]      NOT NULL DEFAULT '{}',           -- DER · 콘텐츠 분류(뷰티·스킨케어…)
    product_tags     text[]      NOT NULL DEFAULT '{}',           -- DER · 다룬 제품/브랜드(전수 그물 태깅)

    -- 지표
    followers        integer,                                     -- SRC · 7~30일
    follower_series  jsonb       NOT NULL DEFAULT '[]',           -- DER · [{date,count}] 성장 곡선(계단 감지)
    avg_views        integer,                                     -- DER · 최근 N개 평균 조회
    engagement_rate  real,                                        -- DER · (댓글+저장)/팔로워
    post_freq_30d    integer,                                     -- DER · 30일 게시 수
    last_post_at     timestamptz,                                 -- SRC · 최근성(죽은 계정 판별)

    -- 프로필 원문
    bio              text,                                        -- SRC · 원문 bio
    links            jsonb       NOT NULL DEFAULT '[]',           -- SRC · bio 링크·link-in-bio 확장

    -- 연락처 (공개 비즈니스 연락처만 — 법률 선)
    email            text,                                        -- DER · 추출·검증 통과분만
    email_status     email_status_t NOT NULL DEFAULT 'none',      -- DER · 보강
    whatsapp         text,                                        -- DER · bio 연락 번호
    zalo             text,
    line             text,

    -- 커머스 · 신호
    gmv_signal       integer,                                     -- SRC · TikTok Shop 실적(있으면)
    sponsor_ratio_90d real,                                       -- DER · 광고 표기 비율 추세

    -- 스코어 (구현상세 §7)
    influence_score  real,                                        -- DER · 0~100
    contact_score    real,                                        -- DER · 접촉 우선순위
    grade            grade_t,                                     -- DER · 리프레시

    -- 출처 · 동일인 · 상태
    sources          jsonb       NOT NULL DEFAULT '[]',           -- SRC · [{vendor,seen_at}] 교차검증 횟수
    identity_group   uuid,                                        -- DER · dedup 그룹(동일인)
    state            pool_state_t NOT NULL DEFAULT 'POOL',        -- REQ · 이벤트
    consent_ref      uuid,                                        -- SRC · 동의 원장 참조(가입 후)

    -- 시각
    first_seen       timestamptz NOT NULL DEFAULT now(),          -- SRC · 자동
    last_refreshed   timestamptz NOT NULL DEFAULT now()
);

-- 핵심 인덱스 (기술스택 명세 §5)
CREATE UNIQUE INDEX creator_pool_platform_uid_uq ON creator_pool (platform, platform_uid);
CREATE INDEX creator_pool_serve_ix   ON creator_pool (country, influence_score DESC);
CREATE INDEX creator_pool_email_ix   ON creator_pool (email) WHERE email IS NOT NULL;
CREATE INDEX creator_pool_handle_ix  ON creator_pool (platform, handle);
CREATE INDEX creator_pool_state_ix   ON creator_pool (state);
CREATE INDEX creator_pool_group_ix   ON creator_pool (identity_group) WHERE identity_group IS NOT NULL;
CREATE INDEX creator_pool_category_gin ON creator_pool USING gin (category);

-- dedup 사람 검토 큐 (합산 0.6~1.0 — 자동 병합 안 함, 구현상세 §6.2)
CREATE TABLE dedup_review_queue (
    id           bigserial PRIMARY KEY,
    creator_a    uuid NOT NULL REFERENCES creator_pool(creator_id),
    creator_b    uuid NOT NULL REFERENCES creator_pool(creator_id),
    score        real NOT NULL,
    rule_hits    jsonb NOT NULL DEFAULT '[]',
    resolved     boolean NOT NULL DEFAULT false,
    resolution   text,                    -- merged / distinct
    created_at   timestamptz NOT NULL DEFAULT now(),
    resolved_at  timestamptz
);

-- 병합 이력 원장 (되돌림 가능 — append-only)
CREATE TABLE identity_merge_ledger (
    id             bigserial PRIMARY KEY,
    identity_group uuid NOT NULL,
    merged_creator uuid NOT NULL,
    master_creator uuid NOT NULL,
    rule_hits      jsonb NOT NULL DEFAULT '[]',
    score          real NOT NULL,
    merged_at      timestamptz NOT NULL DEFAULT now(),
    reverted_at    timestamptz
);

-- 수렴 판정 상태 (국가·카테고리 파드별, 구현상세 §3.3)
CREATE TABLE discover_convergence (
    country      char(2) NOT NULL,
    category     text    NOT NULL,
    new_rate     real,
    streak       integer NOT NULL DEFAULT 0,
    converged    boolean NOT NULL DEFAULT false,
    daily_budget integer,                -- 일일 discover 예산 (폭주 방어)
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (country, category)
);

-- 실패 메시지 (3벤더 실패 등 → 일 1회 재처리, 구현상세 §2·§9)
CREATE TABLE dead_letter (
    id          bigserial PRIMARY KEY,
    queue       text  NOT NULL,
    message     jsonb NOT NULL,
    reason      text  NOT NULL,
    attempts    integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    reprocessed_at timestamptz
);
