const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const s=fs.readFileSync('packages/demo-core/src/engine-live.js','utf8');
const locale=s.slice(s.indexOf('  function creatorEntryLocale(){'),s.indexOf('  function authPanel(html)'));
test('explicit invitation locale overrides browser language without changing creator language profile',()=>{
 const c={URLSearchParams,location:{search:'?brand=fau&lang=en'},navigator:{language:'ko-KR'},window:{}};vm.createContext(c);vm.runInContext(locale,c);
 assert.equal(c.creatorEntryLocale(),'en');assert.equal(c.entryText('한국어','English'),'English');c.location.search='?lang=ko';assert.equal(c.creatorEntryLocale(),'ko');
});
test('public product introduction escapes text and URLs and never invents an image',()=>{
 const part=s.slice(s.indexOf('    function invitationProductHtml(){'),s.indexOf('    function recruitmentCard(){'));
 const escape=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
 const c={invitationProduct:{name:'<script>alert(1)</script>',summary:'Test <b>description</b>',imageUrl:'javascript:alert(1)'},mailEscape:escape,entryText:(ko,en)=>en};vm.createContext(c);vm.runInContext(part,c);
 let html=c.invitationProductHtml();assert.doesNotMatch(html,/<script|<img|<b>description/);assert.match(html,/&lt;script&gt;/);
 c.invitationProduct.imageUrl='https://cdn.example.test/product.png';html=c.invitationProductHtml();assert.match(html,/<img/);assert.match(html,/referrerpolicy="no-referrer"/);
});
test('email authentication cleans magic secret while preserving the invitation locale',async()=>{
 const part=s.slice(s.indexOf('    if (magicTok && !magicForward) {'),s.indexOf('    if (jwtGet()) {',s.indexOf('    if (magicTok && !magicForward) {')));
 const urls=[];const c={magicTok:'local-token',magicForward:false,sp:new URLSearchParams('?magic=local-token&brand=fau&application=opaque&lang=en'),URLSearchParams,window:{},location:{pathname:'/'},history:{replaceState:(a,b,u)=>urls.push(u)},req:()=>Promise.resolve({token:'session',user:{email:'qa@example.test'}}),jwtSet(){},authChip(){},toast(){},loadCreatorData(){}};
 vm.runInNewContext(part,c);await new Promise(r=>setImmediate(r));assert.equal(urls[0],'/?brand=fau&application=opaque&lang=en');assert.doesNotMatch(urls[0],/magic=/);
});
