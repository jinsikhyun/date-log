// Isolated PostgreSQL tests; no live Supabase access.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
const uid = '00000000-0000-4000-8000-000000000001';
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_user::text $$;
create table storage.buckets(id text primary key, name text, public boolean);
create table storage.objects(bucket_id text, name text, owner_id text, unique(bucket_id,name));
grant usage on schema storage, auth to anon, authenticated;
grant all on storage.objects to anon, authenticated;
insert into storage.buckets values('place-photos','place-photos',true),('other','other',true);
insert into storage.objects values('place-photos','own','${uid}'),('place-photos','other','00000000-0000-4000-8000-000000000002'),('place-photos','ownerless',null),('other','untouched',null);
create policy "place-photos: public insert" on storage.objects for insert to anon with check(true);
create policy "unrelated broad policy" on storage.objects for all to public using(true) with check(true);
`);
const migration = await readFile(new URL('../migrations/20260905000000_secure_place_photos.sql', import.meta.url),'utf8');
const legacy = await readFile(new URL('../storage_place_photos.sql', import.meta.url),'utf8');
// Fail closed when managed Storage RLS is absent, then model Supabase's enabled RLS.
await assert.rejects(() => db.exec(migration), /RLS is disabled or missing/);
await db.exec('rollback');
assert.equal((await db.query("select public from storage.buckets where id='place-photos'")).rows[0].public,true);
await db.exec('alter table storage.objects enable row level security');
await db.exec(migration);
await db.exec(migration);
await db.exec(legacy);
async function as(role, sql) {
 await db.exec(`set role ${role}`);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[role==='anon'?'':uid]);
 try { return await db.query(sql); } finally { await db.exec('reset role'); }
}
const rows = async (role,sql) => (await as(role,sql)).rows;
assert.equal((await db.query("select public from storage.buckets where id='place-photos'")).rows[0].public,false);
assert.equal((await db.query("select public from storage.buckets where id='other'")).rows[0].public,true);
assert.equal((await rows('anon',"select * from storage.objects where bucket_id='place-photos'")).length,0);
await assert.rejects(()=>as('anon',"insert into storage.objects values('place-photos','attack',null)"),/row-level security/);
for (const sql of ["update storage.objects set name='attack' where bucket_id='place-photos' returning *", "delete from storage.objects where bucket_id='place-photos' returning *"])
 assert.equal((await rows('anon',sql)).length,0);
assert.equal((await rows('authenticated',"select * from storage.objects where bucket_id='place-photos'")).length,3);
await as('authenticated',`insert into storage.objects values('place-photos','new','${uid}')`);
await assert.rejects(()=>as('authenticated',"insert into storage.objects values('place-photos','fake','someone-else')"),/row-level security/);
await assert.rejects(()=>as('authenticated',"update storage.objects set owner_id='someone-else' where name='own'"),/row-level security/);
for (const name of ['other','ownerless']) {
 assert.equal((await rows('authenticated',`update storage.objects set name='attack' where bucket_id='place-photos' and name='${name}' returning *`)).length,0);
 assert.equal((await rows('authenticated',`delete from storage.objects where bucket_id='place-photos' and name='${name}' returning *`)).length,0);
}
await assert.rejects(()=>as('authenticated',`insert into storage.objects values('place-photos','other','${uid}') on conflict(bucket_id,name) do update set owner_id=excluded.owner_id`),/row-level security/);
assert.equal((await rows('authenticated',"update storage.objects set name='updated' where name='own' returning *")).length,1);
assert.equal((await rows('authenticated',"delete from storage.objects where name='updated' returning *")).length,1);
assert.equal((await rows('anon',"select * from storage.objects where bucket_id='other'")).length,1);
await as('anon',"insert into storage.objects values('other','allowed',null)");
assert.equal((await rows('anon',"delete from storage.objects where bucket_id='other' and name='allowed' returning *")).length,1);
console.log('PASS: private bucket, repeat application, anonymous CRUD denied, authenticated read, ownership CRUD/upsert restrictions, ownerless protection, broad-policy bypass denied, other bucket unchanged.');
await db.close();
