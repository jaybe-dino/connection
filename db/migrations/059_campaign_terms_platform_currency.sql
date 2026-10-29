-- v8.1 캠페인 조건: 콘텐츠 플랫폼·보상 통화, 그리고 합의 시점의 조건 스냅샷.
-- 추가만 한다. 기존 캠페인은 platform='tiktok', reward_currency='KRW'(기존 reward_amount 단위)로 그대로 해석된다.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'tiktok';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS reward_currency text NOT NULL DEFAULT 'KRW';
DO $$ BEGIN
  ALTER TABLE campaigns ADD CONSTRAINT campaigns_platform_check CHECK (platform IN ('tiktok','instagram'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE campaigns ADD CONSTRAINT campaigns_reward_currency_check CHECK (reward_currency ~ '^[A-Z]{3}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE campaign_terms ADD COLUMN IF NOT EXISTS platform_handle text NOT NULL DEFAULT '';
ALTER TABLE campaign_terms ADD COLUMN IF NOT EXISTS agreed_terms jsonb;
