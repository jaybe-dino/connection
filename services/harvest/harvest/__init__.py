"""커넥션 수집 엔진 (harvest).

파이프라인: Discover → Fetch → Enrich → Normalize → Dedup → Score → Store(母 DB).
설계 근거: docs/handover/03_수집엔진/ 4종 문서. 숫자는 설계 기준값(운영 캘리브레이션).
"""

__version__ = "0.1.0"
