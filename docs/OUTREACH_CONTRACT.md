# 중앙 아웃리치 연동 계약 — 구현 확인본 (2026-10-18)

상태: 아웃리치 운영 채팅과 협의 완료. 서비스 전환 수정본과 운영 소스 194362e를 통합했다. 이 문서는 구현된 경로와 준비 중인 기능을 구분한다. 실제 발송·월 3만 명 처리 성공을 뜻하지 않는다.

## 원칙과 귀속

중앙 운영 공간에서 발신 계정을 관리하며, 모집 매핑의 target_brand_id·product_id·campaign_id를 서버가 검증한다. 신청은 수신자별 불투명 토큰으로 고정된 고객 브랜드에 귀속된다. 공개 조회와 이메일 로그인만으로 가입·비용이 발생하지 않는다. 명시적 신청과 검증 가입 과금은 별도다.

## 구현된 API와 토큰

- 어드민 매핑: /admin/recruitment/mappings.
- 단일 발신 검수·초안: POST /admin/recruitment/mappings/{mapping_id}/preview 및 /drafts.
- 복수 발신 분산 검수·초안: POST /admin/recruitment/mappings/{mapping_id}/distributed/preview 및 /distributed/drafts.
- 공개 모집 조회: GET /recruitment-links/{token}.
- 인증 후 신청: POST /recruitment-links/{token}/apply.
- 브랜드별 신청 조회: GET /recruitment-links/brands/{brand}/applications. 해당 브랜드 권한을 검사한다.

토큰은 무작위로 생성하며 해시만 DB에 저장한다. link_id → recipient → batch 관계로 대상 브랜드·제품·캠페인을 찾는다. 만료, 배치 취소, 차단·수신거부, 브랜드 정지, 제품·캠페인 유효성을 검사하고 로그인 이메일과 초대 수신자를 대조한다. source/UTM 및 cancelled_at 전용 저장 필드는 현재 없다. 다른 기기에서도 같은 초대 URL과 일치하는 이메일로 문맥을 복원한다.

## 전환 기록과 과금

recruitment_link_events의 (link_id, kind) 유니크로 중복 이벤트를 방지한다. 애플리케이션은 INSERT로 기록하지만 DB에서 UPDATE/DELETE를 금지한 강제 append-only 구조는 아니다.

| kind | 의미 |
| --- | --- |
| click | 유효 모집 링크 조회. 사람의 클릭 여부를 검증한 수치가 아님 |
| blocked | 차단된 링크 조회 기록 |
| join | 해당 초대를 통한 새 멤버십 생성 |
| verify | 운영 검증 시 초대 귀속 기록. 기존 signup_usage 과금 규칙 유지 |
| apply | 제품 모집 신청 저장. 캠페인 없는 모집에도 기록 가능 |

검증 가입 1명당 5,000원(부가세 포함)을 월별 합산하며 기존 중복 과금 방지를 유지한다. 전용 /admin/recruitment/conversions 집계 API와 외부 HMAC 이벤트 수신 계약은 아직 구현되지 않았다.

## 발송 제어

연결된 중앙 발신 계정을 명시 선택한다. rolling 24시간 최대 200건·최소 60초 간격, 기존 예약분 차감과 균등 분산을 적용한다. 기존 대화는 원래 발신 계정을 고정하고 실제 전달 직전에 재검사한다. 수신거부·중복 억제·정지 브랜드 차단을 유지한다.

046 마이그레이션의 auto_resume 기본값은 false다. 운영 GMAIL_SEND_RESUME_ENABLED=scoped에서는 새로 명시 승인한 배치만 자동 재개하며 기존 승인 배치는 제외한다. 수동 중지·발송 전 검토·배치별 승인 흐름을 유지한다. 점진 웜업 2→200 자동 운영과 반송·불만 자동 억제 전체 구현은 확인되지 않았다.

## 외부 의존성과 미완료

신규 크리에이터는 TikTok 소유 인증이 필요하다. 10월 18일 Sandbox 실제 소유 인증을 격리 DB에서 확인했다. 운영 API에는 `TIKTOK_MODE=sandbox`와 지정 이메일 허용목록을 적용했으며, 일반 사용자의 인증 시작과 신규 모집 준비 상태는 열지 않았다. 허용목록은 인증 시작과 콜백에서 다시 검사한다. Production 심사 제출·승인은 아직 미완료다. 자세한 배포·롤백·미완료 기준은 `TIKTOK_REVIEW_20261018.md`를 참조한다.

추가 발신 계정은 각 계정의 Google OAuth 승인이 필요하다. 운영 관리자 로그인 후 실제 저장·신청 종단 검수와 발신 계정 잔여량 재확인이 남았다. 실제 대량 이메일·실결제는 이번 통합 검수에서 실행하지 않는다.
