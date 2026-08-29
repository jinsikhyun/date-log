-- ─────────────────────────────────────────────────────────────
-- 장소 상세의 "카카오맵에서 보기" 링크용 컬럼.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. (여러 번 실행해도 안전)
--
-- kakao_map_link : text — 자동완성으로 등록한 장소는 카카오 place_url,
--   기존 장소는 장소명 기반 카카오맵 검색 링크로 채운다.
-- (구글지도 링크는 저장하지 않고 상세 페이지에서 장소명+주소로 즉석 생성)
-- ─────────────────────────────────────────────────────────────

alter table public.places add column if not exists kakao_map_link text;

-- 기존 장소(링크 비어있는 것) 백필: 카카오 지도 Web API "검색결과 URL 만들기" 포맷
--   https://map.kakao.com/link/search/{검색어}
-- (공백만 %20 로 치환. 한글 경로는 브라우저가 알아서 인코딩)
update public.places
set kakao_map_link =
  'https://map.kakao.com/link/search/' || replace(name, ' ', '%20')
where kakao_map_link is null or kakao_map_link = '';

-- 확인용:
-- select name, kakao_map_link from public.places order by id;
