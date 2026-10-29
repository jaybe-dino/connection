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
    assert b["funnel"]["targeted"] >= 1
    assert b["funnel"]["invited"] == 0          # 셀 멤버가 대상으로 잡힘

    # 승인 전엔 CSV 내보내기 불가
    assert client.get(f"/dispatch-batches/{b['batchId']}/export.csv").status_code == 400

    # 게이트 승인 → READY, 외부 초대 전
    client.post(f"/gates/{b['gateId']}/approve", json={"member_id": "kim"})
    g = client.get(f"/dispatch-batches/{b['batchId']}").json()
    assert g["state"] == "READY"
    assert g["funnel"]["invited"] == 0

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


def test_dispatch_reads_require_owner_and_sender_stats_require_admin(client, monkeypatch):
    from api.auth import issue_jwt
    batches=client.get('/brands/glowlab/dispatch-batches').json()
    batch=batches[0]['batchId']
    monkeypatch.setenv('AUTH_REQUIRED','1')
    owner={'Authorization':'Bearer '+issue_jwt({'kind':'brand','brand_id':'glowlab'})}
    other={'Authorization':'Bearer '+issue_jwt({'kind':'brand','brand_id':'unrelated'})}
    for suffix in ['', '/rows', '/export.csv']:
        url='/dispatch-batches/'+batch+suffix
        assert client.get(url).status_code==401
        assert client.get(url,headers=other).status_code==403
        assert client.get(url,headers=owner).status_code in (200,400)
    for headers in ({},owner):
        assert client.post('/senders/00000000-0000-0000-0000-000000000000/stats',headers=headers,json={'bounce_rate':0,'complaint_rate':0}).status_code==401


def test_import_atomic_idempotent_dates_and_access(client, monkeypatch):
    import os, psycopg
    from api.auth import issue_jwt
    with psycopg.connect(os.environ['DATABASE_URL']) as conn:
        for n in ('one', 'two'):
            conn.execute("INSERT INTO creators(creator_id,handle,platform) VALUES(%s,%s,'tiktok')", ('ops-'+n,'ops.'+n))
            conn.execute("INSERT INTO memberships(creator_id,brand_id) VALUES(%s,'glowlab')", ('ops-'+n,))
    b=_create(client).json(); bid=b['batchId']
    url=f'/dispatch-batches/{bid}/import'
    def upload(csv,headers=None):
        return client.post(url,headers=headers or {},files={'file':('r.csv',csv.encode(),'text/csv')})
    assert upload('handle,status\nops.one,accepted').status_code==409
    client.post(f"/gates/{b['gateId']}/approve",json={'member_id':'kim'})
    assert client.get(f'/dispatch-batches/{bid}').json()['state']=='READY'
    assert upload('handle,status\nops.one,accepted\nunknown,shipped').status_code==400
    rows=client.get(f'/dispatch-batches/{bid}/rows').json()
    assert all(r['state']=='READY' for r in rows)
    csv='handle,status,occurred_at\nops.one,accepted,2026-09-01T00:00:00+00:00'
    assert upload(csv).json()['updated']==1
    assert upload(csv).json()['unchanged']==1
    assert upload('handle,status,occurred_at\nops.one,shipped,2026-08-01T00:00:00+00:00').status_code==409
    assert upload('handle,status\nops.two,delivered').status_code==200
    with psycopg.connect(os.environ['DATABASE_URL']) as conn:
        row=conn.execute("SELECT invited_at,accepted_at,delivered_at FROM dispatches WHERE batch_id=%s AND handle='ops.two'",(bid,)).fetchone()
        assert row==(None,None,None)
        assert conn.execute('SELECT count(*) FROM dispatch_import_events WHERE batch_id=%s',(bid,)).fetchone()[0]==2
    monkeypatch.setenv('AUTH_REQUIRED','1')
    assert upload(csv).status_code==401
    other={'Authorization':'Bearer '+issue_jwt({'kind':'brand','brand_id':'unrelated'})}
    assert upload(csv,other).status_code==403


def test_batch_invalid_inputs(client):
    for capacity in (0,-1):
        assert _create(client,capacity).status_code==422
