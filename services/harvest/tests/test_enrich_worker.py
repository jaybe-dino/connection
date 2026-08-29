from harvest.enrich.langdetect import detect_lang
from harvest.http import HttpResponse
from harvest.models import CreatorProfile, EmailStatus, Grade, Platform
from harvest.pipeline import EnrichWorker
from harvest.queues import EnrichMsg, InMemoryQueue, Q_RECHECK
from harvest.store import InMemoryPool


def test_langdetect_scripts():
    assert detect_lang("รีวิวสกินแคร์ ครีมกันแดด") == "th"
    assert detect_lang("kem chống nắng, đẹp lắm") == "vi"
    assert detect_lang("선크림 리뷰해요") == "ko"
    assert detect_lang("sunscreen reviews daily") == "en"
    assert detect_lang("") is None
    assert detect_lang("🌞💄") is None


class FakeTransport:
    def __init__(self, pages):
        self.pages = pages

    def get(self, url, params=None, headers=None, timeout=30.0):
        for key, html in self.pages.items():
            if key in url:
                return HttpResponse(200, html)
        return HttpResponse(404, "")


class StubVerify:
    def verify(self, email):
        return "valid"


def _seed_pool(bio, links=(), followers=48_000, region="TH"):
    pool = InMemoryPool()
    cid = pool.upsert(CreatorProfile(
        platform=Platform.TIKTOK, platform_uid="1", handle="mai",
        bio=bio, links=list(links), followers=followers, account_region=region,
        engagement_rate=0.06, avg_views=35_000, post_freq_30d=12,
    ), source="test")
    return pool, cid


def _worker(pool, transport=None, verify=None):
    return EnrichWorker(pool, InMemoryQueue(), transport=transport,
                        verify_api=verify, mx_lookup=lambda d: True)


def test_full_enrich_from_bio():
    pool, cid = _seed_pool("รีวิวสกินแคร์ 💌 mai.work@gmail.com · +66 81 234 5678")
    e = _worker(pool, verify=StubVerify()).handle(
        EnrichMsg(cid, pool.get(cid)["bio"], []))
    assert e.email == "mai.work@gmail.com"
    assert e.email_status == EmailStatus.VALID
    assert e.country == "TH"
    assert e.country_conf > 0.6
    assert e.lang == "th"
    assert e.messenger == {"line": "+66 81 234 5678"}   # TH → LINE
    assert e.grade == Grade.MID
    assert e.influence > 50
    rec = pool.get(cid)
    assert rec["email"] == "mai.work@gmail.com"
    assert rec["grade"] == "mid"
    assert rec["line"] == "+66 81 234 5678"


def test_link_crawl_fallback_when_bio_has_no_email():
    pool, cid = _seed_pool("collab 👇", links=["https://linktr.ee/mai"])
    tr = FakeTransport({"linktr.ee/mai": '<a href="mailto:biz@mai.co">mail</a>'})
    e = _worker(pool, transport=tr, verify=StubVerify()).handle(
        EnrichMsg(cid, "collab 👇", ["https://linktr.ee/mai"]))
    assert e.email == "biz@mai.co"
    assert e.email_status == EmailStatus.VALID


def test_no_verify_api_is_risky():
    pool, cid = _seed_pool("mail: a@b.co")
    e = _worker(pool).handle(EnrichMsg(cid, "mail: a@b.co", []))
    assert e.email == "a@b.co"
    assert e.email_status == EmailStatus.RISKY   # 외부 검증 전 발송 제외 기본


def test_low_confidence_goes_to_recheck():
    pool, cid = _seed_pool("just vibes", region=None)
    queues = InMemoryQueue()
    w = EnrichWorker(pool, queues, mx_lookup=lambda d: True)
    e = w.handle(EnrichMsg(cid, "just vibes", []))
    assert e.country is None or e.country_conf < 0.6
    assert queues.depth(Q_RECHECK) == 1


def test_vietnam_gets_zalo():
    pool, cid = _seed_pool("kem chống nắng đẹp · +84 912 345 678", region="VN")
    e = _worker(pool).handle(EnrichMsg(cid, pool.get(cid)["bio"], []))
    assert e.country == "VN"
    assert "zalo" in e.messenger
