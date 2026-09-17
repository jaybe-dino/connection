const params=new URLSearchParams(location.search);
if(params.has('invite')||params.has('magic')) location.replace('/account.html'+location.search);
const isSignup=location.pathname.replace(/\/$/,'')==='/signup';
document.querySelector('#landing').hidden=isSignup;document.querySelector('#signup').hidden=!isSignup;
const api=/^(localhost|127\.0\.0\.1)$/.test(location.hostname)?(params.get('api')||'http://127.0.0.1:8912'):'https://api.theprlist.net';
let learning=null,learnedUrl='',busy=false,autofilled={};
const form=document.querySelector('#applicationForm');
const manual=document.querySelector('#manualEntry');
manual.addEventListener('change',()=>{form.site_url.required=!manual.checked;document.querySelector('#learnButton').disabled=manual.checked;});
const show=(id,message,error=false)=>{const el=document.querySelector(id);el.textContent=message;el.classList.toggle('error',error);};
async function request(path,body){const r=await fetch(api+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(typeof data.detail==='string'?data.detail:'입력 내용을 확인해 주세요.');return data;}
const labels={brand_one_liner:'브랜드 소개',hero_product:'주력 제품',ingredients:'성분·특징',price_range:'가격대',voice:'말투'};
document.querySelector('#siteUrl').addEventListener('input',()=>{if(form.site_url.value.trim()!==learnedUrl){learning=null;show('#learnStatus','주소가 바뀌었습니다. 다시 분석해 주세요.');}});
document.querySelector('#learnButton').addEventListener('click',async()=>{
 if(busy)return;const url=form.site_url.value.trim();if(!form.site_url.reportValidity())return;
 busy=true;learning=null;document.querySelector('#learnButton').disabled=true;show('#learnStatus','공개 페이지를 읽고 브랜드 정보를 분석하고 있습니다…');document.querySelector('#learningResult').replaceChildren();
 try{const result=await request('/brand-learning',{url});if(form.site_url.value.trim()!==url)throw new Error('주소가 바뀌었습니다. 새 주소로 다시 분석해 주세요.');learning=result;learnedUrl=url;
  for(const [key,field] of Object.entries(result.fields)){const box=document.createElement('div');box.className='evidence';const title=document.createElement('strong');title.textContent=(labels[key]||key)+' · '+field.value;const quote=document.createElement('q');quote.textContent=field.evidence;box.append(title,quote);document.querySelector('#learningResult').append(box);if(form.elements[key]&&(!form.elements[key].value||form.elements[key].value===autofilled[key])){form.elements[key].value=field.value;autofilled[key]=field.value;}}
  show('#learnStatus',`분석 완료 · 실제 페이지 ${result.pagesRead}개 · 본문 ${result.charactersRead.toLocaleString()}자\n출처: ${result.sourceUrl}\n아래 근거와 내용을 확인하고 필요한 부분을 수정해 주세요.`);
 }catch(e){show('#learnStatus',e.message,true);}finally{busy=false;document.querySelector('#learnButton').disabled=false;}
});
form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;if(!manual.checked&&(!learning||form.site_url.value.trim()!==learnedUrl)){show('#submitStatus','브랜드 홈페이지 분석을 완료해 주세요.',true);return;}busy=true;document.querySelector('#submitButton').disabled=true;show('#submitStatus','가입 신청을 저장하고 있습니다…');
 try{const available=await request('/brand-slugs/'+encodeURIComponent(form.slug.value.trim()));if(!available.available)throw new Error('이미 사용 중이거나 사용할 수 없는 브랜드 주소입니다.');const answers={};for(const key of ['brand_one_liner','hero_product','ideal_creator','banned_words','sample_criteria','voice'])answers[key]=form.elements[key].value.trim();
 const result=await request('/applications',{slug:form.slug.value.trim(),name:form.elements.name.value.trim(),biz_no:form.biz_no.value,category:form.category.value,countries:[form.country.value],contact:form.contact.value.trim(),site_url:form.site_url.value.trim(),learning_id:manual.checked?null:learning.learningId,answers,plan:'per_signup',terms_accepted:form.terms.checked,profile_confirmed:form.confirmed.checked});
 form.hidden=true;document.querySelector('#success').hidden=false;document.querySelector('#receipt').textContent='접수 번호: '+result.app_id+' · 담당자: '+form.contact.value;document.querySelector('#success').scrollIntoView({behavior:'smooth'});
 }catch(e){show('#submitStatus',e.message,true);}finally{busy=false;document.querySelector('#submitButton').disabled=false;}
});
