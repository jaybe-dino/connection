const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('packages/demo-core/src/engine-live.js','utf8');
const script=source.slice(source.indexOf('  var bulkMappings='),source.indexOf('  window.inboxSend ='));
function context(){
 const els={bulkKey:{value:'us-balm'},outProduct:{value:'p1'},outSender:{value:'sender1'},outSubject:{value:'{{name}} offer'},outBody:{value:'{{product}}'},outTarget:{value:'target1'},bulkRows:{value:'email\tmapping_key\tname\treason\na@qa.example\tus-balm\tAlex\tBeauty'}};
 const c={window:{crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}},document:{getElementById:id=>els[id]},els,brand:'source',BRAND:()=>c.brand,jwtGet:()=> 'qa-token',outreachTargets:[],toasts:[],reqs:[],render(){},mailEscape:x=>String(x),toast:(t,m)=>c.toasts.push(t+':'+m),loadOutreach(){},req:async(m,p,b)=>{c.reqs.push({m,p,b});return {reviewHash:'a'.repeat(64),eligibleCount:1,batchIds:['b1']};}};
 vm.createContext(c);vm.runInContext(script,c);return c;
}
test('mapping copies product brand sender and parses spreadsheet tabs without sending',async()=>{
 const c=context();c.window.bulkAddMapping();await c.window.bulkPreview();
 assert.equal(c.reqs[0].p,'/brands/source/outreach/bulk/preview');
 assert.equal(c.reqs[0].b.mappings[0].target_brand_id,'target1');
 assert.equal(c.reqs[0].b.mappings[0].product_id,'p1');
 assert.equal(c.reqs[0].b.rows[0].name,'Alex');
 await c.window.bulkSave();assert.equal(c.reqs[1].p,'/brands/source/outreach/bulk/drafts');
 assert.equal(c.reqs[1].b.request_id,'11111111-1111-4111-8111-111111111111');
 assert.ok(!c.reqs.some(r=>r.p.endsWith('/send')));
});
test('editing recipients invalidates review and prevents saving old mapping',async()=>{
 const c=context();c.window.bulkAddMapping();await c.window.bulkPreview();
 c.els.bulkRows.value+='\nb@qa.example\tus-balm';await c.window.bulkSave();
 assert.equal(c.reqs.length,1);assert.match(c.toasts.join(),/다시 검수/);
});
test('late preview cannot move between company and customer contexts',async()=>{
 const c=context();let resolve;c.req=()=>new Promise(r=>resolve=r);
 c.window.bulkAddMapping();const p=c.window.bulkPreview();c.brand='other';
 resolve({eligibleCount:1,reviewHash:'a'.repeat(64)});await p;
 assert.equal(vm.runInContext('bulkReview',c),null);
});
test('retry after uncertain save retains request id for idempotency',async()=>{
 const c=context();c.window.bulkAddMapping();await c.window.bulkPreview();
 const ids=[];c.req=async(m,p,b)=>{ids.push(b.request_id);throw new Error('temporary failure');};
 await c.window.bulkSave();await c.window.bulkSave();assert.equal(ids[0],ids[1]);
});
test('missing product or duplicate mapping key cannot register a second assignment',()=>{
 const c=context();c.els.outProduct.value='';c.window.bulkAddMapping();
 assert.equal(vm.runInContext('bulkMappings.length',c),0);
 c.els.outProduct.value='p1';c.window.bulkAddMapping();c.window.bulkAddMapping();
 assert.equal(vm.runInContext('bulkMappings.length',c),1);
});
