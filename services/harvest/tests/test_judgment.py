from harvest.judgment import BrandFit, Verdict, judge

BRAND = BrandFit(categories=("beauty", "suncare"), banned_words=("미백",),
                 target_countries=("TH", "VN"))


def _rec(**over):
    base = {
        "creator_id": "c1", "followers": 48_000, "following": 300,
        "engagement_rate": 0.06, "category": ["beauty"], "country": "TH",
        "bio": "รีวิวสกินแคร์", "sponsor_ratio_90d": 0.1, "follower_series": [],
    }
    base.update(over)
    return base


def test_good_creator_invited():
    j = judge(_rec(), BRAND)
    assert j.verdict == Verdict.INVITE
    assert j.fit_probability > 0.7
    assert len(j.axes) == 4


def test_sponsor_overload_is_billing_excluded_not_reject():
    j = judge(_rec(sponsor_ratio_90d=0.6), BRAND)
    assert j.verdict == Verdict.BILLING_EXCLUDED   # 차단이 아니라 과금 제외


def test_fake_account_rejected():
    j = judge(_rec(
        follower_series=[{"date": "d1", "count": 1000},
                         {"date": "d2", "count": 1100},
                         {"date": "d3", "count": 40_000}],   # 계단 급증
        engagement_rate=0.001,
    ), BRAND)
    assert j.verdict == Verdict.REJECT
    real = next(a for a in j.axes if a.axis == "real_person")
    assert "계단형" in real.evidence


def test_duplicate_rejected():
    j = judge(_rec(identity_group_conflict=True), BRAND)
    assert j.verdict == Verdict.REJECT


def test_wrong_country_or_banned_word_holds():
    assert judge(_rec(country="US"), BRAND).verdict == Verdict.HOLD
    assert judge(_rec(bio="미백 전문 리뷰"), BRAND).verdict == Verdict.HOLD


def test_ledger_payload_shape():
    p = judge(_rec(), BRAND).to_ledger_payload()
    assert p["verdict"] == "invite"
    assert {a["axis"] for a in p["axes"]} == \
        {"real_person", "product_fit", "sponsor_load", "duplicate"}
