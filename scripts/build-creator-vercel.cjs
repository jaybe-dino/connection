// Build Output API: preserve the geolocation function on every prebuilt release.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');const out=path.resolve(process.argv[2]||path.join(root,'apps/creator-app/.vercel/output'));
fs.mkdirSync(out,{recursive:true});fs.cpSync(path.join(root,'apps/creator-app/dist'),path.join(out,'static'),{recursive:true});
const func=path.join(out,'functions/api/locale.func');fs.mkdirSync(func,{recursive:true});fs.copyFileSync(path.join(root,'apps/creator-app/server/locale.cjs'),path.join(func,'index.js'));
fs.writeFileSync(path.join(func,'.vc-config.json'),JSON.stringify({runtime:'nodejs22.x',handler:'index.js',launcherType:'Nodejs',shouldAddHelpers:true,maxDuration:10}));
fs.writeFileSync(path.join(out,'config.json'),JSON.stringify({version:3,routes:[{src:'/api/locale',dest:'/api/locale'},{handle:'filesystem'},{src:'/(.*)',dest:'/index.html'}]}));
