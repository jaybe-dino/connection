#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
python3 - <<'PY'
from pathlib import Path
import hashlib,re,shutil
source=Path('packages/demo-core/src')
for app in ('console','signup','creator-app'):
    public=Path('apps')/app/'public'
    names=['demo.css','product.css','engine.js','engine-live.js']+(['mobile.css'] if app=='creator-app' else [])
    for name in names:shutil.copyfile(source/name,public/name)
    for html in [Path('apps')/app/'index.html']+([public/'account.html'] if app=='signup' else []):
        text=html.read_text()
        for name in names:
            digest=hashlib.sha256((public/name).read_bytes()).hexdigest()[:8]
            text=re.sub(r'"/'+re.escape(name)+r'(?:\?v=[a-f0-9]+)?"','"/'+name+'?v='+digest+'"',text)
        html.write_text(text)
print('synced and cache-busted')
PY
