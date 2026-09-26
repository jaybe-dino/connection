#!/usr/bin/env bash
# 오픈 준비 확인 — 운영(또는 임의 배포)에 대한 읽기 전용 스모크.
# 개발 샌드박스는 운영 도메인 접근이 차단되어 있으므로, 이 스크립트는
# 소유자/Codex가 자기 머신에서 실행한다. 부작용 없는 GET만 수행한다.
#
#   bash scripts/ops/open-check.sh                     # 운영 기본 URL
#   API=http://localhost:8765 CONSOLE=http://localhost:5174 \
#   APP=http://localhost:5175 SITE=http://localhost:5177 \
#     bash scripts/ops/open-check.sh                   # 로컬 스택 검증
#
# 선택: EXPECT_COMMIT=<git sha 앞 12자리> 를 주면 배포 커밋 일치까지 확인.
set -u
API="${API:-https://api.theprlist.net}"
CONSOLE="${CONSOLE:-https://console.theprlist.net}"
APP="${APP:-https://app.theprlist.net}"
SITE="${SITE:-https://theprlist.net}"
EXPECT_COMMIT="${EXPECT_COMMIT:-}"

fail=0
ok()   { printf 'PASS %s\n' "$1"; }
bad()  { printf 'FAIL %s%s\n' "$1" "${2:+ — $2}"; fail=1; }
get()  { curl -sS -m 20 "$1" 2>/dev/null; }

# ── 1. API 상태 + 배포 커밋 ──────────────────────────────────────
health=$(get "$API/health")
echo "$health" | grep -q '"ok":true' && ok "API /health ok" || bad "API /health ok" "$health"
echo "$health" | grep -q '"db":"ok"' && ok "DB 연결" || bad "DB 연결" "$health"
commit=$(echo "$health" | sed -n 's/.*"commit":"\([^"]*\)".*/\1/p')
if [ -n "$EXPECT_COMMIT" ]; then
  [ "$commit" = "${EXPECT_COMMIT:0:12}" ] && ok "배포 커밋 일치 ($commit)" \
    || bad "배포 커밋 일치" "기대 ${EXPECT_COMMIT:0:12} / 실제 ${commit:-（없음 — 구버전 배포）}"
else
  echo "INFO 배포 커밋: ${commit:-미노출(구버전 /health — 재배포 필요)}"
fi

# ── 2. 정적 표면: 최신 엔진 반영(P0 마커) ────────────────────────
check_engine() { # $1=이름 $2=베이스URL $3..=필수 마커
  local name="$1" base="$2"; shift 2
  local html hash js
  html=$(get "$base/")
  hash=$(echo "$html" | sed -n 's/.*engine-live\.js?v=\([0-9a-f]*\).*/\1/p' | head -1)
  [ -n "$hash" ] || { bad "$name 엔진 버전 태그" "index.html에서 engine-live 해시를 못 찾음"; return; }
  js=$(get "$base/engine-live.js?v=$hash")
  local m missing=""
  for m in "$@"; do echo "$js" | grep -qF "$m" || missing="$missing $m"; done
  [ -z "$missing" ] && ok "$name 최신 엔진(P0 마커) 반영 (v=$hash)" \
    || bad "$name 최신 엔진 반영" "누락 마커:$missing (구버전 배포)"
}
check_engine "콘솔"        "$CONSOLE" "CONNECTION_ADMIN_BRAND" "adminPickBrand" "inboxToggleAll" "브랜드를 먼저 선택하세요"
check_engine "크리에이터 앱" "$APP"     "CONNECTION_ADMIN_BRAND" "magicForward"

# ── 3. 소개 사이트: 매직링크 전달 코드 반영 ──────────────────────
sjs=$(get "$SITE/site.js")
echo "$sjs" | grep -q "magic-forward" && ok "site.js 매직 전달 반영" || bad "site.js 매직 전달 반영" "구버전 배포"
mf=$(get "$SITE/magic-forward.js")
echo "$mf" | grep -q "app.theprlist.net" && ok "magic-forward.js 서빙" || bad "magic-forward.js 서빙"

# ── 4. 러너 잡 상태(공개 읽기): 동기화 켜짐 + 자동 발송 차단 ─────
rs=$(get "$API/runner/status")
job_reason() { echo "$rs" | sed -n "s/.*\"$1\":{\"enabled\":[a-z]*,\"reason\":\"\([^\"]*\)\".*/\1/p"; }
echo "$rs" | grep -q '"sync":{"enabled":true' && ok "러너 수신 동기화 활성" \
  || bad "러너 수신 동기화 활성" "사유: $(job_reason sync) (GMAIL_OPS_ENABLED/RUNNER_ENABLED/Google 키 확인)"
echo "$rs" | grep -q '"sendResume":{"enabled":false' && ok "승인 자동 발송 차단(SEND_RESUME=0)" \
  || bad "승인 자동 발송 차단" "사유: $(job_reason sendResume) — GMAIL_SEND_RESUME_ENABLED=0 설정 확인"
echo "$rs" | grep -q '"countersSince"' && ok "카운터 기준 시각 노출" || bad "카운터 기준 시각 노출"

echo
if [ "$fail" = 0 ]; then echo "== 자동 확인 전부 통과 =="; else echo "== 실패 항목 있음 — 위 FAIL 참조 =="; fi
cat <<'MANUAL'

수동 확인(자동화 불가 — 사람이 브라우저/메일함으로):
 1) 매직링크 실메일: app.theprlist.net 미로그인 상태에서 이메일 입력 →
    수신 메일 링크가 app.theprlist.net으로 열리고 1회 클릭에 로그인,
    새로고침 후에도 유지, 같은 링크 재클릭은 만료 안내.
 2) 관리자 콘솔: 로그인 → 브랜드 선택 화면 → 실브랜드 선택 →
    Gmail/인박스/청구가 같은 브랜드로 표시, "전환"으로 데모(glowlab)는
    명시 선택 시에만.
 3) 어드민 Gmail 운영 화면: 동기화 카운터 증가·"오래됨" 경고 해소.
 4) 재설정 메일 1회: 브랜드 계정으로 /account.html 재설정 요청 → 수신
    → 새 비밀번호 → 재로그인.
MANUAL
exit "$fail"
