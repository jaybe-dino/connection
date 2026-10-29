-- 샘플 필요 여부 — 샘플 없는 UGC/보유 제품 캠페인은 합의 후 주소 수집·발송 없이 바로 영상 제출.
-- 기존 캠페인은 지금 동작(샘플 발송) 그대로 유지하도록 기본 true.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sample_required boolean NOT NULL DEFAULT true;
