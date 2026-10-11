import { readdir, readFile, writeFile } from 'node:fs/promises';
const paths=(await readdir(new URL('../images/',import.meta.url))).filter(p=>/\.(webp|png|jpe?g)$/i.test(p)).sort().map(p=>'images/'+p);
const outputs=[['../photo-manifest.js','window.CHASKABOX_LOCAL_PHOTOS='+JSON.stringify(paths)+';\n'],['../functions/api/_lib/local-photos.js','export const LOCAL_PHOTOS=new Set('+JSON.stringify(paths)+');\n']];
for(const [path,content] of outputs){const url=new URL(path,import.meta.url);if(process.argv.includes('--check')){if(await readFile(url,'utf8')!==content)throw Error('Photo manifest is stale; run node tools/build-photo-manifest.mjs');}else await writeFile(url,content);}
