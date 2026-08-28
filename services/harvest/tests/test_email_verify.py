from harvest.enrich.email_verify import syntax_ok, verify_email
from harvest.models import EmailStatus


class StubApi:
    def __init__(self, verdict):
        self.verdict = verdict

    def verify(self, email):
        return self.verdict


def _mx_ok(domain):
    return True


def _mx_fail(domain):
    return False


def test_syntax():
    assert syntax_ok("a@b.co")
    assert not syntax_ok("not-an-email")
    assert not syntax_ok("a@b")


def test_bad_syntax_is_none():
    assert verify_email("nope", mx_lookup=_mx_ok) == EmailStatus.NONE


def test_no_mx_is_none():
    assert verify_email("a@dead.example", mx_lookup=_mx_fail) == EmailStatus.NONE


def test_without_api_is_risky():
    # 외부 검증 전 — 발송 제외 기본
    assert verify_email("a@b.co", mx_lookup=_mx_ok) == EmailStatus.RISKY


def test_api_verdicts():
    assert verify_email("a@b.co", StubApi("valid"), _mx_ok) == EmailStatus.VALID
    assert verify_email("a@b.co", StubApi("risky"), _mx_ok) == EmailStatus.RISKY
    assert verify_email("a@b.co", StubApi("invalid"), _mx_ok) == EmailStatus.NONE
