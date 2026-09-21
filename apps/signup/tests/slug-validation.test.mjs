import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSlug,slugProblem,availabilityMessage} from '../public/slug-validation.js';
test('normalizes a brand name and rejects a homepage URL',()=>{
 assert.equal(normalizeSlug(' Exoproxyl '),'exoproxyl');
 assert.equal(slugProblem('Exoproxyl'),'');
 for(const url of ['https://exoproxyl.com/','exoproxyl.com','/exoproxyl'])assert.match(slugProblem(url),/홈페이지 URL/);
 for(const value of ['', 'ab', '엑소프록실', '-brand', 'a'.repeat(41)])assert.notEqual(slugProblem(value),'');
 for(const value of ['abc','exoproxyl','brand-123','a'.repeat(40)])assert.equal(slugProblem(value),'');
});
test('availability reasons distinguish a pending application from registered and reserved names',()=>{
 assert.match(availabilityMessage({available:true}),/사용 가능한/);
 assert.match(availabilityMessage({available:false,reason:'pending'}),/본인이 접수/);
 assert.match(availabilityMessage({available:false,reason:'registered'}),/로그인/);
 assert.match(availabilityMessage({available:false,reason:'reserved'}),/서비스에서/);
 assert.match(availabilityMessage({available:false,reason:'invalid'}),/형식/);
 assert.match(availabilityMessage({available:false}),/기존 신청 여부/);
 assert.doesNotMatch(availabilityMessage({}),/사용 가능한/);
});
