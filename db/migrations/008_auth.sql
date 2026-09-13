-- 실인증 체계 (로드맵 Phase 1-1)
-- 브랜드: 이메일+비밀번호 / 크리에이터: 매직링크 / 어드민: 비밀번호+TOTP 2FA
-- 세션은 무상태 JWT — AUTH_REQUIRED=1 이면 전면 강제, 아니면 간이 키와 병행.

CREATE TABLE IF NOT EXISTS users (
    user_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind          text NOT NULL,               -- brand | creator | admin
    email         text NOT NULL UNIQUE,
    password_hash text,                        -- scrypt$salt$hash (크리에이터는 NULL)
    brand_id      text,                        -- kind=brand 일 때 소속
    creator_id    text,                        -- kind=creator 일 때 연결
    totp_secret   text,                        -- kind=admin 2FA (base32)
    totp_enabled  boolean NOT NULL DEFAULT false,
    state         text NOT NULL DEFAULT 'active',   -- active | disabled
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz
);

-- 1회용 토큰: 매직링크 로그인·브랜드 초대 (원문은 저장하지 않고 해시만)
CREATE TABLE IF NOT EXISTS auth_tokens (
    token_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(user_id),
    kind       text NOT NULL,                  -- magic | invite
    token_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_users_brand ON users (brand_id) WHERE brand_id IS NOT NULL;
