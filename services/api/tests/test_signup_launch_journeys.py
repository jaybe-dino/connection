"""Five isolated API journeys; not production/browser or real email delivery tests."""
import pytest
from urllib.parse import urlparse, parse_qs


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize('round_no,country', [(1,'KR'),(2,'TH'),(3,'US'),(4,'VN'),(5,'JP')])
def test_signup_to_recruitment(client, monkeypatch, round_no, country):
    from api.auth import issue_jwt
    monkeypatch.setenv('AUTH_REQUIRED', '1')
    monkeypatch.setenv('JWT_SECRET', 'local-test-only-signup-journey-secret-123456789')
    admin = {'Authorization': 'Bearer '+issue_jwt({'kind':'admin','sub':'jay'})}
    slug = f'launch-qa-{round_no}'
    email = f'brand{round_no}@example.com'
    assert ok(client.get('/brand-slugs/'+slug))['available']
    payload = dict(slug=slug.upper(), name=f'QA {country}', biz_no='123-45-67890',
                   category='beauty', countries=[country], contact=email,
                   answers={'brand_one_liner':'QA skincare','hero_product':'QA serum'},
                   terms_accepted=True, profile_confirmed=True)
    app = ok(client.post('/applications', json=payload))
    assert ok(client.get('/brand-slugs/'+slug))['reason'] == 'pending'
    assert client.post('/applications', json=payload).status_code == 409
    approved = ok(client.post(f"/admin/applications/{app['app_id']}/approve", headers=admin))
    invite = parse_qs(urlparse(approved['inviteLink']).query)['invite'][0]
    password = 'Local-QA-password-123!'
    ok(client.post('/auth/accept',json={'token':invite,'password':password}))
    token = ok(client.post('/auth/login',json={'email':email,'password':password}))['token']
    brand = {'Authorization':'Bearer '+token}
    assert ok(client.get('/brand-slugs/'+slug))['reason'] == 'registered'
    product = ok(client.post(f'/brands/{slug}/products',headers=brand,json={'name':'QA serum','commission_pct':12.5}))
    campaign = ok(client.post(f"/brands/{slug}/products/{product['productId']}/campaigns",headers=brand,json={'name':f'{country} recruitment','capacity':2}))
    cid = campaign['campaignId']
    magic = ok(client.post('/auth/magic',json={'email':f'creator{round_no}@example.com'}))
    magic_token = parse_qs(urlparse(magic['demoLink']).query)['magic'][0]
    creator_token = ok(client.post('/auth/magic/verify',json={'token':magic_token}))['token']
    creator = {'Authorization':'Bearer '+creator_token}
    assert client.post(f'/campaigns/{cid}/apply',headers=creator,json={'creator_id':'ignored'}).status_code == 403
    ok(client.post('/me/join',headers=creator,json={'brand_id':slug}))
    ok(client.post(f'/community/cells/cell-{slug}-main/messages',headers=creator,json={'text':f'Hello {country}','locale':'en'}))
    assert any(c['campaignId']==cid for c in ok(client.get('/me/campaigns',headers=creator)))
    first = ok(client.post(f'/campaigns/{cid}/apply',headers=creator,json={'creator_id':'ignored'}))
    assert first['myStatus']=='applied' and not first['alreadyApplied']
    assert ok(client.post(f'/campaigns/{cid}/apply',headers=creator,json={'creator_id':'ignored'}))['alreadyApplied']
    applicants = ok(client.get(f'/brands/{slug}/campaigns/{cid}/applicants',headers=brand))
    assert len(applicants)==1
    creator_id = applicants[0]['creatorId']
    selected = ok(client.post(f'/brands/{slug}/campaigns/{cid}/select',headers=brand,json={'creator_id':creator_id,'commission_pct':12.5}))
    assert selected['state']=='selected'
    agreed = ok(client.post(f'/me/campaign-offers/{cid}/agree',headers=creator,json={'accept':True,'tiktok_handle':f'@qa{round_no}'}))
    assert agreed['state']=='terms_agreed' and agreed['agreedCommissionPct']==12.5
    assert client.get(f'/brands/{slug}/campaigns/{cid}/applicants').status_code==401


def test_slug_reasons_and_normalization(client):
    for value, reason in [('ab','invalid'),('bad.example','invalid'),('admin','reserved')]:
        result=ok(client.get('/brand-slugs/'+value))
        assert result['available'] is False and result['reason']==reason
    result=ok(client.get('/brand-slugs/%20NEW-QA-SLUG%20'))
    assert result['available'] is True and result['slug']=='new-qa-slug'
