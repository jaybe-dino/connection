# 오픈 전 할 일 — 클릭 단위 상세 가이드

순서대로 하면 된다. **① Railway → ② Anthropic 키 → ③ Vercel 4개 → ④ 접속 연결 → ⑤ 확인.**
소요 시간 합계 약 40분. 버튼 이름은 UI 업데이트로 조금 다를 수 있지만 흐름은 같다.

---

## ① Railway — API 서버 + DB (약 15분)

### 1-1. 프로젝트 만들기
1. https://railway.app 접속 → **Login** → **Login with GitHub** → 깃허브 계정으로 허용
2. 대시보드에서 **New Project** → **Deploy from GitHub repo**
3. 목록에 `jaybe-dino/connection`이 없으면 → **Configure GitHub App** →
   깃허브 화면에서 `jaybe-dino` 선택 → Repository access에서 `connection` 체크 → **Save**
4. `jaybe-dino/connection` 클릭 → **Deploy Now** (일단 실패해도 괜찮다 — 아래 설정 후 다시 빌드됨)

### 1-2. 서비스 설정 (중요)
1. 생성된 카드(서비스) 클릭 → **Settings** 탭
2. **Source** 섹션:
   - **Root Directory**: 비어있거나 `services/api`로 돼 있으면 → `/` 로 변경
   - **Branch**: `claude/dev-progress-prep-6n810t` 로 변경 (main에는 코드가 없다!)
3. Build 설정은 건드릴 필요 없음 — 리포 루트의 `railway.json`이
   Dockerfile(`Dockerfile.api`)과 헬스체크(`/health`)를 자동 지정한다

### 1-3. PostgreSQL 추가
1. 프로젝트 캔버스(카드들 보이는 화면)에서 **+ New** 또는 우클릭 → **Database** → **Add PostgreSQL**
2. 30초쯤 기다리면 Postgres 카드가 생긴다 — 끝. (계정·비번 만들 필요 없음)

### 1-4. 환경변수 5개
API 서비스 카드 클릭 → **Variables** 탭 → **New Variable**:

| 이름 | 값 | 방법 |
|---|---|---|
| `DATABASE_URL` | Postgres 참조 | 값 입력창 대신 **Add Reference** 버튼 → `Postgres.DATABASE_URL` 선택 |
| `ANTHROPIC_API_KEY` | `sk-ant-…` | ②에서 발급한 키 붙여넣기 (나중에 넣어도 됨) |
| `ADMIN_KEY` | 아무 비밀 문자열 | 예: `dino-0829-jaybe-secret` 같은 것. **메모해 둘 것** — 어드민 접속에 쓴다 |
| `RUNNER_ENABLED` | `1` | 에이전트 러너 상시 가동 |
| `SENDGRID_API_KEY` | (선택) | 실메일 원할 때만. 없으면 드라이런으로 돈다 |

변수를 저장하면 자동으로 재배포가 시작된다.

### 1-5. 도메인 만들기 + 확인
1. **Settings → Networking → Public Networking** → **Generate Domain**
   (포트를 물어보면 `8000`)
2. `https://xxxx.up.railway.app` 주소가 생긴다 — **복사해 둘 것** (Vercel 연결에 쓴다)
3. 브라우저로 `https://xxxx.up.railway.app/health` 열기:
   - `{"ok":true,"ai":true}` → 완벽
   - `"ai":false` → ANTHROPIC_API_KEY가 없거나 잘못됨 (서비스는 정상, 번역만 폴백)
4. `https://xxxx.up.railway.app/runner/status` 열기 → `"enabled":true` 면 러너 가동 중

### 막히면
- **빌드 실패**: Settings → Root Directory가 `/` 인지, Branch가 맞는지 확인
- **Healthcheck 실패 반복**: Variables의 DATABASE_URL이 Reference로 연결됐는지 확인
- **로그 보기**: 서비스 카드 → **Deployments** 탭 → 최신 항목 클릭 → **View Logs**

---

## ② Anthropic API 키 (약 5분)

1. https://console.anthropic.com 접속 → 가입 또는 로그인
2. 좌측 하단 톱니(Settings) → **Billing** → 카드 등록 + 크레딧 충전 ($5면 시작 충분.
   번역 1건에 1원 미만 수준이라 오래 간다)
3. **API Keys** 메뉴 → **Create Key** → 이름 `connection-api` → **Copy**
   (키는 이 화면에서 한 번만 보인다 — 바로 복사)
4. Railway → API 서비스 → Variables → `ANTHROPIC_API_KEY`에 붙여넣기 → 자동 재배포
5. `/health` 다시 열어 `"ai":true` 확인

---

## ③ Vercel — 앱 4개 (각 5분, 같은 작업 4번 반복)

vercel.com 로그인 → **Add New… → Project** → `jaybe-dino/connection` **Import**.
같은 리포를 4번 Import 하는 게 맞다 — 프로젝트마다 Root Directory만 다르게.

**공통 절차 (프로젝트마다):**
1. **Project Name**: 아래 표의 이름
2. **Framework Preset**: `Vite` 선택
3. **Root Directory**: **Edit** 클릭 → 아래 표의 폴더 선택
4. (admin만) **Environment Variables** 펼치기 → Key `VITE_API_URL`, Value에 Railway 주소
5. **Deploy** 클릭
6. 배포 후 **Settings → Git → Production Branch** → `claude/dev-progress-prep-6n810t` 입력
   → 저장 → **Deployments** 탭에서 최신 배포 ⋯ 메뉴 → **Redeploy**
   (기본이 main으로 잡히는데 main에는 코드가 없어서 이 단계가 필수)

| # | Project Name | Root Directory | 환경변수 |
|---|---|---|---|
| 1 | `connection-creator` | `apps/creator-app` | 없음 |
| 2 | `connection-console` | `apps/console` | 없음 |
| 3 | `connection-signup` | `apps/signup` | 없음 |
| 4 | `connection-admin` | `apps/admin` | `VITE_API_URL` = Railway 주소 |

---

## ④ 접속 연결 (앱 ↔ API, 2분)

Vercel이 준 주소를 아래처럼 **한 번씩** 열면 API 주소가 브라우저에 저장된다:

- 크리에이터: `https://connection-creator.vercel.app/?api=https://xxxx.up.railway.app`
- 콘솔: `https://connection-console.vercel.app/?api=https://xxxx.up.railway.app`
- 가입: `https://connection-signup.vercel.app/?api=https://xxxx.up.railway.app`
- 어드민: `https://connection-admin.vercel.app/?key=ADMIN_KEY값` ← ①-4에서 정한 그 문자열

이후엔 `?api=` 없이 그냥 주소만 열어도 연결돼 있다.
(단, 브라우저·기기가 바뀌면 다시 한 번 붙여서 열기)

---

## ⑤ 동작 확인 (5분)

1. **콘솔** 열기 → 승인함에 게이트 목록이 뜨는지 → 하나 **승인**
2. **크리에이터 앱** 열기 → 셀 공지·알림에 반영됐는지, 🔔 눌러 알림 확인
3. **가입 위저드**에서 브랜드 신청 완료 → **어드민** Applications에 뜨는지 → **승인**
4. 콘솔 → 캠페인 → 새 캠페인 **등록·게시** → 크리에이터 앱 캠페인 목록에 뜨는지
5. `…railway.app/runner/status` → `ticks`가 늘고 있는지
6. 러너가 올린 **OUTBOUND 게이트**가 콘솔 승인함에 뜨면 → 승인 → status에서 발송 확인

여기까지 되면 **서비스가 실제로 돌아가는 상태**다.

---

## 나중에 해도 되는 것

| 항목 | 하는 법 | 언제 |
|---|---|---|
| 실메일 발송 | sendgrid.com 가입 → Settings → API Keys → Full Access 키 발급 → Railway `SENDGRID_API_KEY` + Sender Authentication(발신 도메인 인증) | 아웃리치 시작할 때 |
| 수집 벤더 키 | SETUP_EXTERNAL.md 참고 (EnsembleData 등) | 실수집 시작할 때 |
| 커스텀 도메인 | 도메인 구매 → Vercel/Railway 각 Settings → Domains → 안내되는 DNS 등록 | 브랜딩 필요할 때 |
| SNS OAuth | 틱톡/메타 개발자 앱 등록 (심사 1~2주) | 크리에이터 실가입 전 |
| 실인증·2FA | ADMIN_PLAN.md의 설계대로 개발 (개발 요청 주시면 진행) | 정식 오픈 전 필수 |
| 데모 시드 제거 | 개발 요청 주시면 진행 | 정식 오픈 전 |
