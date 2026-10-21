"""New self-service routes must work with the production auth boundary enabled."""
from test_slack_v3_parity import box, _member, _campaign_to_state


def test_notification_preferences_with_production_auth_boundary(client,box,monkeypatch):
    ch=_member(client,box,'strict-prefs')
    monkeypatch.setenv('AUTH_REQUIRED','1')
    assert client.get('/me/notification-prefs').status_code==401
    r=client.get('/me/notification-prefs',headers=ch)
    assert r.status_code==200,r.text
    r=client.put('/me/notification-prefs',headers=ch,json={'dm':False,'campaign':False,'deadline':False,'email':False})
    assert r.status_code==200,r.text
    assert client.get('/me/notification-prefs',headers=ch).json()['prefs']['campaign'] is False


def test_shipping_with_production_auth_boundary(client,box,monkeypatch):
    ch=_member(client,box,'strict-shipping')
    cid,creator_id,bh=_campaign_to_state(client,box,ch,'terms_agreed')
    monkeypatch.setenv('AUTH_REQUIRED','1')
    r=client.post(f'/me/campaign-offers/{cid}/shipping',headers=ch,json={'recipient':'QA recipient','country':'KR','address':'Synthetic local address 123','phone':'000-0000-0000'})
    assert r.status_code==200,r.text
    assert r.json()['shipping']['country']=='KR'
    assert client.post(f'/me/campaign-offers/{cid}/shipping',json={'recipient':'QA','country':'KR','address':'Local QA','phone':'0000'}).status_code==401
