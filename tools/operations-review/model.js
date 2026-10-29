/* Offline planning only. No requests, recipient payloads, billing or send actions. */
(function(root,factory){const m=factory();if(typeof module==='object')module.exports=m;else root.OpsModel=m;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function number(v,name,min=0,max=1e12){if(v===null||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))||Number(v)<min||Number(v)>max)throw Error(name+' 값을 확인하세요');return Number(v);}
function integer(v,name,min=0,max=1e9){const n=number(v,name,min,max);if(!Number.isInteger(n))throw Error(name+'은 정수여야 합니다');return n;}
function forecast(p){
 const target=integer(p.target,'월 고유 운영 목표',1),retained=integer(p.retained,'유지·재활성 고유 인원'),conversion=number(p.conversion,'신규 접촉→운영 전환율',0,100)/100;
 if(retained>target)throw Error('유지 인원은 목표보다 클 수 없습니다');
 const needed=target-retained, contacts=needed===0?0:conversion===0?null:Math.ceil(needed/conversion);
 const available=p.available===''||p.available==null?null:integer(p.available,'검증·연락 가능 고유 인원');
 const billable=integer(p.billable,'신규 검증 브랜드 가입 건수'),unit=number(p.unit,'가입 단가'),costPerContact=number(p.costPerContact,'접촉 직접비'),sampleCount=integer(p.sampleCount,'샘플 건수'),sampleCost=number(p.sampleCost,'샘플·배송 건당비'),hours=number(p.hours,'운영 시간'),hourly=number(p.hourly,'시간당 인건비'),fixed=number(p.fixed,'기타 고정비');
 const gross=billable*unit,net=p.vatIncluded===true?gross/1.1:gross;
 const cost=contacts===null?null:contacts*costPerContact+sampleCount*sampleCost+hours*hourly+fixed;
 const replyLoad=contacts===null?null:Math.ceil(contacts*number(p.replyRate,'회신율',0,100)/100);
 const replyCapacity=integer(p.replyCapacity,'월 회신 처리 건수'),shipCapacity=integer(p.shipCapacity,'월 출고 처리 건수'),reviewCapacity=integer(p.reviewCapacity,'월 콘텐츠 검수 건수'),contentCount=integer(p.contentCount,'검수 대상 콘텐츠 수');
 const blockers=[];
 if(contacts===null)blockers.push('전환율 0%: 신규 목표 달성 경로 없음');
 if(available===null)blockers.push('연락 가능한 고유 공급량 미확인');else if(contacts!==null&&contacts>available)blockers.push('신규 공급 부족');
 if(replyLoad!==null&&replyLoad>replyCapacity)blockers.push('회신 처리 용량 부족');
 if(sampleCount>shipCapacity)blockers.push('출고 용량 부족');if(contentCount>reviewCapacity)blockers.push('검수 용량 부족');
 if(cost!==null&&net<cost)blockers.push('입력한 비용 기준 기여이익 적자');
 return {target,needed,contacts,available,billable,gross,net,cost,contribution:cost===null?null:net-cost,replyLoad,blockers};
}
function readiness(b){const labels={contract:'목표·계약',product:'상품·링크',offer:'협업 조건',stock:'재고·물류',guide:'가이드·주장 검수',owner:'담당·처리 용량',basis:'접촉 근거·거부 관리'};const missing=Object.keys(labels).filter(k=>b[k]!==true).map(k=>labels[k]);return {ready:!missing.length,missing};}
function metrics(events,from,to,brand){
 const begin=new Date(from),end=new Date(to);if(!Number.isFinite(+begin)||!Number.isFinite(+end)||begin>=end)throw Error('집계 기간 오류');
 const seen=new Map(),stages=['attempted','delivered','replied','applied','confirmed','shipped','received','posted','sold'],out={};
 for(const e of events){if(!e.id||!e.creator||!e.brand||!e.campaign||!stages.includes(e.stage))throw Error('이벤트 식별자·단계 누락');if(seen.has(e.id)&&JSON.stringify(seen.get(e.id))!==JSON.stringify(e))throw Error('같은 이벤트 ID의 내용 충돌');seen.set(e.id,e);}
 const rows=[...seen.values()].filter(e=>{if(e.at==null)return false;const d=new Date(e.at);if(!Number.isFinite(+d)||!/([zZ]|[+-]\d\d:\d\d)$/.test(e.at))throw Error('사건 시각·시간대 오류');return d>=begin&&d<end&&(!brand||e.brand===brand);});
 for(const stage of stages){const r=rows.filter(e=>e.stage===stage);out[stage]={events:r.length,unique:new Set(r.map(e=>e.creator)).size,memberships:new Set(r.map(e=>JSON.stringify([e.brand,e.campaign,e.creator]))).size};}
 return out;
}
function match(creator,campaign){
 if(!Array.isArray(creator.categories)||!Number.isInteger(creator.active)||!Number.isInteger(creator.capacity)||creator.active<0||creator.capacity<1||creator.optout||creator.crossBrandPermission!==true||creator.country!==campaign.country||!creator.categories.includes(campaign.category)||creator.active>=creator.capacity)return {eligible:false,reason:'동의·국가·상품 적합성·참여 용량 중 미충족'};
 return {eligible:true,reason:'후보 추천만 가능; 신규 브랜드 가입·합의는 별도'};
}
return {forecast,readiness,metrics,match};});
