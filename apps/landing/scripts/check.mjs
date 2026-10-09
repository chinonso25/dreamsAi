import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=path.resolve(import.meta.dirname,'../dist');
const files=await fs.readdir(dir,{recursive:true});
let pages=0, links=0;
for(const file of files.filter(f=>f.endsWith('.html'))){
 const html=await fs.readFile(path.join(dir,file),'utf8');
 assert.equal((html.match(/<h1[ >]/g)||[]).length,1,`${file}: one H1`);
 assert.match(html,/<main id="main"/);assert.match(html,/<html lang=/);
 if(file==='404.html'){assert.match(html,/content="noindex"/);continue;}
 pages++;
 assert.match(html,/<meta name="description" content=".{70,180}"/);
 assert.match(html,/<link rel="canonical" href="https:\/\/thedreamer.app\//);
 assert.match(html,/app-id=6740153274/);assert.match(html,/og:image/);
 const graph=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
 assert(graph['@graph'].some(x=>x['@type']==='MobileApplication'));
 for(const m of html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)){
  const target=m[1].split(/[?#]/)[0];
  if(target==='/download')continue;
  let local=path.join(dir,target==='/'?'index.html':target.slice(1));
  if(!path.extname(local))local+='.html';
  await fs.access(local).catch(()=>{throw new Error(`${file}: broken link ${target}`)});links++;
 }
 for(const m of html.matchAll(/<img\b([^>]+)>/g)){assert.match(m[1],/alt=/);assert.match(m[1],/width=/);assert.match(m[1],/height=/);}
}
const home=await fs.readFile(path.join(dir,'index.html'),'utf8');
const graph=JSON.parse(home.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
for(const q of graph['@graph'].find(x=>x['@type']==='FAQPage').mainEntity){assert(home.includes(q.name.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')));assert(home.includes(q.acceptedAnswer.text.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')));}
const sitemap=await fs.readFile(path.join(dir,'sitemap.xml'),'utf8');assert.equal((sitemap.match(/<loc>/g)||[]).length,pages);
assert.match(await fs.readFile(path.join(dir,'robots.txt'),'utf8'),/Allow: \/\n/);
console.log(`Validated ${pages} indexable pages, ${links} local links/assets, JSON-LD, visible FAQ parity, image attributes, robots.txt, and sitemap.`);
