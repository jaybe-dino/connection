from uuid import uuid4
from api.db import connect

def test_prelaunch_is_not_signup(client,monkeypatch):
    monkeypatch.setenv('AUTH_REQUIRED','1')
    email=f'wait-{uuid4().hex}@example.test'
    body={'brand':' Private QA ','email':email.upper(),'consent':True}
    for _ in range(2):
        assert client.post('/prelaunch-applications',json=body).status_code==200
    with connect() as c:
        assert c.execute('SELECT count(*) n FROM brand_prelaunch_applications WHERE email=%s',(email,)).fetchone()['n']==1
        assert not c.execute('SELECT 1 FROM users WHERE email=%s',(email,)).fetchone()
    assert client.get('/admin/prelaunch-applications').status_code==401
    for patch in [{'consent':False},{'brand':'   '},{'email':'bad'}]:
        assert client.post('/prelaunch-applications',json={**body,**patch}).status_code==422
    assert client.post('/prelaunch-applications',json={**body,'website':'spam'}).status_code==200
