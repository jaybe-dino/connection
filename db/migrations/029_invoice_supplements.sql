-- 검수 재현(4차): 같은 달 사용량 일부가 감사 보류로 선청구에서 빠진 뒤
-- 확정되면, UNIQUE(brand_id,period) 때문에 월마감 INSERT가 UniqueViolation
-- 으로 실패했다. 발행·결제된 청구서는 불변 보존해야 하므로 기존 청구서를
-- 고치는 대신 같은 월의 '추가 청구'(seq>0) 청구서를 발행한다.
-- seq=0 이 본청구, 1부터 지연 확정분 추가 청구. 금액 검증은 012의
-- CHECK(amount>0) 그대로(단가 혼재 허용).
ALTER TABLE signup_invoices ADD COLUMN IF NOT EXISTS seq integer NOT NULL DEFAULT 0;
ALTER TABLE signup_invoices DROP CONSTRAINT IF EXISTS signup_invoices_brand_id_period_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'signup_invoices_brand_period_seq_key') THEN
    ALTER TABLE signup_invoices
      ADD CONSTRAINT signup_invoices_brand_period_seq_key
      UNIQUE (brand_id, period, seq);
  END IF;
END $$;
