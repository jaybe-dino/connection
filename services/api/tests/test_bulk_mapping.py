"""Synthetic owner/operator/customer/creator/security QA. No external calls."""
from uuid import uuid4
from copy import deepcopy
import pytest
from api import auth, routes_outreach as outreach, routes_gmail as gmail
from api.db import connect


@pytest.fixture
def mapping(client,monkeypatch):
    suffix=uuid4().hex[:10]
    source='bulk-'+suffix; target='customer-'+suffix; other='other-'+suffix
    h={'Authorization':'Bearer '+auth.issue_jwt({'sub':'bulk-qa-admin','kind':'admin'})}
    with connect() as c:
        c.execute('INSERT INTO brands(brand_id,name,is_internal) VALUES(%s,%s,true)',(source,'QA Company'))
        c.execute('INSERT INTO brands(brand_id,name) VALUES(%s,%s),(%s,%s)',(target,'QA Brand',other,'Other Brand'))
        aid=str(c.execute('INSERT INTO gmail_accounts(brand_id,email) VALUES(%s,%s) RETURNING account_id',(source,'sender-'+suffix+'@qa.example')).fetchone()['account_id'])
        pid=str(c.execute('INSERT INTO brand_products(brand_id,name) VALUES(%s,%s) RETURNING product_id',(target,'QA Balm')).fetchone()['product_id'])
        foreign=str(c.execute('INSERT INTO brand_products(brand_id,name) VALUES(%s,%s) RETURNING product_id',(other,'Other Product')).fetchone()['product_id'])
    payload={'mappings':[{'key':'us-balm','target_brand_id':target,'product_id':pid,'gmail_account_id':aid,
                         'subject':'{{name}}: {{product}}','body':'{{brand}} offers {{product}}. Reason: {{reason}}'}],
             'rows':[{'email':'creator@qa.example','mapping_key':'us-balm','name':'Alex','reason':'Skin-care content'}]}
    calls=[]
    monkeypatch.setattr(gmail,'send_via_brand_gmail',lambda *a,**k:calls.append((a,k)))
    yield source,target,other,foreign,h,payload,calls
    with connect() as c:c.execute("UPDATE outreach_batches SET state='cancelled' WHERE brand_id=%s",(source,))


def preview(client,case,payload=None):
    source,_,_,_,h,p, _=case
    return client.post(f'/brands/{source}/outreach/bulk/preview',headers=h,json=payload or p)


def save(client,case,payload=None,request_id=None,review=None):
    source,_,_,_,h,p,_=case;p=deepcopy(payload or p)
    p.update(request_id=request_id or str(uuid4()),review_hash=(review or preview(client,case,p).json())['reviewHash'])
    return client.post(f'/brands/{source}/outreach/bulk/drafts',headers=h,json=p)


def test_owner_preview_readonly_and_drafts_pin_product_sender_brand(client,mapping):
    source,target,_,_,h,p,calls=mapping
    r=preview(client,mapping);assert r.status_code==200,r.text
    result=r.json();assert result['written'] is False and result['sent'] is False
    assert result['identityCountVerified'] is False
    sample=result['groups'][0]['samples'][0]
    assert sample['subject']=='Alex: QA Balm'
    assert 'Skin-care content' in sample['body'] and '?brand='+target in sample['body']
    with connect() as c:assert c.execute('SELECT 1 FROM outreach_batches WHERE brand_id=%s',(source,)).fetchone() is None
    r=save(client,mapping,review=result);assert r.status_code==200,r.text
    batch=r.json()['batchIds'][0]
    review=client.get(f'/brands/{source}/outreach/{batch}/review',headers=h).json()
    assert review['productId']==p['mappings'][0]['product_id']
    assert review['productName']=='QA Balm' and review['targetBrandId']==target
    assert review['gmailAccountId']==p['mappings'][0]['gmail_account_id']
    assert review['state']=='draft' and review['messages'][0]['subject']==sample['subject']
    assert outreach.deliver_pending(source,batch)==0 and calls==[]


def test_operator_201_rows_chunked_and_capacity_aggregated(client,mapping):
    _,_,_,_,_,p,_=mapping
    p['rows']=[{'email':f'c{i}@qa.example','mapping_key':'us-balm','name':'QA'} for i in range(201)]
    r=preview(client,mapping).json()
    assert r['batchCount']==2 and r['senders'][0]['overCurrentCapacity']==1
    r=save(client,mapping,review=r);assert r.status_code==200,r.text
    with connect() as c:
        sizes=[c.execute('SELECT count(*) n FROM outreach_recipients WHERE batch_id=%s',(bid,)).fetchone()['n'] for bid in r.json()['batchIds']]
    assert sizes==[200,1]


def test_creator_conflicts_duplicates_optouts_and_draft_reservations(client,mapping):
    source,target,_,_,_,p,_=mapping
    second=deepcopy(p['mappings'][0]);second['key']='second';p['mappings'].append(second)
    p['rows']=[{'email':email,'mapping_key':key} for email,key in [('Conflict@qa.example','us-balm'),('conflict@qa.example','second'),('good@qa.example','us-balm'),('GOOD@qa.example','us-balm'),('stop@qa.example','us-balm')]]
    with connect() as c:c.execute('INSERT INTO outreach_optouts(brand_id,email,opted_out_at) VALUES(%s,%s,now())',(target,'stop@qa.example'))
    r=preview(client,mapping).json()
    assert r['eligibleCount']==1 and r['uniqueEmailCount']==3
    assert sorted(x['reason'] for x in r['excluded'])==['duplicate_row','mapping_conflict','mapping_conflict','opted_out']
    assert save(client,mapping,review=r).status_code==200
    r=preview(client,mapping).json()
    assert r['eligibleCount']==0 and any(x['reason']=='reserved_draft_or_queue' for x in r['excluded'])


def test_customer_foreign_product_and_sender_rejected_atomically(client,mapping):
    source,_,other,foreign,h,p,calls=mapping
    p['mappings'][0]['product_id']=foreign
    assert preview(client,mapping).status_code==409
    p['mappings'][0]['target_brand_id']=other
    p['mappings'][0]['gmail_account_id']=str(uuid4())
    assert preview(client,mapping).status_code==409
    with connect() as c:assert c.execute('SELECT 1 FROM outreach_batches WHERE brand_id=%s',(source,)).fetchone() is None
    assert calls==[]


def test_security_preview_hash_invalidated_on_optout_and_content_change(client,mapping):
    source,target,_,_,h,p,_=mapping
    r=preview(client,mapping).json()
    p['mappings'][0]['body']='Different text'
    assert save(client,mapping,review=r).status_code==409
    p['mappings'][0]['body']='{{brand}} offers {{product}}. Reason: {{reason}}'
    with connect() as c:c.execute('INSERT INTO outreach_optouts(brand_id,email,opted_out_at) VALUES(%s,%s,now())',(target,'creator@qa.example'))
    assert save(client,mapping,review=r).status_code==409
    with connect() as c:assert c.execute('SELECT 1 FROM outreach_batches WHERE brand_id=%s',(source,)).fetchone() is None


def test_operator_idempotent_save_no_duplicate_on_retry(client,mapping):
    r=preview(client,mapping).json();rid=str(uuid4())
    first=save(client,mapping,request_id=rid,review=r);second=save(client,mapping,request_id=rid,review=r)
    assert first.status_code==second.status_code==200
    assert first.json()['batchIds']==second.json()['batchIds'] and second.json()['replayed']
    mapping[5]['rows'][0]['name']='Changed'
    assert save(client,mapping,request_id=rid,review=r).status_code==409


def test_security_no_crlf_or_unknown_template_and_no_cross_brand_access(client,mapping):
    source,target,_,_,h,p,_=mapping
    p['mappings'][0]['subject']='Line\nInjected'
    assert preview(client,mapping).status_code==400
    p['mappings'][0]['subject']='{{secret}}'
    assert preview(client,mapping).status_code==400
    p['mappings'][0]['subject']='Valid'
    customer={'Authorization':'Bearer '+auth.issue_jwt({'kind':'brand','brand_id':target,'sub':'qa-customer'})}
    assert client.post(f'/brands/{source}/outreach/bulk/preview',headers=customer,json=p).status_code in (401,403)


def test_delivery_uses_personalized_text_and_original_sender_only(client,mapping,monkeypatch):
    source,_,_,_,_,p,calls=mapping
    bid=save(client,mapping).json()['batchIds'][0]
    def mocked(conn,brand,email,subject,body,**kwargs):
        calls.append({'subject':subject,'body':body,'account':str(kwargs['account_id'])})
        return {'via':'gmail','fromEmail':'sender@qa.example','messageId':'mock-'+uuid4().hex,'threadId':'mock-thread'}
    monkeypatch.setattr(gmail,'send_via_brand_gmail',mocked)
    with connect() as c:c.execute("UPDATE outreach_batches SET state='approved' WHERE batch_id=%s",(bid,))
    assert outreach.deliver_pending(source,bid)==1
    assert calls[0]['subject']=='Alex: QA Balm'
    assert 'Skin-care content' in calls[0]['body'] and 'Unsubscribe:' in calls[0]['body']
    assert calls[0]['account']==p['mappings'][0]['gmail_account_id']


def test_bulk_10000_preview_supported_without_provider_calls(client,mapping):
    p=mapping[5];p['rows']=[{'email':f'large{i}@qa.example','mapping_key':'us-balm'} for i in range(10000)]
    r=preview(client,mapping);assert r.status_code==200,r.text
    assert r.json()['eligibleCount']==10000 and r.json()['batchCount']==50 and mapping[6]==[]
    p['rows'].append({'email':'extra@qa.example','mapping_key':'us-balm'})
    assert preview(client,mapping).status_code==422


def test_pagination_keeps_all_batches_created_at_same_timestamp(client,mapping):
    source,_,_,_,h,p,_=mapping
    p['rows']=[{'email':f'page{i}@qa.example','mapping_key':'us-balm'} for i in range(6201)]
    r=save(client,mapping);assert r.status_code==200,r.text
    ids=set(r.json()['batchIds']);assert len(ids)==32
    first=client.get(f'/brands/{source}/outreach',headers=h).json()
    assert len(first['batches'])==30 and first['nextCursor']
    second=client.get(f'/brands/{source}/outreach',headers=h,params={'before':first['nextCursor']}).json()
    assert len(second['batches'])==2 and second['nextCursor'] is None
    assert {b['id'] for b in first['batches']+second['batches']}==ids
