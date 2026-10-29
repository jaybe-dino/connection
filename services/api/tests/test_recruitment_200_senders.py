"""공용 모집 발신 계정 200개 — 선택·잔여량·안전 분배·초안 생성까지(실제 발송 없음). 201개는 거부."""
from collections import Counter
from uuid import uuid4
from api import auth
from api.db import connect


def test_200_sender_accounts_select_distribute_and_draft(client, monkeypatch):
    from api import routes_gmail
    monkeypatch.setenv('GMAIL_DAILY_CAP', '3')
    monkeypatch.setattr(routes_gmail, 'send_via_brand_gmail', lambda *a, **k: (_ for _ in ()).throw(AssertionError('초안 흐름은 발송하지 않는다')))
    h = {'Authorization': 'Bearer ' + auth.issue_jwt({'sub': 'senders-admin', 'kind': 'admin'})}
    assert client.post('/admin/recruitment/workspace', headers=h).status_code == 200
    sfx = uuid4().hex[:8]
    with connect() as c:
        ids = [str(c.execute("INSERT INTO gmail_accounts(brand_id,email,scopes) VALUES('dino-recruitment',%s,%s) RETURNING account_id",
                             (f's{i:03d}-{sfx}@example.test', routes_gmail.SCOPES)).fetchone()['account_id']) for i in range(201)]
        c.execute("UPDATE gmail_accounts SET sending_paused=true, pause_reason='qa' WHERE account_id=%s", (ids[5],))   # 중지 계정은 선택 시 거부
        bid = 'senders-' + sfx
        c.execute('INSERT INTO brands(brand_id,name) VALUES(%s,%s)', (bid, 'Senders ' + sfx))
        pid = str(c.execute('INSERT INTO brand_products(brand_id,name) VALUES(%s,%s) RETURNING product_id', (bid, 'Serum')).fetchone()['product_id'])
    # 옵션 목록: 200개 이상 계정이 모두 보이고 계정별 잔여량이 있다
    opts = client.get('/admin/recruitment/options', headers=h).json()
    mine = [a for a in opts['accounts'] if a['email'].endswith(sfx + '@example.test')]
    assert len(mine) == 201 and all('available' in a for a in mine)
    m = client.post('/admin/recruitment/mappings', headers=h, json={'name': bid, 'target_brand_id': bid, 'product_id': pid, 'gmail_account_id': ids[0], 'state': 'active', 'subject': '{{brand}} / {{name}}', 'body': '{{product}} / {{reason}}'}).json()
    rows = [{'email': f'c{i:04d}-{sfx}@example.test', 'name': 'Synthetic', 'reason': 'Skin care', 'mapping_key': 'x'} for i in range(450)]
    chosen = [x for i, x in enumerate(ids[:201]) if i != 5][:200]
    url = '/admin/recruitment/repeat-plans/multi'
    body = {'sender_ids': chosen, 'groups': [{'mapping_id': m['mapping_id'], 'revision': 1, 'rows': rows}]}
    # 201개 선택은 요청 검증에서 거부
    assert client.post(url + '/preview', headers=h, json={**body, 'sender_ids': chosen + [ids[5]]}).status_code == 422
    # 중지 계정이 섞이면 거부(안전)
    assert client.post(url + '/preview', headers=h, json={**body, 'sender_ids': chosen[:199] + [ids[5]]}).status_code == 409
    p = client.post(url + '/preview', headers=h, json=body)
    assert p.status_code == 200, p.text[:300]
    r = p.json()
    assert r['submittedCount'] == 450 and r['eligibleCount'] == 450 and not r['unassigned']   # 200개 × 잔여 3 = 600 ≥ 450
    save = client.post(url + '/drafts', headers=h, json={**body, 'request_id': str(uuid4()), 'review_hash': r['multiReviewHash']})
    assert save.status_code == 200 and save.json()['sent'] is False, save.text[:300]
    with connect() as c:
        per = c.execute("SELECT b.gmail_account_id, count(*) n, bool_and(r.state='pending') pending FROM outreach_recipients r JOIN outreach_batches b USING(batch_id)"
                        " WHERE b.batch_id=ANY(%s::uuid[]) GROUP BY b.gmail_account_id", (save.json()['batchIds'],)).fetchall()
        assert all(x['pending'] for x in per)
        counts = Counter({str(x['gmail_account_id']): x['n'] for x in per})
        assert sum(counts.values()) == 450 and max(counts.values()) <= 3 and max(counts.values()) - min(counts.values()) <= 1   # 계정별 잔여량 이하·고르게
        assert set(counts) <= set(chosen) and ids[5] not in counts
        c.execute("UPDATE outreach_batches SET state='cancelled' WHERE brand_id='dino-recruitment'")
