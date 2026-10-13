# 신규 모집 메일 구축 준비 패키지

2026-10-13. 사용자 확인: 대상 이메일은 광고·협업 제안 수신 허가를 받은 연락처.

- `index.html`: 설계·자산·설정 순서·사용자 검토 화면. 합성 시연만 가능. 실발송 없음.
- `model.js`: 신규/기존 구분, UID·이메일 중복, 허가 범위, 회사 공통 제외, 예약, 한도, 승인 내용 해시·만료 검토.
- `ses-disabled-stack.json`: AWS 준비 템플릿. SES configuration set 발송 꺼짐. DNS 자동 변경·IAM 키·send worker 없음.
- `build_infra.py`: 템플릿 재생성. 네트워크 호출 없음.
- `preflight.py`: 기존 AWS 로그인으로 `sts get-caller-identity`, SES `get-account`, 지정 도메인의 `get-email-identity`만 읽기. CLI가 없으면 blocked 결과.

로컬 보기: `python3 -m http.server 8863 --bind 127.0.0.1 --directory tools/mail-launch`

검수: `node --test tests_operations/mail-launch.test.cjs`, `python3 -m unittest discover -s tests_operations -p test_mail_infra.py`

실제 배포 전: 기존 SES identity 중복·리전·요금제·DNS 설정 확인 → AWS 템플릿 검증/Change Set 확인 → 필요한 설정 적용. Retain 자원은 스택 삭제만으로 철거되지 않음. 새 권한·credentials는 별도 인수 경로 필요.

운영 설계는 `docs/mail-launch/OPERATING_SPEC.html` 참고. 서버 승인·worker·수신거부·피드백·회신 운영 연결은 아직 미구현이며 이 검토 모델이 production authorization을 제공하지 않음.
