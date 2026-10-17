"""Reusable operator mappings: tenant isolation, revision review and no-send guarantees."""
from uuid import uuid4
from copy import deepcopy
import pytest
from api import auth, routes_gmail
from api.db import connect


@pytest.fixture
def recruitment(client,monkeypatch):
    h={'Authorization':'Bearer '+auth.issue_jwt({'sub':'recruitment-admin','kind':'admin'})}
    assert client.post('/admin/recruitment/workspace',headers=h).status_code==200
    suffix=uuid4().hex[:10];brand='recruit-'+suffix;other='foreign-'+suffix
    with connect() as c:
        c.execute('INSERT INTO brands(brand_id,name) VALUES(%s,%s),(%s,%s)',(brand,'Recruit Brand',other,'Foreign'))
        pid=str(c.execute('INSERT INTO brand_products(brand_id,name) VALUES(%s,%s) RETURNING product_id',(brand,'Serum')).fetchone()['product_id'])
        aid=str(c.execute("INSERT INTO gmail_accounts(brand_id,email) VALUES('dino-recruitment',%s) RETURNING account_id",('recruit-'+suffix+'@qa.example',)).fetchone()['account_id'])
        foreign=str(c.execute('INSERT INTO gmail_accounts(brand_id,email) VALUES(%s,%s) RETURNING account_id',(other,'foreign-'+suffix+'@qa.example')).fetchone()['account_id'])
    calls=[];monkeypatch.setattr(routes_gmail,'send_via_brand_gmail',lambda *a,**k:calls.append(1))
    body={'name':'US Serum','target_brand_id':brand,'product_id':pid,'gmail_account_id':aid,'state':'active','subject':'{{name}} / {{product}}','body':'{{brand}} {{reason}}','owner_name':'Operator','country':'US','language':'English'}
    yield h,body,foreign,calls
    with connect() as c:c.execute("UPDATE outreach_batches SET state='cancelled' WHERE brand_id='dino-recruitment'")


def test_admin_mapping_independent_product_sender_and_revision(client,recruitment):
    h,b,foreign,calls=recruitment
    assert client.get('/admin/recruitment/mappings').status_code==401
    brandh={'Authorization':'Bearer '+auth.issue_jwt({'sub':'customer','kind':'brand','brand_id':b['target_brand_id']})}
    assert client.get('/admin/recruitment/options',headers=brandh).status_code==401
    o=client.get('/admin/recruitment/options',headers=h).json()
    assert any(x['product_id']==b['product_id'] for x in o['products'])
    assert all(x['account_id']!=foreign for x in o['accounts'])
    assert not any('token' in str(k) for x in o['accounts'] for k in x)
    r=client.post('/admin/recruitment/mappings',json=b,headers=h);assert r.status_code==200,r.text
    m=r.json();url='/admin/recruitment/mappings/'+m['mapping_id']
    assert m['revision']==1
    changed=deepcopy(b);changed.update(revision=1,owner_name='Other operator')
    assert client.put(url,json=changed,headers=h).json()['revision']==2
    assert client.put(url,json=changed,headers=h).status_code==409
    invalid=deepcopy(b);invalid['gmail_account_id']=foreign
    assert client.post('/admin/recruitment/mappings',json=invalid,headers=h).status_code==409
    invalid=deepcopy(b);invalid['product_id']=str(uuid4())
    assert client.post('/admin/recruitment/mappings',json=invalid,headers=h).status_code==409
    assert calls==[]


def test_reviewed_mapping_drafts_batch_detail_and_pause(client,recruitment):
    h,b,_,calls=recruitment
    m=client.post('/admin/recruitment/mappings',json=b,headers=h).json();url='/admin/recruitment/mappings/'+m['mapping_id']
    rows={'revision':1,'rows':[{'email':'mapping-'+uuid4().hex+'@qa.example','mapping_key':'ignored-input','name':'Alex','reason':'Skin care'}]}
    p=client.post(url+'/preview',json=rows,headers=h);assert p.status_code==200,p.text
    assert p.json()['written'] is False and p.json()['eligibleCount']==1
    req={**rows,'request_id':str(uuid4()),'review_hash':p.json()['reviewHash']}
    r=client.post(url+'/drafts',json=req,headers=h);assert r.status_code==200,r.text
    assert r.json()['sent'] is False
    assert client.post(url+'/drafts',json=req,headers=h).json()['replayed'] is True
    batches=client.get(url+'/batches',headers=h).json()['batches']
    assert len(batches)==1 and batches[0]['recipient_count']==1 and batches[0]['sent_count']==0
    detail=client.get('/brands/dino-recruitment/outreach/'+r.json()['batchIds'][0]+'/review',headers=h).json()
    assert detail['state']=='draft' and detail['messages'][0]['subject']=='Alex / Serum'
    assert detail['productName']=='Serum' and detail['targetBrandId']==b['target_brand_id']
    assert client.get('/admin/recruitment/mappings',headers=h).json()['mappings'][0]['batch_count']>=1
    b.update(revision=1,state='paused')
    assert client.put(url,json=b,headers=h).status_code==200
    rows['revision']=2
    assert client.post(url+'/preview',json=rows,headers=h).status_code==409
    assert calls==[]


def test_draft_mapping_without_sender_and_review_invalidation(client,recruitment):
    h,b,_,calls=recruitment
    original=deepcopy(b);b.update(gmail_account_id=None,state='draft')
    m=client.post('/admin/recruitment/mappings',json=b,headers=h).json();url='/admin/recruitment/mappings/'+m['mapping_id']
    rows={'revision':1,'rows':[{'email':'readonly@qa.example','mapping_key':'any'}]}
    assert client.post(url+'/preview',json=rows,headers=h).status_code==409
    original.update(revision=1)
    assert client.put(url,json=original,headers=h).status_code==200
    assert client.post(url+'/preview',json=rows,headers=h).status_code==409
    rows['revision']=2
    p=client.post(url+'/preview',json=rows,headers=h);assert p.status_code==200,p.text
    original.update(revision=2,body='Updated proposal')
    assert client.put(url,json=original,headers=h).status_code==200
    req={**rows,'request_id':str(uuid4()),'review_hash':p.json()['reviewHash']}
    assert client.post(url+'/drafts',json=req,headers=h).status_code==409
    assert calls==[]


def test_operating_catalog_idempotency_isolation_and_no_customer_access(client,recruitment):
    h,b,_,calls=recruitment
    slug='catalog-'+uuid4().hex[:10]
    data={'brand_id':slug,'brand_name':'Catalog '+slug,'product_name':'Verified source balm','commission_pct':20,'source_note':'2026-10-07 sheet; current terms pending'}
    assert client.post('/admin/recruitment/catalog',json=data).status_code==401
    bh={'Authorization':'Bearer '+auth.issue_jwt({'sub':'customer','kind':'brand','brand_id':b['target_brand_id']})}
    assert client.post('/admin/recruitment/catalog',json=data,headers=bh).status_code==401
    r=client.post('/admin/recruitment/catalog',json=data,headers=h)
    assert r.status_code==200,r.text
    p=r.json();assert p['created'] and not p['emailSent']
    assert client.post('/admin/recruitment/catalog',json=data,headers=h).json()=={**p,'created':False}
    assert client.post('/admin/recruitment/catalog',json={**data,'commission_pct':15},headers=h).status_code==409
    assert client.post('/admin/recruitment/catalog',json={**data,'brand_name':'Unrelated'},headers=h).status_code==409
    assert client.post('/admin/recruitment/catalog',json={**data,'brand_id':slug+'x'},headers=h).status_code==409
    with connect() as c:
        assert c.execute('SELECT count(*) AS n FROM brand_products WHERE brand_id=%s',(slug,)).fetchone()['n']==1
        assert c.execute('SELECT count(*) AS n FROM users WHERE brand_id=%s',(slug,)).fetchone()['n']==0
        f=c.execute('SELECT fields FROM product_profile_versions WHERE product_id=%s',(p['productId'],)).fetchone()['fields']
        assert f['hero_product']['confirmed'] is False
    assert calls==[]


def test_operating_catalog_rejects_blank_demo_and_internal_brand(client,recruitment):
    h,b,_,calls=recruitment
    data={'brand_id':b['target_brand_id'],'brand_name':'Recruit Brand','product_name':'New serum','commission_pct':15,'source_note':'source'}
    assert client.post('/admin/recruitment/catalog',json={**data,'product_name':'  '},headers=h).status_code==400
    assert client.post('/admin/recruitment/catalog',json={**data,'brand_id':'dino-recruitment'},headers=h).status_code==400
    assert client.post('/admin/recruitment/catalog',json={**data,'brand_id':'qa-customer'},headers=h).status_code==400
    with connect() as c:c.execute('UPDATE brands SET is_demo=true WHERE brand_id=%s',(data['brand_id'],))
    assert client.post('/admin/recruitment/catalog',json=data,headers=h).status_code==409
    assert calls==[]


def test_distributed_sender_capacity_pinning_and_customer_links(client,recruitment,monkeypatch):
    h,b,foreign,calls=recruitment
    monkeypatch.setenv('GMAIL_DAILY_CAP','2')
    with connect() as c:
        second=str(c.execute("INSERT INTO gmail_accounts(brand_id,email) VALUES('dino-recruitment',%s) RETURNING account_id",('second-'+uuid4().hex+'@qa.example',)).fetchone()['account_id'])
        email='old-'+uuid4().hex+'@qa.example'
        tid=c.execute("INSERT INTO mail_threads(brand_id,creator_email,subject) VALUES('dino-recruitment',%s,'Existing') RETURNING thread_id",(email,)).fetchone()['thread_id']
        c.execute("INSERT INTO mail_messages(thread_id,direction,state,gmail_account_id) VALUES(%s,'out','sent',%s)",(tid,second))
    m=client.post('/admin/recruitment/mappings',json=b,headers=h).json();url='/admin/recruitment/mappings/'+m['mapping_id']
    rows=[{'email':email,'mapping_key':'ignored'}]+[{'email':'new-'+uuid4().hex+'@qa.example','mapping_key':'ignored'} for _ in range(5)]
    body={'revision':1,'rows':rows,'sender_ids':[b['gmail_account_id'],second]}
    p=client.post(url+'/distributed/preview',json=body,headers=h);assert p.status_code==200,p.text
    result=p.json();assert result['eligibleCount']==4 and len(result['unassigned'])==2
    old_group=next(g for g in result['groups'] if any(x['email']==email for x in g['samples']))
    assert old_group['gmailAccountId']==second
    assert client.post(url+'/distributed/preview',json={**body,'sender_ids':[foreign]},headers=h).status_code==409
    req={**body,'request_id':str(uuid4()),'review_hash':result['reviewHash']}
    saved=client.post(url+'/distributed/drafts',json=req,headers=h);assert saved.status_code==200,saved.text
    assert saved.json()['sent'] is False
    again=client.post(url+'/distributed/drafts',json=req,headers=h);assert again.status_code==200,again.text
    assert again.json()['replayed']
    batches=client.get(url+'/batches',headers=h).json()['batches'];assert len(batches)==2
    assert sum(x['recipient_count'] for x in batches)==4
    for bid in saved.json()['batchIds']:
        r=client.get('/brands/dino-recruitment/outreach/'+bid+'/review',headers=h).json()
        assert r['targetBrandId']==b['target_brand_id']
        assert all('application=' in x['body'] for x in r['messages'])
    assert calls==[]


def test_distributed_preserves_unselected_original_sender(client,recruitment):
    h,b,foreign,calls=recruitment
    with connect() as c:
        email='fixed-'+uuid4().hex+'@qa.example'
        tid=c.execute("INSERT INTO mail_threads(brand_id,creator_email) VALUES('dino-recruitment',%s) RETURNING thread_id",(email,)).fetchone()['thread_id']
        c.execute("INSERT INTO mail_messages(thread_id,direction,state,gmail_account_id) VALUES(%s,'out','sent',%s)",(tid,foreign))
    m=client.post('/admin/recruitment/mappings',json=b,headers=h).json()
    p=client.post('/admin/recruitment/mappings/'+m['mapping_id']+'/distributed/preview',headers=h,json={'revision':1,'sender_ids':[b['gmail_account_id']],'rows':[{'email':email,'mapping_key':'ignored'}]})
    assert p.status_code==409 and calls==[]
