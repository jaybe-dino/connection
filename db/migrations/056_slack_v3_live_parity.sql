-- slack-v3 실서비스 패리티: 원본 디자인의 요소를 실데이터로 구동하기 위한
-- 최소 스키마 — 메시지 리액션(단일 ♡ 토글), 메시지 이미지 첨부(공개 HTTPS),
-- 협업별 샘플 수령 정보(양 당사자만 조회), 브랜드 수정 요청 단계.
-- 알림 설정은 기존 notification_prefs(002)를 재사용한다(행 없음=켜짐,
-- channels='{}'=끔).

CREATE TABLE IF NOT EXISTS message_reactions (
    msg_id     bigint NOT NULL REFERENCES cell_messages(msg_id) ON DELETE CASCADE,
    actor      text   NOT NULL,   -- 'creator:<id>' | 'brand:<brand_id>' | 'admin'
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (msg_id, actor)
);

ALTER TABLE cell_messages
    ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '';

-- campaign_terms.state 에 'revision_requested' 추가:
--   selected | terms_agreed | sample_shipped | content_submitted
--   | revision_requested | completed | declined
ALTER TABLE campaign_terms
    ADD COLUMN IF NOT EXISTS shipping jsonb,
    ADD COLUMN IF NOT EXISTS revision_note text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS revision_requested_at timestamptz;
