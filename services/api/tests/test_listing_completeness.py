"""공개 목록 완성도 — 서버 검사가 콘솔 제품 편집기의 필수 항목과 같다(임시 저장 → 공개 우회 불가)."""
from conftest import listing_ready
from test_collab_api import _approved_brand, _bearer
from test_console_v8 import PNG, _up


def test_draft_saved_product_cannot_bypass_required_fields_to_public(client):
    B = _bearer(_approved_brand(client, "fullreq", "완성도", "own@fullreq.kr"))
    pid = client.post("/brands/fullreq/products", json={"name": "임시 앰플"}, headers=B).json()["productId"]
    # 임시 저장(이전 검사만 통과하던 상태): 상세 설명 10자 이상 + 대표 이미지만
    client.post(f"/brands/fullreq/products/{pid}/profile", json={"answers": {"description": "임시로 저장한 진정 앰플 소개예요"}}, headers=B)
    assert _up(client, B, "fullreq", pid, PNG).status_code == 200
    r = client.post(f"/brands/fullreq/products/{pid}/public", json={"listed": True}, headers=B)
    assert r.status_code == 409, r.text
    assert all(k in r.json()["detail"] for k in ("카테고리", "USP 3개", "배송 가능 국가"))
    prod = next(p for p in client.get("/brands/fullreq/products", headers=B).json() if p["productId"] == pid)
    assert prod["publicListed"] is False and prod["publicMissing"] == ["카테고리", "USP 3개", "배송 가능 국가"]   # 화면 안내와 같은 목록
    # USP 2개만 → 여전히 거부
    client.post(f"/brands/fullreq/products/{pid}/profile", json={"answers": {"category": "스킨케어", "usp": "진정\n보습", "ship": "US"}}, headers=B)
    r = client.post(f"/brands/fullreq/products/{pid}/public", json={"listed": True}, headers=B)
    assert r.status_code == 409 and "USP 3개" in r.json()["detail"]
    # 모두 채우면 공개 성공, 공개 목록에 보인다
    listing_ready(client, "fullreq", pid, B)
    r = client.post(f"/brands/fullreq/products/{pid}/public", json={"listed": True}, headers=B)
    assert r.status_code == 200 and r.json()["publicListed"] is True and r.json()["publicMissing"] == []
    assert pid in [x["productId"] for x in client.get("/public/products?brand=fullreq").json()["items"]]


def test_ops_reviewed_intro_still_counts_as_description(client):
    """운영팀 검수 소개·이미지는 기존대로 상세 설명·대표 이미지로 인정(보존)."""
    import os, psycopg
    B = _bearer(_approved_brand(client, "opsintro", "운영소개", "own@opsintro.kr"))
    pid = client.post("/brands/opsintro/products", json={"name": "운영 소개 제품"}, headers=B).json()["productId"]
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        c.execute("INSERT INTO product_invitation_profiles (product_id, summary, image_url) VALUES (%s,%s,%s)",
                  (pid, "운영팀이 검수한 공개 소개 문장입니다", "https://cdn.example.com/o.png"))
    listing_ready(client, "opsintro", pid, B)
    assert client.post(f"/brands/opsintro/products/{pid}/public", json={"listed": True}, headers=B).status_code == 200
