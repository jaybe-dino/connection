from uuid import uuid4
import pytest
from api import auth,routes_gmail as gmail
from api.db import connect

@pytest.fixture
def crm(client,monkeypatch):
    monkeypatch.setenv('GMAIL_OPS_ENABLED','1')
    h={'Authorization':'Bearer '+auth.issue_jwt({'sub':'crm-admin','kind':'admin'})}
    client.post('/admin/recruitment/workspace',headers=h)
    suffix=uuid4().hex[:10];email='creator-'+suffix+'@example.test'
    with connect() as c:
        aid=str(c.execute("INSERT INTO gmail_accounts(brand_id,email,scopes) VALUES('dino-recruitment',%s,%s) RETURNING account_id",('sender-'+suffix+'@example.test',gmail.SCOPES)).fetchone()['account_id'])
        tid=str(c.execute("INSERT INTO mail_threads(brand_id,creator_email,subject,last_direction) VALUES('dino-recruitment',%s,'Product question','in') RETURNING thread_id",(email,)).fetchone()['thread_id'])
        out=c.execute("INSERT INTO mail_messages(thread_id,direction,to_email,from_email,body,state,gmail_account_id,gmail_thread_id,subject) VALUES(%s,'out',%s,%s,'Invitation body','sent',%s,'g-thread-1','Product invitation') RETURNING msg_id",(tid,email,'sender-'+suffix+'@example.test',aid)).fetchone()['msg_id']
        incoming=c.execute("INSERT INTO mail_messages(thread_id,direction,to_email,from_email,body,state,gmail_account_id,gmail_thread_id,rfc_message_id,subject) VALUES(%s,'in',%s,%s,'Can you confirm the commission?','sent',%s,'g-thread-1','<rfc-incoming>','Re: Product question') RETURNING msg_id",(tid,'sender-'+suffix+'@example.test',email,aid)).fetchone()['msg_id']
    r=client.post('/admin/recruitment/contacts/refresh-records',headers=h);assert r.status_code==200,r.text
    listing=client.get('/admin/recruitment/contacts',params={'q':email},headers=h);assert listing.status_code==200,listing.text
    cid=listing.json()['contacts'][0]['contact_id']
    return h,cid,aid,tid,incoming,email


def test_crm_records_correspondence_notes_tasks_and_isolation(client,crm):
    h,cid,aid,tid,mid,email=crm;base='/admin/recruitment/contacts/'+cid
    assert client.get(base).status_code==401
    brand={'Authorization':'Bearer '+auth.issue_jwt({'sub':'customer','kind':'brand','brand_id':'glowlab'})}
    assert client.get(base,headers=brand).status_code==401
    r=client.get(base,headers=h);assert r.status_code==200,r.text
    d=r.json();assert d['contact']['email']==email and len(d['correspondence']['messages'])==2
    body={'revision':d['contact']['revision'],'owner_name':'QA owner','status':'waiting_internal','next_action':'Confirm offer terms'}
    r=client.put(base,headers=h,json=body);assert r.status_code==200,r.text
    assert client.put(base,headers=h,json=body).status_code==409
    note={'request_id':str(uuid4()),'body':'Internal note, never email this.'}
    assert client.post(base+'/notes',headers=h,json=note).status_code==200
    assert client.post(base+'/notes',headers=h,json=note).status_code==200
    d=client.get(base,headers=h).json();assert len(d['notes'])==1 and len(d['events'])==1
    assert d['events'][0]['detail']['after']['next_action']=='Confirm offer terms'


def test_reply_draft_pins_exact_incoming_message_and_never_sends(client,crm,monkeypatch):
    h,cid,aid,tid,mid,_=crm;base='/admin/recruitment/contacts/'+cid
    monkeypatch.setattr(gmail,'send_via_brand_gmail',lambda *a,**k:pytest.fail('Draft save must not send'))
    req={'request_id':str(uuid4()),'reply_to_msg_id':mid,'expected_account_id':aid,'body':'The commission is under review.'}
    r=client.post(base+'/drafts',headers=h,json=req);assert r.status_code==200,r.text
    msg=r.json()['msgId'];assert r.json()['state']=='pending_gate'
    again=client.post(base+'/drafts',headers=h,json=req);assert again.json()['msgId']==msg and again.json()['replayed'] is True
    assert client.post(base+'/drafts',headers=h,json={**req,'body':'Changed'}).status_code==409
    with connect() as c:
        m=c.execute('SELECT * FROM mail_messages WHERE msg_id=%s',(msg,)).fetchone()
        assert str(m['gmail_account_id'])==aid and m['gmail_thread_id']=='g-thread-1' and m['rfc_message_id']=='<rfc-incoming>'
    assert client.post(base+'/drafts/'+str(msg)+'/cancel',headers=h).status_code==200
    with connect() as c:assert c.execute('SELECT state FROM mail_messages WHERE msg_id=%s',(msg,)).fetchone()['state']=='cancelled'


def test_reply_requires_explicit_approval_and_original_gmail_thread(client,crm,monkeypatch):
    h,cid,aid,tid,mid,email=crm;base='/admin/recruitment/contacts/'+cid
    req={'request_id':str(uuid4()),'reply_to_msg_id':mid,'expected_account_id':aid,'body':'Confirmed reply body'}
    msg=client.post(base+'/drafts',headers=h,json=req).json()['msgId'];calls=[]
    monkeypatch.setattr(gmail,'_demo_mode',lambda:False)
    def send(c,brand,to,subject,body,**kw):
        calls.append((to,subject,body,kw));return {'via':'gmail','fromEmail':'sender@example.test','messageId':'accepted-'+uuid4().hex,'threadId':'g-thread-1'}
    monkeypatch.setattr(gmail,'send_via_brand_gmail',send)
    path=base+'/drafts/'+str(msg)+'/send'
    assert client.post(path,headers=h,json={'confirmed':False}).status_code==400 and not calls
    r=client.post(path,headers=h,json={'confirmed':True});assert r.status_code==200,r.text
    assert r.json()['state']=='sent' and len(calls)==1
    with connect() as c:assert c.execute('SELECT sent_at FROM mail_messages WHERE msg_id=%s',(msg,)).fetchone()['sent_at'] is not None
    assert calls[0][0]==email and calls[0][1]=='Re: Product question'
    assert str(calls[0][3]['account_id'])==aid and calls[0][3]['reply_headers']['gmail_thread_id']=='g-thread-1'
    assert client.post(path,headers=h,json={'confirmed':True}).status_code==409 and len(calls)==1


def test_reply_cannot_switch_account_or_contact_and_global_stop_blocks_send(client,crm,monkeypatch):
    h,cid,aid,tid,mid,email=crm;base='/admin/recruitment/contacts/'+cid
    req={'request_id':str(uuid4()),'reply_to_msg_id':mid,'expected_account_id':str(uuid4()),'body':'Must not switch'}
    assert client.post(base+'/drafts',headers=h,json=req).status_code==409
    with connect() as c:
        other=c.execute("INSERT INTO mail_threads(brand_id,creator_email,subject) VALUES('glowlab',%s,'Private brand mail') RETURNING thread_id",(uuid4().hex+'@example.test',)).fetchone()['thread_id']
        foreign=c.execute("INSERT INTO mail_messages(thread_id,direction,body) VALUES(%s,'in','Private body') RETURNING msg_id",(other,)).fetchone()['msg_id']
    req.update(expected_account_id=aid,reply_to_msg_id=foreign)
    assert client.post(base+'/drafts',headers=h,json=req).status_code==404
    req['reply_to_msg_id']=mid
    msg=client.post(base+'/drafts',headers=h,json=req).json()['msgId']
    with connect() as c:c.execute("INSERT INTO outreach_contact_blocks(email,reason,evidence,created_by) VALUES(%s,'manual_stop','synthetic source','crm-test')",(email,))
    monkeypatch.setattr(gmail,'send_via_brand_gmail',lambda *a,**k:pytest.fail('Blocked must not send'))
    assert client.post(base+'/drafts/'+str(msg)+'/send',headers=h,json={'confirmed':True}).status_code==409


def test_unlinked_mail_needs_human_classification_and_pagination(client,crm):
    h,cid,aid,tid,mid,email=crm
    with connect() as c:
        t=c.execute("INSERT INTO mail_threads(brand_id,creator_email,subject,last_direction) VALUES('dino-recruitment',%s,'External inbox reply','in') RETURNING thread_id",('external-'+uuid4().hex+'@example.test',)).fetchone()['thread_id']
        c.execute("INSERT INTO mail_messages(thread_id,direction,body,state,gmail_account_id) VALUES(%s,'in','Original external reply','sent',%s)",(t,aid))
        for n in range(110):c.execute("INSERT INTO mail_messages(thread_id,direction,body,state,gmail_account_id) VALUES(%s,'in',%s,'sent',%s)",(tid,'History '+str(n),aid))
    unlinked=client.get('/admin/recruitment/contacts/unlinked',headers=h).json()
    assert any(x['thread_id']==str(t) for x in unlinked['threads'])
    assert client.post('/admin/recruitment/contacts/register-thread',headers=h,json={'thread_id':str(t)}).status_code==400
    assert client.get('/admin/recruitment/contacts/unlinked/'+str(t),headers=h).status_code==200
    assert client.post('/admin/recruitment/contacts/register-thread',headers=h,json={'thread_id':str(t),'confirmed_creator':True}).status_code==200
    first=client.get('/admin/recruitment/contacts/'+cid+'/messages',headers=h).json()
    second=client.get('/admin/recruitment/contacts/'+cid+'/messages',headers=h,params=first['next']).json()
    assert len(first['messages'])==100 and len(second['messages'])==12
    assert not ({x['msg_id'] for x in first['messages']}&{x['msg_id'] for x in second['messages']})


def test_unknown_reply_send_is_not_retried(client,crm,monkeypatch):
    h,cid,aid,tid,mid,email=crm;base='/admin/recruitment/contacts/'+cid
    req={'request_id':str(uuid4()),'reply_to_msg_id':mid,'expected_account_id':aid,'body':'Uncertain provider test'}
    msg=client.post(base+'/drafts',headers=h,json=req).json()['msgId'];calls=[]
    monkeypatch.setattr(gmail,'_demo_mode',lambda:False)
    def fail(*a,**k):calls.append(1);raise TimeoutError('synthetic provider uncertainty')
    monkeypatch.setattr(gmail,'send_via_brand_gmail',fail)
    route=base+'/drafts/'+str(msg)+'/send'
    assert client.post(route,headers=h,json={'confirmed':True}).status_code==502
    assert client.post(route,headers=h,json={'confirmed':True}).status_code==409
    assert len(calls)==1
    with connect() as c:assert c.execute('SELECT state FROM mail_messages WHERE msg_id=%s',(msg,)).fetchone()['state']=='review'


def test_selected_incoming_thread_never_silently_uses_a_different_sender(client,crm):
    h,cid,aid,tid,mid,email=crm
    with connect() as c:
        other=c.execute("INSERT INTO gmail_accounts(brand_id,email) VALUES('dino-recruitment',%s) RETURNING account_id",('second-'+uuid4().hex+'@example.test',)).fetchone()['account_id']
        incoming=c.execute("INSERT INTO mail_messages(thread_id,direction,body,state,gmail_account_id,gmail_thread_id) VALUES(%s,'in','Other mailbox reply','sent',%s,'g-thread-other') RETURNING msg_id",(tid,other)).fetchone()['msg_id']
    req={'request_id':str(uuid4()),'reply_to_msg_id':incoming,'expected_account_id':str(other),'body':'Do not rotate sender'}
    r=client.post('/admin/recruitment/contacts/'+cid+'/drafts',headers=h,json=req)
    assert r.status_code==409
