#!/usr/bin/env python3
"""improvements.json / coverage.json 을 app.js 의 데이터 마커 사이에 넣는다 (file:// 에서도 동작하도록).
사용: python3 tools/embed_data.py  (numbered-20261025 폴더에서 실행)"""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
imp = json.loads((root / 'improvements.json').read_text(encoding='utf-8'))
cov = json.loads((root / 'coverage.json').read_text(encoding='utf-8'))
app = (root / 'app.js').read_text(encoding='utf-8')
block = ('/*__DATA_START__*/\nconst IMPROVEMENTS = ' + json.dumps(imp, ensure_ascii=False) +
         ';\nconst COVERAGE = ' + json.dumps(cov, ensure_ascii=False) + ';\n/*__DATA_END__*/')
app, n = re.subn(r'/\*__DATA_START__\*/.*?/\*__DATA_END__\*/', lambda m: block, app, flags=re.S)
assert n == 1, 'marker not found'
(root / 'app.js').write_text(app, encoding='utf-8')
print('embedded', len(imp), 'items')
