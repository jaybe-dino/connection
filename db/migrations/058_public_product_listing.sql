-- 독립 제품 모아보기(app.theprlist.net/products/)용 공개 목록 표시.
-- 추가만 한다: 기본값 false 라 기존 제품은 모두 비공개로 남는다.
ALTER TABLE brand_products ADD COLUMN IF NOT EXISTS public_listed boolean NOT NULL DEFAULT false;
ALTER TABLE brand_products ADD COLUMN IF NOT EXISTS public_listed_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_products_public ON brand_products (public_listed) WHERE public_listed;
