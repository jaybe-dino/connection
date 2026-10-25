/* 개선 번호 검토 시안 — 정적·오프라인 전용. 네트워크 요청·실제 저장·발송 없음.
   데이터 원본은 improvements.json / coverage.json 이며, file:// 에서도 열리도록
   tools/embed_data.py 가 아래 마커 사이에 같은 내용을 넣는다. */
/*__DATA_START__*/
const IMPROVEMENTS = [{"number": "01", "id": "B01", "role": "브랜드", "title": "홈을 오늘 끝낼 업무 중심으로 바꾸기", "job": "출근한 담당자가 지금 처리해야 하는 회신·선정·배송·검수를 정하고 바로 시작한다.", "screen": "브랜드 홈 → 오늘의 업무", "ui": ["상단에 선택 브랜드·담당자·기준 시간대 고정", "내 회신 대기 / 결과 약속 임박 / 주소 누락 / 출고 대기 / 검수 대기 / 지급 확인 필요를 건수와 가장 오래된 대기시간으로 표시", "카드 클릭 시 해당 조건이 적용된 업무 목록으로 이동. 목록에는 크리에이터·캠페인·다음 행동·담당자·마감 표시", "첫 이용자는 숫자 대시보드 대신 제품→조건→모집 준비 체크리스트 표시"], "depends": ["X01", "X04"], "roleKey": "brand", "easyName": "오늘 할 일 먼저 보기", "pain": "홈에 숫자만 있어 무엇부터 처리할지 직접 찾아야 합니다.", "proposal": {"role": "brand", "screen": "b-today", "hotspot": "hs-B01"}}, {"number": "02", "id": "B02", "role": "브랜드", "title": "국가·협업 목적별 시작 준비도", "job": "미국 TikTok Shop 매출 캠페인을 열 수 있는지, 입점 전에는 무엇부터 해야 하는지 판단한다.", "screen": "가입 후 첫 설정 → 진출 준비", "ui": ["첫 질문은 대상 국가·목표(판매/UGC/체험/라이브)·Shop 판매 준비 상태", "판매 주체·상품 연결·현지 배송/반품·판매 가능 재고·담당자·사용 언어를 항목별 미입력/검토/확인으로 표시", "막힌 항목에 이유·준비 자료·담당자·다음 행동 표시", "Shop 미준비 사용자는 정보 수집·콘텐츠 파일럿 준비로 이어지되 판매 가능하다고 표시하지 않는다"], "depends": ["X01"], "roleKey": "brand", "easyName": "시작 준비 확인", "pain": "미국 판매를 바로 열 수 있는지, 무엇이 막혔는지 알기 어렵습니다.", "proposal": {"role": "brand", "screen": "b-today", "hotspot": "hs-B02"}}, {"number": "03", "id": "B03", "role": "브랜드", "title": "제품 정보를 실제 초대·제안에 쓸 수 있게 완성", "job": "제품을 등록한 뒤 크리에이터가 받는 이미지·설명·제안을 직접 확인한다.", "screen": "제품 상세 → 공개 소개·내부 가이드·미리보기", "ui": ["목록을 사진/상품명/국가/제안 커미션/초대 준비 상태/마지막 검토일로 구성", "공개 제품 이미지·판매 링크·한 줄 설명과 내부 금지표현·샘플 기준·AI 참고자료를 구분", "초대 페이지와 메일에 실제 사용되는 정보 미리보기. 번역별 누락 표시", "공개할 제품 설명과 이미지가 없으면 보완 또는 명시적 미완성 상태로 처리"], "depends": ["X01"], "roleKey": "brand", "easyName": "제품 소개 미리보기", "pain": "크리에이터가 실제로 받는 사진·설명을 발송 전에 확인할 수 없습니다.", "proposal": {"role": "brand", "screen": "b-create", "hotspot": "hs-B03"}}, {"number": "04", "id": "B04", "role": "브랜드", "title": "캠페인 생성을 한 흐름으로 통합", "job": "샘플 20개로 미국 크리에이터를 모집하면서 얼마를 약속하고 언제까지 무엇을 받아야 하는지 정한다.", "screen": "제품·캠페인 → 새 캠페인 5단계", "ui": ["①제품·국가·플랫폼·목적 ②보상·샘플·예산 ③납품물·일정·권리 ④지원 자격·질문 ⑤크리에이터 관점 미리보기", "보상 유형별 입력: 기프트는 제품/비용 부담, 고정비는 금액/통화/지급 기준, 제휴는 기준 커미션/별도 광고 커미션/플랫폼 확인 상태", "정원·샘플 수량·수락 기한·배송 목표·게시 목표·검수 응답 기한을 구분. 콘텐츠 기한은 수령 후 N일 방식도 제공", "초안 저장/미리보기/발행을 구분하고 발행 전 대상 멤버·언어·알림 범위를 보여준다"], "depends": ["B02", "B03", "X02"], "roleKey": "brand", "easyName": "협업 만들기 5단계", "pain": "보상·샘플·기한·광고권을 여러 화면에서 따로 정해 빠뜨리기 쉽습니다.", "proposal": {"role": "brand", "screen": "b-create", "hotspot": "hs-B04"}}, {"number": "05", "id": "B05", "role": "브랜드", "title": "후보 추천을 검토·선정 작업대까지 연결", "job": "우리 제품을 실제로 소개할 만한 후보 20명을 이유를 이해하고 고른다.", "screen": "후보 → 추천/보유 명단/검토 목록", "ui": ["국가·언어·플랫폼·카테고리·규모·최근 활동·연락 가능 상태 필터", "카드에 최근 관련 게시 링크·제품/카테고리 실제 일치 근거·출처·조회일·미확인 값 표시", "이미 접촉/회신/샘플/미지급/수신거부 여부를 함께 표시", "추천 이유 펼치기→보류/제외 이유→선택 목록→제안 작성으로 이어진다"], "depends": ["B03", "B07", "X04"], "roleKey": "brand", "easyName": "추천 이유 보고 고르기", "pain": "추천 후보가 왜 맞는지, 이미 연락했는지 한눈에 알 수 없습니다.", "proposal": {"role": "brand", "screen": "b-invite", "hotspot": "hs-B05"}}, {"number": "06", "id": "B06", "role": "브랜드", "title": "대량 메일을 준비→검수→실행으로 분리", "job": "보유 후보 200명에게 제품별 제안을 준비하고 제외 이유와 실제 발송 상태를 이해한다.", "screen": "아웃리치 → 연결/대상/내용/검수/실행 5단계", "ui": ["발신 연결 상태와 마지막 수신/송신 성공을 먼저 요약", "CSV/시트는 컬럼 매핑→오류 행/중복/거부/최근 접촉 제외 이유→최종 대상 수 미리보기", "수신자별 치환된 제품·선정 이유·제목·링크를 표본 검토. 비어 있는 변수는 경고", "실행 화면은 승인자·대상 버전·대기/시도/접수/실패/결과불명·중지/재개를 표시"], "depends": ["B03", "X01", "A06"], "roleKey": "brand", "easyName": "대량 메일 준비→검수→발송", "pain": "몇 명이 왜 빠졌고 실제로 몇 통이 나갔는지 확인하기 어렵습니다.", "proposal": {"role": "brand", "screen": "b-invite", "hotspot": "hs-B06"}}, {"number": "07", "id": "B07", "role": "브랜드", "title": "메일·DM을 캠페인 관계와 다음 행동에 연결", "job": "가격 문의·샘플 문의·거절이 섞인 회신 중 누가 언제 무엇을 답해야 하는지 처리한다.", "screen": "회신함 → 내 업무/미배정/기한 초과 → 대화 상세", "ui": ["왼쪽 회신 우선순위, 중앙 원문·번역, 오른쪽 제품/캠페인·조건·현재 단계·담당자·다음 행동", "관심/가격 질문/주소 요청/거절/부재/반송/기타를 수정 가능한 분류로 표시", "다른 직원이 작성 중이면 표시하고 발송 전 최신 대화·답변 여부 재확인", "브랜드 공통 DM에 여러 캠페인 카드 연결. 이메일 주소가 같다는 이유만으로 사람·캠페인을 자동 병합하지 않는다"], "depends": ["X01", "X02"], "roleKey": "brand", "easyName": "답장을 협업과 함께 보기", "pain": "회신마다 어떤 협업인지, 누가 답해야 하는지 따로 찾아야 합니다.", "proposal": {"role": "brand", "screen": "b-reply", "hotspot": "hs-B07"}}, {"number": "08", "id": "B08", "role": "브랜드", "title": "지원자 검토·선정·결과 통보를 닫기", "job": "지원자 100명 중 20명을 고르고 나머지에게도 결과를 설명하며 중복 선정과 정원 초과를 막는다.", "screen": "캠페인 상세 → 지원자 검토", "ui": ["지원자 비교: 최근 관련 콘텐츠·자발적 관심사·국가·자격·지원 시점·과거 협업·동의한 조건", "미검토/질문/보류/선정 제안/미선정/철회 상태와 담당자·결과 약속 시각 표시", "선정은 제안이며 양측 합의 전 확정/출고로 표시하지 않음", "결과 문구 미리보기와 개별/선택 묶음 통보. 미선정 재검토는 이유·변경 이력·새 수락 기한 표시"], "depends": ["B04", "C04", "X03"], "roleKey": "brand", "easyName": "지원자 고르고 결과 알리기", "pain": "선정·미선정 결과를 알리지 못하거나 정원을 넘길 위험이 있습니다.", "proposal": {"role": "brand", "screen": "b-invite", "hotspot": "hs-B08"}}, {"number": "09", "id": "B09", "role": "브랜드", "title": "샘플 출고·수령·지연을 함께 운영", "job": "조건 합의된 20명에게 주소를 확인해 보내고 지연·분실이 콘텐츠 일정에 미치는 영향을 처리한다.", "screen": "샘플 보드 → 주소 확인/출고/배송 예외", "ui": ["동의된 주소/누락/수정 요청/출고 준비/발송/수령 확인/지연·분실을 다른 열로 표시", "최소 주소 접근 권한. 라벨/출고 파일에는 목적과 다운로드 기록, 주소 변경 시 최신 버전 확인", "운송사·송장·발송일·예상 도착·실수령일·샘플 원가·배송비·비용 부담자 저장", "수령 후 N일 게시 조건은 실제 수령 기준 계산. 배송 지연 시 양측 기한 변경 요청"], "depends": ["X01", "X02", "C07"], "roleKey": "brand", "easyName": "샘플 배송 한 보드에서 관리", "pain": "주소 누락·지연이 영상 기한에 어떤 영향을 주는지 보이지 않습니다.", "proposal": {"role": "brand", "screen": "b-samples", "hotspot": "hs-B09"}}, {"number": "10", "id": "B10", "role": "브랜드", "title": "콘텐츠 검수에 실제 기준·수정 이력·권리 연결", "job": "크리에이터가 제출한 영상을 보고 어떤 부분을 몇 번까지 수정 요청하며 게시/광고에 쓸 수 있는지 판단한다.", "screen": "캠페인 → 제출물 검수 상세", "ui": ["브리프/합의 버전·납품물·영상/게시 링크·캡션·수정 이력·권리 상태를 같은 화면에 표시", "통과/수정 요청/확인 보류를 분리하고 수정은 구간·이유·필수/권장·기한·횟수를 입력", "영상 미확인/링크 접근 실패/자동 체크 미실행을 각각 표시", "브랜드 검수 통과·실게시 확인·광고권 유효·지급 확인을 별도 배지로 표시"], "depends": ["X01", "X02", "A03"], "roleKey": "brand", "easyName": "영상 검수와 수정 요청", "pain": "수정 횟수·광고 사용 가능 여부를 영상과 따로 확인해야 합니다.", "proposal": {"role": "brand", "screen": "b-samples", "hotspot": "hs-B10"}}, {"number": "11", "id": "B11", "role": "브랜드", "title": "커뮤니티를 브랜드가 실제 운영할 수 있는 콘솔", "job": "신규 멤버를 맞고 질문을 해결하며 공지·참여 기회를 운영한다.", "screen": "커뮤니티 → 회원/질문/공지/운영", "ui": ["회원 목록: 가입일·자발적 관심 제품·국가/언어·협업 단계·최근 기여·휴면·다음 접점", "처음에는 시작 안내/질문/콘텐츠 팁 소수 채널. 공지에는 대상·언어·예약일·연결 캠페인·확인 상태", "질문을 미답변→담당자 배정→해결/FAQ로 전환하고 답변의 원문 위치로 돌아간다", "브랜드 모더레이터/멘토 역할과 공정한 참여 프로그램. 개인 성과·보수·주소는 공개 랭킹에서 제외"], "depends": ["A04", "X01"], "roleKey": "brand", "easyName": "커뮤니티 운영", "pain": "질문이 답 없이 남고 공지를 누가 봤는지 알 수 없습니다.", "proposal": {"role": "brand", "screen": "b-community", "hotspot": "hs-B11"}}, {"number": "12", "id": "B12", "role": "브랜드", "title": "AI 회신·커뮤니티 운영 초안을 검토 가능한 업무로", "job": "반복 질문과 주간 운영을 줄이되 제품 조건·효능·지급을 임의 약속하지 않는다.", "screen": "AI 업무함 → 질문 답변/회신 초안/주간 운영", "ui": ["미답변 질문 묶음→근거 있는 FAQ 답변→담당자 검토/수정→게시", "메일은 사용자가 허용한 대화 발췌만 선택하고 제공자·전달 범위 확인 후 초안 생성", "주간 요약은 신규 합류·진행 기회·우수 콘텐츠·자주 묻는 질문·다음 주 일정을 실제 근거 링크와 함께 제안", "초안마다 사용한 브랜드 문서/캠페인 조건 버전·모르는 내용·승인자 표시"], "depends": ["B07", "B11", "X02", "A06"], "roleKey": "brand", "easyName": "AI 초안은 검토 후 보내기", "pain": "AI 문장이 조건·지급을 잘못 약속할까 봐 쓰기 어렵습니다.", "proposal": {"role": "brand", "screen": "b-reply", "hotspot": "hs-B12"}}, {"number": "13", "id": "B13", "role": "브랜드", "title": "성과를 근거와 비용으로 보고 재협업 연결", "job": "이번 캠페인이 돈과 시간을 들인 만큼 가치가 있었는지 판단하고 다음 파트너를 고른다.", "screen": "성과 → 캠페인/국가/크리에이터 → 다음 제안", "ui": ["지원/합의/실수령/검수/실게시/주문/반품/지급을 분리한 전환 흐름", "제품·고정비·권리비·물류·광고·수수료·운영 인건비와 매출/수금/기여이익을 구분", "CSV import는 컬럼/기간/통화/원본/중복 미리보기. 지표에서 근거 행까지 이동", "반복 협업 후보는 성과뿐 아니라 약속 준수·기여·양측 만족·미지급·권리 만료를 함께 제시"], "depends": ["B09", "B10", "X01"], "roleKey": "brand", "easyName": "결과와 비용 함께 보기", "pain": "실제 게시·판매와 들어간 비용을 한곳에서 비교할 수 없습니다.", "proposal": {"role": "brand", "screen": "b-results", "hotspot": "hs-B13"}}, {"number": "14", "id": "B14", "role": "브랜드", "title": "대행사·고객사 공동 운영", "job": "대행사 실무자가 여러 고객을 운영하면서 고객 승인이 필요한 예산·캠페인·발송을 올린다.", "screen": "조직 → 고객 브랜드 → 팀/승인함/비용", "ui": ["헤더에 조직·현재 고객 브랜드를 항상 표시하고 허용된 브랜드만 전환", "실무자/승인자/조회자별 메뉴와 데이터 범위. 외부 고객용 읽기 화면", "발행·초과 예산·일괄 발송·광고권 변경의 요청→보완→승인/거절 흐름", "브랜드별 예산·운영 서비스 비용·담당자·요청 기한·주간 리포트"], "depends": ["A07", "X01"], "roleKey": "brand", "easyName": "대행사·고객사 승인", "pain": "어떤 고객 브랜드에서 일하는지, 누구 승인이 필요한지 헷갈립니다.", "proposal": {"role": "brand", "screen": "b-team", "hotspot": "hs-B14"}}, {"number": "15", "id": "C01", "role": "크리에이터", "title": "초대에서 참여 여부를 판단할 수 있게", "job": "처음 받은 링크에서 믿을 만한 브랜드인지, 무엇을 받으며 무엇을 해야 하는지 판단한다.", "screen": "로그인 전 브랜드·제품 초대", "ui": ["제품 실제 사진·브랜드 설명·보상 방식·샘플 유/무·배송 대상·콘텐츠 종류/수량·게시 기한·광고권 여부 요약", "커뮤니티 가입/캠페인 지원/선정/조건 합의의 차이를 짧게 표시", "주요 행동을 조건 보기→참여/지원으로 구성. 기존 회원은 로그인 후 원래 제안으로 복귀", "국가/플랫폼 자격 미충족 시 이유와 가능한 다음 기회를 안내"], "depends": ["B03", "B04", "C10"], "roleKey": "creator", "easyName": "초대 링크에서 조건 먼저 보기", "pain": "로그인 전에 무엇을 받고 무엇을 해야 하는지 알기 어렵습니다.", "proposal": {"role": "creator", "screen": "c-campaigns", "hotspot": "hs-C01"}}, {"number": "16", "id": "C02", "role": "크리에이터", "title": "가입·자격을 플랫폼별로 이해하고 완료", "job": "나노 TikTok·태국 크리에이터·Instagram 사용자 각각 자신에게 가능한 협업을 알아보고 가입한다.", "screen": "로그인→프로필→자격→브랜드 합류", "ui": ["선호 언어·국가를 선택하고 계정/플랫폼은 목적별로 추가", "계정 소유 확인·Shop affiliate 자격·브랜드 참여 가능·특정 캠페인 자격을 별도 표시", "승인 대기에는 예상 안내/문의·진행 가능한 준비 업무 제공", "비틱톡 UGC 경로는 별도 정책·증거·수동 검토를 설계한 뒤 제공. 인증 우회로 처리하지 않음"], "depends": ["B02", "X01"], "roleKey": "creator", "easyName": "가입·참여 자격 확인", "pain": "내 계정으로 어떤 협업에 참여할 수 있는지 알기 어렵습니다.", "proposal": {"role": "creator", "screen": "c-profile", "hotspot": "hs-C02"}}, {"number": "17", "id": "C03", "role": "크리에이터", "title": "나에게 맞는 캠페인을 찾고 비교", "job": "여러 브랜드 중 내 국가·플랫폼·시간·보상 조건에 맞는 기회를 찾는다.", "screen": "캠페인 → 필터/저장/상세 비교", "ui": ["참여 브랜드 전체와 현재 브랜드 범위를 명시. 국가·플랫폼·보상·샘플·마감·소요 작업 필터", "카드에 확정된 범위만 요약: 금액/커미션·통화·샘플 비용·콘텐츠 수·기한·권리 요청", "미자격 캠페인은 이유와 프로필 수정/다음 기회 경로", "0건은 현재 브랜드 0/필터 0/미참여/오류를 구분하고 필터 해제·브랜드 문의·알림 상태로 연결"], "depends": ["B04", "X04"], "roleKey": "creator", "easyName": "나에게 맞는 협업 찾기", "pain": "조건이 맞지 않는 협업도 섞여 있고 0건일 때 이유를 모릅니다.", "proposal": {"role": "creator", "screen": "c-campaigns", "hotspot": "hs-C03"}}, {"number": "18", "id": "C04", "role": "크리에이터", "title": "신청 기록·결과·철회를 끝까지 보존", "job": "신청이 접수됐는지, 언제 결과가 오는지 확인하고 여건이 바뀌면 철회한다.", "screen": "내 협업 → 전체 신청 이력 → 신청 상세", "ui": ["접수 시 신청번호·제출 시각·조건 버전·결과 예정일·현재 담당자/문의 경로 표시", "전체/검토중/선정 제안/미선정/철회/마감 탭. 모집 마감 이후에도 기록 유지", "검토 지연은 새 예상 시각과 이유. 미선정 사유는 공개 가능한 범위만 안내", "선정 전 철회 및 선정 후 참여 취소 요청을 구분. 취소 영향은 확인 화면에 표시"], "depends": ["X01", "X03"], "roleKey": "creator", "easyName": "신청 기록 남기기", "pain": "마감 후 신청 기록이 사라지고 결과가 언제 오는지 모릅니다.", "proposal": {"role": "creator", "screen": "c-tasks", "hotspot": "hs-C04"}}, {"number": "19", "id": "C05", "role": "크리에이터", "title": "보상·사용권 합의와 질문을 명확하게", "job": "선정 제안의 금액·일정·광고 사용 범위를 읽고 수락/질문/거절한다.", "screen": "내 협업 → 조건 확인", "ui": ["보상·통화·지급 주체/기준/예정일·샘플 비용·배송·납품물·수정 횟수를 접지 않고 요약", "유기 게시/광고 사용/Spark 코드/원본 파일/독점 조건을 별도 구역으로 표시", "원문과 번역·버전·변경점을 나란히 보고 질문/수정 제안/수락/거절 선택", "Spark 입력은 해당 광고권에 합의한 경우에만 요청하고 만료/철회 상태 안내"], "depends": ["X02", "B04"], "roleKey": "creator", "easyName": "보상·광고 사용 조건 확인", "pain": "금액·광고 사용 범위가 접혀 있어 수락 전에 놓치기 쉽습니다.", "proposal": {"role": "creator", "screen": "c-tasks", "hotspot": "hs-C05"}}, {"number": "20", "id": "C06", "role": "크리에이터", "title": "내 할 일을 실제 기한과 책임으로 정렬", "job": "퇴근 후 10분 안에 오늘 할 일과 브랜드 답변을 기다리는 일을 구분한다.", "screen": "내 할 일 → 전체 브랜드 일정/협업 카드", "ui": ["내 행동 필요/브랜드 대기/배송 대기/분쟁·지원 중을 구분", "오늘·기한 임박·기한 초과·예정 없음 정렬과 브랜드 필터", "협업 카드마다 다음 행동 하나·책임자·현지 시각+시간대·문의 버튼", "배송 지연/수정 기한 연장 요청과 처리 상태 표시"], "depends": ["X01", "X03"], "roleKey": "creator", "easyName": "내 할 일과 기다리는 일 구분", "pain": "내가 할 일과 브랜드 답변을 기다리는 일이 섞여 있습니다.", "proposal": {"role": "creator", "screen": "c-tasks", "hotspot": "hs-C06"}}, {"number": "21", "id": "C07", "role": "크리에이터", "title": "국가별 수령 정보와 배송 문제 해결", "job": "태국/미국 주소를 제대로 입력하고 출고 전에 고치며 분실 시 도움을 받는다.", "screen": "협업 상세 → 샘플 수령 정보/배송 도움", "ui": ["국가 선택에 따라 우편번호·주/도·도시·상세주소·국가번호 라벨과 예시 제공", "주소는 협업별 확인하고 이전 주소 복사는 명시적 선택. 개인정보 전달 대상·목적 표시", "출고 전 수정/수정 요청 접수, 출고 후에는 담당자에게 변경 요청 경로", "운송사 추적 링크·확인 시각·실수령 확인·미수령/파손/통관 문제 신고"], "depends": ["X01", "X02"], "roleKey": "creator", "easyName": "주소 입력과 배송 도움", "pain": "국가별 주소 형식이 달라 틀리기 쉽고 분실 시 문의처가 없습니다.", "proposal": {"role": "creator", "screen": "c-tasks", "hotspot": "hs-C07"}}, {"number": "22", "id": "C08", "role": "크리에이터", "title": "제작본·게시본·수정본을 구분해 제출", "job": "게시 전 확인이 필요한 영상은 먼저 검토받고 피드백에 맞춰 수정한 뒤 실제 게시한다.", "screen": "협업 → 제작본 검토/게시 증빙 제출", "ui": ["캠페인별 사전 검토 필요 여부와 제출 단계 안내", "검토 링크/파일(지원 범위 명시)·캡션·플랫폼·게시 URL·원본 여부를 구분", "피드백은 이전 버전·영상 구간·필수/권장·잔여 수정 횟수·새 기한과 함께 표시", "제출 성공과 메모 DM 실패를 별도로 알리는 기존 동작 보존. 다시 제출하지 않고 메모만 재전송"], "depends": ["B10", "X01", "A03"], "roleKey": "creator", "easyName": "영상 제출·수정", "pain": "검토본·게시본·수정본을 어디에 내야 하는지 헷갈립니다.", "proposal": {"role": "creator", "screen": "c-tasks", "hotspot": "hs-C08"}}, {"number": "23", "id": "C09", "role": "크리에이터", "title": "받을 보상과 지급 상태를 추적", "job": "영상을 완료했을 때 누가 언제 얼마를 지급하는지 보고 문제가 있으면 문의한다.", "screen": "협업 상세 → 보상 기록", "ui": ["브랜드 고정 보수·TikTok/Shopify 제휴 수익·기프트·플랫폼 이용료를 별도 표시", "약정 금액/산식·통화·지급 주체·조건·예정일·검수/주문 확정·지급 확인 상태", "실송금 기능이 없는 동안 담당자·수동 지급 증빙·확인 요청 경로 제공", "미지급/금액 차이/주문 반품 조정은 항목별 근거와 분쟁 접수"], "depends": ["X02", "A05"], "roleKey": "creator", "easyName": "받을 보상 확인", "pain": "지급 대기와 지급 완료가 구분되지 않아 언제 받는지 모릅니다.", "proposal": {"role": "creator", "screen": "c-rewards", "hotspot": "hs-C09"}}, {"number": "24", "id": "C10", "role": "크리에이터", "title": "전체 핵심 여정의 언어·모바일·키보드 완성", "job": "한국어를 모르는 사용자가 휴대폰으로 조건 확인부터 제출/문의까지 끝낸다.", "screen": "공개 초대·로그인·캠페인·협업·설정·에러 전 구간", "ui": ["UI 언어와 메시지 번역 언어를 별도 선택·보존. th/vi/ja 미지원 UI는 English fallback 명시", "금액·날짜·시간대·전화·주소 라벨을 locale에 맞게 표시", "390px에서 주요 행동 44px, 입력 키보드가 열린 경우 제출·오류가 가려지지 않음", "중복 제목/도움말을 줄이고 키보드 포커스/모달 닫기·오류 필드 이동 지원"], "depends": ["X04", "X05"], "roleKey": "creator", "easyName": "언어·모바일·키보드", "pain": "휴대폰이나 다른 언어에서 버튼이 가려지거나 문장이 섞입니다.", "proposal": {"role": "creator", "screen": "c-profile", "hotspot": "hs-C10"}}, {"number": "25", "id": "C11", "role": "크리에이터", "title": "커뮤니티가 다음 기회와 도움으로 이어지게", "job": "채팅을 많이 쓰는 것보다 좋은 답변·성공 경험·다음 캠페인 때문에 다시 방문한다.", "screen": "커뮤니티 → 시작 안내/질문/주간 소식/기회", "ui": ["첫 방문에는 환영·운영 시간·질문 방법·가용 기회 1개를 제시", "캠페인 게시 시 커뮤니티에 머물러도 새 기회가 표시되고 상세로 이동", "미션은 지금 가능/선행 조건 대기/달성으로 구분. 기다릴 때 문의·알림 상태·학습 자료 제공", "기여 XP·우수 콘텐츠·매출 성과는 구분. 신규 참여 기회·랭킹 비노출 선택·멘토 역할"], "depends": ["B11", "X03"], "roleKey": "creator", "easyName": "커뮤니티에서 다음 기회 보기", "pain": "커뮤니티에 머물러도 새 협업이나 도움으로 이어지지 않습니다.", "proposal": {"role": "creator", "screen": "c-community", "hotspot": "hs-C11"}}, {"number": "26", "id": "C12", "role": "크리에이터", "title": "도움·신고·분쟁·탈퇴를 실제 접수 업무로", "job": "답변이 없거나 지급/콘텐츠 분쟁이 생겨도 창구와 처리 상태를 알 수 있다.", "screen": "공통 도움말 → 문의/메시지 신고/협업 분쟁/계정", "ui": ["현재 캠페인/메시지/지급 건에서 문제 유형 선택→상황/근거→접수번호·예상 응답 표시", "브랜드 탈퇴와 계정 삭제·진행 협업 취소·수신거부를 구분", "긴급 공개 개인정보 신고·차단은 전사 운영으로 이관", "내 문의에서 담당자·답변·다음 일정·재문의/이의 가능 여부 확인"], "depends": ["A04", "A05", "X03"], "roleKey": "creator", "easyName": "도움·신고 접수", "pain": "문의가 접수됐는지, 언제 답이 오는지 알 수 없습니다.", "proposal": {"role": "creator", "screen": "c-messages", "hotspot": "hs-C12"}}, {"number": "27", "id": "A01", "role": "관리자", "title": "전사 대기열을 다음 조치가 있는 운영 화면으로", "job": "16개 브랜드를 관리하는 책임자가 사고·지연·발송 위험부터 처리한다.", "screen": "관리자 홈 → 운영 큐", "ui": ["긴급/기한 초과/미배정/고객별/연동 장애/청구 이슈를 한 목록에서 보기", "행에 고객 브랜드·업무 종류·대기시간·기한·담당자·막힌 이유·해결 경로", "카드 숫자를 누르면 같은 조건의 실제 대상이 열리도록 연결", "미구현 게이트는 처리 가능 버튼처럼 보이지 않게 하고 수동 담당·조치 기록 경로를 명시"], "depends": ["X01", "X04"], "roleKey": "admin", "easyName": "오늘 처리할 일 목록", "pain": "카드 숫자만 있어 실제 대상과 해결 방법을 따로 찾아야 합니다.", "proposal": {"role": "admin", "screen": "a-today", "hotspot": "hs-A01"}}, {"number": "28", "id": "A02", "role": "관리자", "title": "브랜드 승인에서 실제 첫 캠페인까지 추적", "job": "신청을 승인한 뒤 담당자가 초대를 열고 설정·캠페인 준비를 마쳤는지 관리한다.", "screen": "브랜드 신청 → 고객 활성화 체크리스트", "ui": ["관심 신청/본 신청/보완 요청/승인/초대 미전달/만료/설정 완료/첫 캠페인 준비를 구분", "보완 요청은 사유·담당자·기한·재제출 경로. 단순 거절로만 처리하지 않음", "초대 유효기간·전달 확인·수락 여부·재초대 기록", "브랜드 학습/공개 제품/발신 상태/테스트 완료를 고객별 준비도에 연결"], "depends": ["B02", "A07"], "roleKey": "admin", "easyName": "브랜드 시작 돕기", "pain": "승인 후 브랜드가 첫 협업까지 갔는지 추적되지 않습니다.", "proposal": {"role": "admin", "screen": "a-onboard", "hotspot": "hs-A02"}}, {"number": "29", "id": "A03", "role": "관리자", "title": "브랜드 제출과 전사 검수 기록을 일치", "job": "브랜드가 받은 제출물을 전사 운영도 같은 ID/버전으로 확인하고 누락 없이 지원한다.", "screen": "검수 현황 → 브랜드/상태/버전별 제출 상세", "ui": ["브랜드·캠페인·creator·상태·기한·검수자 필터와 전체/대기/보완/완료 이력", "브랜드 검수와 관리자 개입의 권한·역할 명시", "자동 체크가 실제 실행됐는지와 근거를 표시. 기본 문구로 이미 검사했다고 확정하지 않는다", "보완 요청 시 구체 사유·기한 입력, 원본 콘텐츠 링크/이전 버전/합의 조건 바로 보기"], "depends": ["X01"], "roleKey": "admin", "easyName": "영상 확인 기록 일치", "pain": "브랜드와 관리자가 보는 제출물 버전·상태가 다를 수 있습니다.", "proposal": {"role": "admin", "screen": "a-review", "hotspot": "hs-A03"}}, {"number": "30", "id": "A04", "role": "관리자", "title": "신고 조치가 실제 숨김·제한에 반영", "job": "괴롭힘/개인정보 게시를 처리했을 때 피해자가 실제 보호되고 조치 결과를 검증한다.", "screen": "신고 처리함 → 근거/조치/복구", "ui": ["신고 원문·전후 맥락·대상·범위·심각도·SLA·담당자·기존 조치 표시", "경고/해당 메시지 숨김/브랜드 내 제한/전사 제한을 명확히 구분", "조치 사유·기간·영향·통보 내용을 확인 후 실행. 재시도 중복 방지", "처리 완료와 실제 enforcement 적용을 별도 확인, 복구/만료/이의 이력 제공"], "depends": ["X01", "A07"], "roleKey": "admin", "easyName": "신고 조치 실제 적용 확인", "pain": "처리 완료로 바꿔도 실제 숨김·제한이 되었는지 알 수 없습니다.", "proposal": {"role": "admin", "screen": "a-reports", "hotspot": "hs-A04"}}, {"number": "31", "id": "A05", "role": "관리자", "title": "분쟁의 증거·1차 응답·이의 절차 구현", "job": "선정 번복·수정 횟수·지급 차이를 약속된 조건과 사실에 근거해 판정한다.", "screen": "분쟁 상세 → 접수/조사/응답/판정/이의", "ui": ["양측 주장·합의 버전·제출/수정/배송/지급 증빙을 같은 타임라인에 표시", "담당 배정·1차 응답·추가 자료 요청·기한 연장 이유·이해충돌 이관", "판정문은 사실/근거/판단/조치/이의 기한을 나누고 통보 미리보기", "약속한 이의 1회와 최종 판정자 권한, 당사자 결과 확인"], "depends": ["X01", "X02"], "roleKey": "admin", "easyName": "분쟁 증거와 판정", "pain": "양측 주장과 증빙이 흩어져 있어 판정 근거를 남기기 어렵습니다.", "proposal": {"role": "admin", "screen": "a-reports", "hotspot": "hs-A05"}}, {"number": "32", "id": "A06", "role": "관리자", "title": "연동 상태와 실제 메일·알림 실행을 관찰", "job": "연결됐다는 표기만 보고 발송했다가 회신/알림을 놓치는 상황을 막는다.", "screen": "연동·발송 상태 센터", "ui": ["계정별 인증/송신/수신 동기화/쿼터/차단·마지막 성공·다음 재시도·담당자를 구분", "메일/Gmail 내부 한도와 TikTok seller-country별 한도를 다른 항목으로 표시", "대기·제공자 접수·반송·실수신 증빙·회신을 구분. 결과 불명은 수동 검토 큐", "알림 runner/번역 queue 상태·실패 원인·복구 지침. 비밀값 비노출"], "depends": ["X03", "X04"], "roleKey": "admin", "easyName": "연결 상태 확인", "pain": "'연결됨' 표시만 믿고 보냈다가 회신·알림을 놓칠 수 있습니다.", "proposal": {"role": "admin", "screen": "a-connections", "hotspot": "hs-A06"}}, {"number": "33", "id": "A07", "role": "관리자", "title": "역할·위임·고객 데이터 접근 감사", "job": "브랜드·대행사·운영자가 필요한 업무만 수행하도록 권한을 관리한다.", "screen": "운영자·조직·브랜드 권한 관리", "ui": ["사람별 허용 브랜드·역할·민감정보 접근·최근 로그인·접근 기한", "운영 지원은 대상 브랜드·사유·기한이 있는 위임 세션과 종료", "주소/메일 본문/계약/지급 증빙 열람·다운로드를 별도 감사", "owner 이전·퇴사자 회수·담당자 재배정 미리보기"], "depends": ["X01"], "roleKey": "admin", "easyName": "사람·권한 관리", "pain": "누가 어떤 브랜드의 주소·메일을 볼 수 있는지 확인하기 어렵습니다.", "proposal": {"role": "admin", "screen": "a-people", "hotspot": "hs-A07"}}, {"number": "34", "id": "A08", "role": "관리자", "title": "전사 사업 지표와 고객 성과를 증거로 분리", "job": "활성 고객·실제 게시·재협업·운영시간·수금으로 사업이 유지되는지 판단한다.", "screen": "운영 리포트 → 고객/캠페인/cohort/수익성", "ui": ["저장/승인/첫 캠페인/첫 실게시/재협업 브랜드를 다른 단계로 표시", "후보 레코드·연락 이메일·본인 확인 계정·활성 크리에이터·게시자 구분", "브랜드 이용료 청구·실수납·creator 보수·실비·운영 시간·환불을 분리", "고객 리포트는 고객 데이터만, 테스트/데모 제외 스위치와 정의·기간·갱신 시각"], "depends": ["B13", "X01"], "roleKey": "admin", "easyName": "비용·성과 분리", "pain": "가입 수와 실제 게시·수금이 섞여 사업 상태를 판단하기 어렵습니다.", "proposal": {"role": "admin", "screen": "a-finance", "hotspot": "hs-A08"}}, {"number": "35", "id": "X01", "role": "공통", "title": "역할 사이 상태·식별·원장 일치", "job": "브랜드가 한 업무를 크리에이터와 관리자가 같은 사실로 보고 다음 일을 이어간다.", "screen": "모든 도메인과 역할 화면", "ui": ["발굴→연락→협의→샘플→콘텐츠→성과→재협업의 관계 단계를 표시하되 메일/계약/배송/게시/지급 상태를 합치지 않음", "각 카드에서 원래 캠페인·조건 버전·제출/배송/지급 기록으로 이동", "이벤트 처리 지연/연결 실패는 예외 상태로 노출", "새 업무를 만든 사람·시각·기존 값·다음 책임자를 기록"], "depends": [], "roleKey": "common", "easyName": "모든 역할이 같은 기록 보기", "pain": "브랜드·크리에이터·관리자가 같은 협업을 다른 상태로 봅니다.", "proposal": {"role": "brand", "screen": "b-today", "hotspot": "hs-X01"}}, {"number": "36", "id": "X02", "role": "공통", "title": "조건·보상·콘텐츠 권리의 버전 계약", "job": "누가 무엇을 얼마에 언제까지 하기로 했는지 양측이 동일하게 확인한다.", "screen": "캠페인 공개 조건 + 개인별 오퍼 + 합의 기록", "ui": ["보상/샘플/납품/일정/권리/수정/취소/지급을 묶은 조건 요약", "원문·번역·버전·변경 요약·양측 확인 시각", "유기 게시 권한·광고 매체/기간/지역·원본/편집·독점·재허락을 구분", "일정/가격/권리 변경은 새 제안이며 기존 기록 접근 유지"], "depends": ["X01"], "roleKey": "common", "easyName": "조건 버전 기록", "pain": "누가 무엇을 얼마에 언제까지 하기로 했는지 버전이 남지 않습니다.", "proposal": {"role": "brand", "screen": "b-create", "hotspot": "hs-X02"}}, {"number": "37", "id": "X03", "role": "공통", "title": "결과·기한·새 기회의 실제 알림과 정확한 복귀", "job": "결과와 변경을 놓치지 않고 알림을 누르면 바로 해당 업무를 확인한다.", "screen": "인앱/이메일 알림 → 정확한 신청/협업/문의 상세", "ui": ["접수/선정/미선정/조건 변경/출고/수정 요청/기한/답변/보상 확인 이벤트별 알림", "실제 켜짐/저장만/미지원/발송 실패를 구분. 시간대·quiet hours·수신 거부 적용", "여러 브랜드의 알림은 브랜드·캠페인·해야 할 행동 표시", "링크가 잘못됐거나 권한이 사라지면 해당 레코드 없음/접근 불가, 다른 협업을 대신 열지 않음"], "depends": ["X01"], "roleKey": "common", "easyName": "알림 누르면 바로 그 업무로", "pain": "알림을 눌러도 해당 협업이 아닌 첫 화면이 열립니다.", "proposal": {"role": "creator", "screen": "c-tasks", "hotspot": "hs-X03"}}, {"number": "38", "id": "X04", "role": "공통", "title": "로딩·0건·오류·저장·복구를 구분", "job": "느린 환경이나 실패 뒤에도 내가 입력한 내용을 잃거나 업무가 끝났다고 오해하지 않는다.", "screen": "모든 목록·입력·실행 완료 상태", "ui": ["초기/로딩/성공0건/성공목록/오류/오래된 데이터 배지를 분리", "실행은 대기/저장 중/성공/실패/결과 확인 필요. 서버 실패 시 성공처럼 목록만 새로고침하지 않음", "필드 오류는 해당 입력 아래, 전체 오류는 재시도/문의/보존 내용 안내", "자동 렌더·메뉴 이동·세션 만료·뒤로 가기에서 초안/포커스/스크롤 보존"], "depends": [], "roleKey": "common", "easyName": "불러오기 실패와 0건 구분", "pain": "불러오기에 실패해도 '0건'처럼 보여 끝난 일로 오해합니다.", "proposal": {"role": "admin", "screen": "a-today", "hotspot": "hs-X04"}}, {"number": "39", "id": "X05", "role": "공통", "title": "비어 있지 않은 역할별 통합 QA와 출시 기준", "job": "실제 가입→합의→배송→게시→보상 흐름이 이어짐을 확인한 뒤 출시 여부를 결정한다.", "screen": "격리 QA 데이터 + 운영 검증 체크리스트", "ui": ["테스트 환경을 명확히 표시하고 브랜드2/creator5/관리자2 역할 계정 준비", "공개/초안/마감·신청/반려/철회·배송 지연·수정·지급/미지급·분쟁 fixture", "대표 5개 E2E를 세 역할에서 같은 ID로 확인. 오류·동시성·다국어·모바일 포함", "P0 완료 조건을 충족한 부분만 출시. 인증/메일/결제는 실제 외부 경계 검증 별도"], "depends": ["X01", "X02", "X03", "X04"], "roleKey": "common", "easyName": "출시 전 역할별 점검", "pain": "빈 데이터로만 확인해 실제 흐름이 이어지는지 모릅니다.", "proposal": {"role": "admin", "screen": "a-today", "hotspot": "hs-X05"}}, {"number": "40", "id": "X06", "role": "공통", "title": "가입·채팅 수 대신 반복 협업을 검증하는 활성화 파일럿", "job": "고객이 실제로 필요로 하고 다시 비용을 내는 운영 경험을 만든다.", "screen": "제품 운영 실험·고객 온보딩·주간 회고", "ui": ["우선 B2 중소 글로벌팀과 B5 대행사, 초기 B1은 운영 지원형으로 검증", "첫 7일: 유효 제품/조건→검토된 초대→첫 회신→합의/주소→샘플 진행. 커뮤니티는 시작 안내/질문/주간 기회부터", "첫 게시 뒤 실제 개선 피드백·다음 제품 제안·자발적 멘토/office hours로 복귀 이유 제공", "브랜드·creator 양쪽의 이탈 이유와 운영 소요 시간을 기록"], "depends": ["B04", "B07", "B09", "B10", "B11", "B13"], "roleKey": "common", "easyName": "첫 7일 진행 확인", "pain": "가입·채팅 수만 보고 실제 협업이 반복되는지 알 수 없습니다.", "proposal": {"role": "brand", "screen": "b-today", "hotspot": "hs-X06"}}];
const COVERAGE = {"note": "hotspot 좌표는 캡처 전 임시값(%)입니다. 실제 캡처 주입 후 사용자가 위치를 검수합니다.", "captures": {"brand": {"file": "assets/current-brand.png", "label": "브랜드 홈 (현재)", "width": 633, "height": 917, "hotspots": {"B01": [50, 22], "B02": [50, 48]}}, "creator": {"file": "assets/current-creator.png", "label": "크리에이터 내 협업 (현재)", "width": 390, "height": 844, "hotspots": {"C04": [50, 20], "C06": [50, 42], "C10": [85, 6]}}, "admin": {"file": "assets/current-admin.png", "label": "관리자 검수 현황 (현재)", "width": 633, "height": 917, "hotspots": {"A03": [50, 24], "X04": [50, 55]}}}, "screens": {"brand": [["b-today", "오늘 할 일"], ["b-create", "협업 만들기"], ["b-invite", "초대할 사람"], ["b-reply", "답장하기"], ["b-samples", "샘플·영상"], ["b-community", "우리 커뮤니티"], ["b-results", "결과 보기"], ["b-team", "팀·설정"]], "creator": [["c-campaigns", "참여할 협업"], ["c-tasks", "내 할 일"], ["c-messages", "메시지"], ["c-community", "커뮤니티"], ["c-rewards", "받을 보상"], ["c-profile", "내 정보"]], "admin": [["a-today", "오늘 처리할 일"], ["a-onboard", "브랜드 시작 돕기"], ["a-review", "영상 확인"], ["a-reports", "신고·분쟁"], ["a-connections", "연결 상태"], ["a-finance", "비용·성과"], ["a-people", "사람·권한"]]}, "items": [{"id": "B01", "number": "01", "role": "brand", "proposalRole": "brand", "screen": "b-today", "screenLabel": "오늘 할 일", "hotspot": "hs-B01", "currentCapture": "brand", "currentHotspot": [50, 22]}, {"id": "B02", "number": "02", "role": "brand", "proposalRole": "brand", "screen": "b-today", "screenLabel": "오늘 할 일", "hotspot": "hs-B02", "currentCapture": "brand", "currentHotspot": [50, 48]}, {"id": "B03", "number": "03", "role": "brand", "proposalRole": "brand", "screen": "b-create", "screenLabel": "협업 만들기", "hotspot": "hs-B03", "currentCapture": null, "currentHotspot": null}, {"id": "B04", "number": "04", "role": "brand", "proposalRole": "brand", "screen": "b-create", "screenLabel": "협업 만들기", "hotspot": "hs-B04", "currentCapture": null, "currentHotspot": null}, {"id": "B05", "number": "05", "role": "brand", "proposalRole": "brand", "screen": "b-invite", "screenLabel": "초대할 사람", "hotspot": "hs-B05", "currentCapture": null, "currentHotspot": null}, {"id": "B06", "number": "06", "role": "brand", "proposalRole": "brand", "screen": "b-invite", "screenLabel": "초대할 사람", "hotspot": "hs-B06", "currentCapture": null, "currentHotspot": null}, {"id": "B07", "number": "07", "role": "brand", "proposalRole": "brand", "screen": "b-reply", "screenLabel": "답장하기", "hotspot": "hs-B07", "currentCapture": null, "currentHotspot": null}, {"id": "B08", "number": "08", "role": "brand", "proposalRole": "brand", "screen": "b-invite", "screenLabel": "초대할 사람", "hotspot": "hs-B08", "currentCapture": null, "currentHotspot": null}, {"id": "B09", "number": "09", "role": "brand", "proposalRole": "brand", "screen": "b-samples", "screenLabel": "샘플·영상", "hotspot": "hs-B09", "currentCapture": null, "currentHotspot": null}, {"id": "B10", "number": "10", "role": "brand", "proposalRole": "brand", "screen": "b-samples", "screenLabel": "샘플·영상", "hotspot": "hs-B10", "currentCapture": null, "currentHotspot": null}, {"id": "B11", "number": "11", "role": "brand", "proposalRole": "brand", "screen": "b-community", "screenLabel": "우리 커뮤니티", "hotspot": "hs-B11", "currentCapture": null, "currentHotspot": null}, {"id": "B12", "number": "12", "role": "brand", "proposalRole": "brand", "screen": "b-reply", "screenLabel": "답장하기", "hotspot": "hs-B12", "currentCapture": null, "currentHotspot": null}, {"id": "B13", "number": "13", "role": "brand", "proposalRole": "brand", "screen": "b-results", "screenLabel": "결과 보기", "hotspot": "hs-B13", "currentCapture": null, "currentHotspot": null}, {"id": "B14", "number": "14", "role": "brand", "proposalRole": "brand", "screen": "b-team", "screenLabel": "팀·설정", "hotspot": "hs-B14", "currentCapture": null, "currentHotspot": null}, {"id": "C01", "number": "15", "role": "creator", "proposalRole": "creator", "screen": "c-campaigns", "screenLabel": "참여할 협업", "hotspot": "hs-C01", "currentCapture": null, "currentHotspot": null}, {"id": "C02", "number": "16", "role": "creator", "proposalRole": "creator", "screen": "c-profile", "screenLabel": "내 정보", "hotspot": "hs-C02", "currentCapture": null, "currentHotspot": null}, {"id": "C03", "number": "17", "role": "creator", "proposalRole": "creator", "screen": "c-campaigns", "screenLabel": "참여할 협업", "hotspot": "hs-C03", "currentCapture": null, "currentHotspot": null}, {"id": "C04", "number": "18", "role": "creator", "proposalRole": "creator", "screen": "c-tasks", "screenLabel": "내 할 일", "hotspot": "hs-C04", "currentCapture": "creator", "currentHotspot": [50, 20]}, {"id": "C05", "number": "19", "role": "creator", "proposalRole": "creator", "screen": "c-tasks", "screenLabel": "내 할 일", "hotspot": "hs-C05", "currentCapture": null, "currentHotspot": null}, {"id": "C06", "number": "20", "role": "creator", "proposalRole": "creator", "screen": "c-tasks", "screenLabel": "내 할 일", "hotspot": "hs-C06", "currentCapture": "creator", "currentHotspot": [50, 42]}, {"id": "C07", "number": "21", "role": "creator", "proposalRole": "creator", "screen": "c-tasks", "screenLabel": "내 할 일", "hotspot": "hs-C07", "currentCapture": null, "currentHotspot": null}, {"id": "C08", "number": "22", "role": "creator", "proposalRole": "creator", "screen": "c-tasks", "screenLabel": "내 할 일", "hotspot": "hs-C08", "currentCapture": null, "currentHotspot": null}, {"id": "C09", "number": "23", "role": "creator", "proposalRole": "creator", "screen": "c-rewards", "screenLabel": "받을 보상", "hotspot": "hs-C09", "currentCapture": null, "currentHotspot": null}, {"id": "C10", "number": "24", "role": "creator", "proposalRole": "creator", "screen": "c-profile", "screenLabel": "내 정보", "hotspot": "hs-C10", "currentCapture": "creator", "currentHotspot": [85, 6]}, {"id": "C11", "number": "25", "role": "creator", "proposalRole": "creator", "screen": "c-community", "screenLabel": "커뮤니티", "hotspot": "hs-C11", "currentCapture": null, "currentHotspot": null}, {"id": "C12", "number": "26", "role": "creator", "proposalRole": "creator", "screen": "c-messages", "screenLabel": "메시지", "hotspot": "hs-C12", "currentCapture": null, "currentHotspot": null}, {"id": "A01", "number": "27", "role": "admin", "proposalRole": "admin", "screen": "a-today", "screenLabel": "오늘 처리할 일", "hotspot": "hs-A01", "currentCapture": null, "currentHotspot": null}, {"id": "A02", "number": "28", "role": "admin", "proposalRole": "admin", "screen": "a-onboard", "screenLabel": "브랜드 시작 돕기", "hotspot": "hs-A02", "currentCapture": null, "currentHotspot": null}, {"id": "A03", "number": "29", "role": "admin", "proposalRole": "admin", "screen": "a-review", "screenLabel": "영상 확인", "hotspot": "hs-A03", "currentCapture": "admin", "currentHotspot": [50, 24]}, {"id": "A04", "number": "30", "role": "admin", "proposalRole": "admin", "screen": "a-reports", "screenLabel": "신고·분쟁", "hotspot": "hs-A04", "currentCapture": null, "currentHotspot": null}, {"id": "A05", "number": "31", "role": "admin", "proposalRole": "admin", "screen": "a-reports", "screenLabel": "신고·분쟁", "hotspot": "hs-A05", "currentCapture": null, "currentHotspot": null}, {"id": "A06", "number": "32", "role": "admin", "proposalRole": "admin", "screen": "a-connections", "screenLabel": "연결 상태", "hotspot": "hs-A06", "currentCapture": null, "currentHotspot": null}, {"id": "A07", "number": "33", "role": "admin", "proposalRole": "admin", "screen": "a-people", "screenLabel": "사람·권한", "hotspot": "hs-A07", "currentCapture": null, "currentHotspot": null}, {"id": "A08", "number": "34", "role": "admin", "proposalRole": "admin", "screen": "a-finance", "screenLabel": "비용·성과", "hotspot": "hs-A08", "currentCapture": null, "currentHotspot": null}, {"id": "X01", "number": "35", "role": "common", "proposalRole": "brand", "screen": "b-today", "screenLabel": "오늘 할 일", "hotspot": "hs-X01", "currentCapture": null, "currentHotspot": null}, {"id": "X02", "number": "36", "role": "common", "proposalRole": "brand", "screen": "b-create", "screenLabel": "협업 만들기", "hotspot": "hs-X02", "currentCapture": null, "currentHotspot": null}, {"id": "X03", "number": "37", "role": "common", "proposalRole": "creator", "screen": "c-tasks", "screenLabel": "내 할 일", "hotspot": "hs-X03", "currentCapture": null, "currentHotspot": null}, {"id": "X04", "number": "38", "role": "common", "proposalRole": "admin", "screen": "a-today", "screenLabel": "오늘 처리할 일", "hotspot": "hs-X04", "currentCapture": "admin", "currentHotspot": [50, 55]}, {"id": "X05", "number": "39", "role": "common", "proposalRole": "admin", "screen": "a-today", "screenLabel": "오늘 처리할 일", "hotspot": "hs-X05", "currentCapture": null, "currentHotspot": null}, {"id": "X06", "number": "40", "role": "common", "proposalRole": "brand", "screen": "b-today", "screenLabel": "오늘 할 일", "hotspot": "hs-X06", "currentCapture": null, "currentHotspot": null}]};
/*__DATA_END__*/

const BY_ID = Object.fromEntries(IMPROVEMENTS.map(i => [i.id, i]));
const COV = Object.fromEntries(COVERAGE.items.map(i => [i.id, i]));
const ROLE_LABEL = { brand: '브랜드', creator: '크리에이터', admin: '관리자', common: '공통' };
const SCREENS = COVERAGE.screens;
const SCREEN_LABEL = {};
Object.values(SCREENS).forEach(list => list.forEach(([k, v]) => { SCREEN_LABEL[k] = v; }));
const LS_VIEW = 'numbered-20261025:view';
const LS_SEL = 'numbered-20261025:selected';
const DEMO_MSG = '시안에서만 변경됐어요 — 실제 저장·발송·지급은 없습니다.';

function lsGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } }

const view = Object.assign({ role: 'brand', mode: 'current', showBadges: true,
  screen: { brand: 'b-today', creator: 'c-campaigns', admin: 'a-today' } }, lsGet(LS_VIEW, {}));
let selected = new Set((lsGet(LS_SEL, []) || []).filter(id => BY_ID[id]));

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- 번호 배지 ---------- */
function b(id, opts = {}) {
  const it = BY_ID[id];
  const idAttr = opts.noId ? '' : ` id="hs-${id}"`;
  const style = opts.pos ? ` style="left:${opts.pos[0]}%;top:${opts.pos[1]}%"` : '';
  return `<button type="button" class="hs${selected.has(id) ? ' is-sel' : ''}"${idAttr} data-hs="${id}"${style} aria-label="개선 ${it.number} ${id} ${esc(it.easyName)} 설명 열기${selected.has(id) ? ' (선택됨)' : ''}"><span>${it.number}</span><small>${id}</small></button>`;
}
const chip = (t, tone = '') => `<span class="chip ${tone}">${t}</span>`;
const demoBtn = (label, cls = '', msg = '') => `<button type="button" class="btn ${cls}" data-demo="${esc(msg)}">${label}</button>`;
const goBtn = (label, screen, cls = '') => `<button type="button" class="btn ${cls}" data-go="${screen}">${label}</button>`;
const sheetBtn = (label, sheet, cls = '') => `<button type="button" class="btn ${cls}" data-sheet="${sheet}">${label}</button>`;
function tabs(group, items, active) {
  return `<div class="tabs" role="tablist" data-tabgroup="${group}">${items.map(([k, l]) =>
    `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === active}">${l}</button>`).join('')}</div>`;
}
const panel = (group, k, active, html) => `<div data-group="${group}" data-panel="${k}"${k === active ? '' : ' hidden'}>${html}</div>`;

/* ---------- 상태 저장 ---------- */
function saveView() { lsSet(LS_VIEW, view); }
function saveSel() { lsSet(LS_SEL, [...selected]); updateCount(); }
function updateCount() {
  $('#rv-count').textContent = selected.size;
  $$('.hs[data-hs]').forEach(el => {
    const on = selected.has(el.dataset.hs);
    el.classList.toggle('is-sel', on);
    const it = BY_ID[el.dataset.hs];
    el.setAttribute('aria-label', `개선 ${it.number} ${it.id} ${it.easyName} 설명 열기${on ? ' (선택됨)' : ''}`);
  });
}
const sortedSel = () => [...selected].sort((a, c) => BY_ID[a].number.localeCompare(BY_ID[c].number));
const requestSentence = () => selected.size ? `개선 ${sortedSel().join(', ')}만 이 시안대로 반영해줘.` : '';

/* ---------- 렌더 ---------- */
const RENDER = {};   // screenKey -> () => html
const AFTER = {};    // screenKey -> (root) => void

function render() {
  document.body.classList.toggle('hide-badges', !view.showBadges);
  $('#rv-show-badges').checked = view.showBadges;
  $$('[data-role]').forEach(b2 => b2.setAttribute('aria-pressed', String(b2.dataset.role === view.role)));
  $$('[data-mode]').forEach(b2 => b2.setAttribute('aria-pressed', String(b2.dataset.mode === view.mode)));
  const stage = $('#stage');
  stage.innerHTML = view.mode === 'current' ? renderCurrent() : renderShell();
  if (view.mode === 'current') wireCapture(stage);
  else (AFTER[view.screen[view.role]] || (() => {}))(stage);
  updateCount();
}

function itemLine(id, extra = '') {
  const it = BY_ID[id], c = COV[id];
  return `<li>${b(id, { noId: true })}<span class="nm"><b>${esc(it.easyName)}</b><br><span class="meta">${ROLE_LABEL[it.roleKey]} · 시안 위치: ${ROLE_LABEL[c.proposalRole]} › ${esc(c.screenLabel)}${extra}</span></span>
  <button type="button" class="btn" data-goto="${id}">시안 보기</button></li>`;
}

function renderCurrent() {
  const cap = COVERAGE.captures[view.role];
  const here = Object.keys(cap.hotspots);
  const others = IMPROVEMENTS.filter(i => !here.includes(i.id) &&
    (i.roleKey === view.role || (i.roleKey === 'common' && COV[i.id].proposalRole === view.role))).map(i => i.id);
  const commonElse = IMPROVEMENTS.filter(i => i.roleKey === 'common' && COV[i.id].proposalRole !== view.role && !here.includes(i.id)).map(i => i.id);
  const markers = here.map(id => b(id, { pos: cap.hotspots[id] })).join('');
  return `<section class="cur" aria-labelledby="cur-title">
    <div class="cur-head">
      <h1 id="cur-title">현재 UI: ${esc(cap.label)}</h1>
      <p class="muted">실제 캡처 위에 이 화면과 관련된 번호만 올렸습니다. 번호 위치는 캡처 주입 후 검수 예정(임시 좌표). 다른 화면 개선은 오른쪽 목록에서 시안으로 이동하세요.</p>
    </div>
    <div class="cap-wrap" style="max-width:${cap.width}px">
      <div class="cap" style="aspect-ratio:${cap.width}/${cap.height}" data-cap>
        <img src="${cap.file}" alt="${esc(cap.label)} 캡처" data-capimg>
        <div class="missing" data-missing hidden><p><b>캡처 이미지가 아직 없습니다.</b></p><p><code>${cap.file}</code> 파일을 넣으면 이 자리에 원래 비율로 표시됩니다.</p><p class="small">가짜 화면은 만들지 않았습니다. 번호는 임시 위치입니다.</p></div>
        ${markers}
      </div>
    </div>
    <div class="cur-lists">
      <div class="card"><h2>이 화면의 개선 (${here.length})</h2><ul class="ilist">${here.map(id => itemLine(id)).join('')}</ul></div>
      <div class="card"><h2>다른 화면 개선 (${others.length})</h2><p class="small muted">이 캡처에 없는 영역입니다. 엉뚱한 위치에 번호를 붙이지 않고 목록으로 연결합니다.</p><ul class="ilist">${others.map(id => itemLine(id)).join('')}</ul></div>
      <div class="card soft"><h2>공통 개선 · 다른 역할 시안 (${commonElse.length})</h2><ul class="ilist">${commonElse.map(id => itemLine(id)).join('')}</ul></div>
    </div>
  </section>`;
}

function wireCapture(root) {
  const img = $('[data-capimg]', root), box = $('[data-cap]', root), miss = $('[data-missing]', root);
  const ok = () => { box.style.aspectRatio = ''; box.parentElement.style.maxWidth = img.naturalWidth + 'px'; };
  const fail = () => { img.hidden = true; miss.hidden = false; };
  if (img.complete && img.naturalWidth) ok(); else if (img.complete) fail();
  img.addEventListener('load', ok); img.addEventListener('error', fail);
}

const SHELL = {
  brand: { logo: 'Connection · 브랜드', ctx: () => `<span>브랜드 <b>새봄뷰티(예시)</b></span><span>담당 <b>지윤(예시)</b></span><span>기준 시간 <b>한국(KST)</b></span>` },
  creator: { logo: 'Connection · 크리에이터', ctx: () => `<span><b>민지(예시)</b></span><span>미국 · 뉴욕 시간(ET)</span>` },
  admin: { logo: 'Connection · 운영', ctx: () => `<span>운영 담당 <b>하린(예시)</b></span><span>고객 브랜드 16곳(예시)</span>` },
};
const NAV_COUNT = { 'b-today': 6, 'b-reply': 4, 'c-tasks': 2, 'a-today': 9, 'a-reports': 3 };

function renderShell() {
  const role = view.role, cur = view.screen[role], sh = SHELL[role];
  const nav = SCREENS[role].map(([k, l]) => `<button type="button" data-nav="${k}"${k === cur ? ' aria-current="page"' : ''}>${l}${NAV_COUNT[k] ? `<span class="cnt">${NAV_COUNT[k]}</span>` : ''}</button>`).join('');
  const body = (RENDER[cur] || (() => '<p>준비 중</p>'))();
  return `<div class="app" data-role-app="${role}">
    <div class="app-top"><span class="logo">${sh.logo}</span><span class="ctx">${sh.ctx()}</span></div>
    <div class="app-body">
      <nav class="app-nav" aria-label="${ROLE_LABEL[role]} 메뉴">${nav}</nav>
      <div class="app-main"><span class="demo-note">개선 후 시안 · 가상 정보와 예시 숫자 · 버튼은 시안에서만 동작</span>${body}</div>
    </div></div>`;
}

/* ---------- 토스트 ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg || DEMO_MSG; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }

/* ---------- 다이얼로그 공통 (Esc, 포커스 복귀, 포커스 가두기) ---------- */
const stack = []; // {el, scrim, ret}
function openDialog(el, scrim) {
  const ret = document.activeElement;
  el.hidden = false; scrim.hidden = false;
  stack.push({ el, scrim, ret });
  const f = el.querySelector('[data-autofocus]') || el.querySelector('button, input, select, textarea, a[href]');
  if (f) f.focus();
}
function closeTop() {
  const top = stack.pop(); if (!top) return;
  top.el.hidden = true;
  if (!stack.some(s => s.scrim === top.scrim)) top.scrim.hidden = true;
  if (top.ret && document.contains(top.ret)) top.ret.focus();
  else { const s = top.ret && top.ret.dataset && top.ret.dataset.hs; const alt = s && $(`.hs[data-hs="${s}"]`); (alt || $('#stage')).focus(); }
}
function closeDialog(el) { while (stack.length && stack[stack.length - 1].el !== el) closeTop(); if (stack.length) closeTop(); }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && stack.length) { e.preventDefault(); closeTop(); return; }
  if (e.key === 'Tab' && stack.length) {
    const el = stack[stack.length - 1].el;
    const f = $$('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])', el).filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});
$('#rv-scrim').addEventListener('click', () => { while (stack.length && stack[stack.length - 1].scrim.id === 'rv-scrim') closeTop(); });
$('#pd-scrim').addEventListener('click', () => closeDialog($('#pd-sheet')));

/* ---------- 개선 설명 레이어 ---------- */
function openLayer(id) {
  const it = BY_ID[id], c = COV[id];
  const el = $('#rv-layer');
  const capNote = c.currentCapture ? `현재 캡처(${esc(COVERAGE.captures[c.currentCapture].label)})에 번호가 있습니다.` : '현재 캡처에는 없는 영역입니다. 개선 후 시안에서 확인하세요.';
  el.innerHTML = `<div class="sheet-head"><div><span class="rv-kicker">검토용 설명 · 제품 화면 아님</span>
      <h2 id="rv-layer-title"><span class="rv-num">${it.number}</span>${id} · ${esc(it.easyName)}</h2>
      <p class="small muted">${ROLE_LABEL[it.roleKey]} · 원래 이름: ${esc(it.title)}</p></div>
      <button type="button" class="xbtn" data-close-layer aria-label="설명 닫기">✕</button></div>
    <section><h3>현재 어려움</h3><p>${esc(it.pain)}</p><p class="small muted">누가 무엇을: ${esc(it.job)}</p></section>
    <section><h3>바뀔 동작</h3><ul>${it.ui.map(u => `<li>${esc(u)}</li>`).join('')}</ul></section>
    <section><h3>시안 위치</h3><p>${ROLE_LABEL[c.proposalRole]} › ${esc(c.screenLabel)} <span class="small muted">(원 요구 화면: ${esc(it.screen)})</span></p><p class="small muted">${capNote}</p>
      <div class="btns"><button type="button" class="btn pri" data-goto="${id}">시안 보기</button>${c.currentCapture ? `<button type="button" class="btn" data-goto-current="${id}">현재 UI에서 보기</button>` : ''}</div></section>
    <section><label class="rv-check"><input type="checkbox" data-selbox="${id}" ${selected.has(id) ? 'checked' : ''}> 이 개선을 시안 선택 목록에 담기</label>
      <p class="small muted">선택은 검토 메모일 뿐 승인·개발 실행이 아닙니다.</p></section>
    <section><h3>함께 필요한 작업 (자동 선택되지 않음)</h3>${it.depends.length ? it.depends.map(d =>
      `<button type="button" class="dep" data-hs="${d}">${BY_ID[d].number} ${d} · ${esc(BY_ID[d].easyName)}${selected.has(d) ? ' ✓' : ''}</button>`).join('') : '<p class="small muted">먼저 필요한 작업이 없습니다.</p>'}</section>`;
  if (el.hidden) openDialog(el, $('#rv-scrim')); else { const f = el.querySelector('button'); f && f.focus(); }
}

/* ---------- 선택 목록 ---------- */
function renderSel() {
  const el = $('#rv-sel');
  const groups = ['brand', 'creator', 'admin', 'common'];
  el.innerHTML = `<div class="sheet-head"><div><span class="rv-kicker">검토용 · 제품 화면 아님</span><h2 id="rv-sel-title">선택한 개선 (${selected.size}/40)</h2></div>
    <button type="button" class="xbtn" data-close-sel aria-label="선택 목록 닫기">✕</button></div>
    <div class="alert warn">체크와 복사는 <b>승인이나 개발 실행이 아닙니다.</b> 아래 문장을 채팅에 직접 붙여 요청해야만 추후 제품 반영을 검토합니다. 적용·배포 버튼은 없습니다.</div>
    <label class="field"><span class="lab">채팅에 붙일 요청 문장</span>
      <textarea class="copybox" id="rv-sentence" readonly>${esc(requestSentence() || '선택한 개선이 없습니다.')}</textarea></label>
    <div class="btns"><button type="button" class="btn pri" data-copy ${selected.size ? '' : 'disabled'}>요청 문장 복사</button>
      <button type="button" class="btn" data-dl="txt" ${selected.size ? '' : 'disabled'}>선택 TXT 받기</button>
      <button type="button" class="btn" data-dl="json" ${selected.size ? '' : 'disabled'}>선택 JSON 받기</button>
      <button type="button" class="btn danger" data-clear ${selected.size ? '' : 'disabled'}>전체 해제</button></div>
    ${groups.map(g => `<div class="sel-role"><h3>${ROLE_LABEL[g]}</h3>${IMPROVEMENTS.filter(i => i.roleKey === g).map(i => {
      const c = COV[i.id];
      return `<div class="sel-row"><label><input type="checkbox" data-selbox="${i.id}" ${selected.has(i.id) ? 'checked' : ''}><span><b>${i.number} ${i.id}</b> ${esc(i.easyName)}<br><span class="small muted">${ROLE_LABEL[c.proposalRole]} › ${esc(c.screenLabel)}${i.depends.length ? ` · 함께 필요: ${i.depends.join(', ')}` : ''}</span></span></label>
        <button type="button" class="btn" data-hs="${i.id}">설명</button><button type="button" class="btn" data-goto="${i.id}">시안 보기</button>${c.currentCapture ? `<button type="button" class="btn ghost" data-goto-current="${i.id}">현재 UI 위치</button>` : ''}</div>`;
    }).join('')}</div>`).join('')}`;
}
function openSel() { renderSel(); openDialog($('#rv-sel'), $('#rv-scrim')); }

function copyText(text) {
  const done = () => toast('요청 문장을 복사했어요. 채팅에 붙여 넣어야 요청이 됩니다(아직 반영 아님).');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  if (ok) done(); else { const s = $('#rv-sentence'); if (s) { s.focus(); s.select(); } toast('자동 복사가 막혔어요. 선택된 문장을 직접 복사해 주세요.'); }
}
function download(kind) {
  const ids = sortedSel();
  const items = ids.map(id => ({ number: BY_ID[id].number, id, name: BY_ID[id].easyName, title: BY_ID[id].title, proposal: `${ROLE_LABEL[COV[id].proposalRole]} > ${COV[id].screenLabel}`, depends: BY_ID[id].depends }));
  const note = '체크는 시안 선택이며 실제 반영·개발 실행이 아닙니다. 채팅에 요청 문장을 붙여야 반영을 검토합니다.';
  let data, type, name;
  if (kind === 'json') { data = JSON.stringify({ note, request: requestSentence(), selected: items, savedAt: new Date().toISOString() }, null, 2); type = 'application/json'; name = 'selected-improvements.json'; }
  else { data = [note, '', requestSentence(), '', ...items.map(i => `${i.number} ${i.id} ${i.name} — ${i.proposal}${i.depends.length ? ` (함께 필요: ${i.depends.join(', ')})` : ''}`)].join('\n'); type = 'text/plain;charset=utf-8'; name = 'selected-improvements.txt'; }
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- 시안으로 이동 ---------- */
function gotoProposal(id) {
  const c = COV[id];
  while (stack.length) closeTop();
  view.role = c.proposalRole; view.mode = 'proposal'; view.screen[c.proposalRole] = c.screen; saveView(); render();
  revealHotspot(id);
}
function gotoCurrent(id) {
  const c = COV[id];
  while (stack.length) closeTop();
  view.role = c.currentCapture; view.mode = 'current'; saveView(); render();
  revealHotspot(id);
}
function revealHotspot(id) {
  const el = document.getElementById('hs-' + id) || $(`.cap .hs[data-hs="${id}"]`);
  if (!el) { $('#stage').focus(); return; }
  // 숨은 탭 패널 안에 있으면 그 탭을 연다
  const chain = []; let p = el.closest('[data-panel]');
  while (p) { chain.unshift([p.dataset.group, p.dataset.panel]); p = p.parentElement && p.parentElement.closest('[data-panel]'); }
  chain.forEach(([g, k]) => activateTab(g, k));
  const el2 = document.getElementById('hs-' + id) || el; // 탭 전환으로 다시 그려졌을 수 있음
  return pulseHotspot(el2);
}
function pulseHotspot(el) {
  if (!view.showBadges) { view.showBadges = true; saveView(); document.body.classList.remove('hide-badges'); $('#rv-show-badges').checked = true; }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  el.focus({ preventScroll: true });
}
function activateTab(group, key) {
  $$(`[data-tabgroup="${group}"] [data-tab]`).forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === key)));
  $$(`[data-group="${group}"][data-panel]`).forEach(p => { p.hidden = p.dataset.panel !== key; });
  const hook = TAB_HOOK[group]; if (hook) hook(key);
}
const TAB_HOOK = {};

/* ---------- 제품 레이어 ---------- */
const SHEETS = {}; // key -> {title, html, after?}
function openSheet(key) {
  const s = SHEETS[key]; if (!s) return;
  const el = $('#pd-sheet');
  el.innerHTML = `<div class="sheet-head"><h2 id="pd-sheet-title">${s.title}</h2><button type="button" class="xbtn" data-close-sheet aria-label="닫기">✕</button></div>
    <span class="demo-note">시안 레이어 · 실제 저장·발송 없음</span>${s.html()}`;
  if (el.hidden) openDialog(el, $('#pd-scrim')); else { const f = el.querySelector('button'); f && f.focus(); }
  s.after && s.after(el);
  updateCount();
}

/* ---------- 이벤트 위임 ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-hs]'); if (!t) return;
  const d = t.dataset;
  if (d.role) { view.role = d.role; saveView(); render(); return; }
  if (d.mode) { view.mode = d.mode; saveView(); render(); return; }
  if (t.id === 'rv-open-sel') { openSel(); return; }
  if (d.hs) { openLayer(d.hs); return; }
  if (d.goto) { gotoProposal(d.goto); return; }
  if (d.gotoCurrent) { gotoCurrent(d.gotoCurrent); return; }
  if ('closeLayer' in d) { closeDialog($('#rv-layer')); return; }
  if ('closeSel' in d) { closeDialog($('#rv-sel')); return; }
  if ('closeSheet' in d) { closeDialog($('#pd-sheet')); return; }
  if ('copy' in d) { copyText(requestSentence()); return; }
  if (d.dl) { download(d.dl); return; }
  if ('clear' in d) { selected.clear(); saveSel(); renderSel(); $('[data-close-sel]').focus(); return; }
  if (d.nav) { view.screen[view.role] = d.nav; saveView(); render(); $('#stage').focus({ preventScroll: true }); window.scrollTo(0, 0); return; }
  if (d.go) { while (stack.length && stack[stack.length - 1].el.id === 'pd-sheet') closeTop(); view.screen[view.role] = d.go; saveView(); render(); window.scrollTo(0, 0); return; }
  if (d.sheet) { openSheet(d.sheet); return; }
  if (d.tab) { const g = t.closest('[data-tabgroup]').dataset.tabgroup; activateTab(g, d.tab); return; }
  if ('demo' in d) { toast(d.demo || DEMO_MSG); return; }
  const custom = t.closest('[data-act]'); if (custom && ACT[custom.dataset.act]) ACT[custom.dataset.act](custom, e);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'rv-show-badges') { view.showBadges = t.checked; saveView(); document.body.classList.toggle('hide-badges', !t.checked); return; }
  if (t.dataset.selbox) {
    const id = t.dataset.selbox;
    if (t.checked) selected.add(id); else selected.delete(id);
    saveSel();
    $$(`[data-selbox="${id}"]`).forEach(x => { x.checked = t.checked; });
    const s = $('#rv-sentence'); if (s) s.value = requestSentence() || '선택한 개선이 없습니다.';
    const title = $('#rv-sel-title'); if (title) title.textContent = `선택한 개선 (${selected.size}/40)`;
    $$('#rv-sel [data-copy], #rv-sel [data-dl], #rv-sel [data-clear]').forEach(x => { x.disabled = !selected.size; });
    $$('.dep').forEach(x => { const di = x.dataset.hs; x.textContent = `${BY_ID[di].number} ${di} · ${BY_ID[di].easyName}${selected.has(di) ? ' ✓' : ''}`; });
    return;
  }
  const custom = t.closest('[data-chg]'); if (custom && CHG[custom.dataset.chg]) CHG[custom.dataset.chg](custom, e);
});
window.addEventListener('storage', e => { if (e.key === LS_SEL) { selected = new Set((lsGet(LS_SEL, []) || []).filter(id => BY_ID[id])); updateCount(); } });
const ACT = {};  // 화면별 커스텀 클릭
const CHG = {};  // 화면별 커스텀 change

/* =====================================================================
   브랜드 시안 (8화면)
   ===================================================================== */
const B_TASKS = [
  { k: 'reply', who: '민지(예시)', camp: '진정 세럼 미국 영상', next: '가격 문의에 답장하기', owner: '지윤(예시)', due: '26시간 대기 · 오늘 18:00까지', go: 'b-reply' },
  { k: 'reply', who: 'Jordan(예시)', camp: '진정 세럼 미국 영상', next: '샘플 수량 질문에 답장하기', owner: '지윤(예시)', due: '9시간 대기', go: 'b-reply' },
  { k: 'result', who: '지원자 12명', camp: '진정 세럼 미국 영상', next: '선정 결과 알리기 (약속: 내일 18:00)', owner: '지윤(예시)', due: '내일 18:00', go: 'b-invite' },
  { k: 'addr', who: 'Ava(예시)', camp: '진정 세럼 미국 영상', next: '주소 입력 다시 요청하기', owner: '수진(예시)', due: '3일째 누락', go: 'b-samples' },
  { k: 'ship', who: '5명', camp: '진정 세럼 미국 영상', next: '송장 번호 입력하고 출고하기', owner: '수진(예시)', due: '오늘 출고 목표', go: 'b-samples' },
  { k: 'review', who: 'Lena(예시)', camp: '진정 세럼 미국 영상', next: '수정본(2회차) 확인하기', owner: '지윤(예시)', due: '검수 기한 10/27', go: 'b-samples' },
  { k: 'pay', who: 'Chris(예시)', camp: '수분 크림 체험', next: '고정비 100 USD 지급 확인 표시하기', owner: '지윤(예시)', due: '지급 예정일 10/26', go: 'b-results' },
];
const B_CARDS = [
  ['reply', '내 답장 대기', 4, '가장 오래 26시간'], ['result', '결과 약속 임박', 12, '내일 18:00까지'], ['addr', '주소 누락', 2, '가장 오래 3일'],
  ['ship', '출고 대기', 5, '오늘 출고 목표'], ['review', '영상 확인 대기', 2, '가장 오래 1일'], ['pay', '지급 확인 필요', 1, '예정일 내일'],
];
let bFilter = null, bFirstUse = false;
function bTaskRows() {
  const list = B_TASKS.filter(t => !bFilter || t.k === bFilter);
  return list.map(t => `<li class="rowi"><div class="grow"><b>${t.next}</b><div class="sub">${t.who} · ${t.camp} · 담당 ${t.owner}</div></div>
    ${chip(t.due, t.due.includes('대기') || t.due.includes('누락') ? 'warn' : '')}
    <button type="button" class="btn ghost small" data-demo="원래 협업 기록(조건 v2·배송·제출 내역)으로 이동하는 링크입니다. 시안에서는 이동하지 않아요.">원래 기록</button>
    ${goBtn('시작', t.go, 'pri')}</li>`).join('');
}
RENDER['b-today'] = () => {
  if (bFirstUse) return `<div class="page-head"><div><h1>시작하기</h1><p>숫자 대신 준비 순서를 먼저 보여 줘요. 세 가지만 끝내면 모집을 시작할 수 있어요.</p></div><button type="button" class="btn" data-act="b-firstuse">기존 사용자 화면 보기</button></div>
    <div class="card primary-card"><h3>${b('B01', { noId: true })} 준비 체크리스트</h3><ul class="check">
      <li><span class="ic ok">✓</span><div><b>1. 제품 등록</b><div class="small muted">새봄 진정 세럼(예시) — 공개 사진·설명 완료</div></div></li>
      <li><span class="ic wait">2</span><div><b>2. 협업 조건 정하기</b><div class="small muted">보상·샘플·영상 기한을 5단계로 정해요.</div>${goBtn('조건 정하기', 'b-create', 'pri')}</div></li>
      <li><span class="ic todo">3</span><div><b>3. 모집 준비</b><div class="small muted">초대할 사람 고르기 또는 커뮤니티 공지</div></div></li></ul></div>`;
  return `<div class="page-head"><div><h1>오늘 할 일 ${b('B01')}</h1><p>새봄뷰티(예시) · 담당 지윤(예시) · 한국 시간(KST) 기준 · 10/25 09:30 갱신</p></div>
    <button type="button" class="btn" data-act="b-firstuse">처음 이용자 화면 보기</button></div>
  <div class="card primary-card"><p class="small muted">지금 가장 먼저 할 일</p><h2>민지(예시)의 가격 문의에 답장하기</h2><p>26시간째 답을 기다리고 있어요. 오늘 18:00 전에 답하면 약속한 응답 시간을 지킬 수 있어요.</p>${goBtn('답장하러 가기', 'b-reply', 'pri')}</div>
  <h2 style="margin-top:20px">상태별 업무</h2>
  <div class="grid g3">${B_CARDS.map(([k, l, n, s]) => `<button type="button" class="stat" data-act="b-filter" data-k="${k}" aria-pressed="${bFilter === k}"><span class="l">${l}</span><br><span class="n">${n}</span><br><span class="s">${s}</span></button>`).join('')}</div>
  <div class="split" style="margin-top:16px">
    <div class="card"><h3>업무 목록 ${b('X01')} <span class="small muted" style="font-weight:400">${bFilter ? `필터: ${B_CARDS.find(c => c[0] === bFilter)[1]}` : '전체'}</span>${bFilter ? '<button type="button" class="btn ghost" data-act="b-filter" data-k="">필터 해제</button>' : ''}</h3>
      <p class="small muted">각 줄의 ‘원래 기록’은 같은 협업의 조건 버전·배송·제출 기록으로 이어져요. 크리에이터와 운영팀도 같은 기록을 봐요.</p>
      <ul class="rows" id="b-task-rows">${bTaskRows()}</ul></div>
    <div class="grid">
      <div class="card"><h3>미국 판매 협업 시작 준비 ${b('B02')}</h3>
        <p class="small">목표: <b>판매</b> · 국가: <b>미국</b> · 플랫폼: <b>TikTok Shop</b></p>
        <div class="alert warn">아직 판매 협업은 열 수 없어요. 대신 <b>영상 제작 체험</b>은 지금 준비할 수 있어요.</div>
        <ul class="check">
          <li><span class="ic ok">✓</span><div>판매 주체 확인됨</div></li>
          <li><span class="ic wait">…</span><div>상품 연결 <b>검토 중</b> <span class="small muted">· 예상 2영업일</span></div></li>
          <li><span class="ic no">!</span><div><b>현지 배송·반품 정보 미입력</b><div class="small muted">이유: 반품 주소가 없으면 판매가 막혀요. 준비 자료: 미국 반품지 주소. 담당: 수진(예시)</div>${demoBtn('반품 정보 입력하기', '', '시안에서만 이동해요. 실제 설정은 바뀌지 않아요.')}</div></li>
          <li><span class="ic ok">✓</span><div>판매 가능 재고 확인됨</div></li>
          <li><span class="ic ok">✓</span><div>담당자·사용 언어(영어) 확인됨</div></li></ul></div>
      <div class="card"><h3>첫 7일 진행 ${b('X06')}</h3><ul class="check">
        <li><span class="ic ok">✓</span><div>제품·조건 준비</div></li><li><span class="ic ok">✓</span><div>검토한 초대 20명 발송</div></li>
        <li><span class="ic wait">3</span><div><b>첫 답장 받기</b> — 4명 답장 (예시)</div></li><li><span class="ic todo">4</span><div>조건 합의·주소 받기</div></li><li><span class="ic todo">5</span><div>샘플 출발</div></li></ul>
        <p class="small muted">가입 수·채팅 수가 아니라 실제 협업이 이어지는지로 확인해요.</p></div>
    </div></div>`;
};
ACT['b-filter'] = el => { bFilter = el.dataset.k || null; render(); };
ACT['b-firstuse'] = () => { bFirstUse = !bFirstUse; render(); };

/* ----- 협업 만들기 (5단계) ----- */
let wiz = 's1', wizReward = 'fixed';
const WSTEPS = [['s1', '1 제품·국가·목적'], ['s2', '2 보상·샘플'], ['s3', '3 영상·기한·광고'], ['s4', '4 지원 조건'], ['s5', '5 미리보기']];
RENDER['b-create'] = () => `<div class="page-head"><div><h1>협업 만들기 ${b('B04')}</h1><p>5단계로 끝나요. 언제든 초안으로 저장할 수 있어요.</p></div>${demoBtn('초안 저장', '', '초안이 저장된 것처럼 보이는 시안이에요. 실제 저장은 없습니다.')}</div>
  <div class="steps" role="tablist" data-tabgroup="wiz">${WSTEPS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === wiz}">${l}</button>`).join('')}</div>
  <div class="split"><div class="card">
  ${panel('wiz', 's1', wiz, `<h2>1. 어떤 제품을 어디서, 왜?</h2>
    <div class="field"><label for="w-prod">제품<span class="req">필수</span></label><select id="w-prod"><option>새봄 진정 세럼 50ml(예시)</option><option>새봄 수분 크림(예시)</option></select></div>
    <div class="card soft"><h3>크리에이터에게 보이는 제품 소개 ${b('B03')}</h3>
      <div class="grid g2"><div><p class="small muted">공개 정보 (초대 페이지·메일에 그대로 쓰여요)</p><p><b>새봄 진정 세럼(예시)</b> — 민감한 피부를 위한 가벼운 세럼</p><p class="small">사진 3장 ✓ · 판매 링크 ✓</p></div>
      <div><p class="small muted">내부 가이드 (크리에이터에게 보이지 않아요)</p><p class="small">금지 표현: “치료”, “완치” · 샘플 기준: 1인 1개</p></div></div>
      <p class="small">번역: 영어 ✓ · <span class="chip warn">태국어 설명 없음</span></p>${demoBtn('초대 페이지 미리보기', '', '실제 초대 페이지와 같은 내용을 미리 보여주는 자리입니다(시안).')}</div>
    <div class="field" style="margin-top:14px"><label for="w-country">국가<span class="req">필수</span></label><select id="w-country"><option>미국</option><option>태국</option></select></div>
    <div class="field"><span class="lab">목적<span class="req">필수</span></span><div class="radios">
      <label><input type="radio" name="w-goal" checked>영상 제작<small>제품을 보내고 영상 1개를 받아요.</small></label>
      <label><input type="radio" name="w-goal">판매<small>시작 준비가 끝나야 고를 수 있어요 (현재: 반품 정보 미입력).</small></label>
      <label><input type="radio" name="w-goal">체험만<small>제품만 보내고 영상은 요청하지 않아요.</small></label></div></div>`)}
  ${panel('wiz', 's2', wiz, `<h2>2. 무엇을 드릴까요?</h2>
    <div class="field"><span class="lab">보상 방식<span class="req">필수</span></span><div class="radios" data-chg="w-reward">
      <label><input type="radio" name="w-rw" value="fixed" ${wizReward === 'fixed' ? 'checked' : ''}>고정비<small>영상 1개당 정해진 금액</small></label>
      <label><input type="radio" name="w-rw" value="sales" ${wizReward === 'sales' ? 'checked' : ''}>판매 보상<small>확인된 판매금액의 일정 비율</small></label>
      <label><input type="radio" name="w-rw" value="gift" ${wizReward === 'gift' ? 'checked' : ''}>제품만<small>금액 없이 제품 제공</small></label></div></div>
    <div id="w-reward-fields">${wRewardFields()}</div>
    <div class="field"><label for="w-sample">샘플 수량<span class="req">필수</span></label><input id="w-sample" type="number" value="20" min="1"><span class="hint">정원과 같게 두는 것을 권해요. 예: 20</span></div>
    <div class="field"><span class="lab">샘플·배송비 부담</span><p>브랜드가 모두 부담해요. 크리에이터는 비용을 내지 않아요.</p></div>`)}
  ${panel('wiz', 's3', wiz, `<h2>3. 무엇을 언제까지 받을까요?</h2>
    <div class="field"><label for="w-cnt">영상 수<span class="req">필수</span></label><input id="w-cnt" type="number" value="1" min="1"></div>
    <div class="field"><label for="w-due">게시 기한<span class="req">필수</span></label><select id="w-due"><option>샘플을 받은 날부터 14일 안에</option><option>정해진 날짜까지</option></select><span class="hint">배송이 늦어지면 기한도 함께 늦춰져요.</span></div>
    <div class="field"><label for="w-rev">수정 요청 횟수<span class="req">필수</span></label><select id="w-rev"><option>최대 2회</option><option>최대 1회</option></select></div>
    <div class="field"><span class="lab">광고 사용권<span class="req">필수</span></span><div class="radios">
      <label><input type="radio" name="w-ad" checked>미포함<small>크리에이터 계정 게시만. 브랜드 광고에 쓰지 않아요.</small></label>
      <label><input type="radio" name="w-ad">포함<small>기간·국가·추가 금액을 따로 정해야 해요.</small></label></div></div>`)}
  ${panel('wiz', 's4', wiz, `<h2>4. 누가 지원할 수 있나요?</h2>
    <div class="field"><label for="w-live">거주 국가<span class="req">필수</span></label><select id="w-live"><option>미국</option></select></div>
    <div class="field"><label for="w-fol">팔로워 수<span class="opt">선택</span></label><input id="w-fol" type="text" placeholder="예: 1,000명 이상"></div>
    <div class="field"><label for="w-q">지원 질문<span class="opt">선택</span></label><input id="w-q" type="text" value="민감 피부 관련 영상을 올린 적이 있나요?"></div>
    <div class="field"><label for="w-cap">모집 정원<span class="req">필수</span></label><input id="w-cap" type="number" value="20"><span class="hint">정원을 넘겨 선정할 수 없어요.</span></div>`)}
  ${panel('wiz', 's5', wiz, `<h2>5. 크리에이터에게 이렇게 보여요</h2>
    <div class="cond"><h3>조건 요약 ${b('X02')} ${chip('조건 v1 · 초안', 'plum')}</h3>
      <div class="big"><div>받는 것<b>고정비 100 USD</b>+ 제품 1개</div><div>할 일<b>영상 1개</b>TikTok</div><div>기한<b>수령 후 14일</b>수정 최대 2회</div><div>광고 사용<b>미포함</b>계정 게시만</div></div>
      <p class="small">지급: 브랜드 검수 통과 후 14일 이내, 새봄뷰티(예시)가 지급 · 샘플·배송비 브랜드 부담</p>
      <p class="small muted">발행 후 조건을 바꾸면 ‘새 조건(v2)’으로 다시 제안되고, 이전 기록은 그대로 남아요.</p></div>
    <div class="alert info" style="margin-top:12px">발행하면: 커뮤니티 멤버 128명(예시)에게 · 영어로 · 앱 알림과 이메일이 가요.</div>`)}
  <div class="btns"><button type="button" class="btn" data-act="wiz-prev" ${wiz === 's1' ? 'disabled' : ''}>이전</button>
    ${wiz === 's5' ? demoBtn('발행하기', 'pri', '시안에서만 발행된 것처럼 보여요. 실제 공지·알림은 보내지 않습니다.') : '<button type="button" class="btn pri" data-act="wiz-next">다음</button>'}</div>
  <p class="ferr" id="w-err" hidden></p>
  </div>
  <div class="card soft"><h3>지금까지 정한 조건</h3><dl class="kv"><dt>제품</dt><dd>새봄 진정 세럼(예시)</dd><dt>국가</dt><dd>미국</dd><dt>보상</dt><dd>${wizReward === 'fixed' ? '고정비 100 USD' : wizReward === 'sales' ? '판매 보상(판매금액의 15%)' : '제품만'}</dd><dt>샘플</dt><dd>20개</dd><dt>영상</dt><dd>1개 · 수령 후 14일</dd><dt>광고 사용</dt><dd>미포함</dd></dl></div></div>`;
function wRewardFields() {
  if (wizReward === 'fixed') return `<div class="field"><label for="w-amt">금액<span class="req">필수</span></label><input id="w-amt" type="number" value="100"><span class="hint">통화: USD · 예: 100</span></div>
    <div class="field"><label for="w-pay">지급 기준<span class="req">필수</span></label><select id="w-pay"><option>브랜드 검수 통과 후 14일 이내</option><option>게시 확인 후 14일 이내</option></select></div>`;
  if (wizReward === 'sales') return `<div class="field"><label for="w-rate">판매 보상 비율<span class="req">필수</span></label><input id="w-rate" type="number" value="15"><span class="hint">판매 보상(판매금액의 15%) — 확인된 판매금액 기준. 지급은 TikTok에서 해요.</span></div>`;
  return `<p class="small">제품 1개만 드려요. 금액 보상은 없어요.</p>`;
}
CHG['w-reward'] = (el, e) => { wizReward = e.target.value; $('#w-reward-fields').innerHTML = wRewardFields(); };
TAB_HOOK.wiz = k => { if (wiz !== k) { wiz = k; render(); const t = $('[data-tabgroup="wiz"] [aria-selected="true"]'); if (t) t.focus(); } };
ACT['wiz-next'] = () => {
  if (wiz === 's2' && wizReward === 'fixed') {
    const a = $('#w-amt'); const err = !a.value || Number(a.value) <= 0;
    a.setAttribute('aria-invalid', String(err));
    let m = a.parentElement.querySelector('.ferr');
    if (err) { if (!m) { m = document.createElement('p'); m.className = 'ferr'; m.id = 'w-amt-err'; a.parentElement.appendChild(m); } m.textContent = '금액을 입력해 주세요. 예: 100'; a.setAttribute('aria-describedby', 'w-amt-err'); a.focus(); return; }
    if (m) m.remove();
  }
  const i = WSTEPS.findIndex(s => s[0] === wiz); wiz = WSTEPS[Math.min(i + 1, 4)][0]; render(); $('[data-tabgroup="wiz"] [aria-selected="true"]').focus();
};
ACT['wiz-prev'] = () => { const i = WSTEPS.findIndex(s => s[0] === wiz); wiz = WSTEPS[Math.max(i - 1, 0)][0]; render(); $('[data-tabgroup="wiz"] [aria-selected="true"]').focus(); };

/* ----- 초대할 사람 ----- */
RENDER['b-invite'] = () => `<div class="page-head"><div><h1>초대할 사람</h1><p>추천 이유를 보고 고르고, 지원자에게 결과를 알려요.</p></div></div>
  ${tabs('inv', [['rec', '추천 후보'], ['app', '지원한 사람 (24)'], ['bulk', '여러 명에게 메일']], 'rec')}
  ${panel('inv', 'rec', 'rec', `<h2>추천 후보 ${b('B05')}</h2>
    <div class="btns" style="margin-top:0">${['미국', '영어', 'TikTok', '스킨케어', '최근 30일 활동', '연락 가능'].map(f => `<span class="chip plum">${f} ✓</span>`).join(' ')}</div>
    <ul class="rows" style="margin-top:12px">
      <li class="rowi"><div class="grow"><b>민지(예시)</b> · @minji.daily · 팔로워 2.4만<div class="sub">추천 이유: 최근 30일 진정 세럼 리뷰 영상 2개 (링크 예시) · 출처: 공개 프로필, 10/20 조회</div><div class="sub">연락 기록 없음 · 수신 거부 아님</div></div>${demoBtn('선택', 'pri')}${demoBtn('보류', '', '보류 이유를 고르는 칸이 열립니다(시안).')}</li>
      <li class="rowi"><div class="grow"><b>Jordan(예시)</b> · 팔로워 8,100<div class="sub">추천 이유: 민감 피부 루틴 영상 1개 · 팔로워 수 <span class="chip">미확인</span></div><div class="sub">${chip('이미 연락함 · 10/12 답장 없음', 'warn')}</div></div>${demoBtn('선택', 'pri')}${demoBtn('제외', '', '제외 이유를 고르는 칸이 열립니다(시안).')}</li>
      <li class="rowi"><div class="grow"><b>Lena(예시)</b><div class="sub">${chip('수신 거부', 'err')} 메일을 보낼 수 없어요.</div></div><button type="button" class="btn" disabled>선택 불가</button></li></ul>
    <div class="alert info">선택 2명 · 다음 단계: 제안 메일 쓰기 ${demoBtn('제안 쓰기', 'pri')}</div>`)}
  ${panel('inv', 'app', 'rec', `<h2>지원한 사람 ${b('B08')}</h2>
    <div class="alert warn">정원 20명 중 선정 제안 18명. 선정 제안은 크리에이터가 수락하기 전까지 <b>확정이 아니에요</b>. 결과 약속: 내일 18:00까지.</div>
    <ul class="rows">
      <li class="rowi"><div class="grow"><b>Ava(예시)</b> · 10/21 지원 · 미국<div class="sub">최근 관련 영상 3개 · 동의한 조건: v1</div></div>${chip('검토 전')}${demoBtn('선정 제안', 'pri')}${demoBtn('미선정', '')}</li>
      <li class="rowi"><div class="grow"><b>Noah(예시)</b> · 10/20 지원<div class="sub">질문: “촬영을 주말에 해도 되나요?”</div></div>${chip('질문 있음', 'info')}${demoBtn('답하기')}</li>
      <li class="rowi"><div class="grow"><b>Mia(예시)</b><div class="sub">10/22 크리에이터가 철회</div></div>${chip('철회')}</li></ul>
    <div class="card soft" style="margin-top:12px"><h3>미선정 결과 문구 미리보기</h3><p class="small">“지원해 주셔서 감사해요. 이번에는 정원이 차서 함께하지 못하게 됐어요. 다음 협업이 열리면 알려 드릴게요.”</p>${demoBtn('선택한 6명에게 결과 알리기', 'pri', '시안에서는 알림을 보내지 않아요.')}</div>`)}
  ${panel('inv', 'bulk', 'rec', `<h2>여러 명에게 메일 ${b('B06')}</h2>
    <ol class="steps" style="list-style:none"><li>${chip('1 연결 ✓', 'ok')}</li><li>${chip('2 대상 ✓', 'ok')}</li><li>${chip('3 내용 ✓', 'ok')}</li><li>${chip('4 검수 중', 'warn')}</li><li>${chip('5 보내기')}</li></ol>
    <div class="grid g2"><div class="card soft"><h3>보내는 메일 연결</h3><p class="small">brand@saebom.example(예시) · 마지막 보내기 성공 10/25 09:12 · 마지막 받기 성공 10/25 09:10</p></div>
    <div class="card soft"><h3>대상 200명 → 163명</h3><ul class="small"><li>중복 12명</li><li>수신 거부 9명</li><li>최근 30일 연락함 14명</li><li>주소 형식 오류 2명</li></ul></div></div>
    <div class="card" style="margin-top:12px"><h3>받는 사람별 미리보기 (3명 표본)</h3><p class="small"><b>민지(예시)</b> — 제목: “새봄 진정 세럼 영상 협업 제안” · 선정 이유: 최근 세럼 리뷰</p><p class="small"><b>Ava(예시)</b> — ${chip('선정 이유 비어 있음', 'err')} 보내기 전에 채워 주세요.</p></div>
    <div class="btns"><button type="button" class="btn pri" disabled>163명에게 보내기 (검수 후 가능)</button><span class="small muted">시안에서는 메일을 보내지 않아요.</span></div>`)}`;

/* ----- 답장하기 ----- */
RENDER['b-reply'] = () => `<div class="page-head"><div><h1>답장하기 ${b('B07')}</h1><p>답장마다 어떤 협업인지, 다음에 무엇을 할지 함께 보여요.</p></div></div>
  <div class="three">
    <div class="card"><h3>답장 순서</h3>${tabs('rq', [['mine', '내 업무 4'], ['none', '담당 없음 2'], ['late', '기한 지남 1']], 'mine')}
      <ul class="rows"><li class="rowi" style="border-color:var(--plum2)"><div class="grow"><b>민지(예시)</b><div class="sub">가격 문의 · 26시간 대기</div></div></li>
      <li class="rowi"><div class="grow"><b>Jordan(예시)</b><div class="sub">샘플 질문 · 9시간</div></div></li>
      <li class="rowi"><div class="grow"><b>Ken(예시)</b><div class="sub">거절 · 답장 불필요</div></div></li></ul></div>
    <div class="card"><h3>민지(예시)와의 대화</h3>
      <div class="alert warn">수진(예시)님이 이 대화에 답장을 쓰는 중이에요. 보내기 전에 최신 내용을 다시 확인해요.</div>
      <div class="msg"><p class="small muted">원문 (영어) · 10/24 07:10</p><p>Hi! Is the 100 USD per video, and do I need to give ad rights?</p><p class="small muted">번역: 영상 1개당 100 USD인가요? 광고 사용권도 드려야 하나요?</p></div>
      <div class="field"><label for="r-kind">분류<span class="opt">수정 가능</span></label><select id="r-kind"><option>가격 질문</option><option>관심 있음</option><option>주소 요청</option><option>거절</option></select></div>
      <div class="card soft"><h3>AI 초안 — 검토 필요 ${b('B12')}</h3>
        <p>“네, 영상 1개당 100 USD이고, 이번 협업은 광고 사용권이 포함되지 않아요. 크리에이터님 계정에만 게시해 주시면 돼요.”</p>
        <p class="small muted">근거: 협업 조건 v1 · 제품 소개 v3 · 사용한 대화: 이 메일 1통(직접 선택)</p>
        <p class="small">${chip('모르는 내용', 'warn')} 주말 촬영 가능 여부 — 담당자가 확인해 주세요.</p>
        <div class="btns">${demoBtn('고쳐 쓰기')}${demoBtn('확인하고 보내기', 'pri', '시안에서는 실제로 보내지 않아요.')}</div></div></div>
    <div class="card soft"><h3>이 대화의 협업</h3><dl class="kv"><dt>협업</dt><dd>진정 세럼 미국 영상</dd><dt>조건</dt><dd>v1 · 고정비 100 USD</dd><dt>단계</dt><dd>조건 협의 중</dd><dt>담당</dt><dd>지윤(예시)</dd><dt>다음 할 일</dt><dd>가격·광고 사용 답하기</dd></dl>
      <p class="small muted">같은 이메일 주소라도 다른 사람·협업으로 자동 합치지 않아요.</p></div>
  </div>`;

/* ----- 샘플·영상 ----- */
RENDER['b-samples'] = () => `<div class="page-head"><div><h1>샘플·영상</h1><p>배송이 늦으면 영상 기한도 함께 조정해요.</p></div></div>
  ${tabs('smp', [['ship', '배송'], ['rev', '영상 확인']], 'ship')}
  ${panel('smp', 'ship', 'ship', `<h2>배송 보드 ${b('B09')}</h2><p class="small muted">주소 보기·내려받기는 목적과 함께 기록돼요.</p>
    <div class="board">
      <div class="col"><h4>주소 누락 <span>2</span></h4><div class="mini"><b>Ava(예시)</b><br>3일째 미입력 ${demoBtn('다시 요청')}</div></div>
      <div class="col"><h4>출고 준비 <span>5</span></h4><div class="mini"><b>Noah(예시)</b><br>주소 확인됨(v2) ${demoBtn('송장 입력')}</div></div>
      <div class="col"><h4>배송 중 <span>8</span></h4><div class="mini"><b>민지(예시)</b><br>USPS(예시) · 도착 예정 10/28</div></div>
      <div class="col"><h4>받음 <span>4</span></h4><div class="mini"><b>Lena(예시)</b><br>10/18 수령 → 영상 기한 11/1</div></div>
      <div class="col"><h4>지연·분실 <span>1</span></h4><div class="mini"><b>Chris(예시)</b><br>${chip('지연', 'err')} 예정 10/20 → 미도착<br>영상 기한 11/3 영향 ${demoBtn('기한 변경 요청 보내기', 'pri', '양쪽 기한 변경 요청 — 시안에서만 표시돼요.')}</div></div>
    </div>`)}
  ${panel('smp', 'rev', 'ship', `<h2>영상 확인 ${b('B10')}</h2>
    <div class="grid g2"><div><div class="video-ph">영상 미리보기 자리<br>(Lena(예시) 수정본 v2)</div>
      <p class="small" style="margin-top:8px">${chip('브랜드 확인 대기', 'warn')} ${chip('실제 게시 미확인')} ${chip('광고 사용권 없음')} ${chip('지급 확인 전')}</p>
      <p class="small">${chip('자동 점검 실행 안 됨', 'warn')} 결과가 없으니 직접 확인해 주세요.</p></div>
    <div><dl class="kv"><dt>합의 조건</dt><dd>v1 · 영상 1개 · 수정 최대 2회</dd><dt>남은 수정</dt><dd>1회</dd><dt>이전 요청</dt><dd>v1: 0:05–0:09 제품 이름 발음 (필수)</dd></dl>
      <div class="field" style="margin-top:12px"><span class="lab">결정<span class="req">필수</span></span><div class="radios">
        <label><input type="radio" name="rv-d">통과</label><label><input type="radio" name="rv-d" checked>수정 요청<small>구간·이유·필수 여부·새 기한을 적어요.</small></label><label><input type="radio" name="rv-d">확인 보류</label></div></div>
      <div class="field"><label for="rv-seg">구간<span class="req">필수</span></label><input id="rv-seg" type="text" value="0:12–0:15"></div>
      <div class="field"><label for="rv-why">이유<span class="req">필수</span></label><input id="rv-why" type="text" value="‘피부 치료’ 표현을 ‘피부 진정’으로"></div>
      ${demoBtn('수정 요청 보내기 (남은 횟수 1→0)', 'pri')}</div></div>`)}`;

/* ----- 우리 커뮤니티 ----- */
RENDER['b-community'] = () => `<div class="page-head"><div><h1>우리 커뮤니티 ${b('B11')}</h1><p>새 멤버를 맞고 질문에 답하고 공지를 보내요.</p></div></div>
  ${tabs('cm', [['q', '질문 3'], ['n', '공지'], ['m', '멤버 128']], 'q')}
  ${panel('cm', 'q', 'q', `<ul class="rows">
    <li class="rowi"><div class="grow"><b>“샘플은 언제 와요?”</b><div class="sub">Ava(예시) · 시작 안내 채널 · 5시간 전</div></div>${chip('답변 없음', 'warn')}${demoBtn('나에게 배정')}${demoBtn('답하고 자주 묻는 질문으로', 'pri')}</li>
    <li class="rowi"><div class="grow"><b>“해시태그는 꼭 넣어야 하나요?”</b><div class="sub">담당: 수진(예시)</div></div>${chip('답변함', 'ok')}<button type="button" class="btn ghost" data-demo="답변이 달린 원래 위치로 이동합니다(시안).">원래 위치</button></li></ul>`)}
  ${panel('cm', 'n', 'q', `<div class="card soft"><h3>예약된 공지</h3><dl class="kv"><dt>제목</dt><dd>진정 세럼 영상 협업이 열렸어요</dd><dt>대상</dt><dd>미국 멤버 · 영어</dd><dt>예약</dt><dd>10/26 10:00 (뉴욕 시간)</dd><dt>연결 협업</dt><dd>진정 세럼 미국 영상</dd><dt>읽음</dt><dd>아직 보내지 않음</dd></dl></div>`)}
  ${panel('cm', 'm', 'q', `<ul class="rows"><li class="rowi"><div class="grow"><b>민지(예시)</b><div class="sub">10/02 가입 · 관심: 세럼 · 미국/영어 · 단계: 조건 협의 · 최근 기여: 답변 2개</div></div>${chip('다음: 조건 답장', 'info')}</li>
    <li class="rowi"><div class="grow"><b>Ken(예시)</b><div class="sub">30일 활동 없음</div></div>${chip('휴면')}</li></ul>
    <p class="small muted">개인 보상·주소는 공개 순위에 표시하지 않아요.</p>`)}`;

/* ----- 결과 보기 ----- */
RENDER['b-results'] = () => {
  const f = [['지원', 120], ['조건 합의', 20], ['샘플 받음', 18], ['영상 확인 통과', 15], ['실제 게시', 14], ['지급 확인', 12]];
  return `<div class="page-head"><div><h1>결과 보기 ${b('B13')}</h1><p>진정 세럼 미국 영상 · 9/20–10/25 · 숫자는 모두 예시</p></div>${demoBtn('근거 파일 올리기', '', '파일 컬럼·기간·통화·중복을 먼저 미리보기 하는 단계입니다(시안).')}</div>
  <div class="split"><div class="card"><h3>어디까지 왔나요</h3><div class="funnel">${f.map(([l, n]) => `<div class="bar"><span>${l}</span><span class="track"><span class="fill" style="width:${n / 1.2}%;display:block"></span></span><b>${n}</b></div>`).join('')}</div>
    <hr><dl class="kv"><dt>확인된 판매금액</dt><dd>2,840 USD</dd><dt>판매 보상</dt><dd>426 USD (판매금액의 15%)</dd><dt>주문 / 반품</dt><dd>63건 / 4건</dd></dl><button type="button" class="btn ghost" data-demo="이 숫자를 만든 주문 행으로 이동합니다(시안).">근거 행 보기</button></div>
  <div class="card"><h3>들어간 비용</h3><dl class="kv"><dt>제품 원가</dt><dd>360 USD</dd><dt>고정비</dt><dd>1,400 USD</dd><dt>배송</dt><dd>310 USD</dd><dt>운영 시간</dt><dd>18시간</dd><dt>광고·수수료</dt><dd>0 USD</dd></dl></div></div>
  <div class="card" style="margin-top:16px"><h3>다시 함께할 사람</h3><ul class="rows">
    <li class="rowi"><div class="grow"><b>Lena(예시)</b><div class="sub">기한 지킴 · 수정 1회 · 미지급 없음 · 광고 사용권 없음</div></div>${demoBtn('다음 제안 쓰기', 'pri')}</li>
    <li class="rowi"><div class="grow"><b>Chris(예시)</b><div class="sub">배송 지연으로 기한 변경 · ${chip('지급 확인 필요', 'warn')}</div></div>${demoBtn('지급 먼저 확인')}</li></ul></div>`;
};

/* ----- 팀·설정 ----- */
RENDER['b-team'] = () => `<div class="page-head"><div><h1>팀·설정 ${b('B14')}</h1><p>대행사 <b>블루웨이브(예시)</b> · 현재 고객 브랜드 <b>새봄뷰티(예시)</b></p></div>
  <label class="field" style="margin:0"><span class="lab">고객 브랜드 바꾸기</span><select><option>새봄뷰티(예시)</option><option>하루한잔(예시)</option></select><span class="hint">권한이 있는 브랜드만 보여요.</span></label></div>
  <div class="grid g2"><div class="card"><h3>팀</h3><ul class="rows">
    <li class="rowi"><div class="grow"><b>지윤(예시)</b><div class="sub">실무자 · 협업 만들기·답장</div></div>${chip('실무자', 'plum')}</li>
    <li class="rowi"><div class="grow"><b>새봄 마케팅팀장(예시)</b><div class="sub">고객사 · 예산·발행 승인</div></div>${chip('승인자', 'info')}</li>
    <li class="rowi"><div class="grow"><b>새봄 대표(예시)</b><div class="sub">고객사 · 결과만 보기</div></div>${chip('보기만')}</li></ul></div>
  <div class="card"><h3>승인함</h3><ul class="rows">
    <li class="rowi"><div class="grow"><b>예산 200 USD 추가</b><div class="sub">요청 지윤(예시) · 10/27까지 · 이유: 정원 2명 추가</div></div>${chip('고객 승인 대기', 'warn')}</li>
    <li class="rowi"><div class="grow"><b>163명 메일 보내기</b><div class="sub">보완 요청: “제목에서 할인 문구 빼 주세요”</div></div>${chip('보완 필요', 'err')}${demoBtn('고쳐서 다시 올리기')}</li></ul></div></div>`;

/* =====================================================================
   크리에이터 시안 (6화면 + 레이어)
   ===================================================================== */
let cZero = 'none';
RENDER['c-campaigns'] = () => `<div class="creator-wrap"><div class="page-head"><div><h1>참여할 협업 ${b('C03')}</h1><p>새봄뷰티(예시) 커뮤니티 협업 3개 · <button type="button" class="btn ghost" data-demo="참여 중인 모든 브랜드의 협업을 보여 줍니다(시안).">참여 브랜드 전체 보기</button></p></div></div>
  <div class="btns" style="margin-top:0">${['미국', 'TikTok', '고정비', '샘플 있음', '2주 안'].map(f => `<span class="chip plum">${f} ✓</span>`).join(' ')}</div>
  <div class="btns"><span class="small muted">빈 결과 예시 보기:</span><button type="button" class="btn" data-act="c-zero" data-k="filter">필터 결과 0건</button><button type="button" class="btn" data-act="c-zero" data-k="error">불러오기 실패</button><button type="button" class="btn ghost" data-act="c-zero" data-k="none">원래대로</button></div>
  ${cZero === 'filter' ? `<div class="alert info">조건에 맞는 협업이 <b>0건</b>이에요. 브랜드에 협업이 없는 게 아니라 필터 때문이에요. ${demoBtn('필터 모두 해제')} ${demoBtn('새 협업 알림 받기')}</div>` : ''}
  ${cZero === 'error' ? `<div class="alert err">협업 목록을 <b>불러오지 못했어요</b>. 0건이 아니에요. ${demoBtn('다시 시도')} ${demoBtn('문의하기')}</div>` : ''}
  ${cZero === 'none' ? `<div class="grid" style="margin-top:12px">
    <div class="card"><h3>새봄 진정 세럼 영상 1개 ${b('C01')}</h3><p class="small muted">새봄뷰티(예시) · 모집 마감 10/30 · 남은 자리 6</p>
      <dl class="kv"><dt>받는 것</dt><dd>100 USD + 제품 1개</dd><dt>할 일</dt><dd>TikTok 영상 1개</dd><dt>기한</dt><dd>제품 받은 날부터 14일</dd><dt>광고 사용</dt><dd>없음 (내 계정 게시만)</dd><dt>내 비용</dt><dd>없음 (배송비 브랜드 부담)</dd></dl>
      <div class="btns">${sheetBtn('조건 보고 지원하기', 'c-detail', 'pri')}${demoBtn('저장')}</div></div>
    <div class="card"><h3>새봄 수분 크림 판매 협업</h3><dl class="kv"><dt>받는 것</dt><dd>판매 보상(판매금액의 15%)</dd><dt>할 일</dt><dd>영상 1개 + 상품 연결</dd></dl>
      <div class="alert warn">아직 지원할 수 없어요. 이유: TikTok Shop 판매 보상 자격이 <b>확인 중</b>이에요. ${goBtn('내 정보에서 확인', 'c-profile')}</div></div>
    <div class="card"><h3>태국 거주자 체험단</h3><div class="alert info">태국 거주자만 지원할 수 있어요. 내 국가(미국)와 달라요. ${demoBtn('미국 대상 다른 기회 보기')}</div></div></div>` : ''}</div>`;
ACT['c-zero'] = el => { cZero = el.dataset.k; render(); };

let cTab = 'doing';
RENDER['c-tasks'] = () => `<div class="creator-wrap"><div class="page-head"><div><h1>내 할 일</h1><p>오늘 10/25 · 뉴욕 시간(ET)</p></div></div>
  <div class="alert info"><b>새봄뷰티(예시)</b>: 선정 제안이 왔어요 · 진정 세럼 영상 ${b('X03')}<br>${sheetBtn('제안 조건 확인하기', 'c-offer', 'pri')} <span class="small">알림을 누르면 이 협업이 바로 열려요.</span></div>
  ${tabs('ct', [['apply', '신청 3'], ['doing', '진행 4'], ['done', '완료 1']], cTab)}
  ${panel('ct', 'doing', cTab, `<h2>내가 할 일 ${b('C06')}</h2><ul class="rows">
      <li class="rowi"><div class="grow"><b>주소 입력하기</b><div class="sub">새봄뷰티(예시) · 오늘 23:59 (ET)까지 · 이유: 주소가 있어야 샘플이 출발해요</div></div>${sheetBtn('주소 입력', 'c-address', 'pri')}<span>${b('C07')}</span></li>
      <li class="rowi"><div class="grow"><b>영상 수정본 내기</b><div class="sub">Glowlab(예시) · 11/2 18:00 (ET)까지 · 남은 수정 1회</div></div>${sheetBtn('제출·수정', 'c-submit', 'pri')}<span>${b('C08')}</span></li></ul>
    <h2 style="margin-top:16px">브랜드 답변 기다림</h2><ul class="rows"><li class="rowi"><div class="grow"><b>주말 촬영 질문</b><div class="sub">새봄뷰티(예시)가 답할 차례 · 2일째</div></div>${demoBtn('다시 묻기')}</li></ul>
    <h2 style="margin-top:16px">배송 중</h2><ul class="rows"><li class="rowi"><div class="grow"><b>Glowlab 토너(예시)</b><div class="sub">USPS(예시) · 도착 예정 10/28 · 10/25 08:00 확인</div></div>${demoBtn('배송 조회')}${demoBtn('배송 문제 알리기')}</li></ul>`)}
  ${panel('ct', 'apply', cTab, `<h2>신청 기록 ${b('C04')}</h2><p class="small muted">모집이 끝나도 신청 기록은 남아요.</p><ul class="rows">
      <li class="rowi"><div class="grow"><b>새봄 진정 세럼 영상</b><div class="sub">신청번호 AP-1042(예시) · 10/21 제출 · 조건 v1 · 결과 예정 10/29</div></div>${chip('검토 중', 'info')}${demoBtn('신청 철회', 'danger', '철회하면 이 협업에 다시 지원할 수 없어요. 시안에서만 표시합니다.')}</li>
      <li class="rowi"><div class="grow"><b>하루한잔 티 체험(예시)</b><div class="sub">결과가 늦어져요 → 새 예정 10/31 · 이유: 지원자가 많아요</div></div>${chip('검토 지연', 'warn')}</li>
      <li class="rowi"><div class="grow"><b>Glowlab 선크림(예시)</b><div class="sub">모집 마감 · 이번엔 다른 피부 타입을 우선 선정했어요</div></div>${chip('미선정')}</li></ul>`)}
  ${panel('ct', 'done', cTab, `<ul class="rows"><li class="rowi"><div class="grow"><b>수분 크림 체험</b><div class="sub">완료 · 보상 100 USD ${chip('지급 대기', 'warn')}</div></div>${sheetBtn('보상 보기', 'c-reward')}</li></ul>`)}
  <p class="small muted" style="margin-top:12px">조건 확인 ${b('C05')} → 주소 → 제출·수정 → 보상 순서로 이어져요.</p></div>`;
TAB_HOOK.ct = k => { cTab = k; };

RENDER['c-messages'] = () => `<div class="creator-wrap"><div class="page-head"><div><h1>메시지</h1><p>브랜드와 나눈 대화</p></div>${sheetBtn('도움 요청·신고', 'c-help', 'pri')}</div>
  <ul class="rows"><li class="rowi"><div class="grow"><b>새봄뷰티(예시)</b><div class="sub">“주말 촬영 괜찮은지 확인해 드릴게요.” · 브랜드가 답할 차례</div></div></li>
  <li class="rowi"><div class="grow"><b>Glowlab(예시)</b><div class="sub">수정 요청: 0:12–0:15 표현 변경</div></div></li></ul>
  <div class="card" style="margin-top:16px"><h3>내 문의 ${b('C12')}</h3><ul class="rows">
    <li class="rowi"><div class="grow"><b>HP-2201(예시) · 보상이 안 들어왔어요</b><div class="sub">접수 10/24 · 담당 운영팀 · 답변 예정 10/27</div></div>${chip('확인 중', 'info')}</li>
    <li class="rowi"><div class="grow"><b>HP-2188(예시) · 메시지 신고</b><div class="sub">처리 완료 · 해당 메시지 숨김 · 이의 신청 가능 11/1까지</div></div>${chip('처리됨', 'ok')}</li></ul>
    <p class="small muted">브랜드 커뮤니티 나가기, 계정 삭제, 진행 협업 취소, 메일 수신 거부는 각각 다른 일이에요.</p></div></div>`;

RENDER['c-community'] = () => `<div class="creator-wrap"><div class="page-head"><div><h1>커뮤니티 ${b('C11')}</h1><p>새봄뷰티(예시) 커뮤니티</p></div></div>
  <div class="card primary-card"><h3>환영해요, 민지(예시)님</h3><p>운영 시간: 평일 9–18시 (ET). 질문은 ‘질문’ 채널에 남기면 하루 안에 답해요.</p><p><b>지금 지원할 수 있는 협업 1개</b> — 진정 세럼 영상 · 마감 10/30</p>${goBtn('협업 보기', 'c-campaigns', 'pri')}</div>
  <div class="card" style="margin-top:12px"><h3>미션</h3><ul class="check">
    <li><span class="ic ok">✓</span><div>자기소개 남기기 <span class="small muted">달성</span></div></li>
    <li><span class="ic wait">…</span><div>첫 영상 올리기 <span class="small muted">· 조건 대기: 샘플을 받으면 시작돼요</span></div></li>
    <li><span class="ic todo">○</span><div>다른 멤버 질문에 답하기 <span class="small muted">· 지금 가능</span></div></li></ul>
    <div class="radios" style="margin-top:12px"><label><input type="checkbox" checked> 순위에 내 이름 숨기기</label></div>
    <p class="small muted">기여 점수, 우수 영상, 판매 결과는 따로 표시해요.</p></div></div>`;

RENDER['c-rewards'] = () => `<div class="creator-wrap"><div class="page-head"><div><h1>받을 보상 ${b('C09')}</h1><p>‘지급 대기’는 아직 받지 않은 돈이에요.</p></div></div>
  <div class="grid g3"><div class="stat"><span class="l">지급 대기</span><br><span class="n">100 USD</span><br><span class="s">아직 받지 않음</span></div><div class="stat"><span class="l">지급 완료</span><br><span class="n">0 USD</span><br><span class="s">받은 것이 확인됨</span></div><div class="stat"><span class="l">판매 보상 예정</span><br><span class="n">36 USD</span><br><span class="s">TikTok에서 지급</span></div></div>
  <ul class="rows" style="margin-top:16px">
    <li class="rowi"><div class="grow"><b>수분 크림 체험 · 고정비 100 USD</b><div class="sub">지급: 새봄뷰티(예시) · 조건: 브랜드 확인 통과 후 14일 이내 · 예정 11/8</div></div>${chip('지급 대기', 'warn')}${sheetBtn('자세히', 'c-reward')}</li>
    <li class="rowi"><div class="grow"><b>판매 보상(판매금액의 15%)</b><div class="sub">확인된 판매금액 240 USD × 15% = 36 USD · 주문 확정 후 TikTok이 지급</div></div>${chip('주문 확정 대기', 'info')}</li></ul></div>`;

RENDER['c-profile'] = () => `<div class="creator-wrap"><div class="page-head"><div><h1>내 정보</h1><p>언어·계정·참여 자격</p></div></div>
  <div class="card"><h3>언어 ${b('C10')}</h3>
    <div class="field"><label for="p-ui">화면 언어</label><select id="p-ui"><option>English</option><option>한국어</option><option>ไทย (아직 없음 → English로 표시)</option></select></div>
    <div class="field"><label for="p-tr">메시지 번역 언어</label><select id="p-tr"><option>ไทย</option><option>English</option></select><span class="hint">화면 언어와 따로 저장돼요.</span></div>
    <div class="field"><label for="p-tz">시간대</label><select id="p-tz"><option>뉴욕 (ET)</option><option>방콕 (ICT)</option></select></div></div>
  <div class="card" style="margin-top:12px"><h3>내 계정과 참여 자격 ${b('C02')}</h3><ul class="rows">
    <li class="rowi"><div class="grow"><b>TikTok @minji.daily</b><div class="sub">계정 주인 확인 ${chip('확인됨', 'ok')} · 판매 보상 자격 ${chip('확인 중 · 예상 3일', 'warn')} · 새봄뷰티 참여 ${chip('가능', 'ok')}</div></div></li>
    <li class="rowi"><div class="grow"><b>Instagram</b><div class="sub">영상 제작 협업만 가능 · 담당자가 직접 확인해요 (예상 5일)</div></div>${demoBtn('계정 추가')}</li></ul>
    <p class="small muted">기다리는 동안 할 수 있는 일: 자기소개 작성, 커뮤니티 질문 보기</p></div></div>`;

/* ----- 크리에이터 레이어 ----- */
SHEETS['c-detail'] = { title: '새봄 진정 세럼 영상 1개', html: () => `<p class="small muted">새봄뷰티(예시) · 민감 피부용 스킨케어 브랜드</p>${b('C01', { noId: true })}
  <div class="cond"><div class="big"><div>받는 것<b>100 USD</b>+ 제품 1개</div><div>할 일<b>영상 1개</b>TikTok</div><div>기한<b>받은 뒤 14일</b>수정 최대 2회</div><div>광고 사용<b>없음</b>내 계정만</div></div>
  <p class="small">배송: 미국 안 · 비용 없음 · 지급: 브랜드 확인 통과 후 14일 이내</p></div>
  <h3 style="margin-top:14px">순서</h3><ol class="small"><li><b>지원</b> — 지금 하는 일. 아직 약속이 아니에요.</li><li><b>선정 제안</b> — 브랜드가 고르면 알려 드려요.</li><li><b>조건 합의</b> — 조건을 보고 수락해야 확정돼요.</li></ol>
  <p class="small muted">로그인하면 이 화면으로 다시 돌아와요.</p>
  <div class="btns"><button type="button" class="btn pri" data-sheet="c-applied">지원하기</button><button type="button" class="btn" data-close-sheet>닫기</button></div>` };
SHEETS['c-applied'] = { title: '신청이 접수됐어요', html: () => `<div class="alert ok">신청번호 <b>AP-1042(예시)</b> · 10/25 21:04 (ET) 제출 · 조건 v1</div>
  <dl class="kv"><dt>결과 예정</dt><dd>10/29까지</dd><dt>지금 차례</dt><dd>브랜드가 검토 중</dd><dt>문의</dt><dd>메시지 › 새봄뷰티(예시)</dd></dl>
  <div class="btns"><button type="button" class="btn pri" data-go="c-tasks">신청 기록 보기</button></div>` };
SHEETS['c-offer'] = { title: '선정 제안 조건', html: () => `${b('C05', { noId: true })} ${chip('조건 v2', 'plum')} <span class="small">바뀐 점: 기한 10일 → <b>14일</b></span>
  <dl class="kv" style="margin-top:10px"><dt>보상</dt><dd>100 USD (미국 달러)</dd><dt>지급</dt><dd>새봄뷰티(예시)가 브랜드 확인 통과 후 14일 이내</dd><dt>샘플</dt><dd>무료 · 배송비 브랜드 부담</dd><dt>할 일</dt><dd>TikTok 영상 1개 · 수정 최대 2회</dd><dt>기한</dt><dd>받은 날부터 14일</dd></dl>
  <div class="card soft" style="margin-top:12px"><h3>내 영상 사용 범위</h3><dl class="kv"><dt>내 계정 게시</dt><dd>예</dd><dt>브랜드 광고 사용</dt><dd>아니요 — 광고 코드도 요청하지 않아요</dd><dt>원본 파일 제공</dt><dd>아니요</dd><dt>다른 브랜드 제한</dt><dd>없음</dd></dl></div>
  <button type="button" class="btn ghost" data-demo="원문(영어)과 번역을 나란히 보여 줍니다(시안).">원문과 번역 나란히 보기</button>
  <div class="btns"><button type="button" class="btn pri" data-sheet="c-address">수락하고 주소 입력</button>${demoBtn('질문하기')}${demoBtn('거절', 'danger')}</div>` };
let addrCountry = 'US';
function addrFields() {
  return addrCountry === 'US' ? `<div class="field"><label for="a-l1">도로명 주소<span class="req">필수</span></label><input id="a-l1" type="text" placeholder="예: 123 Main St Apt 4B"></div>
    <div class="field"><label for="a-city">도시<span class="req">필수</span></label><input id="a-city" type="text" placeholder="예: Brooklyn"></div>
    <div class="field"><label for="a-st">주(State)<span class="req">필수</span></label><input id="a-st" type="text" placeholder="예: NY"></div>
    <div class="field"><label for="a-zip">ZIP 코드<span class="req">필수</span></label><input id="a-zip" type="text" inputmode="numeric" placeholder="예: 11201"></div>
    <div class="field"><label for="a-ph">전화번호<span class="opt">선택</span></label><input id="a-ph" type="text" placeholder="+1 555 010 0000"></div>`
    : `<div class="field"><label for="a-l1">상세 주소<span class="req">필수</span></label><input id="a-l1" type="text" placeholder="예: 99/1 Sukhumvit Rd"></div>
    <div class="field"><label for="a-city">구(District)<span class="req">필수</span></label><input id="a-city" type="text" placeholder="예: Khlong Toei"></div>
    <div class="field"><label for="a-st">도(Province)<span class="req">필수</span></label><input id="a-st" type="text" placeholder="예: Bangkok"></div>
    <div class="field"><label for="a-zip">우편번호<span class="req">필수</span></label><input id="a-zip" type="text" inputmode="numeric" placeholder="예: 10110"></div>
    <div class="field"><label for="a-ph">전화번호<span class="req">필수</span></label><input id="a-ph" type="text" placeholder="+66 81 000 0000"></div>`;
}
SHEETS['c-address'] = { title: '샘플 받을 주소', html: () => `${b('C07', { noId: true })}<p class="small">이 주소는 <b>새봄뷰티(예시) 배송 담당</b>에게만, 샘플 발송 목적으로 전달돼요. 출고 전에는 직접 고칠 수 있어요.</p>
  <div class="field"><label for="a-c">국가<span class="req">필수</span></label><select id="a-c" data-chg="addr-country"><option value="US" ${addrCountry === 'US' ? 'selected' : ''}>미국</option><option value="TH" ${addrCountry === 'TH' ? 'selected' : ''}>태국</option></select></div>
  <div class="radios"><label><input type="checkbox"> 지난 협업 주소 불러오기 (직접 선택할 때만)</label></div>
  <div id="addr-fields" style="margin-top:12px">${addrFields()}</div>
  <div class="btns"><button type="button" class="btn pri" data-act="addr-save">주소 확인하고 보내기</button></div>
  <p class="small muted">출고 후 주소를 바꾸려면 브랜드 담당자에게 변경 요청을 보내요.</p>` };
CHG['addr-country'] = (el, e) => { addrCountry = e.target.value; $('#addr-fields').innerHTML = addrFields(); };
ACT['addr-save'] = () => {
  const req = $$('#addr-fields .field').filter(f => f.querySelector('.req')).map(f => f.querySelector('input'));
  let first = null;
  req.forEach(i => {
    const bad = !i.value.trim(); i.setAttribute('aria-invalid', String(bad));
    let m = i.parentElement.querySelector('.ferr');
    if (bad) { if (!m) { m = document.createElement('p'); m.className = 'ferr'; m.id = i.id + '-err'; i.parentElement.appendChild(m); i.setAttribute('aria-describedby', m.id); } m.textContent = '이 칸을 채워 주세요. 예시를 참고하세요.'; first = first || i; }
    else if (m) m.remove();
  });
  if (first) { first.focus(); return; }
  toast('주소가 확인된 것처럼 보이는 시안이에요. 실제로 전달되지 않습니다.'); closeDialog($('#pd-sheet'));
};
SHEETS['c-submit'] = { title: '영상 제출·수정', html: () => `${b('C08', { noId: true })}
  <ol class="steps" style="list-style:none"><li>${chip('1 검토본 ✓', 'ok')}</li><li>${chip('2 수정본 — 지금', 'warn')}</li><li>${chip('3 게시 링크')}</li></ol>
  <div class="card soft"><h3>받은 수정 요청 (v1 → v2)</h3><p class="small"><b>0:12–0:15</b> ‘피부 치료’ → ‘피부 진정’ <span class="chip err">필수</span></p><p class="small">남은 수정 1회 · 새 기한 11/2 18:00 (ET)</p></div>
  <div class="field" style="margin-top:12px"><label for="s-link">수정본 링크<span class="req">필수</span></label><input id="s-link" type="url" placeholder="예: https://drive.example/v2"><span class="hint">공유 링크 또는 파일 (MP4, 500MB까지)</span></div>
  <div class="field"><label for="s-cap">캡션<span class="opt">선택</span></label><textarea id="s-cap"></textarea></div>
  <div class="btns"><button type="button" class="btn pri" data-act="submit-demo">수정본 제출</button></div><div id="s-result"></div>` };
ACT['submit-demo'] = () => {
  $('#s-result').innerHTML = `<div class="alert ok"><b>제출 완료</b> (시안) — 브랜드가 확인할 차례예요.</div><div class="alert warn">메모 전달은 실패했어요. 영상은 다시 낼 필요 없어요. ${demoBtn('메모만 다시 보내기')}</div>`;
};
SHEETS['c-reward'] = { title: '보상 자세히', html: () => `${b('C09', { noId: true })}<dl class="kv"><dt>금액</dt><dd>100 USD 고정비</dd><dt>지급하는 곳</dt><dd>새봄뷰티(예시)</dd><dt>조건</dt><dd>브랜드 확인 통과 후 14일 이내</dd><dt>예정일</dt><dd>11/8</dd></dl>
  <ul class="check" style="margin-top:12px"><li><span class="ic ok">✓</span>영상 확인 통과 10/25</li><li><span class="ic wait">…</span><b>지급 대기</b> — 아직 받지 않았어요</li><li><span class="ic todo">○</span>지급 확인 (브랜드가 송금 증빙을 올리면 표시)</li></ul>
  <div class="btns"><button type="button" class="btn" data-sheet="c-help">금액이 다르거나 안 들어왔어요</button></div>` };
let helpStep = 1;
SHEETS['c-help'] = { title: '도움 요청·신고', html: () => { helpStep = 1; return `${b('C12', { noId: true })}<div id="help-body">${helpBody()}</div>`; } };
function helpBody() {
  if (helpStep === 1) return `<div class="field"><span class="lab">어떤 문제인가요?<span class="req">필수</span></span><div class="radios"><label><input type="radio" name="h-t" checked>보상이 안 들어왔어요</label><label><input type="radio" name="h-t">메시지 신고</label><label><input type="radio" name="h-t">협업 조건 분쟁</label><label><input type="radio" name="h-t">계정·탈퇴</label></div></div><div class="btns"><button type="button" class="btn pri" data-act="help-next">다음</button></div>`;
  if (helpStep === 2) return `<div class="field"><label for="h-d">무슨 일이 있었나요?<span class="req">필수</span></label><textarea id="h-d">11/8 예정이던 100 USD가 아직 안 들어왔어요.</textarea></div><div class="field"><label for="h-f">근거<span class="opt">선택</span></label><input id="h-f" type="text" placeholder="예: 화면 캡처 파일"></div><div class="btns"><button type="button" class="btn pri" data-act="help-next">접수하기</button></div>`;
  return `<div class="alert ok">접수번호 <b>HP-2201(예시)</b> · 운영팀이 2영업일 안에 답해요.</div><p class="small">메시지 › 내 문의에서 진행 상태를 볼 수 있어요. 시안이라 실제로 접수되지 않았어요.</p><div class="btns"><button type="button" class="btn pri" data-act="help-done">내 문의 보기</button></div>`;
}
ACT['help-next'] = () => { helpStep++; $('#help-body').innerHTML = helpBody(); const f = $('#help-body button, #help-body textarea'); f && f.focus(); };
ACT['help-done'] = () => { helpStep = 1; closeDialog($('#pd-sheet')); view.screen.creator = 'c-messages'; saveView(); render(); };

/* =====================================================================
   관리자 시안 (7화면)
   ===================================================================== */
RENDER['a-today'] = () => `<div class="page-head"><div><h1>오늘 처리할 일 ${b('A01')}</h1><p>10/25 09:30 (KST) 갱신 · 숫자는 예시</p></div></div>
  <div class="grid g3">
    <button type="button" class="stat" data-demo="같은 조건의 실제 대상 목록이 열립니다(시안)."><span class="l">긴급</span><br><span class="n">2</span><br><span class="s">가장 오래 5시간</span></button>
    <button type="button" class="stat" data-demo="같은 조건의 실제 대상 목록이 열립니다(시안)."><span class="l">기한 지남</span><br><span class="n">3</span><br><span class="s">가장 오래 2일</span></button>
    <button type="button" class="stat" data-demo="같은 조건의 실제 대상 목록이 열립니다(시안)."><span class="l">담당 없음</span><br><span class="n">4</span><br><span class="s">배정 필요</span></button>
    <div class="stat" style="border-color:#f3b8b2"><span class="l">청구 문제 ${b('X04')}</span><br><span class="n" style="color:var(--err)">—</span><br><span class="s" style="color:var(--err)">불러오지 못함 · 0건 아님</span><br>${demoBtn('다시 시도')}</div></div>
  <div class="card" style="margin-top:16px"><h3>처리 순서</h3><ul class="rows">
    <li class="rowi"><div class="grow"><b>새봄뷰티(예시) · 메일 받기 연결 끊김</b><div class="sub">5시간 · 담당 하린(예시) · 막힌 이유: 인증 만료 · 해결: 브랜드에 재연결 요청</div></div>${chip('긴급', 'err')}${goBtn('연결 상태 보기', 'a-connections', 'pri')}</li>
    <li class="rowi"><div class="grow"><b>Glowlab(예시) · 신고 1건</b><div class="sub">개인정보 게시 · 담당 없음</div></div>${chip('긴급', 'err')}${goBtn('신고 처리', 'a-reports', 'pri')}</li>
    <li class="rowi"><div class="grow"><b>하루한잔(예시) · 배송 예외 자동 처리</b><div class="sub">자동 처리 기능이 아직 없어요 → 수동 담당 지정 후 처리 기록을 남겨요</div></div>${chip('수동 처리', 'warn')}${demoBtn('담당 지정')}</li></ul></div>
  <div class="card soft" style="margin-top:16px"><h3>출시 전 점검 (테스트 데이터) ${b('X05')}</h3>
    <p class="small">테스트 공간 · 브랜드 2 / 크리에이터 5 / 운영 2 계정 · 대표 흐름 5개 중 3개 통과(예시)</p>
    <ul class="check"><li><span class="ic ok">✓</span>지원 → 선정 → 조건 합의</li><li><span class="ic ok">✓</span>주소 → 배송 지연 → 기한 변경</li><li><span class="ic ok">✓</span>제출 → 수정 → 통과</li><li><span class="ic no">!</span>보상 지급 확인 (미통과)</li><li><span class="ic todo">○</span>분쟁 접수 → 판정 (미실행)</li></ul></div>`;

RENDER['a-onboard'] = () => `<div class="page-head"><div><h1>브랜드 시작 돕기 ${b('A02')}</h1><p>승인 후 첫 협업까지 이어졌는지 봐요.</p></div></div>
  <div class="board">${[['관심 신청', 3], ['본 신청', 2], ['보완 요청', 1], ['승인', 2], ['초대 미전달', 1], ['설정 완료', 4], ['첫 협업 준비', 3]].map(([l, n]) => `<div class="col"><h4>${l} <span>${n}</span></h4></div>`).join('')}</div>
  <div class="split" style="margin-top:16px"><div class="card"><h3>하루한잔(예시) 준비 상태</h3><ul class="check">
    <li><span class="ic ok">✓</span>신청 승인 10/20</li>
    <li><span class="ic no">!</span><div><b>초대 전달 확인 안 됨</b><div class="small muted">유효기간 10/30까지 · 10/21 보냄 · 열람 기록 없음</div>${demoBtn('다시 초대')}</div></li>
    <li><span class="ic wait">…</span>공개 제품 정보 1/3</li><li><span class="ic todo">○</span>보내는 메일 연결</li><li><span class="ic todo">○</span>테스트 협업 완료</li></ul></div>
  <div class="card"><h3>보완 요청</h3><div class="field"><label for="ob-r">이유<span class="req">필수</span></label><textarea id="ob-r">사업자 정보와 브랜드명이 달라요. 관계를 알 수 있는 서류를 올려 주세요.</textarea></div>
    <div class="field"><label for="ob-d">기한<span class="req">필수</span></label><input id="ob-d" type="text" value="11/1"></div>${demoBtn('보완 요청 보내기', 'pri', '시안에서는 메일을 보내지 않아요.')}</div></div>`;

RENDER['a-review'] = () => `<div class="page-head"><div><h1>영상 확인 ${b('A03')}</h1><p>브랜드가 보는 것과 같은 제출 번호·버전</p></div></div>
  <div class="btns" style="margin-top:0">${['전체', '대기 4', '보완 2', '완료 31'].map((l, i) => `<span class="chip ${i === 1 ? 'plum' : ''}">${l}</span>`).join(' ')}</div>
  <div class="split" style="margin-top:12px"><ul class="rows">
    <li class="rowi" style="border-color:var(--plum2)"><div class="grow"><b>SB-311 v2(예시)</b><div class="sub">새봄뷰티 · Lena(예시) · 기한 10/27 · 확인자: 브랜드 지윤</div></div>${chip('브랜드 확인 대기', 'warn')}</li>
    <li class="rowi"><div class="grow"><b>SB-298 v1(예시)</b><div class="sub">Glowlab · Noah(예시) · 운영 개입 중</div></div>${chip('보완 요청', 'err')}</li></ul>
  <div class="card"><h3>SB-311 v2</h3><dl class="kv"><dt>확인 권한</dt><dd>브랜드 (운영은 지원만)</dd><dt>자동 점검</dt><dd><span class="chip warn">실행 안 됨 · 결과 없음</span></dd><dt>바로 보기</dt><dd>원본 링크 · v1 · 조건 v1</dd></dl>
    <div class="field" style="margin-top:12px"><label for="ar-r">보완 이유<span class="req">필수</span></label><input id="ar-r" type="text" placeholder="예: 0:12 표현이 조건 v1과 달라요"></div>
    <div class="field"><label for="ar-d">기한<span class="req">필수</span></label><input id="ar-d" type="text" placeholder="예: 10/29"></div>${demoBtn('보완 요청 (시안)', 'pri')}</div></div>`;

let rpStep = 1, rpAction = 'hide';
RENDER['a-reports'] = () => `<div class="page-head"><div><h1>신고·분쟁</h1><p>목록 → 증거 → 이유 입력 → 조치 결과</p></div></div>
  ${tabs('rp', [['rep', '신고 2'], ['dis', '분쟁 1']], 'rep')}
  ${panel('rp', 'rep', 'rep', `<h2>신고 ${b('A04')}</h2><div class="split"><ul class="rows">
      <li class="rowi" style="border-color:var(--plum2)"><div class="grow"><b>RP-77(예시) · 개인정보 게시</b><div class="sub">Glowlab 커뮤니티 · 심각도 높음 · 응답 기한 2시간 · 담당 없음</div></div>${chip('긴급', 'err')}</li>
      <li class="rowi"><div class="grow"><b>RP-75(예시) · 괴롭힘</b><div class="sub">경고 1회 기록 있음</div></div></li></ul>
    <div class="card" id="rp-flow">${rpFlow()}</div></div>`)}
  ${panel('rp', 'dis', 'rep', `<h2>분쟁 ${b('A05')}</h2><div class="split"><div class="card"><h3>DP-12(예시) · 수정 횟수 분쟁</h3><ol class="timeline small">
      <li>조건 v1 합의 — 수정 최대 2회 (10/02, 양측 확인)</li><li>수정 요청 1회차 (10/12)</li><li>수정 요청 2회차 (10/18)</li><li>브랜드 3회차 요청 → 크리에이터 거부 (10/21)</li><li>분쟁 접수 · 1차 응답 10/22 · 추가 자료 요청</li></ol></div>
    <div class="card"><h3>판정문 초안</h3><dl class="kv"><dt>사실</dt><dd>수정 2회 완료</dd><dt>근거</dt><dd>조건 v1 ‘수정 최대 2회’</dd><dt>판단</dt><dd>3회차 요청은 조건 밖</dd><dt>조치</dt><dd>현재 버전으로 확인 진행</dd><dt>이의</dt><dd>1회 · 11/1까지</dd></dl>${demoBtn('통보 미리보기')}</div></div>`)}`;
function rpFlow() {
  const acts = { warn: '경고', hide: '해당 메시지 숨김', brand: '이 브랜드 안에서 제한', all: '전체 서비스 제한' };
  if (rpStep === 1) return `<h3>1. 증거</h3><div class="msg"><p class="small muted">원문 · 10/25 02:14</p><p>“[전화번호 가림] 여기로 연락해서 따져요”</p></div><p class="small">앞뒤 대화 6개 · 대상: Kai(예시) · 범위: 공개 채널</p><button type="button" class="btn pri" data-act="rp-next">조치 고르기</button>`;
  if (rpStep === 2) return `<h3>2. 조치와 이유</h3><div class="radios" data-chg="rp-act">${Object.entries(acts).map(([k, l]) => `<label><input type="radio" name="rp-a" value="${k}" ${k === rpAction ? 'checked' : ''}>${l}</label>`).join('')}</div>
    <div class="field" style="margin-top:12px"><label for="rp-why">이유<span class="req">필수</span></label><textarea id="rp-why" placeholder="예: 다른 사람 전화번호 공개"></textarea></div>
    <div class="field"><label for="rp-dur">기간<span class="req">필수</span></label><select id="rp-dur"><option>영구</option><option>7일</option></select></div>
    <button type="button" class="btn pri" data-act="rp-run">확인하고 실행 (시안)</button>`;
  return `<h3>3. 조치 결과</h3><ul class="check"><li><span class="ic ok">✓</span>처리 기록 저장 (${acts[rpAction]})</li><li><span class="ic wait">…</span><b>실제 숨김 적용: 확인 중</b></li><li><span class="ic todo">○</span>신고자 알림: 아직 안 보냄</li><li><span class="ic todo">○</span>대상자 알림: 아직 안 보냄</li></ul>
    <p class="small muted">시안이라 실제 조치는 없어요. 같은 버튼을 다시 눌러도 중복 실행되지 않게 설계해요.</p><button type="button" class="btn" data-act="rp-reset">처음부터</button>`;
}
ACT['rp-next'] = () => { rpStep = 2; $('#rp-flow').innerHTML = rpFlow(); $('#rp-flow input').focus(); };
ACT['rp-run'] = () => {
  const w = $('#rp-why'); const bad = !w.value.trim(); w.setAttribute('aria-invalid', String(bad));
  let m = w.parentElement.querySelector('.ferr');
  if (bad) { if (!m) { m = document.createElement('p'); m.className = 'ferr'; m.id = 'rp-why-err'; w.parentElement.appendChild(m); w.setAttribute('aria-describedby', m.id); } m.textContent = '조치 이유를 적어 주세요.'; w.focus(); return; }
  rpStep = 3; $('#rp-flow').innerHTML = rpFlow(); $('#rp-flow button').focus();
};
ACT['rp-reset'] = () => { rpStep = 1; $('#rp-flow').innerHTML = rpFlow(); $('#rp-flow button').focus(); };
CHG['rp-act'] = (el, e) => { rpAction = e.target.value; };

RENDER['a-connections'] = () => `<div class="page-head"><div><h1>연결 상태 ${b('A06')}</h1><p>‘연결됨’ 하나로 합치지 않고 단계별로 보여요.</p></div></div>
  <ul class="rows">
    <li class="rowi"><div class="grow"><b>새봄뷰티(예시) · brand@saebom.example</b><div class="sub">로그인 ${chip('정상', 'ok')} 보내기 ${chip('정상', 'ok')} 받기 ${chip('끊김', 'err')} · 마지막 받기 성공 5시간 전 · 다음 재시도 10분 뒤 · 담당 하린(예시)</div></div>${demoBtn('복구 방법')}</li>
    <li class="rowi"><div class="grow"><b>보내기 한도</b><div class="sub">메일 하루 한도 420/500 (예시) · TikTok 미국 판매자 한도는 따로 관리</div></div></li></ul>
  <div class="card" style="margin-top:16px"><h3>메일 결과</h3><div class="grid g3">${[['대기', 12], ['메일 서비스 접수', 140], ['반송', 3], ['결과 모름 → 직접 확인', 8], ['답장', 21]].map(([l, n]) => `<div class="stat"><span class="l">${l}</span><br><span class="n">${n}</span></div>`).join('')}</div>
    <p class="small muted" style="margin-top:8px">알림·번역 처리: 정상 · 비밀값은 표시하지 않아요.</p></div>`;

RENDER['a-finance'] = () => `<div class="page-head"><div><h1>비용·성과 ${b('A08')}</h1><p>정의: 9/1–10/24 · 10/25 06:00 갱신 · 숫자는 예시</p></div><label class="rv-toggle" style="color:inherit"><input type="checkbox" checked> 테스트·데모 제외</label></div>
  <div class="split"><div class="card"><h3>브랜드 단계</h3><div class="funnel">${[['가입', 16], ['승인', 12], ['첫 협업', 7], ['첫 실제 게시', 4], ['다시 협업', 2]].map(([l, n]) => `<div class="bar"><span>${l}</span><span class="track"><span class="fill" style="width:${n / 16 * 100}%;display:block"></span></span><b>${n}</b></div>`).join('')}</div></div>
  <div class="card"><h3>돈과 시간</h3><dl class="kv"><dt>청구</dt><dd>4,800 USD</dd><dt>실제 입금</dt><dd>3,600 USD</dd><dt>크리에이터 보수</dt><dd>2,100 USD</dd><dt>실비</dt><dd>640 USD</dd><dt>환불</dt><dd>0 USD</dd><dt>운영 시간</dt><dd>96시간</dd></dl></div></div>
  <div class="card" style="margin-top:16px"><h3>크리에이터 구분</h3><p class="small">후보 기록 1,240 · 연락 이메일 860 · 본인 확인 계정 210 · 활동 크리에이터 74 · 실제 게시자 31</p></div>`;

RENDER['a-people'] = () => `<div class="page-head"><div><h1>사람·권한 ${b('A07')}</h1><p>누가 어떤 브랜드의 민감 정보를 볼 수 있는지</p></div></div>
  <ul class="rows">
    <li class="rowi"><div class="grow"><b>하린(예시)</b><div class="sub">운영 · 전체 브랜드 · 주소 보기 가능 · 최근 로그인 오늘 · 기한 없음</div></div>${chip('운영', 'plum')}</li>
    <li class="rowi"><div class="grow"><b>지윤(예시)</b><div class="sub">블루웨이브 실무자 · 새봄뷰티·하루한잔 · 주소 보기 불가 · 기한 12/31</div></div>${chip('대행사')}</li>
    <li class="rowi"><div class="grow"><b>퇴사자 B(예시)</b><div class="sub">권한 회수 필요 · 담당 업무 7건 재배정 미리보기</div></div>${chip('회수 필요', 'err')}${demoBtn('재배정 미리보기')}</li></ul>
  <div class="grid g2" style="margin-top:16px"><div class="card"><h3>지원 위임</h3><p class="small">하린(예시) → 새봄뷰티 · 이유: 배송 문제 확인 · 18:00 자동 종료</p>${demoBtn('지금 종료', 'danger')}</div>
  <div class="card"><h3>민감 정보 열람 기록</h3><ul class="small"><li>10/25 09:02 하린 · 주소 1건 보기 · 목적: 배송 문의</li><li>10/24 17:40 수진 · 출고 파일 내려받기 · 5건</li></ul></div></div>`;

/* ---------- 시작 ---------- */
render();
