#!/usr/bin/env bash
# packages/demo-core → 각 앱 public/ 동기화 (UI 정본은 demo-core 한 곳에서만 수정)
set -e
cd "$(dirname "$0")/.."
for app in console signup creator-app; do
  mkdir -p "apps/$app/public"
  cp packages/demo-core/src/demo.css packages/demo-core/src/product.css \
     packages/demo-core/src/engine.js packages/demo-core/src/engine-live.js \
     "apps/$app/public/"
done
cp packages/demo-core/src/mobile.css apps/creator-app/public/
echo "synced"
