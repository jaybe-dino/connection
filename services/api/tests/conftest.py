import os
import subprocess
import uuid
import pytest

@pytest.fixture(scope="session")
def client():
    name="prlist_api_"+uuid.uuid4().hex[:12]
    subprocess.run(['createdb',name],check=True)
    previous=dict(os.environ)
    os.environ['DATABASE_URL']='postgresql:///'+name+'?host='+os.environ.get('PGHOST','/tmp')+'&port='+os.environ.get('PGPORT','5432')
    os.environ['RUNNER_ENABLED']='0'
    os.environ['AUTH_REQUIRED']='0'
    for k in ['ANTHROPIC_API_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','SENDGRID_API_KEY','NICEPAY_CLIENT_KEY','NICEPAY_SECRET_KEY','ADMIN_KEY']:
        os.environ.pop(k,None)
    from fastapi.testclient import TestClient
    from api.main import app
    try:
        with TestClient(app) as c:
            assert c.get('/health').json()['db']=='ok'
            yield c
    finally:
        os.environ.clear();os.environ.update(previous)
        subprocess.run(['dropdb',name],check=True)
