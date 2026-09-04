-- 기존 tags는 보존. 기존 태그를 사용자 확인으로 소급하지 않는다.
begin;
alter table public.places add column if not exists confirmed_tags text[] not null default '{}';
alter table public.places add column if not exists ai_suggested_tags text[] not null default '{}';

create or replace function public.sync_place_tag_provenance()
returns trigger language plpgsql set search_path = public as $$
begin
  -- 기존 클라이언트와 호환: 새로 선택한 태그만 사용자 확인으로 분류.
  if TG_OP = 'INSERT' then
    new.confirmed_tags := coalesce(new.tags, '{}');
  else
    new.confirmed_tags := array(
      select distinct t from unnest(coalesce(new.tags, '{}')) t
      where t = any(coalesce(new.confirmed_tags, '{}'))
         or not (t = any(coalesce(old.tags, '{}')))
    );
  end if;
  -- 확인된 태그는 AI 후보 목록에서 제거.
  new.ai_suggested_tags := array(
    select distinct t from unnest(coalesce(new.ai_suggested_tags, '{}')) t
    where not (t = any(new.confirmed_tags))
  );
  return new;
end;
$$;
drop trigger if exists trg_place_tag_provenance on public.places;
create trigger trg_place_tag_provenance before insert or update on public.places
for each row execute function public.sync_place_tag_provenance();
commit;

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'places'
and column_name in ('confirmed_tags', 'ai_suggested_tags');
