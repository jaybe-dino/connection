# 배포 가이드 — Vercel(프론트 3) + Railway(API + Postgres)

설정 파일은 리포에 준비돼 있다: `Dockerfile.api` · `railway.json` · `apps/*/vercel.json`.
아래는 클릭 단위 절차. 순서대로 하면 된다 (Railway 먼저 — 프론트가 API 주소를 필요로 함).

## 1. Railway — API 서버 + DB (약 10분)

1. railway.app → GitHub로 로그인 → `jaybe-dino/connection` 리포 연결
2. 디렉터리 선택 화면에서는 **`services/api` 하나만** 체크
   (`services/core`는 라이브러리 — 배포 대상 아님. `apps/*`는 Vercel로)
3. 생성된 서비스 → **Settings**:
   - **Root Directory**: `/` (리포 루트로 변경 — 중요! core·마이그레이션이 루트에 있음)
   - Build는 루트의 `railway.json`이 자동 적용 (Dockerfile.api · 헬스체크 /health)
4. 같은 프로젝트에 **+ New → Database → PostgreSQL** 추가
5. API 서비스 → **Variables**:
   - `DATABASE_URL` = Postgres 서비스의 `DATABASE_URL` 참조 (Add Reference로 연결)
   - `ANTHROPIC_API_KEY` = (있으면 — 번역·아리 실동작. 없어도 서버는 뜸)
6. Deploy → 성공 후 **Settings → Networking → Generate Domain**
   → `https://xxx.up.railway.app` 주소 복사. `/health` 열어서 `{"ok":true}` 확인
   (첫 기동 때 마이그레이션 + GLOWLAB 데모 시드가 자동 적용된다)

## 2. Vercel — 앱 3개 (각 5분)

같은 리포를 **3번 Import** (vercel.com → Add New → Project):

| 프로젝트 이름 | Root Directory | Preset | 환경변수 | 용도 |
|---|---|---|---|---|
| **connection-creator** | `apps/creator-mobile` | **Other** (아래 수동 설정) | `EXPO_PUBLIC_API_URL` | 크리에이터 앱 (Expo 웹 — 앱과 단일 코드) |
| connection-console | `apps/console` | Vite | `VITE_API_URL` | 브랜드 콘솔 |
| connection-signup | `apps/signup` | Vite | `VITE_API_URL` | 브랜드 가입 위저드 |

**connection-creator (Expo)만 Build 설정 수동 입력**:
- Framework Preset: `Other`
- Build Command: `npx expo export -p web`
- Output Directory: `dist`
- Install Command: `npm install`

Vite 두 개는 기본값 그대로 (pnpm 워크스페이스 자동 인식).
환경변수 값은 셋 다 1-6에서 복사한 Railway 주소 (예: `https://xxx.up.railway.app`, 끝 `/` 없이).
`apps/creator-app`(웹 전용 구버전)은 배포하지 않는다 — creator-mobile이 정본.

미설정 시에도 앱은 뜨지만 "오프라인 데모"(목데이터)로 돈다.
`VITE_API_URL`을 나중에 넣었으면 **Redeploy** 해야 반영된다 (빌드타임 변수).

## 3. 확인

1. 콘솔 배포 주소 → 승인함에 "서버 연결됨" 문구 + 게이트 4건
2. 게이트 하나 승인 → 정산·원장에서 체인 무결성 ✓ 와 GATE_EXECUTED 확인
3. 크리에이터 앱 → 셀 공지 채널에 승인으로 게시된 공지 확인

## 4. 커스텀 도메인 (선택)

도메인 구매 후 각 플랫폼 Settings → Domains에서 추가하고 안내되는 DNS 레코드 등록:
`connection.app` → creator / `console.connection.app` → console /
`brands.connection.app` → signup / `api.connection.app` → Railway.
도메인 연결 후 Vercel의 `VITE_API_URL`을 `https://api.connection.app`로 바꾸고 Redeploy.

## 주의

- 지금 배포되는 데이터는 **GLOWLAB 데모 시드**다. 실서비스 전에 시드 제거·인증 도입 필요.
- API CORS가 전체 허용(`*`) 상태 — 도메인 확정 후 화이트리스트로 좁힐 것.
- 기본 브랜치: 현재 코드는 `claude/dev-progress-prep-6n810t` 브랜치에 있다.
  Vercel/Railway에서 Production Branch를 이 브랜치로 지정하거나, main에 머지 후 연결.
