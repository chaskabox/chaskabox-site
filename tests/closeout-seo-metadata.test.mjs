import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const patch=await readFile(new URL('../tools/closeout-seo-metadata.sql',import.meta.url),'utf8');
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE products(id bigint PRIMARY KEY,name text,pack text,visibility text,updated_at timestamptz,seo_title text,seo_description text,price integer,image_url text,stock_state text,description text);
 CREATE TABLE product_versions(id bigint GENERATED ALWAYS AS IDENTITY,product_id bigint,snapshot jsonb,after_snapshot jsonb,changed_by text,change_type text);
 INSERT INTO products VALUES(14,'Mayfair | Cafe Biscuit','Pack of 24','visible','2026-10-20T07:13:19.88527Z',NULL,NULL,100,'original-14.webp','sourced_after_order','Original copy'),(67,'Giggly | Big Tinkle Kacha Mango Candy Jar','Pack of 50','visible','2026-10-20T07:13:19.88527Z',NULL,NULL,200,'original-67.webp','sourced_after_order','Original copy');`);
 return db;
}
test('reviewed SEO patch preserves product facts, stores reversible snapshots and is idempotent',async()=>{
 const db=await fixture();try{
  const before=(await db.query('SELECT to_jsonb(p) AS row FROM products p ORDER BY id')).rows;
  await db.exec(patch);await db.exec(patch);
  const after=(await db.query('SELECT to_jsonb(p) AS row FROM products p ORDER BY id')).rows;
  for(let i=0;i<2;i++){
   const {seo_title,seo_description,...facts}=after[i].row;
   assert.ok(seo_title.length<=65&&seo_description.length<=160);
   assert.deepEqual(facts,Object.fromEntries(Object.entries(before[i].row).filter(([key])=>!['seo_title','seo_description'].includes(key))));
  }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM product_versions')).rows[0].n,2);
 }finally{await db.close();}
});
test('concurrent owner edits abort the entire SEO patch',async()=>{
 const db=await fixture();try{
  await db.exec("UPDATE products SET seo_title='Owner edited title' WHERE id=67");
  await assert.rejects(db.exec(patch),/source changed/);await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT seo_title FROM products WHERE id=14')).rows[0].seo_title,null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM product_versions')).rows[0].n,0);
 }finally{await db.close();}
});
