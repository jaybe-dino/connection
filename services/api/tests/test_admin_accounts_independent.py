"""Independent acceptance: account invariants must hold across the old team API too."""
from uuid import uuid4
from api import auth
from api.db import connect


def _users():
    suffix = uuid4().hex[:10]
    brand = 'accounts-' + suffix
    with connect() as c:
        c.execute('INSERT INTO brands(brand_id,name) VALUES(%s,%s)', (brand, brand))
        out = []
        for role in ('owner', 'manager'):
            u = c.execute("INSERT INTO users(kind,email,brand_id,password_hash) VALUES('brand',%s,%s,%s) RETURNING *", (role+'-'+suffix+'@example.test',brand,auth.hash_password('Local-Qa-Password-2026'))).fetchone()
            c.execute('INSERT INTO brand_team_roles(brand_id,user_id,role) VALUES(%s,%s,%s)',(brand,u['user_id'],role))
            out.append(u)
    return brand,out


def _header(u):
    return {'Authorization':'Bearer '+auth.issue_jwt({'sub':str(u['user_id']),'kind':'brand','brand_id':u['brand_id'],'se':u['session_epoch']})}


def test_last_owner_cannot_be_removed_through_existing_team_route(client,monkeypatch):
    brand,(owner,manager)=_users()
    monkeypatch.setenv('AUTH_REQUIRED','1')
    r=client.post(f'/brands/{brand}/team/role',headers=_header(owner),json={'user_id':str(owner['user_id']),'role':'manager'})
    assert r.status_code==409,r.text
    with connect() as c:
        assert c.execute('SELECT role FROM brand_team_roles WHERE user_id=%s',(owner['user_id'],)).fetchone()['role']=='owner'


def test_existing_team_role_change_revokes_old_login_session(client,monkeypatch):
    brand,(owner,manager)=_users()
    monkeypatch.setenv('AUTH_REQUIRED','1')
    old=_header(manager)
    assert client.get(f'/brands/{brand}/team',headers=old).status_code==200
    r=client.post(f'/brands/{brand}/team/role',headers=_header(owner),json={'user_id':str(manager['user_id']),'role':'owner'})
    assert r.status_code==200,r.text
    assert client.get(f'/brands/{brand}/team',headers=old).status_code==401
