"""틱톡샵 대량발송 P0 — 배치→게이트→CSV 내보내기→결과 가져오기→퍼널·노쇼."""

import io


def _create(client, capacity=30):
    return client.post("/brands/glowlab/dispatch-batches", json={
        "product_ref": "선쿠션 SPF50+", "commission_pct": 12,
        "unit_cost": 9000, "capacity": capacity, "deadline_days": 14,
    })


def test_batch_gate_csv_import_funnel(client):
    r = _create(client)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["state"] == "PENDING_GATE" and b["gateId"]
    assert b["funnel"]["invited"] >= 1          # 셀 멤버가 대상으로 잡힘

    # 승인 전엔 CSV 내보내기 불가
    assert client.get(f"/dispatch-batches/{b['batchId']}/export.csv").status_code == 400

    # 게이트 승인 → SENDING + 전원 INVITED
    client.post(f"/gates/{b['gateId']}/approve", json={"member_id": "kim"})
    g = client.get(f"/dispatch-batches/{b['batchId']}").json()
    assert g["state"] == "SENDING"

    csv_text = client.get(f"/dispatch-batches/{b['batchId']}/export.csv").text
    assert "creator_username" in csv_text and "12%" in csv_text
    handle = csv_text.splitlines()[1].split(",")[0]

    # 셀러센터 결과 CSV 반영: 수락→배송→도착→게시(+GMV)
    results = ("handle,status,tracking_no,content_url,gmv\n"
               f"{handle},posted,TH123456,https://tiktok.com/@x/video/1,84000\n")
    up = client.post(f"/dispatch-batches/{b['batchId']}/import",
                     files={"file": ("r.csv", io.BytesIO(results.encode()), "text/csv")})
    assert up.json()["updated"] == 1

    done = client.get(f"/dispatch-batches/{b['batchId']}").json()
    assert done["funnel"]["posted"] == 1
    assert done["gmv"] == 84000.0
    rows = client.get(f"/dispatch-batches/{b['batchId']}/rows").json()
    assert any(x["state"] == "CONTENT_POSTED" and x["trackingNo"] == "TH123456"
               for x in rows)
    # 원장 기록
    types = [e["type"] for e in client.get("/ledger?limit=30").json()["entries"]]
    assert "DISPATCH_BATCH_CREATED" in types and "DISPATCH_BATCH_APPROVED" in types


def test_resend_ban_90d(client):
    # 위 테스트에서 이미 초대된 멤버는 90일 내 재선정 불가 → 대상 없음
    r = _create(client)
    assert r.status_code == 400
    assert "대상" in r.json()["detail"]


def test_capacity_cap(client):
    r = _create(client, capacity=101)
    assert r.status_code == 400 and "상한" in r.json()["detail"]


def test_held_gate_holds_batch(client):
    # 새 크리에이터를 셀에 넣어 대상 확보
    import os, psycopg
    from psycopg.rows import dict_row
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        conn.execute("INSERT INTO creators (creator_id, handle, platform)"
                     " VALUES ('c-hold','hold.test','tiktok')"
                     " ON CONFLICT DO NOTHING")
        conn.execute("INSERT INTO memberships (creator_id, brand_id)"
                     " VALUES ('c-hold','glowlab') ON CONFLICT DO NOTHING")
        conn.commit()
    b = _create(client).json()
    client.post(f"/gates/{b['gateId']}/hold", json={"member_id": "kim"})
    held = client.get(f"/dispatch-batches/{b['batchId']}").json()
    assert held["state"] == "HELD"               # 보류 = 아무것도 안 나감
    assert client.get(f"/dispatch-batches/{b['batchId']}/export.csv").status_code == 400
