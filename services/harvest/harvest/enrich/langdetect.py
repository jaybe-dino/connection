"""경량 언어 감지 — 스크립트 범위 휴리스틱 (th·ko·vi·en·ja).

프로덕션 대량 처리 시 fastText/CLD3 교체 가능하도록 함수 계약만 유지.
타깃 국가(TH·VN·KR·US)의 판별에 충분한 정확도가 목표.
"""

import re
import unicodedata

_THAI = re.compile(r"[฀-๿]")
_HANGUL = re.compile(r"[가-힯ᄀ-ᇿ]")
_KANA = re.compile(r"[぀-ヿ]")
# 베트남어 고유 문자 (라틴 + 특수 성조 조합에서만 나타나는 글자)
_VIET_CHARS = set("ăâđêôơưĂÂĐÊÔƠƯ")
_VIET_TONED = re.compile(
    r"[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]", re.IGNORECASE)


def detect_lang(text: str | None) -> str | None:
    """지배적 스크립트 기준 언어 코드. 판별 불가 시 None (영어는 'en')."""
    if not text or not text.strip():
        return None

    thai = len(_THAI.findall(text))
    hangul = len(_HANGUL.findall(text))
    kana = len(_KANA.findall(text))
    viet = sum(1 for ch in text if ch in _VIET_CHARS) + len(_VIET_TONED.findall(text))
    latin = sum(1 for ch in text if "LATIN" in unicodedata.name(ch, ""))

    scores = {"th": thai, "ko": hangul, "ja": kana, "vi": viet}
    best = max(scores, key=scores.get)  # type: ignore[arg-type]
    if scores[best] > 0:
        return best
    if latin >= 3:
        return "en"
    return None
