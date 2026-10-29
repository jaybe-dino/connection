# v8.1 운영 이식: 통합 기준 (2026-10-30)

## 운영 현재 상태
GPT가 Vercel API로 확인한 값입니다. 세 앱 모두 CLI 수동 배포라 Git SHA가 없습니다(`source=cli`, `gitSource=null`). 아래 '대응 소스'는 공개 파일을 대조해 찾은 것입니다.

| 도메인 | 배포 ID | 대응 소스 | 대조 방법 |
|---|---|---|---|
| app.theprlist.net | dpl_CsoV6sKzV2dZFrq7nAiiyy3jwtrU | `6d95bfb` (= 통합 HEAD의 apps/creator-app) | index.html과 slack/* 9개 파일이 `vite build` 결과와 **바이트 동일** |
| console.theprlist.net | dpl_EFUpVMw47soZ4uExJmz1kp7paP7g | `4d424d7` (10/17, claude/theprlist-service) | engine-live.js git blob이 같음(7f482717…), index.html도 같음 |
| admin.theprlist.net | dpl_8Qv3jYT9C1qxyQgkmbmhjUe5ZGUy | `b0f5ade` (10/19, codex/tiktok-review)의 apps/admin | CSS 해시가 같음(index-DrwV7Ugg.css). JS는 한글 UI 문자열이 전부 같고 압축 식별자만 다름 → 같은 소스를 다른 빌드 환경에서 만든 것으로 봄 |
| api.theprlist.net | Railway production | `52e6997` (10/25) | GitHub deployment 기록(production success). 도메인 배포와는 따로 기록됨 |

Vercel의 Git productionBranch는 `claude/dev-progress-prep-6n810t`(`e1eeeed`)지만, 현재 배포 원본이 아닙니다. 이 브랜치에 push해도 운영 세 앱의 소스가 되지 않습니다.

## 통합 기준
- 작업 브랜치: `claude/epic-cerf-bpwx7m`
  - `5851ea8`: `codex/admin-brand-accounts-review-20261021`(6d95bfb) merge
  - `5bd3be4`: `codex/theprlist-key-rotation-20261025`(52e6997) merge
  - 두 merge 모두 충돌이 없었습니다. 위 네 운영 원본을 모두 포함합니다.
- 운영보다 앞서 있는 커밋(이미 리뷰된 브랜치 작업이고, 이번 배포에 함께 실립니다)
  - console(4d424d7 이후): 10dd23a 채널을 선택 브랜드로 한정, 87aa05c/bad1f9a/91bed28 대화 언어 설정, f7ae131 아웃리치 근거, b4d0f49 slack-v3 실데이터 보강.
  - admin(b0f5ade 이후): 8240b9d/b0832a9 관리자 브랜드 등록·로그인 계정 관리, 82d7f86 오류 문구, bb5f0bc.
  - API는 이미 52e6997로, 위 admin 기능의 서버 경로(`/admin/brands*`)를 포함합니다.

## 배포 원칙
- productionBranch push와 Git 연동 배포는 하지 않습니다.
- 검증된 커밋에서 각 앱을 빌드해, 기존과 같은 Vercel 프로젝트(dino5 팀)에 CLI production으로 배포합니다. 이번 배포는 GPT 쪽 인증으로 수행합니다.
- API 변경이 있으면 additive migration만 씁니다. Railway 배포는 현재 원본(52e6997)에서 이어 갑니다.
- 빌드 명령은 루트에서 `pnpm install --frozen-lockfile` 후 실행합니다(대상별 디렉터리는 `RELEASE_V8.md`에 적습니다).
  - creator: `pnpm --filter @connection/creator-app build`
  - console: `pnpm --filter @connection/console build`
  - admin: `VITE_API_URL=https://api.theprlist.net pnpm --filter @connection/admin build`
