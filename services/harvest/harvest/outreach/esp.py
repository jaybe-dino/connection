"""ESP 어댑터 — 기술스택 명세 §7.

Amazon SES v2 / SendGrid v3 계약 초안 + DryRunEsp(키 없이 전체 파이프라인 검증).
도메인 원칙: 아웃리치는 알림과 분리된 서브도메인(outreach.connection.app),
SPF·DKIM·DMARC 필수, unsubscribe 링크는 시퀀스 엔진이 본문에 강제 삽입한다.
"""

import logging
import os
from dataclasses import dataclass, field
from typing import Protocol

from ..http import Transport, UrllibTransport

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class OutboundEmail:
    to: str
    subject: str
    body_text: str
    from_addr: str = "ari@outreach.connection.app"
    reply_to: str = "reply@outreach.connection.app"
    unsubscribe_url: str = ""


class EspError(Exception):
    pass


class Esp(Protocol):
    name: str

    def send(self, email: OutboundEmail) -> str:
        """발송 후 message_id 반환. 실패는 EspError."""
        ...


@dataclass
class DryRunEsp:
    """키 계약 전 기본값 — 실제 발송 없이 기록만. 테스트·스테이징용."""

    name: str = "dryrun"
    sent: list[OutboundEmail] = field(default_factory=list)

    def send(self, email: OutboundEmail) -> str:
        self.sent.append(email)
        log.info("[DRY-RUN] → %s | %s", email.to, email.subject)
        return f"dryrun-{len(self.sent)}"


class SesEsp:
    """Amazon SES v2 SendEmail — 프로덕션은 SigV4 서명 필요(boto3 권장).

    여기서는 계약(요청 형태)을 고정하고, 서명 미구현 상태에서는 EspError로
    명확히 실패한다 — 조용한 미발송 없음.
    """

    name = "ses"

    def __init__(self, region: str | None = None,
                 transport: Transport | None = None) -> None:
        self.region = region or os.environ.get("AWS_REGION", "ap-southeast-1")
        self.transport = transport or UrllibTransport()

    def send(self, email: OutboundEmail) -> str:
        raise EspError(
            "SES 발송은 SigV4 서명 필요 — boto3 sesv2.send_email 연동 후 사용. "
            "요청 계약: {FromEmailAddress, Destination.ToAddresses, "
            "Content.Simple.{Subject,Body}, ListManagementOptions}")


class SendGridEsp:
    """SendGrid v3 /mail/send — Bearer 키만 있으면 동작."""

    name = "sendgrid"
    base = "https://api.sendgrid.com/v3"
    env_key = "SENDGRID_API_KEY"

    def __init__(self, api_key: str | None = None,
                 transport: Transport | None = None) -> None:
        self.api_key = api_key or os.environ.get(self.env_key, "")
        self.transport = transport or UrllibTransport()

    def send(self, email: OutboundEmail) -> str:
        if not self.api_key:
            raise EspError(f"{self.name}: API 키 미설정 ({self.env_key})")
        resp = self.transport.post(
            f"{self.base}/mail/send",
            json_body={
                "personalizations": [{"to": [{"email": email.to}]}],
                "from": {"email": email.from_addr},
                "reply_to": {"email": email.reply_to},
                "subject": email.subject,
                "content": [{"type": "text/plain", "value": email.body_text}],
            },
            headers={"Authorization": f"Bearer {self.api_key}"},
        )
        if resp.status >= 300:
            raise EspError(f"sendgrid {resp.status}: {resp.body[:200]}")
        return f"sendgrid-{resp.status}"
