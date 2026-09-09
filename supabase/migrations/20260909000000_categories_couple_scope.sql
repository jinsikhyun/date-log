-- categories 커플 스코프 분리 (진단: 커플 10개, 그중 2팀은 실제 사용자 — 테스트 계정 아님).
-- 현재 상태(운영 직접 조회로 확인): "categories: authenticated access" 정책이
-- for all / using(true) / with check(true) — 로그인한 누구나 모든 커플의 카테고리를
-- 읽고 수정·삭제할 수 있다. add-couple-rls.sql·02_enforce_membership.sql 둘 다
-- "카테고리의 커플별 분리는 별도 제품 결정"이라며 의도적으로 미뤄뒀던 부분이다.
--
-- 위험은 삭제가 아니라 이름 변경이다: 다른 커플이 "맛집"을 다른 이름으로 바꾸면
-- 내 places.category(문자열, FK 없음)는 그대로 남아 필터·AI 추천 검색어
-- (deriveSpecificSearchTerm/searchQueries 등, 카테고리 "이름"으로 동작)가 조용히
-- 어긋난다. places 테이블 자체는 이름 문자열만 들고 있고 FK가 없어 이 마이그레이션의
-- 대상이 아니다 — 손대지 않는다.
--
-- 앱 코드 영향: CategoriesProvider.refetch()/CategoriesManager의 add/rename/delete/
-- reorder 전부 categories를 couple_id 조건 없이 그대로 select/insert/update/delete한다
-- (src/components/CategoriesProvider.tsx, CategoriesManager.tsx 확인). 아래처럼
-- RLS로 행 자체를 커플 스코프로 좁히면 이 쿼리들은 코드 변경 없이 자동으로 "내 커플의
-- 행만" 보게 된다 — my_couple_id() 패턴(add-couple-rls.sql)과 동일. INSERT 시
-- couple_id를 클라이언트가 안 보내도 트리거(set_couple_id, 기존 함수 재사용)가
-- auth.uid() 기준으로 채운다. 즉 이 마이그레이션은 앱 코드 변경이 필요 없다
-- (CategoriesManager.tsx의 rename 시 places.update({category:name}).eq("category",
-- cat.name) 호출도 couple_id 조건이 없지만, places 자체의 기존 RLS
-- (couple_id = my_couple_id())가 이미 다른 커플 행을 걸러준다 — 확인됨, 별도 수정 불필요).
--
-- 복제 대상: 활성 커플만이 아니라 전체 10개 커플. 오늘 8개(시드 7개 + 사용자가 추가한
-- "쇼핑" 1개)는 이미 모든 커플에게 사실상 공유돼 보이던 상태라("categories: authenticated
-- access"가 전체 공개), 시드 7개를 전부에게 복제하는 것이 "오늘 보이던 걸 그대로 유지"에
-- 가장 가깝다. 장소가 있는 커플만 복제하면 나머지 커플은 클라이언트 fallback
-- (DEFAULT_CATEGORIES, 7개)으로 떨어져 오늘과 다른 목록을 보게 된다.
-- 예외: "쇼핑"은 진식지민 커플이 개인적으로 추가한 것이라 진식지민에게만 복제한다
-- (사용자 확인 — 실측 결과 어느 커플도 places.category='쇼핑'인 장소가 없어 다른
-- 커플에서 빼도 유령 장소가 생기지 않음). categories 테이블엔 작성자 컬럼이 없어
-- "누가 추가했는지"를 스스로 증명 못 한다 — 진식지민의 couple_id
-- (a6b01b81-3d74-43ef-92dd-4dbd00ba7123, 사용자가 조회로 직접 확인해 지정한 불변값)를
-- 아래에서 리터럴로 직접 쓴다.
--
-- 신규 커플 가입: 이 마이그레이션 이후 새로 가입하는 커플은 categories 행이 0개로
-- 시작한다. CategoriesProvider의 DEFAULT_CATEGORIES fallback이 "행 0개"에서도
-- 동작하는 것은 확인했지만(테이블이 아예 없을 때와 같은 분기), 그 상태에서
-- /settings/categories의 이름변경·삭제·순서변경은 fallback의 음수 합성 id(-1~-7)를
-- 실제 DB id로 착각해 update/delete를 보내 0행 매치로 조용히 무반응한다(에러 없이
-- "저장됨"처럼 폼은 닫히지만 실제로는 반영 안 됨) — 게다가 그 상태에서 카테고리를
-- 하나라도 새로 추가하면(add는 실제 insert라 성공) 그 순간 fallback이 꺼지고 방금 추가한
-- 1개만 남아 나머지 6개가 화면에서 사라진다. 그래서 가입 시점에 실제 행을 심어두는
-- 별도 파일(20260909000100_categories_seed_on_couple_create.sql)이 필요하다 — 같은
-- 트랜잭션에 넣지 않는다: connect_couple()은 온보딩 관심사(01_prepare_membership.sql)이고
-- categories 스코프 분리는 별개 관심사라 이 프로젝트가 이미 파일을 그렇게 나눠온 관례를
-- 따른다. 다만 이 마이그레이션 뒤에 곧바로 실행해 신규 가입 커플이 위 상태를 겪는
-- 시간을 최소화할 것.
--
-- 무중단: 이 파일 전체가 단일 트랜잭션이라 원자적이다. 동시 접속자는 커밋 전
-- "전체 8개 공유" 상태 또는 커밋 후 "내 커플 8개" 상태 둘 중 하나만 본다 — 절반만
-- 반영된 상태는 없다. 앱 배포는 필요 없다(위 코드 영향 분석 참고) — 이 SQL만 실행하면
-- 된다. 유일한 잔여 위험: 마이그레이션 커밋과 정확히 같은 순간에 /categories에서
-- 카테고리 수정 폼을 열어둔 사람이 있다면, 원본 8개 행이 삭제되며 그 사람이 들고 있던
-- cat.id가 사라져 "저장"을 눌러도 조용히 반영 안 될 수 있다(에러 없이 0행 매치) —
-- 발생 확률은 극히 낮지만(카테고리 관리 페이지 자체가 자주 쓰는 화면이 아님), 트래픽이
-- 적은 시간에 실행할 것을 권장한다.
--
-- 이 파일은 작성만 했고 실행하지 않았다 — 사용자 승인 후 Supabase SQL Editor에서 실행할 것.
-- 단일 트랜잭션(begin/commit)이라 중간에 어떤 단계든 실패하면 전체가 자동 롤백된다 —
-- "절반만 적용된 상태"는 존재하지 않는다. 다만 이 파일 자체는 성공 후 재실행하도록
-- 설계하지 않았다(예: constraint 재추가가 두 번째 실행에서 에러) — 한 번만 실행할 것.
--
-- 롤백(마이그레이션 직후, 아무도 카테고리를 수정하기 전에만 깨끗하게 되돌릴 수 있음):
--   begin;
--   delete from public.categories where couple_id is not null;
--   insert into public.categories (name, color, icon, sort_order)
--     select name, color, icon, sort_order from public.categories_pre_couple_scope_backup;
--   alter table public.categories drop constraint if exists categories_couple_name_key;
--   alter table public.categories add constraint categories_name_key unique (name);
--   alter table public.categories alter column couple_id drop not null;
--   drop policy if exists "categories: couple select" on public.categories;
--   drop policy if exists "categories: couple insert" on public.categories;
--   drop policy if exists "categories: couple update" on public.categories;
--   drop policy if exists "categories: couple delete" on public.categories;
--   create policy "categories: authenticated access" on public.categories
--     for all to authenticated using (true) with check (true);
--   drop trigger if exists trg_categories_couple_id on public.categories;
--   commit;
-- 누군가 이미 자기 커플의 카테고리를 수정(이름 변경/추가/삭제)한 뒤에는 이 롤백이
-- 그 수정을 덮어써 잃는다 — 그 시점부터는 "롤백"이 아니라 수동 데이터 판단이 필요하다.
-- categories_pre_couple_scope_backup 테이블은 안전 확인 후(예: 1~2주) 수동으로 drop한다.

begin;

-- 0) 되돌리기용 스냅샷 — 마이그레이션 전 원본 8개 행 그대로 보존.
--    RLS를 걸고 아무 정책도 안 둔다 — anon/authenticated 전부 접근 불가, service_role/
--    SQL Editor(superuser)만 읽을 수 있다. 민감 정보는 아니지만 이 프로젝트 관례상
--    (datelog_private.join_attempts와 동일 패턴) 열어둘 이유가 없다.
create table if not exists public.categories_pre_couple_scope_backup as
  table public.categories;
alter table public.categories_pre_couple_scope_backup enable row level security;
revoke all on public.categories_pre_couple_scope_backup from public, anon, authenticated;

-- 1) couple_id 컬럼 추가 (일단 nullable — 백필 후 NOT NULL로 잠근다).
alter table public.categories add column if not exists couple_id uuid
  references public.couples(id);

-- 2) 유일성 범위를 전역 이름 → 커플 단위 이름으로, 백필(3단계) 전에 먼저 교체한다.
--    ⚠️ 실제 운영 실행에서 이 순서를 3단계 뒤에 뒀다가 "duplicate key value violates
--    unique constraint categories_name_key" 에러로 트랜잭션 전체가 롤백된 적이 있다
--    (사용자 실측) — 전역 unique(name)이 살아있는 채로 10개 커플에 같은 이름("사진" 등)을
--    반복 삽입하면 두 번째 커플 행에서 바로 걸린다. 지금 이 시점엔 원본 8행만 있고
--    전부 couple_id is null인데, Postgres UNIQUE 제약은 NULL끼리 서로 다른 값으로 취급
--    하므로(표준 SQL 동작, NULLS DISTINCT가 기본) (couple_id, name)으로 바꿔도 이 8행은
--    서로 충돌하지 않는다 — 안전하게 먼저 바꿀 수 있다(places가 이미 쓴 것과 같은 패턴,
--    supabase/schema.sql의 places_couple_name_address_key 참고).
alter table public.categories drop constraint if exists categories_name_key;
alter table public.categories drop constraint if exists categories_couple_name_key;
alter table public.categories add constraint categories_couple_name_key
  unique (couple_id, name);

-- 3) 시드 7개(원본, couple_id 아직 null, "쇼핑" 제외)를 전체 커플에 복제.
--    이 SELECT는 이 INSERT 문 시작 시점의 스냅샷만 본다 — 같은 문장이 지금 막 만들어
--    내는 행(couple_id가 채워진 새 행)을 다시 읽어 무한복제하지 않는다(Postgres는 한
--    명령이 자기 자신이 그 명령 안에서 쓴 행을 다시 보지 않는다). 트리거(7단계)는 아직
--    만들어지기 전이라 이 INSERT에 관여하지 않는다 — 게다가 couple_id를 이미 명시적으로
--    채워 보내므로 트리거가 있었어도(set_couple_id는 couple_id가 null일 때만 채움) 영향 없다.
insert into public.categories (couple_id, name, color, icon, sort_order)
select c.id, src.name, src.color, src.icon, src.sort_order
from public.couples c
cross join (
  select * from public.categories where couple_id is null and name <> '쇼핑'
) src;

-- 3-1) "쇼핑"은 진식지민 커플에게만 복제 — couple_id 직접 지정(조회로 이미 확인된
--      불변값, 조인 불필요). 이 문장도 3단계와 마찬가지로 원본(couple_id is null,
--      name='쇼핑')인 단 하나의 행만 읽는다 — 3단계가 방금 넣은 행들은 전부
--      couple_id가 채워져 있고 이름도 '쇼핑'이 아니라서 여기 안 걸린다.
insert into public.categories (couple_id, name, color, icon, sort_order)
select 'a6b01b81-3d74-43ef-92dd-4dbd00ba7123'::uuid, src.name, src.color, src.icon, src.sort_order
from public.categories src
where src.couple_id is null and src.name = '쇼핑';

-- 4) 원본(공유) 행 제거 — 이제 커플별 복제본만 남긴다. NOT NULL 잠금(5단계)보다
--    반드시 먼저 와야 한다 — 원본 8행은 지금 이 순간까지 couple_id가 null이라, 삭제
--    전에 NOT NULL을 걸면 그 자체로 실패한다.
delete from public.categories where couple_id is null;

-- 5) couple_id 필수화 — 4단계로 null 행이 전부 사라진 뒤에만 안전하다.
alter table public.categories alter column couple_id set not null;

-- 6) 조회 인덱스 — CategoriesProvider가 항상 sort_order, id 순으로 정렬해 조회한다.
create index if not exists categories_couple_id_sort_idx
  on public.categories (couple_id, sort_order);

-- 7) INSERT 시 couple_id 자동 채움 — add-couple-rls.sql의 set_couple_id() 재사용.
--    3·3-1단계 백필은 이 트리거가 생기기 전에 이미 끝나 있으므로 영향받지 않는다.
drop trigger if exists trg_categories_couple_id on public.categories;
create trigger trg_categories_couple_id before insert on public.categories
  for each row execute function public.set_couple_id();

-- 8) RLS: 전체 공개 정책 제거 → places와 동일한 4-정책 패턴으로 교체.
drop policy if exists "categories: authenticated access" on public.categories;
create policy "categories: couple select" on public.categories for select to authenticated
  using (couple_id = public.my_couple_id());
create policy "categories: couple insert" on public.categories for insert to authenticated
  with check (couple_id = public.my_couple_id());
create policy "categories: couple update" on public.categories for update to authenticated
  using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());
create policy "categories: couple delete" on public.categories for delete to authenticated
  using (couple_id = public.my_couple_id());

commit;

-- ── 검증 쿼리 (수동 확인용 — 이 파일 실행에는 포함되지 않음, 커밋 후 따로 돌려볼 것) ──
--
-- 1) 커플별 카테고리 수: 진식지민만 8, 나머지 9개 커플은 전부 7이어야 한다.
--   select couple_id, count(*) from public.categories group by couple_id order by count(*) desc;
--
-- 2) 모든 커플에서 places.category가 "그 커플의" categories 이름 집합에 포함되는지
--    (결과가 있으면 그 (couple_id, category) 조합은 categories에 대응 행이 없다는 뜻 —
--    FK가 없어 원래도 있었을 수 있는 고아 문자열이지, 이번 마이그레이션이 만든 문제인지는
--    이 결과와 마이그레이션 전 상태를 비교해 판단할 것):
--   select p.couple_id, p.category, count(*) as places_count
--   from public.places p
--   where not exists (
--     select 1 from public.categories c
--     where c.couple_id = p.couple_id and c.name = p.category
--   )
--   group by p.couple_id, p.category
--   order by p.couple_id, places_count desc;
--
-- 3) 원본 공유 행이 삭제됐는지 — 0건이어야 정상:
--   select count(*) from public.categories where couple_id is null;
--
-- 4) "쇼핑"이 정확히 진식지민 한 커플에만 있는지:
--   select couple_id, count(*) from public.categories where name = '쇼핑' group by couple_id;
