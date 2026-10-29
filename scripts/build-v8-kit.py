#!/usr/bin/env python3
"""v8.1 승인 시안(docs/ui-reference/v8.1/dist)의 CSS를 운영용 한 파일로 묶는다.

- 시안과 같은 순서로 이어 붙인다(styles → live-reference → slack-preserve → product-market →
  design-v5 → campaign-v6 → quality-v7 → visual-v8). 선언값은 바꾸지 않는다.
- 검토용 UI 규칙(검토 툴바 .rv-*, 개선 번호 .hs, 캡처/현재 화면 비교, '디자인 예시' 표시,
  v7 검토 도구 접기)은 운영에 싣지 않으므로 뺀다.
- 결과: packages/demo-core/src/v8/v8-kit.css → scripts/sync-demo.sh 가 각 앱 public/v8/ 로 복사.
사용: python3 scripts/build-v8-kit.py          # 생성
      python3 scripts/build-v8-kit.py --check  # 원본 SHA256SUMS 확인 + 생성 결과가 커밋본과 같은지 확인(clean checkout 검증)
"""
import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'docs/ui-reference/v8.1/dist'
OUT = ROOT / 'packages/demo-core/src/v8/v8-kit.css'
ORDER = ['styles.css', 'live-reference.css', 'slack-preserve.css', 'product-market.css',
         'design-v5.css', 'campaign-v6.css', 'quality-v7.css', 'visual-v8.css']
# 검토 전용 선택자 — 하나라도 포함한 선택자 조각은 버린다
REVIEW = re.compile(r'\.(rv-|hs\b|hs\.|hide-badges|cur\b|cur-|cap\b|cap-|demo-note|v7-tools|v7-tbtn|v7-count|sp-rv)|#rv|\[data-hs')


def strip_comments(css: str) -> str:
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def blocks(css: str):
    """최상위 규칙을 (prelude, body) 로 나눈다. 중첩 @media/@supports/@container 지원."""
    i, n = 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            break
        prelude = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == '{':
                depth += 1
            elif css[k] == '}':
                depth -= 1
            k += 1
        yield prelude, css[j + 1:k - 1]
        i = k


def filt(css: str) -> str:
    out = []
    for prelude, body in blocks(css):
        if prelude.startswith('@media') or prelude.startswith('@supports') or prelude.startswith('@container'):
            inner = filt(body)
            if inner.strip():
                out.append(f'{prelude}{{{inner}}}')
            continue
        if prelude.startswith('@'):
            out.append(f'{prelude}{{{body}}}')
            continue
        sels = [s.strip() for s in prelude.split(',')]
        keep = [s for s in sels if s and not REVIEW.search(s)]
        if keep:
            out.append(f"{','.join(keep)}{{{body.strip()}}}")
    return '\n'.join(out)


def build() -> str:
    parts = []
    for name in ORDER:
        raw = (SRC / name).read_text(encoding='utf-8')
        parts.append(f'/* ---- {name} (sha256 {hashlib.sha256(raw.encode()).hexdigest()[:12]}) ---- */\n' + filt(strip_comments(raw)))
    head = '/* 생성 파일 — scripts/build-v8-kit.py 로 docs/ui-reference/v8.1 에서 만든다. 직접 고치지 말 것. */\n'
    return head + '\n'.join(parts) + '\n'


def main() -> None:
    if '--check' in sys.argv:
        ref = SRC.parent
        r = subprocess.run(['sha256sum', '-c', '--quiet', 'SHA256SUMS'], cwd=ref, capture_output=True, text=True)
        if r.returncode:
            raise SystemExit('v8.1 원본 SHA256SUMS 불일치/누락:\n' + (r.stdout + r.stderr)[-2000:])
        if not OUT.exists() or OUT.read_text(encoding='utf-8') != build():
            raise SystemExit(f'{OUT.relative_to(ROOT)} 가 원본에서 다시 만든 결과와 다릅니다 — python3 scripts/build-v8-kit.py')
        print('v8.1 원본 SHA256SUMS OK · CSS kit 재생성 일치')
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(build(), encoding='utf-8')
    print(f'{OUT.relative_to(ROOT)} {OUT.stat().st_size} bytes')


if __name__ == '__main__':
    main()
