import json

import pytest

from harvest.http import HttpResponse
from harvest.vendors.adapters import EnsembleData, ScrapeCreators
from harvest.vendors.base import NotFound, QuotaExceeded, RateLimited, VendorError


class FakeTransport:
    def __init__(self, routes):
        self.routes = routes          # url substring → (status, body dict)
        self.calls = []

    def get(self, url, params=None, headers=None, timeout=30.0):
        self.calls.append((url, dict(params or {}), dict(headers or {})))
        for key, (status, body) in self.routes.items():
            if key in url:
                return HttpResponse(status, json.dumps(body))
        return HttpResponse(404, "{}")


ED_USER = {
    "data": {
        "user": {
            "uid": "42", "unique_id": "beauty.mai", "nickname": "Mai",
            "follower_count": 48000, "following_count": 120, "aweme_count": 200,
            "signature": "รีวิว 💌 mai@work.co", "region": "TH",
            "verification_type": 0, "bio_url": "https://linktr.ee/mai",
        }
    }
}


def test_ensembledata_user_info_normalize():
    tr = FakeTransport({"/tt/user/info": (200, ED_USER)})
    v = EnsembleData(api_key="tok", transport=tr)
    p = v.user_info("beauty.mai")
    assert p.platform_uid == "42"
    assert p.handle == "beauty.mai"
    assert p.followers == 48000
    assert p.account_region == "TH"
    assert p.links == ["https://linktr.ee/mai"]
    # 토큰이 쿼리로 전달됐는지
    assert tr.calls[0][1]["token"] == "tok"


def test_missing_key_raises_vendor_error():
    v = EnsembleData(api_key="", transport=FakeTransport({}))
    with pytest.raises(VendorError):
        v.user_info("x")


@pytest.mark.parametrize("status,exc", [
    (429, RateLimited), (402, QuotaExceeded), (404, NotFound), (500, VendorError),
])
def test_status_mapping(status, exc):
    tr = FakeTransport({"/tt/user/info": (status, {})})
    v = EnsembleData(api_key="tok", transport=tr)
    with pytest.raises(exc):
        v.user_info("x")


def test_scrapecreators_hashtag_pagination():
    page1 = {"posts": [{"author": {"uniqueId": "a"}, "id": "v1"},
                       {"author": {"uniqueId": "b"}, "id": "v2"}],
             "cursor": "c2"}
    calls = {"n": 0}

    class PagedTransport(FakeTransport):
        def get(self, url, params=None, headers=None, timeout=30.0):
            calls["n"] += 1
            if calls["n"] == 1:
                return HttpResponse(200, json.dumps(page1))
            return HttpResponse(200, json.dumps(
                {"posts": [{"author": {"uniqueId": "c"}, "id": "v3"}], "cursor": None}))

    v = ScrapeCreators(api_key="k", transport=PagedTransport({}))
    posts = list(v.hashtag_posts("ครีมกันแดด", pages=5))
    assert [p["author_handle"] for p in posts] == ["a", "b", "c"]
    assert calls["n"] == 2                 # 커서 소진 시 조기 종료


def test_ensembledata_post_comments_dedupe():
    body = {"data": {"comments": [
        {"user": {"unique_id": "u1"}}, {"user": {"unique_id": "u2"}},
        {"user": {"unique_id": "u1"}},
    ]}}
    tr = FakeTransport({"/tt/post/comments": (200, body)})
    v = EnsembleData(api_key="tok", transport=tr)
    assert list(v.post_comments("vid1")) == ["u1", "u2"]
