"""운영자 후보 풀(/admin/pool) — 등록·미리보기·현황 + 추천 연결 회귀.

전부 격리 DB·모사. 실인물/실이메일 없음(example 도메인만), 외부 호출 없음.
"""

import json
import os

import psycopg
from psycopg.rows import dict_row


def _db():
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)


def _bearer(t):
    return {"Authorization": f"Bearer {t}"}


def _admin_token(client):
    from api import auth as auth_mod
    with _db() as conn:
        conn.execute(
            "INSERT INTO users (kind, email, password_hash) VALUES"
            " ('admin', 'pool.admin@ex.com', %s)"
            " ON CONFLICT (email) DO NOTHING",
            (auth_mod.hash_password("pool-admin-pw-1"),))
        conn.commit()
    return client.post("/auth/login", json={
        "email": "pool.admin@ex.com",
        "password": "pool-admin-pw-1"}).json()["token"]


def _brand_token(client, email="pool.brand@glowlab.co"):
    inv = client.post("/auth/invite", json={"email": email,
                                            "brand_id": "glowlab"}).json()
    tok = inv["demoLink"].split("invite=")[1]
    return client.post("/auth/accept", json={
        "token": tok, "password": "pool-brand-pw-1"}).json()["token"]


def _cleanup():
    with _db() as conn:
        conn.execute("DELETE FROM creator_pool WHERE platform_uid LIKE 'pool%'"
                     " OR handle LIKE 'pool%'")
        conn.commit()


CSV = ("handle,email,country,platform,category,product_tags,followers\n"
       "pool.one,pool.one@example.com,TH,tiktok,beauty;skincare,serum,12000\n"
       "pool.two,pool.two@example.com,VN,instagram,beauty,,900\n")


def test_admin_only_and_no_write_on_preview(client):
    at = _admin_token(client)
    bt = _brand_token(client)
    # 브랜드/무토큰은 전부 401 (관리자 전용)
    for path in ["/admin/pool/status"]:
        assert client.get(path).status_code == 401
        assert client.get(path, headers=_bearer(bt)).status_code == 401
    for path in ["/admin/pool/candidates/preview", "/admin/pool/candidates"]:
        assert client.post(path, json={"csv": CSV},
                           headers=_bearer(bt)).status_code == 401
    # 미리보기는 DB에 아무것도 남기지 않는다
    r = client.post("/admin/pool/candidates/preview", json={"csv": CSV},
                    headers=_bearer(at))
    assert r.status_code == 200
    assert r.json()["counts"] == {"insert": 2, "skip": 0, "error": 0}
    assert "미검증" in r.json()["note"]
    with _db() as conn:
        n = conn.execute("SELECT count(*) n FROM creator_pool"
                         " WHERE handle LIKE 'pool.%'").fetchone()["n"]
    assert n == 0
    _cleanup()


def test_import_never_marks_valid_and_records_source(client):
    at = _admin_token(client)
    r = client.post("/admin/pool/candidates", json={"csv": CSV},
                    headers=_bearer(at))
    assert r.status_code == 200 and r.json()["inserted"] == 2
    with _db() as conn:
        rows = conn.execute("SELECT * FROM creator_pool WHERE handle LIKE"
                            " 'pool.%' ORDER BY handle").fetchall()
    assert len(rows) == 2
    for row in rows:
        # 형식 검사만 통과한 이메일은 절대 'valid'가 아니다
        assert row["email_status"] == "none"
        assert row["state"] == "POOL"
        src = row["sources"]
        assert src and src[0]["vendor"].startswith("manual:")   # 출처·주체
        assert src[0]["seen_at"]
    # 재등록(중복)은 전부 skip — 중복 방지
    r2 = client.post("/admin/pool/candidates", json={"csv": CSV},
                     headers=_bearer(at))
    assert r2.json()["inserted"] == 0
    assert r2.json()["counts"]["skip"] == 2
    _cleanup()


def test_validation_formula_size_and_dedup(client):
    at = _admin_token(client)
    bad = ("handle,email,country,followers\n"
           "pool.f1,=cmd()@example.com,TH,10\n"          # 수식 시작 셀
           "pool.f2,pool.f2@example.com,THA,10\n"        # 국가 3자
           "pool.f3,not-an-email,TH,10\n"                # 이메일 형식
           "pool.f4,pool.f4@example.com,TH,-5\n"         # 음수 팔로워
           "pool.f5,pool.f5@example.com,TH,10\n"
           "pool.f5,pool.dup@example.com,TH,10\n")       # 파일 내 중복
    r = client.post("/admin/pool/candidates/preview", json={"csv": bad},
                    headers=_bearer(at))
    assert r.status_code == 200
    c = r.json()["counts"]
    assert c == {"insert": 1, "skip": 1, "error": 4}
    reasons = " / ".join(x["reason"] for x in r.json()["rows"])
    assert "수식" in reasons and "중복" in reasons
    # 오류 응답에 셀 원문(이메일)을 반향하지 않는다
    assert "not-an-email" not in r.text and "cmd()" not in r.text
    # 크기 제한: 초과 CSV는 413
    huge = "handle,email\n" + ("x" * 262_200)
    assert client.post("/admin/pool/candidates/preview", json={"csv": huge},
                       headers=_bearer(at)).status_code == 413
    rows_too_many = {"rows": [{"handle": f"pool.r{i}"} for i in range(501)]}
    assert client.post("/admin/pool/candidates/preview", json=rows_too_many,
                       headers=_bearer(at)).status_code == 413
    # 알 수 없는 컬럼 거부(오타로 인한 조용한 유실 방지)
    assert client.post("/admin/pool/candidates/preview",
                       json={"csv": "handle,emial\npool.x,a@example.com\n"},
                       headers=_bearer(at)).status_code == 400
    _cleanup()


def test_status_counts_and_exclusion_reasons(client):
    at = _admin_token(client)
    with _db() as conn:
        conn.execute(
            "INSERT INTO creator_pool (platform, platform_uid, handle,"
            " country, email, email_status, state) VALUES"
            " ('tiktok','pool-s1','pool.s1','TH','pool.s1@example.com','valid','POOL'),"
            " ('tiktok','pool-s2','pool.s2','TH','pool.s2@example.com','none','POOL'),"
            " ('tiktok','pool-s3','pool.s3','VN','pool.s3@example.com','risky','POOL'),"
            " ('tiktok','pool-s4','pool.s4','VN',NULL,'none','POOL'),"
            " ('tiktok','pool-s5','pool.s5','TH','pool.s5@example.com','valid','EXCLUDED')"
            " ON CONFLICT DO NOTHING")
        conn.execute(
            "INSERT INTO outreach_optouts (brand_id, email, opted_out_at)"
            " VALUES ('glowlab','pool.s1@example.com', now())"
            " ON CONFLICT (brand_id, email) DO UPDATE SET opted_out_at=now()")
        conn.commit()
    s = client.get("/admin/pool/status", headers=_bearer(at)).json()
    assert s["total"] >= 5
    assert s["recommendable"] >= 2                 # s1, s2 (s3 risky·s4 무이메일·s5 EXCLUDED 제외)
    assert s["exclusions"]["riskyEmail"] >= 1
    assert s["exclusions"]["noEmail"] >= 1
    assert s["exclusions"]["excludedState"] >= 1
    assert s["exclusions"]["optedOutEmails"] >= 1  # 수신거부 보존·집계
    assert any(c["country"] == "TH" for c in s["byCountry"])
    with _db() as conn:
        conn.execute("DELETE FROM outreach_optouts WHERE email LIKE 'pool.%'")
        conn.commit()
    _cleanup()


def test_candidates_exclude_excluded_state_and_optout_preserved(client):
    """추천 API가 EXCLUDED 상태·수신거부 이메일을 계속 제외하는지 —
    운영자 등록(미검증) 후보는 포함하되 미검증 표시."""
    bt = _brand_token(client, "pool.cand@glowlab.co")
    with _db() as conn:
        conn.execute(
            "INSERT INTO creator_pool (platform, platform_uid, handle,"
            " country, category, email, email_status, state) VALUES"
            " ('manual','pool-c1','pool.c1','TH',ARRAY['beauty'],"
            "  'pool.c1@example.com','none','POOL'),"
            " ('manual','pool-c2','pool.c2','TH',ARRAY['beauty'],"
            "  'pool.c2@example.com','none','EXCLUDED'),"
            " ('manual','pool-c3','pool.c3','TH',ARRAY['beauty'],"
            "  'pool.c3@example.com','valid','POOL')"
            " ON CONFLICT DO NOTHING")
        conn.execute(
            "INSERT INTO outreach_optouts (brand_id, email, opted_out_at)"
            " VALUES ('glowlab','pool.c3@example.com', now())"
            " ON CONFLICT (brand_id, email) DO UPDATE SET opted_out_at=now()")
        conn.commit()
    p = client.post("/brands/glowlab/products", json={"name": "풀 테스트 세럼"},
                    headers=_bearer(bt)).json()
    r = client.get(f"/brands/glowlab/products/{p['productId']}/candidates"
                   "?country=TH", headers=_bearer(bt)).json()
    handles = [c["handle"] for c in r["candidates"]]
    assert "pool.c1" in handles                    # 미검증 포함(표시와 함께)
    assert "pool.c2" not in handles                # EXCLUDED 제외
    assert "pool.c3" not in handles                # 수신거부 보존
    c1 = [c for c in r["candidates"] if c["handle"] == "pool.c1"][0]
    assert c1["emailVerified"] is False and c1["email"].endswith("example.com")
    with _db() as conn:
        conn.execute("DELETE FROM outreach_optouts WHERE email LIKE 'pool.%'")
        conn.commit()
    _cleanup()


def test_compose_appends_brand_join_link(client, monkeypatch):
    """AI 초안 응답 본문 끝에 브랜드 PR 리스트 합류 링크가 서버 결정으로
    포함된다 — AI 출력에 의존하지 않고, 자동 발송은 없다."""
    from api import routes_outreach
    bt = _brand_token(client, "pool.compose@glowlab.co")

    class _Text:
        type = "text"
        text = json.dumps({"subject": "협업 제안", "body": "안녕하세요, 제안드립니다."},
                          ensure_ascii=False)

    class _Msg:
        content = [_Text()]

    class _Messages:
        @staticmethod
        def create(**kw):
            return _Msg()

    class _Client:
        messages = _Messages()

    monkeypatch.setattr(routes_outreach.ai, "_client", lambda: _Client())
    with _db() as conn:
        conn.execute(
            "INSERT INTO brand_profile_versions (brand_id, version, fields)"
            " SELECT 'glowlab', COALESCE(MAX(version),0)+1,"
            " '{\"brand_one_liner\": {\"value\": \"글로우랩\"}}'::jsonb"
            " FROM brand_profile_versions WHERE brand_id='glowlab'")
        conn.commit()
    monkeypatch.setenv("CREATOR_APP_URL", "https://app.theprlist.net/")
    r = client.post("/brands/glowlab/outreach/compose",
                    json={"brief": "태국 크리에이터 협업 제안"},
                    headers=_bearer(bt))
    assert r.status_code == 200, r.text
    body = r.json()["body"]
    assert body.endswith("https://app.theprlist.net/?brand=glowlab")
    assert "합류" in body
    assert r.json()["joinUrl"] == "https://app.theprlist.net/?brand=glowlab"
    assert r.json()["sent"] is False               # 자동 발송 없음
    _Text.text = json.dumps({"subject": "긴 초안", "body": "x" * 9990})
    long = client.post("/brands/glowlab/outreach/compose",
                       json={"brief": "긴 초안 검사"}, headers=_bearer(bt))
    assert long.status_code == 503  # 저장 불가능한 초안을 성공으로 돌려주지 않음


def test_csv_malformed_and_byte_limits(client):
    headers = _bearer(_admin_token(client))
    path = "/admin/pool/candidates/preview"
    for text in ("handle,handle\npool.a,pool.b", "handle,email\npool.a,a@example.com,extra",
                 "handle,bio\npool.a," + "x" * 140_000, "x" * 140_000 + "\npool.a"):
        assert client.post(path, json={"csv": text}, headers=headers).status_code == 400
    assert client.post(path, json={"csv": "handle,bio\npool.a," + "한" * 90_000},
                       headers=headers).status_code == 413
    assert client.post(path, json={"rows": [{"handle": "pool.formula", "bio": "+1+HYPERLINK(foo)"}]},
                       headers=headers).json()["counts"]["error"] == 1


def test_concurrent_import_deduplicates_email(client):
    from concurrent.futures import ThreadPoolExecutor
    headers = _bearer(_admin_token(client))
    def register(i):
        return client.post("/admin/pool/candidates", headers=headers,
                           json={"rows": [{"handle": f"pool.race{i}", "email": "pool.race@example.com"}]})
    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(register, range(2)))
        assert all(r.status_code == 200 for r in responses)
        assert sum(r.json()["inserted"] for r in responses) == 1
        with _db() as conn:
            assert conn.execute("SELECT count(*) n FROM creator_pool WHERE email='pool.race@example.com'").fetchone()["n"] == 1
    finally:
        _cleanup()
