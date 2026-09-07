-- Run the whole file after migrations 001 through 004.
-- Rows are rolled back; identity sequence values are consumed (normal PostgreSQL behavior).
begin;
insert into auth.users(id, email) values
  ('11111111-1111-4111-8111-111111111111', 'atlas-test-a@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'atlas-test-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
do $$
declare
  result jsonb;
  code bigint;
  base jsonb := '{"clientes":[],"categorias":[],"itens":[],"orcamentos":[],"itensOrcamento":[]}';
  snapshot jsonb;
begin
  result := public.atlas_save_workspace(0, base);
  if (result->>'revision')::bigint is distinct from 1 then raise exception 'Initial write failed'; end if;
  if public.atlas_save_workspace(0, base) is not null then raise exception 'Conflict was not rejected'; end if;
  if (select count(*) from public.atlas_workspaces) <> 1 then raise exception 'Own read failed'; end if;

  snapshot := jsonb_set(base, '{clientes}', '[[null,"Pessoa Física","529.982.247-25","Cliente teste"]]');
  result := public.atlas_save_workspace(1, snapshot);
  code := (result->'payload'->'clientes'->0->>0)::bigint;
  if code is null or code <= 0 or (result->>'revision')::bigint is distinct from 2 then
    raise exception 'Database did not assign a client code';
  end if;
  if (select nome from public.cliente where codigo = code) is distinct from 'Cliente teste' then
    raise exception 'Client table insert failed';
  end if;
  if (select payload->'clientes' from public.atlas_workspaces) is distinct from '[]'::jsonb then
    raise exception 'Clients still stored in workspace JSON';
  end if;
  if (select payload->'clientes'->0->>0 from public.atlas_load_workspace()) is distinct from code::text then
    raise exception 'Relational client load failed';
  end if;

  snapshot := jsonb_set(base, '{clientes}', jsonb_build_array(jsonb_build_array(code, 'Pessoa Física', '529.982.247-25', 'Cliente editado')));
  result := public.atlas_save_workspace(2, snapshot);
  if (result->>'revision')::bigint is distinct from 3 or (result->'payload'->'clientes'->0->>0)::bigint is distinct from code then
    raise exception 'Edit did not preserve code';
  end if;
  if (select nome from public.cliente where codigo = code) is distinct from 'Cliente editado' then raise exception 'Edit failed'; end if;
  if public.atlas_save_workspace(2, base) is not null or (select count(*) from public.cliente) <> 1 then
    raise exception 'Stale revision changed clients';
  end if;
  begin
    perform public.atlas_save_workspace(3, jsonb_set(snapshot, '{clientes,0,3}', '""'));
    raise exception 'Invalid client was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.atlas_save_workspace(3, jsonb_set(snapshot, '{clientes,0,0}', to_jsonb(code + 1000000)));
    raise exception 'Caller assigned a new client code';
  exception when invalid_parameter_value then null;
  end;
  if (select revision from public.atlas_workspaces) is distinct from 3 then raise exception 'Failed write changed revision'; end if;

  result := public.atlas_save_workspace(3, base);
  if (result->>'revision')::bigint is distinct from 4 or (select count(*) from public.cliente) <> 0 then
    raise exception 'Client delete failed';
  end if;
  result := public.atlas_save_workspace(4, jsonb_set(snapshot, '{clientes,0,0}', 'null'));
  if (result->'payload'->'clientes'->0->>0)::bigint <= code then raise exception 'Deleted client code was reused'; end if;
  begin
    delete from public.cliente;
    raise exception 'Direct client delete was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.atlas_workspaces set revision = 100;
    raise exception 'Direct workspace update was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.atlas_workspaces) <> 0 then raise exception 'Cross-user read allowed'; end if;
  if (select count(*) from public.cliente) <> 0 then raise exception 'Cross-user client read allowed'; end if;
  if (select count(*) from public.atlas_load_workspace()) <> 0 then raise exception 'Cross-user RPC read allowed'; end if;
  if public.atlas_save_workspace(5, '{"clientes":[],"categorias":[],"itens":[],"orcamentos":[],"itensOrcamento":[]}') is not null then
    raise exception 'Cross-user write allowed';
  end if;
end $$;
set local role anon;
do $$
begin
  begin
    perform * from public.cliente;
    raise exception 'Anonymous client read allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.atlas_workspaces;
    raise exception 'Anonymous workspace read allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.atlas_save_workspace(0, '{}');
    raise exception 'Anonymous write allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
