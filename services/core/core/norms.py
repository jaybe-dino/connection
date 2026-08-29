"""L3 규범 메모리 — 데이터 4층 중 학습층 (기획안 §5, 커뮤니티 에이전트 지식).

커뮤니티(외부 그룹·셀)마다 "무엇이 통하고 무엇이 금지인가"를 버전으로 쌓는다:
  · rules   — 그 공간의 명시 규칙 (예: 홍보 금지, 링크 금지)
  · worked  — 실제로 반응이 좋았던 접근 (예: 성분 정보성 글)
  · banned  — 하면 안 되는 것 (경험으로 확인된 금지)
  · evidence — 이 버전을 만든 근거 (관찰·경고·성과)

수정은 항상 새 버전 — 과거 버전은 그대로 남고, 갱신은 원장에 NORM_UPDATED 로 기록.
아리 재시작·모델 교체 후에도 같은 실수를 반복하지 않기 위한 장치다.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime

from .ledger import EventType, Ledger


@dataclass(frozen=True)
class NormVersion:
    community: str               # 'fb:th-beauty-review' | 'cell-glowlab-th' …
    version: int
    rules: tuple[str, ...]
    worked: tuple[str, ...]
    banned: tuple[str, ...]
    evidence: str                # 이 버전을 만든 관찰/근거 한 줄
    updated_by: str              # 'ari:glowlab' | 'user:kim'
    ts: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


class NormMemory:
    """커뮤니티별 버전형 규범 저장소. 원장이 주어지면 갱신마다 기록한다."""

    def __init__(self, ledger: Ledger | None = None) -> None:
        self._versions: dict[str, list[NormVersion]] = {}
        self.ledger = ledger

    def update(self, community: str, updated_by: str, evidence: str,
               rules: list[str] | None = None,
               worked: list[str] | None = None,
               banned: list[str] | None = None) -> NormVersion:
        """새 버전 생성 — 전달 안 한 항목은 직전 버전 값을 승계한다."""
        prev = self.current(community)
        v = NormVersion(
            community=community,
            version=(prev.version + 1) if prev else 1,
            rules=tuple(rules) if rules is not None else (prev.rules if prev else ()),
            worked=tuple(worked) if worked is not None else (prev.worked if prev else ()),
            banned=tuple(banned) if banned is not None else (prev.banned if prev else ()),
            evidence=evidence,
            updated_by=updated_by,
        )
        self._versions.setdefault(community, []).append(v)
        if self.ledger is not None:
            self.ledger.append(updated_by, EventType.NORM_UPDATED, community, {
                "version": v.version, "evidence": evidence,
                "rules": list(v.rules), "worked": list(v.worked),
                "banned": list(v.banned),
            })
        return v

    def add_banned(self, community: str, updated_by: str, item: str,
                   evidence: str) -> NormVersion:
        """경고·삭제 등 실패 경험 → 금지 항목 추가 (가장 흔한 갱신 경로)."""
        prev = self.current(community)
        banned = list(prev.banned) if prev else []
        if item not in banned:
            banned.append(item)
        return self.update(community, updated_by, evidence, banned=banned)

    def add_worked(self, community: str, updated_by: str, item: str,
                   evidence: str) -> NormVersion:
        prev = self.current(community)
        worked = list(prev.worked) if prev else []
        if item not in worked:
            worked.append(item)
        return self.update(community, updated_by, evidence, worked=worked)

    def current(self, community: str) -> NormVersion | None:
        versions = self._versions.get(community)
        return versions[-1] if versions else None

    def history(self, community: str) -> list[NormVersion]:
        return list(self._versions.get(community, []))

    def communities(self) -> list[str]:
        return sorted(self._versions)
