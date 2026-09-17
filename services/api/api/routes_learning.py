import hashlib
import json
import re
from uuid import UUID
from fastapi import APIRouter,HTTPException,Request,Header
from pydantic import BaseModel,Field
from . import brand_learning,auth
from .db import connect
router=APIRouter()

class LearnIn(BaseModel):
    url:str=Field(min_length=4,max_length=2000)

@router.post('/brand-learning')
def learn(body:LearnIn,request:Request):
    client_hash=hashlib.sha256((auth._secret()+(request.client.host if request.client else 'unknown')).encode()).hexdigest()
    with connect() as c:
        c.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',(client_hash,))
        count=c.execute("SELECT count(*) AS n FROM brand_learning WHERE client_hash=%s AND created_at>now()-interval '1 day'",(client_hash,)).fetchone()['n']
        if count>=10:raise HTTPException(429,'오늘 분석 한도에 도달했습니다. 내일 다시 시도하세요.')
        rid=c.execute('INSERT INTO brand_learning(client_hash,source_url) VALUES(%s,%s) RETURNING learning_id',(client_hash,body.url)).fetchone()['learning_id']
    try:
        url,title,text=brand_learning.read_page(body.url.strip())
        fields=brand_learning.extract(text)
        for field in fields.values():field["source_url"]=url
    except Exception as e:
        with connect() as c:c.execute("UPDATE brand_learning SET state='failed' WHERE learning_id=%s",(rid,))
        raise HTTPException(503 if isinstance(e,brand_learning.LearningUnavailable) else 422 if isinstance(e,brand_learning.LearningError) else 502,str(e) if isinstance(e,brand_learning.LearningError) else '분석 서비스가 응답하지 않았습니다. 잠시 후 다시 시도하세요.')
    with connect() as c:c.execute("UPDATE brand_learning SET state='ready',fields=%s,source_url=%s,page_title=%s,extracted_chars=%s WHERE learning_id=%s",(json.dumps(fields,ensure_ascii=False),url,title,len(text),rid))
    return {'learningId':str(rid),'fields':fields,'sourceUrl':url,'pageTitle':title,'pagesRead':1,'charactersRead':len(text)}

@router.get('/brand-slugs/{slug}')
def slug_check(slug:str):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{2,39}',slug) or slug in {'www','api','admin','app','console','signup','privacy','terms'}:
        return {'available':False}
    with connect() as c:
        taken=c.execute("SELECT 1 FROM brands WHERE brand_id=%s UNION SELECT 1 FROM brand_applications WHERE slug=%s AND status='pending'",(slug,slug)).fetchone()
    return {'available':not bool(taken)}

class ProfileIn(BaseModel):
    learning_id:UUID|None=None
    answers:dict[str,str]=Field(default_factory=dict)

@router.post('/brands/{brand}/profile/learned')
def save_profile(brand:str,body:ProfileIn,authorization:str=Header(default='')):
    u=auth.current_user(authorization)
    if not u or u.get('otp')=='pending':raise HTTPException(401,'로그인이 필요합니다')
    auth.require_brand(brand,authorization,'')
    with connect() as c:
        c.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('profile:'+brand,))
        if not c.execute('SELECT 1 FROM brands WHERE brand_id=%s',(brand,)).fetchone():raise HTTPException(404,'브랜드를 찾을 수 없습니다')
        row=c.execute("SELECT fields FROM brand_learning WHERE learning_id=%s AND state='ready'",(body.learning_id,)).fetchone() if body.learning_id else None
        if body.learning_id and not row:raise HTTPException(400,'완료된 학습 결과가 필요합니다')
        if not row and not any(v.strip() for v in body.answers.values()):raise HTTPException(400,'분석 결과나 직접 입력한 브랜드 정보가 필요합니다')
        previous=c.execute('SELECT fields FROM brand_profile_versions WHERE brand_id=%s ORDER BY version DESC LIMIT 1',(brand,)).fetchone()
        fields=dict((previous or {}).get('fields') or {})
        fields.update((row or {}).get('fields') or {})
        for k,v in body.answers.items():
            if k in {'brand_one_liner','hero_product','ingredients','price_range','ideal_creator','banned_words','sample_criteria','voice'} and v.strip():
                old=fields.get(k,{})
                fields[k]={**(old if isinstance(old,dict) and old.get('value')==v else {}),'value':v[:2000],'source':'brand_confirmed','confirmed':True}
        version=c.execute('SELECT COALESCE(max(version),0)+1 AS v FROM brand_profile_versions WHERE brand_id=%s',(brand,)).fetchone()['v']
        c.execute('INSERT INTO brand_profile_versions(brand_id,version,fields,note) VALUES(%s,%s,%s,%s)',(brand,version,json.dumps(fields,ensure_ascii=False),'website + brand answers'))
    return {'saved':True,'version':version,'fields':fields}

@router.get('/brands/{brand}/profile/learned')
def get_profile(brand:str,authorization:str=Header(default='')):
    u=auth.current_user(authorization)
    if not u or u.get('otp')=='pending':raise HTTPException(401,'로그인이 필요합니다')
    auth.require_brand(brand,authorization,'')
    with connect() as c:
        row=c.execute('SELECT version,fields FROM brand_profile_versions WHERE brand_id=%s ORDER BY version DESC LIMIT 1',(brand,)).fetchone()
    return row or {'version':0,'fields':{}}
