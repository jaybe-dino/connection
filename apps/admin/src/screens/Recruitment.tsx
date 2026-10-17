import { useEffect, useRef, useState } from 'react';
import { adminApi } from '../adminApi';
import './Recruitment.css';
import DistributedRecruitment from './DistributedRecruitment';

type Workspace = {brandId:string;name:string;internal:boolean};
type Form = {campaign_id:string|null;name:string;target_brand_id:string;product_id:string;gmail_account_id:string|null;owner_name:string;country:string;language:string;state:string;subject:string;body:string;note:string;revision:number};
const empty:Form={campaign_id:null,name:'',target_brand_id:'',product_id:'',gmail_account_id:null,owner_name:'',country:'',language:'',state:'draft',subject:'{{name}}님, {{brand}}의 {{product}} 협업 제안',body:'{{reason}}\n\n제품과 협업 조건을 확인한 뒤 참여 의사를 알려주세요.',note:'',revision:1};
const states:Record<string,string>={draft:'준비',active:'활성',paused:'새 초안 중지',archived:'보관'};
const deliveryStates:Record<string,string>={draft:'초안',approved:'승인됨',cancelled:'취소됨',pending:'대기',sending:'전송 중',sent:'발송 성공',review:'결과 확인 필요',blocked:'제외'};
const exclusions:Record<string,string>={duplicate_row:'명단 내 중복',mapping_conflict:'제품 배정 충돌',opted_out:'수신거부',recent_contact:'최근 연락 이력',reserved_draft_or_queue:'기존 초안·대기열에 포함',sender_mismatch:'기존 대화 발신자와 불일치'};
const box={background:'white',border:'1px solid var(--n300)',borderRadius:12,padding:18,marginBottom:16};
const input={width:'100%',padding:8,boxSizing:'border-box' as const,border:'1px solid var(--n300)',borderRadius:6};

export default function Recruitment(){
 const [workspace,setWorkspace]=useState<Workspace|null>(null),[loaded,setLoaded]=useState(false);
 const [options,setOptions]=useState<any>({brands:[],products:[],accounts:[],campaigns:[]}),[items,setItems]=useState<any[]>([]);
 const [selected,setSelected]=useState<string>(''),[form,setForm]=useState<Form>({...empty}),[dirty,setDirty]=useState(false);
 const [applications,setApplications]=useState<any[]>([]);
 const [filter,setFilter]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [rowsText,setRowsText]=useState(''),[preview,setPreview]=useState<any>(null),[batches,setBatches]=useState<any[]>([]),[review,setReview]=useState<any>(null),[sendConsent,setSendConsent]=useState(false);
 const [catalog,setCatalog]=useState({brand_id:'',brand_name:'',product_name:'',commission_pct:'',source_note:''}),[oauthUrl,setOauthUrl]=useState('');
 const requestId=useRef(''),generation=useRef(0);
 async function load(){const w=await adminApi.recruitmentWorkspace();setWorkspace(w.workspace);if(w.workspace){const [o,m]=await Promise.all([adminApi.recruitmentOptions(),adminApi.recruitmentMappings()]);setOptions(o);setItems(m.mappings);}setLoaded(true);}
 useEffect(()=>{load().catch(e=>setError(String(e)));return()=>{generation.current++;};},[]);
 async function action(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(String(e));}finally{setBusy(false);}}
 function change(key:keyof Form,value:any){setForm(f=>({...f,[key]:value,...(key==='product_id'?{campaign_id:null}:{}),...(key==='target_brand_id'?{product_id:'',campaign_id:null}:{})}));setDirty(true);setPreview(null);requestId.current='';}
 async function select(item?:any){const seq=++generation.current;setApplications([]);setSelected(item?.mapping_id||'');setForm(item?Object.fromEntries(Object.keys(empty).map(k=>[k,item[k]])) as Form:{...empty});setDirty(false);setRowsText('');setPreview(null);setReview(null);setSendConsent(false);setBatches([]);setNotice('');requestId.current='';if(item){try{const r=await adminApi.recruitmentBatches(item.mapping_id);if(seq===generation.current)setBatches(r.batches);}catch(e){if(seq===generation.current)setError(String(e));}}}
 function rows(){return rowsText.split(/\r?\n/).filter(l=>l.trim()).map((line,i)=>{const [email,name='',reason='',...extra]=line.split('\t');if(extra.length)throw new Error(`${i+1}행: 이메일·이름·선정 이유 3개 열로 입력하세요`);return {email:email.trim(),name,reason,mapping_key:selected};});}
 const visible=items.filter(x=>!filter||[x.name,x.brand_name,x.product_name,x.sender_email,x.owner_name].some(v=>String(v||'').toLowerCase().includes(filter.toLowerCase())));
 return <section className="recruitment" style={{maxWidth:1200,lineHeight:1.6}}>
  <h1>디노 공용 모집</h1>{/^(localhost|127\.0\.0\.1)$/.test(location.hostname)&&<p role="note">로컬 개발 검수 화면 · 운영 사이트 반영 전</p>}<p>공용 발신 계정 → 고객 브랜드·제품 매핑 → 대상 검수 → 개인별 초안 → 별도 승인</p>
  {error&&<p role="alert" style={{color:'#a22',whiteSpace:'pre-wrap'}}>{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!loaded?<p>공간 상태를 확인하고 있습니다.</p>:!workspace?<div style={box}><p>내부 모집 공간을 생성합니다. 메일 발송·연락처 반입·가입 과금은 실행하지 않습니다.</p><button disabled={busy} onClick={()=>action(async()=>{await adminApi.createRecruitmentWorkspace();await load();})}>디노 공용 모집 공간 생성</button></div>:<>
  <div style={box}><b>{workspace.name}</b> · 내부 운영 · 고객 가입 과금 제외<p>연결된 계정 {options.accounts.length}개 · 제품 매핑 {items.length}개. 비밀번호는 저장하지 않고 Google OAuth 연결을 사용합니다.</p>
   <p>Google 연결은 선택 계정의 이메일 주소 확인·메일 발송·메일 읽기 권한을 요청합니다. 실제 발송은 별도 승인하며, Google 로그인·권한 승인은 계정 소유자가 완료합니다.</p>
   <button disabled={busy} onClick={()=>action(async()=>{setOauthUrl('');const r=await adminApi.connectRecruitmentGmail();if(!r.authUrl)throw new Error('실제 Google 연결 주소가 없습니다. 운영 설정을 확인하세요.');const u=new URL(r.authUrl);if(u.origin!=='https://accounts.google.com')throw new Error('Google 연결 주소를 확인하세요.');setOauthUrl(r.authUrl);})}>Gmail 연결 주소 준비</button>
   {oauthUrl&&<p><a href={oauthUrl} target="_blank" rel="noopener noreferrer">Google에서 발신 계정 선택·연결 승인</a> · 승인 완료 후 새로고침하세요.</p>}
   {options.accounts.map((a:any)=><p key={a.account_id}>{a.email} · {a.state}{a.sending_paused?' · 발송 중지':''} · 24시간 발송 {a.sent_last_24h} / 시스템 상한 {a.today_cap} · 예약 {a.reserved} · 신규 배정 가능 {a.available} · 회신 읽기 {a.can_read?'연결됨':'권한 필요'} {a.pause_reason}</p>)}
   {options.creatorEntryReady===false&&<p role="alert">신규 크리에이터 입장에 필요한 TikTok 인증 설정이 없습니다. 실제 모집 전 인증 설정과 가입·신청 여정을 검수하세요.</p>}<p>승인 후 자동 대기열: {options.queue?.enabled?'가동 중':options.queue?.reason||'확인 필요'} · 계정당 최소 60초 간격 · 기존 승인 배치는 자동 재개하지 않습니다.</p><button disabled={busy} onClick={()=>action(load)}>새로고침</button> <a href="https://console.theprlist.net" target="_blank" rel="noopener noreferrer">브랜드 콘솔</a></div>
  <details style={box}><summary>운영할 브랜드·제품 등록</summary><p>운영 목록과 제품을 등록합니다. 고객 로그인 계정·계약·결제·메일 발송은 생성하지 않습니다. 커미션과 출처를 입력하며, 최신 조건을 확인하기 전에는 매핑을 준비 상태로 유지하세요.</p>
   <fieldset disabled={busy} style={{border:0,padding:0}}>
    {(['brand_id','brand_name','product_name','commission_pct','source_note'] as const).map((k,i)=><label key={k}>{['브랜드 주소 (영문 소문자·숫자·하이픈)','브랜드 이름','제품 이름','자료상 커미션 (%)','출처·기준일·미확정 조건 메모'][i]}<input style={input} type={k==='commission_pct'?'number':'text'} min={k==='commission_pct'?0:undefined} max={k==='commission_pct'?80:undefined} step={k==='commission_pct'?'0.01':undefined} value={catalog[k]} onChange={e=>setCatalog(v=>({...v,[k]:e.target.value}))}/></label>)}
    <button onClick={()=>action(async()=>{if(catalog.commission_pct===''||!Number.isFinite(Number(catalog.commission_pct)))throw new Error('자료상 커미션을 입력하세요');const r=await adminApi.registerRecruitmentProduct({...catalog,commission_pct:Number(catalog.commission_pct)});await load();setNotice(r.created?'운영 제품을 등록했습니다. 계약·조건 확정이나 발송은 실행하지 않았습니다.':'기존 제품을 확인했습니다. 중복 등록하지 않았습니다.');})}>브랜드·제품 등록</button>
   </fieldset>
  </details>
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
    <label>제품 캠페인 (선택)<select style={input} value={form.campaign_id||''} onChange={e=>change('campaign_id',e.target.value||null)}><option value="">제품 모집만 · 캠페인 미지정</option>{(options.campaigns||[]).filter((c:any)=>c.brand_id===form.target_brand_id&&c.product_id===form.product_id).map((c:any)=><option key={c.campaign_id} value={c.campaign_id}>{c.name}</option>)}</select></label>
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
  {selected&&<><p><a href={'https://app.theprlist.net/?brand='+encodeURIComponent(form.target_brand_id)} target="_blank" rel="noopener noreferrer">이 고객 브랜드 커뮤니티 열기</a> · 실제 제안은 수신자별 신청 링크로 연결됩니다.</p><DistributedRecruitment mappingId={selected} revision={form.revision} dirty={dirty||form.state!=='active'} accounts={options.accounts} onSaved={async()=>{setBatches((await adminApi.recruitmentBatches(selected)).batches);await load();}}/><div style={box}><h2>이 제품의 대상 검수와 초안</h2><p>이메일 · 이름 · 선정 이유 3개 열을 탭으로 구분해 붙여넣으세요. 헤더 없이 입력하며 최대 10,000행을 검수할 수 있습니다. 검수는 발송이나 운영 DB 반입이 아닙니다.</p>
   <textarea aria-label="검수할 대상" style={input} rows={6} value={rowsText} disabled={busy} onChange={e=>{setRowsText(e.target.value);setPreview(null);requestId.current='';}}/>
   {dirty&&<p>수정한 매핑을 먼저 저장하세요.</p>}
   <button disabled={busy||dirty||form.state!=='active'||!rowsText.trim()} onClick={()=>action(async()=>{const r=await adminApi.previewRecruitment(selected,{rows:rows(),revision:form.revision});setPreview(r);requestId.current=crypto.randomUUID();})}>중복·거부·발신 한도 검수</button>
   {preview&&<><p>입력 {preview.inputCount}행 · 고유 이메일 {preview.uniqueEmailCount}개 · 적격 {preview.eligibleCount}개 · 제외 {preview.excluded.length}개 · 초안 {preview.batchCount}배치</p><p>실인원 확인 수가 아닙니다. 시스템 잔여 한도: {preview.senders.map((s:any)=>s.remainingSystemCapacity).join(', ')} · 제공자 한도·실제 배달 여부 별도</p>
    {preview.excluded.slice(0,30).map((x:any)=><p key={x.row}>{x.row}행 · {exclusions[x.reason]||x.reason}</p>)}
    {preview.groups.flatMap((x:any)=>x.samples).map((x:any)=><div key={x.email} style={{whiteSpace:'pre-wrap',borderTop:'1px solid #ddd',padding:10}}><b>{x.email} · {x.subject}</b><br/>{x.body}</div>)}
    <button disabled={busy||dirty||!preview.eligibleCount} onClick={()=>action(async()=>{const r=await adminApi.draftRecruitment(selected,{rows:rows(),revision:form.revision,request_id:requestId.current,review_hash:preview.reviewHash});setPreview(null);setRowsText('');const b=await adminApi.recruitmentBatches(selected);setBatches(b.batches);await load();setNotice(`초안 ${r.batchIds.length}개 저장 완료. 발송 승인·실제 발송은 실행하지 않았습니다.`);})}>검수한 대상의 초안 저장 · 발송 없음</button>
   </>}
  </div>
  <div style={box}><h2>고객 브랜드 신청 집계</h2><p>브랜드 {form.target_brand_id}의 모집 링크 신청입니다. 멤버십 합류·캠페인 참여 확정·검증 가입 청구와 구분합니다.</p><button disabled={busy} onClick={()=>action(async()=>{const r=await adminApi.recruitmentApplications(form.target_brand_id);setApplications(r.applications);})}>이 브랜드 신청 조회</button><p>조회된 신청 {applications.length}건 · 고유 크리에이터 {new Set(applications.map(a=>a.creator_id)).size}명 (최근 최대 200건)</p>{applications.map(a=><div key={a.application_id} style={{borderTop:'1px solid #ddd',padding:10}}>신청 {a.application_id} · {a.status}<br/>제품 {a.product_id||'브랜드 공통'} · 캠페인 {a.campaign_id||'미지정'}<br/>공용 운영 공간 {a.workspace_id} · 배치 {a.batch_id} · 매핑 {a.mapping_key||'직접 초안'} · 발신 계정 {a.gmail_account_id||'미지정'}</div>)}</div>
  <div style={box}><h2>이 매핑의 배치 개별 관리</h2><p>최근 100개 배치. 발송 성공은 배달·회신·신청·참여·배송·게시·판매를 의미하지 않습니다. 과거 배치는 생성 당시 브랜드·상품·발신자 정보를 유지합니다.</p>
   {batches.map(b=><div key={b.batch_id} style={{borderTop:'1px solid #ddd',padding:10}}><b>{b.product_name}</b> · {b.sender_email} · {deliveryStates[b.state]||b.state}{b.sending_paused?' · 중지':''}<br/>수신 주소 {b.recipient_count} · 발송 {b.sent_count} · 미발송 주소 {b.pending_count} · 확인 필요 {b.review_count} · 제외 {b.blocked_count}<br/><button disabled={busy} onClick={()=>action(async()=>{setSendConsent(false);setReview(await adminApi.reviewRecruitmentBatch(b.batch_id));})}>개별 수신자·문안 확인</button> {b.state==='draft'&&<button disabled={busy} onClick={()=>action(async()=>{await adminApi.cancelRecruitmentBatch(b.batch_id);setBatches((await adminApi.recruitmentBatches(selected)).batches);setReview(null);setNotice('초안을 취소했습니다. 발송하지 않았습니다.');})}>초안 취소</button>} {b.state==='approved'&&!b.sending_paused&&<button disabled={busy} onClick={()=>action(async()=>{await adminApi.pauseRecruitmentBatch(b.batch_id);setBatches((await adminApi.recruitmentBatches(selected)).batches);setNotice('배치를 중지했습니다. 이미 전송 중인 메일은 되돌릴 수 없습니다.');})}>이 배치 중지</button>}</div>)}
   {!batches.length&&<p>생성된 배치가 없습니다.</p>}
   {review&&<div><h3>배치 {review.id}</h3><p>고객 브랜드 {review.targetBrandId} · 제품 {review.productName} · 고유 수신 주소 {review.messages.length}개 · 상태 {deliveryStates[review.state]||review.state}</p><p>제공자 한도와 계정 간격을 지키며 대기분만 발송합니다. 결과 확인 필요 건은 재전송하지 않습니다.</p><label><input type="checkbox" checked={sendConsent} disabled={busy} onChange={e=>setSendConsent(e.target.checked)}/>수신자·문안·신청 링크를 확인했으며 이 배치의 실제 발송을 승인합니다.</label><br/><button disabled={busy||!sendConsent||review.state==='cancelled'} onClick={()=>action(async()=>{await adminApi.sendRecruitmentBatch(review.id);setSendConsent(false);setReview(await adminApi.reviewRecruitmentBatch(review.id));setBatches((await adminApi.recruitmentBatches(selected)).batches);await load();setNotice('승인 배치의 발송을 요청했습니다. 실제 성공·대기·결과 확인 필요 상태를 확인하세요.');})}>이 배치 승인·실제 발송 시작 / 대기분 계속</button>{review.messages.map((m:any)=><details key={m.email}><summary>{m.email} · {deliveryStates[review.recipients.find((r:any)=>r.email===m.email)?.state]||'미확인'}</summary><b>{m.subject}</b><pre style={{whiteSpace:'pre-wrap'}}>{m.body}</pre></details>)}</div>}
  </div></>}
  </>}
 </section>;
}
