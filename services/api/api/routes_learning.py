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
    slug=slug.strip().lower()
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{2,39}',slug):
        return {'available':False,'reason':'invalid','slug':slug}
    if slug in {'www','api','admin','app','console','signup','privacy','terms'}:
        return {'available':False,'reason':'reserved','slug':slug}
    with connect() as c:
        if c.execute('SELECT 1 FROM brands WHERE brand_id=%s',(slug,)).fetchone():
            return {'available':False,'reason':'registered','slug':slug}
        if c.execute("SELECT 1 FROM brand_applications WHERE slug=%s AND status='pending'",(slug,)).fetchone():
            return {'available':False,'reason':'pending','slug':slug}
    return {'available':True,'reason':'available','slug':slug}

# 브랜드 프로필 답변 키 — v8.1 브랜드 학습(B02) 추가 키: homepage·countries·usp·faq(JSON 문자열)
BRAND_KEYS={'brand_one_liner','hero_product','ingredients','price_range','ideal_creator','banned_words','sample_criteria','voice',
            'homepage','countries','usp','faq'}

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
        previous=c.execute('SELECT fields FROM brand_profile_versions WHERE brand_id=%s ORDER BY version DESC LIMIT 1',(brand,)).fetchone()
        fields=dict((previous or {}).get('fields') or {})
        fields.update((row or {}).get('fields') or {})
        answers={k:v.strip()[:2000] for k,v in body.answers.items() if k in BRAND_KEYS}
        if answers.get('homepage') and not re.fullmatch(r"https://[^\s\"'<>]{4,480}",answers['homepage']):raise HTTPException(400,'홈페이지는 https:// 주소로 적어 주세요')
        if answers.get('countries') and not set(x.strip() for x in answers['countries'].split(',') if x.strip())<={'KR','TH','US','VN','JP'}:raise HTTPException(400,'운영 국가를 확인하세요')
        if answers.get('faq'):
            try:
                faq=json.loads(answers['faq']);assert isinstance(faq,list) and len(faq)<=30 and all(isinstance(x,dict) and isinstance(x.get('q',''),str) and isinstance(x.get('a',''),str) for x in faq)
            except Exception:raise HTTPException(400,'FAQ 형식을 확인하세요')
        if not row and not any(v or k in fields for k,v in answers.items()):raise HTTPException(400,'분석 결과나 직접 입력한 브랜드 정보가 필요합니다')
        for k,v in answers.items():
            if v:
                old=fields.get(k,{})
                fields[k]={**(old if isinstance(old,dict) and old.get('value')==v else {}),'value':v,'source':'brand_confirmed','confirmed':True}
            else:
                fields.pop(k,None)
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
