-- 검수 지적: commission_pct=12.5 제품 캠페인이 affiliatePct=12로 절사됨.
-- 소수 수수료를 컬럼부터 보존한다.
ALTER TABLE campaigns ALTER COLUMN affiliate_pct TYPE numeric(5,2)
  USING affiliate_pct::numeric(5,2);
