# harvest — 커넥션 수집 엔진

母 DB(creator_pool)를 채우는 파이프라인:
`Discover → Fetch → Enrich → Normalize → Dedup → Score → Store → Serve`

설계 근거: [docs/handover/03_수집엔진](../../docs/handover/03_수집엔진/) —
설계 · 국가별 플레이북 · 기술스택 명세 · 구현상세 명세.

## 구현된 것 (벤더 키 없이 동작·테스트 가능)

| 모듈 | 내용 | 명세 |
|------|------|------|
| `config.py` | 그래프 확장·수렴·재시도·가중치·임계 파라미터 | §3~§7 |
| `queues.py` | 큐/이벤트 계약 (q.discover~q.dead_letter) + 인메모리 백엔드 | §2 |
| `discover.py` | 시드 사전 · 수렴 판정(신규율<3% 3연속) · 일일 예산 | §3 |
| `fetch.py` | 벤더 라우터 — 폴백/쿼터 비활성/404 EXCLUDED/dead_letter | §4 |
| `vendors/` | 벤더 어댑터 계약 + ScrapeCreators·EnsembleData·Apify 골격 | §4·스택§8 |
| `enrich/` | 이메일 추출(난독화 대응)·검증 파이프·국가 가중 합의 | §5 |
| `dedup.py` | 블로킹 키 정규화 · 매칭 점수표 · merge/review/distinct | §6 |
| `score.py` | 영향력(sigmoid+z) · 접촉 우선순위 · 등급 컷 · 계단 감지 | §7 |
| `store.py` | 인메모리/Postgres upsert (핸들 이력 · sources 누적) | §1·§2 |
| `pipeline.py` | Fetch/Enrich 워커 — 멱등성(fresh skip) 포함 | §2 |

## 실행

```bash
pip install -e ".[dev]"
pytest                      # 44개 단위 테스트, 네트워크 불필요

python -m harvest.cli demo  # 픽스처 3건으로 전체 파이프라인 실연
python -m harvest.cli score --followers 45000 --engagement 0.06 --avg-views 30000
python -m harvest.cli country --region TH --bio-lang th
python -m harvest.cli emails --bio "contact: jay(at)dino(dot)studio"
```

## 남은 것 (벤더 계약 후)

1. `vendors/adapters.py`의 HTTP 호출 구현 — 키는 환경변수
   (`SCRAPECREATORS_API_KEY` · `ENSEMBLEDATA_TOKEN` · `APIFY_TOKEN`)
2. D1 해시태그 discover 어댑터 → `q.fetch` 적재
3. D2 그래프 확장 워커 (`q.expand` 소비 · fanout_cap · 일일 예산)
4. link-in-bio 크롤러 · 이메일 DB 조인(상위 등급만) · ZeroBounce류 연동
5. Redis Streams/SQS 큐 어댑터 · cron 지속 루프(§10) · 모니터링 지표(§11)
6. Postgres 연동 e2e (`db/migrations/001_creator_pool.sql`)

## 원칙

- **구매가 기본** — 스크래핑 인프라·프록시는 벤더에, 우리는 그래프 확장·dedup·스코어·학습 로직에 집중.
- **법률 선** — 공개 데이터·공식 API·라이선스 DB까지만. 발송은 전부 OUTBOUND 게이트 뒤.
- 숫자는 설계 기준값 — 운영에서 캘리브레이션.
