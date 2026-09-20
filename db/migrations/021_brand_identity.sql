-- 브랜드 아이덴티티 — 콘솔·PR 리스트·가입/커뮤니티 화면의 로고·이름 표시.
-- theprlist 서비스 표기는 유지하고 브랜드 간 로고가 섞이지 않도록 brand_id 단위 저장.
-- 참고: 019 번호는 별도 작업 트리의 미커밋 초안(019_brand_identity.sql)과의
--       파일 충돌을 피해 건너뛰었다. 컬럼은 IF NOT EXISTS로 멱등.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '';
ALTER TABLE brands ADD COLUMN IF NOT EXISTS tagline  text NOT NULL DEFAULT '';
