-- 정정(2026-09-20): 020이 미청구 signup_usage 전체를 5,000원으로 올린 것은
-- "소급 인상 금지" 원칙 위반이었다. 50원은 오기가 아니라 과거 정책(012, 도입가).
-- 원칙: 신규 검증 가입(020 적용 시각 이후 기록)부터 5,000원 월합산,
--       그 이전 기록은 기록 당시 단가(도입가 50원)로 복원,
--       발행된 청구서(invoice_id 있는 행)는 어떤 경우에도 불변,
--       같은 (브랜드, 크리에이터) 중복 가입 무과금은 UNIQUE가 계속 보장.
-- 증거: schema_migrations.applied_at('020...') 이전 verified_at 행은 012가
--       도입가 50원으로 기록해 둔 상태였다 — 그 값으로 되돌린다.
-- 이 파일은 020 실행 여부와 무관하게 수렴한다(020 미실행 환경은 대상 행 0).
DO $$
DECLARE t020 timestamptz;
BEGIN
  IF to_regclass('schema_migrations') IS NULL THEN RETURN; END IF;
  SELECT applied_at INTO t020 FROM schema_migrations
   WHERE name = '020_signup_price_5000.sql';
  IF t020 IS NULL THEN RETURN; END IF;
  UPDATE signup_usage SET unit_price = 50
   WHERE invoice_id IS NULL AND unit_price = 5000 AND verified_at < t020;
END $$;
