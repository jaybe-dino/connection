-- 캠페인 협업 흐름: 선정 → 수수료 합의 → 샘플 → 콘텐츠 제출 → 완료.
-- TikTok 코드는 종류·권한을 구분한다:
--   spark_code      = 광고 사용 권한 코드. 크리에이터가 발급해 제출(권한: 크리에이터)
--   affiliate_link  = 판매 추적 링크/상품 연결. 브랜드가 발급(권한: 브랜드)
--   tiktok_handle   = 계정 식별자(코드 아님). 크리에이터가 합의 시 확인
CREATE TABLE IF NOT EXISTS campaign_terms (
    campaign_id  text NOT NULL REFERENCES campaigns(campaign_id),
    creator_id   text NOT NULL REFERENCES creators(creator_id),
    state        text NOT NULL DEFAULT 'selected',
        -- selected | terms_agreed | sample_shipped | content_submitted | completed | declined
    commission_pct numeric(5,2),          -- 브랜드 제안 → 합의 시 확정
    agreed_commission_pct numeric(5,2),
    tiktok_handle text NOT NULL DEFAULT '',
    sample_tracking text NOT NULL DEFAULT '',
    content_url  text NOT NULL DEFAULT '',
    spark_code   text NOT NULL DEFAULT '',      -- 크리에이터 제출
    affiliate_link text NOT NULL DEFAULT '',    -- 브랜드 발급
    selected_at  timestamptz NOT NULL DEFAULT now(),
    agreed_at    timestamptz,
    shipped_at   timestamptz,
    submitted_at timestamptz,
    PRIMARY KEY (campaign_id, creator_id)
);
