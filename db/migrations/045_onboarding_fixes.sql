-- 045: 독립 검토 반영 3건.
-- 1) 온보딩 legacy 자격 고정: 마이그레이션 시점에 멤버십을 이미 보유한
--    크리에이터만 legacy(재연결 안내 대상)로 게이트를 통과한다. 이후의
--    신규 가입은 멤버십이 생겨도 legacy가 되지 않는다(우회 차단).
CREATE TABLE legacy_creators (
    creator_id text PRIMARY KEY REFERENCES creators(creator_id),
    fixed_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO legacy_creators (creator_id)
SELECT DISTINCT creator_id FROM memberships;

-- 2) TikTok 소유 인증은 provider의 불변 open_id로 저장·검증한다.
--    (username은 user.info.profile 스코프 — 최소권한 user.info.basic만 요청)
--    같은 open_id가 두 크리에이터에 연결되는 소유 충돌은 유니크로 차단.
ALTER TABLE creator_profiles ADD COLUMN tiktok_open_id text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX creator_profiles_tiktok_open_id
    ON creator_profiles (tiktok_open_id) WHERE tiktok_open_id <> '';

-- 3) 알림 딥링크: 어떤 브랜드/캠페인/셀/메시지에 대한 알림인지 저장한다.
--    열람 권한은 target을 클릭해 이동하는 시점에 기존 멤버십/브랜드
--    가드가 다시 검증한다(알림 자체는 수신자 소유).
ALTER TABLE notifications ADD COLUMN target jsonb NOT NULL DEFAULT '{}';
