"""Bounded, resumable company DB import and operator-managed brand inventory.

No provider calls, password creation, automatic invitations or send approvals.
"""
import hashlib
import json
import re
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from .auth import require_admin_jwt
from .db import connect, ledger_append
from .routes_pool import _normalize_row

router = APIRouter(prefix='/admin/recruitment/setup', dependencies=[Depends(require_admin_jwt)])


class ImportStart(BaseModel):
    job_id: UUID
    source_name: str = Field(min_length=1, max_length=200)
    source_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    source_note: str = Field(min_length=1, max_length=3000)
    expected_rows: int = Field(ge=1, le=600000)


@router.post('/imports')
def start_import(b: ImportStart, actor: dict = Depends(require_admin_jwt)):
    with connect() as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtextextended('manual-pool-import',0))")
        old=c.execute('SELECT * FROM pool_import_jobs WHERE job_id=%s',(b.job_id,)).fetchone()
        if old:
            if any(old[k] != getattr(b,k) for k in ('source_name','source_sha256','source_note','expected_rows')):
                raise HTTPException(409,'같은 반입 ID의 원본 정보가 다릅니다')
            return old
        r=c.execute('INSERT INTO pool_import_jobs(job_id,source_name,source_sha256,source_note,expected_rows,created_by) VALUES(%s,%s,%s,%s,%s,%s) RETURNING *',
            (b.job_id,b.source_name,b.source_sha256,b.source_note,b.expected_rows,str(actor['sub']))).fetchone()
        ledger_append(c,str(actor['sub']),'POOL_IMPORT_STARTED',str(b.job_id),{'source':b.source_name,'sha256':b.source_sha256,'rows':b.expected_rows})
        return r


@router.get('/imports')
def list_imports():
    with connect() as c:
        return {'jobs':c.execute('SELECT * FROM pool_import_jobs ORDER BY created_at DESC LIMIT 30').fetchall()}


@router.post('/imports/{job_id}/chunks/{index}')
async def import_chunk(job_id: UUID, index: int, request: Request):
    if index < 0 or index > 600000: raise HTTPException(400,'청크 번호 오류')
    raw=bytearray()
    async for part in request.stream():
        raw.extend(part)
        if len(raw)>2_097_152: raise HTTPException(413,'청크는 2MB 이하입니다')
    try:
        rows=json.loads(raw)['rows']
        if not isinstance(rows,list) or not 1<=len(rows)<=1000 or not all(isinstance(r,dict) for r in rows): raise ValueError()
    except Exception: raise HTTPException(400,'rows 객체 배열은 1~1000행입니다') from None
    digest=hashlib.sha256(json.dumps(rows,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
    with connect() as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtextextended('manual-pool-import',0))")
        job=c.execute('SELECT * FROM pool_import_jobs WHERE job_id=%s FOR UPDATE',(job_id,)).fetchone()
        if not job: raise HTTPException(404,'반입 작업 없음')
        old=c.execute('SELECT * FROM pool_import_chunks WHERE job_id=%s AND chunk_index=%s',(job_id,index)).fetchone()
        if old:
            if old['payload_hash']!=digest:raise HTTPException(409,'같은 청크의 내용이 다릅니다')
            return {**old['result'],'replayed':True}
        if job['state']!='importing' or index!=job['next_chunk'] or job['processed_rows']+len(rows)>job['expected_rows']:
            raise HTTPException(409,'반입 상태·순서·전체 행수를 확인하세요')
        counts={'inserted':0,'skipped':0,'errors':0,'excluded':0}; errors=[]; candidates=[]
        keys=set();emails=set()
        for i,r in enumerate(rows):
            cand,err=_normalize_row(r,i)
            if err:
                counts['errors']+=1
                if len(errors)<15: errors.append({'row':job['processed_rows']+i+1,'reason':err})
                continue
            key=(cand['platform'],cand['platform_uid'])
            if key in keys or (cand['email'] and cand['email'] in emails):counts['skipped']+=1;continue
            keys.add(key);emails.add(cand['email']);candidates.append((cand,r.get('source_meta',{})))
        uids=[x[0]['platform_uid'] for x in candidates];mail=[x[0]['email'] for x in candidates if x[0]['email']]
        existing=c.execute('SELECT platform,platform_uid,lower(email) AS email FROM creator_pool WHERE platform_uid=ANY(%s) OR lower(email)=ANY(%s)',(uids,mail)).fetchall()
        knownkeys={(str(x['platform']),x['platform_uid']) for x in existing};knownemails={x['email'] for x in existing if x['email']}
        blocked={r['email'] for r in c.execute('SELECT email FROM outreach_contact_blocks WHERE email=ANY(%s) UNION SELECT lower(email) AS email FROM outreach_optouts WHERE lower(email)=ANY(%s)',(mail,mail)).fetchall()}
        for cand,meta in candidates:
            if (cand['platform'],cand['platform_uid']) in knownkeys or (cand['email'] and cand['email'] in knownemails): counts['skipped']+=1;continue
            if not isinstance(meta,dict) or len(json.dumps(meta,ensure_ascii=False))>3000:meta={}
            excluded=meta.get('is_brand_account') is True or cand['email'] in blocked
            source={'vendor':'TopView/company-import','job_id':str(job_id),'source_file':job['source_name'],'source_sha256':job['source_sha256'],'source_note':job['source_note'],'imported_by':job['created_by'],'source_meta':meta}
            row=c.execute("INSERT INTO creator_pool(platform,platform_uid,handle,display_name,email,country,lang,category,product_tags,followers,bio,email_status,state,sources) VALUES(%s::platform_t,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'none',%s::pool_state_t,%s) ON CONFLICT(platform,platform_uid) DO NOTHING RETURNING creator_id",
                (cand['platform'],cand['platform_uid'],cand['handle'],cand['display_name'],cand['email'],cand['country'],cand['lang'],cand['category'],cand['product_tags'],cand['followers'],cand['bio'],'EXCLUDED' if excluded else 'POOL',json.dumps([source],ensure_ascii=False))).fetchone()
            if row:
                c.execute('INSERT INTO pool_import_members VALUES(%s,%s)',(job_id,row['creator_id']))
                counts['inserted']+=1;counts['excluded']+=int(excluded)
            else:counts['skipped']+=1
        result={**counts,'errorDetails':errors,'processed':job['processed_rows']+len(rows),'nextChunk':index+1,'sent':False}
        c.execute('INSERT INTO pool_import_chunks VALUES(%s,%s,%s,%s)',(job_id,index,digest,json.dumps(result)))
        c.execute("UPDATE pool_import_jobs SET processed_rows=processed_rows+%s,inserted_rows=inserted_rows+%s,skipped_rows=skipped_rows+%s,error_rows=error_rows+%s,next_chunk=next_chunk+1,state=CASE WHEN processed_rows+%s=expected_rows THEN 'complete' ELSE 'importing' END,updated_at=now() WHERE job_id=%s",(len(rows),counts['inserted'],counts['skipped'],counts['errors'],len(rows),job_id))
        if result['processed']==job['expected_rows']:ledger_append(c,job['created_by'],'POOL_IMPORT_COMPLETED',str(job_id),{'rows':result['processed'],'inserted':job['inserted_rows']+counts['inserted']})
        return result


@router.post('/imports/{job_id}/exclude')
def exclude_import(job_id:UUID,actor:dict=Depends(require_admin_jwt)):
    with connect() as c:
        job=c.execute('SELECT * FROM pool_import_jobs WHERE job_id=%s FOR UPDATE',(job_id,)).fetchone()
        if not job:raise HTTPException(404,'반입 작업 없음')
        n=c.execute("UPDATE creator_pool p SET state='EXCLUDED' FROM pool_import_members m WHERE m.job_id=%s AND p.creator_id=m.creator_id AND p.state='POOL'",(job_id,)).rowcount
        c.execute("UPDATE pool_import_jobs SET state='excluded',updated_at=now() WHERE job_id=%s",(job_id,))
        ledger_append(c,str(actor['sub']),'POOL_IMPORT_EXCLUDED',str(job_id),{'excludedUnusedRows':n,'deleted':False})
        return {'excludedUnusedRows':n,'deleted':False}


class BrandSetup(BaseModel):
    brand_id:str=Field(pattern=r'^[a-z][a-z0-9-]{2,39}$')
    name:str=Field(min_length=1,max_length=100)
    company_email:str=Field(pattern=r'^chief\+theprlist-[a-z0-9-]+@dinostudio\.kr$')
    countries:list[str]=Field(default_factory=list,max_length=5)
    owner_name:str=Field(default='',max_length=100)
    source_note:str=Field(min_length=1,max_length=3000)
    missing_fields:list[str]=Field(default_factory=list,max_length=20)
    product_name:str=Field(default='',max_length=120)
    commission_pct:float|None=Field(default=None,ge=0,le=80)


@router.get('/brands')
def setup_brands():
    with connect() as c:
        return {'brands':c.execute("SELECT s.*,b.name,u.password_hash IS NOT NULL AS login_ready,b.suspended_at FROM recruitment_brand_setup s JOIN brands b USING(brand_id) LEFT JOIN users u ON u.email=s.company_email AND u.brand_id=s.brand_id ORDER BY b.name").fetchall(),'emailSent':False}


@router.post('/brands')
def provision_brand(b:BrandSetup,actor:dict=Depends(require_admin_jwt)):
    from .routes_community import ensure_default_cell
    if b.brand_id.startswith('qa-') or b.brand_id in ('admin','api','app','console','dino-recruitment'):raise HTTPException(400,'고객 브랜드 주소 필요')
    if b.company_email!=f'chief+theprlist-{b.brand_id}@dinostudio.kr':raise HTTPException(400,'회사 관리 주소와 브랜드 주소가 다릅니다')
    if any(not re.fullmatch('[A-Z]{2}',v) for v in b.countries):raise HTTPException(400,'국가는 ISO2 코드입니다')
    if any(len(v)>200 for v in b.missing_fields):raise HTTPException(400,'확인 항목이 너무 깁니다')
    with connect() as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtextextended('recruitment:catalog',0))")
        brand=c.execute('SELECT name,is_internal,is_demo FROM brands WHERE brand_id=%s',(b.brand_id,)).fetchone()
        if brand and (brand['name']!=b.name or brand['is_internal'] or brand['is_demo']):raise HTTPException(409,'기존 브랜드 정보와 다릅니다')
        if not brand:
            if c.execute('SELECT 1 FROM brands WHERE lower(name)=lower(%s)',(b.name,)).fetchone():raise HTTPException(409,'동일 브랜드 이름이 있습니다')
            c.execute('INSERT INTO brands(brand_id,name) VALUES(%s,%s)',(b.brand_id,b.name))
        old=c.execute('SELECT kind,brand_id FROM users WHERE email=%s',(b.company_email,)).fetchone()
        if old and (old['kind']!='brand' or old['brand_id']!=b.brand_id):raise HTTPException(409,'계정이 다른 브랜드에 속합니다')
        u=c.execute("INSERT INTO users(kind,email,brand_id) VALUES('brand',%s,%s) ON CONFLICT(email) DO NOTHING RETURNING user_id",(b.company_email,b.brand_id)).fetchone() or c.execute('SELECT user_id FROM users WHERE email=%s',(b.company_email,)).fetchone()
        c.execute("INSERT INTO brand_team_roles(brand_id,user_id,role) VALUES(%s,%s,'owner') ON CONFLICT DO NOTHING",(b.brand_id,u['user_id']))
        ensure_default_cell(c,b.brand_id,b.name)
        c.execute('INSERT INTO recruitment_brand_setup(brand_id,company_email,countries,owner_name,source_note,missing_fields,created_by) VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(brand_id) DO NOTHING',(b.brand_id,b.company_email,b.countries,b.owner_name,b.source_note,b.missing_fields,str(actor['sub'])))
        if not c.execute('SELECT 1 FROM brand_profile_versions WHERE brand_id=%s',(b.brand_id,)).fetchone():
            fields={'countries':{'value':','.join(b.countries),'source':'operator_reference','confirmed':False},'operating_note':{'value':b.source_note,'source':'operator_reference','confirmed':False}}
            c.execute('INSERT INTO brand_profile_versions(brand_id,version,fields,note) VALUES(%s,1,%s,%s)',(b.brand_id,json.dumps(fields),b.source_note))
        product=None
        if b.product_name and b.commission_pct is not None:
            product=c.execute('SELECT product_id FROM brand_products WHERE brand_id=%s AND name=%s',(b.brand_id,b.product_name)).fetchone()
            if not product:
                product=c.execute('INSERT INTO brand_products(brand_id,name,commission_pct) VALUES(%s,%s,%s) RETURNING product_id',(b.brand_id,b.product_name,b.commission_pct)).fetchone()
                fields={'hero_product':{'value':b.product_name,'source':'operator_reference','confirmed':False,'evidence':b.source_note}}
                c.execute('INSERT INTO product_profile_versions(product_id,version,fields,note) VALUES(%s,1,%s,%s)',(product['product_id'],json.dumps(fields),b.source_note))
        ledger_append(c,str(actor['sub']),'COMPANY_MANAGED_BRAND_PREPARED',b.brand_id,{'companyEmail':b.company_email,'source':b.source_note,'sent':False,'termsConfirmed':False})
        return {'brandId':b.brand_id,'companyEmail':b.company_email,'productId':str(product['product_id']) if product else None,'communityUrl':'https://app.theprlist.net/?brand='+b.brand_id,'passwordSet':False,'emailSent':False}


@router.post('/brands/{brand_id}/activation-link')
def prepare_activation(brand_id:str,actor:dict=Depends(require_admin_jwt)):
    """Operator-requested initial setup only. Never reset an existing password."""
    from . import auth
    with connect() as c:
        u=c.execute("SELECT u.* FROM recruitment_brand_setup s JOIN users u ON u.brand_id=s.brand_id AND u.email=s.company_email WHERE s.brand_id=%s AND u.kind='brand' AND u.state='active' FOR UPDATE OF u",(brand_id,)).fetchone()
        if not u:raise HTTPException(404,'회사 관리 브랜드 계정이 없습니다')
        if u['password_hash']:raise HTTPException(409,'이미 비밀번호가 설정되어 있습니다. 기존 비밀번호는 변경하지 않습니다.')
        c.execute("UPDATE auth_tokens SET used_at=now() WHERE user_id=%s AND kind='invite' AND used_at IS NULL",(u['user_id'],))
        raw=auth.one_time_token(c,u['user_id'],'invite',60*72)
        ledger_append(c,str(actor['sub']),'MANAGED_BRAND_ACTIVATION_PREPARED',brand_id,{'emailSent':False,'expiresHours':72})
        return {'url':'https://console.theprlist.net/?invite='+raw,'emailSent':False,'expiresHours':72}


@router.get('/communities')
def communities():
    with connect() as c:
        rows=c.execute("""SELECT b.brand_id,b.name,b.suspended_at,
          s.company_email,s.owner_name,c.cell_id,c.name AS community_name,
          (SELECT count(*) FROM memberships m WHERE m.brand_id=b.brand_id) AS members,
          (SELECT count(*) FROM brand_products p WHERE p.brand_id=b.brand_id AND p.state='active') AS products
          FROM brands b LEFT JOIN recruitment_brand_setup s USING(brand_id)
          LEFT JOIN cells c ON c.cell_id='cell-'||b.brand_id||'-main' AND c.brand_id=b.brand_id
          WHERE NOT b.is_internal AND NOT b.is_demo AND b.brand_id NOT LIKE 'qa-%%' ORDER BY b.name""").fetchall()
        return {'brands':rows,'channels':['chat','tips','notice'],'emailSent':False}


class CommunitySetup(BaseModel):
    name:str=Field(min_length=1,max_length=100)


@router.put('/brands/{brand_id}/community')
def save_community(brand_id:str,b:CommunitySetup,actor:dict=Depends(require_admin_jwt)):
    from .routes_community import ensure_default_cell
    name=b.name.strip()
    if not name:raise HTTPException(400,'방 이름을 입력하세요')
    with connect() as c:
        brand=c.execute('SELECT * FROM brands WHERE brand_id=%s FOR UPDATE',(brand_id,)).fetchone()
        if not brand or brand['is_internal'] or brand['is_demo']:raise HTTPException(404,'고객 브랜드가 없습니다')
        if brand['suspended_at']:raise HTTPException(409,'정지 브랜드는 먼저 운영 검토가 필요합니다')
        cell=ensure_default_cell(c,brand_id,brand['name'])
        c.execute('UPDATE cells SET name=%s WHERE cell_id=%s AND brand_id=%s',(name,cell,brand_id))
        ledger_append(c,str(actor['sub']),'BRAND_COMMUNITY_CONFIGURED',brand_id,{'cellId':cell,'name':name,'membershipChanged':False})
        return {'brandId':brand_id,'cellId':cell,'name':name,'communityUrl':'https://app.theprlist.net/?brand='+brand_id,'emailSent':False}
