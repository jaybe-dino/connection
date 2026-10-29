-- 브랜드 팀 '조회자(viewer)' 역할 추가 — 추가만 한다. 기존 owner/manager 행은 그대로.
-- viewer 는 서버(main.py brand_viewer_readonly 미들웨어)에서 모든 쓰기 요청이 거부된다.
ALTER TABLE brand_team_roles DROP CONSTRAINT IF EXISTS brand_team_roles_role_check;
ALTER TABLE brand_team_roles ADD CONSTRAINT brand_team_roles_role_check CHECK (role IN ('owner','manager','viewer'));
