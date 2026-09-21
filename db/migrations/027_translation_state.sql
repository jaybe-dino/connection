-- 검수 지적: ai.translate 실패 시 메시지 자체가 저장되지 않음.
-- 원문 선저장 + 번역 상태 머신(pending→done|failed) + 재시도 횟수.
ALTER TABLE cell_messages ADD COLUMN IF NOT EXISTS
    translation_state text NOT NULL DEFAULT 'done';   -- done | pending | failed
ALTER TABLE cell_messages ADD COLUMN IF NOT EXISTS
    translation_attempts integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS cell_messages_tr_pending
    ON cell_messages (translation_state) WHERE translation_state = 'pending';
