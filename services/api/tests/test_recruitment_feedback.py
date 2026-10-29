from urllib.parse import urlparse,parse_qs
from uuid import uuid4
import pytest
from api.db import connect
from api import auth
from api.outreach_locale import proposal_locale,join_label
from test_recruitment_test_mail import setup


def test_message_language_is_explicit_not_inferred_creator_language():
    assert proposal_locale('Please try this product.')=='en'
    assert proposal_locale('제품 안내와 신청 방법을 확인해 주세요.')=='ko'
    assert proposal_locale('Korean product 제품명','English')=='en'
    assert join_label('en')=='Join the brand’s PR list (free)'


def test_english_test_message_has_english_cta_and_landing_locale(client,setup):
    h,b,bid=setup
    p=client.post('/admin/recruitment/test-mail/preview',headers=h,json=b);assert p.status_code==200,p.text
    p=p.json();assert 'Join the brand’s PR list (free)' in p['body']
    assert '브랜드 신청' not in p['body'] and 'lang=en' in p['body']


def test_new_bulk_english_cta_preserves_token_and_brand_context(client,setup):
    h,b,bid=setup
    with connect() as c:c.execute("UPDATE recruitment_mappings SET state='active',language='English' WHERE mapping_id=%s",(b['mapping_id'],))
    payload={'revision':1,'rows':[{'email':uuid4().hex+'@example.test','mapping_key':'ignored'}]}
    base='/admin/recruitment/mappings/'+b['mapping_id']
    p=client.post(base+'/preview',headers=h,json=payload).json()
    r=client.post(base+'/drafts',headers=h,json={**payload,'request_id':str(uuid4()),'review_hash':p['reviewHash']});assert r.status_code==200,r.text
    review=client.get('/brands/dino-recruitment/outreach/'+r.json()['batchIds'][0]+'/review',headers=h).json()
    text=review['messages'][0]['body'];assert 'Join the brand’s PR list (free)' in text
    link=next(x for x in text.split() if x.startswith('https://app.theprlist.net/'))
    q=parse_qs(urlparse(link).query);assert q['brand']==[bid] and q['lang']==['en']
    context=client.get('/recruitment-links/'+q['application'][0]).json()
    assert context['locale']=='en' and context['product']['name']=='Serum'


def test_public_product_presentation_has_explicit_fields_and_brand_isolation(client,setup):
    h,b,bid=setup
    with connect() as c:pid=str(c.execute('SELECT product_id FROM recruitment_mappings WHERE mapping_id=%s',(b['mapping_id'],)).fetchone()['product_id'])
    write=f'/admin/recruitment/setup/brands/{bid}/products/{pid}/invitation'
    public=f'/brands/{bid}/products/{pid}/invitation'
    assert client.put(write,json={'summary':'Public English summary'}).status_code==401
    r=client.put(write,headers=h,json={'summary':'A public product introduction.','image_url':'https://cdn.example.test/product.png'});assert r.status_code==200,r.text
    data=client.get(public).json();assert data['summary']=='A public product introduction.' and data['imageUrl'].endswith('product.png')
    assert set(data)=={'productId','name','summary','imageUrl'}
    assert client.get(f'/brands/another-brand/products/{pid}/invitation').status_code==404
    for image in ['javascript:alert(1)','http://example.test/a','https://localhost/x','https://127.0.0.1/x','https://u:p@example.test/x']:
        assert client.put(write,headers=h,json={'image_url':image}).status_code==400


def test_english_magic_locale_survives_new_user_login_link(client):
    r=client.post('/auth/magic',json={'email':uuid4().hex+'@example.test','brand':'glowlab','locale':'en'})
    assert r.status_code==200,r.text
    q=parse_qs(urlparse(r.json()['demoLink']).query);assert q['lang']==['en'] and q['brand']==['glowlab']
    assert client.post('/auth/magic/verify',json={'token':q['magic'][0]}).status_code==200


def test_cohort_exposes_profile_and_original_source_not_invented_video(client,setup):
    h,b,bid=setup;suffix=uuid4().hex[:9]
    with connect() as c:
        c.execute("INSERT INTO creator_pool(platform,platform_uid,handle,display_name,email,country,product_tags,email_status,sources) VALUES('tiktok',%s,%s,'Evidence QA',%s,'US',ARRAY['serum'],'none',%s)",(suffix,'proof_'+suffix,suffix+'@example.test','[{"source_file":"original.csv","source_meta":{"source_line":42,"metrics_as_of":"2026-08-29"}}]'))
    r=client.post('/admin/recruitment/mappings/'+b['mapping_id']+'/cohort',headers=h,json={'allow_unverified':True,'tags':['serum'],'limit':1000});assert r.status_code==200,r.text
    row=next(x for x in r.json()['candidates'] if x['handle']=='proof_'+suffix)
    assert row['profileUrl']=='https://www.tiktok.com/@proof_'+suffix
    assert row['sourceEvidence'][0]['row']==42 and row['sourceEvidence'][0]['source']=='original.csv'
