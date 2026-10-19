"""Mailbox-scoped correspondence statistics; drafts never count as sent replies."""
from fastapi import HTTPException
from .routes_recruitment import WORKSPACE

FOLDERS={'all':'true','replied':'s.inbound_count>0','needs_reply':'s.needs_reply','unread':'s.unread_count>0','sent_only':'s.outbound_count>0 AND s.inbound_count=0','drafts':'s.draft_count>0','review':'s.review_count>0'}

def account(c,aid):
    if aid is None:return None
    a=c.execute('SELECT account_id,email,state,scopes,synced_at,sync_error,sent_sync_error,sending_paused,pause_reason FROM gmail_accounts WHERE account_id=%s AND brand_id=%s',(aid,WORKSPACE)).fetchone()
    if not a:raise HTTPException(404,'공용 모집 메일 계정이 아닙니다')
    return a

def stats_sql(aid=None):
    return """WITH scoped AS (
      SELECT m.*,lower(trim(t.creator_email)) AS email FROM mail_messages m
      JOIN mail_threads t USING(thread_id) WHERE t.brand_id=%s"""+(' AND m.gmail_account_id=%s' if aid else '')+"""
    ), stats AS (
      SELECT m.email,count(*) FILTER(WHERE direction='in') AS inbound_count,
       count(*) FILTER(WHERE direction='out' AND state='sent') AS outbound_count,
       count(*) FILTER(WHERE direction='out' AND state='pending_gate') AS draft_count,
       count(*) FILTER(WHERE direction='out' AND state IN ('review','sending')) AS review_count,
       count(*) FILTER(WHERE direction='in' AND m.gmail_account_id IS NOT NULL AND m.msg_id>COALESCE(r.last_read_msg_id,0)) AS unread_count,
       bool_or(direction='in' AND NOT EXISTS(SELECT 1 FROM scoped reply WHERE reply.direction='out' AND reply.state='sent' AND reply.gmail_account_id=m.gmail_account_id AND COALESCE(reply.gmail_thread_id,reply.thread_id::text)=COALESCE(m.gmail_thread_id,m.thread_id::text) AND (COALESCE(reply.sent_at,reply.created_at),reply.msg_id)>(m.created_at,m.msg_id))) AS needs_reply,
       max(created_at) FILTER(WHERE direction='in') AS last_inbound_at,
       max(COALESCE(sent_at,created_at)) FILTER(WHERE direction='out' AND state='sent') AS last_sent_at
      FROM scoped m LEFT JOIN recruitment_mailbox_reads r ON r.account_id=m.gmail_account_id AND r.email=m.email
      GROUP BY m.email
    ) """,[WORKSPACE]+([aid] if aid else [])

def listing(c,q,status,owner,offset,limit,aid,folder):
    if folder not in FOLDERS:raise HTTPException(400,'메일함 분류를 확인하세요')
    account(c,aid)
    sql,args=stats_sql(aid)
    rows=c.execute(sql+"""SELECT p.*,s.*,t.subject,t.last_message_at,t.direction AS last_direction,
      (SELECT display_name FROM creator_pool cp WHERE lower(trim(cp.email))=p.email AND cp.state<>'EXCLUDED' ORDER BY cp.creator_id LIMIT 1) AS display_name
      FROM recruitment_contacts p JOIN stats s ON s.email=p.email
      LEFT JOIN LATERAL(SELECT subject,COALESCE(sent_at,created_at) AS last_message_at,direction FROM scoped m WHERE m.email=p.email AND m.state='sent' ORDER BY COALESCE(sent_at,created_at) DESC,msg_id DESC LIMIT 1)t ON true
      WHERE ("""+FOLDERS[folder]+""") AND (%s='' OR p.email ILIKE %s OR EXISTS(SELECT 1 FROM creator_pool cp WHERE lower(trim(cp.email))=p.email AND (cp.display_name ILIKE %s OR cp.handle ILIKE %s)))
      AND (%s='' OR p.status=%s) AND (%s='' OR p.owner_name=%s)
      ORDER BY t.last_message_at DESC NULLS LAST,p.contact_id LIMIT %s OFFSET %s""",args+[q,'%'+q+'%','%'+q+'%','%'+q+'%',status,status,owner,owner,limit+1,offset]).fetchall()
    counts=c.execute(sql+'SELECT '+','.join('count(*) FILTER(WHERE '+cond+') AS "'+name+'"' for name,cond in FOLDERS.items())+' FROM stats s JOIN recruitment_contacts p ON p.email=s.email',args).fetchone()
    return rows,counts
