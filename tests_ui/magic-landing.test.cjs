const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const s=fs.readFileSync('packages/demo-core/src/engine-live.js','utf8');
const tail=s.slice(s.indexOf('    var sp = new URLSearchParams(location.search);'),
                   s.indexOf('    if (magicTok && !magicForward) {'));

function ctx(surface,search){
  const c={window:{__SURFACE:surface},replaced:[],verifies:0,
    URLSearchParams,encodeURIComponent,
    location:{search,hostname:'theprlist.net',replace(u){c.replaced.push(u);}},
    localStorage:{getItem:()=>null},
    authPanel(){},req:(m,u)=>{if(u.includes('magic/verify'))c.verifies++;return new Promise(()=>{});}};
  vm.createContext(c);return c;
}

test('non-creator surface forwards magic to fixed app origin BEFORE consuming',()=>{
  for(const surf of ['bjoin','brand']){
    const c=ctx(surf,'?brand=glowlab&magic=tok-123');
    vm.runInContext(tail,c);
    assert.equal(c.verifies,0);                                  // 소비 전 전달
    assert.equal(c.replaced[0],'https://app.theprlist.net/?brand=glowlab&magic=tok-123');
  }
});

test('forward drops non-slug brand and never builds arbitrary redirect',()=>{
  const c=ctx('bjoin','?brand=..%2Fevil.example&magic=tok-9');
  vm.runInContext(tail,c);
  assert.equal(c.replaced[0],'https://app.theprlist.net/?magic=tok-9');  // brand 폐기
  assert.ok(c.replaced[0].startsWith('https://app.theprlist.net/'));     // 고정 origin
});

test('creator surface does not forward (consumes locally)',()=>{
  const c=ctx('creator','?brand=glowlab&magic=tok-5');
  vm.runInContext(tail,c);
  assert.equal(c.replaced.length,0);
});
