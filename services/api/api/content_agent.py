"""콘텐츠 브리프 에이전트 — CONTENT_AGENT_PLAN.md §2·§4.

캠페인 + 브랜드 프로필('고객의 언어'·톤·금지어) + 크리에이터(언어·등급)를 받아
개인화 브리프를 크리에이터 모국어로 생성한다. 대본이 아니라 브리프 —
USP를 소비자 말투로 변환해 제안하고, 법 준수는 Don't 목록으로 생성 시점에 예방.

ANTHROPIC_API_KEY 있으면 Claude(claude-opus-5) 생성, 없으면 결정적 폴백.
"""

import json
import logging
import os
from dataclasses import asdict, dataclass, field

from . import ai
from .compliance import check_content, dont_list

log = logging.getLogger(__name__)

LOCALE_BY_COUNTRY = {"KR": "ko", "US": "en", "TH": "th", "VN": "vi"}


@dataclass
class BriefInput:
    campaign_name: str
    product: str
    usp: str                          # 브랜드가 고른 핵심 USP
    customer_language: list[str]      # 브랜드 프로필 '고객의 언어' (리뷰 표현)
    conditions: list[str]             # 필수 조건 (길이·노출·표기)
    tone: str                         # 브랜드 톤
    banned_words: list[str]
    functional_claims: list[str]      # 허용된 기능성 (KR)
    creator_handle: str
    creator_locale: str               # 브리프 언어 (크리에이터 모국어)
    creator_country: str              # 규정 적용 국가
    creator_grade: str = "micro"


@dataclass
class Brief:
    creator_handle: str
    locale: str
    hooks: list[str]                  # 훅 제안 3
    talking_points: list[str]         # USP 말하기 포인트 (고객의 언어로)
    experience_frame: str             # 본인 경험 프레임 제안
    dos: list[str]
    donts: list[str]
    required_disclosure: str          # 필수 표기
    conditions: list[str]
    ai_generated: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


def _fallback_brief(inp: BriefInput) -> Brief:
    """키 없이도 캠페인·프로필 조합으로 유효한 브리프를 만든다 (한국어 기준 —
    실생성 시엔 크리에이터 모국어)."""
    cl = inp.customer_language or [inp.usp]
    donts = dont_list(inp.creator_country, inp.banned_words, inp.functional_claims)
    from .compliance import DISCLOSURE_TAGS

    tag = DISCLOSURE_TAGS.get(inp.creator_country, DISCLOSURE_TAGS["US"])[0]
    return Brief(
        creator_handle=inp.creator_handle,
        locale=inp.creator_locale,
        hooks=[
            f"'{cl[0]}' — 이 말이 진짜인지 직접 확인해보는 오프닝",
            f"평소 루틴에 {inp.product}를 끼워 넣는 하루 브이로그형",
            "쓰기 전/후 같은 조건에서 비교하는 정직 리뷰형",
        ],
        talking_points=[
            f"핵심은 '{inp.usp}' — 광고 문구가 아니라 본인 표현으로",
            *[f"실제 소비자들이 쓰는 말: '{w}'" for w in cl[:3]],
            "단점도 하나 말하기 — 신뢰가 완주율을 만든다",
        ],
        experience_frame=(
            "처음 며칠 써본 솔직한 느낌 → 언제/어떻게 쓰는지 → "
            "누구에게 맞을 것 같은지. 대본처럼 읽지 말고 평소 말투로."
        ),
        dos=[
            f"브랜드 톤 참고: {inp.tone}" if inp.tone else "평소 본인 톤 유지",
            "제품이 손에 잡히는 클로즈업 1컷 이상",
            "본인 언어로 — 번역투 문장 금지",
        ],
        donts=donts,
        required_disclosure=f"{tag} — 본문 앞부분에",
        conditions=inp.conditions,
        ai_generated=False,
    )


def generate_brief(inp: BriefInput) -> Brief:
    """브리프 생성 — Claude 사용 가능하면 크리에이터 모국어로 개인화 생성."""
    if not ai.ai_available():
        return _fallback_brief(inp)

    from anthropic import Anthropic

    client = Anthropic()
    donts = dont_list(inp.creator_country, inp.banned_words, inp.functional_claims)
    resp = client.messages.create(
        model=ai.MODEL,
        max_tokens=2048,
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        system=(
            "당신은 K-뷰티 브랜드의 크리에이터 콘텐츠 브리프 작성자입니다. "
            "대본이 아니라 브리프를 씁니다 — 말할 문장이 아니라 말할 거리. "
            "USP는 소비자 말투(고객의 언어)로 변환하고, 법적 금지 표현은 절대 "
            "제안에 넣지 않습니다. 출력은 JSON 하나: "
            '{"hooks":[3개],"talking_points":[3~5개],"experience_frame":"...",'
            '"dos":[3개]} — 반드시 크리에이터의 언어로 작성.'
        ),
        messages=[{
            "role": "user",
            "content": json.dumps({
                "campaign": inp.campaign_name, "product": inp.product,
                "usp": inp.usp, "customer_language": inp.customer_language,
                "tone": inp.tone, "creator": inp.creator_handle,
                "creator_language": inp.creator_locale,
                "creator_grade": inp.creator_grade,
                "legal_donts": donts,
            }, ensure_ascii=False),
        }],
    )
    if resp.stop_reason == "refusal":
        return _fallback_brief(inp)
    raw = "".join(b.text for b in resp.content if b.type == "text").strip()
    try:
        if raw.startswith("```"):
            raw = raw.strip("`").removeprefix("json").strip()
        data = json.loads(raw)
        from .compliance import DISCLOSURE_TAGS

        tag = DISCLOSURE_TAGS.get(inp.creator_country, DISCLOSURE_TAGS["US"])[0]
        brief = Brief(
            creator_handle=inp.creator_handle, locale=inp.creator_locale,
            hooks=list(data.get("hooks", []))[:3],
            talking_points=list(data.get("talking_points", []))[:5],
            experience_frame=str(data.get("experience_frame", "")),
            dos=list(data.get("dos", []))[:4],
            donts=donts,
            required_disclosure=f"{tag}",
            conditions=inp.conditions, ai_generated=True,
        )
        # 생성물 자체도 컴플라이언스 재검사 — 위반 시 폴백 (이중 그물)
        joined = " ".join([*brief.hooks, *brief.talking_points, brief.experience_frame])
        bad = [v for v in check_content(
            joined, inp.creator_country, inp.banned_words,
            inp.functional_claims, require_disclosure=False,
        ) if v.severity == "block"]
        if bad:
            log.warning("brief compliance fail %s — fallback", [v.term for v in bad])
            return _fallback_brief(inp)
        return brief
    except (json.JSONDecodeError, TypeError, KeyError):
        log.warning("brief parse fail: %r", raw[:200])
        return _fallback_brief(inp)
