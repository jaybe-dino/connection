const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('packages/demo-core/src/engine-live.js','utf8');
test('all five accounts render independently with controls',()=>{
 const c={window:{__GMAIL:{accounts:Array.from({length:5},(_,i)=>({accountId:'id'+i,email:'qa'+i+'@example.com',sentToday:0,todayCap:2,remainingToday:2}))}},gmailLoadState:'ready',gmailSyncBusy:false,gmailSyncNotice:'',mailEscape:x=>String(x)};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  function gmailCard()'),source.indexOf('  function inboxCard()')),c);
 const html=c.gmailCard();for(let i=0;i<5;i++)assert.ok(html.includes('qa'+i+'@example.com'));
 assert.equal((html.match(/연결 해제/g)||[]).length,6); // disclosure plus five buttons
 assert.ok(html.includes('Google 계정 추가 연결'));
});
test('draft requires sender and transmits selected account without sending',async()=>{
 const fields={outRecipients:{value:'qa@example.com'},outSubject:{value:'Offer'},outBody:{value:'Body'},outSender:{value:''}};
 const calls=[];const c={window:{},document:{getElementById:id=>fields[id]},outreachBusy:false,BRAND:()=> 'qa',toast(){},loadOutreach(){},req:async(m,path,p)=>{calls.push({path,p});return {};}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  window.outreachDraft ='),source.indexOf('  window.outreachSend =')),c);
 c.window.outreachDraft();assert.equal(calls.length,0);
 fields.outSender.value='chosen';c.window.outreachDraft();await new Promise(r=>setImmediate(r));
 assert.equal(calls.length,1);assert.equal(calls[0].p.gmail_account_id,'chosen');assert.ok(!calls[0].path.endsWith('/send'));
});
