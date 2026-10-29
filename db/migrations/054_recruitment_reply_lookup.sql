-- Exact Gmail-conversation reply lookup for large recipient lists.
CREATE INDEX mail_messages_incoming_conversation ON mail_messages
(gmail_account_id,gmail_thread_id,created_at,msg_id)
WHERE direction='in' AND state='sent' AND gmail_thread_id IS NOT NULL;
