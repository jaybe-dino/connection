const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const s=fs.readFileSync('packages/demo-core/src/engine-live.js','utf8');
test('magic links forward application context only to the fixed creator app',()=>{
 const tail=s.slice(s.indexOf('    var sp = new URLSearchParams(location.search);'),s.indexOf('    if (magicTok && !magicForward) {'));
 const urls=[];const c={window:{__SURFACE:'brand'},URLSearchParams,encodeURIComponent,location:{search:'?brand=fau&application=opaque-ctx&magic=login-token&redirect=https://evil.invalid',hostname:'theprlist.net',replace:u=>urls.push(u)},localStorage:{getItem:()=>null},authPanel(){}};
 vm.runInNewContext(tail,c);
 assert.equal(urls[0],'https://app.theprlist.net/?brand=fau&magic=login-token&application=opaque-ctx');
});
test('magic verification removes login secret but preserves customer application context without auto-joining',async()=>{
 const part=s.slice(s.indexOf('    if (magicTok && !magicForward) {'),s.indexOf('    if (jwtGet()) {',s.indexOf('    if (magicTok && !magicForward) {')));
 const calls=[],urls=[];const c={magicTok:'token',magicForward:false,sp:new URLSearchParams('?magic=token&brand=returnu&application=opaque'),URLSearchParams,window:{},location:{pathname:'/'},history:{replaceState:(a,b,u)=>urls.push(u)},req:(m,u,b)=>{calls.push(u);return Promise.resolve({token:'session',user:{email:'demo@example.invalid'}})},jwtSet(){},authChip(){},toast(){},loadCreatorData(){}};
 vm.runInNewContext(part,c);await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls,['/auth/magic/verify']);assert.equal(urls[0],'/?brand=returnu&application=opaque');
});
test('enrollment needs explicit consent and sends no mutable brand/product IDs',async()=>{
 const part=s.slice(s.indexOf('    window.creatorApplyRecruitment=function(){'),s.indexOf('    function recruitmentCard(){'));
 let consent=false;const calls=[];const c={window:{},applicationBusy:false,applicationContext:{brandId:'fau'},applicationError:'',applicationToken:'opaque',applicationDone:false,document:{getElementById:()=>({checked:consent})},req:(m,u,b)=>{calls.push({m,u,b});return Promise.resolve({brandName:'FAU'})},render(){},toast(){},mailEscape:x=>x,loadCreatorData(){}};
 vm.runInNewContext(part,c);c.window.creatorApplyRecruitment();assert.equal(calls.length,0);
 consent=true;c.window.creatorApplyRecruitment();await new Promise(r=>setImmediate(r));
 assert.equal(calls.length,1);assert.equal(calls[0].u,'/recruitment-links/opaque/apply');assert.deepEqual(Object.keys(calls[0].b),[]);assert.equal(c.applicationDone,true);
});
test('all deployed live surfaces carry the same shared behavior and restored console palette',()=>{
 for(const app of ['console','creator-app','signup'])assert.equal(fs.readFileSync(`apps/${app}/public/engine-live.js`,'utf8'),s);
 const html=fs.readFileSync('apps/console/index.html','utf8');assert.match(html,/legacy-compat.css/);assert.doesNotMatch(html,/href="\/live-theme.css/);
});
