-- 의미 기반 AI 후보 평가 캐시 — 제품 프로필 버전 × 후보 단위로 저장해
-- 같은 입력의 재호출 비용을 없앤다(비용 상한 정책의 일부).
-- 값은 "모델의 평가 점수 + 제공된 데이터에서 검증된 근거"만 담고,
-- 어떤 실측 지표도 생성·저장하지 않는다.
CREATE TABLE IF NOT EXISTS candidate_ai_scores (
    product_id      uuid NOT NULL REFERENCES brand_products(product_id),
    profile_version integer NOT NULL,
    platform_uid    text NOT NULL,
    fit             integer NOT NULL CHECK (fit BETWEEN 0 AND 100),
    reason          text NOT NULL,
    signals         jsonb NOT NULL DEFAULT '[]',   -- 후보 실데이터에서 검증된 근거만
    model           text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, profile_version, platform_uid)
);
CREATE INDEX IF NOT EXISTS candidate_ai_scores_day
    ON candidate_ai_scores (created_at);
