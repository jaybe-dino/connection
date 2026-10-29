#!/usr/bin/env bash
# 운영 API 이미지(Dockerfile.security-api)에 DB 마이그레이션이 실제로 들어 있고,
# 앱이 그 경로를 쓰며, 058/059 가 깨끗한 Postgres 에 적용되어 신규 컬럼이 생기는지 확인한다.
# 사용: scripts/release/verify_security_api_image.sh [이미지태그]   (태그를 안 주면 현재 작업트리로 빌드)
# 운영 비밀값·운영 DB 를 쓰지 않는다(일회용 postgres 컨테이너만).
set -euo pipefail
cd "$(dirname "$0")/../.."
IMG="${1:-}"
if [ -z "$IMG" ]; then
  IMG=prlist-security-api:verify
  if [ -n "${VERIFY_PIP_FIND_LINKS:-}" ]; then
    # 샌드박스 전용(공개 PyPI 직접 접근 불가 시): 같은 Dockerfile 에 pip 오프라인 설치 ARG 만 추가한 사본으로 빌드.
    # 운영(Railway) 빌드는 이 경로를 쓰지 않는다. 고정 버전·COPY·entrypoint 는 원본 그대로다.
    tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
    sed '0,/^FROM .*/s//&\nARG PIP_NO_INDEX=1\nARG PIP_FIND_LINKS=\/wheels/' Dockerfile.security-api > "$tmp"
    sed -i 's#^RUN python -m pip install#RUN --mount=type=bind,source=.verify-wheels,target=/wheels PIP_NO_INDEX=1 PIP_FIND_LINKS=/wheels python -m pip install#' "$tmp"
    rm -rf .verify-wheels; cp -r "$VERIFY_PIP_FIND_LINKS" .verify-wheels
    docker build -q -f "$tmp" -t "$IMG" . >/dev/null; rm -rf .verify-wheels
  else
    docker build -q -f Dockerfile.security-api -t "$IMG" . >/dev/null
  fi
fi
echo "image: $IMG"

# 1) 이미지 안의 실제 경로 — 앱(--app-dir services/api)이 쓰는 MIGRATIONS_DIR 와 058/059 존재·내용 일치
for f in 058_public_product_listing.sql 059_campaign_terms_platform_currency.sql; do
  want=$(sha256sum "db/migrations/$f" | cut -d' ' -f1)
  got=$(docker run --rm --entrypoint sh "$IMG" -c "sha256sum /app/db/migrations/$f" | cut -d' ' -f1)
  [ "$want" = "$got" ] || { echo "FAIL $f 이미지 내용 불일치/누락"; exit 1; }
done
docker run --rm --entrypoint python -w /app "$IMG" -c "
import sys; sys.path.insert(0,'services/api')
import api.db as d
p=str(d.MIGRATIONS_DIR); n=sorted(x.name for x in d.MIGRATIONS_DIR.glob('*.sql'))
assert p=='/app/db/migrations', p
assert '058_public_product_listing.sql' in n and '059_campaign_terms_platform_currency.sql' in n, n[-3:]
print('MIGRATIONS_DIR', p, 'files', len(n), 'last', n[-1])"
n_repo=$(ls db/migrations/*.sql | wc -l)
n_img=$(docker run --rm --entrypoint sh "$IMG" -c 'ls /app/db/migrations/*.sql | wc -l')
[ "$n_repo" = "$n_img" ] || { echo "FAIL 마이그레이션 개수 저장소 $n_repo / 이미지 $n_img"; exit 1; }
# db/ 의 다른 파일은 넣지 않는다
extra=$(docker run --rm --entrypoint sh "$IMG" -c 'ls -A /app/db')
[ "$extra" = "migrations" ] || { echo "FAIL /app/db 에 migrations 외 항목: $extra"; exit 1; }

# 2) 구문·적용 — 이미지의 run_migrations 로 일회용 Postgres 에 전부 적용, 두 번째 실행은 0건(멱등)
NET=prlist-verify-$$; PG=prlist-verify-pg-$$
docker network create "$NET" >/dev/null
trap 'docker rm -f "$PG" >/dev/null 2>&1; docker network rm "$NET" >/dev/null 2>&1' EXIT
docker run -d --rm --name "$PG" --network "$NET" -e POSTGRES_PASSWORD=verify postgres:16 >/dev/null
for i in $(seq 1 30); do docker exec "$PG" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2
docker run --rm --network "$NET" --entrypoint python -w /app -e DATABASE_URL="postgresql://postgres:verify@$PG:5432/postgres" "$IMG" -c "
import sys; sys.path.insert(0,'services/api')
import api.db as d
a=d.run_migrations(); assert '058_public_product_listing.sql' in a and '059_campaign_terms_platform_currency.sql' in a, a[-3:]
assert d.run_migrations()==[], '두 번째 실행에서 다시 적용됨'
with d.connect() as c:
    cols={(r['table_name'],r['column_name']) for r in c.execute(\"SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'\")}
need={('brand_products','public_listed'),('brand_products','public_listed_at'),('campaigns','platform'),('campaigns','reward_currency'),('campaign_terms','platform_handle'),('campaign_terms','agreed_terms')}
miss=need-cols; assert not miss, miss
print('applied', len(a), 'migrations · 신규 컬럼 확인', sorted(need))"
echo "PASS security-api image migrations"
