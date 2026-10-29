-- v8.1 브랜드 채널 관리: 기본 채널(chat/products/qna/tips/notice)의 이름·설명·연결 캠페인 수정과
-- 브랜드가 추가한 채널. 추가만 한다 — 행이 없으면 기존 기본 채널 그대로 동작한다. 삭제 대신 보관(archived_at).
CREATE TABLE IF NOT EXISTS brand_channels (
    cell_id      text NOT NULL REFERENCES cells(cell_id),
    key          text NOT NULL CHECK (key ~ '^[a-z0-9-]{2,24}$'),
    name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
    description  text NOT NULL DEFAULT '',
    visibility   text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','readonly')),
    campaign_id  text REFERENCES campaigns(campaign_id),
    archived_at  timestamptz,
    position     integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (cell_id, key)
);
