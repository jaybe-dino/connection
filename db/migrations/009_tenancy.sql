-- 멀티테넌시 — 데모 시드와 실브랜드를 구분한다.
-- 데모 브랜드(glowlab·aura)는 영업 시연용으로 유지하되 표시로 격리.

ALTER TABLE brands ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
UPDATE brands SET is_demo = true WHERE brand_id IN ('glowlab', 'aura');
