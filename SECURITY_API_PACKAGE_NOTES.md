# theprlist 운영 API — 보안 키 교체용 재현 패키지 (NOTES)

branch: `codex/theprlist-key-rotation-20261025` · base: `544c893f11eb5287ce26b7e1a7ecb1970681803a`
작성: 2026-10-25 · 목적: Railway에 CLI 업로드 이미지로 떠 있는 현재 운영 API를
**git commit 으로 추적되는 동일 소스 + 동일 패키지 버전**으로 재현해, Root가
무중단 DB 자격증명(키) 교체 배포를 건강 점검 포함해 한 번에 할 수 있게 한다.

이 작업은 런타임 기능 구현이 아니다. API/core 코드·인증·Gmail/OAuth·NICEPAY/
TikTok·데이터 암호화(TOKEN_ENC_KEY)는 **수정하지 않았다**. 운영 접근·키 발급/
폐기·서비스 배포·메일/결제/모델 API 호출·비밀값 출력은 하지 않았다.

## 원본 일치
- 첨부 `prlist-deployed-api-source-20261025.zip`(실제 운영 컨테이너에서 읽은
  API/core Python 56 + pyproject 2 = **58파일** + manifest)을 base 544c893 워크트리에
  정확히 복원했다.
- **58/58 파일 SHA256 == security-runtime-manifest.json** (복원 직후와 최종 재검증 모두 일치).
- 544c893 대비 차이는 `services/api/api/routes_ops.py` **1개**뿐(+37줄, 사전신청
  라우트 — 운영 이미지에 포함된 실제 코드). 나머지 57개는 544c893과 해시 동일.
  → 운영 소스 = 544c893 + routes_ops 사전신청 라우트. (사용자 대조 "55/56 일치"와 합치)

## 추가한 재현 설정(최소)
- `Dockerfile.security-api` — 공개 공식 `python:3.11.17-slim` 기반.
  · `requirements-security-api.build.txt`(pip/setuptools/wheel 고정),
    `requirements-security-api.txt`(서드파티 37개, manifest의 정확한 버전) 설치.
  · 프로젝트 로컬 패키지 `connection-core`·`connection-harvest`·`connection-api`를
    **소스에서 `--no-deps` 설치**(새 의존성/기능 추가 없음).
  · `/health` 포함 HEALTHCHECK(표준 라이브러리). 시작 명령은 현재 운영과 동일:
    `uvicorn api.main:app --app-dir services/api --host 0.0.0.0 --port ${PORT:-8000}`
    (PORT 존중, 같은 API만).
- `railway.json` — **이 브랜치 전용** 배포 설정만 고정: Dockerfile.security-api,
  healthcheckPath=`/health`, healthcheckTimeout=`300`, overlapSeconds=`30`,
  drainingSeconds=`30`. (다른 서비스/메인브랜치 설정은 건드리지 않음 — 이 브랜치에
  railway.json 신규 추가라 다른 배포에 영향 없음.)

## 마이그레이션·DB 전제(중요)
- 배포 이미지(및 이 재현 패키지)는 `db/migrations`를 **담지 않는다**(zip/manifest
  scope = API/core 소스만). `run_migrations`는 `<repo>/db/migrations`를 찾으며,
  이미지에 없으면 **아무것도 적용하지 않는다**. 운영 DB는 이미 마이그레이션된
  상태이므로 키 교체(동일 기존 DB, 자격증명만 교체) 재배포에서 run_migrations는
  no-op이고 앱은 정상 기동한다. 새 빈 DB에 스키마를 만드는 용도가 아니다.

## 검증 결과(로컬·임시 — 외부 송신/결제/AI/runner 비활성, 외부 호출 없음)
- Docker build: 커밋 `Dockerfile.security-api`는 정상 인덱스 환경에서 빌드됨.
  (이 Cloud 샌드박스에서는 빌드 컨테이너가 에이전트 프록시 CA를 신뢰하도록
  **검증 전용 비커밋 오버레이**에 CA만 주입해 빌드 성공 — 3.11.17 + 고정 37버전 +
  로컬 3패키지 소스 설치. 커밋 Dockerfile에는 CA/프록시 흔적 없음.)
- 임시 PostgreSQL(비운영, throwaway) + non-superuser 역할 2종(prlist_owner,
  prlist_app; 둘 다 NOSUPERUSER, prlist_app은 prlist_owner 멤버 INHERIT):
  · 기존 54개 마이그레이션을 owner 자격으로 적용해 **운영 DB 상태 모사**(86 테이블).
  · 재현 컨테이너를 **non-superuser prlist_app** 자격으로 기동 → `GET /health` **200**
    (`db:ok`, `startup_error:null`, `ai:false`), Docker HEALTHCHECK **healthy**.
  · 새 DB 연결 **SELECT 1 = 1**(app 역할).
  · app 역할이 **owner 소유 객체**(brands 등) 접근 — has_table_privilege SELECT=true,
    조회 성공(상속 권한 확인). → 키 교체 후 새 non-superuser 로그인 호환성 OK.
- 비밀값/운영 env/고객 데이터는 이미지·커밋·로그 어디에도 넣지 않았다.

## Root 배포 경로(정확히 1커밋)
1. Railway의 해당 API 서비스를 이 브랜치 `codex/theprlist-key-rotation-20261025`의
   커밋에 연결(소스 배포). `railway.json`이 Dockerfile.security-api·/health·타임아웃·
   overlap/draining을 고정한다.
2. DB 자격증명(새 non-superuser 로그인)과 기타 비밀값은 **Root가 운영에서 주입**
   (이미지/커밋에 없음). 새 로그인은 기존 owner 객체 권한을 상속해야 한다
   (검증에서 prlist_app 패턴으로 확인).
3. 무중단: overlapSeconds=30·drainingSeconds=30·healthcheckPath=/health로
   새 컨테이너가 health 통과 후 교체.

## 한계/남은 사항
- 샌드박스 Docker 빌드는 프록시 CA 주입(비커밋)이 필요했다 — Root의 정상 인덱스
  환경에서는 커밋 Dockerfile 그대로 빌드된다.
- 임시 DB는 비운영 모사이며 실제 운영 DB/자격증명/키는 Root가 담당한다.
- manifest 버전 중 일부(fastapi 0.159.1, pydantic 2.14.1, certifi 2026.10.19 등)는
  연결된 인덱스에서 resolve됨을 확인했다. Root 환경의 인덱스도 동일해야 한다.
