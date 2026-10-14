import { useEffect, useState } from 'react';
import { adminApi } from '../adminApi';

type Workspace = {brandId:string; name:string; internal:boolean};
export default function Recruitment() {
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(){try{const r=await adminApi.recruitmentWorkspace();setWorkspace(r.workspace);setError('');setLoaded(true);}catch(e){setError(String(e));}}
  useEffect(()=>{void load();},[]);
  async function create(){setBusy(true);setError('');try{await adminApi.createRecruitmentWorkspace();await load();}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <section style={{maxWidth:800,lineHeight:1.7}}>
    <h1>디노 공용 모집</h1>
    <p>회사 모집 계정과 크리에이터 관계를 관리하는 공간입니다. 고객 브랜드의 가입 과금과 분리합니다.</p>
    {error&&<p role="alert">{error}</p>}
    {!loaded?<p role="status">공간 상태를 확인하고 있습니다.</p>:workspace?<>
      <h2>{workspace.name}</h2><p>운영 주소: <code>{workspace.brandId}</code> · {workspace.internal?'내부 운영 · 가입 과금 제외':'고객 브랜드 — 확인 필요'}</p>
      <a href="https://console.theprlist.net" target="_blank" rel="noopener noreferrer">브랜드 콘솔 열기</a>
      <ol><li>관리자 콘솔의 ‘전환’에서 공용 모집 공간을 선택합니다.</li><li>승인된 회사 발신 계정을 연결합니다. 권한 연결은 사용자 확인 후 진행합니다.</li><li>발신 계정을 선택하고 최대 200명의 초안을 저장합니다. 저장은 발송하지 않습니다.</li><li>대상·상품 조건·발신 주소·본문을 검토한 뒤 순차 발송을 승인합니다.</li></ol>
    </>:<><p>공용 공간을 생성해도 메일·초대장·인증정보를 보내거나 연락처를 가져오지 않습니다.</p><button onClick={create} disabled={busy}>{busy?'생성 중…':'디노 공용 모집 공간 생성'}</button></>}
    <p>초기 한도는 계정당 최근 24시간 최대 200건, 발송 간격은 최소 60초입니다. 제공자 제한·불확실 결과·수신거부는 별도로 적용됩니다. 중지된 계정의 한도를 다른 계정으로 넘기지 않습니다.</p>
    <p>브랜드 재제안은 적합한 상품·조건과 기존 연락 이력을 검토해 별도 승인합니다. 연락처나 캠페인 참가 합계를 월간 고유 인원으로 계산하지 않습니다.</p>
  </section>;
}
