# 커넥션 (Connection)

> 브랜드가 소유하는 글로벌 크리에이터 커뮤니티를, 에이전트가 운영한다.

K-뷰티 브랜드마다 전담 운영 에이전트 **아리(Ari)** 를 붙여 해외 크리에이터
모집 · 커뮤니티 · 캠페인 · 검수 · 정산을 대신 운영하는 서비스.
크리에이터는 계정 하나(**패스**)로 여러 브랜드 커뮤니티(**셀**)에 소속되고,
밖으로 나가는 모든 행동(발송·정산·개인정보·공개게시)은 **게이트**로 사람이 승인한다.

서비스가 성립하려면 앞단에 크리에이터를 대량 확보하는 **수집 엔진(母 DB)** 이
필요하다 — 목표는 국가·카테고리·제품별 50만~100만 계정.

## 핵심 개념

| 개념 | 한 줄 정의 |
|------|-----------|
| 패스(Pass) | 크리에이터 계정 1개 = N개 브랜드 멤버십. 재가입 없음. |
| 셀(Cell) | 브랜드가 소유하는 크리에이터 커뮤니티 방. 상한 없음 · 자동 번역 · 브랜드 동석. |
| 아리(Ari) | 브랜드별 운영 에이전트. 담당자 8종(발굴·수집)이 목표·KPI·실패조건을 가짐. |
| 게이트(Gate) | PII · PAYOUT · OUTBOUND · PUBLISH — 자율등급 무관하게 사람 승인. |
| 母 DB | 수집 엔진이 채우는 전 브랜드 공유 크리에이터 원장. 母 DB → 판정 → 초대 → 가입. |

## 저장소 구조

```
connection/
├── docs/
│   ├── handover/          # 기획 인계 패키지 원본 (HTML, 정본)
│   │   ├── 00_README_인계문서.html
│   │   ├── 01_프로토타입/            # 전 화면 클릭데모 — 화면 스펙의 정본
│   │   ├── 02_서비스기획/            # 기획안 v1.0 · 페이지맵
│   │   ├── 03_수집엔진/              # 설계 · 플레이북 · 기술스택 · 구현상세
│   │   └── 04_원본자료/
│   └── DEVELOPMENT.md     # 개발 계획 · P0 백로그 · 스택 결정
├── db/
│   └── migrations/        # PostgreSQL 스키마 (001 母 DB · 002 공통 레이어 · 003 앱)
├── services/
│   ├── harvest/           # 수집 엔진 (Python) — 파이프라인 + 벤더 어댑터 + 워커
│   ├── core/              # 공통 레이어 (Python) — 게이트 · 원장 · 동의 · 브랜드 프로필 · 알림
│   └── api/               # 백엔드 API (FastAPI + Postgres) — 앱 3표면의 실서버
├── packages/
│   ├── shared/            # 도메인 타입 + 목데이터 (TS)
│   └── ui/                # 디자인 토큰 + 공용 컴포넌트 (React)
└── apps/                  # pnpm workspace + Vite + React 18
    ├── creator-app/       # 크리에이터 앱 (PWA · 6탭 + 알림함)
    ├── console/           # 브랜드 콘솔 (레일 8 + 아리 패널 + 캔버스)
    └── signup/            # 브랜드 가입 위저드 (5단계 · 아리 학습)
```

## 시작하기

### 풀스택 (API + 앱)

```bash
# 1) Postgres 준비 후 (마이그레이션·시드는 서버 기동 시 자동)
pip install -e services/core -e "services/api[dev]"
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/connection
uvicorn api.main:app --port 8000 --app-dir services/api

# 2) 앱 — API가 켜져 있으면 실서버 연동, 없으면 목데이터 데모로 자동 폴백
pnpm install
pnpm dev:creator    # :5173 크리에이터 PWA
pnpm dev:console    # :5174 브랜드 콘솔 (승인=실행·원장 기록)
pnpm dev:signup     # :5175 가입 위저드
pnpm build          # 전체 타입체크 + 빌드
```

번역·아리 실동작은 `ANTHROPIC_API_KEY` 설정 시 활성화(claude-opus-5),
없으면 명시적 폴백(`[번역대기]` 태그 · 아리 미연동 안내)으로 동작한다.

### 수집 엔진 (services/harvest) · 공통 레이어 (services/core)

```bash
cd services/harvest && pip install -e ".[dev]" && pytest   # 68 tests
cd services/core    && pip install -e ".[dev]" && pytest   # 27 tests
python -m harvest.cli demo   # 픽스처로 파이프라인 실연
```

수집 파이프라인: `Discover → Fetch → Enrich → Normalize → Dedup → Score → Store(母 DB)`.
상세는 [docs/handover/03_수집엔진](docs/handover/03_수집엔진/) 4종 문서 참조.

### DB

```bash
psql $DATABASE_URL -f db/migrations/001_creator_pool.sql
psql $DATABASE_URL -f db/migrations/002_core.sql
```

## 문서 읽는 순서

1. `docs/handover/00_README_인계문서.html` — 5분 요약
2. `docs/handover/01_프로토타입/커넥션_프로토타입_클릭데모.html` — 브라우저로 열어 직접 클릭
3. `docs/handover/02_서비스기획/1_서비스기획안_v1.0.html` — 기능 명세 + 갭 분석(P0/P1)
4. `docs/handover/02_서비스기획/2_서비스_전체_페이지맵.html` — 화면 목록 = 스프린트 백로그 뼈대
5. `docs/handover/03_수집엔진/1~4` — 설계 → 국가전략 → 기술스택 → 구현상세
6. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — 현재 개발 계획과 진행 상황

## 법률 · 컴플라이언스 선

수집은 공개 데이터 · 공식 API · 라이선스 DB까지. 로그인 우회 · CAPTCHA 무력화 안 함.
개인정보는 공개 비즈니스 연락처만, 국가별 규제(PDPA·PDPD·GDPR·州법)에 따른
처리근거 · 수신거부 · 삭제 대응 필수. 발송은 전부 게이트를 거친다.
