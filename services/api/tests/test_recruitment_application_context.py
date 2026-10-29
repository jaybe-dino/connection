"""Two dedicated customer brands: CTA -> magic login/signup -> apply -> community/billing isolation.
All HTTP calls use TestClient and an ephemeral migrated Postgres. No external mail.
"""
from uuid import uuid4
from urllib.parse import urlparse,parse_qs
import pytest
from api import auth
from api.db import connect


def headers(token):return {'Authorization':'Bearer '+token}


@pytest.fixture
def journey(client,monkeypatch):
    monkeypatch.setenv('AUTH_REQUIRED','1')
    from api import routes_auth,routes_gmail
    monkeypatch.setattr(routes_auth,'_send_system_mail',lambda *a,**k:pytest.fail('external mail forbidden'))
    monkeypatch.setattr(routes_gmail,'send_via_brand_gmail',lambda *a,**k:pytest.fail('external mail forbidden'))
    suffix=uuid4().hex[:8];workspace='journey-dino-'+suffix
    with connect() as c:admin_id=str(c.execute("INSERT INTO users(kind,email) VALUES('admin',%s) RETURNING user_id",('admin-'+suffix+'@example.invalid',)).fetchone()['user_id'])
    admin=headers(auth.issue_jwt({'kind':'admin','sub':admin_id}))
    records=[]
    with connect() as c:
        c.execute('INSERT INTO brands(brand_id,name,is_internal) VALUES(%s,%s,true)',(workspace,'Dedicated company workspace'))
        account=str(c.execute('INSERT INTO gmail_accounts(brand_id,email) VALUES(%s,%s) RETURNING account_id',(workspace,'sender-'+suffix+'@example.invalid')).fetchone()['account_id'])
        for brand in ['fau','returnu']:
            bid='journey-'+brand+'-'+suffix;cid='campaign-'+bid
            c.execute('INSERT INTO brands(brand_id,name,plan) VALUES(%s,%s,\'per_signup\')',(bid,'Dedicated '+brand))
            from api.routes_community import ensure_default_cell
            ensure_default_cell(c,bid,'Dedicated '+brand)
            pid=str(c.execute('INSERT INTO brand_products(brand_id,name) VALUES(%s,%s) RETURNING product_id',(bid,brand+' product')).fetchone()['product_id'])
            c.execute("INSERT INTO campaigns(campaign_id,brand_id,name,product,product_id,reward_type,deadline) VALUES(%s,%s,%s,%s,%s,'gifted',CURRENT_DATE+30)",(cid,bid,brand+' campaign',brand+' product',pid))
            records.append({'brand':bid,'product':pid,'campaign':cid,'email':brand+'-'+suffix+'@example.invalid'})
    yield workspace,account,admin,records
    with connect() as c:c.execute("UPDATE outreach_batches SET state='cancelled' WHERE brand_id=%s",(workspace,))


def draft(client,journey,record):
    workspace,account,h,_=journey
    plan={'mappings':[{'key':'offer-'+record['brand'],'target_brand_id':record['brand'],'product_id':record['product'],'campaign_id':record['campaign'],'gmail_account_id':account,'subject':'A product invitation','body':'Please review the offer.'}], 'rows':[{'mapping_key':'offer-'+record['brand'],'email':record['email']}]}
    p=client.post('/brands/'+workspace+'/outreach/bulk/preview',json=plan,headers=h);assert p.status_code==200,p.text
    r=client.post('/brands/'+workspace+'/outreach/bulk/drafts',json={**plan,'request_id':str(uuid4()),'review_hash':p.json()['reviewHash']},headers=h);assert r.status_code==200,r.text
    batch=r.json()['batchIds'][0]
    review=client.get(f'/brands/{workspace}/outreach/{batch}/review',headers=h).json()
    assert review['campaignId']==record['campaign']
    text=review['messages'][0]['body'];token=text.split('&application=')[1].split()[0]
    return batch,token


def login(client,record,token):
    r=client.post('/auth/magic',json={'email':record['email'],'brand':record['brand'],'application':token});assert r.status_code==200,r.text
    q=parse_qs(urlparse(r.json()['demoLink']).query)
    assert q['brand']==[record['brand']] and q['application']==[token]
    verified=client.post('/auth/magic/verify',json={'token':q['magic'][0]});assert verified.status_code==200
    h=headers(verified.json()['token'])
    onboard=client.put('/me/profile',json={'country':'KR','languages':['ko'],'ship_countries':['KR'],'consent_terms':True,'consent_privacy':True},headers=h)  # 신규 여정: 온보딩 선행
    assert onboard.status_code==200,onboard.text
    from conftest import tiktok_connect
    tiktok_connect(client,h,'oid-'+uuid4().hex[:12])  # 신규 필수: TikTok 소유 인증
    return h


def test_two_customer_cta_signup_application_community_and_billing_isolation(client,journey):
    workspace,_,admin,records=journey
    for index,rec in enumerate(records):
        batch,token=draft(client,journey,rec)
        ctx=client.get('/recruitment-links/'+token);assert ctx.status_code==200,ctx.text
        assert ctx.headers['cache-control']=='no-store'
        assert ctx.json()['brandId']==rec['brand'] and ctx.json()['productId']==rec['product'] and ctx.json()['campaignId']==rec['campaign']
        assert 'email' not in ctx.json() and 'workspace' not in ctx.text
        ch=login(client,rec,token)
        assert client.get('/me/memberships',headers=ch).json()==[]
        assert client.post('/recruitment-links/'+token+'/apply',headers=ch).status_code==409 # unapproved draft
        with connect() as c:c.execute("UPDATE outreach_batches SET state='approved' WHERE batch_id=%s",(batch,))
        r=client.post('/recruitment-links/'+token+'/apply',headers=ch);assert r.status_code==200,r.text
        assert r.json()['brandId']==rec['brand'] and r.json()['status']=='applied'
        replay=client.post('/recruitment-links/'+token+'/apply',headers=ch);assert replay.json()['alreadyApplied']
        member=client.get('/me/memberships',headers=ch).json();assert [m['brandId'] for m in member]==[rec['brand']]
        cells=client.get('/community/my-cells',headers=ch).json();assert {x['brandId'] for x in cells}=={rec['brand']}
        other=records[1-index]['brand']
        assert client.get('/community/cells/cell-'+other+'-main/messages',headers=ch).status_code==403
        assert client.get('/recruitment-links/brands/'+rec['brand']+'/applications',headers=ch).status_code==403
        with connect() as c:foreign_uid=str(c.execute("INSERT INTO users(kind,email,brand_id) VALUES('brand',%s,%s) RETURNING user_id",('brand-'+uuid4().hex+'@example.invalid',other)).fetchone()['user_id'])
        foreign=headers(auth.issue_jwt({'kind':'brand','sub':foreign_uid,'brand_id':other}))
        assert client.get('/recruitment-links/brands/'+rec['brand']+'/applications',headers=foreign).status_code==403
        with connect() as c:
            row=c.execute('SELECT * FROM recruitment_applications WHERE application_id=%s',(r.json()['applicationId'],)).fetchone();creator=row['creator_id']
            assert row['brand_id']==rec['brand'] and str(row['product_id'])==rec['product'] and row['campaign_id']==rec['campaign']
            assert c.execute('SELECT count(*) n FROM campaign_applications WHERE creator_id=%s AND campaign_id=%s',(creator,rec['campaign'])).fetchone()['n']==1
            assert c.execute('SELECT count(*) n FROM signup_usage WHERE creator_id=%s',(creator,)).fetchone()['n']==0
        vr=client.post('/admin/creators/'+creator+'/verify',headers=admin);assert vr.status_code==200,vr.text
        with connect() as c:
            usage=c.execute('SELECT brand_id,unit_price FROM signup_usage WHERE creator_id=%s',(creator,)).fetchall()
            assert usage==[{'brand_id':rec['brand'],'unit_price':5000}]
        report=client.get('/recruitment-links/brands/'+rec['brand']+'/applications',headers=admin).json()
        assert len(report['applications'])==1 and report['applications'][0]['workspace_id']==workspace
    with connect() as c:
        assert c.execute('SELECT count(*) n FROM memberships WHERE brand_id=%s',(workspace,)).fetchone()['n']==0
        assert c.execute('SELECT count(*) n FROM signup_usage WHERE brand_id=%s',(workspace,)).fetchone()['n']==0


def test_wrong_email_wrong_brand_and_expired_links_fail_closed(client,journey):
    rec=journey[3][0];batch,token=draft(client,journey,rec)
    assert client.post('/auth/magic',json={'email':'other@example.invalid','application':token}).status_code==403
    assert client.post('/auth/magic',json={'email':rec['email'],'brand':journey[3][1]['brand'],'application':token}).status_code==409
    ch=login(client,rec,token)
    with connect() as c:c.execute("UPDATE outreach_batches SET state='approved' WHERE batch_id=%s",(batch,))
    wrong=client.post('/auth/magic',json={'email':'unrelated-'+uuid4().hex+'@example.invalid'}).json()
    wrongtoken=parse_qs(urlparse(wrong['demoLink']).query)['magic'][0]
    wh=headers(client.post('/auth/magic/verify',json={'token':wrongtoken}).json()['token'])
    assert client.post('/recruitment-links/'+token+'/apply',headers=wh).status_code==403
    with connect() as c:c.execute("UPDATE recruitment_application_links SET expires_at=now()-interval '1 second' WHERE recipient_id IN (SELECT recipient_id FROM outreach_recipients WHERE batch_id=%s)",(batch,))
    assert client.post('/recruitment-links/'+token+'/apply',headers=ch).status_code==410
    assert client.get('/me/memberships',headers=ch).json()==[]


def test_foreign_campaign_atomic_draft_rejection(client,journey):
    rec=dict(journey[3][0]);rec['campaign']=journey[3][1]['campaign']
    workspace,account,h,_=journey
    p={'mappings':[{'key':'bad','target_brand_id':rec['brand'],'product_id':rec['product'],'campaign_id':rec['campaign'],'gmail_account_id':account,'subject':'bad','body':'bad'}],'rows':[{'mapping_key':'bad','email':rec['email']}]}
    r=client.post('/brands/'+workspace+'/outreach/bulk/preview',json=p,headers=h);assert r.status_code==409
    with connect() as c:assert c.execute('SELECT 1 FROM outreach_batches WHERE brand_id=%s',(workspace,)).fetchone() is None


def test_company_cannot_invite_into_its_internal_membership(client,journey):
    workspace,account,h,_=journey
    r=client.post('/brands/'+workspace+'/outreach',json={'gmail_account_id':account,'recipients':['recipient@example.invalid'],'subject':'offer','body':'offer'},headers=h)
    assert r.status_code==409
    with connect() as c:assert c.execute('SELECT 1 FROM outreach_batches WHERE brand_id=%s',(workspace,)).fetchone() is None


def test_conflicting_cta_rejected_before_any_draft_write(client,journey):
    workspace,account,h,rs=journey
    r=client.post('/brands/'+workspace+'/outreach',json={'target_brand_id':rs[0]['brand'],'gmail_account_id':account,'recipients':['recipient@example.invalid'],'subject':'offer','body':'Wrong CTA https://app.theprlist.net/?brand='+workspace},headers=h)
    assert r.status_code==409
    with connect() as c:assert c.execute('SELECT 1 FROM outreach_batches WHERE brand_id=%s',(workspace,)).fetchone() is None


def test_single_sender_path_has_the_same_immutable_customer_campaign_context(client,journey):
    workspace,account,h,records=journey;rec=records[0]
    response=client.post('/brands/'+workspace+'/outreach',headers=h,json={'target_brand_id':rec['brand'],'product_id':rec['product'],'campaign_id':rec['campaign'],'gmail_account_id':account,'recipients':[rec['email']],'subject':'Single proposal','body':'Review product details.'})
    assert response.status_code==200,response.text
    batch=response.json()['id']
    review=client.get(f'/brands/{workspace}/outreach/{batch}/review',headers=h).json()
    token=review['messages'][0]['body'].split('&application=')[1].split()[0]
    ctx=client.get('/recruitment-links/'+token).json()
    assert ctx['brandId']==rec['brand'] and ctx['productId']==rec['product'] and ctx['campaignId']==rec['campaign']
    with connect() as c:
        # Wrong product within the same brand must not fit a campaign merely by brand.
        other=str(c.execute('INSERT INTO brand_products(brand_id,name) VALUES(%s,%s) RETURNING product_id',(rec['brand'],'Other SKU')).fetchone()['product_id'])
    bad=client.post('/brands/'+workspace+'/outreach',headers=h,json={'target_brand_id':rec['brand'],'product_id':other,'campaign_id':rec['campaign'],'gmail_account_id':account,'recipients':['new@example.invalid'],'subject':'Bad mix','body':'No'})
    assert bad.status_code==409
