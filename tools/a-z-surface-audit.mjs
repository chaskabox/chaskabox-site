#!/usr/bin/env node
/* A-Z static surface inventory. Identifies candidates; not a real user acceptance receipt. */
import {readdir,readFile,stat} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname);
const skip=new Set(['node_modules','.git','.wrangler','images','database','docs','tests','tools','workers','functions','cloudflare','.github','test-results','.venv']);
async function walk(dir,files=[]){
 for(const it of await readdir(dir,{withFileTypes:true})){
  if(it.isDirectory()){if(!skip.has(it.name))await walk(join(dir,it.name),files);}
  else if(it.name.endsWith('.html'))files.push(join(dir,it.name));
 }
 return files;
}
const files=await walk(root),reports=[],missingScripts=[];
let forms=0,inputs=0,scripts=0,labels=0,duplicateIds=0;
for(const file of files){
 const source=await readFile(file,'utf8');
 const path=relative(root,file).replaceAll('\\','/');
 const list=[...source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(x=>x[1]);
 const styles=[...source.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/gi)].map(x=>x[1]);
 const ids=[...source.matchAll(/\bid=["']([^"']+)["']/gi)].map(x=>x[1]);
 const repeats=ids.filter((v,i)=>ids.indexOf(v)!==i);
 const countForms=(source.match(/<form\b/gi)||[]).length;
 const countInputs=(source.match(/<(?:input|textarea|select)\b/gi)||[]).length;
 const countLabels=(source.match(/<label\b/gi)||[]).length;
 const broken=[];
 for(const url of [...list,...styles]){
  if(!url.startsWith('/')||url.startsWith('//'))continue;
  const local=join(root,decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\/+/,''));
  if(!(await stat(local).catch(()=>null))?.isFile()){broken.push(url);missingScripts.push({page:path,url});}
 }
 forms+=countForms;inputs+=countInputs;scripts+=list.length;labels+=countLabels;duplicateIds+=repeats.length;
 reports.push({page:path,forms:countForms,fields:countInputs,labels:countLabels,scripts:list.length,missingAssets:broken,duplicateIds:[...new Set(repeats)]});
}
const admin=await readFile(join(root,'admin.html'),'utf8');
const nav=[...admin.matchAll(/class="admin-nav-btn"[^>]*data-view="([^"]+)"/g)].map(m=>m[1]);
const views=[...admin.matchAll(/class="admin-view"[^>]*id="view-([^"]+)"/g)].map(m=>m[1]);
const missingAdmin=nav.filter(n=>!views.includes(n)),orphanedAdmin=views.filter(n=>!nav.includes(n));
const report={sourceOnly:true,warning:'Static links/forms do not certify live authenticated saves, backend authorization, provider sends or real purchases.',pages:files.length,forms,fields:inputs,labels,scripts,duplicateIds,missingLocalAssets:missingScripts,admin:{buttons:nav.length,views:views.length,missingAdmin,orphanedAdmin},byPage:reports};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else console.log(JSON.stringify({pages:report.pages,forms,fields:inputs,labels,scripts,duplicateIds,brokenAssets:missingScripts.length,admin:report.admin,formPages:reports.filter(r=>r.forms).map(r=>({page:r.page,forms:r.forms,fields:r.fields}))}));
if(missingAdmin.length||orphanedAdmin.length)process.exitCode=1;
