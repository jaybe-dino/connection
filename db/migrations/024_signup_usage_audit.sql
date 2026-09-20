-- 단가 이력 감사 큐 — 020/022 최초 버전의 자동 변경에 노출됐을 수 있는
-- 미청구 사용량(=schema_migrations의 020 적용 시각 이전 verified_at)을
-- 감사 대상으로 수집한다. 값은 바꾸지 않는다. 감사 미해결 행은 월마감
-- 청구서 산입에서 제외되며, 어드민이 원단가 증거를 확인해 수동 확정한다.
CREATE TABLE IF NOT EXISTS signup_usage_audit (
    usage_id   bigint PRIMARY KEY REFERENCES signup_usage(usage_id),
    reason     text NOT NULL,
    price_at_flag integer NOT NULL,
    resolved_at timestamptz,
    resolved_price integer,
    resolved_by text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
DO $$
DECLARE t020 timestamptz;
BEGIN
  IF to_regclass('schema_migrations') IS NULL THEN RETURN; END IF;
  SELECT applied_at INTO t020 FROM schema_migrations
   WHERE name = '020_signup_price_5000.sql';
  IF t020 IS NULL THEN RETURN; END IF;
  INSERT INTO signup_usage_audit (usage_id, reason, price_at_flag)
  SELECT u.usage_id,
         '020/022 최초 버전의 자동 단가 변경 구간 — 원단가 증거 수동 확인 필요',
         u.unit_price
    FROM signup_usage u
   WHERE u.invoice_id IS NULL AND u.verified_at < t020
  ON CONFLICT (usage_id) DO NOTHING;
END $$;
