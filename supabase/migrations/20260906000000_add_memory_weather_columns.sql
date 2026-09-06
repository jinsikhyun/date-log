-- 추억(memories) 날씨 각인 컬럼.
-- date.log_백엔드연결_계약서.md §3-1 명시: 이미 운영에 적용 완료된 스키마를
-- 저장소 히스토리에 남기기 위한 문서화 목적 migration. IF NOT EXISTS 로 재실행해도
-- 안전하지만, 이 작업에서 실제로 실행하지는 않는다(사용자 승인 후 별도 진행).
--
-- weather_state: 날씨 상태 키(clear/cloudy/rain/snow/first_snow/heat/cold/dust). 텍스트, nullable.
-- weather_temp : 저장 시점 기온(반올림 정수). 과거 수동 기록은 항상 null.
--
-- 롤백: ALTER TABLE public.memories DROP COLUMN IF EXISTS weather_state, DROP COLUMN IF EXISTS weather_temp;

alter table public.memories
  add column if not exists weather_state text,
  add column if not exists weather_temp integer;

comment on column public.memories.weather_state is
  '저장 시점 날씨 상태 키(clear/cloudy/rain/snow/first_snow/heat/cold/dust). 각인 안 하면 null.';
comment on column public.memories.weather_temp is
  '저장 시점 기온(섭씨, 반올림). 과거 날짜 수동 각인은 항상 null.';
