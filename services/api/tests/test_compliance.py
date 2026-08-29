from api.compliance import Severity, check_content, dont_list
from api.content_agent import BriefInput, _fallback_brief


def _kinds(violations):
    return {v.kind for v in violations}


# ── 광고 표기 ────────────────────────────────────────────────────

def test_missing_disclosure_blocks():
    v = check_content("이 선크림 정말 좋아요", country="KR")
    assert "missing_disclosure" in _kinds(v)
    assert v[0].severity == Severity.BLOCK
    assert "#광고" in v[0].fix


def test_disclosure_present_passes():
    assert check_content("#광고 이 선크림 정말 좋아요", country="KR") == []
    assert check_content("#ad love this sunscreen", country="US") == []
    assert check_content("#โฆษณา ครีมกันแดดดีมาก", country="TH") == []


def test_disclosure_optional_for_gifted():
    # 무가(게시 의무 없음) 공고 텍스트 등은 표기 요구 없이 검사 가능
    assert check_content("그냥 소개 글", country="KR", require_disclosure=False) == []


# ── 의약품적 표현 ────────────────────────────────────────────────

def test_medical_claims_blocked_all_languages():
    for text in ["#광고 여드름 치료에 최고", "#ad this cream cures acne",
                 "#โฆษณา ครีมนี้รักษาสิว", "#ad kem này trị mụn tốt"]:
        v = check_content(text, country="US")
        assert "medical_claim" in _kinds(v), text


def test_treatment_word_boundary():
    # 'treat'는 걸리되 무관한 단어 속 부분매칭은 안 됨
    assert "medical_claim" in _kinds(check_content("#ad it can treat skin", "US"))
    assert check_content("#ad a real retreat for skin? no — just nice", "US",
                         require_disclosure=False) == []


# ── 절대 표현 · 기능성 · 금지어 ──────────────────────────────────

def test_absolute_claim_warns_not_blocks():
    v = check_content("#광고 부작용 없음! 100% 만족", country="KR")
    assert all(x.severity == Severity.WARN for x in v)
    assert len(v) == 2


def test_kr_functional_claims_gated():
    v = check_content("#광고 미백에 좋아요", country="KR")
    assert "functional_claim" in _kinds(v)
    # 식약처 인정(whitening 허용) 제품이면 통과
    assert check_content("#광고 미백에 좋아요", country="KR",
                         functional_claims=["whitening"]) == []
    # 미국 크리에이터에게는 KR 기능성 규정 미적용
    assert check_content("#ad brightening cream 미백", country="US") == []


def test_brand_banned_words():
    v = check_content("#광고 순한 클렌저", country="KR", banned_words=["순한"])
    assert "banned_word" in _kinds(v)


# ── Don't 목록 · 폴백 브리프 ─────────────────────────────────────

def test_dont_list_reflects_country_and_brand():
    d = dont_list("KR", banned_words=["미백"], functional_claims=["uv"])
    joined = " ".join(d)
    assert "#광고" in joined
    assert "미백" in joined            # 금지어 + 기능성 미허용 안내
    assert "자외선" not in joined.replace("자외선 차단", "")  # uv 허용은 금지 목록서 빠짐


def test_fallback_brief_structure_and_compliance():
    brief = _fallback_brief(BriefInput(
        campaign_name="톤업 선세럼 리뷰", product="톤업 선세럼", usp="백탁 없이 한 톤 환하게",
        customer_language=["백탁 없이", "속당김 없는"], conditions=["30초+", "#ad"],
        tone="차분한 존댓말", banned_words=["미백"], functional_claims=[],
        creator_handle="beauty.mai", creator_locale="th", creator_country="TH",
    ))
    assert len(brief.hooks) == 3
    assert any("백탁 없이" in p for p in brief.talking_points)  # 고객의 언어 사용
    assert brief.required_disclosure.startswith("#")
    assert any("미백" in d for d in brief.donts)                # 금지어 예방 고지
    assert brief.ai_generated is False
    # 브리프 자체가 룰 엔진을 통과해야 한다 (이중 그물의 1겹)
    joined = " ".join([*brief.hooks, *brief.talking_points, brief.experience_frame])
    blocks = [v for v in check_content(joined, "TH", ["미백"],
                                       require_disclosure=False)
              if v.severity == Severity.BLOCK]
    assert blocks == []
