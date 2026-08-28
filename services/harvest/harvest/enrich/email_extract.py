"""이메일 추출 — 구현상세 명세 §5.1.

1) bio 정규식 (난독화 대응: a(at)b(dot)com 류)
2) link-in-bio 크롤 대상 판별 (linktr.ee 등 — 크롤 자체는 워커에서)
3) 실패 시 이메일 DB 조인 (상위 등급만 유료) — store 쪽 정책

공개 비즈니스 연락처만 다룬다 (법률 선).
"""

import re

# 1) 일반 이메일
_RE_PLAIN = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")

# 2) 난독화: name (at) domain (dot) com / name[at]domain[dot]com ...
_RE_OBFUSCATED = re.compile(
    r"([\w.+-]+)\s*[\[(]?\s*at\s*[\])]?\s*([\w-]+)\s*[\[(]?\s*dot\s*[\])]?\s*(\w+)",
    re.IGNORECASE,
)

# link-in-bio 크롤 대상 호스트 (§5.1) — 이외 개인 도메인은 별도 판단
LINK_HOSTS = ("linktr.ee", "beacons.ai", "lnk.bio", "taplink")


def extract_emails(text: str | None) -> list[str]:
    """bio 원문에서 이메일 후보 추출 (소문자 정규화, 중복 제거, 순서 보존)."""
    if not text:
        return []
    found: list[str] = []

    for m in _RE_PLAIN.finditer(text):
        found.append(m.group(0).rstrip(".").lower())

    for m in _RE_OBFUSCATED.finditer(text):
        candidate = f"{m.group(1)}@{m.group(2)}.{m.group(3)}".lower()
        if not _RE_PLAIN.fullmatch(candidate):
            continue
        found.append(candidate)

    seen: set[str] = set()
    out: list[str] = []
    for e in found:
        if e not in seen:
            seen.add(e)
            out.append(e)
    return out


def is_link_in_bio(url: str) -> bool:
    """link-in-bio 크롤 대상인가."""
    u = url.lower()
    return any(host in u for host in LINK_HOSTS)
