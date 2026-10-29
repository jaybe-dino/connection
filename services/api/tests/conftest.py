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
            # Synthetic fixtures are relative to today's Korean date. Production
            # seed deadlines remain untouched; expired campaign tests use cmp-1.
            import psycopg
            with psycopg.connect(os.environ['DATABASE_URL']) as conn:
                conn.execute("UPDATE campaigns SET deadline=(now() AT TIME ZONE 'Asia/Seoul')::date + 30 WHERE campaign_id='cmp-2'")
                conn.execute("UPDATE campaigns SET deadline=(now() AT TIME ZONE 'Asia/Seoul')::date - 1 WHERE campaign_id='cmp-1'")
            yield c
    finally:
        os.environ.clear();os.environ.update(previous)
        subprocess.run(['dropdb',name],check=True)


def tiktok_connect(client, headers, open_id):
    """로컬 fake provider로 TikTok OAuth 성공을 재현 — 외부 호출 없음.

    신규 회원 입장 게이트(온보딩+TikTok 소유 인증)의 정상 여정 테스트용.
    운영에서 키 미설정이면 신규 가입 검수는 외부 승인 blocker로 남는다."""
    import unittest.mock as mock
    from urllib.parse import parse_qs, urlparse

    class _R:
        def __init__(self, v):
            self.v = v

        def json(self):
            return self.v
    with mock.patch.dict(os.environ, {"TIKTOK_CLIENT_KEY": "test-key",
                                      "TIKTOK_CLIENT_SECRET": "test-secret"}):
        start = client.post("/me/tiktok/connect-start", headers=headers)
        assert start.status_code == 200, start.text
        state = parse_qs(urlparse(start.json()["authUrl"]).query)["state"][0]
        with mock.patch("httpx.post", lambda *a, **k: _R(
                {"access_token": "t", "open_id": open_id})), \
             mock.patch("httpx.get", lambda *a, **k: _R(
                {"data": {"user": {"open_id": open_id,
                                   "display_name": "QA"}},
                 "error": {"code": "ok"}})):
            r = client.get(f"/tiktok/callback?code=c&state={state}")
        assert r.status_code == 200, r.text


def listing_ready(client, brand, pid, headers, category="스킨케어"):
    """공개 목록 필수 항목(카테고리·USP 3개·배송 국가)을 실제 저장 경로로 채운다 — 콘솔 제품 편집기와 같은 기준.
    상세 설명·대표 이미지는 각 테스트가 정한 방식(운영 소개/업로드)을 그대로 쓴다."""
    r = client.post(f"/brands/{brand}/products/{pid}/profile", headers=headers, json={"answers": {
        "category": category, "usp": "진정\n보습\n저자극", "ship": "US"}})
    assert r.status_code == 200, r.text
