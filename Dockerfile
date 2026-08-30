# 커넥션 API — Railway/Render/Fly 공용 이미지.
# 빌드 컨텍스트는 리포 루트여야 한다 (db/migrations + services/core 포함 필요).
# 루트에 이 이름(Dockerfile)으로 두면 Railway가 설정 없이 자동으로 이 파일로 빌드한다.

FROM python:3.11-slim

WORKDIR /app

# 마이그레이션은 기동 시 자동 적용되므로 db/ 가 이미지 안에 있어야 한다
COPY db/ db/
COPY services/core/ services/core/
COPY services/harvest/ services/harvest/
COPY services/api/ services/api/

RUN pip install --no-cache-dir ./services/core ./services/harvest ./services/api

# Railway가 PORT를 주입한다 (기본 8000)
ENV PORT=8000
EXPOSE 8000

CMD uvicorn api.main:app --app-dir services/api --host 0.0.0.0 --port ${PORT}
