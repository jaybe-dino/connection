from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parents[1]
out=root/'docs/operations-review/evidence'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/Users/jaybe/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',headless=True)
    results=[]
    for width in (1440,390):
        context=browser.new_context(viewport={'width':width,'height':1000})
        page=context.new_page(); errors=[]; requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('**/*',lambda r:r.continue_() if r.request.url.startswith('file:') else (requests.append(r.request.url),r.abort())[1])
        page.goto((root/'tools/operations-review/index.html').as_uri())
        for tab in ('overview','brands','capacity','build','review'):
            page.locator(f'[data-tab="{tab}"]').click()
            assert page.locator(f'#{tab}').is_visible()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),tab
            page.screenshot(path=str(out/f'{width}-{tab}.png'),full_page=True)
        page.locator('[data-tab="brands"]').click();page.locator('#brand-search').fill('RETURNU')
        assert page.locator('#brand-list article').count()==1
        page.locator('[data-tab="capacity"]').click();page.locator('#conversion').fill('0');page.locator('[type=submit]').click()
        assert '계산 불가' in page.locator('#forecast-result').inner_text()
        page.locator('[data-tab="review"]').click()
        memo=page.locator('textarea').first;memo.fill('QA 검토 메모')
        page.locator('#save-decisions').click();page.reload();page.locator('[data-tab="review"]').click()
        assert page.locator('textarea').first.input_value()=='QA 검토 메모'
        page.on('dialog',lambda d:d.accept());page.locator('#clear-decisions').click()
        assert page.locator('textarea').first.input_value()==''
        assert not errors,errors
        assert not requests,requests
        results.append({'width':width,'tabs':5,'horizontalOverflow':False,'jsErrors':errors,'externalRequests':requests,'searchZeroConversionPersistenceReset':'passed'})
        context.close()
    browser.close()
    (out/'browser-qa.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(results,ensure_ascii=False))
