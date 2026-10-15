import { useEffect, useRef, useState } from 'react';
import { adminApi } from '../adminApi';
import './Recruitment.css';

type Workspace = {brandId:string;name:string;internal:boolean};
type Form = {name:string;target_brand_id:string;product_id:string;gmail_account_id:string|null;owner_name:string;country:string;language:string;state:string;subject:string;body:string;note:string;revision:number};
const empty:Form={name:'',target_brand_id:'',product_id:'',gmail_account_id:null,owner_name:'',country:'',language:'',state:'draft',subject:'{{name}}님, {{brand}}의 {{product}} 협업 제안',body:'{{reason}}\n\n제품과 협업 조건을 확인한 뒤 참여 의사를 알려주세요.',note:'',revision:1};
const states:Record<string,string>={draft:'준비',active:'활성',paused:'새 초안 중지',archived:'보관'};
const deliveryStates:Record<string,string>={draft:'초안',approved:'승인됨',cancelled:'취소됨',pending:'대기',sending:'전송 중',sent:'발송 성공',review:'결과 확인 필요',blocked:'제외'};
const exclusions:Record<string,string>={duplicate_row:'명단 내 중복',mapping_conflict:'제품 배정 충돌',opted_out:'수신거부',recent_contact:'최근 연락 이력',reserved_draft_or_queue:'기존 초안·대기열에 포함'};
const box={background:'white',border:'1px solid var(--n300)',borderRadius:12,padding:18,marginBottom:16};
const input={width:'100%',padding:8,boxSizing:'border-box' as const,border:'1px solid var(--n300)',borderRadius:6};

export default function Recruitment(){
 const [workspace,setWorkspace]=useState<Workspace|null>(null),[loaded,setLoaded]=useState(false);
 const [options,setOptions]=useState<any>({brands:[],products:[],accounts:[]}),[items,setItems]=useState<any[]>([]);
 const [selected,setSelected]=useState<string>(''),[form,setForm]=useState<Form>({...empty}),[dirty,setDirty]=useState(false);
 const [filter,setFilter]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [rowsText,setRowsText]=useState(''),[preview,setPreview]=useState<any>(null),[batches,setBatches]=useState<any[]>([]),[review,setReview]=useState<any>(null);
 const requestId=useRef(''),generation=useRef(0);
 async function load(){const w=await adminApi.recruitmentWorkspace();setWorkspace(w.workspace);if(w.workspace){const [o,m]=await Promise.all([adminApi.recruitmentOptions(),adminApi.recruitmentMappings()]);setOptions(o);setItems(m.mappings);}setLoaded(true);}
 useEffect(()=>{load().catch(e=>setError(String(e)));return()=>{generation.current++;};},[]);
 async function action(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(String(e));}finally{setBusy(false);}}
 function change(key:keyof Form,value:any){setForm(f=>({...f,[key]:value,...(key==='target_brand_id'?{product_id:''}:{})}));setDirty(true);setPreview(null);requestId.current='';}
 async function select(item?:any){const seq=++generation.current;setSelected(item?.mapping_id||'');setForm(item?Object.fromEntries(Object.keys(empty).map(k=>[k,item[k]])) as Form:{...empty});setDirty(false);setRowsText('');setPreview(null);setReview(null);setBatches([]);setNotice('');requestId.current='';if(item){try{const r=await adminApi.recruitmentBatches(item.mapping_id);if(seq===generation.current)setBatches(r.batches);}catch(e){if(seq===generation.current)setError(String(e));}}}
 function rows(){return rowsText.split(/\r?\n/).filter(l=>l.trim()).map((line,i)=>{const [email,name='',reason='',...extra]=line.split('\t');if(extra.length)throw new Error(`${i+1}행: 이메일·이름·선정 이유 3개 열로 입력하세요`);return {email:email.trim(),name,reason,mapping_key:selected};});}
 const visible=items.filter(x=>!filter||[x.name,x.brand_name,x.product_name,x.sender_email,x.owner_name].some(v=>String(v||'').toLowerCase().includes(filter.toLowerCase())));
 return <section className="recruitment" style={{maxWidth:1200,lineHeight:1.6}}>
  <h1>디노 공용 모집</h1>{/^(localhost|127\.0\.0\.1)$/.test(location.hostname)&&<p role="note">로컬 개발 검수 화면 · 운영 사이트 반영 전</p>}<p>공용 발신 계정 → 고객 브랜드·제품 매핑 → 대상 검수 → 개인별 초안 → 별도 승인</p>
  {error&&<p role="alert" style={{color:'#a22',whiteSpace:'pre-wrap'}}>{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!loaded?<p>공간 상태를 확인하고 있습니다.</p>:!workspace?<div style={box}><p>내부 모집 공간을 생성합니다. 메일 발송·연락처 반입·가입 과금은 실행하지 않습니다.</p><button disabled={busy} onClick={()=>action(async()=>{await adminApi.createRecruitmentWorkspace();await load();})}>디노 공용 모집 공간 생성</button></div>:<>
  <div style={box}><b>{workspace.name}</b> · 내부 운영 · 고객 가입 과금 제외<br/><a href="https://console.theprlist.net" target="_blank" rel="noopener noreferrer">브랜드 콘솔에서 공용 모집 공간 선택·Gmail 연결</a><p>연결된 계정 {options.accounts.length}개 · 제품 매핑 {items.length}개. 비밀번호는 저장하지 않고 Google OAuth 연결을 사용합니다.</p><button disabled={busy} onClick={()=>action(load)}>새로고침</button></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:16}}>
   <div style={box}><h2>제품별 매핑 목록</h2><input aria-label="매핑 검색" placeholder="브랜드·제품·담당자·발신 주소 검색" style={input} value={filter} onChange={e=>setFilter(e.target.value)}/><button disabled={busy} onClick={()=>void select()}>새 매핑</button>
    {visible.map(x=><button key={x.mapping_id} disabled={busy} onClick={()=>void select(x)} style={{display:'block',width:'100%',textAlign:'left',padding:12,marginTop:8,border:selected===x.mapping_id?'2px solid #946146':'1px solid #ddd',borderRadius:8,background:'white'}}><b>{x.name}</b> · {states[x.state]}<br/>{x.brand_name} / {x.product_name}<br/>{x.sender_email||'발신자 연결 대기'} · {x.owner_name||'담당 미지정'}<br/>{x.country||'국가 미지정'} · {x.language||'언어 미지정'} · 배치 {x.batch_count}개</button>)}
    {!visible.length&&<p>저장된 매핑이 없습니다. 제품을 먼저 등록한 뒤 매핑을 만드세요.</p>}
   </div>
   <div style={box}><h2>{selected?'매핑 개별 관리':'새 제품 매핑'}</h2><fieldset disabled={busy} style={{border:0,padding:0}}>
    <label>매핑 이름<input style={input} value={form.name} onChange={e=>change('name',e.target.value)}/></label>
    <label>고객 브랜드<select style={input} value={form.target_brand_id} onChange={e=>change('target_brand_id',e.target.value)}><option value="">브랜드 선택</option>{options.brands.map((x:any)=><option key={x.brand_id} value={x.brand_id}>{x.name}</option>)}</select></label>
    <label>제품<select style={input} value={form.product_id} onChange={e=>change('product_id',e.target.value)}><option value="">제품 선택</option>{options.products.filter((x:any)=>x.brand_id===form.target_brand_id).map((x:any)=><option key={x.product_id} value={x.product_id}>{x.name}</option>)}</select></label>
    <label>공용 발신 계정<select style={input} value={form.gmail_account_id||''} onChange={e=>change('gmail_account_id',e.target.value||null)}><option value="">연결 후 지정 (준비 상태 저장 가능)</option>{options.accounts.map((x:any)=><option key={x.account_id} value={x.account_id}>{x.email} · {x.state}{x.sending_paused?' · 발송 중지':''}</option>)}</select></label>
    {(['owner_name','country','language'] as const).map((k,i)=><label key={k}>{['담당자','국가','언어'][i]}<input style={input} value={form[k]} onChange={e=>change(k,e.target.value)}/></label>)}
    <label>상태<select style={input} value={form.state} onChange={e=>change('state',e.target.value)}>{Object.entries(states).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <p>상태 변경은 새 초안 생성만 제어합니다. 이미 승인된 배치는 별도로 중지해야 합니다.</p>
    <label>제목<input style={input} value={form.subject} onChange={e=>change('subject',e.target.value)}/></label>
    <label>본문<textarea style={input} rows={6} value={form.body} onChange={e=>change('body',e.target.value)}/></label>
    <small>맞춤 필드: {'{{name}}, {{reason}}, {{brand}}, {{product}}'} · 합류 링크 자동 추가</small><br/>
    <label>내부 메모<textarea style={input} rows={3} value={form.note} onChange={e=>change('note',e.target.value)}/></label>
    <button onClick={()=>action(async()=>{const r=await adminApi.saveRecruitmentMapping(form,selected||undefined);await load();await select(r);setNotice('매핑을 저장했습니다. 발송하지 않았습니다.');})}>매핑 저장</button>
   </fieldset></div>
  </div>
  {selected&&<><div style={box}><h2>이 제품의 대상 검수와 초안</h2><p>이메일 · 이름 · 선정 이유 3개 열을 탭으로 구분해 붙여넣으세요. 헤더 없이 입력하며 최대 10,000행을 검수할 수 있습니다. 검수는 발송이나 운영 DB 반입이 아닙니다.</p>
   <textarea aria-label="검수할 대상" style={input} rows={6} value={rowsText} disabled={busy} onChange={e=>{setRowsText(e.target.value);setPreview(null);requestId.current='';}}/>
   {dirty&&<p>수정한 매핑을 먼저 저장하세요.</p>}
   <button disabled={busy||dirty||form.state!=='active'||!rowsText.trim()} onClick={()=>action(async()=>{const r=await adminApi.previewRecruitment(selected,{rows:rows(),revision:form.revision});setPreview(r);requestId.current=crypto.randomUUID();})}>중복·거부·발신 한도 검수</button>
   {preview&&<><p>입력 {preview.inputCount}행 · 고유 이메일 {preview.uniqueEmailCount}개 · 적격 {preview.eligibleCount}개 · 제외 {preview.excluded.length}개 · 초안 {preview.batchCount}배치</p><p>실인원 확인 수가 아닙니다. 시스템 잔여 한도: {preview.senders.map((s:any)=>s.remainingSystemCapacity).join(', ')} · 제공자 한도·실제 배달 여부 별도</p>
    {preview.excluded.slice(0,30).map((x:any)=><p key={x.row}>{x.row}행 · {exclusions[x.reason]||x.reason}</p>)}
    {preview.groups.flatMap((x:any)=>x.samples).map((x:any)=><div key={x.email} style={{whiteSpace:'pre-wrap',borderTop:'1px solid #ddd',padding:10}}><b>{x.email} · {x.subject}</b><br/>{x.body}</div>)}
    <button disabled={busy||dirty||!preview.eligibleCount} onClick={()=>action(async()=>{const r=await adminApi.draftRecruitment(selected,{rows:rows(),revision:form.revision,request_id:requestId.current,review_hash:preview.reviewHash});setPreview(null);setRowsText('');const b=await adminApi.recruitmentBatches(selected);setBatches(b.batches);await load();setNotice(`초안 ${r.batchIds.length}개 저장 완료. 발송 승인·실제 발송은 실행하지 않았습니다.`);})}>검수한 대상의 초안 저장 · 발송 없음</button>
   </>}
  </div>
  <div style={box}><h2>이 매핑의 배치 개별 관리</h2><p>최근 100개 배치. 발송 성공은 배달·회신·신청·참여·배송·게시·판매를 의미하지 않습니다. 과거 배치는 생성 당시 브랜드·상품·발신자 정보를 유지합니다.</p>
   {batches.map(b=><div key={b.batch_id} style={{borderTop:'1px solid #ddd',padding:10}}><b>{b.product_name}</b> · {b.sender_email} · {deliveryStates[b.state]||b.state}{b.sending_paused?' · 중지':''}<br/>수신 주소 {b.recipient_count} · 발송 {b.sent_count} · 미발송 주소 {b.pending_count} · 확인 필요 {b.review_count} · 제외 {b.blocked_count}<br/><button disabled={busy} onClick={()=>action(async()=>{setReview(await adminApi.reviewRecruitmentBatch(b.batch_id));})}>개별 수신자·문안 확인</button> {b.state==='draft'&&<button disabled={busy} onClick={()=>action(async()=>{await adminApi.cancelRecruitmentBatch(b.batch_id);setBatches((await adminApi.recruitmentBatches(selected)).batches);setReview(null);setNotice('초안을 취소했습니다. 발송하지 않았습니다.');})}>초안 취소</button>} {b.state==='approved'&&!b.sending_paused&&<button disabled={busy} onClick={()=>action(async()=>{await adminApi.pauseRecruitmentBatch(b.batch_id);setBatches((await adminApi.recruitmentBatches(selected)).batches);setNotice('배치를 중지했습니다. 이미 전송 중인 메일은 되돌릴 수 없습니다.');})}>이 배치 중지</button>}</div>)}
   {!batches.length&&<p>생성된 배치가 없습니다.</p>}
   {review&&<div><h3>배치 {review.id}</h3>{review.messages.map((m:any)=><details key={m.email}><summary>{m.email} · {deliveryStates[review.recipients.find((r:any)=>r.email===m.email)?.state]||'미확인'}</summary><b>{m.subject}</b><pre style={{whiteSpace:'pre-wrap'}}>{m.body}</pre></details>)}</div>}
  </div></>}
  </>}
 </section>;
}
