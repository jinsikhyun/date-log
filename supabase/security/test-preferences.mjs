// 운영 접속 없이 PostgreSQL WASM으로 RLS/마이그레이션 검증.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
await db.exec(`
 create role anon; create role authenticated; create schema auth; create schema datelog_private;
 create function auth.uid() returns uuid language sql stable as
 $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;
 create table public.profiles(id uuid primary key,couple_id uuid);
 create table public.places(id bigint primary key,couple_id uuid,favorite_by uuid[] default '{}',is_regular boolean default false);
 create function public.my_couple_id() returns uuid language sql stable security definer
 set search_path='' as $$select couple_id from public.profiles where id=auth.uid()$$;
 alter table public.places enable row level security;
 create policy places_couple on public.places for all to authenticated
 using(couple_id=public.my_couple_id()) with check(couple_id=public.my_couple_id());
 grant select,insert,update,delete on public.places to authenticated;
 insert into public.profiles values('${uid(1)}','${uid(10)}'),('${uid(2)}','${uid(10)}'),('${uid(3)}','${uid(20)}');
 insert into public.places values(1,'${uid(10)}',array['${uid(1)}'::uuid],true),(2,'${uid(20)}','{}',false);
`);
const sql = await readFile(new URL('./03_place_preferences.sql',import.meta.url),'utf8');
await db.exec(sql);
let tests=0;
async function test(name,fn){await fn();tests++;console.log(`PASS ${name}`);}
async function as(n,sql,params=[]){
 await db.exec(`set role ${n ? 'authenticated':'anon'}`);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);
 try{return await db.query(sql,params);}finally{await db.exec('reset role');}
}
await test('기존 pick 이관/공동 단골 보존',async()=>{
 assert.equal((await as(1,'select * from public.place_preferences')).rows.length,1);
 assert.equal((await as(1,'select is_regular from public.places where id=1')).rows[0].is_regular,true);
});
await test('본인 pick 추가, 상대방 pick 보존',async()=>{
 await as(2,"insert into public.place_preferences(place_id,user_id,kind) values(1,$1,'pick')",[uid(2)]);
 assert.equal((await as(1,'select * from public.place_preferences')).rows.length,2);
});
await test('상대방 ID 삽입/업데이트 거부',async()=>{
 await assert.rejects(()=>as(1,"insert into public.place_preferences values(1,$1,'pick',now())",[uid(2)]));
 await assert.rejects(()=>as(1,"update public.place_preferences set user_id=$1",[uid(2)]),/permission denied/);
});
await test('상대방 pick 삭제는 0행, 본인 해제만 성공',async()=>{
 assert.equal((await as(1,'delete from public.place_preferences where user_id=$1 returning *',[uid(2)])).rows.length,0);
 await as(1,'delete from public.place_preferences where user_id=$1',[uid(1)]);
 assert.equal((await as(2,'select * from public.place_preferences')).rows[0].user_id,uid(2));
});
await test('재실행 시 해제한 pick 부활 없음',async()=>{
 await db.exec(sql);
 assert.equal((await as(1,'select * from public.place_preferences')).rows.length,1);
});
await test('다른 커플 조회/추가/삭제 차단',async()=>{
 assert.equal((await as(3,'select * from public.place_preferences')).rows.length,0);
 await assert.rejects(()=>as(3,"insert into public.place_preferences values(1,$1,'pick',now())",[uid(3)]),/row-level security/);
 assert.equal((await as(3,'delete from public.place_preferences returning *')).rows.length,0);
});
await test('공동 단골은 파트너 해제/본인 재설정 가능',async()=>{
 await as(2,'update public.places set is_regular=false where id=1');
 assert.equal((await as(1,'select is_regular from public.places where id=1')).rows[0].is_regular,false);
 await as(1,'update public.places set is_regular=true where id=1');
 assert.equal((await as(2,'select is_regular from public.places where id=1')).rows[0].is_regular,true);
 assert.equal((await as(3,'update public.places set is_regular=false where id=1 returning id')).rows.length,0);
});
await test('레거시 배열 직접 수정/신규 삽입 차단',async()=>{
 await assert.rejects(()=>as(1,"update public.places set favorite_by='{}' where id=1"),/읽기 전용/);
 await assert.rejects(()=>as(1,'insert into public.places(id,couple_id,favorite_by) values(3,$1,$2)',[uid(10),[uid(1)]]),/place_preferences/);
});
await test('익명 접근 차단',async()=>{
 await assert.rejects(()=>as(null,'select * from public.place_preferences'),/permission denied/);
 await assert.rejects(()=>as(null,"insert into public.place_preferences values(1,$1,'pick',now())",[uid(1)]),/permission denied/);
});
await test('장소 삭제 시 취향 행 정리',async()=>{
 await as(1,'delete from public.places where id=1');
 assert.equal((await db.query('select * from public.place_preferences')).rows.length,0);
});
await test('소속 변경이 열려 있으면 적용 중단',async()=>{
 await db.exec('grant update(couple_id) on public.profiles to authenticated');
 await assert.rejects(()=>db.exec(sql),/직접 변경 권한/);
 await db.exec('rollback');
});
console.log(`${tests} preference scenarios passed (live/concurrent Supabase tests still required).`);
await db.close();
