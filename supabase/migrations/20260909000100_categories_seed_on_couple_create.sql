-- 20260909000000_categories_couple_scope.sql의 후속. categories에 couple_id가
-- 생긴 뒤에만 의미가 있으므로 그 마이그레이션 다음에 실행한다 — 같은 트랜잭션에 넣지
-- 않은 이유는 위 파일 상단 주석 참고(관심사 분리: 온보딩 RPC vs categories 스키마).
--
-- 문제: 마이그레이션 후 새로 가입하는 커플은 categories 행이 0개로 시작한다.
-- 클라이언트 fallback(DEFAULT_CATEGORIES)이 화면엔 카테고리 7개를 보여주지만 전부
-- 음수 합성 id(-1~-7)라 실제 DB 행이 아니다 — /settings/categories에서 이름변경·삭제·
-- 순서변경을 눌러도 그 음수 id로 UPDATE/DELETE가 나가 0행 매치로 조용히 무반응하고
-- (에러 없이 폼만 닫힘), 그 상태에서 카테고리를 하나라도 새로 추가하면(이건 진짜 insert라
-- 성공) 그 순간 fallback이 꺼지며 방금 추가한 1개만 남고 나머지 6개가 사라진다.
-- (src/components/CategoriesProvider.tsx: rows.length===0 일 때만 DEFAULT_CATEGORIES로
-- fallback — src/components/CategoriesManager.tsx의 handleSave/handleDelete/
-- moveCategory는 cat.id로 .eq("id", cat.id) 하므로 음수 id는 항상 매치 없이 no-op.)
--
-- 해결: connect_couple()이 새 커플을 만드는 분기(p_invite_code is null)에서 커플 생성
-- 직후 시드 7개를 함께 심는다. "쇼핑"은 포함하지 않는다 — 그건 진식지민이 개인적으로
-- 추가한 것이지 시드가 아니다(supabase/add-categories-table.sql 원본 시드와 동일한
-- 7개만 사용). 합류(초대코드) 분기는 건드리지 않는다 — 이미 존재하는 커플에 합류하는
-- 것뿐이라 그 커플의 categories는 이미 있다.
--
-- 이 파일은 작성만 했고 실행하지 않았다 — 20260909000000 적용 후, 사용자 승인 뒤 실행할 것.
--
-- 롤백: connect_couple()을 01_prepare_membership.sql의 원본 정의로 create or replace.
--       이미 시드가 심어진 커플의 categories 행 자체는 이 롤백으로 없어지지 않는다
--       (원하면 별도로 delete from public.categories where couple_id = ... 필요).

create or replace function public.connect_couple(p_display_name text, p_invite_code text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_couple uuid;
  v_code text;
  v_attempts integer;
begin
  if v_user is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 50 then
    raise exception '이름은 1~50자로 입력해 주세요.' using errcode = '22023';
  end if;

  select u.email into v_email from auth.users u where u.id = v_user for update;
  if not found then raise exception '계정을 확인할 수 없어요.' using errcode = '42501'; end if;
  select p.couple_id into v_couple from public.profiles p where p.id = v_user;
  if v_couple is not null then
    return jsonb_build_object('error', '이미 커플에 연결되어 있어요.');
  end if;

  if p_invite_code is null then
    v_code := upper(replace(gen_random_uuid()::text, '-', ''));
    insert into public.couples(invite_code) values (v_code) returning id into v_couple;

    -- 신규 커플에 기본 카테고리 시드(쇼핑 제외, add-categories-table.sql 원본 시드와 동일).
    insert into public.categories (couple_id, name, color, icon, sort_order) values
      (v_couple, '맛집', 'orange',  '🍽️', 10),
      (v_couple, '카페', 'amber',   '☕',  20),
      (v_couple, '술집', 'rose',    '🍶', 30),
      (v_couple, '바',   'purple',  '🍸', 40),
      (v_couple, '사진', 'sky',     '📷', 50),
      (v_couple, '전시', 'fuchsia', '🖼️', 60),
      (v_couple, '기타', 'stone',   '📍', 70)
    on conflict (couple_id, name) do nothing;
  else
    insert into datelog_private.join_attempts as a values (v_user, clock_timestamp(), 1)
    on conflict (user_id) do update set
      attempts = case when a.window_started_at < clock_timestamp() - interval '15 minutes'
        then 1 else a.attempts + 1 end,
      window_started_at = case when a.window_started_at < clock_timestamp() - interval '15 minutes'
        then clock_timestamp() else a.window_started_at end
    returning attempts into v_attempts;
    if v_attempts > 5 then
      return jsonb_build_object('error', '시도가 너무 많아요. 15분 뒤 다시 시도해 주세요.');
    end if;
    if length(btrim(p_invite_code)) not between 1 and 64 then
      return jsonb_build_object('error', '초대코드를 확인해 주세요.');
    end if;
    select c.id, c.invite_code into v_couple, v_code
      from public.couples c where c.invite_code = upper(btrim(p_invite_code)) for update;
    if not found then return jsonb_build_object('error', '초대코드를 확인해 주세요.'); end if;
    if (select count(*) from public.profiles p where p.couple_id = v_couple) >= 2 then
      return jsonb_build_object('error', '이미 두 명이 연결된 커플이에요.');
    end if;
  end if;

  insert into public.profiles(id, display_name, email, couple_id)
    values (v_user, btrim(p_display_name), v_email, v_couple)
  on conflict (id) do update set display_name = excluded.display_name,
    email = excluded.email, couple_id = excluded.couple_id;
  return jsonb_build_object('couple_id', v_couple, 'invite_code', v_code);
end;
$$;
revoke all on function public.connect_couple(text, text) from public, anon, authenticated;
grant execute on function public.connect_couple(text, text) to authenticated;

-- 검증(수동): 새로 가입해 커플을 만든 뒤 —
--   select name, sort_order from public.categories where couple_id = '<방금 만든 couple_id>' order by sort_order;
-- 결과가 맛집/카페/술집/바/사진/전시/기타 7개(쇼핑 없음)여야 한다.
