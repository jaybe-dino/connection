"""Pure CSV validation. No database, network or outbound side effects."""
import csv
import io
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit

STATES = {s.lower(): s for s in (
    'INVITED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SHIPPED', 'DELIVERED',
    'SETTLED', 'RETURNED', 'LOST')}
STATES['posted'] = 'CONTENT_POSTED'
TIMES = {'INVITED': 'invited_at', 'ACCEPTED': 'accepted_at',
         'SHIPPED': 'shipped_at', 'DELIVERED': 'delivered_at',
         'CONTENT_POSTED': 'content_at'}
RANK = {'DRAFT': 0, 'READY': 0, 'INVITED': 1, 'ACCEPTED': 2,
        'SHIPPED': 3, 'DELIVERED': 4, 'NO_CONTENT': 4,
        'CONTENT_POSTED': 5, 'SETTLED': 6}


def parse_results(data: bytes) -> list[dict]:
    if len(data) > 262144:
        raise ValueError('CSV는 256KB 이하만 허용합니다')
    try:
        reader = csv.DictReader(io.StringIO(data.decode('utf-8-sig')), strict=True)
        if not reader.fieldnames or 'status' not in reader.fieldnames or not (
                {'handle', 'creator_username'} & set(reader.fieldnames)):
            raise ValueError('handle 또는 creator_username, status 열이 필요합니다')
        if len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError('중복된 열 이름은 허용하지 않습니다')
        rows, seen = [], set()
        for line, raw in enumerate(reader, 2):
            if len(rows) >= 500:
                raise ValueError('한 번에 500행 이하만 허용합니다')
            if None in raw:
                raise ValueError(f'{line}행: 열 개수가 맞지 않습니다')
            handle = (raw.get('handle') or raw.get('creator_username') or '').strip().lstrip('@').lower()
            state = STATES.get((raw.get('status') or '').strip().lower())
            if not handle or not state or handle in seen:
                raise ValueError(f'{line}행: 핸들/상태가 없거나 중복되었습니다')
            seen.add(handle)
            row = {'handle': handle, 'state': state, 'line': line}
            for key in ('tracking_no', 'content_url'):
                value = (raw.get(key) or '').strip()
                if len(value) > 500 or any(ord(c) < 32 for c in value):
                    raise ValueError(f'{line}행: {key} 형식 오류')
                if value:
                    row[key] = value
            if row.get('content_url'):
                url = urlsplit(row['content_url'])
                if url.scheme != 'https' or not url.hostname or url.username or url.password or any(c.isspace() for c in row['content_url']):
                    raise ValueError(f'{line}행: 콘텐츠 URL은 정상적인 https 주소여야 합니다')
            if (raw.get('gmv') or '').strip():
                try:
                    value = Decimal(raw['gmv'])
                    if not value.is_finite() or value < 0 or value > Decimal('1000000000000'):
                        raise InvalidOperation()
                except InvalidOperation:
                    raise ValueError(f'{line}행: GMV는 유한한 0 이상의 숫자여야 합니다') from None
                row['gmv'] = value
            if (raw.get('occurred_at') or '').strip():
                try:
                    at = datetime.fromisoformat(raw['occurred_at'].strip().replace('Z', '+00:00'))
                    if at.tzinfo is None or at > datetime.now(timezone.utc):
                        raise ValueError()
                except ValueError:
                    raise ValueError(f'{line}행: occurred_at은 시간대가 있는 과거 ISO 날짜여야 합니다') from None
                row['occurred_at'] = at
            rows.append(row)
        if not rows:
            raise ValueError('빈 결과 파일입니다')
        return rows
    except (UnicodeError, csv.Error):
        raise ValueError('UTF-8 CSV 형식을 확인하세요') from None


def validate_transition(previous: str, state: str) -> None:
    if previous == state:
        return
    if previous in ('DECLINED', 'EXPIRED', 'RETURNED', 'LOST', 'SETTLED'):
        raise ValueError('종료된 상태의 변경은 별도 정정 검토가 필요합니다')
    if state in RANK and RANK[state] < RANK.get(previous, 0):
        raise ValueError('이전 단계로 되돌리는 결과는 별도 정정 검토가 필요합니다')
