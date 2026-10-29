import {useEffect,useState} from 'react';
import {adminApi} from '../adminApi';
const status:Record<string,string>={sending:'전송 처리 중·재전송 금지',accepted:'Gmail 접수 완료 · 배달 확인 전',review:'결과 확인 필요 · Gmail 보낸편지함 확인',not_sent:'발송 안 됨 · 계정 간격·한도 확인',demo:'모사 결과 · 실제 발송 아님'};
export default function RecruitmentTestMail({items,accounts,onSent}:{items:any[],accounts:any[],onSent:()=>Promise<void>}){
 const [mapping,setMapping]=useState(''),[sender,setSender]=useState(''),[to,setTo]=useState('chief@dinostudio.kr');
 const [preview,setPreview]=useState<any>(null),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[history,setHistory]=useState<any[]>([]);
 const [pending,setPending]=useState<any>(null);
 const load=async()=>setHistory((await adminApi.testMailHistory()).tests);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
 function change(fn:()=>void){fn();setPreview(null);setAck(false);setError('');setMessage('');}
 const body=()=>({mapping_id:mapping,account_id:sender,recipient:to});
 async function run(fn:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await fn();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <section className="flow-card"><h2>먼저 내 메일로 1통 테스트하세요</h2><p>선택한 브랜드·제품의 문안과 신청 페이지를 회사 메일에서 확인합니다. 실제 Gmail 발송이며 계정 한도에 포함됩니다. 모집 명단·신청 실적·청구는 만들지 않습니다.</p>
 <fieldset className="flow-lock" disabled={busy||!!pending}><div className="flow-fields"><label>테스트할 브랜드·제품<select value={mapping} onChange={e=>change(()=>setMapping(e.target.value))}><option value="">제안을 선택하세요</option>{items.filter(m=>['draft','active'].includes(m.state)).map(m=><option key={m.mapping_id} value={m.mapping_id}>{m.brand_name} / {m.product_name}</option>)}</select></label><label>발신 메일<select value={sender} onChange={e=>change(()=>setSender(e.target.value))}><option value="">발신 계정 선택</option>{accounts.filter(a=>a.state==='connected'&&!a.sending_paused).map(a=><option key={a.account_id} value={a.account_id}>{a.email} · 배정 가능 {a.available}</option>)}</select></label><label>테스트 받을 회사 메일<select value={to} onChange={e=>change(()=>setTo(e.target.value))}>{Array.from(new Set(['chief@dinostudio.kr',...accounts.filter(a=>a.state==='connected').map(a=>a.email)])).map(email=><option key={email}>{email}</option>)}</select></label></div>
 <button disabled={busy||!mapping||!sender} onClick={()=>run(async()=>{setAck(false);setPreview(await adminApi.testMailPreview(body()));})}>테스트 메일 미리보기 · 발송 없음</button>
 {preview&&<article className="flow-proposal"><p><b>{preview.fromEmail}</b> → <b>{preview.to}</b></p><h3>{preview.subject}</h3><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview.body}</pre><p>이 테스트 링크는 선택 브랜드·제품으로 연결되며 개인별 모집 추적 토큰을 생성하지 않습니다. 일반 신규 가입은 TikTok 승인 상태에 따라 제한될 수 있습니다.</p><label className="flow-check"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>위 주소로 이 내용의 실제 테스트 메일 1통을 보내겠습니다.</label><button className="flow-primary" disabled={busy||!ack} onClick={()=>{
  const request={...body(),review_hash:preview.reviewHash,request_id:crypto.randomUUID(),confirmed:true};setAck(false);setPending(request);
  void run(async()=>{let r;try{r=await adminApi.testMailSend(request);}catch(e:any){if(/^4\d\d\b/.test(e.message||'')){setPending(null);setPreview(null);}throw e;}setPending(null);setPreview(null);setMessage(status[r.state]||r.state);await load();await onSent();});
 }}>이 주소로 테스트 1통 보내기</button></article>}
 </fieldset>
 {pending&&<div className="flow-warning"><b>테스트 요청 결과를 확인해야 합니다</b><p>새 메일을 보내지 말고 같은 요청의 결과를 확인하세요. 서버는 이미 접수한 요청을 재전송하지 않습니다.</p><button disabled={busy} onClick={()=>run(async()=>{const r=await adminApi.testMailSend(pending);setPending(null);setPreview(null);setMessage(status[r.state]||r.state);await load();await onSent();})}>같은 요청 결과 확인</button></div>}
 {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 <h3>최근 테스트 발송</h3><button disabled={busy} onClick={()=>run(load)}>결과 새로고침</button>{history.length===0?<p>아직 테스트 발송 기록이 없습니다.</p>:history.map(h=><p key={h.request_id}>{h.sender_email} → {h.recipient}<br/>{h.subject} · {status[h.state]||h.state}</p>)}
 </section>;
}
