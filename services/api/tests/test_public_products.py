"""독립 제품 모아보기 — 공개 표시한 제품만, 필요한 정보가 있어야 공개, 브랜드 경계."""
import psycopg, os


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
    assert r.status_code == 409 and '제품 소개' in r.json()['detail']
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        c.execute("INSERT INTO product_invitation_profiles (product_id, summary, image_url) VALUES (%s,%s,%s)",
                  (p['productId'], '건조한 피부를 위한 진정 앰플입니다', 'https://cdn.example.com/a.png'))
    r = client.post(f"/brands/pubco/products/{p['productId']}/public", json={'listed': True}, headers=H)
    assert r.status_code == 200 and r.json()['publicListed'] is True
    c1 = client.post('/brands/pubco/campaigns', json={'name': '앰플 영상', 'product': '공개 앰플', 'reward_type': 'affiliate',
                                                       'affiliate_pct': 12, 'countries': ['US'], 'deadline': '2099-01-01'}, headers=H).json()
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        c.execute("UPDATE campaigns SET product_id=%s WHERE campaign_id=%s", (p['productId'], c1['campaignId']))
    client.post(f"/brands/pubco/campaigns/{c1['campaignId']}/publish", headers=H)
    lst = client.get('/public/products').json()
    ids = [x['productId'] for x in lst]
    assert p['productId'] in ids and hidden['productId'] not in ids
    row = next(x for x in lst if x['productId'] == p['productId'])
    assert row['brandId'] == 'pubco' and row['campaigns'][0]['campaignId'] == c1['campaignId']
    assert set(row) >= {'summary', 'imageUrl', 'campaigns'} and 'email' not in str(row)
    # 다른 브랜드 경로로는 이 제품을 바꿀 수 없다
    assert client.post(f"/brands/pubco2/products/{p['productId']}/public", json={'listed': False}, headers=H2).status_code == 404
    # 끄면 목록에서 빠진다
    client.post(f"/brands/pubco/products/{p['productId']}/public", json={'listed': False}, headers=H)
    assert p['productId'] not in [x['productId'] for x in client.get('/public/products').json()]


def test_suspended_brand_products_are_not_public(client):
    H = _brand(client, 'pubsus')
    p = client.post('/brands/pubsus/products', json={'name': '정지 제품'}, headers=H).json()
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        c.execute("INSERT INTO product_invitation_profiles (product_id, summary, image_url) VALUES (%s,%s,%s)",
                  (p['productId'], '공개용 제품 소개입니다 열 글자', 'https://cdn.example.com/b.png'))
    assert client.post(f"/brands/pubsus/products/{p['productId']}/public", json={'listed': True}, headers=H).status_code == 200
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        c.execute("UPDATE brands SET suspended_at=now() WHERE brand_id='pubsus'")
    assert p['productId'] not in [x['productId'] for x in client.get('/public/products').json()]
