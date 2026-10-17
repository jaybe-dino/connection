"""Independent acceptance checks on synthetic local DB only."""
from test_service_transition import box, _h, _creator, _brand_user, ADMIN


def test_new_creator_cannot_bypass_onboarding_by_joining_first(client, box):
    h = _h(_creator(client, f"codex-new-{box['sfx']}@example.com"))
    assert not client.get('/me/profile', headers=h).json()['onboarded']
    r = client.post('/me/join', json={'brand_id': box['a']}, headers=h)
    assert r.status_code == 403, 'New creator can join without required onboarding/TikTok'


def test_suspended_brand_cannot_send_community_message(client, box):
    h = _h(_brand_user(client, f"codex-suspend-{box['sfx']}@example.com", box['a']))
    r = client.post(f"/admin/brands/{box['a']}/suspend", json={}, headers=ADMIN)
    assert r.status_code == 200
    r = client.post(f"/community/cells/{box['cell_a']}/messages", headers=h,
                    json={'text': 'Synthetic suspended-brand message', 'channel': 'notice'})
    assert r.status_code == 403, 'Suspended brand can still post notices/messages'


def test_basic_tiktok_ownership_does_not_require_username(client, box, monkeypatch):
    from urllib.parse import parse_qs, urlparse
    monkeypatch.setenv('TIKTOK_CLIENT_KEY', 'synthetic-key')
    monkeypatch.setenv('TIKTOK_CLIENT_SECRET', 'synthetic-secret')
    h = _h(_creator(client, f"codex-tiktok-{box['sfx']}@example.com"))
    start = client.post('/me/tiktok/connect-start', headers=h).json()
    query = parse_qs(urlparse(start['authUrl']).query)
    assert query['scope'] == ['user.info.basic']
    class Response:
        def __init__(self, value): self.value = value
        def json(self): return self.value
    monkeypatch.setattr('httpx.post', lambda *a, **k: Response({
        'access_token': 'synthetic-access-token', 'open_id': 'synthetic-open-id'}))
    monkeypatch.setattr('httpx.get', lambda *a, **k: Response({
        'data': {'user': {'open_id': 'synthetic-open-id', 'display_name': 'Test Creator'}},
        'error': {'code': 'ok'}}))
    r = client.get('/tiktok/callback', params={'code': 'synthetic-code', 'state': query['state'][0]})
    assert r.status_code == 200, 'Valid basic profile is rejected because username requires another scope'
