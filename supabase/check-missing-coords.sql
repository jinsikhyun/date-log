-- ─────────────────────────────────────────────────────────────
-- 좌표(위경도)가 비어 있는 장소 점검. (스키마 변경 아님 — SELECT 만)
-- 실제 보정은 /tools/backfill-coords 페이지에서 (카카오 Geocoder 는 브라우저 전용).
-- ─────────────────────────────────────────────────────────────

-- 1) 좌표 없는 장소 목록 (코스 미니폼으로 만든 것 = via_course 먼저)
select
  p.id,
  p.name,
  p.address,
  p.status,
  p.via_course,
  p.owning_course_id,
  (p.lat is null) as no_lat,
  (p.lng is null) as no_lng,
  p.created_at
from public.places p
where p.lat is null or p.lng is null
order by p.via_course desc, p.created_at desc;

-- 2) 개수 요약
select
  count(*) filter (where lat is null or lng is null)                     as missing_coords,
  count(*) filter (where (lat is null or lng is null) and via_course)    as missing_and_via_course,
  count(*) filter (where (lat is null or lng is null) and not via_course) as missing_normal,
  count(*)                                                               as total_places
from public.places;

-- 3) 좌표 없는 장소가 실제로 포함된 코스 (동선이 안 그려질 후보)
select
  c.id   as course_id,
  c.title,
  count(*)                                     as stops,
  count(*) filter (where pl.lat is null or pl.lng is null) as stops_without_coords
from public.courses c
join public.course_places cp on cp.course_id = c.id
join public.places pl        on pl.id = cp.place_id
group by c.id, c.title
having count(*) filter (where pl.lat is null or pl.lng is null) > 0
order by stops_without_coords desc;
