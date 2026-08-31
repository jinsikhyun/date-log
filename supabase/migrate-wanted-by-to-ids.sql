-- ─────────────────────────────────────────────────────────────
-- 위시리스트 "누가 원해요"를 단일 text(wanted_by) → uuid[] (wanted_by_ids) 로.
-- 진식/지민 각각 독립 토글. '둘다' 는 커플 구성원 전원의 id.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
-- 기존 wanted_by(text) 컬럼은 삭제하지 않고 참고용으로 그대로 둔다.
-- ─────────────────────────────────────────────────────────────

-- 1) 새 배열 컬럼
alter table public.places
  add column if not exists wanted_by_ids uuid[] not null default '{}';

-- 2) 기존 wanted_by(text) 값을 wanted_by_ids 로 이전
--    같은 커플(profiles.couple_id = places.couple_id)에서 display_name 이
--    일치하는 사람, 또는 값이 '둘다' 면 커플 구성원 전원의 id 를 배열에 넣는다.
--    이미 채워진 행(cardinality > 0)은 건너뛴다 → 재실행해도 안전.
update public.places p
set wanted_by_ids = coalesce(sub.ids, '{}')
from (
  select
    pl.id,
    array_agg(distinct pr.id) filter (where pr.id is not null) as ids
  from public.places pl
  join public.profiles pr
    on pr.couple_id = pl.couple_id
   and (pl.wanted_by = pr.display_name or pl.wanted_by = '둘다')
  where pl.wanted_by is not null
    and pl.wanted_by <> ''
  group by pl.id
) sub
where sub.id = p.id
  and cardinality(p.wanted_by_ids) = 0;

-- 3) 확인용 (선택)
-- select id, name, wanted_by, wanted_by_ids
--   from public.places
--   where status = 'wishlist'
--   order by created_at desc;
