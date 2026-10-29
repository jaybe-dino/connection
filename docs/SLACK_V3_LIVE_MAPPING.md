# slack-v3 원본 → 실서비스(앱 루트) 요소 매핑

기준 원본: `docs/ui-reference/slack-v3` 7개 자산(2026-10-17 승인 스냅샷,
해시는 `snapshot.json`). 실서비스 셸: `apps/creator-app/public/slack/`
+ `apps/creator-app/index.html` (app.theprlist.net 루트).

- CSS 3종(`editorial-app.css`·`slack-structure.css`·`journey.css`)은
  **바이트 동일 복사**. 추가 스타일은 `live.css`(채널 검색 입력·검색 결과
  카드 2종)만.
- JS 3종은 원본의 함수·마크업·클래스 구조를 유지한 각색본이고,
  `live-core.js`가 예시 데이터 전체를 실제 API 상태로 대체한다.
- localStorage는 운영 DB 대용으로 쓰지 않는다 — 세션 JWT,
  대화 언어 선택, 작성 중 초안, 캠페인 북마크(기기 편의)만 저장.

## 공개 진입(원본 journey 공개 플로우)

| 원본 요소 | 실서비스 동작 | 비었을 때/실패 시 |
|---|---|---|
| 브랜드 초대 페이지(`?brand=`) | `GET /brands/{b}/identity` 실로고·이름·태그라인, `?product=`·`?application=`은 `invitation`/`recruitment-links` 실조회 | 브랜드 없음 → `state/invalid` 화면 |
| 참여 단계 표시(초대→로그인→프로필→참여) | 실제 진행 단계와 동기화 | — |
| 이메일 로그인 | `POST /auth/magic` 실발송(브랜드·모집 토큰·locale 동반) | 실패 메시지 inline(role=status) |
| 메일 확인 화면 | 실발송 후 상태. '메일 다시 받기' 재요청 | 개발 모드(demoLink)만 링크 직접 표시 |
| '체험용 로그인 링크 열기'(시안 전용) | **삭제가 아니라 치환**: 실제 매직링크(`?magic=`)를 `POST /auth/magic/verify`로 소비 | 만료 → `state/expired` |
| 온보딩 프로필 폼 | `GET/PUT /me/profile` — 국가·언어·배송 가능 국가·TikTok 핸들·약관/개인정보 동의(대리 기록 없음) + 연결 상태 4종 + TikTok 소유 인증 버튼(`/me/tiktok*`) | 미완료 시 서버 hint 그대로 |
| 브랜드 참여 확인 | `POST /me/join` (TikTok 입장 게이트 서버 강제 — UI는 게이트 안내+이동 버튼) | 중복 가입 → 재등록 없음 안내 |
| 참여 완료(첫 단계 3개) | 실이동: 공지 채널·캠페인·미션 | — |
| '전체 이용 흐름'(체험 상태 전환) | **치환**: `이용 안내` 정보 페이지(route-map 레이아웃 유지, 상태 조작 없음) | — |
| 상태 화면(만료/잘못된 초대/중복/미선정/로딩/오류/빈/전송 실패) | 실조건에서 표시(매직 만료, identity 404, 중복 join, 신청 rejected, 로드 실패 등) | — |

## 워크스페이스 셸(slack-structure)

| 원본 요소 | 실서비스 | 빈 상태 |
|---|---|---|
| 상단 플럼 탑바·검색(⌘K) | 동일. 검색 다이얼로그는 실멤버십 브랜드+실캠페인 클라이언트 검색 | 결과 없음 카드 |
| 'UX 참고 사례' 버튼 | **치환**: `이용 안내 ↗` | — |
| 알림 벨 | `GET /me/notifications` 배지 + 모달(딥링크 `POST read` 후 셀/캠페인 이동, 모두 읽음) | '새 알림이 없어요' |
| 브랜드 레일(pr./브랜드/＋/아바타) | 실멤버십 브랜드(로고 또는 이니셜, 미읽음 점), ＋는 초대 링크 입력, 아바타=설정 | 멤버십 없음 → 레일에 ＋만 |
| 사이드바 브랜드 헤드 | 실브랜드명 + 멤버 수(`my-cells.memberCount`) | 'theprlist · 크리에이터 워크스페이스' |
| 내 할 일(배지) | 실협업 중 조치 필요 수(selected/terms_agreed/sample_shipped) | 배지 없음 |
| 커뮤니티 채널(공지/자유대화) | 실채널 `notice`/`chat` (`GET cells/{id}/messages?channel=`) | 채널별 빈 안내 |
| 접힌 '제품·콘텐츠 더 보기'(제품이야기+콘텐츠팁) | 접힘 유지, 내부는 실채널 `products`(제품이야기)·`tips`(콘텐츠팁) — 둘 다 실게시·조회(056에서 products 채널 추가) | 채널별 빈 안내 |
| 브랜드 랭킹/미션·배지(Lv 배지) | `GET /brands/{b}/ranking?period=week·all`, `/me/missions?brand=`, `/me/xp` — Lv = floor(XP/300)+1 | 기록 없음 안내 |
| 캠페인 채널 목록(모집/마감 배지) | 브랜드별 실캠페인(`/me/campaigns`), 상태 배지 모집/진행/마감 | '아직 열린 모집 없음' |
| 선정된 나의 협업 | `내 협업`(work)으로 이동 | — |
| 담당자 DM 항목(초록 점·미읽음) | `POST /community/dm/{brand}` 실 1:1 셀 + `/me/unread` 배지 | — |
| 사이드 바텀 '디자인 체험 · 예시 데이터' | **치환**: 로그인 이메일 + 설정 | — |
| 모바일 하단 네비(채널/내 협업/DM/내 공간)·채널 드로어(☰) | 동일 구조, 미읽음 점 실데이터 | — |

## 대화(editorial conversation)

| 원본 요소 | 실서비스 | 비고 |
|---|---|---|
| 날짜 구분선('10월 17일 · 오늘') | 실메시지 날짜별, 오늘이면 '· 오늘' | — |
| 메시지(아바타/이름/역할/시간) | 실작성자, 역할=브랜드·담당자/운영, 시간 실값 | — |
| 번역 표시 + '원문 보기' | 실 `translations[내 언어]`/`original`/`originalLocale`, 준비 중·실패 시 원문 표시 상태 문구 | 언어: ko/en/th/vi/ja, IP 자동+수동(기기 저장) |
| 메시지 이미지 | 컴포저 🖼로 공개 HTTPS 주소 첨부(`image_url` 검증) → 원본 `.message-image` 렌더 | 첨부 없으면 미표시 |
| ♡ 리액션 | `POST .../messages/{id}/reaction` — 사람당 1개 토글, `reactionCount`/`myReaction` 실집계. 답글(스레드) 버튼은 실 `replyCount` | 0 표시 |
| 답글/스레드 패널 | `GET .../messages/{id}/thread`, 답글 `POST`(`thread_parent`), 폴링 갱신 | 답글 없음 안내 |
| 공지 고정(📌) | 실 `pinnedAt` 상단 정렬 + 배지 | — |
| 컴포저(Enter 전송·초안 유지) | `POST messages`(2000자, 선택 `image_url`), 초안은 **사용자ID+셀:채널** 키로 계정별 기기 저장, 전송 중 잠금 | 공지는 읽기 전용 안내 |
| 채널 검색 | `GET cells/{id}/search?q=` (추가 UI는 live.css, 860px 이하 숨김 — 모바일은 ⌘K/글로벌) | 0건 안내 |
| 읽음 처리 | 열람·폴링 시 `POST read`(last_msg_id) → 미읽음 해제 | — |

## 캠페인(목록·상세·신청)

| 원본 요소 | 실서비스 | 빈/차단 |
|---|---|---|
| 탭(전체/저장/신청) | 전체=`/me/campaigns`, 저장=기기 북마크∩실목록, 신청=myStatus/termsState | 각 탭 빈 카드 |
| 캠페인 카드(사진/상태 pill/북마크/커미션/마감) | 실데이터. 사진=캠페인에 연결된 **같은 브랜드 제품의 실제 이미지**(product_invitation_profiles, https만) → 브랜드 로고 → 중립 모노그램 순(타 브랜드 이미지 금지) | — |
| 상세(히어로/소개/가이드/일정/신청 aside) | 실 usp·제품·국가(국가명 표기)·마감·보상유형. 가이드 1번 타일은 실제 제품명 | 마감/지역 미대상/게이트 시 신청 차단+사유 |
| 신청 페이지(핸들+아이디어+확인) | 핸들=프로필 값(읽기 전용, 설정 링크), `POST /campaigns/{id}/apply`; 아이디어는 **담당자 DM 실전송** — 전달 실패 시 부분 성공 안내 + DM 초안 보관(신청 중복 없음) | 게이트/마감/지역 각각 전용 화면 |
| 신청 완료/상태 | 실상태: 검토 중 → 선정(협업 이동) / rejected(미선정) | — |

## 내 협업(선정→완료)

| 원본 요소 | 실서비스 |
|---|---|
| 통계 3칸 | 진행 중/확인할 일/완료 — 실 offers 집계 |
| 진행 단계 바(5단계) | selected→terms_agreed→sample_shipped→content_submitted→completed |
| 선정·조건 확인 | 제안 수수료 표시, TikTok 핸들 입력 + 확인 체크 → `POST agree`(거절 포함) |
| 샘플 수령 정보 입력(원본 address 단계) | `POST /me/campaign-offers/{cid}/shipping` — 선정~합의 단계에서 수령인/국가/주소/연락처 저장·수정, **해당 협업의 브랜드 콘솔에서만 조회**(감사 원장에는 국가만, 주소·연락처 무기록). 발송 후 잠금 |
| 배송 상태 | sample_shipped + 실송장 표시 |
| 콘텐츠 제출(링크+메모) | `POST content`(https 강제). 검토 중(content_submitted)에는 '제출 링크 수정'으로 본인 링크를 실수정(완료 후 변경 금지·XP 중복 지급 없음). 메모는 **담당자 DM 실전송** — 전달 실패 시 부분 성공 안내 + DM 초안 보관(콘텐츠 재제출 불필요) |
| 수정 요청(원본 revision) | 브랜드 콘솔 `request-revision`(피드백 메모) → 상태 `revision_requested` + 크리에이터 알림 → 원본 revision-note 화면에서 **수정본 제출**(요청 해소 후 재검토, 완료는 재제출 뒤에만) |
| Spark Ads 코드 | `POST spark-code` — 합의 후~검토 중 등록/수정, 브랜드 전용(커뮤니티 비노출) 문구 유지 |
| 완료 화면(배지·기록) | completed: 확정 수수료·콘텐츠 링크·어필리에이트 링크·Spark 보존 표시. 정산 송금 화면은 '공개 준비 중' 명시 |
| 협업 기록 타임라인 | 상태 기반 실체크(완료/대기) |

## 랭킹·미션·배지 / 내 공간 / 설정

| 원본 요소 | 실서비스 |
|---|---|
| 랭킹 테이블('나' 강조) | `GET /brands/{b}/ranking`(+`me` 플래그), 공개 정보=핸들·XP만 |
| 주간 탭 | `?period=week`(최근 7일 실집계) / 전체 기록 — 같은 xp_events 를 기간 필터로만 좁힘 |
| 레벨·XP 바 | `GET /me/xp`, Lv=floor(총XP/300)+1 |
| 미션 카드/배지 컬렉션 | `GET /me/missions?brand=` 6종(합류50/첫 인사20/신청30/합의60/제출80/완료120) — 배지=달성 미션 |
| 점수 기준 다이얼로그 | 실제 XP_POINTS 표 |
| 내 공간(배너/통계/브랜드 그리드/저장 캠페인) | 실프로필·실멤버십·실XP, 저장 캠페인=기기 북마크 |
| 설정-프로필 | 온보딩 폼과 동일(실저장) + TikTok 인증 |
| 설정-언어·번역 | 5개 언어 + 접속 국가 자동 선택(`/locale/detect`·`/api/locale`) |
| 설정-알림(원본 토글 4종) | `GET/PUT /me/notification-prefs`(notification_prefs 재사용, 계정 저장). campaign 토글은 알림 생성에, dm 토글은 담당자 DM 미읽음 배지에 즉시 반영(대화 열람은 유지), deadline·email은 해당 기능 연결 전까지 '준비 중' 정직 표기로 저장만. 로드 실패 시 오류·다시 불러오기 UI. 아래에 실알림 목록+읽음 처리 |
| 설정-계정('체험 초기화') | **치환**: 실이메일/TikTok 상태/약관·개인정보 링크/로그아웃 |

## 계정 딥링크 보존

- `?magic=` 매직 로그인(이 셸에서 소비), `?brand=` 초대, `?application=`
  모집 제안, `?product=` 제품 소개, `?invite=` 브랜드 콘솔 계정 수락
  모달(`/auth/accept`), `?reset=` 비밀번호 재설정 모달(`/auth/reset/confirm`),
  해시 `#community`/`#work`/`#achievements` 등 전 페이지 라우팅.

## 실시간·보존

- 캠페인 마감 비교는 서버 신청 검사와 동일하게 Asia/Seoul 날짜 기준.
- 액션 실패 시 사용자가 만지던 폼 값·체크는 페이지별로 보존·복원되고
  포커스도 유지된다(softRender). 성공 시 해당 폼 보존만 해제.
- 폴링 5s(백오프 최대 60s): 미읽음·알림·열린 채널·스레드·(캠페인/협업
  화면일 때) 목록 — 변경 시에만 softRender(입력·포커스·커서·스크롤 보존,
  하단 근접 시 하단 유지). background 중단, 복귀 시 즉시 1회. 세션(토큰)
  교체 시 stale 응답 폐기·초안 키 분리.

## 운영 모드(AUTH_REQUIRED=1) 경계

- legacy_access_boundary 의 self_checked 정확 경로 목록에 신규 2경로를
  추가했다: `/me/notification-prefs`(GET/PUT),
  `/me/campaign-offers/{id}/shipping`(POST) — 각 핸들러의 본인 JWT 검사
  (_me_creator/_creator)는 그대로이며 넓은 `/me/*` 허용은 하지 않는다.
  회귀 방지는 tests/test_creator_parity_strict_independent.py
  (AUTH_REQUIRED=1: 본인 성공·익명 401·타 크리에이터 404·입력 strip 검증·
  DM 배지 실반영) 로 고정.
