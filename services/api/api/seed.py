"""GLOWLAB 시나리오 시드 — packages/shared/src/mock.ts와 동일 내용.

멱등: 이미 시드됐으면 건너뛴다.
"""

import json

import psycopg

from .db import connect, ledger_append


def seed(url: str | None = None) -> bool:
    with connect(url) as conn:
        if conn.execute("SELECT 1 FROM brands WHERE brand_id='glowlab'").fetchone():
            return False
        _seed(conn)
        return True


def _j(v) -> str:
    return json.dumps(v, ensure_ascii=False)


def _seed(conn: psycopg.Connection) -> None:
    conn.execute(
        "INSERT INTO brands VALUES ('glowlab','GLOWLAB','선케어·스킨케어','ko','growth'),"
        " ('aura','AURA','메이크업','ko','starter')")

    conn.execute(
        "INSERT INTO creators VALUES"
        " ('c-mai','beauty.mai','tiktok','Mai',true,'th','mid',0.92),"
        " ('c-linh','glow.linh','tiktok','Linh',true,'vi','micro',0.5),"
        " ('c-nong','nong.skin','instagram','Nong',true,'th','micro',0.88)")
    conn.execute(
        "INSERT INTO memberships (creator_id, brand_id) VALUES"
        " ('c-mai','glowlab'),('c-mai','aura'),('c-linh','glowlab'),('c-nong','glowlab')")

    for f, v in [("address", "123/45 Sukhumvit Rd, Bangkok"), ("phone", "+66 81 234 5678"),
                 ("skinType", "복합성 · 민감"), ("bank", "PingPong 연결됨")]:
        conn.execute(
            "INSERT INTO creator_fields (creator_id, field, value) VALUES ('c-mai',%s,%s)",
            (f, v))

    conn.execute(
        "INSERT INTO cells VALUES"
        " ('cell-glowlab-th','glowlab','GLOWLAB 태국 셀','apply_approve',34),"
        " ('cell-aura-th','aura','AURA 태국 셀','invite_only',21)")

    msgs = [
        ("chat", "ari", "ari",
         "วันนี้ลองเล่าให้ฟังหน่อย — ครีมกันแดดที่ใช้แล้วไม่วอกแวก ตัวไหนดีสุด?", "th",
         {"ko": "오늘은 이야기해봐요 — 밀리지 않는 선크림, 어떤 게 제일 좋았어요?",
          "en": "Tell us today — which sunscreen never budges for you?"}, None),
        ("chat", "nong.skin", "creator",
         "ตัวใหม่ของ GLOWLAB เนื้อบางมาก ไม่เป็นคราบขาวเลยค่ะ", "th",
         {"ko": "GLOWLAB 신제품 발림이 진짜 얇아요, 백탁이 아예 없어요",
          "en": "GLOWLAB's new one is so light, zero white cast"}, None),
        ("notice", "ari", "ari",
         "[캠페인] 톤업 선세럼 리뷰 — 유가 · 정원 10명 · 9/15 마감", "ko",
         {"th": "[แคมเปญ] รีวิวโทนอัพซันเซรั่ม — มีค่าตอบแทน · รับ 10 คน · ปิด 15 ก.ย.",
          "en": "[Campaign] Tone-up sun serum review — paid · 10 slots · closes Sep 15"},
         "cmp-1"),
        ("tips", "glow.linh", "creator",
         "Quay ngoài trời lúc 4-5h chiều, ánh sáng đẹp nhất nhé", "vi",
         {"ko": "야외 촬영은 오후 4~5시가 빛이 제일 예뻐요",
          "th": "ถ่ายกลางแจ้งช่วง 4-5 โมงเย็น แสงสวยที่สุด"}, None),
    ]
    for ch, author, kind, orig, loc, tr, cmp_id in msgs:
        conn.execute(
            "INSERT INTO cell_messages (cell_id, channel, author, author_kind,"
            " original, original_locale, translations, campaign_id)"
            " VALUES ('cell-glowlab-th',%s,%s,%s,%s,%s,%s,%s)",
            (ch, author, kind, orig, loc, _j(tr), cmp_id))

    conn.execute(
        "INSERT INTO campaigns VALUES"
        " ('cmp-1','glowlab','톤업 선세럼 리뷰','GLOWLAB 톤업 선세럼 SPF50+','🧴',"
        "  '백탁 없이 한 톤 환하게','paid',1500,NULL,%s,10,'2026-09-15','open'),"
        " ('cmp-2','glowlab','수분 크림 체험단','GLOWLAB 워터배리어 크림','🫧',"
        "  '속당김 잡는 수분막','gifted',NULL,NULL,%s,30,'2026-09-30','open'),"
        " ('cmp-3','glowlab','선스틱 어필리에이트','GLOWLAB 포켓 선스틱','🖍️',"
        "  '화장 위에 바로 덧바르는','affiliate',NULL,12,%s,50,'2026-10-15','open')",
        (_j(["30초 이상", "얼굴 노출", "#ad 표기"]),
         _j(["게시 의무 없음"]),
         _j(["전용 링크 사용", "#ad 표기"])))

    conn.execute(
        "INSERT INTO campaign_applications (campaign_id, creator_id, status, match_score)"
        " VALUES ('cmp-1','c-mai','selected',87),('cmp-1','c-nong','selected',82),"
        " ('cmp-3','c-mai','applied',74)")
    conn.execute(
        "INSERT INTO shipments VALUES ('cmp-1','c-mai','Flash Express','TH2026082801',%s)",
        (_j([{"label": "PII 승인", "done": True, "at": "8/26"},
             {"label": "발송", "done": True, "at": "8/27"},
             {"label": "배송 중", "done": True},
             {"label": "배송 완료", "done": False}]),))

    # 팀 권한 (P0) — kim: 전 게이트 승인자 · lee: 운영자 · pii-only 예시
    conn.execute(
        "INSERT INTO team_members (brand_id, member_id, role, gate_kinds) VALUES"
        " ('glowlab','kim','approver','{PII,PAYOUT,OUTBOUND,PUBLISH}'),"
        " ('glowlab','lee','operator','{}')")

    # 승인 대기 게이트 4건 (아리 요청)
    gates = [
        ("PII", "cmp-1 선정 10명 배송 주소 전달", "물류사 CSV 내보내기 — 주소·연락처 포함"),
        ("OUTBOUND", "메일 시퀀스 1단 80건 발송", "태국 mid 등급 · 검증 이메일만 · 스팸 점수 0.4"),
        ("PAYOUT", "8월 정산 3건 ฿4,200 실행", "검수 통과 3건 — PingPong 일괄"),
        ("PUBLISH", "주간 피드 공지 게시 (태국 셀)", "멤버 콘텐츠 큐레이션 4건 — 아리 초안"),
    ]
    for kind, summary, detail in gates:
        row = conn.execute(
            "INSERT INTO gate_requests (brand_id, kind, summary, payload, requested_by)"
            " VALUES ('glowlab',%s,%s,%s,'ari:glowlab') RETURNING gate_id",
            (kind, summary, _j({"detail": detail}))).fetchone()
        ledger_append(conn, "ari:glowlab", "GATE_REQUESTED", str(row["gate_id"]),
                      {"brand": "glowlab", "kind": kind, "summary": summary})

    # 크리에이터 알림 시드
    for t, title, body in [
        ("selected", "톤업 선세럼 리뷰에 선정되었습니다", "배송 준비가 시작돼요"),
        ("shipping", "샘플이 배송 중입니다", "Flash Express TH2026082801"),
    ]:
        conn.execute(
            "INSERT INTO notifications (user_id, type, title, body) VALUES ('c-mai',%s,%s,%s)",
            (t, title, body))

    ledger_append(conn, "system", "SNS_VERIFIED", "c-mai", {"platform": "tiktok"})
