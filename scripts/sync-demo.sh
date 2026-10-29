#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
python3 - <<'PY'
from pathlib import Path
import hashlib,re,shutil
source=Path('packages/demo-core/src')
for app in ('console','signup','creator-app'):
    public=Path('apps')/app/'public'
    names=['demo.css','product.css','live-theme.css','engine.js','engine-live.js']+(['mobile.css'] if app=='creator-app' else [])
    for name in names:shutil.copyfile(source/name,public/name)
    for html in [Path('apps')/app/'index.html']+([public/'account.html'] if app=='signup' else []):
        text=html.read_text()
        for name in names:
            digest=hashlib.sha256((public/name).read_bytes()).hexdigest()[:8]
            text=re.sub(r'"/'+re.escape(name)+r'(?:\?v=[a-f0-9]+)?"','"/'+name+'?v='+digest+'"',text)
        html.write_text(text)
# v8.1 운영 키트(생성 CSS·셸 JS)는 public/v8/ 로 복사
v8=source/'v8'
if v8.is_dir():
    for app in ('console','creator-app'):
        dst=Path('apps')/app/'public'/'v8'; dst.mkdir(parents=True,exist_ok=True)
        for f in v8.iterdir():
            # 콘솔 전용 셸(console-v8.*)은 콘솔에만
            if f.is_file() and not (f.name.startswith('console-') and app!='console'):shutil.copyfile(f,dst/f.name)
    # 관리자 앱도 같은 v8.1 키트 CSS(생성본)를 쓴다
    adm=Path('apps/admin/public/v8'); adm.mkdir(parents=True,exist_ok=True); shutil.copyfile(v8/'v8-kit.css',adm/'v8-kit.css')
    html=Path('apps/admin/index.html'); t=html.read_text(); d=hashlib.sha256((adm/'v8-kit.css').read_bytes()).hexdigest()[:8]
    t=re.sub(r'"/v8/v8-kit\.css(?:\?v=[a-f0-9]+)?"','"/v8/v8-kit.css?v='+d+'"',t); html.write_text(t)
print('synced and cache-busted')
PY
