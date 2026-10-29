"""독립 제품 모아보기 — 공개 표시한 제품만, 필요한 정보가 있어야 공개, 브랜드 경계."""
import psycopg, os
from conftest import listing_ready


def _brand(client, slug):
    """브랜드 + 그 브랜드 계정 토큰(초대 수락 실경로)."""
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        c.execute("INSERT INTO brands (brand_id, name, category, locale, plan) VALUES (%s,%s,'뷰티','ko','per_signup')"
                  " ON CONFLICT DO NOTHING", (slug, slug.upper()))
    inv = client.post("/auth/invite", json={"email": f"{slug}@ex.com", "brand_id": slug}).json()
    tok = inv["demoLink"].split("invite=")[1]
    t = client.post("/auth/accept", json={"token": tok, "password": "public-pw-123"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_public_listing_requires_presentation_and_hides_unlisted(client):
    H = _brand(client, 'pubco'); H2 = _brand(client, 'pubco2')
    p = client.post('/brands/pubco/products', json={'name': '공개 앰플', 'commission_pct': 12}, headers=H).json()
    hidden = client.post('/brands/pubco/products', json={'name': '비공개 크림'}, headers=H).json()
    assert p['publicListed'] is False and p['publicMissing']
    # 소개·이미지가 없으면 공개 거부
    r = client.post(f"/brands/pubco/products/{p['productId']}/public", json={'listed': True}, headers=H)
    assert r.status_code == 409 and '상세 설명' in r.json()['detail'] and '카테고리' in r.json()['detail']
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        c.execute("INSERT INTO product_invitation_profiles (product_id, summary, image_url) VALUES (%s,%s,%s)",
                  (p['productId'], '건조한 피부를 위한 진정 앰플입니다', 'https://cdn.example.com/a.png'))
    # 운영 소개·이미지만으로는 부족 — 편집기 필수 항목(카테고리·USP·배송 국가)까지 있어야 공개
    r = client.post(f"/brands/pubco/products/{p['productId']}/public", json={'listed': True}, headers=H)
    assert r.status_code == 409 and '카테고리' in r.json()['detail'] and '상세 설명' not in r.json()['detail']
    listing_ready(client, 'pubco', p['productId'], H)
    r = client.post(f"/brands/pubco/products/{p['productId']}/public", json={'listed': True}, headers=H)
    assert r.status_code == 200 and r.json()['publicListed'] is True
    c1 = client.post('/brands/pubco/campaigns', json={'name': '앰플 영상', 'product': '공개 앰플', 'reward_type': 'affiliate',
                                                       'affiliate_pct': 12, 'countries': ['US'], 'deadline': '2099-01-01'}, headers=H).json()
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        c.execute("UPDATE campaigns SET product_id=%s WHERE campaign_id=%s", (p['productId'], c1['campaignId']))
    client.post(f"/brands/pubco/campaigns/{c1['campaignId']}/publish", headers=H)
    lst = client.get('/public/products').json()['items']
    ids = [x['productId'] for x in lst]
    assert p['productId'] in ids and hidden['productId'] not in ids
    row = next(x for x in lst if x['productId'] == p['productId'])
    assert row['brandId'] == 'pubco' and row['campaigns'][0]['campaignId'] == c1['campaignId']
    assert set(row) >= {'summary', 'imageUrl', 'campaigns'} and 'email' not in str(row)
    # 다른 브랜드 경로로는 이 제품을 바꿀 수 없다
    assert client.post(f"/brands/pubco2/products/{p['productId']}/public", json={'listed': False}, headers=H2).status_code == 404
    # 끄면 목록에서 빠진다
    client.post(f"/brands/pubco/products/{p['productId']}/public", json={'listed': False}, headers=H)
    assert p['productId'] not in [x['productId'] for x in client.get('/public/products').json()['items']]


def test_suspended_brand_products_are_not_public(client):
    H = _brand(client, 'pubsus')
    p = client.post('/brands/pubsus/products', json={'name': '정지 제품'}, headers=H).json()
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        c.execute("INSERT INTO product_invitation_profiles (product_id, summary, image_url) VALUES (%s,%s,%s)",
                  (p['productId'], '공개용 제품 소개입니다 열 글자', 'https://cdn.example.com/b.png'))
    listing_ready(client, 'pubsus', p['productId'], H)
    assert client.post(f"/brands/pubsus/products/{p['productId']}/public", json={'listed': True}, headers=H).status_code == 200
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        c.execute("UPDATE brands SET suspended_at=now() WHERE brand_id='pubsus'")
    assert p['productId'] not in [x['productId'] for x in client.get('/public/products').json()['items']]


def _present(pid, summary='공개용 제품 소개입니다 열 글자 이상', image='https://cdn.example.com/x.png'):
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        c.execute("INSERT INTO product_invitation_profiles (product_id, summary, image_url) VALUES (%s,%s,%s)"
                  " ON CONFLICT (product_id) DO UPDATE SET summary=EXCLUDED.summary, image_url=EXCLUDED.image_url",
                  (pid, summary, image))


def test_other_brand_campaign_linked_to_product_is_never_shown(client):
    H = _brand(client, 'xbrand1'); H2 = _brand(client, 'xbrand2')
    p = client.post('/brands/xbrand1/products', json={'name': '교차 확인 제품'}, headers=H).json()
    _present(p['productId']); listing_ready(client, 'xbrand1', p['productId'], H)
    assert client.post(f"/brands/xbrand1/products/{p['productId']}/public", json={'listed': True}, headers=H).status_code == 200
    # 잘못 연결된 fixture: 다른 브랜드 캠페인이 이 제품 id 를 가리킴
    bad = client.post('/brands/xbrand2/campaigns', json={'name': '다른 브랜드 캠페인', 'reward_type': 'gifted'}, headers=H2).json()
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        c.execute("UPDATE campaigns SET product_id=%s, lifecycle='published', status='open' WHERE campaign_id=%s",
                  (p['productId'], bad['campaignId']))
    row = next(x for x in client.get('/public/products?brand=xbrand1').json()['items'] if x['productId'] == p['productId'])
    assert all(c['campaignId'] != bad['campaignId'] for c in row['campaigns'])
    assert client.get('/public/products?brand=xbrand1&can=true').json()['total'] == 0


def test_listing_drops_when_presentation_removed_and_paging_filters(client):
    H = _brand(client, 'pagebr')
    pids = []
    for i in range(3):
        p = client.post('/brands/pagebr/products', json={'name': f'페이지 제품 {i}'}, headers=H).json()
        _present(p['productId']); pids.append(p['productId']); listing_ready(client, 'pagebr', p['productId'], H)
        assert client.post(f"/brands/pagebr/products/{p['productId']}/public", json={'listed': True}, headers=H).status_code == 200
    r1 = client.get('/public/products?brand=pagebr&limit=2').json()
    assert r1['total'] == 3 and len(r1['items']) == 2 and r1['nextOffset'] == 2
    r2 = client.get('/public/products?brand=pagebr&limit=2&offset=2').json()
    assert len(r2['items']) == 1 and r2['nextOffset'] is None
    assert client.get('/public/products?q=페이지 제품 1').json()['total'] >= 1
    assert client.get('/public/products?ids=' + pids[0]).json()['items'][0]['productId'] == pids[0]
    # 공개 후 소개를 지우면 읽을 때 빠진다(데이터는 그대로)
    _present(pids[0], summary='')
    assert pids[0] not in [x['productId'] for x in client.get('/public/products?brand=pagebr').json()['items']]
    # 제품 분야가 저장돼 있으면 브랜드 분야 대신 그 값
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        c.execute("INSERT INTO product_profile_versions (product_id, version, fields, note)"
                  " SELECT %s, COALESCE(max(version),0)+1, %s, 'test' FROM product_profile_versions WHERE product_id=%s",
                  (pids[1], '{"category": {"value": "헤어"}}', pids[1]))
    row = next(x for x in client.get('/public/products?brand=pagebr').json()['items'] if x['productId'] == pids[1])
    assert row['category'] == '헤어'
    assert [x['productId'] for x in client.get('/public/products?brand=pagebr&category=헤어').json()['items']] == [pids[1]]
