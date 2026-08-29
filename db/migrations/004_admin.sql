-- 어드민 표면 + 신청·신고·분쟁·제출 — ADMIN_PLAN.md §3 · CONTENT_AGENT_PLAN.md §5.
-- 모든 조치·판정은 ledger에도 이벤트로 기록된다 (테이블은 현재 상태, 원장은 이력).

-- 운영자 계정 (실인증·2FA는 오픈 전 필수 — 지금은 헤더 스텁용)
CREATE TABLE admin_users (
    admin_id   text PRIMARY KEY,
    name       text NOT NULL,
    role       text NOT NULL DEFAULT 'super',   -- super | country_ops | cs | finance | viewer
    countries  text[] NOT NULL DEFAULT '{}',
    active     boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO admin_users (admin_id, name, role) VALUES ('jay', 'Jay', 'super');

-- 브랜드 가입 신청 (가입 위저드 제출 → 어드민 승인 → brands 생성)
CREATE TABLE brand_applications (
    app_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        text NOT NULL,
    name        text NOT NULL,
    biz_no      text NOT NULL DEFAULT '',
    category    text NOT NULL DEFAULT '',
    countries   text[] NOT NULL DEFAULT '{}',
    plan        text NOT NULL DEFAULT 'growth',
    site_url    text NOT NULL DEFAULT '',
    answers     jsonb NOT NULL DEFAULT '{}',    -- 아리 학습 5문항
    contact     text NOT NULL DEFAULT '',
    status      text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    decided_by  text,
    decided_at  timestamptz,
    reject_reason text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX brand_applications_status_ix ON brand_applications (status, created_at);

-- 신고 (크리에이터 앱 → 아리 1차 분류 → 운영자 조치)
CREATE TABLE reports (
    report_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cell_id    text NOT NULL,
    msg_id     text NOT NULL DEFAULT '',
    reporter   text NOT NULL,                   -- creator_id (조치 화면엔 익명 표시)
    reason     text NOT NULL,                   -- spam | harassment | other
    detail     text NOT NULL DEFAULT '',
    ai_class   text NOT NULL DEFAULT '',        -- 아리 1차 분류
    severity   text NOT NULL DEFAULT 'normal',  -- severe | normal
    status     text NOT NULL DEFAULT 'open',    -- open | actioned | dismissed
    action     text,                            -- warn | hide | suspend_7d | suspend
    handled_by text,
    sla_due    timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_queue_ix ON reports (status, sla_due);

-- 분쟁 (검수 이의 · 정산 불일치 · 선정 번복)
CREATE TABLE disputes (
    dispute_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind        text NOT NULL,                  -- review | payout | selection
    brand_id    text NOT NULL,
    creator_id  text NOT NULL,
    campaign_id text,
    claim       text NOT NULL,
    state       text NOT NULL DEFAULT 'open',   -- open | responded | resolved | appealed | final
    verdict     text,
    decided_by  text,
    first_response_due timestamptz NOT NULL,    -- 접수 +24h
    verdict_due        timestamptz NOT NULL,    -- 접수 +72h
    created_at  timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
);
CREATE INDEX disputes_queue_ix ON disputes (state, verdict_due);

-- 제출 (크리에이터 앱 → 자동 체크 → 콘솔 검수)
CREATE TABLE submissions (
    submission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id text NOT NULL REFERENCES campaigns(campaign_id),
    creator_id  text NOT NULL REFERENCES creators(creator_id),
    url         text NOT NULL,
    caption     text NOT NULL DEFAULT '',
    auto_checks jsonb NOT NULL DEFAULT '[]',    -- [{label, pass, fix?}]
    status      text NOT NULL DEFAULT 'in_review',  -- needs_fix | in_review | passed
    reviewed_by text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz
);
CREATE INDEX submissions_brand_ix ON submissions (campaign_id, status);
