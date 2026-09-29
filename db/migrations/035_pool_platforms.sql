-- 035: 수동/CSV 후보 등록용 platform 확장 — 기존 값 불변, 추가만.
ALTER TYPE platform_t ADD VALUE IF NOT EXISTS 'youtube';
ALTER TYPE platform_t ADD VALUE IF NOT EXISTS 'manual';
