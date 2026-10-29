"""로컬 시드 가드 — 호스트·DB 이름 허용목록. 거부 경로는 네트워크·DB 접속 전에 종료한다."""
import os
import subprocess
import sys
from pathlib import Path

SEED = Path(__file__).resolve().parents[3] / 'scripts' / 'dev' / 'seed_local_v8.py'


def _run(api, db):
    env = {**os.environ, 'API_URL': api, 'DATABASE_URL': db}
    return subprocess.run([sys.executable, str(SEED)], env=env, capture_output=True, text=True, timeout=60)


def test_rejects_production_urls_even_if_they_mention_localhost():
    bad = [
        ('https://api.theprlist.net/?x=localhost', 'postgresql://u:p@localhost:5432/v8dev'),
        ('http://localhost.evil.example:8765', 'postgresql://u:p@localhost:5432/v8dev'),
        ('http://localhost:8765', 'postgresql://u:localhost@db.railway.internal:5432/v8dev'),
        ('http://localhost:8765', 'postgresql://u:p@prod.example/railway?note=localhost'),
        ('http://localhost:8765', 'postgresql://u:p@localhost:5432/v8dev?host=prod.example'),
        ('http://localhost:8765', 'postgresql://u:p@localhost:5432/railway'),
        ('http://localhost:8765', 'postgresql://u:p@localhost:5432/production'),
        ('http://localhost:8765', 'postgresql:///v8dev'),
    ]
    for api, db in bad:
        r = _run(api, db)
        assert r.returncode != 0 and '로컬 전용 시드입니다' in r.stderr, (api, db, r.stderr[-300:])


def test_accepts_local_hosts_and_test_db_names_in_guard():
    sys.path.insert(0, str(SEED.parent))
    src = SEED.read_text(encoding='utf-8')
    ns = {}
    head = src.split('local_only(API, DB)')[0]
    exec(compile(head.split('sys.path.insert')[0] + '\n' + head[head.index('LOCAL_HOSTS'):], str(SEED), 'exec'), ns)
    for api, db in [('http://localhost:8765', 'postgresql://u:p@localhost:5432/v8dev'),
                    ('http://127.0.0.1:8765', 'postgresql://u:p@127.0.0.1/my_test'),
                    ('http://[::1]:8765', 'postgresql://u:p@[::1]:5432/v8test')]:
        ns['local_only'](api, db)
