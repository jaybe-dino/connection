"""조회자(viewer) 역할 — 읽기만 허용하고 모든 쓰기를 서버에서 거부. owner/manager 의 기존 권한은 그대로."""
from uuid import uuid4
from api import auth
from api.db import connect


def _team():
    sfx = uuid4().hex[:10]
    brand = 'viewer-' + sfx
    with connect() as c:
        c.execute('INSERT INTO brands(brand_id,name) VALUES(%s,%s)', (brand, brand))
        c.execute("INSERT INTO cells(cell_id,brand_id,name,visibility) VALUES(%s,%s,'lounge','apply_approve')", ('cell-' + brand, brand))
        out = {}
        for role in ('owner', 'manager', 'viewer'):
            u = c.execute("INSERT INTO users(kind,email,brand_id,password_hash) VALUES('brand',%s,%s,%s) RETURNING *",
                          (role + '-' + sfx + '@example.test', brand, auth.hash_password('Local-Qa-Password-2026'))).fetchone()
            c.execute('INSERT INTO brand_team_roles(brand_id,user_id,role) VALUES(%s,%s,%s)', (brand, u['user_id'], 'manager' if role == 'viewer' else role))
            out[role] = u
    return brand, out


def _h(u):
    with connect() as c:
        u = c.execute('SELECT * FROM users WHERE user_id=%s', (u['user_id'],)).fetchone()
    return {'Authorization': 'Bearer ' + auth.issue_jwt({'sub': str(u['user_id']), 'kind': 'brand', 'brand_id': u['brand_id'], 'se': u['session_epoch']})}


def test_viewer_reads_only_owner_manager_unchanged(client, monkeypatch):
    brand, u = _team()
    monkeypatch.setenv('AUTH_REQUIRED', '1')
    owner, manager = _h(u['owner']), _h(u['manager'])
    old_viewer = _h(u['viewer'])
    # 소유자만 역할 변경 — 관리자는 불가
    assert client.post(f'/brands/{brand}/team/role', headers=manager, json={'user_id': str(u['viewer']['user_id']), 'role': 'viewer'}).status_code == 403
    r = client.post(f'/brands/{brand}/team/role', headers=owner, json={'user_id': str(u['viewer']['user_id']), 'role': 'viewer'})
    assert r.status_code == 200, r.text
    assert client.get(f'/brands/{brand}/team', headers=old_viewer).status_code == 401          # 역할 변경 → 기존 세션 철회
    viewer = _h(u['viewer'])
    roles = {x['email'].split('-')[0]: x['role'] for x in client.get(f'/brands/{brand}/team', headers=viewer).json()}
    assert roles == {'owner': 'owner', 'manager': 'manager', 'viewer': 'viewer'}
    # 읽기 허용
    for path in (f'/brands/{brand}/campaigns', f'/brands/{brand}/products', f'/brands/{brand}/billing', f'/community/cells/cell-{brand}/channels'):
        assert client.get(path, headers=viewer).status_code == 200, path
    # 쓰기 거부(직접 API)
    writes = [('post', f'/brands/{brand}/campaigns', {'name': '조회자 캠페인'}), ('post', f'/brands/{brand}/products', {'name': '조회자 제품'}),
              ('post', f'/community/cells/cell-{brand}/messages', {'text': 'hi', 'channel': 'notice'}), ('post', f'/community/cells/cell-{brand}/channels', {'name': '조회자 채널'}),
              ('post', f'/brands/{brand}/team/role', {'user_id': str(u['manager']['user_id']), 'role': 'owner'}), ('put', f'/brands/{brand}/identity', {'tagline': 'x'}),
              ('post', f'/brands/{brand}/outreach/preview', {'gmail_account_id': str(uuid4()), 'recipients': ['a@b.co']}), ('post', f'/brands/{brand}/billing/invoices', {})]
    for m, path, body in writes:
        r = getattr(client, m)(path, headers=viewer, json=body)
        assert r.status_code == 403 and '조회자' in r.json()['detail'], (path, r.status_code, r.text[:120])
    # 관리자(manager)는 기존처럼 운영 쓰기 가능
    assert client.post(f'/brands/{brand}/campaigns', headers=manager, json={'name': '관리자 캠페인'}).status_code == 200
    assert client.post(f'/brands/{brand}/products', headers=manager, json={'name': '관리자 제품'}).status_code == 200
    # 마지막 소유자를 조회자로 강등 불가
    assert client.post(f'/brands/{brand}/team/role', headers=owner, json={'user_id': str(u['owner']['user_id']), 'role': 'viewer'}).status_code == 409
    # 다시 manager 로 올리면 쓰기 가능(세션 재발급 후)
    client.post(f'/brands/{brand}/team/role', headers=owner, json={'user_id': str(u['viewer']['user_id']), 'role': 'manager'})
    assert client.post(f'/brands/{brand}/products', headers=_h(u['viewer']), json={'name': '복귀 제품'}).status_code == 200
