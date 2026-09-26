const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const s=fs.readFileSync('packages/demo-core/src/engine-live.js','utf8');

test('BRAND(): no hidden glowlab fallback; admin needs explicit pick; creator blocked',()=>{
  const c={window:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
  vm.createContext(c);
  vm.runInContext(s.slice(s.indexOf('  var adminBrand = null;'),s.indexOf('  function req(')) ,c);
  vm.runInContext('this.B=BRAND;this.setAdmin=function(v){adminBrand=v;};',c);
  assert.equal(c.B(),null);                                   // 로그인 전
  c.window.__ME={kind:'admin',brandId:null};
  assert.equal(c.B(),null);                                   // 관리자 선택 전 — glowlab 아님
  c.setAdmin('realco');
  assert.equal(c.B(),'realco');                               // 명시 선택 후
  c.window.__ME={kind:'creator'};
  assert.equal(c.B(),null);                                   // 크리에이터 콘솔 차단
  c.window.__ME={kind:'brand',brandId:'aura'};
  assert.equal(c.B(),'aura');                                 // 브랜드 계정은 자기 것만
});

test('gmailSync: refetches inbox+gmail on success; never fires before brand pick',async()=>{
  const mk=(brand)=>{
    const calls={sync:0,inbox:0,gmail:0};
    const c={window:{},calls,BRAND:()=>brand,jwtGet:()=>'t',render(){},
      loadInbox:()=>{calls.inbox++;},loadGmail:()=>{calls.gmail++;},setInterval(){},livePage:'mail',
      req:(m,u)=>{calls.sync++;return Promise.resolve({imported:10,hasMore:false});}};
    vm.createContext(c);
    vm.runInContext(s.slice(s.indexOf('  var gmailSyncBusy='),s.indexOf('  window.gmailRefresh=')),c);
    return c;
  };
  const on=mk('glowlab');
  await on.window.gmailSync();
  assert.equal(on.calls.sync,1);
  assert.equal(on.calls.inbox,1);                             // 동기화 성공 → 인박스 재조회
  assert.equal(on.calls.gmail,1);
  const off=mk(null);                                          // 브랜드 미선택
  await off.window.gmailSync();
  assert.equal(off.calls.sync,0);                             // API 호출 자체가 없다
  assert.equal(off.calls.inbox,0);
});

test('loaders skip entirely without a brand context',()=>{
  for(const marker of ['  function loadGmail() {','  function loadInbox() {']){
    const seg=s.slice(s.indexOf(marker),s.indexOf(marker)+400);
    assert.ok(seg.includes("if(!brand)return"),marker);
  }
  assert.ok(s.includes('/brands/null/'));                      // req 최후 방어
});

test('identityCard escapes stored brand name/tagline (no HTML injection)',()=>{
  const c={window:{__BID:{name:'<img src=x onerror=alert(1)>',tagline:'<b>주입</b>',logoUrl:''}},
    BRAND:()=>'realco',
    mailEscape:(x)=>String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')};
  vm.createContext(c);
  vm.runInContext('var __BID_ref=window.__BID;function brandLogoImg(){return "";}'
    +s.slice(s.indexOf('  function identityCard()'),s.indexOf('  function gmailCard()'))
      .replace(/window\.__BID/g,'__BID_ref')
    +';this.card=identityCard();',c);
  assert.ok(!c.card.includes('<img src=x'));                  // 원문 태그로 렌더 안 됨
  assert.ok(c.card.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!c.card.includes('<b>주입</b>'));
  assert.ok(c.card.includes('&lt;b&gt;주입&lt;/b&gt;'));
});

test('admin brand picker escapes names and sanitizes onclick ids',()=>{
  const c={window:{__ME:{kind:'admin'}},adminBrands:null,
    mailEscape:(x)=>String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
    render(){},req:()=>({then:()=>({catch:()=>{}})})};
  vm.createContext(c);
  vm.runInContext(s.slice(s.indexOf('  var adminBrands=null'),s.indexOf('  window.adminPickBrand='))
    +';adminBrands=[{brandId:"bad<script>",name:"<svg onload=x>"}];this.card=adminPickCard();',c);
  assert.ok(!c.card.includes('<svg onload'));
  assert.ok(c.card.includes('&lt;svg onload=x&gt;'));
  assert.ok(!c.card.includes("adminPickBrand('bad<"));        // onclick id는 슬러그 문자만
});
