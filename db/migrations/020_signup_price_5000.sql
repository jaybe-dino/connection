-- 확정 요구사항(2026-09-20): 브랜드별 신규 검증 크리에이터 가입 1명당 5,000원.
-- 50원은 오기였다. 원칙:
--   · 이미 발행(invoice_id 있는)된 사용량과 확정 청구서는 소급 변경하지 않는다.
--   · 미청구 사용량과 정책 단가만 5,000원으로 정정한다.
--   · 같은 (brand, creator) 중복 가입 무과금은 UNIQUE 제약이 계속 보장한다.
-- 참고: 018/019 번호는 별도 작업 트리의 미커밋 초안과의 충돌을 피하기 위해 건너뛴다.
UPDATE signup_billing_policy SET unit_price = 5000 WHERE unit_price <> 5000;
UPDATE signup_usage SET unit_price = 5000
 WHERE invoice_id IS NULL AND unit_price <> 5000;
