# TikTok 커뮤니티 서비스 심사 — 2026-10-18

최신 상태: Production 심사 제출 완료, **In review**. chief@dinostudio.kr의 운영 app 로그인 → 실제 TikTok Sandbox 인증 → 운영 콜백 성공 → 브랜드방 복귀를 확인했고, 실제 시연 MP4(94.73초)를 첨부했다. 일반 사용자 인증은 계속 차단되어 있다.

## 제품 설명과 요청 권한

Theprlist는 크리에이터가 브랜드별 커뮤니티에 참여하고, 브랜드 담당자와 제품을 논의하고, 공지를 확인하며 캠페인에 참여하는 서비스다. TikTok Login Kit는 본인의 TikTok 계정 소유를 확인하는 데 사용한다. 요청 범위는 `user.info.basic` 하나다. TikTok 게시·DM·팔로워·Shop API는 요청하지 않는다. 이는 회사 내부 이메일 모집 기능을 TikTok 기능으로 설명한다는 뜻이 아니다.

공개 설명: “Brand communities where creators discuss products, join campaigns and manage collaborations.”

Web URL: `https://app.theprlist.net`

콜백: `https://api.theprlist.net/tiktok/callback`

약관/개인정보: `https://theprlist.net/terms`, `https://theprlist.net/privacy`

## 확인한 결과와 한계

- 회사 DINOSTUDIO 조직의 theprlist 앱과 Login Kit Sandbox를 생성했다. 회사 도메인 소유 확인도 완료했다.
- 사용자가 승인한 실제 TikTok 테스트 계정으로 OAuth 동의 → 서버 콜백 → 소유 인증 연결 상태를 확인했다. 이 시험은 임시 HTTPS 터널과 격리된 로컬 DB에서 진행했으며 운영 사이트 종단 시험으로 세지 않는다.
- API 수정 `c963543`은 Sandbox 모드에서 활성 크리에이터의 정확한 이메일 허용목록만 인증을 시작할 수 있게 한다. 콜백에서도 허용목록을 다시 검사한다. 일반 사용자는 인증·신규 모집 준비 상태를 열지 않는다.
- 최초 API 검사 239개 통과. 이후 공용 모집 보완을 포함한 API·청구 347개, 기존 UI 78개 통과. 최초 배포 이후 변경 기록은 `RECRUITMENT_OPERATIONS_20261018.md`와 배포 증빙 JSON으로 구분한다.
- 심사 양식의 커뮤니티 설명·최소 권한·사이트/콜백과 실제 운영 사이트 시연 영상을 저장하고, 제출 후 **In review** 상태를 확인했다.
- 사용자 승인에 따라 chief 로그인 메일 1통만 요청했다. 회사 Gmail에서 그 발송 기록을 확인하고 로그인 링크로 Theprlist 로그인했다. 운영 도메인에서 실제 OAuth 인증과 영상·심사 제출을 완료했다. 심사 승인은 미완료다.
- 이메일 캠페인·결제 실행은 0건이다. 실제 대량 처리량 달성은 검증하지 않았다.

## 운영 설정

- `TIKTOK_MODE=sandbox`
- `TIKTOK_SANDBOX_ALLOWED_EMAILS=chief@dinostudio.kr`
- `TIKTOK_REDIRECT_URI=https://api.theprlist.net/tiktok/callback`
- Sandbox 키/시크릿은 Railway 환경변수에 저장하며 이 문서에 기재하지 않는다.
- chief 계정은 운영 로그인과 실제 TikTok 연결을 확인했다. 일반 사용자의 신규 인증 시작과 모집 준비 상태는 열지 않는다. 키는 Sandbox 키이며 Production 승인으로 표시하지 않는다.
- 승인 전 `production` 모드 전환 금지. TikTok 승인 후 Production 키/시크릿과 모드 교체 및 실제 도메인 인증 검수를 거친다.

## 롤백

원본 소스 `02ccdd2`, 이전 API 배포 `9c427e87-73b9-4122-b89f-55a153ce44a2`.

원격 태그 `tiktok-review-before-20261018`와 작업 브랜치 `codex/tiktok-review-20261018`를 보존했다.

이번 추가 변수 5개(`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_MODE`, `TIKTOK_SANDBOX_ALLOWED_EMAILS`, `TIKTOK_REDIRECT_URI`)는 적용 전 모두 없었다. 롤백 시 이전 API 소스로 되돌리고 해당 변수를 제거한 뒤 재배포한다. frontend·DB 스키마 변경은 없다. 도메인 검증 TXT는 유지 가능하며 기존 DNS 레코드를 바꾸지 않았다.

## 전체 요구사항 중 별도 미완료

1. 운영의 서로 다른 두 브랜드에서 수신자 링크 → 로그인 → 해당 브랜드 신청 저장·커뮤니티 귀속·다른 브랜드 접근 차단 검수.
2. 브랜드/제품/제안 조건 확정과 실제 발신 계정 지정·배치 검수. 현재 초안 매핑과 OAuth 연결은 실제 발송 준비 완료와 다르다.
3. 제품별 집군 추천·일괄 선별 UX는 추가 배포했다. 운영 creator_pool이 0개여서 Air 원본 반입·검수와 실제 후보 적합성 검수가 남았다.
4. 추천 분류·담당 배정·원래 발신 계정 답장 초안, 근거 있는 반송·불만 차단과 보수적 중지는 추가했다. 모든 제공자 피드백 수신·자동 증량·자동 답장 발송은 별도다.
5. 기간·브랜드별 고유 신청자·전환·원가 집계를 추가했다. 실제 네트워크 시도 원장·수령·게시·주문 연동은 미집계로 구분한다.
6. 다음 브랜드/제품 추천, 기존 대화 발신 고정 및 접촉 빈도를 함께 관리하는 반복 참여 흐름.

핵심 배포 완료, 외부 승인 대기, 추가 개발, 운영 종단 검수 미완료를 구분한다. 전체 개발 완료 또는 하루 신규 1만 명 발송 가능으로 보고하지 않는다.
