"""Independent launch regressions: whitespace and URL validation."""
import pytest
from pydantic import ValidationError
from api.routes_collab import TrackingIn, SparkIn, ContentIn, LinkIn

@pytest.mark.parametrize('cls,field,value',[(TrackingIn,'tracking','   '),(SparkIn,'spark_code','    '),
    (ContentIn,'content_url','https://'),(ContentIn,'content_url','https://user:pass@example.com/x'),
    (ContentIn,'content_url','https://example.com/\nx'),(LinkIn,'link','https:// bad'),
    (LinkIn,'link','https://example.com:bad/x')])
def test_reject_unusable_fulfillment_evidence(cls,field,value):
    with pytest.raises(ValidationError): cls(**{field:value})


def test_fulfillment_values_are_trimmed():
    assert TrackingIn(tracking='  QA123  ').tracking == 'QA123'
    assert SparkIn(spark_code='  QA-code  ').spark_code == 'QA-code'
    assert ContentIn(content_url=' https://example.com/content ').content_url == 'https://example.com/content'
