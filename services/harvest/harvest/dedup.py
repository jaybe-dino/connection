"""Dedup — 블로킹 키 + 매칭 점수 (구현상세 명세 §6).

블로킹 키로 후보군을 좁히고(전수 비교 회피), 규칙 점수 합산으로 판정:
  합산 ≥ 1.0        → 동일인 병합 (identity_group 공유)
  0.6 ≤ 합산 < 1.0  → 사람 검토 큐 (자동 병합 안 함)
병합 이력은 원장 기록 — 되돌림 가능.
"""

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from enum import StrEnum
from urllib.parse import urlparse

from .config import DedupThresholds


# ── 블로킹 키 정규화 (§6.1) ──────────────────────────────────────────────

def norm_email(email: str) -> str:
    """소문자 · gmail 점 제거 · +태그 제거."""
    e = email.strip().lower()
    if "@" not in e:
        return e
    local, domain = e.rsplit("@", 1)
    local = local.split("+", 1)[0]
    if domain in ("gmail.com", "googlemail.com"):
        local = local.replace(".", "")
    return f"{local}@{domain}"


def norm_link_host(url: str) -> str:
    """link-in-bio 최종 목적지 도메인 (리다이렉트 해소는 크롤러 몫)."""
    u = url if "//" in url else f"https://{url}"
    host = urlparse(u).netloc.lower()
    return host.removeprefix("www.")


def norm_handle(handle: str) -> str:
    """소문자 · 구분자 제거."""
    return re.sub(r"[._\-\s@]", "", handle.lower())


def phone_e164(number: str) -> str:
    """숫자만 남긴 근사 정규화 — 프로덕션은 libphonenumber."""
    digits = re.sub(r"\D", "", number)
    return f"+{digits}" if digits else ""


def handle_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, norm_handle(a), norm_handle(b)).ratio()


# ── 매칭 규칙 점수 (§6.2) ────────────────────────────────────────────────

@dataclass
class DedupCandidate:
    """비교에 필요한 필드만 추린 레코드 뷰."""

    creator_id: str
    handle: str | None = None
    display_name: str | None = None
    country: str | None = None
    verified_email: str | None = None   # email_status=valid 인 것만
    link_hosts: list[str] = field(default_factory=list)
    phone: str | None = None
    mutual_follow: bool = False         # 상호 팔로우 (그래프에서)


class DedupVerdict(StrEnum):
    MERGE = "merge"            # 자동 병합
    HUMAN_REVIEW = "review"    # 사람 검토 큐
    DISTINCT = "distinct"


@dataclass(frozen=True)
class MatchResult:
    verdict: DedupVerdict
    score: float
    rule_hits: tuple[str, ...]


def blocking_keys(c: DedupCandidate) -> set[str]:
    """같은 키를 공유하는 후보끼리만 비교한다."""
    keys: set[str] = set()
    if c.verified_email:
        keys.add(f"email:{norm_email(c.verified_email)}")
    for h in c.link_hosts:
        keys.add(f"link:{norm_link_host(h)}")
    if c.handle:
        keys.add(f"handle:{norm_handle(c.handle)}")
    if c.phone:
        keys.add(f"phone:{phone_e164(c.phone)}")
    return keys


def match(a: DedupCandidate, b: DedupCandidate,
          thresholds: DedupThresholds | None = None) -> MatchResult:
    t = thresholds or DedupThresholds()
    score = 0.0
    hits: list[str] = []

    if a.verified_email and b.verified_email and \
            norm_email(a.verified_email) == norm_email(b.verified_email):
        score += 1.0
        hits.append("same_verified_email")  # +1.0 즉시 병합

    a_hosts = {norm_link_host(h) for h in a.link_hosts}
    b_hosts = {norm_link_host(h) for h in b.link_hosts}
    if a_hosts & b_hosts:
        score += 0.7
        hits.append("same_link_in_bio_dest")

    if a.phone and b.phone and phone_e164(a.phone) == phone_e164(b.phone):
        score += 0.6
        hits.append("same_phone_e164")

    if a.handle and b.handle and a.country and a.country == b.country \
            and handle_similarity(a.handle, b.handle) > 0.9:
        score += 0.4
        hits.append("similar_handle_same_country")

    if a.display_name and a.display_name == b.display_name \
            and a.mutual_follow and b.mutual_follow:
        score += 0.3
        hits.append("same_display_name_mutual_follow")

    if score >= t.auto_merge:
        verdict = DedupVerdict.MERGE
    elif score >= t.human_review:
        verdict = DedupVerdict.HUMAN_REVIEW
    else:
        verdict = DedupVerdict.DISTINCT
    return MatchResult(verdict, round(score, 4), tuple(hits))
