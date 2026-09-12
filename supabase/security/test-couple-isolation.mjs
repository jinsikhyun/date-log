// 커플 간 데이터 격리 회귀 테스트 — 운영 접속 없음.
// PGLITE_MODULE 에 별도 설치한 @electric-sql/pglite 모듈 경로를 지정해서 실행한다.
//
//   PGLITE_MODULE=/abs/path/to/node_modules/@electric-sql/pglite/dist/index.js \
//     node supabase/security/test-couple-isolation.mjs
//
// 두 가지를 지킨다.
//  (1) add-couple-rls.sql 의 커플 스코프 RLS 가 실제로 커플 A/B 를 갈라놓는지
//      — places/memories/memory_replies/courses/course_places 전부.
//  (2) security/02_enforce_membership.sql 로 하드닝한 DB 에서 레거시 공개 정책
//      스크립트(schema.sql · policies_public.sql · policies_open_write.sql ·
//      add-couple-rls.sql)를 재실행하면 실행 자체가 막히는지.
//      PERMISSIVE 정책은 OR 로 합쳐지므로, 이름이 다른 예전 정책이 하나라도 다시
//      들어오면 커플 격리가 통째로 무효가 된다(2026-09-09 categories 사고와 같은 구조).
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
const sql = (name) => readFile(new URL(name, import.meta.url), 'utf8');

async function as(role, id, text, params = []) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
  try { return await db.query(text, params); }
  finally { await db.exec('reset role'); }
}

// ── 최소 스키마 (실제 컬럼 중 RLS 판정에 쓰이는 것만) ────────────
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create table public.couples(id uuid primary key default gen_random_uuid(),
    invite_code text unique, start_date date, created_at timestamptz default now());
  create table public.profiles(id uuid primary key references auth.users(id),
    display_name text, email text, couple_id uuid references public.couples(id),
    created_at timestamptz default now());
  create table public.places(id bigint generated always as identity primary key,
    name text not null, status text not null default 'visited',
    via_course boolean not null default false, image_url text, couple_id uuid);
  create table public.memories(id bigint generated always as identity primary key,
    place_id bigint references public.places(id) on delete cascade,
    content text, couple_id uuid);
  create table public.memory_replies(id bigint generated always as identity primary key,
    memory_id bigint references public.memories(id) on delete cascade,
    content text, couple_id uuid);
  create table public.courses(id bigint generated always as identity primary key,
    title text, couple_id uuid);
  create table public.course_places(id bigint generated always as identity primary key,
    course_id bigint references public.courses(id) on delete cascade,
    place_id bigint references public.places(id) on delete cascade);
  create table public.categories(id bigint generated always as identity primary key, name text);

  grant select, insert, update, delete on public.couples, public.profiles, public.places,
    public.memories, public.memory_replies, public.courses, public.course_places,
    public.categories to anon, authenticated;
`);

for (let n = 1; n <= 4; n++) {
  await db.query('insert into auth.users values($1,$2)', [user(n), `test${n}@example.invalid`]);
}

// 실제 저장소의 커플 스코프 RLS 를 그대로 적용한다.
const coupleRls = await sql('../add-couple-rls.sql');
await db.exec(coupleRls);

// 커플 A(user1) / 커플 B(user2) — 정책이 걸린 뒤이므로 superuser 로 직접 심는다.
const coupleA = (await db.query(
  "insert into public.couples(invite_code) values('AAAA-0000') returning id")).rows[0].id;
const coupleB = (await db.query(
  "insert into public.couples(invite_code) values('BBBB-1111') returning id")).rows[0].id;
await db.query('insert into public.profiles(id, display_name, couple_id) values($1,$2,$3)',
  [user(1), 'A', coupleA]);
await db.query('insert into public.profiles(id, display_name, couple_id) values($1,$2,$3)',
  [user(2), 'B', coupleB]);

let placeA;

await check('insert 트리거가 couple_id 를 내 커플로 채운다', async () => {
  const r = await as('authenticated', user(1),
    "insert into public.places(name, status) values('A의 위시','wishlist') returning id, couple_id");
  placeA = r.rows[0].id;
  assert.equal(r.rows[0].couple_id, coupleA);
})();

await check('상대 커플의 장소는 SELECT 되지 않는다', async () => {
  assert.equal((await as('authenticated', user(2), 'select * from public.places')).rows.length, 0);
  assert.equal((await as('authenticated', user(2),
    'select * from public.places where id=$1', [placeA])).rows.length, 0);
})();

await check('상대 커플의 장소는 UPDATE·DELETE 되지 않는다', async () => {
  const upd = await as('authenticated', user(2),
    "update public.places set name='변조', image_url='x' where id=$1 returning id", [placeA]);
  assert.equal(upd.rows.length, 0);
  const del = await as('authenticated', user(2),
    'delete from public.places where id=$1 returning id', [placeA]);
  assert.equal(del.rows.length, 0);
  const row = (await db.query('select name, image_url from public.places where id=$1', [placeA])).rows[0];
  assert.equal(row.name, 'A의 위시');
  assert.equal(row.image_url, null);
})();

await check('couple_id 를 직접 지정해 상대 커플로 INSERT 할 수 없다', async () => {
  await assert.rejects(
    () => as('authenticated', user(2),
      "insert into public.places(name, couple_id) values('침입', $1)", [coupleA]),
    /row-level security/);
})();

await check('추억·답글·코스·코스장소도 커플 밖으로 새지 않는다', async () => {
  const mem = await as('authenticated', user(1),
    "insert into public.memories(place_id, content) values($1,'A의 추억') returning id", [placeA]);
  await as('authenticated', user(1),
    "insert into public.memory_replies(memory_id, content) values($1,'A의 답글')", [mem.rows[0].id]);
  const course = await as('authenticated', user(1),
    "insert into public.courses(title) values('A의 코스') returning id");
  await as('authenticated', user(1),
    'insert into public.course_places(course_id, place_id) values($1,$2)',
    [course.rows[0].id, placeA]);

  for (const table of ['memories', 'memory_replies', 'courses', 'course_places']) {
    assert.equal(
      (await as('authenticated', user(2), `select * from public.${table}`)).rows.length, 0,
      `${table} 가 상대 커플에 노출됨`);
  }
})();

await check('커플에 연결되지 않은 계정과 익명은 아무 장소도 못 본다', async () => {
  await db.query('insert into public.profiles(id, display_name) values($1,$2)', [user(3), '미연결']);
  assert.equal((await as('authenticated', user(3), 'select * from public.places')).rows.length, 0);
  assert.equal((await as('anon', null, 'select * from public.places')).rows.length, 0);
})();

await check('add-couple-rls.sql 만으로도 couples 는 내 커플만 보인다', async () => {
  // 예전에는 여기서 초대코드까지 전부 보였다("couples: select authed"). 이제는 02 와
  // 같은 정의라, 이 파일이 다시 실행돼도 커플 격리가 되돌아가지 않는다.
  const rows = (await as('authenticated', user(2), 'select id from public.couples')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, coupleB);
})();

await check('무조건 통과(true) 정책이 어느 커플 스코프 테이블에도 없다', async () => {
  const open = (await db.query(
    `select tablename, policyname from pg_policies
      where schemaname='public'
        and tablename in ('places','memories','memory_replies','courses','course_places',
                          'profiles','couples','categories')
        and (qual = 'true' or with_check = 'true')`)).rows;
  assert.deepEqual(open, []);
})();

await check('레거시 SQL 파일에 무조건 통과 정책 텍스트가 남아 있지 않다', async () => {
  // 가드는 "파일 전체 실행"만 막는다. 일부만 잘라 붙여넣는 경우까지 막으려면
  // 위험한 SQL 텍스트 자체가 파일에 없어야 한다.
  const pattern = /create\s+policy[\s\S]{0,400}?(using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\))/i;
  for (const name of ['../schema.sql', '../policies_public.sql', '../policies_open_write.sql',
    '../add-couple-rls.sql']) {
    assert.equal(pattern.test(await sql(name)), false, `${name} 에 공개 정책 텍스트가 남아 있음`);
  }
})();

await db.exec(await sql('./01_prepare_membership.sql'));
await db.exec(await sql('./02_enforce_membership.sql'));

await check('02 적용 후에도 내 커플만 보인다 (정의 동일)', async () => {
  const rows = (await as('authenticated', user(2), 'select id from public.couples')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, coupleB);
})();

await check('하드닝된 DB 에서 레거시 공개 정책 스크립트는 실행이 차단된다', async () => {
  for (const name of ['../schema.sql', '../policies_public.sql', '../policies_open_write.sql',
    '../add-couple-rls.sql']) {
    const text = await sql(name);
    await assert.rejects(() => db.exec(text), /레거시|legacy/i, `${name} 이 차단되지 않음`);
  }
})();

await check('차단 후에도 격리 정책이 그대로 남아 있다', async () => {
  assert.equal((await as('authenticated', user(2), 'select * from public.couples')).rows.length, 1);
  assert.equal((await as('authenticated', user(2), 'select * from public.places')).rows.length, 0);
  assert.equal((await as('anon', null, 'select * from public.places')).rows.length, 0);
  const open = (await db.query(
    `select policyname from pg_policies
      where schemaname='public' and tablename in ('places','memories')
        and (qual = 'true' or with_check = 'true')`)).rows;
  assert.deepEqual(open, [], 'places/memories 에 using(true) 정책이 남아 있음');
})();

console.log(`${passed} scenarios passed. 운영 DB 의 실제 정책은 pg_policies 조회로 별도 확인해야 한다.`);
await db.close();
