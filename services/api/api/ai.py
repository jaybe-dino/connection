"""번역 · 아리 응답 — Claude API (Anthropic SDK).

ANTHROPIC_API_KEY가 없으면 결정적 폴백으로 동작해 전체 시스템이 멈추지 않는다.
모델: claude-opus-5 · 적응형 사고 · 작업별 effort (번역 low / 아리 대화 high).
캠페인 일괄 번역같은 비실시간 대량 작업은 추후 Batches API(50% 할인)로 이관.
"""

import json
import logging
import os
from functools import lru_cache

log = logging.getLogger(__name__)

MODEL = "claude-opus-5"

LOCALE_NAME = {"ko": "Korean", "th": "Thai", "en": "English", "vi": "Vietnamese"}


@lru_cache(maxsize=1)
def _client():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    from anthropic import Anthropic

    return Anthropic()


def ai_available() -> bool:
    return _client() is not None


def translate(text: str, source_locale: str, target_locales: list[str]) -> dict[str, str]:
    """원문 → 대상 언어별 번역 {locale: text}. 키 없으면 태그 폴백."""
    targets = [t for t in target_locales if t != source_locale]
    if not targets:
        return {}

    client = _client()
    if client is None:
        # 폴백 — 번역 미연동 상태를 명시적으로 표시 (원문 칩으로 원문 확인 가능)
        return {t: f"[{t}·번역대기] {text}" for t in targets}

    names = ", ".join(f"{t} ({LOCALE_NAME.get(t, t)})" for t in targets)
    resp = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        thinking={"type": "adaptive"},
        output_config={"effort": "low"},
        system=(
            "You translate messages in a K-beauty creator community. "
            "Keep tone natural and casual, preserve emoji and #hashtags, "
            "never add commentary. Respond ONLY with a JSON object mapping "
            "locale codes to translations."
        ),
        messages=[{
            "role": "user",
            "content": f"Source locale: {source_locale}\nTargets: {names}\nText: {text}",
        }],
    )
    if resp.stop_reason == "refusal":
        log.warning("translate refused: %s", getattr(resp, "stop_details", None))
        return {t: f"[{t}·번역대기] {text}" for t in targets}
    raw = "".join(b.text for b in resp.content if b.type == "text").strip()
    try:
        if raw.startswith("```"):
            raw = raw.strip("`").removeprefix("json").strip()
        data = json.loads(raw)
        return {t: str(data[t]) for t in targets if t in data}
    except (json.JSONDecodeError, KeyError, TypeError):
        log.warning("translate parse fail: %r", raw[:200])
        return {t: f"[{t}·번역대기] {text}" for t in targets}


ARI_SYSTEM = (
    "당신은 '아리' — K-뷰티 브랜드 {brand_name}의 전담 크리에이터 커뮤니티 운영 "
    "에이전트입니다. 브랜드 담당자와 콘솔에서 대화합니다.\n"
    "원칙: 밖으로 나가는 모든 행동(발송·게시·정산·개인정보)은 게이트에서 사람이 "
    "승인해야 실행됩니다 — 당신은 초안과 판단까지만 합니다. 결정을 대신하지 말고 "
    "근거와 함께 제안하세요. 한국어로, 간결하게(3문장 이내), 수치 근거를 우선하세요.\n"
    "현재 상태: {context}"
)


def ari_reply(brand_name: str, context: str, history: list[dict], user_msg: str) -> str:
    """콘솔 아리 채팅 응답. history: [{role, content}] (user/assistant)."""
    client = _client()
    if client is None:
        return (
            "지금은 AI 미연동 상태예요 (ANTHROPIC_API_KEY 필요). "
            f"질문은 기록해뒀어요: “{user_msg[:60]}”"
        )

    resp = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        system=ARI_SYSTEM.format(brand_name=brand_name, context=context),
        messages=[*history, {"role": "user", "content": user_msg}],
    )
    if resp.stop_reason == "refusal":
        return "이 요청에는 답하기 어려워요. 다른 방식으로 물어봐 주세요."
    return "".join(b.text for b in resp.content if b.type == "text").strip()
