# 페르소나 QA — acceptance-contract 기준 (브랜드 5 · 크리에이터 5 · 관리자 1, 각 2회 여정)

- 기준: 전달받은 acceptance-contract.json 의 personas·rounds. 적용 범위는 v8.1 시안에 노출되는 기능뿐이에요.
- 실행 환경: 로컬 API(8765)·Postgres(v8dev)·정적 빌드(콘솔 5174 · 크리에이터 5175 · 관리자 5176)·Chromium 실브라우저.
- 최종 실행 시점: 3dc5a89 + 문서 커밋 작업 트리.

## 결과 표기

| 표기 | 뜻 |
|---|---|
| **통과** | 실제 행동 → 서버·화면 결과까지 확인 |
| **미확인** | v8.1 에 노출되지만 이번에 직접 확인하지 않음 |
| **미실행(외부)** | TikTok 실인증·운영 메일·실결제 등 이 환경에서 실행하지 않은 외부 구간 |
| **v8.1 미노출** | 시안에 없는 기능이라 범위 밖 |

전체 테스트 수는 페르소나 QA 횟수가 아니에요. 아래 표의 각 행이 한 번의 확인이에요.

## 증거 묶음(최종 실행 출력: `docs/qa/v8/runs/`)

| 묶음 | 결과 | 파일 |
|---|---|---|
| API(pytest) | 358 passed | `runs/api-pytest.txt` |
| 크리에이터 흐름 / 조건(고정비·IG) / 확인값 / 이력 / 커뮤니티 / 채널 | 24 / 12 / 18 / 17 / 12 / 6 | `runs/creator-v8-*.txt`, `runs/terms-fingerprint.txt` |
| 크리에이터 브랜드 범위 / 제품 모아보기 / 제품 이미지 / 세션 격리 | 25 / 25 / 8 / 11 | `runs/creator-brand-scope.txt`, `runs/products-v8.txt`, `runs/product-images.txt`, `runs/creator-session-v8.txt` |
| 콘솔 / 콘솔 검수 반영 / 콘솔 세션 | 39 / 34 / 8 | `runs/console-v8*.txt`, `runs/console-session-v8.txt` |
| 관리자 | 22 | `runs/admin-v8.txt` |
| 이번에 추가 검수한 빈 경로 | 9 | `runs/persona-gaps-v8.txt` (`tests_e2e/persona-gaps-v8.mjs`) |

이전 세대 E2E 6개(translation-retry, signup-magic, live-updates, mobile-width, campaign-flow, pool-flow)는 별도 `e2e_c3` DB 하네스가 필요해요. 이번 로컬 스택에서는 실행하지 않았어요. 해당 기능은 아래 API 테스트로 대신 확인했어요.

---

## B1 · 1인 K뷰티 첫 미국 진출

### 1회차 — 처음 시작

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 진출 목적·국가 | 새 캠페인 1단계에서 목적(판매/UGC/샘플)·국가 선택 | 목적별 3단계 조건 칸이 바뀜, 국가 저장 | console-v8 ‘캠페인: 모집 시작(서버 published · 조건 문장 저장)’, console-v8-review ‘샘플 없음: 콘솔 저장’ | 통과 |
| Shop·배송 준비 | 제품에 판매 링크·Shop 상품 ID·배송 국가 입력 | 필수 미입력 시 공개 불가 안내 | console-v8 ‘제품: 필수 저장 후 공개’, products-v8 | 통과 |
| 제품 사진·설명 | 새 제품에서 사진 먼저 선택 → 검증 저장 | 저장 전엔 미리보기만, 저장 시 생성→업로드. 실패 시 같은 제품으로 재시도 | console-v8-review ‘신규 제품: …’ 3건, `console-product-photo-*.png` | 통과 |
| 보상·기한·권리 | 3단계 커미션·샘플 수·제출 기한·광고 사용 범위 | 조건 문장으로 저장되고 크리에이터가 같은 문장을 봄 | console-v8 조건 문장, creator-v8-flow 조건 확인 | 통과 |
| creator 화면 미리보기 | 4단계 확인 화면·제품 미리보기 | 크리에이터가 보는 조건·스토리보드 | `console-create-step4-1280.png` | 통과(화면 확인) |
| 비공개 저장 | ‘초안 저장’ | 서버 draft, 크리에이터 목록에 없음, 발행 후 보임 | persona-gaps ‘B1 비공개 저장’, ‘B1 발행 후’ | 통과 |

### 2회차 — 예외·운영

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 샘플 20개 정원 | 샘플 수량·모집 인원 입력 | 조건에 ‘샘플 20개 · 배송비’ 저장 | console-v8 조건 문장 | 통과 |
| 발신 미연결 | 연결 계정 없이 메일 작성 | ‘연결 계정이 없어요’ 안내, 발송 경로 없음 | `console-mailprep-error-*.png`, `console-mailconnect-*.png` | 통과(화면 확인) |
| 첫 회신 질문 | 회신함에서 상태 ‘질문’·후속 할 일 저장 | revision 1 로 저장 | console-v8 ‘회신함: 상태·후속 할 일 저장’ | 통과 |
| 주소 누락 제외 | 주소 없는 참여 건 발송 처리 | 발송 불가·DM 요청 안내 | console-v8 ‘샘플: 주소 대기 표시(주소 없이 발송 불가)’, `test_reselect_rejected_needs_reconsider_and_shipping_needs_address` | 통과 |
| 출고 지연 때 기한 조정 | 조건 고치기로 기한 변경 | 이미 합의한 건은 합의 조건 유지, 새 제안만 바뀜 | terms-fingerprint 확인값·스냅샷 | 통과(기한 별도 연장 기능은 v8.1 미노출) |
| 비용 확인 | 월별 청구 화면 | 청구 기준·단가·월 청구서(고객 문구) | console-v8-review ‘청구: 고객 문구만’ | 통과 · 실결제 미실행(외부) |

## B2 · 중소 글로벌 마케팅 팀

### 1회차 — 정상 업무

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 제품·국가별 후보 분리 | 받는 사람 CSV 검수(국가 포함) | 형식 오류·중복 제외 | console-v8 ‘받는 사람: CSV 검수’ | 통과 |
| 관련 게시 근거 검토 | 후보별 근거 열람 | 근거 표시 | — | 미확인(브랜드 콘솔 후보 근거 화면) |
| 중복·거부 제외 | 제외 확인 단계 | 수신 거부·최근 연락·대기열 중복 서버 판정 | console-v8 ‘제외 확인: 서버 판정’, `test_creator_conflicts_duplicates_optouts_and_draft_reservations` | 통과 |
| 치환 제안 확인 | 수신자별 미리보기 | 개인별 문안·참여 링크 | `console-v8` 3단계, `test_delivery_uses_personalized_text_and_original_sender_only` | 통과 |
| 담당 배정 | 회신 담당자 지정 | 저장·다른 담당자에게도 같은 값 | `test_brand_reply_task_optimistic_and_optout` | 통과 |
| 회신·선정 | 지원자 선정(수수료) | 크리에이터 화면 같은 참여 건이 ‘선정’ | console-v8 ‘지원자: 선정’, creator-v8-flow | 통과 |

### 2회차 — 예외·재방문

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 직원 2명 동시 회신 | 두 콘솔 창에서 같은 회신을 다르게 저장 | 늦은 저장은 거부·안내, 입력 유지 | persona-gaps ‘B2 동시 회신 처리’ | 통과 |
| 휴가자 인계 | 최신 상태 불러온 뒤 다른 담당자가 저장 | 반영(revision 2) | persona-gaps ‘B2 인계’ | 통과 |
| 지연 답변 | 오래된 회신 확인 | 홈 할 일·회신함에 남음 | console-v8 홈·회신함 | 통과(대기 시간 표시는 미확인) |
| 주소 변경/출고 충돌 | 발송 후 크리에이터가 주소 수정 | 서버 409, 화면에 수정 버튼 없음 | persona-gaps ‘C2 발송 후 주소 변경 차단’ | 통과 |
| 수정 2회 | 수정 요청 2번 → 재제출 | 최신 요청 표시, v1·v2 보존, v3 검수 대기 | persona-gaps ‘C2 수정 2회’, ‘B2/D03 수정 2회 기록 보존’ | 통과 |
| 국가별 주간 리포트 | 결과·보상 화면 | 캠페인별 집계(조회·판매 미연동 표시) | console-v8 ‘결과: 같은 참여 건 집계’ | 통과(국가별 분할 보고서는 v8.1 미노출) |

## B3 · 성장 브랜드 성과팀

### 1회차 — 정상 업무

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 영상/라이브 목적 분리 | 목적 선택 | 판매·UGC·샘플 3종(라이브 없음) | console-v8 | 통과(라이브 목적은 v8.1 미노출) |
| 고정비+커미션+권리비 | 고정비(USD)·광고 사용 범위 | 고정비·통화·광고 사용 기간 저장 | `test_paid_instagram_and_krw_default`, console-v8 | 통과(권리비 별도 금액은 v8.1 미노출) |
| creator 질문 | 크리에이터 DM → 브랜드 답장(관련 캠페인 선택) | 고른 캠페인 조건만 표시·태그 | console-v8-review ‘DM: …’ 4건 | 통과 |
| 동일 조건 버전 합의 | 조건 바뀐 뒤 옛 확인값으로 합의 | 409, 재확인 후 새 스냅샷 | terms-fingerprint 18건 | 통과 |
| 납품·광고권 확인 | 영상 검수 완료·Spark 코드 | 검수 완료 ≠ 지급, Spark 는 합의 플랫폼 기준 | console-v8 영상 3건, `test_spark_follows_agreed_platform_both_directions` | 통과 |

### 2회차 — 예외·재협업

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 권리 만료 · 게시 비공개 · 반품 조정 | — | — | — | v8.1 미노출 |
| 지급 이견 | 분쟁 판정 | 판정 확정·실패 표시 | admin-v8(D07), `test_ops_api` | 통과(실지급 미실행(외부)) |
| 재협업 제안·기회 배분 | 새 캠페인 게시(추가 채널 포함) | 멤버에게 카드·공지 | console-v8-review ‘캠페인 게시: 직접 추가한 채널’, creator-v8-community | 통과 |
| 미확인 매출 | 결과·비용 화면 | 0 이 아니라 ‘미연동/미확인’ | console-v8 결과, admin-v8 ‘비용·성과’ | 통과 |

## B4 · 입점 전 제조사·수출팀

### 1회차 — 정상 업무

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 사업·판매 주체 확인 | 브랜드 신청·승인 | 승인 시 브랜드·초대 링크 | `test_application_approve_flow`, admin 브랜드 신청 화면 | 통과 |
| 국가·목적 선택 | 캠페인 1단계 | B1 과 같음 | console-v8 | 통과 |
| 제품 적합성·배송 준비 | 제품 필수 정보 | 미완성 제품은 모집 시작 불가 | console-v8 ‘캠페인: 3단계 필수 검증’ | 통과 |
| UGC/판매 경로 선택 | UGC + 샘플 0 | 샘플 없이 바로 영상 제출 | console-v8-review ‘샘플 없음’ 5건 | 통과 |
| 소규모 조건 설계 | 모집 인원·샘플 수 | 저장 | console-v8 | 통과 |

### 2회차 — 예외·운영

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 공식 인증 대기 | 관리자 모집 화면 | ‘신규 가입 인증 대기’ 안내 | RecruitmentWorkspace(creatorEntryReady=false) | 통과(화면) · TikTok 승인 미실행(외부) |
| 미지원 국가 | 캠페인 국가 밖 크리에이터 신청 | 신청 불가 | creator-brand-scope(국가 fixture), `test_campaign_apply_uses_jwt_creator` | 통과 |
| 규정 근거·효능 문구 | 금지어·검수 자동 체크 | 검수 현황 체크 표시 | `test_compliance`, admin 검수 현황 | 통과 |
| 후보 0명 | 조건에 맞는 후보 없음 | ‘배정한 후보가 없습니다’ 안내 | admin-v8 fixture 준비 중 디버그 실행에서 화면 확인(기록된 자동 검사 아님) | 통과(관찰) |
| 담당자 문의 | 브랜드 DM | 1:1 대화 저장 | console-v8 ‘DM: 보내기’ | 통과 |

## B5 · 다중 고객 운영 대행사

### 1회차 — 정상 업무

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 허용 고객 선택 | 관리자 ‘브랜드 콘솔 열기’ | 1회용 코드로 그 브랜드 콘솔(관리자) | admin-v8 ‘브랜드 콘솔 열기’, `test_console_handoff_is_one_time_admin_only` | 통과 |
| 발신·제품 확인 | 공용 모집 1–2단계 | 제안·기본 발신 계정 확인 | admin-v8 모집 단계 | 통과 |
| 초안 작성 | 4단계 미리보기·초안 | 발송 없음 | admin-v8 ‘200개 선택으로 서버 미리보기’ | 통과 |
| 고객 승인 | 검수 초안 → 승인 | 승인 전 미발송 | `test_reviewed_mapping_drafts_batch_detail_and_pause` | 통과 |
| 실행 | 승인 배치 발송 | — | — | 미실행(외부: 운영 메일) |
| 고객 리포트 | 비용·성과 브랜드별 | 서버 집계 | admin-v8 ‘비용·성과’ | 통과 |

### 2회차 — 예외·운영

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 다른 고객 탭 복귀 | 관리자 콘솔에서 브랜드 전환 | 이전 브랜드 입력·데이터 없음 | console-v8 ‘관리자 전환’ 2건 | 통과 |
| 동일 creator 복수 캠페인 | 같은 이메일 여러 제안 | 한 제안에만 배정 | `test_creator_conflicts_duplicates_optouts_and_draft_reservations` | 통과 |
| 승인 뒤 내용 변경 | 검수 후 문안·수신 거부 변경 | 검수값 무효 → 재검수 | `test_security_preview_hash_invalidated_on_optout_and_content_change` | 통과 |
| 직원 퇴사·재배정 | 계정 중지·세션 철회·역할 변경 | 기존 로그인 즉시 무효 | `test_suspend_resume_and_session_revoke`, `test_existing_team_role_change_revokes_old_login_session` | 통과 |
| 미수금 확인 | — | — | — | 미실행(외부: 실결제·수금) |

## C1 · 미국 초보 나노

### 1회차 — 정상 업무

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 초대 제품·보상 읽기 | 제품 모아보기(비로그인) | 공개 제품·조건 | products-v8 25건 | 통과 |
| 이메일 로그인 | 매직 링크 | 고정 앱 주소·유효 브랜드만 유지 | `test_creator_magic_link`, `test_magic_link_*` | 통과 |
| 프로필·인증 | 프로필 + TikTok 소유 인증 | 미인증 시 가입·신청 403 | `test_signup_launch_journeys` | 통과(로컬 가짜 제공자) · TikTok 실인증 미실행(외부) |
| 참여·조건 비교·신청 | 조건 보기 → 신청 | 조건 확인 체크 필수, 서버 applied | creator-v8-flow 1–5 | 통과 |
| 신청 접수 확인 | 내 캠페인 | 브랜드 검토 대기 표시 | creator-v8-flow ‘신청 후 내 캠페인으로 이동’ | 통과 |

### 2회차 — 예외·재방문

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 메일 만료 | 만료 링크 | 만료 안내 | `test_wrong_email_wrong_brand_and_expired_links_fail_closed` | 통과(API) |
| 인증 대기 | — | 승인 대기 안내 | — | 미실행(외부: TikTok 승인) |
| 캠페인 0 | 모집 중 없음 | 빈 상태 안내 | creator 빈 상태 문구(코드) | 미확인 |
| 반려·마감 | 미선정·마감 건 | 이력 유지·사유·신청 불가 | creator-v8-history 17건 | 통과 |
| 첫 질문 | 질문 채널·스레드 | 게시·답글 | creator-v8-flow ‘# 질문 채널’ | 통과 |
| 새 모집 알림 | 공지 열기 | 그 공지 스레드로 이동 | creator-v8-community ‘공지 열기’ | 통과 |

## C2 · 미국 파트타임 micro affiliate

### 1회차 — 정상 업무

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 보상·작업량 비교 | 둘러보기 조건 요약 | 보상·콘텐츠·국가·마감 | creator-v8-flow | 통과 |
| 신청 → 합의 | 조건 확인 → 합의 | terms_agreed, 스냅샷 | creator-v8-flow ‘조건 합의’ | 통과 |
| 주소 저장 | 주소 입력 | 서버 저장, 발송 대기 | creator-v8-flow ‘주소가 서버에 저장’ | 통과 |
| 송장·수령 | 브랜드 발송 | 송장 표시 | creator-v8-flow ‘송장·영상 제출 단계’ | 통과 |
| 콘텐츠 제출 | 영상 링크 | content_submitted | creator-v8-flow | 통과 |

### 2회차 — 예외·운영

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 주소 오타 수정 | 발송 전 ‘주소 수정’ | 서버 반영 | persona-gaps ‘C2 주소 오타 수정’ | 통과 |
| 샘플 지연 | — | — | — | v8.1 미노출(지연 신고 기능 없음) |
| 게시 기한 변경 | 합의 뒤 캠페인 수정 | 합의 조건 유지 | terms-fingerprint | 통과 |
| 수정본 제출 | 수정 요청 2회 → 재제출 | 최신 요청, 버전 보존 | persona-gaps 수정 2회 | 통과 |
| 보상 차이 문의 | 받을 보상·DM | 합의 금액 기준, 지급 미연동 표시 | creator-v8-terms ‘받을 보상’, creator-v8-flow ‘보상’ | 통과 · 실지급 미실행(외부) |

## C3 · 전업 성과형 midtier

### 1회차 — 정상 업무

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 정액+커미션 비교 | 고정비·커미션 캠페인 | 보상 종류별 표시 | creator-v8-terms, `test_paid_instagram_and_krw_default` | 통과 |
| 광고 기간·수정 횟수 질문 | 브랜드 DM | 1:1 대화 | creator-v8-flow DM / console DM | 통과 |
| 합의 버전 확인 | 조건 변경 중 합의 | 확인값 불일치 409·재확인 | terms-fingerprint 경합 4건 | 통과 |
| 검토본·게시본 제출 | 영상 제출·수정본 | 버전 보존 | persona-gaps | 통과(게시 확인은 미실행(외부: TikTok)) |

### 2회차 — 예외·운영

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 동일 브랜드 2캠페인 | 두 캠페인 동시 진행 | 서로 다른 상세·조건 | creator-brand-scope, console-v8-review(관련 캠페인 선택) | 통과 |
| 잘못된 링크 | 없는 캠페인 ID 로 상세 | 오류·목록, 다른 협업 폼 없음 | creator-v8-terms ‘없는 캠페인 ID’ | 통과 |
| 광고권 만료 | — | — | — | v8.1 미노출 |
| 추가 수정 | 수정 요청 | 최신 요청 표시 | persona-gaps | 통과 |
| 지급 분쟁 | 관리자 분쟁 판정 | 판정·실패 표시 | admin-v8 D07, `test_ops_api` | 통과 · 실지급 미실행(외부) |
| 다음 제안 | 새 캠페인 공지 | 카드 → 상세 | creator-v8-community | 통과 |

## C4 · 태국 모바일 뷰티

### 1회차 — 정상 업무

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 언어 선택 | 표시 언어 | 번역 표시, 원문 보존 | `test_cell_message_translated_fallback`, `test_translate_failure_preserves_original` | 통과(API) |
| 국가·배송 주소 | 국가별 주소 칸 | 국가에 맞는 라벨·자리표시 | creator-v8-flow 주소(US), 코드 | 통과(US) · 태국 형식 화면 미확인 |
| 원문·번역 비교 | 채널 메시지 | 원문 확인 가능 | API 번역 테스트 | 통과(API) · 화면 미확인 |
| 협업 진행 | 390 화면 | 목록 → 상세, 가로 넘침 없음 | creator-v8-history [390], creator-v8-flow [390] | 통과 |
| 현지 시각 마감 | — | — | — | 미확인 |

### 2회차 — 예외·재방문

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 번역 실패 | 번역 API 실패 | 원문 유지·재시도·최대 횟수 후 중지 | `test_translate_failure_preserves_original`, `test_translation_retry_gives_up_after_max` | 통과(API) |
| 입력 중 네트워크 끊김 | 주소·영상·합의 500 | 입력·체크 유지, 서버 미저장 | creator-v8-terms 500 3건 | 통과 |
| 세션 만료·계정 교체 | 로그아웃 → 다른 계정 | 이전 입력·상세·busy 없음 | creator-session-v8 11건 | 통과 |
| 알림 클릭 | 공지·할 일 알림 | 해당 상세로 이동 | creator-v8-community, creator-v8-flow ‘내 할 일’ | 통과 |
| 잘못된 협업 링크 | 없는 ID | 오류·목록 | creator-v8-terms | 통과 |
| 문의 | DM | 저장 | console/creator DM | 통과 |

## C5 · 일본 Instagram 중심

### 1회차 — 정상 업무

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| UGC/IG 지원 확인 | IG 캠페인 조건 | ‘Instagram’ 표시 | creator-v8-terms ‘고정비 100 USD · Instagram’ | 통과 |
| 플랫폼 프로필 | IG 계정으로 합의 | IG 핸들 저장(TikTok 아님) | creator-v8-terms 스냅샷, `test_basic_tiktok_ownership_does_not_require_username` | 통과 |
| 샘플·고정비 조건 | 고정비 USD | 합의 금액 표시 | creator-v8-terms ‘받을 보상’ | 통과 |
| 신청·합의 | 합의 | 스냅샷 | creator-v8-terms | 통과 |
| IG 게시 증빙 | 릴스 링크 제출 | content_submitted | creator-v8-terms ‘영상 성공’ | 통과(게시 진위 확인은 미실행(외부)) |

### 2회차 — 예외·운영

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| Spark 미해당 | IG 합의 건 | Spark 칸 없음(캠페인이 TikTok 으로 바뀌어도) | creator-v8-terms, terms-fingerprint, `test_spark_follows_agreed_platform_both_directions` | 통과 |
| 미지원 안내 | YouTube 선택 | ‘YouTube 는 아직 지원하지 않아요’ | console 3단계 플랫폼 안내 | 통과(화면) |
| 담당자 무응답 | DM 미답 | 브랜드 홈 ‘답장 필요’ | console-v8 홈·DM | 통과 |
| 브랜드 탈퇴 | — | — | — | v8.1 미노출(크리에이터 탈퇴 기능 없음) |
| 보상·자료 요청 | DM·받을 보상 | 기록 유지 | creator-v8-history | 통과 |

## A1 · 최종 운영 책임자

### 1회차 — 정상 업무

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 오늘의 큐 | 대시보드·메뉴 배지 | 신청·신고·분쟁·검수 대기 수 | admin-v8 셸 | 통과 |
| 고객 승인·초대 | 브랜드 신청 승인, 계정 초대 링크 | 링크만 발급(자동 발송 없음) | `test_application_approve_flow`, `test_reset_link_expiry_reuse_and_revocation` | 통과 |
| 발송 준비 | 공용 모집 5단계, 발신 200개 | 200 상한·초과 선택 불가·서버 미리보기 | admin-v8 4단계 5건, `test_200_sender_accounts_select_distribute_and_draft` | 통과 |
| 회신 지원 | 계정별 메일함·CRM 답장 초안 | 승인 전 미발송 | `test_reply_requires_explicit_approval_and_original_gmail_thread` | 통과 · 운영 메일 미실행(외부) |
| 제출 검수 | 검수 현황 | 협업 제출 버전·브랜드 상태 함께 | admin-v8 ‘D03’, `test_collab_submission_is_same_record_in_admin_review` | 통과 |
| 비용·성과 | 비용·성과 | 서버 집계, 미확인 표시 | admin-v8 ‘비용·성과’ | 통과 |

### 2회차 — 예외·운영

| 단계 | 실제 행동 | 기대 결과 | 증거 | 결과 |
|---|---|---|---|---|
| 연동 오류·결과 불명 | Gmail 운영 상태·결과 모름 | 재연결 필요·동기화 지연·재발송 없음 | admin-v8 Gmail 3건, `test_unknown_reply_send_is_not_retried` | 통과 |
| 조회 500 | 신고 목록 500 강제 | ‘불러오지 못했어요 · 0건이 아니에요’ | admin-v8 ‘D07’ | 통과 |
| 개인정보 신고 → 실제 숨김·제한 | 7일 제한 조치 | 멤버 화면에서 숨김·작성자 403·만료 해제 | admin-v8 ‘신고: 7일 제한’, `test_report_actions_have_real_effects_and_restore` | 통과 |
| 복구 | 처리한 신고 → 복구 | 다시 보임·글쓰기 가능 | admin-v8 ‘신고: 복구’ | 통과 |
| 지급 분쟁·이의 | 분쟁 판정 | 판정 확정 | admin 분쟁 화면 | 통과(판정) · 이의 1회·총괄 절차(D06)는 범위 밖 |
| 권한 회수 | 계정 중지·세션 철회·역할 변경 | 즉시 로그아웃 | `test_suspend_resume_and_session_revoke`, `test_role_change_revokes_open_links_both_paths` | 통과 |

---

## 이 환경에서 실행하지 않은 구간(모아 보기)

- TikTok 실제 소유 인증·게시 진위 확인
- 운영 메일 발송·Gmail OAuth 연결
- 실결제·수금·실지급
- TikTok Shop 판매·조회 연동
- 실제 AI 키로 초안 생성
  - 미연결 실오류 화면과 가짜 클라이언트 API 테스트로만 확인했어요.

## 미확인으로 남은 v8.1 노출 경로

- 브랜드 콘솔 후보 근거 화면
- 회신 대기 시간 표시
- 크리에이터 ‘캠페인 0’ 빈 상태
- 태국 주소·번역 화면 표시
- 현지 시각 마감 표시
