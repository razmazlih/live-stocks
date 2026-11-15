// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const prepare=readFileSync(new URL('../scripts/prepare-account-migration.mjs',import.meta.url),'utf8');
const restore=readFileSync(new URL('../scripts/restore-account-backup.mjs',import.meta.url),'utf8');
const sqlTemplates=source=>source.match(/`[^`]*string_agg[^`]*`/g)??[];
const digest=rows=>createHash('md5').update(rows.map(row=>createHash('md5').update(JSON.stringify(row)).digest('hex')).join('')).digest('hex');

describe('portable final auth-store backup digest contract',()=>{
 it('pins bytewise ID ordering in every auth capture, restore and preservation aggregate',()=>{
  const auth=[...sqlTemplates(prepare),...sqlTemplates(restore)].filter(sql=>sql.includes('from livestocks_auth.'));
  expect(auth).toHaveLength(4);
  for(const sql of auth)expect(sql).toMatch(/order by id collate "C"/);
 });
 it('versions both real and nested manifests and rejects an unversioned final-store archive before restore',()=>{
  expect(prepare).toContain("manifest.authStoreDigestOrder='id COLLATE C'");
  expect(restore).toContain("nestedManifest.authStoreDigestOrder='id COLLATE C'");
  const guard=restore.indexOf("if(sourceHasAuth&&manifest.authStoreDigestOrder!=='id COLLATE C')fail(");
  expect(guard).toBeGreaterThan(0);
  expect(guard).toBeLessThan(restore.indexOf("const archivePath ="));
 });
 it('does not apply text collation to the existing financial UUID digests',()=>{
  const financial=[...sqlTemplates(prepare),...sqlTemplates(restore)].filter(sql=>sql.includes('from public.${table}'));
  expect(financial.length).toBeGreaterThanOrEqual(5);
  for(const sql of financial){expect(sql).toContain('order by id');expect(sql).not.toContain('collate');}
 });
 it('reproduces a different legacy digest from identical mixed-case text-ID rows',()=>{
  const rows=['z','A','a','Z','a1','A1'].map(id=>({id,value:'same synthetic record'}));
  const locale=new Intl.Collator('en-US');
  const localOrder=[...rows].sort((a,b)=>locale.compare(a.id,b.id));
  const byteOrder=[...rows].sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id)));
  expect(localOrder.map(row=>row.id)).not.toEqual(byteOrder.map(row=>row.id));
  expect(digest(localOrder)).not.toBe(digest(byteOrder));
  expect(digest([...localOrder].sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id))))).toBe(digest(byteOrder));
 });
});
