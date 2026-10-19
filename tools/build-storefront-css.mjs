import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {transform} from 'esbuild';
const sources=['styles.css','storefront-ux-refresh.css','home-hero-carousel.css','final-homepage.css','hero-editorial-20261018.css','hero-three-approved-20261018.css','hero-polish-20261018.css','hero-stable-controls-20261019.css'];
const parts=await Promise.all(sources.map(p=>readFile(new URL('../'+p,import.meta.url),'utf8')));
const hash=createHash('sha256').update(parts.join('\n')).digest('hex');
const result=await transform(parts.join('\n'),{loader:'css',minify:true,target:['chrome110','firefox115','safari16.4'],legalComments:'none'});
const css='/* Source order: '+sources.join(', ')+'; SHA256 '+hash+' */\n'+result.code;
const target=new URL('../storefront-bundle.css',import.meta.url);
if(process.argv.includes('--check')){if(await readFile(target,'utf8')!==css)throw Error('Storefront CSS bundle is stale. Run node tools/build-storefront-css.mjs.');console.log('Storefront CSS source order and bundle verified.');}
else{await writeFile(target,css);console.log(JSON.stringify({sources:parts.reduce((n,s)=>n+Buffer.byteLength(s),0),bundle:Buffer.byteLength(css),requests:1}));}
