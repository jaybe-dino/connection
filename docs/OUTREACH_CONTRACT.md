# 중앙 아웃리치 연동 계약 초안 (2026-10-17)

상태: **초안** — 별도 채팅 「(아웃리치)월 3만 명 어필리에이트 운영 중요」
의 정확한 링크·협의는 완료되지 않았다. 본 문서는 연동 파트너에게
제시할 서버 측 계약이며, 기존 구현(routes_recruitment_links,
routes_outreach_bulk)을 재사용한다 — **새 서명 토큰 체계를 중복 도입하지
않는다**(불투명 토큰+DB 해시가 요구사항 충족: 위조 불가·서버 단독
검증·수신자 비노출).

## 1. 원칙

- 발송 작업 공간은 **중앙 하나**(admin workspace). 가입·캠페인 신청의
  귀속은 각 모집 건의 `target_brand_id`/`product_id`/`campaign_id`로
  서버가 검증한다(URL의 brand_id 임의 변경으로 타 브랜드 접근 불가 —
  토큰이 대상을 고정).
- 링크 조회·이메일 로그인만으로 멤버십·비용이 생기지 않는다. 명시적
  가입(join)·신청(apply)·검증(verify)은 서로 다른 전환이다.
- 실제 대량 발송과 월 3만 명 처리 성공은 이 계약 문서로 검증되지 않는다.

## 2. 초대 토큰 (기존 재사용)

- 생성: 어드민 전용 `POST /admin/recruitment/batches`(기존) — 수신자별
  **불투명 토큰**을 발급하고 서버에는 해시만 저장. 레코드:
  `invitation_id, target_brand_id, product_id, campaign_id, email(해시
  대조용), source, utm_{source,medium,campaign}, expires_at,
  cancelled_at, optout 연계`.
- 공개 조회: `GET /r/{token}`(기존) — 수신자 이메일 비노출, 만료/취소/
  수신거부면 해당 상태만 반환.
- 귀속 유지: 토큰이 세션·localStorage가 아니라 **URL+서버 레코드**로
  유지되므로 로그인 리다이렉트·이탈·재접속·다른 기기에서도 target
  브랜드/캠페인이 보존된다(기존 application context 테스트 존재).
- 이메일 일치: 로그인 계정 이메일과 초대 수신자 일치 검증(기존).
  재가입/중복: memberships ON CONFLICT·usage 중복 과금 방지 기존 규칙.

## 3. 전환 이벤트 (이번 추가)

`recruitment_link_events` — append-only, (invitation, kind) 멱등:

| kind | 기록 시점 | 비고 |
|---|---|---|
| click | GET /r/{token} 최초 유효 조회 | 만료/취소는 기록하되 kind=blocked |
| join | 해당 토큰 경유 멤버십 생성 | 비용 아님 |
| verify | 운영 검증(기존 /admin/creators/{id}/verify) 시 토큰 귀속 발견 | 과금 트리거는 기존 signup_usage 규칙 그대로 |
| apply | 토큰의 campaign에 신청 | |

어드민 조회: `GET /admin/recruitment/conversions?batch=` —
click/join/verify/apply 집계와 브랜드 귀속. 외부 시스템 쓰기 연동 시:
HTTPS + 어드민 자격 + `Idempotency-Key` 헤더(이벤트 재전송 중복 방지,
서버는 (invitation, kind) 유니크로 2차 방어) + 요청 본문 서명(합의 후
HMAC 헤더 — 키 교환 전까지 미활성).

## 4. 발송 제어 (기존 유지)

- 발신자 분리: gmail_accounts 복수·명시 발신자(a9004ea), 계정별 점진
  발송 한도(워밍업 2→…→200, 소유자 승인 상한 7677879), 중지:
  sending_paused·GMAIL_SEND_RESUME_ENABLED=0, 재시도: pending 보존.
- 수신거부(outreach_optouts)·90일 중복·반송 시 발송 차단 기존 규칙.
  초대 배치도 발송 전 optout 대조.

## 5. 파트너에게 받는 것 / 주는 것

- 받는 것: 수신자 목록(이메일·국가·언어), source/UTM, 배치 식별자.
- 주는 것: 수신자별 초대 URL(토큰), 전환 집계 API(수신자 이메일은
  해시/마스킹), 수신거부 목록 반영 확인.
- 금지: 토큰 재사용 가능한 공용 링크, 이메일 평문 회신, 브랜드별
  연락처 원본 제공.
