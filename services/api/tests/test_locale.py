"""언어 자동 매핑 — IP 국가 헤더 우선, Accept-Language 폴백, en 기본."""


def test_ip_country_header_wins(client):
    r = client.get("/locale/detect", headers={
        "x-vercel-ip-country": "TH",
        "accept-language": "en-US,en;q=0.9",
    }).json()
    assert r == {"locale": "th", "country": "TH", "source": "ip"}


def test_cloudflare_header(client):
    r = client.get("/locale/detect", headers={"cf-ipcountry": "VN"}).json()
    assert r["locale"] == "vi" and r["source"] == "ip"


def test_accept_language_fallback(client):
    r = client.get("/locale/detect", headers={
        "accept-language": "vi-VN,vi;q=0.9,en;q=0.5",
    }).json()
    assert r["locale"] == "vi" and r["source"] == "accept-language"


def test_unsupported_country_falls_to_accept_language(client):
    r = client.get("/locale/detect", headers={
        "cf-ipcountry": "FR", "accept-language": "ko-KR,ko;q=0.9",
    }).json()
    assert r["locale"] == "ko"


def test_default_en(client):
    r = client.get("/locale/detect", headers={"accept-language": "fr-FR,de;q=0.8"}).json()
    assert r["locale"] == "en" and r["source"] == "default"
