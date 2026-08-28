from harvest.enrich.country import CountrySignals, decide_country, phone_to_country


def test_strong_agreement():
    d = decide_country(CountrySignals(
        account_region="TH", phone_country="TH",
        bio_lang="th", caption_langs=["th", "th", "en"],
    ))
    assert d.country == "TH"
    assert d.confidence == 1.0
    assert not d.needs_recheck


def test_conflicting_signals_low_conf_recheck():
    # region 0.40 (VN) vs phone 0.25 + bio 0.15 (TH=0.40) → 동률 · conf 0.5 미만
    d = decide_country(CountrySignals(
        account_region="VN", phone_country="TH", bio_lang="th",
    ))
    assert d.needs_recheck  # conf < 0.6


def test_region_only():
    d = decide_country(CountrySignals(account_region="US"))
    assert d.country == "US"
    assert d.confidence == 1.0


def test_no_signals():
    d = decide_country(CountrySignals())
    assert d.country is None
    assert d.needs_recheck


def test_english_is_weak_signal():
    # 영어는 국가 매핑에 없음 — bio가 영어라도 표를 못 던진다
    d = decide_country(CountrySignals(account_region="TH", bio_lang="en"))
    assert d.country == "TH"
    assert d.confidence == 1.0


def test_phone_to_country():
    assert phone_to_country("+66 812345678") == "TH"
    assert phone_to_country("+84-912-345-678") == "VN"
    assert phone_to_country("+1 555 0100") == "US"
    assert phone_to_country("+999") is None
