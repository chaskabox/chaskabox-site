import { readdir, readFile, writeFile } from 'node:fs/promises';
const paths=(await readdir(new URL('../images/',import.meta.url))).filter(p=>/\.(webp|png|jpe?g)$/i.test(p)).sort().map(p=>'images/'+p);
const outputs=[['../photo-manifest.js','window.CHASKABOX_LOCAL_PHOTOS='+JSON.stringify(paths)+';\n'],['../functions/api/_lib/local-photos.js','export const LOCAL_PHOTOS=new Set('+JSON.stringify(paths)+');\n']];
for(const [path,content] of outputs){const url=new URL(path,import.meta.url);if(process.argv.includes('--check')){if(await readFile(url,'utf8')!==content)throw Error('Photo manifest is stale; run node tools/build-photo-manifest.mjs');}else await writeFile(url,content);}
if(process.argv.includes('--check')){
  let entries=0;
  async function inspect(directory){
    for(const item of await readdir(directory,{withFileTypes:true})){
      if(['node_modules','.git','.wrangler'].includes(item.name))continue;
      const url=new URL(item.name+(item.isDirectory()?'/':''),directory);
      if(item.isDirectory()){await inspect(url);continue;}
      if(!item.name.endsWith('.html'))continue;
      const html=await readFile(url,'utf8');
      const scripts=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>m[1].split('?')[0]);
      const app=scripts.indexOf('/app.js');if(app<0)continue;
      const manifest=scripts.indexOf('/photo-manifest.js');
      if(manifest<0||manifest>app)throw Error('Photo manifest must load before app.js: '+url.pathname);
      entries++;
    }
  }
  await inspect(new URL('../',import.meta.url));
  console.log('Photo manifests and '+entries+' storefront entry points verified.');
}
