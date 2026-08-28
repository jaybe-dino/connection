# 외부 연동 셋업 런북

코드로는 더 갈 수 없는, **사람이 계정을 만들고 계약해야 하는** 항목들의 실행 절차.
각 항목마다: 어디서 → 무엇을 준비 → 절차 → 받은 것을 코드 어디에 꽂는가 → 소요 기간.

우선순위 원칙: **리드타임이 긴 것부터 신청**하고, 기다리는 동안 셀프서브 항목을 처리한다.

| 순서 | 항목 | 방식 | 예상 리드타임 | 막히는 것 |
|------|------|------|--------------|-----------|
| 1 | 틱톡 OAuth 앱 심사 | 심사 | 1~2주+ | 크리에이터 가입 전부 |
| 2 | 인스타(Meta) 앱 심사 + 비즈니스 인증 | 심사 | 1~3주 | 인스타 가입 |
| 3 | TikTok Shop 파트너 자격 | 심사 | 2~4주 | D3 커머스 그물 |
| 4 | influencers.club 라이선스 협상 | 세일즈 | 1~2주 | L2 스냅샷(50만 fetch 생략) |
| 5 | PingPong 파트너십 | 세일즈+KYB | 2~4주 | 자동 정산 (M0는 수동으로 우회 가능) |
| 6 | 카카오 알림톡 (딜러사) | 계약+템플릿 심사 | 1~2주 | 브랜드 외부 알림 (메일로 우회 가능) |
| 7 | ScrapeCreators · EnsembleData · Apify · ZeroBounce | 셀프서브 | 당일 | 수집엔진 실가동 |
| 8 | SES/SendGrid + 도메인 인증 | 셀프서브 | 1일 + 워밍업 2~4주 | 메일 알림·아웃리치 |
| 9 | Slack 웹훅 | 셀프서브 | 5분 | — |

---

## 1. 수집엔진 벤더 API 키 (셀프서브 — 당일 가능)

단가는 인계 문서의 2026-08 공개 기준(협상 전) — 가입 시 실단가 재확인.

### ScrapeCreators — 대량 fetch 주력 ($0.99~1.88/1K)
1. scrapecreators.com 가입 (이메일) → 대시보드에서 API 키 발급
2. 크레딧 선불 구매 (소액으로 시작 — 스모크 테스트 후 증액)
3. `export SCRAPECREATORS_API_KEY=...`

### EnsembleData — 정밀 필드·bio (유닛제, 월 최소 ~$100)
1. ensembledata.com 가입 → 무료 트라이얼 유닛으로 시작
2. 대시보드에서 토큰 확인 → `export ENSEMBLEDATA_TOKEN=...`
3. 월 구독 전환은 스모크 테스트로 응답 품질(특히 `region`·`signature` 필드 충실도) 확인 후

### Apify — link-in-bio·이메일 액터 ($49/월 + 사용량)
1. apify.com 가입 → Starter 플랜 → Settings > Integrations에서 Personal API token
2. `export APIFY_TOKEN=...`
3. 액터 선택: TikTok 프로필 스크레이퍼 + link-in-bio 이메일 추출 액터 (스토어에서 평점·최근 유지보수 확인)

### ZeroBounce — 이메일 검증 (~$0.5/1K, 인계 기준)
1. zerobounce.net 가입 → 크레딧 구매 (무료 100건으로 파이프 테스트)
2. `harvest/enrich/email_verify.py`의 `VerifyApi` 프로토콜 구현체 작성해 연결

### influencers.club — 라이선스 DB (세일즈)
1. 데모/세일즈 콜 예약 — **준비물**: 필요 볼륨(국가·카테고리별 계정 수, 예: TH 뷰티 50만),
   용도 설명(브랜드-크리에이터 매칭), 데이터 필드 요구(핸들·이메일·팔로워)
2. 협상 포인트: 대량 스냅샷 단가 · 갱신 주기 · 재배포 제한 조건 · 이메일 검증 여부
3. 계약 조건에 **개인정보 처리 근거**(정당한 이익/공개 데이터) 명시 요구 — 법무 검토 대상

### TikTok Shop Partner API — 커머스 그물 (심사, 가장 김 → 지금 신청)
1. partner.tiktokshop.com에서 서비스 파트너 등록 (사업자 정보·서비스 설명 필요)
2. 승인 후 파트너 센터에서 앱 생성 → Affiliate 권한 신청
3. 자격 요건이 지역·시기별로 바뀌므로 반려 시 현지 TSP(TikTok Shop Partner) 제휴가 우회로

### 키 수령 후 절차 (엔지니어)
```bash
# 1) .env에 키 설정 (커밋 금지 — .gitignore에 이미 있음)
# 2) 실응답 캘리브레이션: 실계정 1건 조회 → raw 응답을 fixtures로 저장
cd services/harvest
python -c "
from harvest.vendors.adapters import EnsembleData
p = EnsembleData().user_info('실제핸들')
print(p)"      # normalize()가 필드를 제대로 뽑는지 확인, 어긋나면 adapters.py 수정
# 3) 소규모 스모크: 해시태그 1개 × 1페이지 → 母 DB 적재 → 단가 실측
# 4) 단가 검증 후 config.py의 일일 예산(daily_discover_budget) 설정 → 본가동
```

---

## 2. 크리에이터 OAuth 앱 등록 (심사 — 지금 신청)

### 공통 준비물 (둘 다 요구)
- **개인정보처리방침 URL** + **서비스 약관 URL** (공개 웹페이지 — 랜딩 없으면 정적 페이지라도 먼저)
- 서비스 도메인 (connection.app) + HTTPS 콜백 URL
- 심사용 데모 영상 (가입 플로우 화면 녹화 — 현재 앱 빌드로 제작 가능)

### 틱톡 — Login Kit (developers.tiktok.com)
1. 개발자 계정 생성 → 조직(사업자) 인증
2. 앱 생성 → **Login Kit** 제품 추가
3. Redirect URI 등록: `https://api.connection.app/auth/tiktok/callback` (정확히 일치해야 함)
4. 스코프 신청: `user.info.basic` `user.info.profile` `user.info.stats` (+영상 검증 필요 시 `video.list`)
   — 스코프별 **사용 목적 설명**을 요구하므로 "크리에이터 본인 확인 및 공개 프로필 검증" 명시
5. 샌드박스 모드로 개발 → 심사 제출 → 승인 후 프로덕션
6. 발급물: Client Key / Client Secret → 백엔드 환경변수

### 인스타그램 — Meta (developers.facebook.com)
주의: Basic Display API는 종료됨. 현행 경로는 **Instagram API with Instagram Login**
(프로페셔널 계정 — 크리에이터/비즈니스 계정 — 만 로그인 가능. 우리 대상이 크리에이터라 적합).
1. Meta 개발자 계정 → **비즈니스 인증** (사업자등록증 — 리드타임의 대부분)
2. 앱 생성 → Instagram 제품 추가 → Instagram Login 설정
3. Redirect URI: `https://api.connection.app/auth/instagram/callback`
4. 스코프: `instagram_business_basic` (프로필·팔로워 수) — App Review에서 데모 영상 필수
5. 발급물: App ID / App Secret

### 구현 체크리스트 (키 수령 후 — 코드 작업)
- `POST /auth/{provider}/start` → PKCE + state 생성 → 플랫폼 인가 URL 리다이렉트
- `GET /auth/{provider}/callback` → code 교환 → 액세스 토큰 → 공개 필드 6개 수신
- 패스 발급(첫 가입) 또는 로그인 → 원장에 `SNS_VERIFIED` 기록 (`core.ledger` 사용)
- 토큰은 재검증(90일 주기)용으로 암호화 저장 · refresh 처리
- 어떤 링크로 와도 로그인 후 원래 가려던 셀로 리다이렉트 (returnTo 파라미터)

---

## 3. 정산 · 물류 · 알림 채널

### PingPong (정산) — 세일즈+KYB
1. PingPong 기업 파트너십 문의 (mass payout / 크로스보더 지급 API)
2. KYB 서류: 사업자등록증 · 대표자 신분증 · 서비스 설명 · 자금 흐름 설명
3. 계약 포인트: 태국 바트(THB) 지급 지원 · 건당 수수료 · 최소 인출액 · 지급 실패 시 환불 플로우
4. **M0 우회로**: 로드맵상 M0은 수동 정산 — 콘솔 PAYOUT 게이트 승인 → 운영자가 수동 송금
   → 원장에 기록. PingPong은 M1까지만 붙으면 됨. 대안: Wise Platform, Payoneer Payouts
5. 연동: `core.gates`의 PAYOUT executor로 구현 (승인 시에만 API 호출되는 구조 이미 있음)

### 물류 · 배송 추적
1. **M0**: 브랜드가 직접 발송 + 콘솔에서 송장번호 수기/CSV 업로드 (화면 구현됨)
2. 추적 자동화: AfterShip 또는 TrackingMore 가입 (셀프서브) — 태국 Flash Express, J&T 등 지원
   → 송장번호 등록하면 상태 변경 웹훅 → 크리에이터 앱 배송 스텝 + 알림 발송
3. 물류사 직계약(Flash Express API 등)은 볼륨 생긴 뒤

### 카카오 알림톡 (브랜드 승인 대기 알림)
1. 카카오톡 채널 개설 (business.kakao.com) → 비즈니스 인증
2. 알림톡은 **공식 딜러사 경유** 계약 (인포뱅크·NHN Cloud 등 — 단가 건당 몇 원대)
3. 템플릿 사전 심사 필요 (2~3일): "승인 대기 N건 — [승인함 바로가기]" 형태로 등록
4. **우회로**: P0 요구는 "메일·카카오·슬랙 중 외부 알림" — 메일+슬랙 먼저 열고 카카오는 후순위 가능

### Slack (5분)
1. 브랜드 워크스페이스에서 Incoming Webhook 생성 → URL을 브랜드 설정에 저장
2. `core.notifications`의 `Sender` 어댑터로 POST — 계약 불필요

### 이메일 — SES 또는 SendGrid (알림 + 아웃리치 분리)
1. 도메인 분리 원칙: 알림은 `mail.connection.app`, 아웃리치는 `outreach.connection.app`
   (아웃리치 평판 하락이 알림 도달률을 죽이지 않도록)
2. SPF·DKIM·DMARC 레코드 설정 → SES는 프로덕션 액세스 신청(샌드박스 해제, 1~2일)
3. 아웃리치 도메인은 **워밍업 2~4주**: 일 20통부터 점증 — `harvest` 아웃바운드 일 80건 상한과 연동
4. 모든 아웃리치 메일에 unsubscribe 링크 필수 → 수신거부는 `core.consent` 억제 목록으로

---

## 4. 다음 개발 단계 (코드 — 외부 계약과 병행 가능)

권장 순서. ①②는 계약 없이 지금 바로 가능.

### ① 백엔드 API 서버 (FastAPI)
- `services/api` 신설 — `core`(게이트·원장·동의·프로필·알림)와 `harvest` 母 DB를 HTTP로 노출
- 엔드포인트 계약은 `packages/shared/src/index.ts` 타입이 정본
- 우선 엔드포인트: 게이트 목록/승인/보류, 셀 메시지, 캠페인 CRUD, 알림함, 내 정보 수정
- Postgres 연결 (`db/migrations` 적용) → InMemory 구현을 Postgres 구현으로 교체

### ② 앱 ↔ API 연동
- `packages/shared/src/mock.ts` → `api.ts`(fetch 클라이언트)로 교체, 화면은 그대로
- 콘솔 게이트 승인 버튼 → 실제 게이트 엔진 호출 (승인=실행 시맨틱 유지)

### ③ 번역 레이어 + 아리 (Claude API)
- **Anthropic API 키 발급**: console.anthropic.com → API Keys (셀프서브, 당일)
- 모델: `claude-opus-5` ($5/$25 per MTok) 기본 — 아리 판단·마중물 생성·번역 모두.
  적응형 사고(`thinking: {"type": "adaptive"}`) + `output_config.effort`로 작업별 비용 조절
  (마중물·번역은 `low`, 판정·주간 계획은 `high`)
- 캠페인 게시 시 일괄 번역(th·en·vi)은 **Batches API** 사용 — 비실시간이라 50% 할인
- 셀 대화 실시간 번역은 프롬프트 캐싱(용어집·브랜드 프로필을 캐시 프리픽스로) 적용
- 아리 에이전트 루프는 SDK **Tool Runner** (`client.beta.messages.tool_runner`) —
  게이트 요청·母 DB 조회·셀 게시를 도구로 정의, 실행은 전부 게이트 뒤
- 원가 가드: 인계 문서 추정 월 $165~255/브랜드 — `usage` 로깅 붙여 실측, Starter 플랜 상한 검증

### ④ OAuth 콜백 (플랫폼 승인 후) → ⑤ 수집엔진 본가동 (벤더 키 후) → ⑥ 알림 채널 어댑터

---

## 이번 주 액션 요약

**오늘 신청 (리드타임 김)**: 틱톡 개발자 앱 · Meta 비즈니스 인증 · TikTok Shop 파트너 ·
influencers.club 세일즈 콜 · PingPong 문의
**오늘 가능 (셀프서브)**: ScrapeCreators·EnsembleData·Apify·ZeroBounce 키 → 수집엔진 스모크 ·
Anthropic API 키 · SES 도메인 인증 시작(워밍업 시계 돌리기)
**개발 착수**: FastAPI 백엔드 + 앱 연동 (계약 대기와 무관)
**준비 서류**: 사업자등록증 사본 · 개인정보처리방침/약관 페이지 · 가입 플로우 데모 영상
