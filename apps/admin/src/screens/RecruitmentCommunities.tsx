import {useEffect,useState} from 'react';
import {adminApi} from '../adminApi';
import Applications from './Applications';
export default function RecruitmentCommunities(){
 const [brands,setBrands]=useState<any[]>([]),[names,setNames]=useState<Record<string,string>>({}),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=async()=>setBrands((await adminApi.communitySetup()).brands);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
 return <><section className="flow-card"><h2>브랜드별 커뮤니티 설정</h2><p>공용 계정에서 보낸 메일도 신청·가입·대화는 각 고객 브랜드 방으로 연결됩니다. 브랜드 승인과 크리에이터 참여 선정은 별도입니다.</p><p>각 방에는 잡담·촬영 팁·공지 채널이 있으며, 브랜드 멤버십과 담당자 DM 권한을 유지합니다. 방 설정은 회원 가입이나 과금을 발생시키지 않습니다.</p>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 <div className="flow-card-grid">{brands.map(b=><article key={b.brand_id} className="flow-proposal"><h3>{b.name}</h3><p>{b.suspended_at?'운영 중지':b.cell_id?'커뮤니티 준비됨':'방 생성 필요'} · 회원 {b.members}명 · 활성 제품 {b.products}개</p><p>관리 계정 {b.company_email||'기존 브랜드 계정'}{b.owner_name?' · '+b.owner_name:''}</p><label>커뮤니티 방 이름<input maxLength={100} disabled={!!busy||!!b.suspended_at} value={names[b.brand_id]??b.community_name??b.name+' 라운지'} onChange={e=>setNames(v=>({...v,[b.brand_id]:e.target.value}))}/></label><button disabled={!!busy||!!b.suspended_at||!(names[b.brand_id]??b.community_name??b.name+' 라운지').trim()} onClick={async()=>{setBusy(b.brand_id);setError('');try{await adminApi.saveCommunity(b.brand_id,names[b.brand_id]??b.community_name??b.name+' 라운지');await load();setMessage(b.name+' 커뮤니티를 저장했습니다. 메일·가입·과금은 실행하지 않았습니다.');}catch(e:any){setError(e.message);}finally{setBusy('');}}}>방 설정 저장</button><a href={'https://app.theprlist.net/?brand='+encodeURIComponent(b.brand_id)} target="_blank" rel="noreferrer">{b.name} 신청·커뮤니티 열기 ↗</a><p><small>링크에 브랜드가 유지됩니다. 로그인 후 멤버십이 있는 방을 열 수 있습니다.</small></p></article>)}</div></section>
 <section className="flow-card"><Applications onChange={()=>{void load().catch(e=>setError(e.message));}}/></section></>;
}
