-- 6단계: wanted_by 선택지를 커플별 profiles.display_name 으로 동적화하면서
-- 더 이상 '진식'/'지민'/'둘다' 고정 CHECK 를 걸 수 없다.
-- (add-wanted-by-names.sql 이 추가했던 places_wanted_by_check 를 제거)
--
-- 멱등: 여러 번 실행해도 안전.

alter table public.places
  drop constraint if exists places_wanted_by_check;

-- 참고: wanted_by 는 여전히 nullable text. 값은 이제
--   - 커플 구성원의 display_name (임의 문자열)
--   - '둘다'
--   - null / '' (선택 안 함)
-- 이며 앱(AddPlaceForm)에서 커플 profiles 를 실시간 조회해 옵션으로 노출한다.
