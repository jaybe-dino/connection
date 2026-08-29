"""커뮤니티 씨딩 담당 — 외부 그룹·포럼에 정보성 글로 접점을 만드는 에이전트.

운영 원칙 (기획안 §4.2 · 구현상세 L3):
  · 글은 항상 **고지 첫 줄** — 브랜드 연관을 숨기지 않는다
  · 초대 링크·단축 URL 금지 (스팸으로 읽히는 즉시 커뮤니티를 잃는다)
  · 커뮤니티당 **주 1회** 상한 — 빈도가 신뢰를 깎는다
  · 경고(strike) 1회 → 해당 커뮤니티 **30일 중단** + 규범에 금지 항목 기록
  · 게시는 언제나 게이트(OUTBOUND) 승인 후 — 에이전트는 초안과 요청만 만든다
  · 태국어 우선, 커뮤니티 언어를 따른다

규범(norms)은 core.norms.NormMemory 를 그대로 꽂을 수 있는 느슨한 규약:
`current(community)` 가 rules/worked/banned 속성을 가진 객체(또는 None)를 주면 된다.
"""

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Callable, Protocol

WEEKLY_CAP = 1                  # 커뮤니티당 주 1회
STRIKE_BAN_DAYS = 30

DISCLOSURE_LINES = {
    "th": "#โฆษณา โพสต์นี้เกี่ยวข้องกับแบรนด์",
    "ko": "#광고 이 글은 브랜드와 관련이 있습니다",
    "vi": "#quảngcáo Bài viết này có liên quan đến thương hiệu",
    "en": "#ad This post is brand-affiliated",
}

_LINK_RE = re.compile(
    r"https?://|discord\.gg|t\.me/|line\.me|bit\.ly|linktr\.ee", re.IGNORECASE)


class NormSource(Protocol):
    def current(self, community: str): ...    # → .rules/.worked/.banned | None


@dataclass
class PostDraft:
    community: str
    language: str
    body: str                     # 고지 첫 줄 포함 전문
    violations: list[str] = field(default_factory=list)

    @property
    def ready(self) -> bool:
        return not self.violations


@dataclass(frozen=True)
class PostRequest:
    """게이트에 올릴 요청 — 승인 전에는 아무 것도 나가지 않는다."""
    kind: str
    summary: str
    detail: str


class CommunityAgent:
    def __init__(self, norms: NormSource | None = None,
                 now: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self.norms = norms
        self.now = now
        self._posted: dict[str, list[datetime]] = {}     # community → 게시 시각들
        self._banned_until: dict[str, datetime] = {}
        self.strikes: list[tuple[str, str]] = []          # (community, reason)

    # ── 초안 ────────────────────────────────────────────────
    def draft(self, community: str, topic: str, body: str,
              language: str = "th") -> PostDraft:
        """정보성 초안 검사·조립. 고지 첫 줄을 붙이고 규칙 위반을 표시한다."""
        disclosure = DISCLOSURE_LINES.get(language, DISCLOSURE_LINES["en"])
        full = f"{disclosure}\n\n{body.strip()}"
        violations: list[str] = []

        if _LINK_RE.search(body):
            violations.append("초대·외부 링크 금지")

        norm = self.norms.current(community) if self.norms else None
        if norm is not None:
            text = f"{topic} {body}"
            for item in norm.banned:
                if item and item in text:
                    violations.append(f"커뮤니티 금지 항목: {item}")

        if not self.can_post(community):
            violations.append(self.block_reason(community))

        return PostDraft(community=community, language=language,
                         body=full, violations=violations)

    # ── 빈도·중단 ───────────────────────────────────────────
    def can_post(self, community: str) -> bool:
        return self.block_reason(community) == ""

    def block_reason(self, community: str) -> str:
        until = self._banned_until.get(community)
        if until and self.now() < until:
            return f"경고로 {until.date().isoformat()}까지 중단"
        week_ago = self.now() - timedelta(days=7)
        recent = [t for t in self._posted.get(community, []) if t > week_ago]
        if len(recent) >= WEEKLY_CAP:
            return "주 1회 상한 도달"
        return ""

    # ── 게이트 연동 ─────────────────────────────────────────
    def request_post(self, draft: PostDraft) -> PostRequest | None:
        """준비된 초안만 게이트 요청으로 변환. 위반이 있으면 요청 자체를 안 만든다."""
        if not draft.ready:
            return None
        return PostRequest(
            kind="OUTBOUND",
            summary=f"커뮤니티 게시 · {draft.community}",
            detail=draft.body,
        )

    def record_posted(self, community: str) -> None:
        """게이트 승인 → 실제 게시 후 호출."""
        self._posted.setdefault(community, []).append(self.now())

    def record_strike(self, community: str, reason: str,
                      updated_by: str = "ari") -> None:
        """관리자 경고·글 삭제 등 — 30일 중단 + 규범에 실패 경험 기록."""
        self._banned_until[community] = self.now() + timedelta(days=STRIKE_BAN_DAYS)
        self.strikes.append((community, reason))
        if self.norms is not None and hasattr(self.norms, "add_banned"):
            self.norms.add_banned(community, updated_by, reason,
                                  evidence=f"경고 수신: {reason}")

    def stats(self) -> dict:
        return {
            "communities": len(self._posted),
            "posts": sum(len(v) for v in self._posted.values()),
            "banned": {c: u.isoformat() for c, u in self._banned_until.items()
                       if self.now() < u},
            "strikes": len(self.strikes),
        }
