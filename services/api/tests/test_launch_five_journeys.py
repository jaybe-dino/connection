"""Five separate local identities, full recruitment journey; no live providers."""
import pytest
from test_collab_api import _approved_brand, _creator_token, _bearer

@pytest.mark.parametrize('n,locale',[(1,'ko'),(2,'en'),(3,'th'),(4,'vi'),(5,'ja')])
def test_independent_brand_creator_journey(client,monkeypatch,n,locale):
    slug=f'launch-review-{n}'
    token=_approved_brand(client,slug,f'Launch QA {n}',f'brand{n}@launch.example')
    h=_bearer(token)
    monkeypatch.setenv('AUTH_REQUIRED','1')
    def post(path,body,headers=h):
        r=client.post(path,json=body,headers=headers)
        assert r.status_code==200, (path,r.text)
        return r.json()
    before=client.get(f'/brands/{slug}/profile/learned',headers=h).json()['version']
    profile=post(f'/brands/{slug}/profile/learned',{'answers':{'brand_one_liner':f'검수 전용 브랜드 {n}','hero_product':'QA serum','voice':'정직한 안내'}})
    assert profile['version']==before+1
    p=post(f'/brands/{slug}/products',{'name':f'QA product {n}','commission_pct':12.5})
    pid=p['productId']
    post(f'/brands/{slug}/products/{pid}/profile',{'answers':{'product_one_liner':'검수용 제품, 효능 주장 없음','target_audience':locale}})
    camp=post(f'/brands/{slug}/products/{pid}/campaigns',{'name':f'QA 모집 {n}','capacity':1})
    cid=camp['campaignId']
    ch=_bearer(_creator_token(client,f'creator{n}@launch.example'))
    post('/me/join',{'brand_id':slug},ch)
    again=post('/me/join',{'brand_id':slug},ch)
    cells=client.get('/community/my-cells',headers=ch)
    assert cells.status_code==200
    post(f'/community/cells/cell-{slug}-main/messages',{'text':f'QA {locale} message','locale':locale},ch)
    dm=post(f'/community/dm/{slug}',{},ch)
    post(f"/community/cells/{dm['cellId']}/messages",{'text':'QA private question','locale':locale},ch)
    post(f"/community/cells/{dm['cellId']}/messages",{'text':'QA brand answer','locale':'ko'})
    applied=post(f'/campaigns/{cid}/apply',{'creator_id':'ignored-identity'},ch)
    creator=applied['creatorId']
    dup=post(f'/campaigns/{cid}/apply',{'creator_id':'ignored-identity'},ch)
    assert dup['alreadyApplied']
    selected=post(f'/brands/{slug}/campaigns/{cid}/select',{'creator_id':creator,'commission_pct':12.5})
    assert selected['state']=='selected'
    assert client.post(f'/brands/{slug}/campaigns/{cid}/terms/{creator}/complete',headers=h).status_code==409
    agreed=post(f'/me/campaign-offers/{cid}/agree',{'accept':True,'tiktok_handle':f'@qa{n}'},ch)
    assert agreed['agreedCommissionPct']==12.5
    post(f'/brands/{slug}/campaigns/{cid}/terms/{creator}/sample-shipped',{'tracking':f'LOCAL-QA-{n}'})
    post(f'/brands/{slug}/campaigns/{cid}/terms/{creator}/affiliate-link',{'link':f'https://example.com/qa/{n}'})
    post(f'/me/campaign-offers/{cid}/spark-code',{'spark_code':f'LOCAL-QA-CODE-{n}'},ch)
    post(f'/me/campaign-offers/{cid}/content',{'content_url':f'https://example.com/content/{n}'},ch)
    completed=post(f'/brands/{slug}/campaigns/{cid}/terms/{creator}/complete',{})
    assert completed['state']=='completed'
    offers=client.get('/me/campaign-offers',headers=ch).json()
    assert len(offers)==1 and offers[0]['brandId']==slug and offers[0]['state']=='completed'
    summary=client.get(f'/brands/{slug}/billing',headers=h)
    assert summary.status_code==200
    if n>1:
        assert client.get(f'/brands/launch-review-1/campaigns',headers=h).status_code==403
        assert client.get('/community/cells/cell-launch-review-1-main/messages',headers=ch).status_code==403
        # DM is not accessible just because the reader is another creator.
        previous=client.get('/community/dm',headers=ch).json()
        assert str(dm['cellId']) in str(previous)
