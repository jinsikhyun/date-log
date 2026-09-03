-- 장소 대표사진의 EXIF 촬영일 저장.
-- 캘린더에서는 방문일과 촬영일이 정확히 일치할 때만 대표사진을 '그날의 사진'에 포함한다.

alter table public.places
  add column if not exists image_captured_date date;

-- 확인
-- select id, name, first_visit_date, image_captured_date
-- from public.places where image_url is not null
-- order by first_visit_date desc;
