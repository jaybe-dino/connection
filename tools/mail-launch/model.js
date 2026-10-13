(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MailLaunch=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const norm=x=>String(x||'').trim().toLowerCase();
  const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
  const number=(v,label)=>{if(!Number.isSafeInteger(v)||v<0)throw Error(label+' must be a nonnegative integer');return v;};
  const timestamp=v=>{if(typeof v!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error('Timezone-aware timestamp required');return Date.parse(v);};
  async function digest(x){const c=typeof module==='object'&&module.exports?require('node:crypto').webcrypto:globalThis.crypto;if(!c||!c.subtle)throw Error('Secure browser context required');return Array.from(new Uint8Array(await c.subtle.digest('SHA-256',new TextEncoder().encode(canonical(x))))).map(x=>x.toString(16).padStart(2,'0')).join('');}
  function select(contacts,history,suppressed,reserved,campaign){
    const oldIds=new Set(history.map(x=>x.creatorId)),oldEmails=new Set(history.map(x=>norm(x.email))),blocked=new Set(suppressed.map(norm)),held=new Set(reserved.map(x=>x.creatorId)),heldEmails=new Set(reserved.map(x=>norm(x.email)));
    const ids=new Set(),emails=new Set(),out=[],excluded={invalid:0,permission:0,existing:0,suppressed:0,reserved:0,mismatch:0,duplicate:0};
    for(const c of contacts){const email=norm(c.email);let why;
      if(!c.creatorId||!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))why='invalid';
      else if(blocked.has(email))why='suppressed';
      else if(oldIds.has(c.creatorId)||oldEmails.has(email))why='existing';
      else if(held.has(c.creatorId)||heldEmails.has(email))why='reserved';
      else if(c.permission!=='permitted'||!c.permissionRef||!Array.isArray(c.allowedBrands)||!c.allowedBrands.includes(campaign.brandId))why='permission';
      else if(c.country!==campaign.country||!Array.isArray(c.categories)||!c.categories.includes(campaign.category))why='mismatch';
      else if(ids.has(c.creatorId)||emails.has(email))why='duplicate';
      if(why){excluded[why]++;continue;}ids.add(c.creatorId);emails.add(email);out.push({...c,email});
    }return {eligible:out,excluded};
  }
  function capacity(pools){const seen=new Set();let total=0;for(const p of pools){if(!p.quotaKey)throw Error('Underlying provider quota key required');if(seen.has(p.quotaKey))throw Error('Aliases/shared quota cannot be counted twice');seen.add(p.quotaKey);
    if(p.status!=='verified'||p.paused||p.providerApproved!==true)continue;
    for(const k of ['providerCap24h','used24h','reserved','appCap','appUsed','operatorCap'])number(p[k],k);
    total+=Math.max(0,Math.min(p.providerCap24h-p.used24h,p.appCap-p.appUsed,p.operatorCap)-p.reserved);
  }return total;}
  async function review(input){number(input.target,'target');if(input.target===0)throw Error('Target must be positive');number(input.windowHours,'windowHours');if(!input.windowHours||input.windowHours>24)throw Error('Window must be 1..24 hours');
    if(!input.campaign.brandId||!input.campaign.offerVersion||!input.campaign.subject||!input.campaign.body||!input.campaign.sender||!input.campaign.replyTo||!input.campaign.unsubscribeUrl||!/^https:\/\//.test(input.campaign.unsubscribeUrl))throw Error('Complete campaign, sender, reply and unsubscribe settings required');
    timestamp(input.scheduleAt);const r=select(input.contacts,input.history,input.suppressed,input.reserved,input.campaign),cap=capacity(input.pools),count=Math.min(input.target,r.eligible.length,cap);
    const manifest={schemaVersion:1,mode:'offline_review_only',campaign:input.campaign,scheduleAt:input.scheduleAt,windowHours:input.windowHours,target:input.target,recipientIds:r.eligible.slice(0,count).map(x=>x.creatorId),recipientFingerprint:await digest(r.eligible.slice(0,count).map(x=>({creatorId:x.creatorId,email:x.email,permissionRef:x.permissionRef}))),poolFingerprint:await digest(input.pools),policyVersion:input.policyVersion,sendingEnabled:false};
    const blockers=[];if(count<input.target)blockers.push('Target exceeds verified capacity or eligible supply');if(!input.policyVersion)blockers.push('Policy version missing');
    return {manifest,manifestHash:await digest(manifest),count,eligible:r.eligible.length,capacity:cap,excluded:r.excluded,intervalSeconds:count?input.windowHours*3600/count:null,blockers};
  }
  async function checkApproval(manifest,approval,now){if(!approval||approval.purpose!=='offline_review_record')return false;timestamp(now);if(timestamp(approval.expiresAt)<=timestamp(now))return false;if(timestamp(approval.reviewedAt)>timestamp(now))return false;return !!approval.reviewer&&approval.manifestHash===await digest(manifest);}
  return {norm,canonical,digest,select,capacity,review,checkApproval};
});
