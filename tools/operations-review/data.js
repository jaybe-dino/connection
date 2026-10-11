window.OPS_DATA={
 asOf:'2026-10-12',sourceAsOf:'10/6~10/8 인계 자료 · 현재 실적 아님',
 brands:[
 {id:'returnu-us',name:'RETURNU',country:'미국',product:'PoreShooter 클렌징밤',target:'30명',applications:'17명',shipped:'2명',commission:'20%',deadline:'10/14·10/30 의미 구분',blocker:'17명 유입·본인 합의·수령·게시 확인',priority:1},
 {id:'fau-us',name:'FAU',country:'미국',product:'Acid Peel + Bubble Booster',target:'100/120명 충돌',applications:'3명 (10/7 시트)',shipped:'체크 0명',commission:'15%',deadline:'10/30 보고·모집 종료 공란',blocker:'계약 목표·브러시·입고·가이드 승인',priority:2},
 {id:'meltin-us',name:'Meltin',country:'미국',product:'상품명 확인 필요',target:'30명',applications:'2명 보고·취소 별도 확인',shipped:'미확인',commission:'미확인',deadline:'10/16 의미 확인',blocker:'시트 위치·확정자·출고·보상',priority:3},
 {id:'exomera-us',name:'Exomera',country:'미국',product:'상품명 확인 필요',target:'월 20 / 누적 60명',applications:'승인 1명 보고 (10/8)',shipped:'미확인',commission:'미확인',deadline:'10/23 보고',blocker:'월별 계약·승인과 합의 구분·배치 귀속',priority:3},
 {id:'berris-vn',name:'Berris',country:'베트남',product:'상품·입고 확인',target:'30명',applications:'신청 풀 650명·선발 미확인',shipped:'미확인',commission:'미확인',deadline:'9월 계획→10월 입고 변경',blocker:'풀 650명과 이번 캠페인 연결·입고',priority:2},
 {id:'berris-th',name:'Berris',country:'태국',product:'상품·입고 확인',target:'30명',applications:'신청 풀 117명·선발 미확인',shipped:'미확인',commission:'미확인',deadline:'9월 계획→10월 입고 변경',blocker:'풀 117명과 이번 캠페인 연결·입고',priority:2},
 {id:'goryeo-us',name:'고려공작1392',country:'미국',product:'상품 확인',target:'30명',applications:'미확인',shipped:'미확인',commission:'미확인',deadline:'미확인',blocker:'구매 링크·물류·시작 승인',priority:4},
 {id:'wellderma-us',name:'웰더마',country:'미국',product:'상품 확인',target:'일반 20 + LIVE 4 (기간 확인)',applications:'미확인',shipped:'미확인',commission:'미확인',deadline:'3개월 적용 범위 확인',blocker:'월별/전체 계약·가이드·커미션',priority:4},
 {id:'jmw-us',name:'JMW 로아띠',country:'미국',product:'Silky Hair Oil',target:'첫달 일반 23+LIVE 4, 이후 20+4 보고',applications:'미확인',shipped:'미확인',commission:'20%',deadline:'6개월 계약·10월 일정 확인',blocker:'계약 월별 범위·가이드·출고·LIVE 별도',priority:4}
 ],
 modules:[
 ['M0','수요·계약','브랜드→상품→국가→캠페인→목표 단위·정원·납기·예산','기존 캠페인 재사용 / 계약 라인·복수 마감은 추가 설계','대표·브랜드'],
 ['M1','공급·패스','플랫폼 UID→사람→연락처→동의→브랜드 멤버십','기존 후보·패스 유지 / 교차 식별·근거는 추가 개발','운영·데이터'],
 ['M2','매칭·배분','상품 적합성·국가·언어·참여 용량·거부·독점 조건','기존 태그/AI 추천 / 중복 제안 조정은 추가 개발','캠페인 실무'],
 ['M3','모집·귀속','브랜드/상품/캠페인/배치/접점 식별자','기존 Gmail 유지 / 캠페인 귀속·다계정은 추가 개발','개발·보안'],
 ['M4','협업 이행','신청→본인 합의→발송→수령→게시→검수','기존 terms 유지 / CSV 증빙·날짜·인증 이번 보완','물류·검수'],
 ['M5','OSMU·유지','같은 상품 반복→적합 신규 상품→다른 브랜드 자발적 가입','로컬 추천 규칙 검증 / 운영 자동 추천은 추가 개발','크리에이터·운영'],
 ['M6','수익·정산','브랜드 신규 검증 가입 5,000원 기준·월 청구·수납 분리','기존 청구 유지 / 그룹 손익·원가 배부는 설계+계산기','대표·재무'],
 ['M7','관제·SaaS','브랜드 격리·지표·예외 큐·감사·중지·롤백','기존 권한 유지 / 오프라인 검토실 이번 구현','개발·대표']
 ],
 decisions:[
 ['metric','월 3만 명 인정 단계','추천: 해당 월 캠페인 본인 합의 고유 인원. 게시·판매는 별도 성과. 아직 확정 아님'],
 ['bm','주수익·상품 구성','코드 기준 신규 검증 브랜드 가입 5,000원(부가세 포함). 대행비·성과수수료는 계약 확인 전 0으로 가정하지 않음'],
 ['scope','첫 검증 범위','추천: RETURNU 미국 1상품. Berris 국가별 흐름은 이후 별도 검증'],
 ['budget','예산·공급·처리 용량','검증 가능 연락처 수, 샘플·배송·인력 비용과 상한을 기입'],
 ['rights','OSMU 경계','다른 브랜드 자동가입·동의 복제 금지. 개인정보 공유·콘텐츠 재사용 권한 별도'],
 ['release','실행 범위','현재 로컬 검수만. 외부 발송·운영 반입·청구·배포는 이번 작업에서 실행하지 않음']
 ]
};
