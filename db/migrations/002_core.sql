-- 공통 시스템 레이어 스키마 — services/core와 짝.
-- 게이트 · append-only 원장 · 동의 · 브랜드 프로필 버전 · 팀 권한 · 알림.

CREATE TYPE gate_kind_t AS ENUM ('PII', 'PAYOUT', 'OUTBOUND', 'PUBLISH');
CREATE TYPE gate_state_t AS ENUM ('PENDING', 'HELD', 'APPROVED', 'REJECTED');
CREATE TYPE team_role_t AS ENUM ('approver', 'operator', 'viewer');
CREATE TYPE consent_kind_t AS ENUM
    ('identity', 'terms', 'cross_border', 'cross_brand_reco',
     'brand_terms', 'brand_data');

-- append-only 원장 (해시 체인). UPDATE/DELETE 금지 — 권한과 트리거로 강제.
CREATE TABLE ledger (
    seq         bigserial PRIMARY KEY,
    ts          timestamptz NOT NULL DEFAULT now(),
    actor       text  NOT NULL,           -- 'ari:{brand}' | 'user:{id}' | 'system'
    event_type  text  NOT NULL,
    subject     text  NOT NULL,
    payload     jsonb NOT NULL DEFAULT '{}',
    prev_hash   char(64) NOT NULL,
    hash        char(64) NOT NULL
);
CREATE INDEX ledger_subject_ix ON ledger (subject, seq);
CREATE INDEX ledger_type_ix ON ledger (event_type, seq);

CREATE OR REPLACE FUNCTION ledger_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'ledger is append-only';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON ledger
    FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

-- 게이트 요청 (승인함)
CREATE TABLE gate_requests (
    gate_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id     text NOT NULL,
    kind         gate_kind_t NOT NULL,
    summary      text NOT NULL,
    payload      jsonb NOT NULL DEFAULT '{}',
    requested_by text NOT NULL,
    state        gate_state_t NOT NULL DEFAULT 'PENDING',
    decided_by   text,
    decided_at   timestamptz,
    hold_note    text,                    -- 내부 메모 — 밖으로 안 나감
    executed     boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gate_inbox_ix ON gate_requests (brand_id, state, created_at);

-- 팀 멤버 · 게이트별 승인 권한 (P0)
CREATE TABLE team_members (
    brand_id    text NOT NULL,
    member_id   text NOT NULL,
    role        team_role_t NOT NULL,
    gate_kinds  gate_kind_t[] NOT NULL DEFAULT ARRAY['PII','PAYOUT','OUTBOUND','PUBLISH']::gate_kind_t[],
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (brand_id, member_id)
);

-- 동의 (append-only 성격 — 철회는 withdrawn_at 기록)
CREATE TABLE consents (
    consent_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id  text NOT NULL,
    kind        consent_kind_t NOT NULL,
    brand_id    text,                     -- NULL = 커넥션 공통
    granted_at  timestamptz NOT NULL DEFAULT now(),
    withdrawn_at timestamptz
);
CREATE INDEX consents_creator_ix ON consents (creator_id, kind)
    WHERE withdrawn_at IS NULL;

-- 재접촉 금지 (철회·수신거부 후 90일)
CREATE TABLE recontact_bans (
    creator_id  text PRIMARY KEY,
    banned_until timestamptz NOT NULL
);

-- 브랜드 프로필 버전 (모집의 뿌리)
CREATE TABLE brand_profile_versions (
    brand_id    text NOT NULL,
    version     integer NOT NULL,
    fields      jsonb NOT NULL,   -- {name: {value, source, evidence, confirmed}}
    note        text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (brand_id, version)
);

-- 알림함 + 유형별 채널 설정 (P0)
CREATE TABLE notifications (
    notif_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     text NOT NULL,
    type        text NOT NULL,
    title       text NOT NULL,
    body        text NOT NULL DEFAULT '',
    read        boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notif_inbox_ix ON notifications (user_id, read, created_at DESC);

CREATE TABLE notification_prefs (
    user_id     text NOT NULL,
    type        text NOT NULL,
    channels    text[] NOT NULL,          -- inbox는 항상 유지
    PRIMARY KEY (user_id, type)
);
