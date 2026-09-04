-- Read-only: bucket configuration and every Storage policy, including broad policies.
select jsonb_build_object(
  'bucket', (select jsonb_build_object('id', id, 'public', public)
             from storage.buckets where id = 'place-photos'),
  'rls_enabled', (select relrowsecurity from pg_class
                  where oid = 'storage.objects'::regclass),
  'policies', (select jsonb_agg(jsonb_build_object(
    'name', policyname, 'mode', permissive, 'roles', roles,
    'command', cmd, 'using', qual, 'check', with_check
  ) order by policyname) from pg_policies
    where schemaname = 'storage' and tablename = 'objects')
) as security_audit;
