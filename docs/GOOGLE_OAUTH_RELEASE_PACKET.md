# Google OAuth 공개 검증 제출 자료 — 2026-09-30

상태: 제출 준비 문서. Google 승인·보안 평가 완료를 주장하지 않는다.

## 앱 정보
- 앱: theprlist / The PR List (Google Branding의 실제 이름과 최종 일치 확인 필요)
- 프로젝트: storied-lodge-508514-e5
- 홈페이지: https://theprlist.net
- 개인정보처리방침: https://theprlist.net/privacy
- 이용약관: https://theprlist.net/terms
- 지원: chief@dinostudio.kr
- 콜백: https://api.theprlist.net/gmail/callback

## 제출용 기능 설명
The PR List helps brands manage creator collaboration outreach and incoming replies. A brand operator connects a dedicated Gmail or Google Workspace account. The app sends only operator-approved outreach messages and replies from that connected account. The brand inbox displays synchronized incoming messages. Access is restricted to the corresponding brand and authorized administrators.

## 범위별 필요성
- openid / email: identify the Google account selected by the brand operator and display the connected address. The same address cannot be linked to two brands.
- gmail.send: send operator-approved creator collaboration invitations and replies. No mailbox editing or deletion is needed.
- gmail.readonly: retrieve recent inbox message bodies so the brand operator can read and answer incoming mail inside the app. Metadata-only access cannot display the message body. The app does not download attachments or mark messages read, delete them, or modify Gmail labels.

## 실제 데이터 처리
최근 30일 받은편지함을 최신 페이지 우선으로 동기화한다. 발신자·수신자·제목·본문 텍스트·시각·Gmail 메시지/대화 식별자를 서버 DB에 저장한다. 토큰은 암호화한다. 수신 본문은 동기화 과정에서 AI 제공자에게 전달하지 않으며 관심/거절 분류는 로컬 규칙이다. 연결 해제는 추가 수집·발송을 중단하고 Google 토큰 철회를 시도한다. 기존 저장 메일 삭제는 운영팀 요청으로 별도 처리한다. 이 설명을 데이터 삭제 완료 증빙으로 사용하지 않는다.

## 영상에 실제로 담아야 할 흐름
1. 전용 테스트 브랜드 로그인 및 연결 전 데이터 처리 안내.
2. Google 동의 화면의 앱명과 요청 범위 전체. 다른 고객 메일·비밀번호·토큰 노출 금지.
3. 연결된 계정 주소 표시.
4. 자기 주소로 승인 발송, 실제 Gmail 수신, 콘솔 동기화.
5. 콘솔 회신 작성·승인, 실제 Gmail 답장 도착.
6. 다른 브랜드에서 해당 계정/메일 접근 불가.
7. 전용 테스트 계정 연결 해제 및 재조회.

2026-09-30 기존 GLOWLAB 연결의 실제 수신·승인 답장 왕복은 확인했다. 신규 동의·별도 브랜드 Google 계정·연결 해제 영상은 아직 촬영되지 않았다. 기존 업무용 연결을 증빙 촬영 목적으로 임의 해제하지 않는다.

## 제출 전 외부 확인
- Google Cloud 조직 본인 인증: 2026-09-30 재요구됨, 사용자 수행 필요.
- Branding 앱명/홈페이지/지원 메일 및 도메인 소유권 확인.
- Verification Center에서 실제 요구 항목/보안 평가 범위 확인.
- 서버에서 제한 범위 데이터를 취급하므로 보안 평가 적용 여부 확인 및 필요시 공식 평가 완료.
- 심사 영상 URL과 검증 담당자 정보 제출. 준비만으로 게시/심사 승인을 표시하지 않는다.

공식 근거: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
