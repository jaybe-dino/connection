import base64,json
from types import SimpleNamespace
import httpx,pytest
from fastapi import HTTPException
from api import routes_gmail as g


def test_production_token_storage_fails_closed(monkeypatch):
    monkeypatch.setenv('AUTH_REQUIRED','1')
    monkeypatch.delenv('TOKEN_ENC_KEY',raising=False)
    with pytest.raises(HTTPException) as e:g._enc('not-a-real-token')
    assert e.value.status_code==503


def test_new_oauth_without_refresh_token_not_connected(client,monkeypatch):
    from api.db import connect
    monkeypatch.setenv('GOOGLE_CLIENT_ID','qa-google-client')
    with connect() as c:
        c.execute("INSERT INTO brands (brand_id,name) VALUES ('qa-no-refresh','QA')")
    claims=base64.urlsafe_b64encode(json.dumps({'email':'qa@refresh.example','email_verified':True}).encode()).decode().rstrip('=')
    response={'access_token':'local-test-only','id_token':'h.'+claims+'.s','scope':g.SCOPES}
    monkeypatch.setattr(httpx,'post',lambda *a,**k:SimpleNamespace(json=lambda:response))
    state=g._new_oauth_state('qa-no-refresh')
    r=client.get('/gmail/callback',params={'code':'fake-qa','state':state})
    assert r.status_code==400 and '다시' in r.text
    with connect() as c:
        assert c.execute("SELECT 1 FROM gmail_accounts WHERE brand_id='qa-no-refresh'").fetchone() is None


def test_token_expiry_is_bounded(client,monkeypatch):
    from api.db import connect
    monkeypatch.setenv('GOOGLE_CLIENT_ID','qa-google-client')
    with connect() as c:
        c.execute("INSERT INTO brands (brand_id,name) VALUES ('qa-expiry','QA')")
    claims=base64.urlsafe_b64encode(json.dumps({'email':'qa@expiry.example','email_verified':True}).encode()).decode().rstrip('=')
    response={'access_token':'local-test-only','refresh_token':'local-refresh','expires_in':10**30,'id_token':'h.'+claims+'.s','scope':g.SCOPES}
    monkeypatch.setattr(httpx,'post',lambda *a,**k:SimpleNamespace(json=lambda:response))
    state=g._new_oauth_state('qa-expiry')
    r=client.get('/gmail/callback',params={'code':'fake-qa','state':state})
    assert r.status_code==200
