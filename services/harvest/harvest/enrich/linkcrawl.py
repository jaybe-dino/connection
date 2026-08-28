"""link-in-bio 크롤 — 구현상세 명세 §5.1 2단.

linktr.ee·beacons.ai·lnk.bio·taplink·개인 도메인 → GET →
페이지 내 mailto: + 정규식 + 연락 페이지. 타임아웃 시 2회 재시도 후 스킵(§9).
공개 페이지만 — 로그인 우회 없음.
"""

import logging
import re
from typing import Callable

from ..http import HttpResponse, Transport
from .email_extract import extract_emails

log = logging.getLogger(__name__)

_RE_MAILTO = re.compile(r'mailto:([\w.+-]+@[\w-]+\.[\w.-]+)', re.IGNORECASE)
_RE_CONTACT_HREF = re.compile(
    r'href=["\']([^"\']*(?:contact|about|business)[^"\']*)["\']', re.IGNORECASE)

MAX_RETRIES = 2          # 링크 크롤 타임아웃 → 2회 재시도 후 스킵


def _emails_in_html(html: str) -> list[str]:
    found = [m.group(1).lower() for m in _RE_MAILTO.finditer(html)]
    found += extract_emails(html)
    seen: set[str] = set()
    out = []
    for e in found:
        if e not in seen:
            seen.add(e)
            out.append(e)
    return out


def crawl_link(url: str, transport: Transport,
               follow_contact_page: bool = True) -> list[str]:
    """링크 1개에서 이메일 후보 추출. 실패는 빈 목록 (파이프라인 §9: 스킵)."""
    resp = _get_with_retry(url, transport)
    if resp is None or resp.status >= 400:
        return []
    emails = _emails_in_html(resp.body)

    if not emails and follow_contact_page:
        m = _RE_CONTACT_HREF.search(resp.body)
        if m:
            contact_url = m.group(1)
            if contact_url.startswith("/"):
                base = url.split("/", 3)
                contact_url = f"{base[0]}//{base[2]}{contact_url}"
            if contact_url.startswith("http"):
                sub = _get_with_retry(contact_url, transport)
                if sub is not None and sub.status < 400:
                    emails = _emails_in_html(sub.body)

    return emails


def _get_with_retry(url: str, transport: Transport) -> HttpResponse | None:
    for attempt in range(1 + MAX_RETRIES):
        try:
            return transport.get(url, timeout=15.0)
        except Exception as e:                      # 타임아웃·연결 실패
            log.debug("link crawl fail (%d/%d) %s: %s",
                      attempt + 1, 1 + MAX_RETRIES, url, e)
    return None
