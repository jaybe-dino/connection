"""커넥션 백엔드 API — services/core 도메인 로직의 HTTP 표면.

엔드포인트 계약의 정본은 packages/shared/src/index.ts 타입.
인증은 OAuth 승인 전까지 헤더 스텁(X-Member-Id / X-Creator-Id).
"""

__version__ = "0.1.0"
