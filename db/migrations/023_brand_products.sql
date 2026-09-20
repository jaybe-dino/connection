-- 브랜드의 복수 제품: 제품별 학습(근거·버전) + 제품별 틱톡샵 캠페인 연결.
CREATE TABLE IF NOT EXISTS brand_products (
    product_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id    text NOT NULL REFERENCES brands(brand_id),
    name        text NOT NULL,
    tiktok_product_ref text NOT NULL DEFAULT '',   -- 틱톡샵 상품 ID·URL (식별자, 광고코드 아님)
    commission_pct numeric(5,2) NOT NULL DEFAULT 10 CHECK (commission_pct >= 0 AND commission_pct <= 80),
    state       text NOT NULL DEFAULT 'active',    -- active | archived
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (brand_id, name)
);

-- 제품 정보는 브랜드 프로필과 같은 방식의 버전·근거 체계
CREATE TABLE IF NOT EXISTS product_profile_versions (
    product_id uuid NOT NULL REFERENCES brand_products(product_id),
    version    integer NOT NULL,
    fields     jsonb NOT NULL DEFAULT '{}',        -- {key:{value,evidence,source,confirmed}}
    note       text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, version)
);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES brand_products(product_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON brand_products (brand_id, created_at);
