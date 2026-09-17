// Materialize routes even when Vercel builds from the monorepo root.
import {mkdir,copyFile} from 'node:fs/promises';
for (const [route,source] of [['signup','index.html'],['privacy','privacy.html'],['terms','terms.html'],['account','account.html']]) {
  await mkdir(`dist/${route}`,{recursive:true});
  await copyFile(`dist/${source}`,`dist/${route}/index.html`);
}
