# apps — 서비스 표면 3종

pnpm workspace + Vite + React 18 + TypeScript. **화면·흐름 스펙의 정본은 프로토타입 클릭데모**
([docs/handover/01_프로토타입/커넥션_프로토타입_클릭데모.html](../docs/handover/01_프로토타입/커넥션_프로토타입_클릭데모.html))
— 브라우저로 열어 직접 클릭해 볼 것. 프로덕션은 다시 구현한다(데모 코드 재사용 금지).

| 표면 | 경로 | 형태 | 화면 (페이지맵 기준) |
|------|------|------|---------------------|
| 크리에이터 앱 | `creator-app/` | PWA · 모바일 (`connection.app/{brand}`) | 온보딩(OAuth) · 셀 · 담당자 · 캠페인 · 제출 · 정산 · 내 패스 · 알림함(P0) |
| 브랜드 콘솔 | `console/` | 데스크톱 웹 (`console.connection.app`) | 아리 채팅 패널 + 브리핑 · 승인함(게이트4) · 발굴수집 · 셀 · DB · 캠페인 · 검수 · 정산원장 · 설정(팀권한 P0) |
| 브랜드 가입 | `signup/` | 위저드 (`connection.app/for-brands`) | 사업자 → 프로필·슬러그 → 플랜 → 아리 학습 → 완료 |

## 공통 시스템 레이어 (화면 뒤)

인증(패스·원위치 리다이렉트) · 번역(TR: 시청자 언어 + 원문 칩) ·
게이트 엔진(PII·PAYOUT·OUTBOUND·PUBLISH) · append-only 원장 ·
브랜드 프로필(버전 관리) · 평가 하네스(30일 채점) · 알림(P0).

## 실행

```bash
pnpm install
pnpm dev:creator   # :5173 크리에이터 PWA
pnpm dev:console   # :5174 브랜드 콘솔
pnpm dev:signup    # :5175 가입 위저드
pnpm build         # 전체 타입체크 + 빌드
```

현재 데이터는 `packages/shared/src/mock.ts` — API 연동 시 이 모듈만 교체.

## 다음 결정

- 인증: 틱톡·인스타 OAuth 앱 등록 (크리에이터는 이메일 가입 없음)
- 푸시: PWA Web Push + 브랜드 외부 알림(메일·카카오·슬랙)
- 백엔드 API: services/core 도메인 로직을 HTTP로 노출 (FastAPI 권장)
