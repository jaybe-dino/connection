const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const s=fs.readFileSync('packages/demo-core/src/engine-live.js','utf8');
const fn=s.slice(s.indexOf('  window.setConversationLang'),s.indexOf('  window.langMenu'));
test('changing conversation language preserves unsent draft without calling account APIs',()=>{
 let input={value:'unsent draft'},lang=null;
 const c={window:{},LANGS:[['ko','한국어'],['en','English']],document:{getElementById:()=>input},applyLang(l){lang=l;input={value:''};}};
 vm.createContext(c);vm.runInContext(fn,c);
 c.window.setConversationLang('en');assert.equal(lang,'en');assert.equal(input.value,'unsent draft');
 c.window.setConversationLang('invalid');assert.equal(lang,'en');assert.equal(input.value,'unsent draft');
});
