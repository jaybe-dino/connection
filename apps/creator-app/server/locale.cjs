// Only country-level Vercel edge metadata. Never store or return the visitor IP.
const supported=['ko','en','th','vi','ja'];
function detect(headers){
  const country=String(headers['x-vercel-ip-country']||'').trim().toUpperCase();
  const mapped={KR:'ko',TH:'th',VN:'vi',JP:'ja'};
  if(/^[A-Z]{2}$/.test(country)&&country!=='XX')return {locale:mapped[country]||'en',country,source:'ip'};
  const langs=String(headers['accept-language']||'').split(',').map((part,i)=>{const [tag,...params]=part.trim().split(';');const q=params.find(p=>p.trim().startsWith('q='));return {code:tag.toLowerCase().split('-')[0],q:q?Number(q.trim().slice(2)):1,i};}).filter(x=>Number.isFinite(x.q)&&x.q>0&&x.q<=1).sort((a,b)=>b.q-a.q||a.i-b.i);
  return {locale:(langs.find(x=>supported.includes(x.code))||{}).code||'en',country:'',source:langs.some(x=>supported.includes(x.code))?'accept-language':'default'};
}
module.exports=function(req,res){res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Vary','Accept-Language');if(req.method!=='GET'){res.statusCode=405;res.setHeader('Allow','GET');return res.end(JSON.stringify({error:'Method not allowed'}));}res.end(JSON.stringify(detect(req.headers)));};
module.exports.detect=detect;
