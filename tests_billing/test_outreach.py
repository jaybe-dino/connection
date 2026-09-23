import subprocess
import uuid
from contextlib import contextmanager
from pathlib import Path
import psycopg
import pytest
from psycopg.rows import dict_row
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api import routes_outreach as routes, routes_gmail as gmail
from api.auth import issue_jwt
REAL_GMAIL_SEND = gmail.send_via_brand_gmail

ROOT=Path(__file__).resolve().parents[1]

@pytest.fixture(scope='module')
def outreach_db():
    name='prlist_outreach_'+uuid.uuid4().hex[:12]
    subprocess.run(['createdb',name],check=True)
    try:
        for p in sorted((ROOT/'db/migrations').glob('*.sql')):
            subprocess.run(['psql','-v','ON_ERROR_STOP=1','-d',name,'-f',str(p)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        yield name
    finally: subprocess.run(['dropdb',name],check=True)

@pytest.fixture
def setup(outreach_db,monkeypatch):
    @contextmanager
    def db():
        with psycopg.connect(dbname=outreach_db,row_factory=dict_row) as conn:yield conn
    with db() as c:
        c.execute('TRUNCATE outreach_batches,outreach_optouts,gmail_accounts,mail_threads,gate_requests CASCADE')
        c.execute("INSERT INTO brands(brand_id,name) VALUES('real','Real'),('other','Other') ON CONFLICT DO NOTHING")
        c.execute("INSERT INTO gmail_accounts(brand_id,email) VALUES('real','sender@example.com')")
    monkeypatch.setattr(routes,'connect',db);monkeypatch.setattr(gmail,'connect',db)
    monkeypatch.setenv('JWT_SECRET','local-test-secret');monkeypatch.setenv('GOOGLE_CLIENT_ID','test')
    app=FastAPI();app.include_router(routes.router);app.include_router(gmail.router)
    h={'Authorization':'Bearer '+issue_jwt({'kind':'brand','brand_id':'real','sub':'u1'})}
    calls=[]
    def send(*args):calls.append(args[2]);return {'via':'gmail','fromEmail':'sender@example.com','messageId':'provider-id'}
    monkeypatch.setattr(gmail,'send_via_brand_gmail',send)
    return TestClient(app),db,h,calls

def draft(c,h,emails=None):
    r=c.post('/brands/real/outreach',headers=h,json={'subject':'Hello','body':'Collaboration invitation','recipients':emails or ['creator@example.com']})
    assert r.status_code==200
    return r.json()['id']

def test_auth_validation_and_tenant_isolation(setup):
    c,db,h,calls=setup
    assert c.get('/brands/real/outreach').status_code==401
    assert c.get('/brands/other/outreach',headers=h).status_code==403
    assert c.post('/brands/real/outreach',headers=h,json={'subject':'Hello\r\nBcc: bad@example.com','body':'Hi','recipients':['x@example.com']}).status_code==400
    assert c.post('/brands/real/outreach',headers=h,json={'subject':'Hello','body':'Hi','recipients':['not-an-email']}).status_code==400
    i=draft(c,h)
    assert c.post('/brands/other/outreach/'+i+'/send',headers=h).status_code==403
    assert calls==[]

def test_explicit_send_idempotency_and_persistence(setup):
    c,db,h,calls=setup;i=draft(c,h,['creator@example.com','CREATOR@example.com'])
    assert calls==[]
    c.get('/brands/real/outreach',headers=h)
    assert calls==[]
    for _ in range(2):
        r=c.post('/brands/real/outreach/'+i+'/send',headers=h)
        assert r.status_code==200 and r.json()['recipients'][0]['state']=='sent'
    assert calls==['creator@example.com']
    with db() as conn:
        assert conn.execute('SELECT count(*) AS n FROM mail_messages').fetchone()['n']==1
        assert conn.execute('SELECT provider_id FROM outreach_recipients').fetchone()['provider_id']=='provider-id'

def test_uncertain_delivery_never_replays(setup,monkeypatch):
    c,db,h,calls=setup;i=draft(c,h)
    def timeout(*args):calls.append(args[2]);raise TimeoutError()
    monkeypatch.setattr(gmail,'send_via_brand_gmail',timeout)
    for _ in range(2):
        r=c.post('/brands/real/outreach/'+i+'/send',headers=h)
        assert r.json()['recipients'][0]['state']=='review'
    assert len(calls)==1

def test_quota_is_pending_not_fake_success(setup,monkeypatch):
    c,db,h,calls=setup;i=draft(c,h)
    monkeypatch.setattr(gmail,'send_via_brand_gmail',lambda *args:None)
    r=c.post('/brands/real/outreach/'+i+'/send',headers=h)
    assert r.json()['recipients'][0]['state']=='pending'
    with db() as conn:assert conn.execute('SELECT count(*) AS n FROM mail_messages').fetchone()['n']==0

def test_optout_and_90_day_suppression(setup):
    c,db,h,calls=setup;i=draft(c,h)
    c.post('/brands/real/outreach/'+i+'/send',headers=h)
    j=draft(c,h)
    assert c.post('/brands/real/outreach/'+j+'/send',headers=h).json()['recipients'][0]['state']=='blocked'
    k=draft(c,h,['optout@example.com'])
    with db() as conn:token=conn.execute("SELECT token FROM outreach_optouts WHERE email='optout@example.com'").fetchone()['token']
    assert c.get('/outreach/unsubscribe/'+str(token)).status_code==200
    with db() as conn:assert conn.execute("SELECT opted_out_at FROM outreach_optouts WHERE email='optout@example.com'").fetchone()['opted_out_at'] is None
    c.post('/outreach/unsubscribe/'+str(token))
    assert c.post('/brands/real/outreach/'+k+'/send',headers=h).json()['recipients'][0]['state']=='blocked'
    assert len(calls)==1

def test_inbox_read_does_not_send_and_inbound_requires_secret(setup):
    c,db,h,calls=setup
    with db() as conn:
        t=conn.execute("INSERT INTO mail_threads(brand_id,creator_email,subject) VALUES('real','creator@example.com','Subject') RETURNING thread_id").fetchone()['thread_id']
        g=conn.execute("INSERT INTO gate_requests(brand_id,kind,summary,payload,requested_by,state) VALUES('real','OUTBOUND','reply','{}','test','APPROVED') RETURNING gate_id").fetchone()['gate_id']
        m=conn.execute("INSERT INTO mail_messages(thread_id,direction,body,state,gate_id) VALUES(%s,'out','reply','pending_gate',%s) RETURNING msg_id",(t,g)).fetchone()['msg_id']
    c.get('/brands/real/inbox',headers=h);c.get('/inbox/threads/'+str(t),headers=h)
    assert calls==[]
    assert c.post('/inbound/reply',json={'from_email':'fake@example.com','brand_id':'real','text':'yes'}).status_code==401
    assert c.post(f'/inbox/threads/{t}/messages/{m}/send',headers=h).json()['state']=='sent'
    assert c.post(f'/inbox/threads/{t}/messages/{m}/send',headers=h).status_code==409
    assert len(calls)==1


def test_warmup_ignores_account_age_and_counts_sending_days():
    from datetime import datetime,UTC,timedelta
    now=datetime.now(UTC)
    row={'account_id':'test','brand_id':'real','email':'sender@example.com','state':'connected','connected_at':now-timedelta(days=300),'sent_date':now.date(),'sent_today':0,'warmup_days':0}
    assert gmail._acct_out(row)['todayCap']==2
    row.update(warmup_days=1,warmup_last_date=now.date(),sent_today=1)
    assert gmail._acct_out(row)['todayCap']==2
    assert gmail._acct_out(row)['remainingToday']==1
    row['warmup_last_date']=(now-timedelta(days=1)).date()
    assert gmail._acct_out(row)['todayCap']==4
    row.update(sending_paused=True)
    assert gmail._acct_out(row)['remainingToday']==0
    assert gmail._acct_out(row)['deliveryVerified'] is False


def test_pause_blocks_provider_and_wrong_brand_cannot_resume(setup,monkeypatch):
    c,db,h,calls=setup
    with db() as conn:aid=str(conn.execute("SELECT account_id FROM gmail_accounts WHERE brand_id='real'").fetchone()['account_id'])
    assert c.post('/gmail/accounts/'+aid+'/sending',headers=h,json={'paused':True}).status_code==200
    other={'Authorization':'Bearer '+issue_jwt({'kind':'brand','brand_id':'other'})}
    assert c.post('/gmail/accounts/'+aid+'/sending',headers=other,json={'paused':False}).status_code==403
    with db() as conn:
        assert REAL_GMAIL_SEND(conn,'real','test@example.test','QA','Paused') is None
    assert c.post('/gmail/accounts/'+aid+'/sending',headers=h,json={'paused':False}).json()['sendingPaused'] is False


def test_actual_sender_headers_and_daily_quota(setup,monkeypatch):
    import base64,httpx
    from email import message_from_bytes
    from types import SimpleNamespace
    c,db,h,calls=setup
    observed=[]
    monkeypatch.setattr(gmail,'_refresh_if_needed',lambda *a:'test-token')
    monkeypatch.setenv('INBOUND_REPLY','0')
    def post(url,**kw):
        observed.append(message_from_bytes(base64.urlsafe_b64decode(kw['json']['raw'])))
        return SimpleNamespace(status_code=200,json=lambda:{'id':'accepted-id'})
    monkeypatch.setattr(httpx,'post',post)
    for i in range(3):
        with db() as conn:
            result=REAL_GMAIL_SEND(conn,'real','recipient@example.test','QA','Test message')
        assert bool(result)==(i<2)
    assert len(observed)==2
    assert observed[0]['From']=='sender@example.com'
    assert observed[0]['Reply-To']=='sender@example.com'
    with db() as conn:
        row=conn.execute("SELECT * FROM gmail_accounts WHERE brand_id='real'").fetchone()
        assert row['sent_today']==2 and row['warmup_days']==1


def test_ai_draft_uses_saved_profile_and_never_sends(setup,monkeypatch):
    import json
    from types import SimpleNamespace
    c,db,h,calls=setup
    seen=[]
    def create(**kwargs):
        seen.append(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(type='text',text=json.dumps({'subject':'협업 제안','body':'QA 크림을 소개합니다.'}))])
    monkeypatch.setattr(routes.ai,'_client',lambda:SimpleNamespace(messages=SimpleNamespace(create=create)))
    with db() as conn:
        conn.execute("INSERT INTO brand_profile_versions(brand_id,version,fields) VALUES('real',123,%s) ON CONFLICT DO NOTHING",(json.dumps({'hero_product':{'value':'QA 크림'}}),))
    r=c.post('/brands/real/outreach/compose',headers=h,json={'brief':'한국어 협업 제안 작성'})
    assert r.status_code==200 and r.json()['sent'] is False
    assert 'QA 크림' in seen[0]['messages'][0]['content']
    assert calls==[]
    assert c.post('/brands/other/outreach/compose',headers=h,json={'brief':'한국어 협업 제안 작성'}).status_code==403
    with db() as conn:assert conn.execute('SELECT count(*) AS n FROM outreach_batches').fetchone()['n']==0


def test_gmail_sync_requires_read_grant_and_brand_access(setup):
    c,db,h,calls=setup
    assert c.post('/brands/other/gmail/sync',headers=h).status_code==403
    assert c.post('/brands/real/gmail/sync',headers=h).status_code==409
    assert c.post('/brands/real/gmail/sync').status_code==401


def _gmail_msg(mid,body_text='Hello, interested in your brand',sender='Creator <creator@example.com>'):
    import base64
    body=base64.urlsafe_b64encode(body_text.encode()).decode()
    return {'id':mid,'threadId':'t-'+mid,'internalDate':'1789742726000','labelIds':['INBOX'],
            'payload':{'mimeType':'text/plain','headers':[{'name':'From','value':sender},
            {'name':'Subject','value':'Reply '+mid},{'name':'Message-ID','value':f'<{mid}@example.com>'}],
            'body':{'data':body}}}


def _fake_client(routes_by_token,captured=None):
    """토큰(계정)별로 다른 받은편지함을 돌려주는 가짜 Gmail HTTP 클라이언트."""
    from types import SimpleNamespace

    class Client:
        def __init__(self,**kw):
            self.token=kw.get('headers',{}).get('Authorization','').replace('Bearer ','')
        def __enter__(self):return self
        def __exit__(self,*a):pass
        def get(self,url,**kw):
            if captured is not None:captured.append((self.token,url,kw.get('params',{})))
            box=routes_by_token[self.token]
            for m in box['messages']:
                if url.endswith('/'+m['id']):
                    return SimpleNamespace(status_code=200,raise_for_status=lambda:None,json=lambda m=m:m)
            listing={'messages':[{'id':m['id']} for m in box['messages']]}
            if box.get('next'):listing['nextPageToken']=box['next']
            return SimpleNamespace(status_code=200,raise_for_status=lambda:None,json=lambda:listing)
    return Client


def test_sync_skips_send_only_account_and_uses_readable(setup,monkeypatch):
    """검수 재현: 오래된 발송 전용(gmail.send) 계정 + 새 읽기(readonly) 계정
    혼재 시, 예전 LIMIT 1 선택은 발송 계정을 골라 409였다. 이제 읽기 계정으로
    동기화되고 발송 전용 계정은 건드리지 않으며, 발송은 여전히 승인(선착)
    계정을 쓴다(읽기 계정으로 우회 금지)."""
    import httpx
    c,db,h,calls=setup
    with db() as conn:
        # 기본 시드 sender@ = 발송 전용(먼저 연결됨)
        conn.execute("UPDATE gmail_accounts SET scopes='https://www.googleapis.com/auth/gmail.send openid email',connected_at=now()-interval '30 days' WHERE email='sender@example.com'")
        conn.execute("INSERT INTO gmail_accounts(brand_id,email,scopes) VALUES('real','reader@example.com',%s)",(gmail.SCOPES,))
    monkeypatch.setattr(gmail,'_refresh_if_needed',lambda conn,a:'tok-'+a['email'])
    monkeypatch.setattr(httpx,'Client',_fake_client({'tok-reader@example.com':{'messages':[_gmail_msg('mx1')]}}))
    r=c.post('/brands/real/gmail/sync',headers=h)
    assert r.status_code==200 and r.json()['imported']==1
    assert r.json()['accounts']==[{'email':'reader@example.com','imported':1,'error':''}]
    with db() as conn:
        reader=conn.execute("SELECT * FROM gmail_accounts WHERE email='reader@example.com'").fetchone()
        sender=conn.execute("SELECT * FROM gmail_accounts WHERE email='sender@example.com'").fetchone()
        msg=conn.execute("SELECT gmail_account_id FROM mail_messages WHERE gmail_message_id='mx1'").fetchone()
    assert msg['gmail_account_id']==reader['account_id']
    assert reader['synced_at'] is not None and reader['sync_error']==''
    # 발송 전용 계정은 동기화가 손대지 않는다 (커서·오류·스코프·상태 불변)
    assert sender['synced_at'] is None and sender['sync_error']==''
    assert sender['scopes'].startswith('https://www.googleapis.com/auth/gmail.send')
    assert sender['state']=='connected'
    # 발송 계정 선택은 그대로: 승인(선착) 계정 sender@ — 읽기 계정으로 우회 안 함
    with db() as conn:
        pick=conn.execute("SELECT email FROM gmail_accounts WHERE brand_id='real'"
                          " AND state='connected' ORDER BY connected_at,account_id"
                          " LIMIT 1").fetchone()
    assert pick['email']=='sender@example.com'
    from email import message_from_bytes
    import base64 as b64
    observed=[]
    def post(url,**kw):
        observed.append(message_from_bytes(b64.urlsafe_b64decode(kw['json']['raw'])))
        from types import SimpleNamespace
        return SimpleNamespace(status_code=200,json=lambda:{'id':'sent-id'})
    monkeypatch.setattr(httpx,'post',post)
    with db() as conn:
        assert REAL_GMAIL_SEND(conn,'real','someone@example.test','제목','본문')
    assert observed and observed[0]['From']=='sender@example.com'


def test_sync_multiple_read_accounts_each_have_own_cursor(setup,monkeypatch):
    """복수 읽기 계정: 각자 받은편지함을 가져오고 커서(sync_page_token)와
    성공 기록이 계정별로 저장된다. 다음 동기화는 각자 커서에서 재개."""
    import httpx
    c,db,h,calls=setup
    with db() as conn:
        conn.execute("UPDATE gmail_accounts SET scopes=%s WHERE email='sender@example.com'",(gmail.SCOPES,))
        conn.execute("INSERT INTO gmail_accounts(brand_id,email,scopes) VALUES('real','r2@example.com',%s)",(gmail.SCOPES,))
    monkeypatch.setattr(gmail,'_refresh_if_needed',lambda conn,a:'tok-'+a['email'])
    captured=[]
    monkeypatch.setattr(httpx,'Client',_fake_client({
        'tok-sender@example.com':{'messages':[_gmail_msg('m-a1',sender='A <a@ex.com>')],'next':'page-2'},
        'tok-r2@example.com':{'messages':[_gmail_msg('m-b1',sender='B <b@ex.com>')]}},captured))
    r=c.post('/brands/real/gmail/sync',headers=h).json()
    assert r['imported']==2 and r['hasMore'] is True
    with db() as conn:
        a1=conn.execute("SELECT * FROM gmail_accounts WHERE email='sender@example.com'").fetchone()
        a2=conn.execute("SELECT * FROM gmail_accounts WHERE email='r2@example.com'").fetchone()
        rows=conn.execute("SELECT gmail_message_id,gmail_account_id FROM mail_messages ORDER BY gmail_message_id").fetchall()
    assert a1['sync_page_token']=='page-2' and a2['sync_page_token']==''   # 계정별 커서
    assert a1['synced_at'] and a2['synced_at'] and a1['sync_error']==a2['sync_error']==''
    assert {x['gmail_message_id']:x['gmail_account_id'] for x in rows}=={'m-a1':a1['account_id'],'m-b1':a2['account_id']}
    # 재동기화: 계정1은 자기 커서(page-2)에서 재개, 중복 없음
    captured.clear()
    r2=c.post('/brands/real/gmail/sync',headers=h).json()
    assert r2['imported']==0
    listing=[p for t,u,p in captured if t=='tok-sender@example.com' and u.endswith('/messages')]
    assert listing and listing[0].get('pageToken')=='page-2'


def test_sync_one_expired_account_does_not_block_others(setup,monkeypatch):
    """한 읽기 계정 토큰 만료(갱신 실패)여도 다른 읽기 계정은 계속 동기화되고,
    오류는 만료 계정에만 기록된다. 전 계정 실패면 502."""
    import httpx
    from fastapi import HTTPException as HX
    c,db,h,calls=setup
    with db() as conn:
        conn.execute("UPDATE gmail_accounts SET scopes=%s WHERE email='sender@example.com'",(gmail.SCOPES,))
        conn.execute("INSERT INTO gmail_accounts(brand_id,email,scopes) VALUES('real','ok@example.com',%s)",(gmail.SCOPES,))
    def refresh(conn,a):
        if a['email']=='sender@example.com':raise HX(502,'구글 토큰 갱신 실패 — 재연결이 필요합니다')
        return 'tok-'+a['email']
    monkeypatch.setattr(gmail,'_refresh_if_needed',refresh)
    monkeypatch.setattr(httpx,'Client',_fake_client({'tok-ok@example.com':{'messages':[_gmail_msg('m-ok1')]}}))
    r=c.post('/brands/real/gmail/sync',headers=h)
    assert r.status_code==200 and r.json()['imported']==1
    accounts={a['email']:a for a in r.json()['accounts']}
    assert accounts['ok@example.com']['error']=='' and '갱신 실패' in accounts['sender@example.com']['error']
    with db() as conn:
        bad=conn.execute("SELECT sync_error FROM gmail_accounts WHERE email='sender@example.com'").fetchone()
        good=conn.execute("SELECT sync_error,synced_at FROM gmail_accounts WHERE email='ok@example.com'").fetchone()
    assert '갱신 실패' in bad['sync_error'] and good['sync_error']=='' and good['synced_at']
    # 전 계정 실패 → 502, 그리고 계정별 sync_error가 '커밋된 뒤' 실패 응답
    # (검수 재현: 예전엔 with 안에서 raise → rollback으로 기록이 사라졌다)
    monkeypatch.setattr(gmail,'_refresh_if_needed',lambda conn,a:(_ for _ in ()).throw(HX(401,'구글 토큰 갱신 실패 — 재연결이 필요합니다')))
    assert c.post('/brands/real/gmail/sync',headers=h).status_code==502
    with db() as conn:
        rows=conn.execute("SELECT email,sync_error FROM gmail_accounts"
                          " WHERE brand_id='real' ORDER BY email").fetchall()
    assert rows and all('갱신 실패' in r['sync_error'] for r in rows)   # 영속화됨


def test_sync_db_error_rolls_back_partial_and_continues(setup,monkeypatch):
    """검수 재현: 한 계정 처리 중 DB 오류(SELECT 1/0)로 트랜잭션이 abort돼도
    계정별 savepoint 덕에 그 계정의 부분 삽입만 롤백되고, 오류 기록은 보존되며
    다음 계정은 정상 진행된다. 장애 해소 후 재시도해도 중복이 없다."""
    import httpx
    from api import gmail_sync as gs
    c,db,h,calls=setup
    with db() as conn:
        # sender@ = 먼저 연결된 읽기 계정(장애 주입 대상), good@ = 이후 연결
        conn.execute("UPDATE gmail_accounts SET scopes=%s,connected_at=now()-interval '10 days' WHERE email='sender@example.com'",(gmail.SCOPES,))
        conn.execute("INSERT INTO gmail_accounts(brand_id,email,scopes) VALUES('real','good@example.com',%s)",(gmail.SCOPES,))
    monkeypatch.setattr(gmail,'_refresh_if_needed',lambda conn,a:'tok-'+a['email'])
    monkeypatch.setattr(httpx,'Client',_fake_client({
        'tok-sender@example.com':{'messages':[_gmail_msg('m-bad1',sender='B <bad@ex.com>')]},
        'tok-good@example.com':{'messages':[_gmail_msg('m-good1',sender='G <good@ex.com>')]}}))
    orig=gs._import_account
    def flaky(conn,brand,account,token):
        added,more=orig(conn,brand,account,token)          # 실삽입 후
        if account['email']=='sender@example.com':
            conn.execute('SELECT 1/0')                     # DB 오류 주입 → tx abort
        return added,more
    monkeypatch.setattr(gs,'_import_account',flaky)
    r=c.post('/brands/real/gmail/sync',headers=h)
    assert r.status_code==200 and r.json()['imported']==1  # good@만 성공
    accounts={a['email']:a for a in r.json()['accounts']}
    assert accounts['good@example.com']['error']==''
    assert 'DivisionByZero' in accounts['sender@example.com']['error']
    with db() as conn:
        bad=conn.execute("SELECT * FROM gmail_accounts WHERE email='sender@example.com'").fetchone()
        good=conn.execute("SELECT * FROM gmail_accounts WHERE email='good@example.com'").fetchone()
        msgs=conn.execute("SELECT gmail_message_id,gmail_account_id FROM mail_messages ORDER BY gmail_message_id").fetchall()
    # 장애 계정: 부분 삽입 롤백(그 계정 메시지 0) + 오류 기록 보존 + 커서 불변
    assert 'DivisionByZero' in bad['sync_error'] and bad['synced_at'] is None
    assert [m['gmail_message_id'] for m in msgs]==['m-good1']
    assert msgs[0]['gmail_account_id']==good['account_id']
    # 장애 해소 후 재시도: 장애 계정 메시지가 들어오고, 성공분 중복 없음
    monkeypatch.setattr(gs,'_import_account',orig)
    r2=c.post('/brands/real/gmail/sync',headers=h).json()
    assert r2['imported']==1                                # m-bad1 1건만 추가
    with db() as conn:
        rows=conn.execute("SELECT gmail_message_id FROM mail_messages ORDER BY gmail_message_id").fetchall()
        bad2=conn.execute("SELECT sync_error,synced_at FROM gmail_accounts WHERE email='sender@example.com'").fetchone()
    assert [x['gmail_message_id'] for x in rows]==['m-bad1','m-good1']  # 중복 0
    assert bad2['sync_error']=='' and bad2['synced_at'] is not None     # 회복 기록


def test_admin_gmail_status_readonly(setup):
    """관리자 Gmail 운영 상태 — 읽기 전용, 브랜드 토큰 불가, 발송 유발 없음."""
    c,db,h,calls=setup
    assert c.get('/admin/gmail/status',headers=h).status_code==401   # 브랜드 토큰
    assert c.get('/admin/gmail/status').status_code==401             # 무토큰
    r=c.get('/admin/gmail/status',headers={'X-Admin-Id':'jay'})
    assert r.status_code==200
    body=r.json()
    real=next(b for b in body['brands'] if b['brandId']=='real')
    a=real['accounts'][0]
    assert a['email']=='sender@example.com'
    for k in ('canRead','syncError','syncedAt','sentToday','todayCap',
              'sendingPaused','warmupDay','syncCursorSet'):
        assert k in a
    assert 'pendingApprovedSends' in real
    assert 'runner' in body and '읽기 전용' in body['note']
    assert calls==[]                          # 상태 조회는 발송을 유발하지 않는다


def test_gmail_import_is_idempotent_and_tenant_private(setup,monkeypatch):
    import base64,httpx
    from types import SimpleNamespace
    c,db,h,calls=setup
    with db() as conn:conn.execute("UPDATE gmail_accounts SET scopes=%s WHERE brand_id='real'",(gmail.SCOPES,))
    monkeypatch.setattr(gmail,'_refresh_if_needed',lambda *a:'test')
    body=base64.urlsafe_b64encode('Hello, interested in your brand'.encode()).decode()
    data={'id':'gm1','threadId':'gt1','internalDate':'1789742726000','labelIds':['INBOX'],'payload':{'mimeType':'text/plain','headers':[{'name':'From','value':'Creator <creator@example.com>'},{'name':'Subject','value':'Reply subject'},{'name':'Message-ID','value':'<one@example.com>'}],'body':{'data':body}}}
    class Client:
        def __init__(self,**kw):pass
        def __enter__(self):return self
        def __exit__(self,*a):pass
        def get(self,url,**kw):return SimpleNamespace(status_code=200,raise_for_status=lambda:None,json=lambda: data if url.endswith('/gm1') else {'messages':[{'id':'gm1'}]})
    monkeypatch.setattr(httpx,'Client',Client)
    assert c.post('/brands/real/gmail/sync',headers=h).json()['imported']==1
    assert c.post('/brands/real/gmail/sync',headers=h).json()['imported']==0
    with db() as conn:
        row=conn.execute("SELECT * FROM mail_messages WHERE gmail_message_id='gm1'").fetchone()
        assert row['body']=='Hello, interested in your brand'
        assert row['gmail_thread_id']=='gt1' and row['rfc_message_id']=='<one@example.com>'
    other={'Authorization':'Bearer '+issue_jwt({'kind':'brand','brand_id':'other'})}
    assert c.get('/inbox/threads/'+str(row['thread_id']),headers=other).status_code==403
    assert calls==[]


def test_oauth_nonce_is_single_use_and_brand_bound(setup):
    from fastapi import HTTPException
    c,db,h,calls=setup
    nonce=gmail._new_oauth_state('real')
    assert gmail._consume_oauth_state(nonce)=='real'
    with pytest.raises(HTTPException):gmail._consume_oauth_state(nonce)
    with pytest.raises(HTTPException):gmail._consume_oauth_state('tampered')


def test_callback_stores_granted_scope_and_blocks_shared_brand_mailbox(setup,monkeypatch):
    import base64,json,httpx
    from types import SimpleNamespace
    c,db,h,calls=setup
    claims=base64.urlsafe_b64encode(json.dumps({'email':'sender@example.com','email_verified':True}).encode()).decode().rstrip('=')
    token={'access_token':'test','id_token':'header.'+claims+'.signature','scope':'https://www.googleapis.com/auth/gmail.send openid email'}
    monkeypatch.setattr(httpx,'post',lambda *a,**kw:SimpleNamespace(json=lambda:token))
    with db() as conn:conn.execute("UPDATE gmail_accounts SET refresh_token='original-refresh' WHERE brand_id='real'")
    nonce=gmail._new_oauth_state('real')
    assert c.get('/gmail/callback',params={'code':'test','state':nonce}).status_code==200
    with db() as conn:
        row=conn.execute("SELECT * FROM gmail_accounts WHERE brand_id='real'").fetchone()
        assert row['refresh_token']=='original-refresh'
        assert gmail._acct_out(row)['canRead'] is False
    nonce=gmail._new_oauth_state('other')
    assert c.get('/gmail/callback',params={'code':'test','state':nonce}).status_code==409


def test_reply_provider_payload_is_bound_to_receiving_account(setup,monkeypatch):
    import base64,httpx
    from email import message_from_bytes
    from types import SimpleNamespace
    c,db,h,calls=setup
    with db() as conn:aid=conn.execute("SELECT account_id FROM gmail_accounts WHERE brand_id='real'").fetchone()['account_id']
    observed=[]
    monkeypatch.setattr(gmail,'_refresh_if_needed',lambda *a:'test-token')
    def post(url,**kw):
        observed.append(kw['json'])
        return SimpleNamespace(status_code=200,json=lambda:{'id':'reply-id'})
    monkeypatch.setattr(httpx,'post',post)
    with db() as conn:
        assert REAL_GMAIL_SEND(conn,'other','creator@example.com','Re: Hello','reply',account_id=aid) is None
        assert REAL_GMAIL_SEND(conn,'real','creator@example.com','Re: Hello','reply',account_id=aid,reply_headers={'rfc_message_id':'<in@example.com>','gmail_thread_id':'thread-1'})
    assert len(observed)==1 and observed[0]['threadId']=='thread-1'
    msg=message_from_bytes(base64.urlsafe_b64decode(observed[0]['raw']))
    assert msg['In-Reply-To']==msg['References']=='<in@example.com>'


def test_inbox_html_and_attachments_are_not_executed():
    import base64
    from api.gmail_sync import text_body
    def payload(text,**extra):return dict(mimeType='text/html',body={'data':base64.urlsafe_b64encode(text.encode()).decode()},**extra)
    assert text_body(payload('<script>bad()</script><p>Hello</p>')).strip()=='Hello'
    assert text_body(payload('secret',filename='attachment.html'))==''
