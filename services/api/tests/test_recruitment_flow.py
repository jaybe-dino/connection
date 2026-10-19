from copy import deepcopy
from uuid import uuid4
import pytest
from api import auth
from api.db import connect


@pytest.fixture
def flow(client,monkeypatch):
    from api import routes_gmail
    monkeypatch.setenv('GMAIL_DAILY_CAP','4')
    monkeypatch.setattr(routes_gmail,'send_via_brand_gmail',lambda *a,**k: (_ for _ in ()).throw(AssertionError('Draft flows must not send')))
    h={'Authorization':'Bearer '+auth.issue_jwt({'sub':'flow-admin','kind':'admin'})}
    assert client.post('/admin/recruitment/workspace',headers=h).status_code==200
    suffix=uuid4().hex[:10]
    with connect() as c:
        aid=str(c.execute("INSERT INTO gmail_accounts(brand_id,email,scopes) VALUES('dino-recruitment',%s,%s) RETURNING account_id",('flow-'+suffix+'@example.test',routes_gmail.SCOPES)).fetchone()['account_id'])
    groups=[]
    for n in range(2):
        bid='flow-'+suffix+'-'+str(n)
        with connect() as c:
            c.execute('INSERT INTO brands(brand_id,name) VALUES(%s,%s)',(bid,'Flow '+suffix+' '+str(n)))
            pid=str(c.execute('INSERT INTO brand_products(brand_id,name) VALUES(%s,%s) RETURNING product_id',(bid,'Serum '+str(n))).fetchone()['product_id'])
        m=client.post('/admin/recruitment/mappings',headers=h,json={'name':bid,'target_brand_id':bid,'product_id':pid,'gmail_account_id':aid,'state':'active','subject':'{{brand}} / {{name}}','body':'{{product}} / {{reason}}'}).json()
        groups.append({'mapping_id':m['mapping_id'],'revision':1,'rows':[{'email':f'flow-{suffix}-{n}-{i}@example.test','name':'Synthetic','reason':'Skin care','mapping_key':'ignored'} for i in range(3)]})
    yield h,{'sender_ids':[aid],'groups':groups}
    with connect() as c:c.execute("UPDATE outreach_batches SET state='cancelled' WHERE brand_id='dino-recruitment'")


def test_multi_brand_shared_capacity_idempotency_and_application_context(client,flow):
    h,b=flow;url='/admin/recruitment/repeat-plans/multi'
    assert client.post(url+'/preview',json=b).status_code==401
    customer={'Authorization':'Bearer '+auth.issue_jwt({'sub':'customer','kind':'brand','brand_id':'glowlab'})}
    assert client.post(url+'/preview',headers=customer,json=b).status_code==401
    p=client.post(url+'/preview',headers=h,json=b);assert p.status_code==200,p.text
    result=p.json();assert result['submittedCount']==6 and result['eligibleCount']==4 and len(result['unassigned'])==2
    assert sum(g['eligibleCount'] for g in result['groups'])==4
    req={**b,'request_id':str(uuid4()),'review_hash':result['multiReviewHash']}
    r=client.post(url+'/drafts',headers=h,json=req);assert r.status_code==200,r.text
    assert r.json()['sent'] is False and len(r.json()['batchIds'])==2
    replay=client.post(url+'/drafts',headers=h,json=req);assert replay.json()['replayed'] is True
    changed=deepcopy(req);changed['groups'][0]['rows'][0]['name']='Changed'
    assert client.post(url+'/drafts',headers=h,json=changed).status_code==409
    with connect() as c:
        rows=c.execute('SELECT b.target_brand_id,r.personalized_body,r.state FROM outreach_recipients r JOIN outreach_batches b USING(batch_id) WHERE b.batch_id=ANY(%s::uuid[])',(r.json()['batchIds'],)).fetchall()
        assert len(rows)==4 and all(x['state']=='pending' for x in rows)
        assert len({x['target_brand_id'] for x in rows})==2
        for row in rows:assert 'brand='+row['target_brand_id'] in row['personalized_body'] and 'application=' in row['personalized_body']


def test_multi_brand_revision_change_never_partially_saves(client,flow):
    h,b=flow;url='/admin/recruitment/repeat-plans/multi'
    p=client.post(url+'/preview',headers=h,json=b).json()
    with connect() as c:c.execute('UPDATE recruitment_mappings SET revision=revision+1 WHERE mapping_id=%s',(b['groups'][1]['mapping_id'],))
    rid=str(uuid4());r=client.post(url+'/drafts',headers=h,json={**b,'request_id':rid,'review_hash':p['multiReviewHash']})
    assert r.status_code==409
    with connect() as c:assert not c.execute('SELECT 1 FROM outreach_bulk_saves WHERE request_id=%s',(rid,)).fetchone()


def test_multi_brand_mid_save_failure_rolls_back_every_brand(client,flow,monkeypatch):
    from api import routes_recruitment_links as links
    h,b=flow;url='/admin/recruitment/repeat-plans/multi'
    p=client.post(url+'/preview',headers=h,json=b).json();rid=str(uuid4())
    original=links.append_link;calls=[]
    def fail(*args,**kwargs):
        calls.append(1)
        if len(calls)==2:raise RuntimeError('Synthetic link failure')
        return original(*args,**kwargs)
    monkeypatch.setattr(links,'append_link',fail)
    with pytest.raises(RuntimeError):client.post(url+'/drafts',headers=h,json={**b,'request_id':rid,'review_hash':p['multiReviewHash']})
    with connect() as c:
        assert not c.execute('SELECT 1 FROM outreach_bulk_saves WHERE request_id=%s',(rid,)).fetchone()
        assert not c.execute('SELECT 1 FROM recruitment_multi_saves WHERE request_id=%s',(rid,)).fetchone()
        assert not c.execute('SELECT 1 FROM outreach_batches WHERE split_part(mapping_key,\'_\',1)=ANY(%s)',([g['mapping_id'] for g in b['groups']],)).fetchone()


def test_repeat_preparation_is_persistent_revisioned_and_never_a_send_job(client,flow):
    h,b=flow;url='/admin/recruitment/repeat-plans'
    data={'name':'Synthetic weekly preparation','cadence':'weekly','next_prepare_on':'2026-10-26','definition':{'mapping_ids':[g['mapping_id'] for g in b['groups']],'sender_ids':b['sender_ids'],'count_per_brand':100,'evidence_only':False}}
    r=client.post(url,headers=h,json=data);assert r.status_code==200,r.text
    p=r.json();assert p['definition']['evidence_only'] is False
    listing=client.get(url,headers=h).json();assert listing['automaticSending'] is False
    assert any(x['plan_id']==p['plan_id'] for x in listing['plans'])
    r=client.put(url+'/'+p['plan_id'],headers=h,json={**data,'revision':1,'next_prepare_on':'2026-11-02'});assert r.json()['revision']==2
    assert client.put(url+'/'+p['plan_id'],headers=h,json=data).status_code==409
    invalid=deepcopy(data);invalid['definition']['sender_ids']=[str(uuid4())]
    assert client.post(url,headers=h,json=invalid).status_code==409
    assert client.post(url+'/'+p['plan_id']+'/archive',headers=h).json()['sendingChanged'] is False

