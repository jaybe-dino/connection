#!/usr/bin/env bash
# packages/demo-core → 각 앱 public/ 동기화 (UI 정본은 demo-core 한 곳에서만 수정)
# + index.html의 참조에 내용 해시(?v=)를 박아 브라우저·CDN 캐시를 확실히 무효화한다.
set -e
cd "$(dirname "$0")/.."

hash8() { md5sum "$1" | cut -c1-8; }

for app in console signup creator-app; do
  mkdir -p "apps/$app/public"
  cp packages/demo-core/src/demo.css packages/demo-core/src/product.css \
     packages/demo-core/src/engine.js packages/demo-core/src/engine-live.js \
     "apps/$app/public/"
done
cp packages/demo-core/src/mobile.css apps/creator-app/public/

for app in console signup creator-app; do
  html="apps/$app/index.html"
  for f in demo.css product.css mobile.css engine.js engine-live.js; do
    [ -f "apps/$app/public/$f" ] || continue
    v=$(hash8 "apps/$app/public/$f")
    # href/src="/파일" 또는 "/파일?v=..." → "/파일?v=<새해시>"
    sed -i -E "s|(\"/$f)(\?v=[0-9a-f]*)?\"|\1?v=$v\"|g" "$html"
  done
done
echo "synced (+cache-bust)"
