# 도메인 연결 — theprlist.net (클릭 단위 가이드)

> 확정 도메인: **theprlist.net** ("The PR List" — 크리에이터가 오르고 싶은 그 명단)
> 원칙: 도메인 업체(가비아 등)에서는 **레코드만 추가**하고, 실제 연결은 Vercel·Railway가 안내하는 값을 그대로 붙여넣는다.

## 서브도메인 구조 (확정)

| 주소 | 역할 | 호스팅 |
|---|---|---|
| `theprlist.net` (+`www`) | 랜딩/가입 위저드 | Vercel (signup) |
| `console.theprlist.net` | 브랜드 콘솔 | Vercel (console) |
| `app.theprlist.net` | 크리에이터 앱 | Vercel (creator-app) |
| `admin.theprlist.net` | 어드민 | Vercel (admin) |
| `api.theprlist.net` | 백엔드 API | Railway |
| `reply.theprlist.net` | 크리에이터 답장 수신 (MX) | SendGrid Inbound Parse — SendGrid 가입 후 |
| `outreach.theprlist.net` | 대량 발송 발신 도메인 | SendGrid 도메인 인증 — SendGrid 가입 후 |

## 🧑 1단계 — Vercel 4개 프로젝트에 도메인 붙이기 (각 3분)

각 Vercel 프로젝트(console, signup, creator-app, admin)에서:

1. 프로젝트 → **Settings → Domains** → **Add**
2. 위 표의 주소 입력 (예: console 프로젝트엔 `console.theprlist.net`)
   - signup 프로젝트에는 `theprlist.net`과 `www.theprlist.net` 둘 다 추가
3. Vercel이 "이 레코드를 추가하세요"라고 알려줌 — 보통:
   - 서브도메인: `CNAME → cname.vercel-dns.com`
   - 루트(theprlist.net): `A → 76.76.21.21`
4. **가비아 → 도메인 관리 → DNS 설정**에서 그 값 그대로 추가 → 저장
5. Vercel 화면이 ✅로 바뀔 때까지 몇 분 대기 (최대 몇 시간)

## 🧑 2단계 — Railway API에 도메인 붙이기 (3분)

1. Railway → api 서비스 → **Settings → Networking**
2. **Custom Domain** → `api.theprlist.net` 입력 (포트 8000 그대로)
3. Railway가 알려주는 `CNAME` 값을 가비아 DNS에 추가
4. 초록불 뜨면 브라우저에서 `https://api.theprlist.net/health` → `"ok":true` 확인

## 🧑 3단계 — Railway 환경변수 갱신 (2분)

Railway → api 서비스 → Variables에 추가/수정:

| 변수 | 값 |
|---|---|
| `ALLOWED_ORIGINS` | `https://theprlist.net,https://www.theprlist.net,https://console.theprlist.net,https://app.theprlist.net,https://admin.theprlist.net` |
| `REPLY_DOMAIN` | `reply.theprlist.net` |
| `GOOGLE_REDIRECT_URI` | `https://api.theprlist.net/gmail/callback` (구글 연동 시작한 경우) |

⚠️ `ALLOWED_ORIGINS`를 넣는 순간 목록 밖 주소(기존 vercel.app 주소 포함)에서는 API 호출이 막힌다.
Vercel 커스텀 도메인이 전부 초록불이 된 **뒤에** 넣을 것. vercel.app 주소도 계속 쓰려면 목록에 추가.

## 🧑 4단계 — 구글 클라우드 리디렉션 URI 추가 (2분, 구글 연동 시)

console.cloud.google.com → 사용자 인증 정보 → OAuth 클라이언트 →
승인된 리디렉션 URI에 `https://api.theprlist.net/gmail/callback` **추가** (기존 것 삭제하지 말 것).

## 나중에 (SendGrid 가입 후)

- `reply.theprlist.net` MX 레코드 → SendGrid Inbound Parse (크리에이터 답장 수신)
- `outreach.theprlist.net` SPF/DKIM/DMARC → SendGrid 도메인 인증 → 워밍업 시작

## 🤖 코드 반영 현황

- CORS 화이트리스트: `ALLOWED_ORIGINS` 환경변수 지원 (없으면 기존대로 전체 허용) ✅
- 답장 수신 도메인 기본값: `reply.theprlist.net` ✅
- 약관·개인정보처리방침 페이지: 회사 정보 4가지(상호·주소·대표자명·연락 이메일) 받는 대로 `theprlist.net/privacy` · `/terms`로 제작 예정
