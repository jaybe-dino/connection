// 후보 선택 → 아웃리치 초안 연결 — 이메일 없는 후보 선택 불가·컨텍스트 보존·프리필
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const s=fs.readFileSync('packages/demo-core/src/engine-live.js','utf8');
const slice=s.slice(s.indexOf("  var candidateCountry='',candidateVersion=0,candSelected={};"),
                    s.indexOf("  var livePage='home'"));

function el(v){return {value:v==null?'':v,disabled:false};}
function ctx(){
  const c={window:{},reqs:[],toasts:[],navs:[],rendered:0,
    productsData:[{productId:'prod-1',name:'시카 세럼',commissionPct:10,profileVersion:1,fields:{}}],
    prodNotice:'',prodCandidates:null,
    BRAND:()=>'glowlab',jwtGet:()=>'tok',
    mailEscape:(v)=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
    render(){c.rendered++;},collabCard:()=>'',
    toast:(t,m)=>c.toasts.push(t+':'+m),
    liveNav:(p)=>{c.navs.push(p);},
    els:{outRecipients:el(''),outProduct:el(''),outBrief:el(''),candidateCountry:el('TH')},
    document:{getElementById:(id)=>c.els[id]||null},
    req:(m,u,b)=>{c.reqs.push({m,u});return Promise.resolve({});}};
  vm.createContext(c);vm.runInContext(slice,c);return c;
}
const cands={productId:'prod-1',productName:'시카 세럼',searchCountry:'TH',note:'n',ai:{mode:'keyword'},candidates:[
  {uid:'u1',handle:'ploy',country:'TH',email:'ploy@example.com',emailVerified:true,fitScore:2,evidence:['e1']},
  {uid:'u2',handle:'nok',country:'TH',email:'nok@example.com',emailVerified:false,emailStatus:'none',fitScore:1,evidence:[]},
  {uid:'u3',handle:'noemail',country:'TH',email:null,fitScore:0,evidence:[]}]};

test('후보 카드 — 이메일 보유만 체크박스, 미검증 표시, 선택 전 버튼 비활성',()=>{
  const c=ctx();c.prodCandidates=JSON.parse(JSON.stringify(cands));
  vm.runInContext('prodCandidates=('+JSON.stringify(cands)+')',c);
  const h=vm.runInContext('productsCard()',c);
  assert.equal((h.match(/candToggle/g)||[]).length,2);        // noemail 제외
  assert.match(h,/미검증 — 발송 전 확인/);
  assert.match(h,/검증됨/);
  assert.match(h,/선택 0명으로 아웃리치 초안 만들기/);
  assert.match(h,/disabled>선택 0명/);
  assert.match(h,/합류 링크가 자동 포함/);
});

test('candToggle — 이메일 없는 후보는 선택되지 않는다',()=>{
  const c=ctx();
  vm.runInContext('prodCandidates=('+JSON.stringify(cands)+')',c);
  vm.runInContext('window.candToggle("u3")',c);
  vm.runInContext('window.candToggle("u1")',c);
  vm.runInContext('window.candToggle("u2")',c);
  assert.equal(vm.runInContext('Object.keys(candSelected).sort().join()',c),'u1,u2');
  vm.runInContext('window.candToggle("u1")',c);               // 해제
  assert.equal(vm.runInContext('Object.keys(candSelected).join()',c),'u2');
});

test('선택 후보 → 아웃리치 프리필: 수신자/제품/브리프 컨텍스트 보존 + 미검증 경고',()=>{
  const c=ctx();
  vm.runInContext('prodCandidates=('+JSON.stringify(cands)+')',c);
  vm.runInContext('window.candToggle("u1");window.candToggle("u2")',c);
  vm.runInContext('window.outreachFromCandidates("prod-1")',c);
  assert.equal(c.navs.join(),'mail');
  assert.equal(c.els.outRecipients.value,'ploy@example.com\nnok@example.com');
  assert.equal(c.els.outProduct.value,'prod-1');
  const brief=c.els.outBrief.value;
  assert.match(brief,/시카 세럼/);                             // 제품 컨텍스트
  assert.match(brief,/TH/);                                    // 국가 컨텍스트
  assert.match(brief,/@ploy/);
  assert.match(brief,/합류/);                                  // 합류 권유 유지
  assert.match(c.toasts.join('|'),/미검증 이메일 1건/);
  assert.match(c.toasts.join('|'),/자동 발송은 없으며/);
});

test('선택 없이 실행 — 이동/프리필 없이 안내만',()=>{
  const c=ctx();
  vm.runInContext('prodCandidates=('+JSON.stringify(cands)+')',c);
  vm.runInContext('window.outreachFromCandidates("prod-1")',c);
  assert.equal(c.navs.length,0);
  assert.equal(c.els.outRecipients.value,'');
  assert.match(c.toasts.join('|'),/후보 선택/);
});

test('플랫폼 UID가 같아도 선택·이메일·추천 근거가 분리된다',()=>{
  const c=ctx();const data=JSON.parse(JSON.stringify(cands));
  data.candidates[0].uid='shared';data.candidates[0].candidateId='pool-1';data.candidates[0].aiReason='선케어 전문';
  data.candidates[1].uid='shared';data.candidates[1].candidateId='pool-2';data.candidates[1].aiReason='태국 뷰티';
  vm.runInContext('prodCandidates=('+JSON.stringify(data)+')',c);
  vm.runInContext('window.candToggle("pool-1");window.candToggle("pool-2");window.outreachFromCandidates("prod-1")',c);
  assert.equal(c.els.outRecipients.value,'ploy@example.com\nnok@example.com');
  assert.match(c.els.outBrief.value,/선케어 전문/);assert.match(c.els.outBrief.value,/태국 뷰티/);
});
