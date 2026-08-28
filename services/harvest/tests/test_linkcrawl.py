from harvest.enrich.linkcrawl import crawl_link
from harvest.http import HttpResponse


class FakeTransport:
    def __init__(self, pages, fail_times=0):
        self.pages = pages            # url substring → html
        self.fail_times = fail_times
        self.calls = 0

    def get(self, url, params=None, headers=None, timeout=30.0):
        self.calls += 1
        if self.fail_times > 0:
            self.fail_times -= 1
            raise TimeoutError("timeout")
        for key, html in self.pages.items():
            if key in url:
                return HttpResponse(200, html)
        return HttpResponse(404, "")


def test_mailto_extraction():
    tr = FakeTransport({"linktr.ee/mai": '<a href="mailto:Mai@Work.co">email</a>'})
    assert crawl_link("https://linktr.ee/mai", tr) == ["mai@work.co"]


def test_plain_email_in_page():
    tr = FakeTransport({"beacons.ai/x": "<p>booking: biz@agency.com</p>"})
    assert crawl_link("https://beacons.ai/x", tr) == ["biz@agency.com"]


def test_follows_contact_page():
    tr = FakeTransport({
        "example.com/contact": "<p>hello@example.com</p>",
        "example.com": '<a href="/contact">Contact</a>',
    })
    assert crawl_link("https://example.com", tr) == ["hello@example.com"]


def test_retries_then_succeeds():
    tr = FakeTransport({"lnk.bio/y": "mail: a@b.co"}, fail_times=2)
    assert crawl_link("https://lnk.bio/y", tr) == ["a@b.co"]
    assert tr.calls == 3


def test_gives_up_after_retries():
    tr = FakeTransport({}, fail_times=99)
    assert crawl_link("https://dead.example", tr) == []
    assert tr.calls == 3                      # 1 + 재시도 2
