-- 틱톡샵 대량 발송 (TIKTOKSHOP_DISPATCH_PLAN.md §6)
-- 배치: DRAFT → PENDING_GATE → APPROVED → SENDING → DONE / HELD / CANCELLED
-- 개별: INVITED → ACCEPTED → SHIPPED → DELIVERED → CONTENT_POSTED → SETTLED
--       분기: DECLINED · EXPIRED · NO_CONTENT · RETURNED · LOST

CREATE TABLE IF NOT EXISTS dispatch_batches (
    batch_id       text PRIMARY KEY,
    brand_id       text NOT NULL,
    campaign_id    text,
    product_ref    text NOT NULL,               -- 틱톡샵 상품 ID/이름
    commission_pct int  NOT NULL DEFAULT 10,
    unit_cost      int  NOT NULL DEFAULT 0,     -- 샘플 원가(원)
    capacity       int  NOT NULL,
    deadline_days  int  NOT NULL DEFAULT 14,    -- 도착 후 게시 기한
    target_filter  jsonb NOT NULL DEFAULT '{}',
    state          text NOT NULL DEFAULT 'DRAFT',
    gate_id        uuid,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispatches (
    dispatch_id  bigserial PRIMARY KEY,
    batch_id     text NOT NULL REFERENCES dispatch_batches(batch_id),
    creator_id   text NOT NULL,
    handle       text NOT NULL,
    state        text NOT NULL DEFAULT 'DRAFT',
    tracking_no  text,
    carrier      text,
    content_url  text,
    gmv          numeric NOT NULL DEFAULT 0,
    commission   numeric NOT NULL DEFAULT 0,
    invited_at   timestamptz,
    accepted_at  timestamptz,
    shipped_at   timestamptz,
    delivered_at timestamptz,
    content_at   timestamptz,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dispatches_batch_ix ON dispatches (batch_id, state);

-- 재발송 금지(90일): 같은 브랜드·크리에이터 최근 발송 조회용
CREATE INDEX IF NOT EXISTS dispatches_creator_ix ON dispatches (creator_id, invited_at);
