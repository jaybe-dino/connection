import {useRef,useState} from 'react';
import {adminApi} from '../adminApi';
export default function AIReplyDraft({contactId,anchor,disabled,onApply}:{contactId:string,anchor:any,disabled:boolean,onApply:(body:string)=>void}){
 const [instructions,setInstructions]=useState(''),[language,setLanguage]=useState('auto'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<any>(null);
 const pending=useRef<any>(null);
 async function generate(){
  if(busy)return;setBusy(true);setError('');
  pending.current ||= {request_id:crypto.randomUUID(),reply_to_msg_id:anchor.msg_id,expected_account_id:anchor.gmail_account_id,instructions,language};
  try{setResult(await adminApi.crmAIReply(contactId,pending.current));pending.current=null;}
  catch(e:any){setError(e.message||'Claude 연결을 확인하세요.');}
  finally{setBusy(false);}
 }
 return <details className="crm-ai"><summary>Claude로 답장 초안 작성</summary><p>선택한 계정의 이 Gmail 대화 중 최근 8개 메일과 아래 지시만 Claude에 전달합니다. 다른 브랜드 대화·내부 메모는 포함하지 않습니다. API 사용료가 발생하며 실제 발송은 하지 않습니다.</p><fieldset disabled={disabled||busy||!!pending.current}><label>확인된 조건·답장 방향<textarea maxLength={2000} rows={3} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="예: 커미션은 아직 미확정. 확인 후 안내하겠다고 답변."/></label><label>답장 언어<select value={language} onChange={e=>setLanguage(e.target.value)}><option value="auto">받은 메일 언어에 맞춤</option><option value="en">English</option><option value="ko">한국어</option><option value="th">ไทย</option><option value="vi">Tiếng Việt</option><option value="ja">日本語</option></select></label></fieldset><button disabled={disabled||busy} onClick={()=>void generate()}>{busy?'Claude 작성 중…':pending.current?'같은 요청 결과 확인':'AI 초안 작성'}</button>{error&&<div role="alert"><p>{error}</p><button disabled={disabled||busy} onClick={()=>{pending.current=null;setError('');}}>새 요청 준비 · 재호출 시 비용 발생 가능</button></div>}{result&&<article><h4>AI 제안 · 아직 저장·발송하지 않음</h4><pre>{result.body}</pre>{result.checks?.length>0&&<><b>담당자가 확인할 내용</b><ul>{result.checks.map((v:string,i:number)=><li key={i}>{v}</li>)}</ul></>}<button disabled={disabled||busy} onClick={()=>onApply(result.body)}>검토한 초안을 답장 본문에 적용</button><p>조건·수신자·본문을 확인한 뒤 별도로 초안을 저장하고 발송을 승인하세요.</p></article>}</details>;
}
