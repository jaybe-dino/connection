-- 비밀번호 재설정(브랜드·관리자) 지원.
-- 1) session_epoch: 비밀번호 재설정 시 +1 — JWT의 se 클레임과 비교해
--    기존 세션을 전부 무효화한다(재설정 = 기존 로그인 폐기).
-- 2) password_reset_requests: 계정/IP 재요청 제한용 기록(이메일 존재
--    여부와 무관하게 모든 요청을 기록 — 응답으로 존재를 노출하지 않는다).
-- 재설정 토큰 자체는 기존 auth_tokens(kind='reset', 해시만 저장)를 쓴다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS
    session_epoch integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS password_reset_requests (
    id           bigserial PRIMARY KEY,
    email        text NOT NULL,
    ip           text NOT NULL DEFAULT '',
    requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_requests_ip
    ON password_reset_requests (ip, requested_at);
CREATE INDEX IF NOT EXISTS password_reset_requests_email
    ON password_reset_requests (email, requested_at);
