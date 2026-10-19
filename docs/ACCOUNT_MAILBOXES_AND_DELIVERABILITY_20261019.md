# 계정별 메일함과 발송 품질 개선

## 어디서 사용하나
https://admin.theprlist.net/mail
왼쪽 `계정별 메일함` 또는 공용 모집의 `계정별 받은편지함·보낸편지함 열기`.

1. 발신 계정 카드 선택.
2. 받은편지함 / 보낸편지함 / 답장 초안 / 결과 확인 / 전체 기록 선택.
3. 제목·이메일 검색, 50건씩 페이지 이동.
4. 메일 선택 → 원문 → 크리에이터 기록·이 회신에 답장.
5. 기존 계정·Gmail 대화를 고정해 직접 작성 또는 Claude 초안 → 저장 → 별도 실제 발송 승인.
6. 최신 기록은 `이 계정 메일 가져오기`. 읽음과 후속 업무는 `이 계정의 회신·후속조치 관리`.

폴더는 실제 메일 건수, 계정 카드 회신/후속업무 숫자는 고유 이메일 수. 실인원·신청·배송·게시·매출과 구분한다. 계정 전환 시 선택한 원문을 초기화하며 다른 계정 메일을 섞지 않는다. 미분류 수신 대화는 원문을 보고 실제 크리에이터임을 확인한 뒤 등록한다.

범위는 기존 동기화된 모집 대화다. Gmail 전체 메일/스팸함/휴지통 복제나 Gmail 자체 읽음·삭제를 지원하는 기능으로 표시하지 않는다. Gmail 최근30일 수신 기록 및 기존 크리에이터의 단일 수신자 발신 대화만 제한된 페이지로 가져온다. 더 있으면 재동기화한다. OAuth 권한을 넓히지 않았다.

## 스팸 개선 적용
모집 메일의 기존 본문 수신거부 링크에 List-Unsubscribe와 List-Unsubscribe-Post 헤더를 추가했다. 이미 있는 UUID 토큰의 HTTPS POST 수신거부 경로를 사용한다. GET 미리보기는 동의 상태를 바꾸지 않는다. Date·Message-ID도 명시한다. 답장에는 모집용 수신거부 헤더를 임의로 삽입하지 않는다. 원래 발신 고정·반송/차단·수신거부·속도·잔여한도·불명확 발송 중지 유지.

Google 수신본에서 해당 헤더와 DKIM h= 서명 범위를 확인하기 전까지 RFC8058 전체 인수 검증이 끝났다고 하지 않는다. 헤더 개선은 받은편지함 도착 보장이 아니다.

계정마다 `발송 인증 점검`으로 공개 DNS SPF/DMARC 및 google DKIM 선택자를 조회한다. 조회 실패·미조회·중복·존재를 구분하며 actualMessageAuthentication=unverified를 유지한다. DNS 변경이나 실제 발송을 하지 않는다. Google DNS HTTPS를 사용하며 사용자 본문/자격증명을 전달하지 않는다.

## 2026-10-19 DNS 관측과 외부 작업
- dncr.co.kr: Google MX는 있음. TXT에는 google-site-verification만 확인. SPF/DMARC와 google DKIM 선택자는 조회되지 않음. 운영 확대 전 후이즈 DNS와 기존 Workspace 관리자에서 확인 필요.
- dinostudio.kr: SPF는 Google+Stibee, DMARC p=none. google DKIM 선택자는 조회되지 않음. 다른 선택자/실제 서명 확인 전 DKIM 미설정으로 단정하지 않음.
- 나머지 조회한9개 모집 도메인은 SPF/DMARC 및 google 선택자가 조회됨. 실제 서명/정렬/평판 PASS를 뜻하지 않음.
- dncr 권고 초안: 다른 발송 서비스 사용 여부 확인 후 root TXT `v=spf1 include:_spf.google.com ~all`, _dmarc TXT `v=DMARC1; p=none;`. DKIM 값은 기존 Workspace 설정에서 정확한 선택자/공개키를 확인하고 활성화 상태를 대조해야 한다. 기존 SPF가 있다면 추가 중복 생성하지 말고 병합 검토.
- screenshot의 chief@dinostudio.kr 수신함 신고 이력은 해당 수신함에서 정상 메일이면 스팸 해제. 내부 메일을 테스트 목적으로 신고하지 않음. 외부 수신함까지 해결됐다는 증거가 아님.
- Postmaster Tools의 평판/신고율과 반송/거부 데이터로 증량을 결정. 0.1% 미만 유지 권고·0.3% 도달 방지. 낮은 발송량에서 데이터가 없을 수 있음. 전계정 모두 같은 템플릿을 일시에 늘리지 않고 동의·상품/국가 적합 대상부터 일정하게 운영.

출처: https://support.google.com/mail/answer/81126?hl=ko

## 검수/롤백
API·청구389개, UI96개, 관리자 빌드 통과. 계정/조직 격리, 폴더/검색, 비밀 토큰 미노출, DNS 조회 실패 구분, 실제 전송 모사에서 헤더와 GET/POST 수신거부 동작 확인. 로컬 실제 UI에서 계정→받은 메일→원문→원래 계정 답장 작성 확인. 테스트 외부메일/실제 답장·결제 없음.
`account-mailbox-before-20261019` 태그가 이전 코드. 새 DB 마이그레이션 없음. 운영 Gmail 기록·기존 CRM 데이터는 삭제/복원하지 않음.

미완료: DNS 관리자에서 실제 인증 보완, 문제 메일 원본(Authentication-Results와 DKIM-Signature), 실제 수신함 도착 검수, Claude 충전 후 실생성. DNS·실제 받은편지함 도착이 개선됐다고 표시하지 않음.

추가: 개별 수신 메일에서 `이 메일의 인증 결과 보기`는 같은 계정·실제 받은 Gmail ID의 metadata만 읽는다. Gmail의 mx.google.com Authentication-Results에 보고된 SPF/DKIM/DMARC 및 DKIM 도메인/선택자/서명 헤더 이름만 반환하며 토큰·본문·DKIM 서명값은 반환하지 않는다. 발송·Gmail 상태 변경 없음. 전체 API389개 이후 이 기능 포함 CRM24개·UI96개 추가 통과.

## 운영 확인 및 DNS 적용 결과 (이전 미완료 상태 대체)
- 운영 관리자 로그인 후 9개 계정 카드와 실제 수신 메일 조회 확인.
- chief@dinostudio.kr → cresenddino@dncr.co.kr, 10/19 22:31 테스트 회신의 Gmail metadata에서 SPF/DKIM/DMARC 모두 pass. DKIM 도메인은 dinostudio-kr.20251104.gappssmtp.com, 선택자20251104. 이 회신의 스팸을 인증 실패로 단정할 수 없으며 화면의 수신함 신고 이력을 우선 확인.
- 사용자 지시에 따라 Slack 경영지원의 기존 후이즈 계정을 찾아 로그인. 실제 dncr 소유 확인. 비밀번호는 문서에 저장하지 않음.
- 사용자 최종 약관 동의 승인 후 dncr.co.kr SPF와 _dmarc TXT 두 건 실제 등록 완료. ns1.whoisdomain.kr 권한 DNS에서 Google SPF 및 p=none DMARC 조회, 기존 google-site-verification과5개 Google MX 유지 확인. 원복은 이 두 신규 TXT만 제거하는 방식이며 기존 레코드/네임서버 변경 없음.
- dncr의 도메인 DKIM은 별도 기존 Workspace 관리자 로그인 필요. 계정 복구/비밀번호 변경/새 DKIM 키 생성은 실행하지 않았음.
- 실제 메일/답장/로그인메일 추가 발송 없음. Claude 결제 보류 유지.

## dncr DKIM 완료 (최신 상태)
사용자 관리자 로그인 및 새 키 생성·DNS 등록·인증 시작 승인 후 dncr의 2048비트 RSA 키(선택자 google) 생성. 후이즈에 google._domainkey TXT 신규 한 건 등록. ns1.whoisdomain.kr의 공개키가 Google 생성값과 바이트 일치함을 확인. Google 관리자 상태가 `DKIM을 사용하여 이메일 인증 중입니다.`로 변경되고 인증 중지 버튼 표시 확인. 기존 Google 인증 TXT, SPF, DMARC, MX 보존. 실제 발송·결제 없음. 신규 발신 메일의 실제 수신 인증 결과/스팸 도착은 아직 검수하지 않았음. 원복이 필요하면 Google에서 해당 도메인 인증 중지 후 새로 추가한 DKIM TXT만 제거하며 다른 도메인/기존 DNS는 유지.

## 메일함 UX 재구성 · 2026-10-19

계정 카드와 긴 CRM 양식이 앞을 막던 화면을 계정·폴더 / 메일 목록 / 원문·인라인 답장 구조로 변경했다. 계정별 받은편지함·읽지 않음·보낸편지함·답장 초안·결과 확인 폴더를 제공한다. 기존 수신 대화에서 바로 직접 작성하거나 Claude 초안을 적용하고, 저장 후 별도로 1통 발송을 승인한다. 불명확한 초안 저장은 동일 request_id로 조회하며 해결 전 내부 이동을 막는다. 실제 발송 결과 불명은 자동 재발송하지 않는다. 원래 계정·대화 고정 및 서버 발송 보호장치를 그대로 사용한다.

메일 열기는 기존 운영팀 공통 읽음 커서를 갱신한다. 계정과 이메일별 마지막 확인 메시지까지 읽음 처리하며 Gmail 읽음은 바꾸지 않는다. 등록되지 않은 수신자도 읽음 처리는 가능하지만 크리에이터 등록·답장은 여전히 담당자 분류 확인이 필요하다. CRM 기록은 별도 버튼으로 열고, 일반 메일 읽기·답장은 현재 화면에서 끝낸다. 기술 설명·인증 점검은 메일 설정에 모았다. 모바일에서는 목록→본문→목록으로 이동하며 폴더는 접는다.

공개 DNS 재점검: 연결된 9개 발송 도메인 모두 SPF·DMARC·google DKIM TXT가 각 1개씩 존재. 추가 cresend.co.kr도 3종 존재하며 Google 관리자에서 DKIM 활성 상태 확인. dncr.co.kr은 이번 수리 후 Google DKIM 활성 상태 확인. dinostudio.kr은 SPF·DMARC 존재, 자체 google DKIM TXT 없음 및 Google 관리자 인증 미시작 상태 확인. 다른 8개 발송 도메인은 신규 Workspace 관리자 로그인 전이므로 DNS 존재만 확인했으며 실제 Google 서명 활성 및 새 수신 메일 인증 PASS로 대신 표현하지 않는다.

스팸으로 표시됐던 기존 chief 메일은 실제 수신 헤더 SPF·DKIM·DMARC PASS였다. 따라서 해당 메일의 스팸 원인을 인증 실패로 확정하지 않는다. 사용자가 받은편지함에서 신고했다는 Gmail 안내와 발신자 평판·수신자 반응을 함께 확인해야 한다. 인증만으로 스팸 미분류를 보장하지 않는다. 실제 신규 메일 발송·유료 AI 호출 없이 로컬 가상 데이터에서 답장 초안 저장·별도 승인·취소 검수.

### 후속 확인·완료

사용자 admin@dinocommerce.co.kr 로그인 후 8개 신규 Workspace 도메인(cresend.me, creve.co.kr, dinocommerce.co.kr, scenesmarket.kr, shortsc.co.kr, shortscommerce.co.kr, shortsshop.co.kr, shortsshop.kr) 전부 Google 관리자에서 `DKIM을 사용하여 이메일 인증 중입니다`를 확인했다. dncr.co.kr 및 cresend.co.kr도 별도 기존 Workspace에서 활성 확인. 신규 키 재생성 없이 기존 키 유지.

사용자 추가 승인 후 dinostudio.kr Google DKIM 2048비트/선택자 google 키를 신규 생성했다. 닷홈 기존 도메인 DNS에 TXT 한 건만 추가했고 Google 인증 시작 후 활성 상태를 확인했다. 권한 DNS(ns1.dothome.co.kr) 공개키 410자 전체가 발급키와 정확히 일치했다. 기존 Google MX(ASPMX/ALT 계열 및 smtp.google.com)·SPF의 Google/Stibee·DMARC·stb._domainkey CNAME·웹사이트 레코드 보존. 이 변경의 롤백은 Google DKIM 중지 후 새 google._domainkey TXT만 제거하는 것으로, 기존 TXT/MX/CNAME에는 손대지 않는다. 실제 새 메일 수신 헤더 DKIM PASS는 이번 작업에서 발송하지 않았으므로 미검수.

400px 모바일 시각 검수에서 상단 어드민 메뉴를 가로 스크롤 한 줄로 줄이고 메일함이 남은 높이를 사용하도록 보완했다. 목록→본문·목록 복귀 확인, 로컬 가상 메일 직접 작성→초안 저장→승인 대기→취소 확인. 실제 메일·유료 Claude 호출 없음.

최종 운영 배포: admin dpl_8Qv3jYT9C1qxyQgkmbmhjUe5ZGUy, index-QrY9CQPc.js/index-DrwV7Ugg.css 운영 바이트 일치 확인. API eb7cab841db0 이후 모바일·기록 보완 커밋 b3fcd5e(서버 로직 동일). 서버/청구 391개, UI 96개 및 어드민 타입검사·빌드 통과. 롤백 태그 mail-ux-before-20261019. 운영 로그인 화면에서 계정별 목록·본문·읽음 처리 확인, 미분류 내부 테스트 메일은 크리에이터로 오분류하지 않음.
