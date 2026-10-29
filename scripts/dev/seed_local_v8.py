"""로컬 전용 v8 검수 시드 — 실제 API 경로로 관리자·브랜드 2곳·제품·캠페인·크리에이터를 만든다.

TikTok 소유 인증은 서버 테스트(tests/conftest.py)와 같이 로컬 DB에서 대리한다(외부 호출 없음).
API/DB 주소가 localhost가 아니면 실행을 거부한다. 운영 데이터에 쓰지 않는다.
사용: API_URL=http://localhost:8765 DATABASE_URL=postgresql://…@localhost:5432/v8dev python scripts/dev/seed_local_v8.py
"""
import os, sys, json, httpx, psycopg
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'services', 'api'))
from api import auth
API = os.environ.get('API_URL', 'http://localhost:8765'); DB = os.environ.get('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/v8dev')
if 'localhost' not in API or 'localhost' not in DB:
    raise SystemExit('로컬 전용 시드입니다 (localhost API/DB만 허용)')
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
