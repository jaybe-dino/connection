export const emptyFilters={count_per_brand:100,countries:'',categories:'Beauty & Personal Care',tags:'',min_followers:10000,max_followers:1000000,audience:'new',allow_unverified:false,evidence_only:true};
export function chooseUniqueCohorts(results:any[],count:number,evidenceOnly:boolean){
 const emails=new Set<string>(),identities=new Set<string>();
 return results.map(r=>{
  const picked:any[]=[];let shared=0;
  for(const candidate of r.candidates){
   const email=candidate.email.trim().toLowerCase(),identity=candidate.identityKey||candidate.candidateId;
   if(evidenceOnly&&!candidate.matchedTerms)continue;
   if(emails.has(email)||identities.has(identity)){shared++;continue;}
   if(picked.length>=count)break;
   emails.add(email);identities.add(identity);picked.push({...candidate,email});
  }
  return {...r,candidates:picked,sharedSkipped:shared};
 });
}
export function cohortRequest(filters:typeof emptyFilters,country:string){
 return {countries:(filters.countries||country||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean),languages:[],categories:filters.categories.split(',').map(x=>x.trim()).filter(Boolean),tags:filters.tags.split(',').map(x=>x.trim()).filter(Boolean),min_followers:filters.min_followers,max_followers:filters.max_followers,limit:1000,allow_unverified:filters.allow_unverified,audience:filters.audience};
}
export function proposalBody(m:any,edit:any={}){
 const keys=['name','target_brand_id','product_id','gmail_account_id','owner_name','campaign_id','country','language','subject','body','note','revision'];
 return {...Object.fromEntries(keys.map(k=>[k,m[k]])),...edit,state:'active'};
}
export function recipientIntro(candidate:any,mapping:any){
 if(typeof candidate.publicIntro==='string')return candidate.publicIntro.replace(/[\r\n\t]/g,' ').trim().slice(0,1000);
 const language=(mapping?.language||'').toLowerCase();
 if(language==='english'||language==='en')return `Would you be interested in a ${mapping.product_name} collaboration with ${mapping.brand_name}?`;
 if(language==='vietnamese'||language==='vi')return `Bạn có quan tâm đến việc hợp tác với ${mapping.brand_name} về sản phẩm ${mapping.product_name} không?`;
 if(language==='thai'||language==='th')return `คุณสนใจร่วมงานกับ ${mapping.brand_name} สำหรับผลิตภัณฑ์ ${mapping.product_name} หรือไม่?`;
 return `${mapping?.brand_name||'브랜드'}의 ${mapping?.product_name||'제품'} 협업에 관심이 있으실까요?`;
}
export function nextPreparationDate(value:string,cadence:string){
 const [y,m,d]=value.split('-').map(Number);
 const date=cadence==='weekly'?new Date(Date.UTC(y,m-1,d+7)):new Date(Date.UTC(y,m,Math.min(d,new Date(Date.UTC(y,m+1,0)).getUTCDate())));
 return date.toISOString().slice(0,10);
}
