#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:$PATH"
export PGHOST=/tmp/prlist-ops-pg
export PGPORT=55432
mkdir -p docs/operations-review/evidence
pg_isready -h "$PGHOST" -p "$PGPORT"
.venv/bin/python -m pytest -q --tb=short -p tests_operations.offline_guard services/api/tests tests_operations/test_evidence.py > docs/operations-review/evidence/api-regression.log 2>&1
node --test tests_ui/*.test.cjs tests_operations/*.test.cjs apps/signup/tests/*.test.mjs > docs/operations-review/evidence/node-tests.log
node --check packages/demo-core/src/engine-live.js
node --check tools/operations-review/app.js
.venv/bin/python tests_operations/browser_qa.py
git diff --check
