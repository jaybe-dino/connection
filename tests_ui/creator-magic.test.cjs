const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('packages/demo-core/src/engine-live.js','utf8');
const code=source.slice(source.indexOf('    var creatorMagicBusy=false;'),source.indexOf('    window.creatorJoin='));
function harness(req){
 const fields={crEmail:{value:'qa@example.com'},crLoginStatus:{textContent:''},crLoginButton:{disabled:false}};
 const ctx={window:{},document:{getElementById:id=>fields[id]},req,magicSent:false,renderCount:0,render(){ctx.renderCount++},toast(){},location:{origin:'https://app.theprlist.net'}};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,fields};
}
test('failed delivery remains visible and never claims a sent email',async()=>{
 const {ctx,fields}=harness(async()=>({ok:true,sent:false,hint:'메일 발송 실패'}));
 await ctx.window.creatorMagic();assert.equal(ctx.magicSent,false);assert.equal(ctx.renderCount,0);assert.equal(fields.crLoginStatus.textContent,'메일 발송 실패');assert.equal(fields.crEmail.value,'qa@example.com');assert.equal(fields.crLoginButton.disabled,false);
});
test('account-type rejection is retained as text',async()=>{
 const {ctx,fields}=harness(async()=>{throw new Error('이 이메일은 비밀번호 로그인 계정입니다')});
 await ctx.window.creatorMagic();assert.match(fields.crLoginStatus.textContent,/비밀번호 로그인/);assert.equal(ctx.magicSent,false);
});
test('duplicate clicks are blocked while request is pending, then retry is enabled',async()=>{
 let resolve,calls=0;const {ctx,fields}=harness(()=>{calls++;return new Promise(r=>resolve=r)});
 const p=ctx.window.creatorMagic();await ctx.window.creatorMagic();assert.equal(calls,1);assert.equal(fields.crLoginButton.disabled,true);resolve({sent:true});await p;assert.equal(ctx.magicSent,true);assert.equal(ctx.renderCount,1);assert.equal(fields.crLoginButton.disabled,false);
});
test('missing sent result fails closed; demo link does not claim email delivery',async()=>{
 for(const result of [{ok:true},{demoLink:'https://theprlist.net/?magic=local-test'}]){
 const {ctx}=harness(async()=>result);await ctx.window.creatorMagic();assert.equal(ctx.magicSent,false);
 }
});
