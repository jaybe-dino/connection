"""Deterministic proposal UI locale. Does not infer a creator's language."""
import re

def proposal_locale(text, language=''):
    value=(language or '').strip().lower()
    if value in ('en','english','영어'):return 'en'
    if value in ('ko','korean','한국어'):return 'ko'
    # Legacy English proposals get English CTA; this is message language only.
    return 'ko' if len(re.findall('[가-힣]',text or ''))>10 else 'en'

def join_label(locale):
    return 'Join the brand’s PR list (free)' if locale=='en' else '브랜드 PR 리스트 합류(무료)'
