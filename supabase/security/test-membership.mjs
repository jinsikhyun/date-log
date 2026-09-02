// 운영 접속 없음. PGLITE_MODULE에 별도 설치한 @electric-sql/pglite 모듈 경로를 지정.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

if (!process.env.PGLITE_MODULE) throw new Error('PGLITE_MODULE 경로가 필요합니다.');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
let passed = 0;
const check = (name, fn) => async () => {
  await fn(); passed++; console.log(`PASS ${name}`);
};
const user = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function as(role, id, sql, params = []) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role'); }
}
async function connect(n, code = null, name = '테스트') {
  const result = await as('authenticated', user(n),
    'select public.connect_couple($1, $2) as result', [name, code]);
  return result.rows[0].result;
}
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create table public.couples(id uuid primary key default gen_random_uuid(), invite_code text unique,
    start_date date, created_at timestamptz default now());
  create table public.profiles(id uuid primary key references auth.users(id), display_name text,
    email text, couple_id uuid references public.couples(id), created_at timestamptz default now());
  create table public.categories(id bigint generated always as identity primary key, name text);
  create schema storage;
  create table storage.objects(bucket_id text, name text);
  create function public.my_couple_id() returns uuid language sql stable security definer
    set search_path = '' as $$ select couple_id from public.profiles where id=auth.uid() $$;
  grant all on public.profiles, public.couples, public.categories to anon, authenticated;
  grant update(couple_id), insert(id, couple_id) on public.profiles to authenticated;
  alter table public.categories enable row level security;
  create policy "legacy public" on public.categories for all to public using(true) with check(true);
`);
for (let n=1; n<=8; n++) await db.query('insert into auth.users values($1,$2)', [user(n), `test${n}@example.invalid`]);
const prepare = await readFile(new URL('./01_prepare_membership.sql', import.meta.url), 'utf8');
const enforce = await readFile(new URL('./02_enforce_membership.sql', import.meta.url), 'utf8');
await db.exec(prepare);
await db.exec(enforce);
// 재실행도 검증: 보안 제한/데이터 보존.
await db.exec(prepare);
await db.exec(enforce);
let first;
await check('커플 생성 + 신원/이메일 서버 결정', async () => {
  first = await connect(1);
  assert.ok(first.couple_id); assert.equal(first.invite_code.length, 32);
  const p = await as('authenticated', user(1), 'select * from public.profiles');
  assert.equal(p.rows[0].email, 'test1@example.invalid');
})();
await check('정상 합류 + 파트너 조회', async () => {
  const joined = await connect(2, ` ${first.invite_code.toLowerCase()} `);
  assert.equal(joined.couple_id, first.couple_id);
  assert.equal((await as('authenticated', user(2), 'select * from public.profiles')).rows.length, 2);
})();
await check('세 번째 멤버 차단', async () => assert.ok((await connect(3, first.invite_code)).error))();
await check('다른 커플 정보/프로필 비노출', async () => {
  await connect(4);
  assert.equal((await as('authenticated', user(4), 'select * from public.couples')).rows.length, 1);
  assert.equal((await as('authenticated', user(4), 'select * from public.profiles')).rows.length, 1);
})();
await check('직접 소속/이메일/ID 수정 및 upsert/insert 차단', async () => {
  for (const sql of [
    `update public.profiles set couple_id='${first.couple_id}' where id='${user(4)}'`,
    `update public.profiles set email='fake' where id='${user(4)}'`,
    `update public.profiles set id='${user(5)}' where id='${user(4)}'`,
    `insert into public.profiles(id,couple_id) values('${user(5)}','${first.couple_id}')`,
    `insert into public.profiles(id,couple_id) values('${user(4)}','${first.couple_id}') on conflict(id) do update set couple_id=excluded.couple_id`,
    `insert into public.couples(invite_code) values('BYPASS')`,
  ]) await assert.rejects(() => as('authenticated', user(4), sql), /permission denied/);
})();
await check('기존 커플 소속 이동 및 중복 생성 차단', async () => {
  assert.ok((await connect(4, first.invite_code)).error);
  assert.ok((await connect(1)).error);
  assert.equal((await db.query('select count(*)::int as n from public.couples')).rows[0].n, 2);
})();
await check('본인 이름/관계 시작일 수정 유지, 파트너 이름 수정 차단', async () => {
  await as('authenticated', user(1), "update public.profiles set display_name='수정' where id=$1", [user(1)]);
  const other = await as('authenticated', user(1), "update public.profiles set display_name='변조' where id=$1 returning id", [user(2)]);
  assert.equal(other.rows.length, 0);
  await as('authenticated', user(1), "update public.couples set start_date='2025-06-28' where id=$1", [first.couple_id]);
  assert.equal((await db.query('select display_name from public.profiles where id=$1', [user(1)])).rows[0].display_name, '수정');
})();
await check('비로그인 RPC/카테고리 쓰기 차단, 로그인 카테고리 CRUD 유지', async () => {
  await assert.rejects(() => as('anon', null, "select public.connect_couple('익명',null)"), /permission denied/);
  for (const sql of ["insert into public.categories(name) values('변조')", "update public.categories set name='변조'", 'delete from public.categories']) {
    await assert.rejects(() => as('anon', null, sql), /permission denied/);
  }
  await as('authenticated', user(1), "insert into public.categories(name) values('카페')");
  await as('authenticated', user(1), "update public.categories set name='전시'");
  assert.equal((await as('authenticated', user(1), 'select * from public.categories')).rows.length, 1);
  await as('authenticated', user(1), 'delete from public.categories');
})();
await check('실패 누적/시도 제한, 잘못된 코드로 프로필 생성 없음', async () => {
  for(let n=0; n<5; n++) assert.match((await connect(5, 'WRONG')).error, /초대코드/);
  assert.match((await connect(5, first.invite_code)).error, /15분/);
  assert.equal((await db.query('select * from public.profiles where id=$1', [user(5)])).rows.length, 0);
})();
await check('입력 검증 및 연결 전체 롤백', async () => {
  await assert.rejects(() => connect(6, null, ' '), /1~50/);
  await db.exec("alter table public.profiles add constraint test_rollback check(display_name <> 'ROLLBACK')");
  await assert.rejects(() => connect(6, null, 'ROLLBACK'), /test_rollback/);
  assert.equal((await db.query('select count(*)::int as n from public.couples')).rows[0].n, 2);
  await db.exec('alter table public.profiles drop constraint test_rollback');
})();
await check('기존 프로필(미연결) 합류 및 재적용 데이터 보존', async () => {
  const open = await connect(7);
  await db.query('insert into public.profiles(id,display_name) values($1,$2)', [user(8),'미연결']);
  assert.equal((await connect(8, open.invite_code)).couple_id, open.couple_id);
  const before = (await db.query('select * from public.profiles order by id')).rows;
  await db.exec(enforce);
  assert.deepEqual((await db.query('select * from public.profiles order by id')).rows, before);
})();
await check('읽기 전용 사전 점검 SQL 실행', async () => {
  const audit = await readFile(new URL('./00_preflight_readonly.sql', import.meta.url), 'utf8');
  const rows = (await db.query(audit)).rows;
  assert.ok(rows.some(row => row.section === '3_FUNCTIONS'));
  assert.ok(rows.some(row => row.section === '4_COUNTS'));
})();
console.log(`${passed} scenarios passed. Concurrent multi-connection behavior and live Supabase still require staging tests.`);
await db.close();
