import {useCallback,useEffect,useRef,useState} from 'react';
import {adminApi} from '../adminApi';
import AIReplyDraft from './AIReplyDraft';
export default function MailReplyComposer({message,account,onDone,onClose,onBusyChange,onDirtyChange,onUncertainChange}:{message:any,account:any,onDone:()=>Promise<void>,onClose:()=>void,onBusyChange:(v:boolean)=>void,onDirtyChange:(v:boolean)=>void,onUncertainChange:(v:boolean)=>void}){
 const [body,setBody]=useState(''),[busy,setBusy]=useState(false),[aiBusy,setAiBusy]=useState(false),[error,setError]=useState(''),[review,setReview]=useState<any>(message.state==='pending_gate'?message:null),[ack,setAck]=useState(false),[uncertain,setUncertain]=useState(false),[notice,setNotice]=useState('');
 const pending=useRef<any>(null),locked=busy||aiBusy;
 const aiState=useCallback((v:boolean)=>setAiBusy(v),[]);
 useEffect(()=>{onBusyChange(locked);},[locked,onBusyChange]);
 useEffect(()=>{onUncertainChange(uncertain);},[uncertain,onUncertainChange]);
 function editing(v:string){setBody(v);onDirtyChange(!!v.trim());pending.current=null;}
 async function save(){if(locked)return;setBusy(true);onBusyChange(true);setError('');pending.current ||= {request_id:crypto.randomUUID(),reply_to_msg_id:message.msg_id,expected_account_id:account.account_id,body};
  try{const r=await adminApi.crmDraft(message.contact_id,pending.current);const m=await adminApi.crmMessage(message.contact_id,r.msgId,account.account_id);setReview({...m,contact_id:message.contact_id});pending.current=null;setUncertain(false);setBody('');onDirtyChange(false);setNotice('초안을 저장했습니다. 발송하려면 아래에서 별도로 승인하세요.');await onDone().catch(()=>setNotice('초안은 저장됐습니다. 메일 목록 새로고침을 다시 해주세요.'));}
  catch(e:any){if(/^4\d\d\b/.test(e.message||'')){pending.current=null;setUncertain(false);setError(e.message);}else{setUncertain(true);setError('저장 결과를 확인해야 합니다. 같은 요청 결과 확인을 눌러 주세요.');}}
  finally{setBusy(false);onBusyChange(false);}
 }
 async function send(){if(!ack||locked||!review)return;const mid=review.msg_id;setAck(false);setReview(null);setBusy(true);onBusyChange(true);setError('');setNotice('');
  try{const r=await adminApi.crmSend(message.contact_id,mid);setNotice(r.state==='sent'?'Gmail에서 발송을 접수했습니다. 배달 완료와는 다릅니다.':'발송 간격·한도로 대기 중입니다. 초안 폴더에서 확인하세요.');await onDone();}
  catch{setError('발송 결과 확인이 필요합니다. 자동 재전송하지 않았습니다. 초안·결과 확인 폴더와 Gmail 보낸편지함을 확인하세요.');await onDone().catch(()=>{});}
  finally{setBusy(false);onBusyChange(false);}
 }
 return <section className="mail-reply-box" aria-label="개별 메일 답장"><header><b>{review?'발송 전 검토':'답장 작성'}</b><button disabled={locked||uncertain} onClick={()=>{if(body.trim()&&!window.confirm('작성 중인 답장을 버릴까요?'))return;onDirtyChange(false);onClose();}}>닫기</button></header><p className="mail-reply-address">{account.email} → {message.creator_email}</p>{error&&<p role="alert" className="flow-alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {!review&&<><AIReplyDraft contactId={message.contact_id} anchor={{...message,gmail_account_id:account.account_id,account_email:account.email}} disabled={locked||uncertain} onBusyChange={aiState} onApply={v=>{if(body.trim()&&!window.confirm('작성 중인 본문을 AI 초안으로 바꿀까요?'))return;editing(v);}}/>
 <textarea aria-label="답장 본문" placeholder="답장을 작성하세요…" rows={7} value={body} maxLength={20000} disabled={locked||uncertain} onChange={e=>editing(e.target.value)}/><footer><span>원래 계정·대화에 이어서 답장합니다.</span><button className="mail-primary" disabled={locked||!body.trim()&&!uncertain} onClick={()=>void save()}>{uncertain?'같은 요청 결과 확인':'초안 저장·검토'}</button></footer></>}
 {review&&<><h4>{review.subject}</h4><pre>{review.body}</pre><label className="mail-send-ack"><input type="checkbox" disabled={locked} checked={ack} onChange={e=>setAck(e.target.checked)}/>수신자·발신 계정·내용을 확인했으며 답장 1통 발송을 승인합니다.</label><footer><button disabled={locked} onClick={async()=>{setBusy(true);onBusyChange(true);try{await adminApi.crmCancel(message.contact_id,review.msg_id);setReview(null);setNotice('초안을 취소했습니다. 메일은 보내지 않았습니다.');await onDone();}catch(e:any){setError(e.message);}finally{setBusy(false);onBusyChange(false);}}}>이 초안 취소</button><button className="mail-primary" disabled={locked||!ack} onClick={()=>void send()}>승인한 답장 1통 발송</button></footer></>}
 </section>;
}
