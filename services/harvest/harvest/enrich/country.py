"""국가 판정 — 다신호 가중 합의 (구현상세 명세 §5.3).

signals = [account_region, phone_country, bio_lang, caption_lang, active_hour_tz]
country = argmax(weighted_vote), conf = top/Σ, conf < 0.6 → q.recheck
"""

from dataclasses import dataclass, field

from ..config import CountryVoteWeights

# 언어 → 국가 후보 (bio/caption 언어 신호용, 필요 국가만)
_LANG_TO_COUNTRY = {
    "th": "TH",
    "vi": "VN",
    "ko": "KR",
    "ja": "JP",
    "id": "ID",
    # 영어는 약함 — 미국 외 다수 국가에서 쓰여 신호로 치지 않는다
}

# 국번 → 국가
_PHONE_CC = {"66": "TH", "84": "VN", "82": "KR", "81": "JP", "62": "ID", "1": "US"}


@dataclass
class CountrySignals:
    account_region: str | None = None      # 플랫폼 공개 region (가장 신뢰)
    phone_country: str | None = None       # bio 국번 → ISO2
    bio_lang: str | None = None            # 언어 코드
    caption_langs: list[str] = field(default_factory=list)  # 최근 N개 다수결
    active_hour_country: str | None = None # 활동 시간대 추정


@dataclass(frozen=True)
class CountryDecision:
    country: str | None
    confidence: float
    needs_recheck: bool
    votes: dict[str, float]


def phone_to_country(number: str) -> str | None:
    """+국번 → ISO2. 프로덕션은 libphonenumber로 교체."""
    digits = number.lstrip("+").replace(" ", "").replace("-", "")
    for cc_len in (2, 1):
        cc = digits[:cc_len]
        if cc in _PHONE_CC:
            return _PHONE_CC[cc]
    return None


def _majority_lang(langs: list[str]) -> str | None:
    if not langs:
        return None
    counts: dict[str, int] = {}
    for l in langs:
        counts[l] = counts.get(l, 0) + 1
    return max(counts, key=counts.get)  # type: ignore[arg-type]


def decide_country(
    signals: CountrySignals,
    weights: CountryVoteWeights | None = None,
) -> CountryDecision:
    w = weights or CountryVoteWeights()
    votes: dict[str, float] = {}

    def vote(country: str | None, weight: float) -> None:
        if country:
            votes[country] = votes.get(country, 0.0) + weight

    vote(signals.account_region, w.account_region)
    vote(signals.phone_country, w.phone_country)
    vote(_LANG_TO_COUNTRY.get(signals.bio_lang or ""), w.bio_lang)
    vote(_LANG_TO_COUNTRY.get(_majority_lang(signals.caption_langs) or ""), w.caption_lang)
    vote(signals.active_hour_country, w.active_hour_tz)

    if not votes:
        return CountryDecision(None, 0.0, True, votes)

    total = sum(votes.values())
    country = max(votes, key=votes.get)  # type: ignore[arg-type]
    conf = votes[country] / total
    return CountryDecision(country, conf, conf < w.min_conf, votes)
