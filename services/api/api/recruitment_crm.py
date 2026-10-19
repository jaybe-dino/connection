"""Company contact records. Exact email grouping only, never implicit person merges."""
from .routes_recruitment import WORKSPACE

def register_known_threads(c):
    return c.execute("""INSERT INTO recruitment_contacts(email)
      SELECT DISTINCT lower(trim(t.creator_email)) FROM mail_threads t
      WHERE t.brand_id=%s AND t.creator_email LIKE '%%@%%'
      AND EXISTS(SELECT 1 FROM mail_messages m WHERE m.thread_id=t.thread_id AND m.direction='out' AND m.state='sent' AND m.gmail_account_id IS NOT NULL)
      ON CONFLICT(email) DO NOTHING""",(WORKSPACE,)).rowcount
