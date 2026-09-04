import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
const u = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const a=u(101), b=u(102), file=u(201)+'.jpg';
const path=(c,id)=>`${c}/${u(id)}/${file}`;
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_user::text $$;
create table public.couples(id uuid primary key);
create table public.profiles(id uuid primary key,couple_id uuid);
create table public.places(couple_id uuid,image_url text);
create table public.memories(couple_id uuid,photo_urls text[]);
create table storage.buckets(id text primary key,name text,public boolean);
create table storage.objects(bucket_id text,name text,owner_id text,owner uuid,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema auth,storage to anon,authenticated;
grant all on storage.objects to anon,authenticated;
insert into public.couples values('${a}'),('${b}');
insert into public.profiles values('${u(1)}','${a}'),('${u(2)}','${a}'),('${u(3)}','${b}'),('${u(4)}',null);
insert into storage.objects values
('place-photos','legacy.jpg','${u(1)}',null),
('place-photos','ownerless.jpg',null,null),
('place-photos','conflict.jpg',null,null),
('place-photos','mismatch.jpg','${u(3)}',null),
('place-photos','unknown.jpg',null,null),
('other','untouched',null,null);
insert into public.places values('${a}','https://wogjafcgllidtbsmnltc.supabase.co/storage/v1/object/public/place-photos/legacy.jpg'),('${a}','storage://place-photos/conflict.jpg'),('${b}','storage://place-photos/conflict.jpg'),('${a}','storage://place-photos/mismatch.jpg');
insert into public.memories values('${a}',array['storage://place-photos/ownerless.jpg']);
create policy "broad" on storage.objects for all to public using(true) with check(true);
`);
const base=await readFile(new URL('../migrations/20260905000000_secure_place_photos.sql',import.meta.url),'utf8');
const couple=await readFile(new URL('../migrations/20260905010000_isolate_place_photos_by_couple.sql',import.meta.url),'utf8');
await db.exec(base);
await db.exec(`create policy "인증된 사용자 조회 허용" on storage.objects for select to authenticated using(bucket_id='place-photos');`);
await db.exec(couple);
async function as(id,sql) {
 await db.exec(`set role ${id===null?'anon':'authenticated'}`);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id===null?'':u(id)]);
 try{return (await db.query(sql)).rows;}finally{await db.exec('reset role');}
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
const visible=id=>as(id,"select name from storage.objects where bucket_id='place-photos' order by name");
await test('legacy owner + partner read, ownerless linked memory read',async()=>{
 assert.deepEqual(await visible(1),[{name:'legacy.jpg'},{name:'ownerless.jpg'}]);
 assert.deepEqual(await visible(2),await visible(1));
});
await test('anon, other couple, unlinked user denied despite broad policy',async()=>{
 for(const id of [null,3,4]) assert.deepEqual(await visible(id),[]);
});
await test('ambiguous/mismatched/unassigned files quarantined',async()=>{
 assert.equal((await db.query('select count(*)::int as n from public.place_photo_legacy_access where couple_id is null')).rows[0].n,3);
});
await test('new upload + partner read + own update',async()=>{
 await as(1,`insert into storage.objects values('place-photos','${path(a,1)}','${u(1)}',null)`);
 assert.equal((await as(2,`select * from storage.objects where name='${path(a,1)}'`)).length,1);
 assert.equal((await as(1,`update storage.objects set owner_id=owner_id where name='${path(a,1)}' returning name`)).length,1);
});
await test('foreign couple path, spoofed owner, flat path, anonymous writes denied',async()=>{
 for(const [id,name,owner] of [[1,path(b,1),u(1)],[1,path(a,2),u(1)],[1,path(a,1),u(2)],[1,'flat.jpg',u(1)],[null,'anon.jpg',null]])
 await assert.rejects(()=>as(id,`insert into storage.objects values('place-photos','${name}',${owner?`'${owner}'`:'null'},null)`),/row-level security/);
});
await test('partner and other couple cannot change/delete owned files or upsert',async()=>{
 for(const id of [2,3,null]) {
 assert.equal((await as(id,"update storage.objects set owner_id=owner_id where name='legacy.jpg' returning name")).length,0);
 assert.equal((await as(id,"delete from storage.objects where name='legacy.jpg' returning name")).length,0);
 }
 await assert.rejects(()=>as(3,`insert into storage.objects values('place-photos','${path(a,1)}','${u(3)}',null) on conflict(bucket_id,name) do update set owner_id=excluded.owner_id`),/row-level security/);
 await assert.rejects(()=>as(1,`update storage.objects set owner_id='${u(2)}' where name='legacy.jpg'`),/row-level security/);
});
await test('ownerless files not writable + immutable mapping inaccessible',async()=>{
 assert.equal((await as(1,"delete from storage.objects where name='ownerless.jpg' returning name")).length,0);
 await assert.rejects(()=>as(3,`insert into public.place_photo_legacy_access values('unknown.jpg','${b}')`),/permission denied/);
});
await test('copying foreign URLs after migration does not confer access, even on replay',async()=>{
 await db.exec(`insert into public.places values('${b}','storage://place-photos/legacy.jpg'),('${b}','storage://place-photos/unknown.jpg')`);
 const snapshot=(await db.query('select * from public.place_photo_legacy_access order by object_name')).rows;
 await db.exec(couple);
 assert.deepEqual((await db.query('select * from public.place_photo_legacy_access order by object_name')).rows,snapshot);
 assert.deepEqual(await visible(3),[]);
 await db.exec(base);
 assert.deepEqual(await visible(3),[]);
 assert.deepEqual(await visible(null),[]);
});
await test('owner deletion allowed, moving to another couple denied',async()=>{
 await assert.rejects(()=>as(1,`update storage.objects set name='${path(b,1)}' where name='${path(a,1)}'`),/row-level security/);
 const temp=`${a}/${u(1)}/${u(202)}.jpg`;
 await as(1,`insert into storage.objects values('place-photos','${temp}','${u(1)}',null)`);
 assert.equal((await as(1,`delete from storage.objects where name='${temp}' returning name`)).length,1);
});
await test('membership change revokes old couple access without moving legacy mapping',async()=>{
 await db.exec(`update public.profiles set couple_id='${b}' where id='${u(1)}'`);
 assert.deepEqual(await visible(1),[]);
 assert.equal((await visible(2)).length,3);
});
await test('other bucket permissions unchanged',async()=>{
 assert.equal((await as(null,"select * from storage.objects where bucket_id='other'")).length,1);
});
console.log(`${passed} couple-isolation scenarios passed; no live storage mutations.`);
await db.close();
