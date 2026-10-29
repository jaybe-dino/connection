import {magicForwardUrl} from './magic-forward.js';
const p=new URLSearchParams(location.search),forward=magicForwardUrl(location.search);
if(forward)location.replace(forward);
else if(p.has('invite')||p.has('reset'))location.replace('/account.html'+location.search);
else if(location.pathname.replace(/\/$/,'')==='/signup')location.replace('/#apply');
