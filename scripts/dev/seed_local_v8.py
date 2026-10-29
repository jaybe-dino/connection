"""로컬 전용 v8 검수 시드 — 실제 API 경로로 관리자·브랜드 2곳·제품·캠페인·크리에이터를 만든다.

TikTok 소유 인증은 서버 테스트(tests/conftest.py)와 같이 로컬 DB에서 대리한다(외부 호출 없음).
API/DB 주소가 localhost가 아니면 실행을 거부한다. 운영 데이터에 쓰지 않는다.
사용: API_URL=http://localhost:8765 DATABASE_URL=postgresql://…@localhost:5432/v8dev python scripts/dev/seed_local_v8.py
"""
import os, re, sys, json, httpx, psycopg
from urllib.parse import urlparse, parse_qs
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'services', 'api'))
from api import auth
API = os.environ.get('API_URL', 'http://localhost:8765'); DB = os.environ.get('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/v8dev')
LOCAL_HOSTS = {'localhost', '127.0.0.1', '::1'}
TEST_DB = re.compile(r'^(v8dev|v8test|[a-z0-9_]+_(dev|test))$')


def local_only(api: str, db: str) -> None:
    """문자열 포함 검사가 아니라 URL을 해석해 호스트·DB 이름을 허용목록으로 확인한다.
    운영 URL의 비밀번호·쿼리에 'localhost'가 들어 있어도 호스트가 다르면 거부한다."""
    a = urlparse(api)
    if a.scheme not in ('http', 'https') or a.hostname not in LOCAL_HOSTS:
        raise SystemExit(f'로컬 전용 시드입니다: API 호스트 {a.hostname!r} 거부 (허용 {sorted(LOCAL_HOSTS)})')
    d = urlparse(db)
    if d.scheme not in ('postgresql', 'postgres') or d.hostname not in LOCAL_HOSTS:
        raise SystemExit(f'로컬 전용 시드입니다: DB 호스트 {d.hostname!r} 거부 (허용 {sorted(LOCAL_HOSTS)})')
    # libpq 는 쿼리의 host= 가 URL 호스트보다 우선한다 — 쿼리 호스트도 허용목록만
    for h in parse_qs(d.query).get('host', []) + parse_qs(d.query).get('hostaddr', []):
        if h not in LOCAL_HOSTS:
            raise SystemExit(f'로컬 전용 시드입니다: DB 쿼리 host {h!r} 거부')
    name = d.path.lstrip('/')
    if not TEST_DB.fullmatch(name):
        raise SystemExit(f'로컬 전용 시드입니다: DB 이름 {name!r} 거부 (v8dev·v8test·*_dev·*_test 만 허용)')


local_only(API, DB)
c = httpx.Client(base_url=API, timeout=20)
def ok(r):
    if r.status_code >= 400: raise SystemExit(f'{r.request.method} {r.request.url} {r.status_code} {r.text[:300]}')
    return r.json()
st = ok(c.get('/auth/status'))
if not st['hasAdmin']:
    ok(c.post('/auth/bootstrap', json={'email': 'admin@local.test', 'password': 'admin-pass-1234'}))
adm = ok(c.post('/auth/login', json={'email': 'admin@local.test', 'password': 'admin-pass-1234'}))['token']
H = {'Authorization': 'Bearer ' + adm}
brands = [('goryeo1392', '고려공작1392', 'goryeo@local.test', ['US', 'KR']), ('fau', 'FAU', 'fau@local.test', ['US', 'VN'])]
db = psycopg.connect(DB, autocommit=True)
for slug, name, email, ctry in brands:
    if not db.execute('SELECT 1 FROM brands WHERE brand_id=%s', (slug,)).fetchone():
        ok(c.post('/admin/brands', headers=H, json={'name': name, 'slug': slug, 'category': '뷰티', 'countries': ctry, 'manager_email': email}))
    db.execute('UPDATE users SET password_hash=%s WHERE email=%s', (auth.hash_password('brand-pass-1234'), email))
tok = {}
for slug, name, email, ctry in brands:
    tok[slug] = ok(c.post('/auth/login', json={'email': email, 'password': 'brand-pass-1234'}))['token']
P = {'goryeo1392': [('한방 진정 앰플', 15), ('자개 손거울', 10)], 'fau': [('수분 선크림', 12)]}
for slug, prods in P.items():
    BH = {'Authorization': 'Bearer ' + tok[slug]}
    have = {p['name'] for p in ok(c.get(f'/brands/{slug}/products', headers=BH))}
    for n, pct in prods:
        if n not in have: ok(c.post(f'/brands/{slug}/products', headers=BH, json={'name': n, 'commission_pct': pct}))
    if not db.execute('SELECT 1 FROM campaigns WHERE brand_id=%s', (slug,)).fetchone():
        r = ok(c.post(f'/brands/{slug}/campaigns', headers=BH, json={'name': f'{prods[0][0]} 미국 판매 영상', 'product': prods[0][0], 'usp': '진정·보습', 'reward_type': 'affiliate', 'affiliate_pct': prods[0][1], 'capacity': 20, 'deadline': '2026-12-15', 'countries': ['US']}))
        ok(c.post(f"/brands/{slug}/campaigns/{r['campaignId']}/publish", headers=BH))
# 제품 공개 목록 + 제품 연결 캠페인(조건 포함) — 운영팀 소개 등록(관리자 API) 후 브랜드가 공개 표시
GH = {'Authorization': 'Bearer ' + tok['goryeo1392']}
amp = next(p for p in ok(c.get('/brands/goryeo1392/products', headers=GH)) if p['name'] == '한방 진정 앰플')
ok(c.put(f"/admin/recruitment/setup/brands/goryeo1392/products/{amp['productId']}/invitation", headers=H,
         json={'summary': '예민한 피부를 위한 한방 진정 앰플이에요. 가볍게 흡수돼요.', 'image_url': 'https://cdn.example.com/goryeo-ampoule.png'}))
ok(c.post(f"/brands/goryeo1392/products/{amp['productId']}/public", headers=GH, json={'listed': True}))
if not db.execute('SELECT 1 FROM campaigns WHERE product_id=%s', (amp['productId'],)).fetchone():
    ok(c.post(f"/brands/goryeo1392/products/{amp['productId']}/campaigns", headers=GH,
              json={'name': '한방 앰플 판매 영상', 'capacity': 20, 'deadline': '2026-12-31',
                    'conditions': ['TikTok 영상 1개 · 30~60초', '필수: 제품명·사용 장면·USP 1개']}))
print('ok brands', list(tok))
# ── 크리에이터 1명(두 브랜드 멤버) — 매직링크(로컬 demoLink) + 온보딩 + TikTok 게이트 DB 대리
from urllib.parse import urlparse, parse_qs
def creator_token(email):
    r = ok(c.post('/auth/magic', json={'email': email, 'brand': 'goryeo1392'}))
    link = r.get('demoLink'); t = parse_qs(urlparse(link).query).get('magic', [''])[0]
    return ok(c.post('/auth/magic/verify', json={'token': t}))['token']
ct = creator_token('minji@creator.test'); CH = {'Authorization': 'Bearer ' + ct}
ok(c.put('/me/profile', headers=CH, json={'country': 'US', 'languages': ['ko', 'en'], 'ship_countries': ['US'], 'tiktok_handle': 'minji.test', 'consent_terms': True, 'consent_privacy': True}))
uid = db.execute("SELECT user_id FROM users WHERE email='minji@creator.test'").fetchone()[0]
db.execute("UPDATE creator_profiles SET tiktok_owner_state='connected', tiktok_open_id='local-open-minji' WHERE creator_id::text=%s OR creator_id::text IN (SELECT creator_id::text FROM users WHERE user_id=%s)", (str(uid), uid))
for b in ('goryeo1392', 'fau'):
    r = c.post('/me/join', headers=CH, json={'brand_id': b}); print('join', b, r.status_code, r.text[:120])
out = os.environ.get('SEED_TOKENS', 'tests_e2e/shots/.seed-tokens.json')
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w').write(json.dumps({'admin': adm, 'creator': ct, **tok}))
print('tokens ->', out)
