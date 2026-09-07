-- Apply once after 004. One shared workspace; only database-appointed admins delete.
-- Conflicting legacy codes/documents/descriptions abort the entire migration.
begin;
lock table public.atlas_workspaces, public.cliente, public.categoria,
  public.produto, public.orcamento, public.item_orcamento in access exclusive mode;
set constraints all deferred;

do $$
declare entity text;
begin
  foreach entity in array array['cliente','categoria','produto','orcamento'] loop
    execute format('do $check$ begin if exists (select codigo from public.%I group by codigo having count(*) > 1) then raise exception ''Shared migration: duplicate codes in %I. Resolve legacy conflicts before retrying.''; end if; end $check$',entity,entity);
  end loop;
  if exists(select 1 from public.cliente group by upper(regexp_replace(documento,'[^a-zA-Z0-9]','','g')) having count(*)>1) then
    raise exception 'Shared migration: duplicate client documents. Resolve legacy conflicts before retrying.';
  end if;
  if exists(select 1 from public.categoria group by lower(regexp_replace(btrim(descricao),'\s+',' ','g')) having count(*)>1)
    or exists(select 1 from public.produto group by lower(regexp_replace(btrim(descricao),'\s+',' ','g')) having count(*)>1) then
    raise exception 'Shared migration: duplicate category/product descriptions. Resolve legacy conflicts before retrying.';
  end if;
end $$;

-- The legacy user_id column now identifies the shared workspace, not an Auth user.
-- Removing an Auth account must never cascade into shared business data.
do $$
declare entity text; constraint_row record;
begin
  foreach entity in array array['atlas_workspaces','cliente','categoria','produto','orcamento','item_orcamento'] loop
    for constraint_row in select conname from pg_catalog.pg_constraint
      where conrelid=('public.'||entity)::regclass and confrelid='auth.users'::regclass loop
      execute format('alter table public.%I drop constraint %I',entity,constraint_row.conname);
    end loop;
  end loop;
end $$;

create table public.atlas_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.atlas_admins enable row level security;
revoke all on public.atlas_admins from public,anon,authenticated;
create function public.atlas_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    and exists(select 1 from public.atlas_admins where user_id=auth.uid());
$$;
revoke all on function public.atlas_is_admin() from public,anon;
grant execute on function public.atlas_is_admin() to authenticated;

-- Keep the revision in this block; no temporary relation or search_path dependency.
do $$
declare shared_revision bigint;
begin
  select coalesce(max(revision),0)+1 into shared_revision from public.atlas_workspaces;
  delete from public.atlas_workspaces;
  insert into public.atlas_workspaces(user_id,revision,payload)
  values ('00000000-0000-4000-8000-000000000001'::uuid,shared_revision,
    '{"clientes":[],"categorias":[],"itens":[],"orcamentos":[],"itensOrcamento":[]}'::jsonb);
end $$;

do $$
declare entity text;
begin
  foreach entity in array array['cliente','categoria','produto','orcamento','item_orcamento'] loop
    execute format('update public.%I set user_id=$1',entity) using '00000000-0000-4000-8000-000000000001'::uuid;
  end loop;
end $$;
set constraints all immediate;

do $$
declare entity text; policy_row record;
begin
  foreach entity in array array['atlas_workspaces','cliente','categoria','produto','orcamento','item_orcamento'] loop
    for policy_row in select policyname from pg_catalog.pg_policies where schemaname='public' and tablename=entity loop
      execute format('drop policy %I on public.%I',policy_row.policyname,entity);
    end loop;
    execute format('create policy shared_read on public.%I for select to authenticated using (auth.uid() is not null and not coalesce((auth.jwt()->>''is_anonymous'')::boolean,false))',entity);
    execute format('alter table public.%I add constraint shared_workspace_only check (user_id = %L::uuid)',entity,'00000000-0000-4000-8000-000000000001'::uuid);
  end loop;
end $$;
set constraints all immediate;

create or replace function public.atlas_save_clients_internal(expected_revision bigint, new_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare next_revision bigint;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(new_payload->'clientes') is distinct from 'array' then
    raise exception 'Invalid client collection' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new_payload->'clientes') as client
    where jsonb_typeof(client) <> 'array'
  ) then raise exception 'Invalid client row' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(new_payload->'clientes') as client
    where jsonb_array_length(client) <> 4
      or jsonb_typeof(client->0) not in ('number', 'null')
  ) then raise exception 'Invalid client row' using errcode = '22023'; end if;

  if expected_revision = 0 then
    insert into public.atlas_workspaces(user_id, payload)
      values ('00000000-0000-4000-8000-000000000001'::uuid, jsonb_set(new_payload, '{clientes}', '[]'::jsonb))
      on conflict do nothing returning revision into next_revision;
  else
    update public.atlas_workspaces
      set payload = jsonb_set(new_payload, '{clientes}', '[]'::jsonb),
          revision = revision + 1, updated_at = now()
      where user_id = '00000000-0000-4000-8000-000000000001'::uuid and revision = expected_revision
      returning revision into next_revision;
  end if;
  if next_revision is null then return null; end if;

  -- Supplied codes may only identify this user's existing clients.
  if exists (
    select 1 from jsonb_array_elements(new_payload->'clientes') as client
    where client->>0 is not null and not exists (
      select 1 from public.cliente as existing
      where existing.user_id = '00000000-0000-4000-8000-000000000001'::uuid and existing.codigo = (client->>0)::bigint
    )
  ) then raise exception 'New client codes must be generated by the database' using errcode = '22023'; end if;
  if exists (
    select client->>0 from jsonb_array_elements(new_payload->'clientes') as client
    where client->>0 is not null group by client->>0 having count(*) > 1
  ) then raise exception 'Duplicate client code' using errcode = '22023'; end if;

  delete from public.cliente as existing
    where existing.user_id = '00000000-0000-4000-8000-000000000001'::uuid and not exists (
      select 1 from jsonb_array_elements(new_payload->'clientes') as client
      where (client->>0)::bigint = existing.codigo
    );
  update public.cliente as existing
    set tipo = client->>1, documento = client->>2, nome = client->>3
    from jsonb_array_elements(new_payload->'clientes') as client
    where existing.user_id = '00000000-0000-4000-8000-000000000001'::uuid and existing.codigo = (client->>0)::bigint;
  insert into public.cliente(user_id, tipo, documento, nome)
    select '00000000-0000-4000-8000-000000000001'::uuid, client->>1, client->>2, client->>3
    from jsonb_array_elements(new_payload->'clientes') as client
    where client->>0 is null;

  return jsonb_build_object('revision', next_revision, 'clientes', coalesce((
    select jsonb_agg(jsonb_build_array(codigo, tipo, documento, nome) order by codigo)
    from public.cliente where user_id = '00000000-0000-4000-8000-000000000001'::uuid
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.atlas_save_clients_internal(bigint,jsonb) from public,anon,authenticated;

drop function public.atlas_load_workspace();
create function public.atlas_load_workspace()
returns table(payload jsonb, revision bigint, is_admin boolean)
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'clientes',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.tipo,c.documento,c.nome) order by c.codigo) from public.cliente c where c.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb),
    'categorias',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.descricao) order by c.codigo) from public.categoria c where c.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb),
    'itens',coalesce((select jsonb_agg(jsonb_build_array(p.codigo,c.descricao,p.nome,p.descricao,p.valor_venda,to_char(p.data_cadastro,'DD/MM/YYYY'),p.status) order by p.codigo) from public.produto p join public.categoria c on (c.user_id,c.codigo)=(p.user_id,p.categoria_codigo) where p.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb),
    'orcamentos',coalesce((select jsonb_agg(jsonb_build_array(o.codigo,c.nome,o.cliente_codigo,to_char(o.data_emissao,'DD/MM/YYYY'),to_char(o.validade,'DD/MM/YYYY'),o.valor_total) order by o.codigo) from public.orcamento o join public.cliente c on (c.user_id,c.codigo)=(o.user_id,o.cliente_codigo) where o.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb),
    'itensOrcamento',coalesce((select jsonb_agg(jsonb_build_array(i.orcamento_codigo,i.produto_codigo,i.produto_nome,i.quantidade,i.valor_unitario,i.valor_total) order by i.orcamento_codigo,i.produto_codigo) from public.item_orcamento i where i.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb)
  ), w.revision, public.atlas_is_admin() from public.atlas_workspaces w where w.user_id='00000000-0000-4000-8000-000000000001'::uuid;
$$;


revoke all on function public.atlas_load_workspace() from public,anon;
grant execute on function public.atlas_load_workspace() to authenticated;

create or replace function public.atlas_save_workspace(expected_revision bigint,new_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  saved jsonb; result_payload jsonb; r jsonb; collection text; relation_name text;
  deletion_requested boolean;
  existing_code bigint; generated_budget bigint;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  -- Lock one global revision before permission checks or any mutations.
  perform 1 from public.atlas_workspaces where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision for update;
  if not found then return null; end if;
  -- Validate collection shape before iterating or deleting records.
  foreach collection in array array['clientes','categorias','itens','orcamentos','itensOrcamento'] loop
    if jsonb_typeof(new_payload->collection) is distinct from 'array' then
      raise exception 'Invalid collection: %',collection using errcode='22023';
    end if;
    for r in select value from jsonb_array_elements(new_payload->collection) loop
      if jsonb_typeof(r) <> 'array' then raise exception 'Invalid row' using errcode='22023'; end if;
      if jsonb_array_length(r) <> (case collection when 'clientes' then 4 when 'categorias' then 2 when 'itens' then 7 else 6 end) then
        raise exception 'Invalid row length' using errcode='22023';
      end if;
    end loop;
  end loop;
  if not public.atlas_is_admin() then
    foreach collection in array array['clientes','categorias','itens','orcamentos'] loop
      relation_name := case collection when 'clientes' then 'cliente' when 'categorias' then 'categoria' when 'itens' then 'produto' else 'orcamento' end;
      execute format('select exists(select 1 from public.%I e where not exists(select 1 from jsonb_array_elements($1) r where (r->>0)::bigint=e.codigo))',relation_name)
        into deletion_requested using new_payload->collection;
      if deletion_requested then raise exception 'Only administrators may delete records' using errcode='42501'; end if;
    end loop;
    if exists(select 1 from public.item_orcamento e where not exists(
      select 1 from jsonb_array_elements(new_payload->'itensOrcamento') candidate
      where (candidate->>0)::bigint=e.orcamento_codigo and (candidate->>1)::bigint=e.produto_codigo)) then
      raise exception 'Only administrators may delete budget items' using errcode='42501';
    end if;
  end if;
  saved := public.atlas_save_clients_internal(expected_revision,new_payload);
  if saved is null then return null; end if;

  -- Supplied codes must refer to existing rows owned by the caller.
  foreach collection in array array['categorias','itens','orcamentos'] loop
    relation_name := case collection when 'categorias' then 'categoria' when 'itens' then 'produto' else 'orcamento' end;
    if exists(select r0->>0 from jsonb_array_elements(new_payload->collection) r0 where r0->>0 is not null group by r0->>0 having count(*)>1) then
      raise exception 'Duplicate code' using errcode='22023';
    end if;
    for r in select value from jsonb_array_elements(new_payload->collection) loop
      if jsonb_typeof(r->0) not in ('number','null') then raise exception 'Invalid code' using errcode='22023'; end if;
      if r->>0 is not null then
        execute format('select codigo from public.%I where user_id=$1 and codigo=$2',relation_name)
          into existing_code using '00000000-0000-4000-8000-000000000001'::uuid,(r->>0)::bigint;
        if existing_code is null then raise exception 'New codes must be generated by SQL' using errcode='22023'; end if;
      end if;
    end loop;
  end loop;
  if (select count(*) from jsonb_array_elements(new_payload->'orcamentos') r0 where r0->>0 is null)>1 then
    raise exception 'Save one new budget at a time' using errcode='22023';
  end if;

  -- Remove omitted rows in dependency order. Deferred FKs validate final state.
  delete from public.item_orcamento where user_id='00000000-0000-4000-8000-000000000001'::uuid;
  delete from public.orcamento o where o.user_id='00000000-0000-4000-8000-000000000001'::uuid and not exists(select 1 from jsonb_array_elements(new_payload->'orcamentos') r0 where (r0->>0)::bigint=o.codigo);
  delete from public.produto p where p.user_id='00000000-0000-4000-8000-000000000001'::uuid and not exists(select 1 from jsonb_array_elements(new_payload->'itens') r0 where (r0->>0)::bigint=p.codigo);
  delete from public.categoria c where c.user_id='00000000-0000-4000-8000-000000000001'::uuid and not exists(select 1 from jsonb_array_elements(new_payload->'categorias') r0 where (r0->>0)::bigint=c.codigo);

  for r in select value from jsonb_array_elements(new_payload->'categorias') loop
    if r->>0 is null then insert into public.categoria(user_id,descricao) values('00000000-0000-4000-8000-000000000001'::uuid,r->>1);
    else update public.categoria set descricao=r->>1 where user_id='00000000-0000-4000-8000-000000000001'::uuid and codigo=(r->>0)::bigint; end if;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'itens') loop
    select codigo into existing_code from public.categoria where user_id='00000000-0000-4000-8000-000000000001'::uuid and descricao=r->>1;
    if r->>0 is null then
      insert into public.produto(user_id,categoria_codigo,nome,descricao,valor_venda,status)
        values('00000000-0000-4000-8000-000000000001'::uuid,existing_code,r->>2,r->>3,(r->>4)::numeric,r->>6);
    else
      update public.produto set categoria_codigo=existing_code,nome=r->>2,descricao=r->>3,valor_venda=(r->>4)::numeric,status=r->>6
        where user_id='00000000-0000-4000-8000-000000000001'::uuid and codigo=(r->>0)::bigint;
    end if;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'orcamentos') loop
    if r->>0 is null then
      insert into public.orcamento(user_id,cliente_codigo,validade,valor_total)
        values('00000000-0000-4000-8000-000000000001'::uuid,(r->>2)::bigint,public.atlas_parse_date(r->>4),0) returning codigo into generated_budget;
    else
      update public.orcamento set cliente_codigo=(r->>2)::bigint,validade=public.atlas_parse_date(r->>4)
        where user_id='00000000-0000-4000-8000-000000000001'::uuid and codigo=(r->>0)::bigint;
    end if;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'itensOrcamento') loop
    insert into public.item_orcamento(user_id,orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario)
      values('00000000-0000-4000-8000-000000000001'::uuid,coalesce((r->>0)::bigint,generated_budget),(r->>1)::bigint,r->>2,(r->>3)::bigint,(r->>4)::numeric);
  end loop;
  if exists(select 1 from public.orcamento o where o.user_id='00000000-0000-4000-8000-000000000001'::uuid and not exists(select 1 from public.item_orcamento i where (i.user_id,i.orcamento_codigo)=(o.user_id,o.codigo))) then
    raise exception 'Budget requires at least one item' using errcode='23514';
  end if;
  update public.orcamento o set valor_total=(select sum(i.valor_total) from public.item_orcamento i where (i.user_id,i.orcamento_codigo)=(o.user_id,o.codigo)) where o.user_id='00000000-0000-4000-8000-000000000001'::uuid;
  -- No business records remain in JSON; this table now holds revision metadata.
  update public.atlas_workspaces set payload='{"clientes":[],"categorias":[],"itens":[],"orcamentos":[],"itensOrcamento":[]}' where user_id='00000000-0000-4000-8000-000000000001'::uuid;
  select loaded.payload into result_payload from public.atlas_load_workspace() loaded;
  return jsonb_build_object('revision',saved->'revision','payload',result_payload);
end;
$$;

revoke all on function public.atlas_save_workspace(bigint,jsonb) from public,anon;
grant execute on function public.atlas_save_workspace(bigint,jsonb) to authenticated;
commit;
