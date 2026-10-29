-- 관리자 이식: 실제 효과가 남는 운영 조치.
-- D03 크리에이터 협업 제출을 전사 검수 대기열과 같은 기록으로(버전별 행, 이전 버전은 superseded로 보존)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS source  text NOT NULL DEFAULT 'direct';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS submissions_pair_ix ON submissions (campaign_id, creator_id, created_at DESC);
-- D05 신고 조치의 실제 효과: 메시지 숨김 + 작성자 쓰기 제한(기간/무기한) + 복구
ALTER TABLE cell_messages ADD COLUMN IF NOT EXISTS author_id text;
ALTER TABLE cell_messages ADD COLUMN IF NOT EXISTS hidden_at timestamptz;
ALTER TABLE cell_messages ADD COLUMN IF NOT EXISTS hidden_by text;
CREATE TABLE IF NOT EXISTS creator_sanctions (
    sanction_id bigserial PRIMARY KEY,
    creator_id  text NOT NULL REFERENCES creators(creator_id),
    kind        text NOT NULL CHECK (kind IN ('write_block')),
    until       timestamptz,               -- NULL = 해제 전까지
    report_id   uuid,
    created_by  text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    lifted_at   timestamptz,
    lifted_by   text
);
CREATE INDEX IF NOT EXISTS creator_sanctions_active_ix ON creator_sanctions (creator_id) WHERE lifted_at IS NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS effect jsonb NOT NULL DEFAULT '{}';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS restored_at timestamptz;
