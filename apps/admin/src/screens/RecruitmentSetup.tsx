import {useEffect,useRef,useState} from 'react';
import {adminApi} from '../adminApi';

/** Authorized operator uploads only. No provider calls, invitations or send approvals. */
export default function RecruitmentSetup({mode}:{mode:'brands'|'pool'}) {
 const [file,setFile]=useState<any>(null),[jobs,setJobs]=useState<any[]>([]),[brands,setBrands]=useState<any[]>([]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [activation,setActivation]=useState<Record<string,string>>({});
 const stopped=useRef(false);
 const refresh=async()=>{if(mode==='pool')setJobs((await adminApi.poolImportJobs()).jobs);else setBrands((await adminApi.setupBrands()).brands);};
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[mode]);
 const pick=async(f:File|undefined)=>{
  setFile(null);setError('');setMessage('');
  if(!f)return;
  try{
   if(f.size>250*1024*1024)throw Error('준비 파일은 250MB 이하입니다');
   const v=JSON.parse(await f.text());
   if(mode==='pool'&&(!v.manifest||!Array.isArray(v.rows)||v.rows.length!==v.manifest.expected_rows))throw Error('반입 명세와 행수가 다릅니다');
   if(mode==='brands'&&(!Array.isArray(v.brands)||!v.brands.length||v.brands.length>30))throw Error('브랜드 준비 목록은 1~30개입니다');
   setFile(v);
  }catch(e:any){setError(e.message);}
 };
 const run=async()=>{
  if(!file)return;setBusy(true);setError('');stopped.current=false;
  try{
   if(mode==='pool'){
    let job=await adminApi.startPoolImport(file.manifest);
    if(job.state==='excluded')throw Error('제외 처리한 반입 작업은 재개할 수 없습니다');
    let chunk=job.next_chunk;
    for(let i=job.processed_rows;i<file.rows.length;i+=1000){
     if(stopped.current){setMessage('일시 정지했습니다. 같은 파일로 완료된 청크 이후부터 재개할 수 있습니다.');break;}
     const r=await adminApi.poolImportChunk(file.manifest.job_id,chunk++,file.rows.slice(i,i+1000));
     setMessage(`처리 ${r.processed.toLocaleString()} / ${file.rows.length.toLocaleString()}행 · 이번 청크 등록 ${r.inserted} · 중복 ${r.skipped} · 오류 ${r.errors} · 메일 발송 없음`);
    }
   }else{
    for(let i=0;i<file.brands.length;i++){
     const r=await adminApi.setupBrand(file.brands[i]);setMessage(`${i+1}/${file.brands.length} 브랜드 준비 · ${r.brandId} · 메일 발송 없음`);
    }
   }
   await refresh();
  }catch(e:any){setError(e.message);await refresh().catch(()=>{});}
  finally{setBusy(false);}
 };
 return <section style={{background:'white',border:'1px solid var(--n300)',borderRadius:12,padding:18,margin:'16px 0'}} aria-label={mode==='pool'?'대량 DB 반입':'회사 관리 브랜드 준비'}>
  <h2>{mode==='pool'?'대량 DB 반입 · 중단 후 재개':'회사 관리 브랜드·커뮤니티 준비'}</h2>
  <p>{mode==='pool'?'출처 명세와 함께 1,000행씩 저장합니다. UID·이메일 중복은 건너뛰고, 미검증 상태·거부 이력을 유지합니다. 원본의 브랜드 계정은 후보에서 제외합니다. 등록은 모집 신청이나 실제 발송이 아닙니다.':'우리 회사 chief 메일의 브랜드별 +주소로 관리 계정을 준비합니다. 별도 메일박스를 구매하지 않습니다. 기존 브랜드·제품·비밀번호는 덮어쓰지 않습니다. 비밀번호 설정 전에는 해당 계정으로 로그인할 수 없습니다.'}</p>
  <label>{mode==='pool'?'DB 반입 준비 JSON':'브랜드 준비 JSON'} <input type="file" accept=".json,application/json" disabled={busy} onChange={e=>void pick(e.target.files?.[0])}/></label>
  {file&&<p>{mode==='pool'?`${file.manifest.source_name} · ${file.rows.length.toLocaleString()}행 · 전체 미검증`:`브랜드 ${file.brands.length}개: ${file.brands.map((b:any)=>b.name).join(', ')}`}</p>}
  <button disabled={busy||!file} onClick={()=>void run()}>{busy?'저장 중…':mode==='pool'?'명세대로 DB 반입·재개':'브랜드·회사 계정 준비 적용'}</button>
  {mode==='pool'&&busy&&<button onClick={()=>{stopped.current=true;}}>이번 청크 후 일시 정지</button>}
  <button disabled={busy} onClick={()=>void refresh().catch(e=>setError(e.message))}>저장 현황 새로고침</button>
  {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
  {mode==='pool'&&jobs.map(j=><p key={j.job_id}>{j.source_name} · {j.state} · 처리 {j.processed_rows.toLocaleString()}/{j.expected_rows.toLocaleString()} · 등록 {j.inserted_rows.toLocaleString()} · 중복 {j.skipped_rows.toLocaleString()} · 오류 {j.error_rows.toLocaleString()} · 원본 SHA256 <code>{j.source_sha256.slice(0,16)}</code></p>)}
  {mode==='brands'&&<><p>공용 어드민에서는 바로 관리할 수 있습니다. 별도 브랜드 콘솔 로그인은 아래에서 초기 설정 링크를 만들고 계정 소유자가 직접 비밀번호를 입력하세요. 링크는 72시간 유효하며 외부로 발송하지 않습니다.</p><table style={{width:'100%',fontSize:13}}><thead><tr><th>브랜드·커뮤니티</th><th>회사 관리 계정</th><th>준비 상태</th></tr></thead><tbody>{brands.map(b=><tr key={b.brand_id}><td><a href={'https://app.theprlist.net/?brand='+encodeURIComponent(b.brand_id)} target="_blank" rel="noreferrer">{b.name}</a><br/>{b.countries.join(', ')} · {b.owner_name}</td><td>{b.company_email}<br/>{b.login_ready?'비밀번호 설정됨':<><span>별도 로그인 비밀번호 설정 대기</span><br/><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const r=await adminApi.setupBrandActivation(b.brand_id);setActivation(v=>({...v,[b.brand_id]:r.url}));}catch(e:any){setError(e.message);}finally{setBusy(false);}}}>{b.name} 초기 설정 링크 준비</button>{activation[b.brand_id]&&<a href={activation[b.brand_id]} target="_blank" rel="noreferrer">비밀번호 직접 설정 열기</a>}</>}</td><td>{b.missing_fields.join(' · ')||'조건 최종 검수 대기'}</td></tr>)}</tbody></table></>}
 </section>;
}
