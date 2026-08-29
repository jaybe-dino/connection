"""회신 자동 분류 — 관심 / 거절 / 부재 / 수신거부 / 기타 (§4.3 메일 담당).

1차는 다국어 키워드 규칙(즉시·무료), 모호하면 주입된 LLM 분류기로 승급.
분류 결과는 母 DB 라벨 → 시퀀스 중단·억제 반영.
"""

import re
from enum import StrEnum
from typing import Callable


class ReplyKind(StrEnum):
    INTERESTED = "interested"
    DECLINED = "declined"
    OUT_OF_OFFICE = "out_of_office"
    UNSUBSCRIBE = "unsubscribe"
    OTHER = "other"


_PATTERNS: list[tuple[ReplyKind, re.Pattern]] = [
    (ReplyKind.UNSUBSCRIBE, re.compile(
        r"unsubscribe|remove me|stop email|opt.?out|수신\s?거부|그만\s?보내|"
        r"ยกเลิก(การ)?รับ|hủy\s?đăng\s?ký", re.IGNORECASE)),
    (ReplyKind.OUT_OF_OFFICE, re.compile(
        r"out of office|auto.?reply|automatic reply|on leave|vacation|부재중|휴가|"
        r"ไม่อยู่|nghỉ phép", re.IGNORECASE)),
    (ReplyKind.DECLINED, re.compile(
        r"not interested|no thank|decline|pass on this|관심\s?없|사양|"
        r"ไม่สนใจ|không quan tâm", re.IGNORECASE)),
    (ReplyKind.INTERESTED, re.compile(
        r"interested|tell me more|more (detail|info)|rate|price|fee|how much|"
        r"관심\s?있|자세히|단가|얼마|สนใจ|รายละเอียด|เท่า ?ไหร่|quan tâm|chi tiết|giá",
        re.IGNORECASE)),
]

# 모호할 때 승급하는 LLM 분류기 계약: (본문) -> ReplyKind 값 문자열
LlmClassifier = Callable[[str], str]


def classify_reply(body: str, llm: LlmClassifier | None = None) -> ReplyKind:
    text = (body or "").strip()
    if not text:
        return ReplyKind.OTHER
    for kind, pat in _PATTERNS:
        if pat.search(text):
            return kind
    if llm is not None:
        try:
            return ReplyKind(llm(text))
        except Exception:  # noqa: BLE001 — LLM 분류 실패·이상값은 OTHER로
            pass
    return ReplyKind.OTHER
