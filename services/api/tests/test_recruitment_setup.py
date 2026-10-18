from uuid import uuid4
from api import auth
from api.db import connect


def test_import_resumption_dedup_provenance_and_exclusion(client,monkeypatch):
    from api import routes_gmail
    monkeypatch.setattr(routes_gmail,'send_via_brand_gmail',lambda *a,**k: (_ for _ in ()).throw(AssertionError('No sends')))
    h={'Authorization':'Bearer '+auth.issue_jwt({'sub':'setup-admin','kind':'admin'})}
    url='/admin/recruitment/setup/imports';jid=str(uuid4());suffix=uuid4().hex[:10]
    b={'job_id':jid,'source_name':'synthetic.csv','source_sha256':'a'*64,'source_note':'Synthetic local QA only','expected_rows':4}
    assert client.post(url,json=b).status_code==401
    customer={'Authorization':'Bearer '+auth.issue_jwt({'sub':'foreign','kind':'brand','brand_id':'glowlab'})}
    assert client.post(url,json=b,headers=customer).status_code==401
    assert client.post(url,json=b,headers=h).status_code==200
    assert client.post(url,json={**b,'expected_rows':3},headers=h).status_code==409
    row={'handle':'setup-'+suffix,'platform_uid':'setup-'+suffix,'email':'setup-'+suffix+'@example.test','country':'US'}
    rows=[row,{**row,'handle':'other-'+suffix,'platform_uid':'other-'+suffix},{'handle':'bad','email':'invalid'},{**row,'handle':'brand-'+suffix,'platform_uid':'brand-'+suffix,'email':'brand-'+suffix+'@example.test','source_meta':{'is_brand_account':True}}]
    r=client.post(url+'/'+jid+'/chunks/0',json={'rows':rows},headers=h)
    assert r.status_code==200,r.text
    assert r.json()['inserted']==2 and r.json()['skipped']==1 and r.json()['errors']==1 and r.json()['excluded']==1
    assert client.post(url+'/'+jid+'/chunks/0',json={'rows':rows},headers=h).json()['replayed']
    assert client.post(url+'/'+jid+'/chunks/0',json={'rows':[row]},headers=h).status_code==409
    assert client.post(url+'/'+jid+'/chunks/1',json={'rows':[row]},headers=h).status_code==409
    with connect() as c:
        p=c.execute('SELECT * FROM creator_pool WHERE platform_uid=%s',(row['platform_uid'],)).fetchone()
        assert p['email_status']=='none' and p['sources'][0]['source_sha256']=='a'*64
    assert client.post(url+'/'+jid+'/exclude',headers=h).json()['excludedUnusedRows']==1
    with connect() as c:assert c.execute('SELECT state FROM creator_pool WHERE creator_id=%s',(p['creator_id'],)).fetchone()['state']=='EXCLUDED'


def test_managed_brand_accounts_isolate_and_do_not_create_credentials_or_mail(client):
    h={'Authorization':'Bearer '+auth.issue_jwt({'sub':'setup-admin','kind':'admin'})}
    slug='setup-'+uuid4().hex[:10];url='/admin/recruitment/setup/brands'
    b={'brand_id':slug,'name':'Synthetic '+slug,'company_email':f'chief+theprlist-{slug}@dinostudio.kr','countries':['US'],'source_note':'Synthetic QA','missing_fields':['Product and commercial terms']}
    assert client.post(url,json=b).status_code==401
    assert client.post(url,json={**b,'company_email':'external@example.test'},headers=h).status_code==422
    r=client.post(url,json=b,headers=h);assert r.status_code==200,r.text
    assert r.json()['emailSent'] is False and r.json()['productId'] is None
    assert client.post(url,json=b,headers=h).status_code==200
    assert client.post(url,json={**b,'name':'Another company'},headers=h).status_code==409
    with connect() as c:
        u=c.execute('SELECT * FROM users WHERE email=%s',(b['company_email'],)).fetchone()
        assert u['brand_id']==slug and u['password_hash'] is None
        assert c.execute('SELECT count(*) AS n FROM cells WHERE brand_id=%s',(slug,)).fetchone()['n']==1
        assert c.execute('SELECT count(*) AS n FROM auth_tokens WHERE user_id=%s',(u['user_id'],)).fetchone()['n']==0
