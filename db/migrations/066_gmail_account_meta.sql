-- Gmail 운영: 계정 메타데이터(소속 브랜드·담당자) 일괄 등록. 연결(OAuth)은 계정마다 소유자가 Google 에서 직접 승인해야 하며
-- 이 표는 연결 상태를 바꾸지 않는다(연결 전 계정도 목록에 '연결 전'으로 보인다).
CREATE TABLE IF NOT EXISTS gmail_account_meta (
    email       text PRIMARY KEY CHECK (email = lower(email)),
    brand_id    text REFERENCES brands(brand_id),
    owner       text NOT NULL DEFAULT '',
    created_by  text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
