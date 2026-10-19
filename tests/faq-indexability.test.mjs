import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {storeFaqs} from '../functions/api/_lib/faq-content.js';
import {withSeo,organizationSchema} from '../functions/api/_lib/storefront-html.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const pages=[
'index.html','shop/index.html','bundles/index.html','brands/index.html','brand/index.html',
'category/betel-nuts-and-pan-masala/index.html','category/biscuits-and-wafers/index.html',
'category/bunties-and-cakes/index.html','category/chews-and-gums/index.html',
'category/chocolates-and-candies/index.html','category/imli-and-ice-lollies/index.html',
'category/jellies-and-marshmallow/index.html','category/snacks-and-nimco/index.html',
'about/index.html','contact/index.html','guides/index.html',
'guides/choosing-a-snack-box/index.html','guides/bachpan-snacks-pakistan/index.html',
'guides/how-chaskabox-orders-work/index.html','shipping-policy/index.html',
'refund-policy/index.html','privacy-policy/index.html','terms/index.html',
'snack-boxes/index.html','faq/index.html'
];
test('public pages expose FAQ through regular crawlable help links',()=>{
 for(const page of pages){
  const html=read(page);
  assert.match(html,/<a href="\/faq\/">Frequently Asked Questions<\/a>/,page);
  assert.equal((html.match(/<a href="\/faq\/">Frequently Asked Questions<\/a>/g)||[]).length,1,page);
 }
 const home=read('index.html');
 assert.ok(home.indexOf('href="/faq/"')>home.indexOf('<footer'),'FAQ belongs to the real DOM footer');
 const guides=read('guides/index.html');
 assert.match(guides,/Questions about ordering, advance payments or delivery\? <a href="\/faq\/">Read our frequently asked questions<\/a>/);
});

test('FAQ canonical and sitemap are indexable with no crawler block',()=>{
 const sitemap=read('sitemap.xml');
 assert.equal((sitemap.match(/<loc>https:\/\/chaskabox\.online\/faq\/<\/loc>/g)||[]).length,1);
 const robots=read('robots.txt');
 assert.match(robots,/User-agent:\s*\*/);
 assert.doesNotMatch(robots,/Disallow:\s*\/faq\//i);
 assert.match(robots,/Sitemap: https:\/\/chaskabox.online\/sitemap.xml/);
 const staticFaq=read('faq/index.html');
 assert.match(staticFaq,/rel="canonical" href="https:\/\/chaskabox.online\/faq\//);
 assert.doesNotMatch(staticFaq,/<meta name="robots" content="noindex/i);
 const fn=read('functions/faq/index.js');
 assert.match(fn,/path:'\/faq\/'/);
 assert.doesNotMatch(fn,/noindex:\s*true/);
});

test('FAQ response schema is conservative and sources live answers',()=>{
 const faqs=storeFaqs({cod_enabled:true,cod_advance_enabled:true,cod_advance_amount_pkr:500});
 assert.ok(faqs.length>=5);
 assert.ok(faqs.every(f=>f.q&&f.a));
 const html=withSeo('<!doctype html><html lang="en"><head><title>Old</title></head><body><main>Questions</main></body></html>',{title:'ChaskaBox FAQs',description:'Ordering questions',path:'/faq/',schemas:[organizationSchema()]});
 assert.match(html,/<meta name="robots" content="index,follow">/);
 assert.match(html,/<link rel="canonical" href="https:\/\/chaskabox.online\/faq\/">/);
 assert.doesNotMatch(html,/"@type":"FAQPage"/);
 assert.doesNotMatch(html,/hasMerchantReturnPolicy/);
});
