-- 지메일 연동 + 답장 인박스 (GMAIL_SETUP.md)
-- 심사 최소화 설계: gmail.send(sensitive)만 사용 — 받은편지함은 읽지 않는다.
-- 답장은 Reply-To 전용 주소로 우리 인바운드에 직접 수신 → mail_threads/messages.

CREATE TABLE IF NOT EXISTS gmail_accounts (
    account_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id      text NOT NULL,
    email         text NOT NULL,
    state         text NOT NULL DEFAULT 'connected',  -- connected | revoked | error
    access_token  text NOT NULL DEFAULT '',           -- 암호화 저장(TOKEN_ENC_KEY)
    refresh_token text NOT NULL DEFAULT '',
    token_expiry  timestamptz,
    scopes        text NOT NULL DEFAULT '',
    sent_today    int  NOT NULL DEFAULT 0,            -- 일일 한도 추적
    sent_date     date NOT NULL DEFAULT CURRENT_DATE,
    connected_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (brand_id, email)
);

-- 크리에이터와의 이메일 대화 스레드 (브랜드 편지함이 아니라 우리 DB가 원본)
CREATE TABLE IF NOT EXISTS mail_threads (
    thread_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id       text NOT NULL,
    creator_email  text NOT NULL,
    creator_handle text NOT NULL DEFAULT '',
    subject        text NOT NULL DEFAULT '',
    ari_label      text,                              -- interested | declined | question | other
    state          text NOT NULL DEFAULT 'open',      -- open | closed
    last_direction text NOT NULL DEFAULT 'out',       -- in | out
    last_message_at timestamptz NOT NULL DEFAULT now(),
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (brand_id, creator_email)
);

CREATE TABLE IF NOT EXISTS mail_messages (
    msg_id     bigserial PRIMARY KEY,
    thread_id  uuid NOT NULL REFERENCES mail_threads(thread_id),
    direction  text NOT NULL,                         -- in | out
    from_email text NOT NULL DEFAULT '',
    to_email   text NOT NULL DEFAULT '',
    body       text NOT NULL DEFAULT '',
    state      text NOT NULL DEFAULT 'sent',          -- pending_gate | sent | held
    gate_id    uuid,                                  -- 발신은 OUTBOUND 게이트를 탄다
    sent_via   text NOT NULL DEFAULT '',              -- gmail | sendgrid | demo
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_threads_brand
    ON mail_threads (brand_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_messages_thread
    ON mail_messages (thread_id, created_at);
