const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('apps/signup/public/site.js','utf8');
const code=source.slice(source.indexOf('const fieldLabel='),source.indexOf("form.addEventListener('submit'"));

test('invalid fields produce one summary without recursively dispatching invalid events',()=>{
  let listener,serial=0,validityCalls=0;
  const timers=new Map(),messages=[];
  const fields=['브랜드명','담당자 이메일'].map(label=>({
    willValidate:true,validity:{valid:false},name:label,
    closest:()=>({textContent:label}),
    checkValidity(){validityCalls++;listener();return false;}
  }));
  const context={form:{elements:fields,addEventListener(type,fn){assert.equal(type,'invalid');listener=fn;}},
    setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);},
    show:(...args)=>messages.push(args)};
  vm.runInNewContext(code,context);
  fields.forEach(()=>listener());
  assert.equal(timers.size,1,'one browser submit can invalidate multiple fields');
  const [id,run]=[...timers][0];timers.delete(id);run();
  assert.equal(validityCalls,0,'reading validity must not emit another invalid event');
  assert.equal(timers.size,0,'summary must not schedule itself indefinitely');
  assert.deepEqual(messages,[['#submitStatus','입력을 확인해 주세요: 브랜드명, 담당자 이메일',true]]);
  fields.forEach(field=>{field.validity.valid=true;});
  listener();const [nextId,nextRun]=[...timers][0];timers.delete(nextId);nextRun();
  assert.equal(messages.length,1,'corrected inputs must not create a new error');
});
