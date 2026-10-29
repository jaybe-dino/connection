from datetime import datetime, timezone
import pytest
from api.dispatch_evidence import parse_results,validate_transition

def test_logistics_source_time_is_preserved_and_unknown_not_fabricated():
    rows=parse_results(b'handle,status,occurred_at\na,delivered,2026-10-01T15:00:00+09:00\nb,accepted,\n')
    assert rows[0]['occurred_at']==datetime(2026,10,1,6,tzinfo=timezone.utc)
    assert 'occurred_at' not in rows[1]

@pytest.mark.parametrize('csv',[
 b'handle,status,gmv\na,posted,NaN',b'handle,status,gmv\na,posted,-1',
 b'handle,status,gmv\na,posted,Infinity',b'handle,status\na,nope',
 b'handle,status\na,accepted\n@A,accepted',b'handle,status,occurred_at\na,shipped,2026-10-01',
 b'handle,status,occurred_at\na,shipped,2999-01-01T00:00:00Z',
 b'handle,status,content_url\na,posted,https://user:pass@example.com',
 b'handle,status\na,accepted,extra',b'handle,status\n',b'x'*262145])
def test_operator_rejects_unsafe_or_ambiguous_evidence(csv):
    with pytest.raises(ValueError):parse_results(csv)

def test_finance_zero_gmv_is_valid():
    assert parse_results(b'handle,status,gmv\na,settled,0')[0]['gmv']==0

def test_creator_terminal_or_backward_changes_need_review():
    for previous,state in [('SETTLED','ACCEPTED'),('DELIVERED','INVITED'),('DECLINED','SHIPPED')]:
        with pytest.raises(ValueError):validate_transition(previous,state)
    validate_transition('NO_CONTENT','CONTENT_POSTED')


def test_duplicate_headers_rejected():
    with pytest.raises(ValueError):
        parse_results(b'handle,status,status\ncreator,accepted,shipped')
