"""Read-only source audit and normalized private import bundle. Never sends mail."""
import csv
import hashlib
import json
import re
import uuid
from collections import Counter, defaultdict
from pathlib import Path
from api.routes_pool import _normalize_row

ROOT=Path('/Users/jaybe/kbeauty_dataset/zipsrc')
OUT=Path('/Users/jaybe/Documents/Codex/2026-10-11/task-3/outputs/recruitment-setup-20261019')
OUT.mkdir(parents=True,exist_ok=True)
source=ROOT/'03_creators_email_120525.csv'
sha=hashlib.sha256(source.read_bytes()).hexdigest()
links=defaultdict(set)
with (ROOT/'07_creator_brand_product_18511.csv').open(encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        if r['brand_en']:links[r['creator_uid']].add(r['brand_en'])
rows=[];reasons=Counter();countries=Counter();uids=set();emails=set();dupuid=dupemail=0;brandrows=0
quarantine=[]
with source.open(encoding='utf-8-sig') as f:
    for n,r in enumerate(csv.DictReader(f),start=2):
        tags=sorted(links.get(r['uid'],set()))+[v.strip() for v in r['top_products'].split('|') if v.strip()]
        tagtext=';'.join(tags)[:500]
        row=dict(platform='tiktok',platform_uid=r['uid'],handle=r['handle'].lstrip('@'),display_name=r['nickname'],email=r['email'],country=r['region'],lang='',category=r['categories'],product_tags=tagtext,followers=r['followers'],bio='')
        # Optional display fields can be blank; retain the original in private source.
        for k in ('display_name','product_tags'):
            if row[k] and row[k][0] in '= @+-\t\r'.replace(' ',''):row[k]=''
        cand,err=_normalize_row(row,n)
        if err:
            reasons[err]+=1;quarantine.append({'source_line':n,'reason':err});continue
        if cand['platform_uid'] in uids:dupuid+=1;continue
        if cand['email'] in emails:dupemail+=1;continue
        uids.add(cand['platform_uid']);emails.add(cand['email']);countries[cand['country']]+=1
        isbrand=r['is_brand_account']=='1';brandrows+=isbrand
        row['source_meta']={'source_line':n,'is_brand_account':isbrand,'is_brand_account_source':'original CSV flag','metrics_as_of':'2026-08-29 source bundle, not current','sold_90d':r['sold_90d'],'gmv_usd_90d':r['gmv_usd_90d'],'avg_play':r['avg_play'],'brand_links':sorted(links.get(r['uid'],set()))[:20],'language':'unknown, not inferred from country'}
        rows.append(row)
manifest={'job_id':str(uuid.uuid5(uuid.NAMESPACE_URL,'theprlist:company-pool:'+sha)), 'source_name':source.name,'source_sha256':sha,'source_note':'TopView 기반 Air 원본 묶음 2026-08-29. uid→07.creator_uid 명시 매핑. 2026-10-19 사용자 운영 반입 지시 및 광고·제안 수신 허가 진술(개별 동의 증빙 독립 검증 아님). 주소 실존·배달 검증 없음. 언어 추정 없음. 다른 중복 DB 합산 안 함.','expected_rows':len(rows)}
(OUT/'company-pool-import.private.json').write_text(json.dumps({'manifest':manifest,'rows':rows},ensure_ascii=False,separators=(',',':')))
(OUT/'company-pool-quarantine.private.json').write_text(json.dumps(quarantine,ensure_ascii=False,indent=2))
report={'source':str(source),'sha256':sha,'sourceRows':120525,'preparedRows':len(rows),'duplicateUidRows':dupuid,'duplicateEmailRows':dupemail,'quarantinedRows':len(quarantine),'quarantineReasons':dict(reasons),'countries':dict(countries),'sourceFlaggedBrandAccounts':brandrows,'emailVerified':0,'languageKnown':0,'jobId':manifest['job_id'],'stage':'local preparation only'}
(OUT/'company-pool-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
