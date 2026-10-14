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
test('200-recipient review and batch pause controls are visible',()=>{
 const c={window:{__ME:{kind:'admin'},__GMAIL:{accounts:[{accountId:'a',email:'qa@example.com',remainingToday:200}]}},outreachData:{batches:[{id:'00000000-0000-0000-0000-000000000001',subject:'QA',body:'Review',state:'approved',paused:true,recipients:[{email:'c@example.com',state:'pending'}]}]},BRAND:()=> 'qa',outreachTargetBrand:'',outreachTargetProducts:[],outreachTargets:[],mailEscape:x=>String(x),productsData:[],composeBusy:false,outreachError:'',outreachLoading:false};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  function outreachCard()'),source.indexOf('  var gmailLoadState=')),c);
 const html=c.outreachCard();assert.ok(html.includes('최대 200명'));assert.ok(html.includes('수신자 사전 검수'));assert.ok(html.includes('검토 후 재개'));assert.ok(!html.includes('남은 수신자 발송'));
});
test('company proposal uses target products and discards AI result after target changes',async()=>{
 const fields={outBrief:{value:'Approved customer proposal'},outSubject:{value:''},outBody:{value:''},outProduct:{value:'customer-product'},outTarget:{value:'customer-a'}};
 let resolve,payload;const c={window:{},document:{getElementById:id=>fields[id]},productsData:[],outreachTargetProducts:[{productId:'customer-product'}],BRAND:()=> 'dino-recruitment',jwtGet:()=> 'fake-session',toast(){},mailEscape:x=>x,req:(method,path,p)=>{payload=p;return new Promise(r=>resolve=r)}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  var composeBusy='),source.indexOf('  window.outreachPreview=')),c);
 const task=c.window.outreachCompose();assert.equal(payload.target_brand_id,'customer-a');assert.equal(payload.product_id,'customer-product');
 fields.outTarget.value='customer-b';resolve({subject:'Old customer subject',body:'Old customer offer'});await task;
 assert.equal(fields.outSubject.value,'');assert.equal(fields.outBody.value,'');
});
