const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const s=fs.readFileSync('packages/demo-core/src/engine-live.js','utf8');
const block=s.slice(s.indexOf("  var gmailLoadState="),s.indexOf('  window.gmailConnect ='));
function ctx(){const c={window:{},brand:'qa',token:'a',BRAND:()=>c.brand,jwtGet:()=>c.token,req:async()=>[]};vm.createContext(c);vm.runInContext(block,c);return c;}
for(const [load,state,key,result] of [['loadGmail','gmailLoadState','__GMAIL',{accounts:[]}],['loadInbox','inboxLoadState','__INBOX',[]]]){
 test(load+' distinguishes failure and supports retry',async()=>{const c=ctx();c.req=async()=>{throw Error('offline')};await c[load]();assert.equal(c[state],'error');assert.equal(c.window[key],null);c.req=async()=>result;await c[load]();assert.equal(c[state],'ready');assert.deepEqual(c.window[key],result);});
 test(load+' ignores old or cross-account responses',async()=>{const c=ctx(),res=[];c.req=()=>new Promise(r=>res.push(r));const a=c[load](),b=c[load]();res[1](result);await b;res[0](null);await a;assert.equal(c[state],'ready');const d=c[load]();c.brand='other';res[2](result);await d;assert.equal(c.window[key],null);});
}
