-- v8.1 제품 편집기(B03) 이미지: 대표 1장 + 추가 최대 4장. 외부 스토리지 없이 DB 에 저장(추가만).
-- 형식·크기 제한, 브랜드 소유 확인, 삭제는 보관(deleted_at) — 교체 실패 시 기존 사진이 그대로 남는다.
CREATE TABLE IF NOT EXISTS product_images (
    image_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   uuid NOT NULL REFERENCES brand_products(product_id),
    brand_id     text NOT NULL REFERENCES brands(brand_id),
    slot         text NOT NULL CHECK (slot IN ('main','extra')),
    content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
    data         bytea NOT NULL,
    size_bytes   integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 2000000),
    sha256       text NOT NULL,
    created_by   text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_main_image ON product_images (product_id) WHERE slot = 'main' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images (product_id) WHERE deleted_at IS NULL;
