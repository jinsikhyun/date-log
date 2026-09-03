-- 같은 날짜에 방문한 장소의 실제 이동 순서 저장
-- 커플 구성원만 자기 커플의 해당 날짜 전체 장소를 원자적으로 재정렬할 수 있다.

alter table public.places
  add column if not exists visit_order integer;

create or replace function public.reorder_visit_places(
  p_visit_date date,
  p_place_ids bigint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple uuid;
  v_expected integer;
  v_received integer := coalesce(array_length(p_place_ids, 1), 0);
begin
  select couple_id into v_couple from public.profiles where id = auth.uid();
  if v_couple is null then raise exception '커플 연결이 필요합니다.'; end if;

  select count(*) into v_expected
    from public.places
   where couple_id = v_couple
     and status = 'visited'
     and first_visit_date = p_visit_date;

  if v_expected <> v_received then
    raise exception '해당 날짜의 모든 방문 장소를 포함해야 합니다.';
  end if;

  if (select count(*) from public.places
       where couple_id = v_couple
         and status = 'visited'
         and first_visit_date = p_visit_date
         and id = any(p_place_ids)) <> v_received then
    raise exception '허용되지 않은 장소가 포함되어 있습니다.';
  end if;

  update public.places p
     set visit_order = ordered.position
    from unnest(p_place_ids) with ordinality as ordered(place_id, position)
   where p.id = ordered.place_id
     and p.couple_id = v_couple;
end;
$$;

revoke all on function public.reorder_visit_places(date, bigint[]) from public, anon;
grant execute on function public.reorder_visit_places(date, bigint[]) to authenticated;

-- 확인
-- select id, name, first_visit_date, visit_order
-- from public.places where status='visited'
-- order by first_visit_date desc, visit_order nulls last, id;
