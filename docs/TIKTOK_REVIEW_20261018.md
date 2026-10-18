# TikTok 커뮤니티 서비스 심사 — 2026-10-18

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
- API 검사 239개 통과. Railway 배포 `9a946520-8bc8-4d35-8446-c8bc53d5f5ec` 성공과 운영 `/health`의 DB 정상 응답 확인.
- 심사 양식에는 커뮤니티 중심 설명, 최소 권한, 사이트/콜백을 입력했다. 시연 영상이 없으면 Save도 완료되지 않아 Production 초안이 영구 저장됐다고 보고하지 않는다.
- 실제 운영 app 로그인 → TikTok 인증 → app 복귀 영상과 Production 심사 제출·승인은 미완료다. 운영 크리에이터 로그인 세션이 없고, 사용자의 메일 발송 금지에 따라 로그인 메일도 보내지 않았다.
- 이메일 캠페인·결제 실행은 0건이다. 실제 대량 처리량 달성은 검증하지 않았다.

## 운영 설정

- `TIKTOK_MODE=sandbox`
- `TIKTOK_SANDBOX_ALLOWED_EMAILS=qa-tiktok@theprlist.net`
- `TIKTOK_REDIRECT_URI=https://api.theprlist.net/tiktok/callback`
- Sandbox 키/시크릿은 Railway 환경변수에 저장하며 이 문서에 기재하지 않는다.
- 이 이메일의 운영 계정 생성/로그인은 아직 확인되지 않았다. 실제 시연에 사용하는 회사 크리에이터 이메일이 확인되면 허용목록을 그 계정으로 변경하고 시작/콜백 격리를 재검사한다.
- 승인 전 `production` 모드 전환 금지. TikTok 승인 후 Production 키/시크릿과 모드 교체 및 실제 도메인 인증 검수를 거친다.

## 롤백

원본 소스 `02ccdd2`, 이전 API 배포 `9c427e87-73b9-4122-b89f-55a153ce44a2`.

원격 태그 `tiktok-review-before-20261018`와 작업 브랜치 `codex/tiktok-review-20261018`를 보존했다.

이번 추가 변수 5개(`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_MODE`, `TIKTOK_SANDBOX_ALLOWED_EMAILS`, `TIKTOK_REDIRECT_URI`)는 적용 전 모두 없었다. 롤백 시 이전 API 소스로 되돌리고 해당 변수를 제거한 뒤 재배포한다. frontend·DB 스키마 변경은 없다. 도메인 검증 TXT는 유지 가능하며 기존 DNS 레코드를 바꾸지 않았다.

## 전체 요구사항 중 별도 미완료

1. 운영의 서로 다른 두 브랜드에서 수신자 링크 → 로그인 → 해당 브랜드 신청 저장·커뮤니티 귀속·다른 브랜드 접근 차단 검수.
2. 브랜드/제품/제안 조건 확정과 실제 발신 계정 지정·배치 검수. 현재 초안 매핑과 OAuth 연결은 실제 발송 준비 완료와 다르다.
3. 제품 적합성에 따른 DB 집군 추천과 추천 이유, 대량 선별 UX의 완성·실데이터 검수.
4. 회신 분류·담당 배정·후속 초안, 반송·불만 자동 억제, 실측 전달성에 따른 속도 조절.
5. 주간/월간 고유 인원과 발송 시도·배달·회신·신청·확정·배송·게시·판매 및 비용·수익 통합 집계.
6. 다음 브랜드/제품 추천, 기존 대화 발신 고정 및 접촉 빈도를 함께 관리하는 반복 참여 흐름.

핵심 배포 완료, 외부 승인 대기, 추가 개발, 운영 종단 검수 미완료를 구분한다. 전체 개발 완료 또는 하루 신규 1만 명 발송 가능으로 보고하지 않는다.
