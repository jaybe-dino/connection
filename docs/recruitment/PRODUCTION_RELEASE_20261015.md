# 공용 모집 운영 배포 — 2026-10-15

## 반영 결과

- 소스: `1da5d36`, `codex/operations-review-20261012`.
- API Railway 배포: `d889ca26-8958-440e-9db7-09a142e6d243`, SUCCESS. `/health` DB 정상, startup_error 없음. CLI 업로드 배포여서 health의 commit은 공란이며 배포 ID로 식별한다.
- 관리자: https://admin.theprlist.net/recruitment — 운영 배포 `dpl_6sNVtwD11o8mNk5NG4pF6tGrc6fu`, READY. 실제 운영 HTML에서 새 JS `index-s98kZgfH.js` 확인.
- 브랜드 콘솔: https://console.theprlist.net — 새 정적 파일 `engine-live.js?v=1a1d7fc7` 확인.
- 운영 DB: 042까지 40개 마이그레이션 적용. 기존 브랜드 7개, 기존 배치 cancelled 1 / approved 1 유지. 모집 매핑 0개.
- 새 모집 API 비인증 요청 401 확인. 인증 보호를 해제하지 않았다.

## 검증

- API·청구 298 passed, UI 53 passed, 전체 웹앱 빌드 통과.
- 로컬 실제 브라우저: 매핑 저장·재조회, 중복 제외, 개인화 미리보기, 초안 저장·취소 검증.
- 운영 DB 볼륨 백업 생성: 2026-10-15 16:27 KST, 화면 표시 1.12GB.
- 별도 논리 백업을 `theprlist_restorecheck_20261015`에 실제 복원: 33개 마이그레이션, 브랜드 7개, 배치 2개 확인.
- 복원본에서 036~042 변경 적용 COMMIT, 이후 40개 마이그레이션·브랜드 7개·배치 2개 유지 확인.

## 남은 사용자 검수

운영 브라우저의 관리자 세션이 만료되어 로그인 후 저장·조회 검수는 미완료다. 로그인 후 ‘디노 공용 모집 공간 생성’을 누르고, 실제 고객 브랜드의 제품 등록과 Gmail OAuth 연결을 마친다. 공용 공간 생성과 제품 매핑은 자동으로 만들어 두지 않았다. 현재 운영 DB의 매핑은 0개다. 제품·계정이 없으면 실제 발송 준비 완료로 판단하지 않는다.

## 발송 경계

이번 배포에서 실제 메일 발송·연락처 반입·승인 배치 재개는 하지 않았다. 기존 환경의 `GMAIL_SEND_RESUME_ENABLED=0`, `RUNNER_ENABLED=0`을 변경하지 않았다. 초기 200건은 애플리케이션 상한이며 제공자 허용량이나 하루 발송 보장량이 아니다.

## 복귀 지점

- API 이전 배포: `8644fcdc-7118-4956-b2a8-8dff08177f4c`.
- 관리자 이전 배포: `connection-admin-je2zhm9t3-dino5.vercel.app`.
- 브랜드 콘솔 이전 배포: `connection-console-lb9x4srvi-dino5.vercel.app`.
- 관리자 복귀: `vercel promote https://connection-admin-je2zhm9t3-dino5.vercel.app --yes --scope dino5`.
- 콘솔 복귀: `vercel promote https://connection-console-lb9x4srvi-dino5.vercel.app --yes --scope dino5`.
- API는 Railway의 해당 이전 배포에서 재배포한다. 발송 재개는 별도다.
- 코드 복귀만으로 새 DB 컬럼을 삭제하지 않는다. 백업 복원은 백업 이후 입력·청구·동의 기록을 보존·대사한 후 판단한다. 운영 DB에 검증 DB를 덮어쓰지 않는다.

비밀 환경 스냅샷과 논리 백업은 저장소 밖 비공개 로컬 디렉터리에 보관한다. 문서에 자격증명은 포함하지 않는다.
