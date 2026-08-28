-- 앱 표면 데이터 — 셀·메시지·캠페인·지원·배송·크리에이터 프로필 필드.
-- services/api와 짝. 프로토타입 시나리오(GLOWLAB)를 seed로 재현한다.

CREATE TABLE brands (
    brand_id   text PRIMARY KEY,          -- slug (connection.app/{brand})
    name       text NOT NULL,
    category   text NOT NULL DEFAULT '',
    locale     text NOT NULL DEFAULT 'ko',
    plan       text NOT NULL DEFAULT 'growth'
);

CREATE TABLE creators (
    creator_id      text PRIMARY KEY,
    handle          text NOT NULL,
    platform        text NOT NULL,
    display_name    text NOT NULL DEFAULT '',
    verified        boolean NOT NULL DEFAULT false,
    locale          text NOT NULL DEFAULT 'en',   -- IP 초기값 · 본인 수동 변경(P0)
    grade           text NOT NULL DEFAULT 'nano',
    completion_rate real NOT NULL DEFAULT 0
);

CREATE TABLE memberships (
    creator_id text NOT NULL REFERENCES creators(creator_id),
    brand_id   text NOT NULL REFERENCES brands(brand_id),
    joined_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (creator_id, brand_id)
);

-- 본인 수정 필드 (주소·연락처·피부타입·계좌) — 실시간 콘솔 DB 반영, 근거는 원장
CREATE TABLE creator_fields (
    creator_id text NOT NULL REFERENCES creators(creator_id),
    field      text NOT NULL,
    value      text NOT NULL DEFAULT '',
    basis      text NOT NULL DEFAULT '본인 입력',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (creator_id, field)
);

CREATE TABLE cells (
    cell_id      text PRIMARY KEY,
    brand_id     text NOT NULL REFERENCES brands(brand_id),
    name         text NOT NULL,
    visibility   text NOT NULL DEFAULT 'apply_approve',
    member_count integer NOT NULL DEFAULT 0
);

CREATE TABLE cell_messages (
    msg_id          bigserial PRIMARY KEY,
    cell_id         text NOT NULL REFERENCES cells(cell_id),
    channel         text NOT NULL DEFAULT 'chat',   -- chat | tips | notice
    author          text NOT NULL,
    author_kind     text NOT NULL,                  -- creator | ari | brand
    original        text NOT NULL,
    original_locale text NOT NULL,
    translations    jsonb NOT NULL DEFAULT '{}',    -- {locale: text}
    campaign_id     text,
    at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cell_messages_ix ON cell_messages (cell_id, channel, at);

CREATE TABLE campaigns (
    campaign_id   text PRIMARY KEY,
    brand_id      text NOT NULL REFERENCES brands(brand_id),
    name          text NOT NULL,
    product       text NOT NULL DEFAULT '',
    image_emoji   text NOT NULL DEFAULT '📦',
    usp           text NOT NULL DEFAULT '',
    reward_type   text NOT NULL,                    -- paid | gifted | affiliate
    reward_amount integer,
    affiliate_pct integer,
    conditions    jsonb NOT NULL DEFAULT '[]',
    capacity      integer NOT NULL DEFAULT 0,
    deadline      date,
    status        text NOT NULL DEFAULT 'open'
);

CREATE TABLE campaign_applications (
    campaign_id text NOT NULL REFERENCES campaigns(campaign_id),
    creator_id  text NOT NULL REFERENCES creators(creator_id),
    status      text NOT NULL DEFAULT 'applied',    -- applied | selected | shipping | submitted | passed
    match_score integer,
    applied_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (campaign_id, creator_id)
);

CREATE TABLE shipments (
    campaign_id text NOT NULL REFERENCES campaigns(campaign_id),
    creator_id  text NOT NULL REFERENCES creators(creator_id),
    carrier     text NOT NULL DEFAULT '',
    tracking_no text NOT NULL DEFAULT '',
    steps       jsonb NOT NULL DEFAULT '[]',        -- [{label, done, at?}]
    PRIMARY KEY (campaign_id, creator_id)
);
