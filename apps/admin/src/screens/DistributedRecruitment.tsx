import {useEffect,useRef,useState} from 'react';
import {adminApi} from '../adminApi';
type Props={mappingId:string;revision:number;dirty:boolean;accounts:any[];incomingRows?:string;onSaved:()=>Promise<void>;onBusy:(busy:boolean)=>void};
const reasons:Record<string,string>={original_sender_unavailable:'기존 대화 발신자 연결·잔여량 확인 필요',sender_capacity_exhausted:'발신 계정 잔여량 부족'};
export default function DistributedRecruitment({mappingId,revision,dirty,accounts,incomingRows,onSaved,onBusy}:Props){
 const [ids,setIds]=useState<string[]>([]),[text,setText]=useState(''),[result,setResult]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const requestId=useRef(''),generation=useRef(0);
 useEffect(()=>{generation.current++;setIds([]);setText('');setResult(null);setError('');setNotice('');requestId.current='';},[mappingId,revision,dirty]);
 useEffect(()=>{if(incomingRows){generation.current++;setText(incomingRows);setResult(null);requestId.current='';}},[incomingRows]);
 function invalidate(){generation.current++;setResult(null);requestId.current='';}
 function payload(){return {revision,sender_ids:ids,rows:text.split(/\r?\n/).filter(x=>x.trim()).map((line,i)=>{const [email,name='',reason='',...extra]=line.split('\t');if(extra.length)throw Error(`${i+1}행: 이메일·이름·선정 이유 3열을 입력하세요`);return {email:email.trim(),name,reason,mapping_key:mappingId};})};}
 async function act(fn:()=>Promise<void>){setBusy(true);onBusy(true);setError('');try{await fn();}catch(e){setError(String(e));}finally{setBusy(false);onBusy(false);}}
 const available=accounts.filter(a=>a.state==='connected'&&!a.sending_paused);
 return <details style={{background:'white',border:'1px solid var(--n300)',padding:18,borderRadius:12,marginBottom:16}} open><summary><b>여러 발신 계정으로 대량 모집</b></summary>
 <p>같은 제품 제안을 선택한 계정으로 분산합니다. 기존 대화는 원래 계정에 고정하고, 계정별 24시간 한도와 기존 예약분을 제외합니다. 새 계정이나 도메인을 추가해 한도를 우회하지 않습니다.</p>
 <fieldset disabled={busy||dirty}><legend>발신 계정 선택</legend><button type="button" onClick={()=>{invalidate();setIds(available.map(a=>a.account_id));}}>연결된 계정 전체 선택</button>
 <div className="sender-dropzone" onDragOver={e=>{if(!busy&&!dirty)e.preventDefault();}} onDrop={e=>{e.preventDefault();if(busy||dirty)return;const id=e.dataTransfer.getData('application/theprlist-sender');if(available.some(a=>a.account_id===id)){invalidate();setIds(v=>v.includes(id)?v:[...v,id]);}}} aria-label="발신 계정 선택 드롭 영역"><b>발신 주소를 이곳에 끌어 선택하세요</b><p>선택 {ids.length}개 · 현재 신규 배정 가능 합계 {accounts.filter(a=>ids.includes(a.account_id)).reduce((n,a)=>n+(a.available||0),0)}건. 기존 대화 발신 고정·수신자 제외 검수 후 실제 배정 수가 줄 수 있습니다.</p></div>
 {accounts.map(a=><label key={a.account_id} className="sender-card" draggable={!busy&&!dirty&&a.state==='connected'&&!a.sending_paused} onDragStart={e=>e.dataTransfer.setData('application/theprlist-sender',a.account_id)}><input type="checkbox" checked={ids.includes(a.account_id)} disabled={a.state!=='connected'||a.sending_paused} onChange={e=>{invalidate();setIds(v=>e.target.checked?[...v,a.account_id]:v.filter(x=>x!==a.account_id));}}/>{a.email} · 신규 배정 가능 {a.available??'확인 필요'} · {a.state}{a.sending_paused?' / 중지':''}</label>)}
 <p>이메일 · 이름 · 선정 이유를 탭으로 구분해 입력하세요. 최대 10,000행을 검수하며 발송 건수나 고유 실인원으로 계산하지 않습니다.</p>
 <textarea aria-label="여러 계정 분산 명단" rows={6} style={{width:'100%',boxSizing:'border-box'}} value={text} onChange={e=>{invalidate();setText(e.target.value);}}/>
 <button disabled={!ids.length||!text.trim()} onClick={()=>act(async()=>{const seq=generation.current;const p=await adminApi.previewDistributedRecruitment(mappingId,payload());if(seq!==generation.current)return;setResult(p);requestId.current=crypto.randomUUID();setNotice('검수 완료. 아직 저장·발송하지 않았습니다.');})}>계정별 분산·중복·신청 링크 검수</button></fieldset>
 {dirty&&<p>활성 매핑을 먼저 저장하세요.</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {result&&<div><p>입력 {result.submittedCount}행 · 배정 {result.inputCount}행 · 적격 {result.eligibleCount}개 · 제외 {result.excluded.length}행 · 미배정 {result.unassigned.length}행 · {result.batchCount}개 초안 배치</p>
 {result.groups.map((g:any)=><div key={g.key} style={{borderTop:'1px solid #ddd',padding:10}}><b>{g.senderEmail}</b> → {g.brandName} / {g.productName} · {g.eligibleCount}개 {g.samples.map((m:any)=><details key={m.email}><summary>{m.email} · {m.subject}</summary><pre style={{whiteSpace:'pre-wrap'}}>{m.body}</pre></details>)}</div>)}
 {result.unassigned.slice(0,30).map((x:any)=><p key={x.row}>{x.row}행: {reasons[x.reason]||x.reason}</p>)}
 {result.excluded.slice(0,30).map((x:any)=><p key={x.row}>{x.row}행 제외: {x.reason}</p>)}
 <button disabled={busy||dirty||!result.eligibleCount} onClick={()=>act(async()=>{const r=await adminApi.draftDistributedRecruitment(mappingId,{...payload(),request_id:requestId.current,review_hash:result.reviewHash});setResult(null);setText('');await onSaved();setNotice(`${r.batchIds.length}개 초안 저장 완료. 아래 배치에서 개인별 문안·신청 링크를 확인한 후 실제 발송을 승인하세요.`);})}>검수된 분산 초안 저장 · 발송 없음</button></div>}
 </details>;
}
