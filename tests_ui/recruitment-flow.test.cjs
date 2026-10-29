const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require(require.resolve('typescript',{paths:[path.resolve(__dirname,'../apps/admin')]}));
const source=fs.readFileSync(path.resolve(__dirname,'../apps/admin/src/screens/recruitmentFlow.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{}};vm.runInNewContext(js,context);const api=context.exports;
test('multi-brand candidate allocation respects email and known-person identity with explicit priority',()=>{
 const a={candidateId:'1',identityKey:'person-a',email:' A@EXAMPLE.TEST ',matchedTerms:2};
 const b={candidateId:'2',identityKey:'person-a',email:'alias@example.test',matchedTerms:2};
 const c={candidateId:'3',identityKey:'person-c',email:'c@example.test',matchedTerms:0};
 const d={candidateId:'4',identityKey:'person-d',email:'d@example.test',matchedTerms:1};
 const r=api.chooseUniqueCohorts([{candidates:[a,c]},{candidates:[b,a,d]}],2,true);
 assert.equal(r[0].candidates.length,1);assert.equal(r[0].candidates[0].email,'a@example.test');
 assert.equal(r[1].candidates.length,1);assert.equal(r[1].candidates[0].candidateId,'4');
 assert.equal(r[1].sharedSkipped,2);
 assert.equal(api.chooseUniqueCohorts([{candidates:[c]}],1,false)[0].candidates.length,1);
});
test('proposal language is never inferred as creator language and repeat runs requery conditions',()=>{
 const r=api.cohortRequest({...api.emptyFilters,countries:''},'US');
 assert.equal(JSON.stringify(r.languages),'[]');assert.equal(JSON.stringify(r.countries),'["US"]');
 assert.equal(r.allow_unverified,false);assert.equal(r.limit,1000);
});
test('repeat preparation dates preserve day and clamp month boundaries',()=>{
 assert.equal(api.nextPreparationDate('2026-01-31','monthly'),'2026-02-28');
 assert.equal(api.nextPreparationDate('2028-01-31','monthly'),'2028-02-29');
 assert.equal(api.nextPreparationDate('2026-12-28','weekly'),'2027-01-04');
});
test('reviewed proposal edits preserve customer product campaign sender and revision boundaries',()=>{
 const r=api.proposalBody({name:'One',target_brand_id:'customer',product_id:'product',gmail_account_id:'sender',campaign_id:'campaign',revision:4,secret:'not allowed'},{subject:'Reviewed'});
 assert.equal(r.target_brand_id,'customer');assert.equal(r.product_id,'product');assert.equal(r.gmail_account_id,'sender');
 assert.equal(r.revision,4);assert.equal(r.state,'active');assert.equal(r.subject,'Reviewed');assert.equal(r.secret,undefined);
});
test('recipient-facing introduction never copies private recommendation or verification notes',()=>{
 const row={reason:'Internal: email unverified; followers 25000; private review notes'};
 const intro=api.recipientIntro(row,{brand_name:'Brand',product_name:'Serum',language:'English'});
 assert.match(intro,/Brand/);assert.match(intro,/Serum/);assert.doesNotMatch(intro,/Internal|unverified|followers|private/);
 assert.equal(api.recipientIntro({publicIntro:'  Reviewed\nintro  '},{}),'Reviewed intro');
});
