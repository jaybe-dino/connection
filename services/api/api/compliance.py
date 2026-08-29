"""콘텐츠 컴플라이언스 룰 엔진 — CONTENT_AGENT_PLAN.md §3.

국가별 광고 표기 + 화장품 금지 표현(의약품 오인·절대 표현·기능성 제한) +
브랜드 금지어. 결정적 룰 1차 → 모호 케이스는 LLM 검토(후속)로 승급.

규정 사전은 초기값(가드레일) — 법무 검토로 확정·갱신한다.
"""

import re
from dataclasses import dataclass
from enum import StrEnum


class Severity(StrEnum):
    BLOCK = "block"      # 보완요청 필수 (법 위반 소지)
    WARN = "warn"        # 경고 + 수정 제안


@dataclass(frozen=True)
class Violation:
    kind: str            # missing_disclosure | medical_claim | absolute_claim
    #                    # | functional_claim | banned_word
    severity: Severity
    term: str            # 걸린 표현 (missing_disclosure는 요구 표기)
    message: str         # 사람이 읽는 설명
    fix: str             # 원클릭 수정 제안


# ── 3.1 광고 표기 (경제적 대가 고지) ─────────────────────────────
DISCLOSURE_TAGS: dict[str, list[str]] = {
    "KR": ["#광고", "#유료광고", "#협찬"],
    "US": ["#ad", "#sponsored", "#paidpartnership"],
    "TH": ["#ad", "#โฆษณา", "#sponsored"],
    "VN": ["#quảngcáo", "#quangcao", "#ad"],
}

DISCLOSURE_LAW = {
    "KR": "표시광고법·공정위 추천보증 심사지침",
    "US": "FTC 16 CFR Part 255",
    "TH": "태국 소비자보호·FDA(อย.) 광고 규제",
    "VN": "베트남 광고법",
}

# ── 3.2 의약품적 효능 표현 (전 언어 · 화장품에 사용 금지) ───────────
MEDICAL_TERMS: list[str] = [
    # ko
    "치료", "치유", "완치", "재생", "항염", "살균", "소염", "여드름 치료",
    "아토피", "습진", "염증 완화", "흉터 제거",
    # en
    "cure", "cures", "treat", "treats", "treatment", "heal", "heals",
    "anti-inflammatory", "antibacterial", "eczema", "regenerate",
    # th
    "รักษา", "บำบัด", "ฆ่าเชื้อ", "ต้านการอักเสบ", "สิวหาย",
    # vi
    "chữa", "trị mụn", "điều trị", "kháng viêm", "diệt khuẩn", "tái tạo da",
]

# ── 절대적 표현 (과대광고 소지 — 경고) ───────────────────────────
ABSOLUTE_TERMS: list[str] = [
    "100%", "완벽", "부작용 없음", "부작용이 없", "최고의", "유일한",
    "perfect", "no side effects", "guaranteed", "the only", "best ever",
    "ดีที่สุด", "ไม่มีผลข้างเคียง", "tốt nhất", "không tác dụng phụ",
]

# ── KR 기능성 표현 — 식약처 인정 제품만 (functional_claims로 허용) ──
FUNCTIONAL_TERMS_KR: dict[str, list[str]] = {
    "whitening": ["미백", "화이트닝", "브라이트닝"],
    "wrinkle": ["주름 개선", "주름개선", "안티에이징", "안티 에이징"],
    "uv": ["자외선 차단", "자외선차단", "SPF"],
}


def _contains(text_lower: str, term: str) -> bool:
    t = term.lower()
    if re.fullmatch(r"[a-z0-9%\- ]+", t):
        # 라틴 계열은 단어 경계로 (예: 'treat'가 'treatment'와 별개 매칭되게 둘 다 등재)
        return re.search(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])", text_lower) is not None
    return t in text_lower


def check_content(
    text: str,
    country: str = "KR",
    banned_words: list[str] | None = None,
    functional_claims: list[str] | None = None,   # 허용된 기능성 (예: ["uv"])
    require_disclosure: bool = True,
) -> list[Violation]:
    """콘텐츠(캡션·브리프·공고) 1건 검사. 위반 없으면 빈 목록."""
    violations: list[Violation] = []
    lower = text.lower()

    # 1) 광고 표기
    if require_disclosure:
        tags = DISCLOSURE_TAGS.get(country, DISCLOSURE_TAGS["US"])
        if not any(t.lower() in lower for t in tags):
            violations.append(Violation(
                kind="missing_disclosure", severity=Severity.BLOCK, term=tags[0],
                message=f"광고 표기 누락 — {DISCLOSURE_LAW.get(country, '광고 규정')} 위반 소지",
                fix=f"캡션 앞부분에 {tags[0]} 추가",
            ))

    # 2) 의약품적 효능
    for term in MEDICAL_TERMS:
        if _contains(lower, term):
            violations.append(Violation(
                kind="medical_claim", severity=Severity.BLOCK, term=term,
                message=f"의약품 오인 표현 '{term}' — 화장품 광고에 사용 불가",
                fix=f"'{term}' 표현 삭제 또는 사용감 표현으로 교체 (예: '진정되는 느낌')",
            ))

    # 3) 절대적 표현
    for term in ABSOLUTE_TERMS:
        if _contains(lower, term):
            violations.append(Violation(
                kind="absolute_claim", severity=Severity.WARN, term=term,
                message=f"절대적 표현 '{term}' — 과대광고 소지",
                fix=f"'{term}' 완화 (예: '저에게는 잘 맞았어요')",
            ))

    # 4) KR 기능성 제한
    if country == "KR":
        allowed = set(functional_claims or [])
        for claim, terms in FUNCTIONAL_TERMS_KR.items():
            if claim in allowed:
                continue
            for term in terms:
                if _contains(lower, term):
                    violations.append(Violation(
                        kind="functional_claim", severity=Severity.BLOCK, term=term,
                        message=f"기능성 표현 '{term}' — 식약처 인정 제품만 사용 가능",
                        fix=f"'{term}' 삭제 (이 제품의 허용 기능성: {sorted(allowed) or '없음'})",
                    ))

    # 5) 브랜드 금지어
    for word in banned_words or []:
        if word and _contains(lower, word):
            violations.append(Violation(
                kind="banned_word", severity=Severity.BLOCK, term=word,
                message=f"브랜드 금지어 '{word}'",
                fix=f"'{word}' 삭제 — 브랜드 프로필 금지어",
            ))

    return violations


def dont_list(country: str, banned_words: list[str] | None = None,
              functional_claims: list[str] | None = None) -> list[str]:
    """브리프의 Don't 목록 — 생성 시점에 미리 알려줘 위반을 예방한다."""
    tags = DISCLOSURE_TAGS.get(country, DISCLOSURE_TAGS["US"])
    out = [
        f"광고 표기 필수: {tags[0]} (본문 앞부분, 더보기 뒤 숨김 금지)",
        "의약품처럼 말하지 않기 — 치료·재생·항염 계열 표현 금지, 사용감·경험으로",
        "절대적 표현 피하기 — 100%·완벽·부작용 없음 대신 개인 경험으로",
    ]
    if country == "KR":
        allowed = set(functional_claims or [])
        blocked = [t[0] for c, t in FUNCTIONAL_TERMS_KR.items() if c not in allowed]
        if blocked:
            out.append(f"기능성 표현 금지: {', '.join(blocked)} (식약처 미인정)")
    if banned_words:
        out.append(f"브랜드 금지어: {', '.join(banned_words)}")
    return out
