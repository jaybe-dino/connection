// 카드 자동청구 UI — flags off 숨김, submit 즉시 입력 비움, 동의 필수, localStorage 금지
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const s=fs.readFileSync('packages/demo-core/src/engine-live.js','utf8');
const slice=s.slice(s.indexOf('  var billingCardInfo = null'),
                    s.indexOf('  /* ── 게이트 결정'));

function el(v){return {value:v,checked:false};}
function ctx(){
  const c={window:{__ME:{kind:"brand"}},reqs:[],toasts:[],rendered:0,livePage:'billing',billingVersion:1,
    BRAND:()=>'glowlab',
    mailEscape:(v)=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
    render(){c.rendered++;},
    toast:(t,m)=>c.toasts.push(t+':'+m),
    els:{bcNo:el('4111111111111111'),bcYY:el('28'),bcMM:el('12'),bcId:el('900101'),bcPw:el('12'),bcConsent:{checked:true}},
    document:{getElementById:(id)=>c.els[id]||null},
    req:(m,u,b)=>{c.reqs.push({m,u,b});return c.reqImpl?c.reqImpl(m,u,b):Promise.resolve({});}};
  vm.createContext(c);vm.runInContext(slice,c);return c;
}

test('카드 코드는 localStorage를 일절 사용하지 않는다',()=>{
  assert.doesNotMatch(slice,/localStorage/);
});

test('운영 플래그 off — 입력창 숨기고 준비중 안내',()=>{
  const c=ctx();
  vm.runInContext('billingCardInfo={configured:false,attempts:[]}',c);
  const h=vm.runInContext('window.billingCardHtml()',c);
  assert.match(h,/자동청구 준비 중/);
  assert.doesNotMatch(h,/id="bcNo"/);        // 카드 입력창 자체가 없다
});

test('등록 submit — 전송 직전 입력 즉시 비움 + 동의/카드값 페이로드',async()=>{
  const c=ctx();
  vm.runInContext('billingCardInfo={configured:true,consentVersion:"autocharge-v1",attempts:[]}',c);
  let resolveReq;c.reqImpl=()=>new Promise(r=>{resolveReq=r;});
  const p=vm.runInContext('window.billingCardRegister()',c);
  // req가 아직 미해결인 시점(=성공/실패와 무관)에 이미 비어 있어야 한다
  for(const k of ['bcNo','bcYY','bcMM','bcId','bcPw'])assert.equal(c.els[k].value,'',k);
  assert.equal(c.reqs.length,1);
  assert.equal(c.reqs[0].b.cardNo,'4111111111111111');
  assert.equal(c.reqs[0].b.consent,true);
  assert.equal(c.reqs[0].b.consentVersion,'autocharge-v1');
  resolveReq({cardLabel:'[신한]'});await p;
});

test('동의 미체크 — 서버 호출 없이 안내 + 입력은 비움',()=>{
  const c=ctx();c.els.bcConsent.checked=false;
  vm.runInContext('billingCardInfo={configured:true,consentVersion:"autocharge-v1",attempts:[]}',c);
  vm.runInContext('window.billingCardRegister()',c);
  assert.equal(c.reqs.length,0);
  assert.equal(c.els.bcNo.value,'');
  assert.match(c.toasts.join('|'),/동의/);
});

test('실패 attempt는 수동 결제 안내로 표시',()=>{
  const c=ctx();
  vm.runInContext('billingCardInfo={configured:true,card:{state:"active",cardLabel:"[신한]",consentVersion:"autocharge-v1",consentAt:"2026-09-26T00:00:00"},autochargeFlag:true,attempts:[{invoiceId:"x",outcome:"failed",failMsg:"한도초과",finishedAt:"2026-09-26T01:00:00"}]}',c);
  const h=vm.runInContext('window.billingCardHtml()',c);
  assert.match(h,/자동청구 실패 — 카드 상태 확인 후/);
  assert.match(h,/한도초과/);
  assert.match(h,/카드 해지/);
});


test('등록 비활성이어도 기존 카드 해지는 가능',()=>{
 const c=ctx();
 vm.runInContext('billingCardInfo={configured:false,card:{state:"active"},attempts:[]}',c);
 assert.match(vm.runInContext('window.billingCardHtml()',c),/카드 해지/);
});
test('관리자는 카드 정보를 입력하거나 임의 해지할 수 없다',()=>{
 const c=ctx();c.window.__ME.kind='admin';
 vm.runInContext('billingCardInfo={configured:true,attempts:[]}',c);
 assert.doesNotMatch(vm.runInContext('window.billingCardHtml()',c),/id="bcNo"/);
 vm.runInContext('billingCardInfo.card={state:"active"}',c);
 assert.doesNotMatch(vm.runInContext('window.billingCardHtml()',c),/onclick="billingCardExpire/);
});
test('자동청구 중지시 활성이라는 오표시 없음',()=>{
 const c=ctx();
 vm.runInContext('billingCardInfo={configured:true,card:{state:"active"},autochargeFlag:false,attempts:[]}',c);
 const h=vm.runInContext('window.billingCardHtml()',c);
 assert.match(h,/자동청구 대기/);assert.doesNotMatch(h,/자동청구 활성/);
});
