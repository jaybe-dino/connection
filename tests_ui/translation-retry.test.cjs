// 번역 수동 재시도 UI — failed에만 버튼, 중복 클릭 방지, 성공 시 재조회
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const s=fs.readFileSync('packages/demo-core/src/engine-live.js','utf8');
const slice=s.slice(s.indexOf('  var brandCells=[],brandConversation=null'),
                    s.indexOf('  var originalRender=window.render;'));

function ctx(){
  const c={window:{},reqs:[],rendered:0,
    BRAND:()=>'glowlab',jwtGet:()=>'tok',
    mailEscape:(v)=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
    render(){c.rendered++;},
    req:(m,u,b)=>{c.reqs.push({m,u});return c.reqImpl?c.reqImpl(m,u,b):Promise.resolve([]);}};
  vm.createContext(c);vm.runInContext(slice,c);return c;
}
const card=(c)=>vm.runInContext('brandCommunityCard()',c);
const msg=(o)=>Object.assign({msgId:7,author:'a',at:'t',original:'สวัสดี',originalLocale:'th',translations:{},translationState:'done'},o);

test('failed 메시지에만 재시도 버튼, pending은 대기 안내, done은 없음',()=>{
  const c=ctx();
  c.brandCells=[];
  vm.runInContext('brandConversation={cell:{cellId:"cell-x",name:"라운지"},messages:[]}',c);
  c.brandConversation=vm.runInContext('brandConversation',c);
  c.brandConversation.messages=[msg({translationState:'failed'}),msg({msgId:8,translationState:'pending'}),msg({msgId:9})];
  const h=card(c);
  assert.match(h,/번역 실패 — 원문은 보존/);
  assert.match(h,/brandTranslationRetry\('7'\)/);
  assert.match(h,/번역 준비 중 — 자동 재시도 대기/);
  assert.doesNotMatch(h,/brandTranslationRetry\('9'\)/);   // done엔 버튼 없음
});

test('중복 클릭 방지 — 진행 중이면 두 번째 호출은 req를 내지 않는다',async()=>{
  const c=ctx();
  vm.runInContext('brandConversation={cell:{cellId:"cell-x",name:"라운지"},messages:[{msgId:7,author:"a",at:"t",original:"x",originalLocale:"th",translations:{},translationState:"failed"}]}',c);
  let resolve1,first=true;
  c.reqImpl=()=>{if(first){first=false;return new Promise(r=>{resolve1=r;});}return Promise.resolve([]);};
  const p1=vm.runInContext('window.brandTranslationRetry(7)',c);
  vm.runInContext('window.brandTranslationRetry(7)',c);           // 진행 중 재클릭
  assert.equal(c.reqs.length,1);                            // 추가 요청 없음
  assert.match(card(c).replace(/\n/g,''),/재시도 중…/);      // 버튼 로딩 표시
  resolve1({translationState:'pending',hint:'h'});await p1;
});

test('재시도 성공 시 대화 재조회 + 완료 안내',async()=>{
  const c=ctx();
  vm.runInContext('brandConversation={cell:{cellId:"cell-x",name:"라운지"},messages:[]}',c);
  c.reqImpl=(m,u)=>Promise.resolve(m==='POST'?{translationState:'done'}:[msg({})]);
  await vm.runInContext('window.brandTranslationRetry(7)',c);
  assert.equal(c.reqs.filter(r=>r.m==='POST'&&r.u.includes('/translation-retry')).length,1);
  assert.equal(c.reqs.filter(r=>r.m==='GET'&&r.u.includes('/messages')).length,1);
  assert.match(vm.runInContext('brandConversationError',c),/완료/);
});
