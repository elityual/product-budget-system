-- Run the entire file after migrations 001-008 in SQL Editor.
-- All rows and edits roll back. Sequences may acquire normal gaps.
begin;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','atlas-admin-test@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','atlas-editor-test@example.invalid');
insert into public.atlas_admins values ('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","user_metadata":{"role":"admin"}}',true);
do $$
declare snapshot record; result jsonb; attempted jsonb; test_code bigint;
begin
  if public.atlas_is_admin() then raise exception 'User metadata granted admin'; end if;
  select * into snapshot from public.atlas_load_workspace();
  perform set_config('atlas.test.original',snapshot.payload::text,true);
  result := public.atlas_save_workspace(snapshot.revision,
    jsonb_set(snapshot.payload,'{categorias}',snapshot.payload->'categorias' || jsonb_build_array(jsonb_build_array(null,'Authorization test '||gen_random_uuid()::text))));
  if result is null then raise exception 'Editor insert failed'; end if;
  select max(codigo) into test_code from public.categoria;
  perform set_config('atlas.test.code',test_code::text,true);
  perform set_config('atlas.test.revision',result->>'revision',true);
  attempted := jsonb_set(result->'payload','{categorias}',coalesce((
    select jsonb_agg(row) from jsonb_array_elements(result->'payload'->'categorias') row where (row->>0)::bigint<>test_code),'[]'::jsonb));
  begin
    perform public.atlas_save_workspace((result->>'revision')::bigint,attempted);
    raise exception 'Editor deletion was allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.categoria where codigo=test_code;
    raise exception 'Direct deletion was allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.atlas_admins values ('22222222-2222-4222-8222-222222222222');
    raise exception 'Self promotion was allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111"}',true);
do $$
declare snapshot record; result jsonb; test_code bigint := current_setting('atlas.test.code')::bigint;
begin
  if not public.atlas_is_admin() then raise exception 'Admin missing'; end if;
  select * into snapshot from public.atlas_load_workspace();
  if not exists(select 1 from public.categoria where codigo=test_code) then raise exception 'Shared read failed'; end if;
  result := public.atlas_save_workspace(snapshot.revision,current_setting('atlas.test.original')::jsonb);
  if result is null or exists(select 1 from public.categoria where codigo=test_code) then raise exception 'Admin deletion failed'; end if;
  if public.atlas_save_workspace(snapshot.revision,result->'payload') is not null then raise exception 'Stale write allowed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","is_anonymous":true}',true);
do $$
begin
  if exists(select 1 from public.atlas_load_workspace()) then raise exception 'Anonymous Auth read allowed'; end if;
end $$;
set local role anon;
do $$
begin
  begin perform * from public.cliente; raise exception 'Anonymous read allowed';
  exception when insufficient_privilege then null; end;
  begin perform * from public.atlas_load_workspace(); raise exception 'Anonymous RPC allowed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
