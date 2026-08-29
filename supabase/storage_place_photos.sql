-- ─────────────────────────────────────────────────────────────
-- 대표 사진 버킷 "place-photos" — 방문자(anon)에게 업로드/교체/삭제 허용.
-- 버킷을 public 으로 만들면 공개 "읽기"는 정책 없이도 되지만,
-- 업로드(INSERT)는 storage.objects 의 RLS 정책이 있어야 anon 키로 가능하다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
--
-- ⚠️ 이제 링크만 알면 누구나 이 버킷에 파일을 올릴 수 있다. 프로토타입 전제.
--    실제 사용자가 생기면 Supabase Auth 도입 후 owner 기반 정책으로 교체할 것.
-- ─────────────────────────────────────────────────────────────

-- 버킷이 없으면 만들고, 있으면 public 으로 보장
insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "place-photos: public read"   on storage.objects;
drop policy if exists "place-photos: public insert" on storage.objects;
drop policy if exists "place-photos: public update" on storage.objects;
drop policy if exists "place-photos: public delete" on storage.objects;

create policy "place-photos: public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'place-photos');

create policy "place-photos: public insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'place-photos');

create policy "place-photos: public update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'place-photos') with check (bucket_id = 'place-photos');

create policy "place-photos: public delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'place-photos');

-- 확인용:
-- select name, public from storage.buckets where id = 'place-photos';
-- select policyname, cmd from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--   and policyname like 'place-photos%' order by cmd;
