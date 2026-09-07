-- Apply after 202609060001_workspaces.sql, once, as project administrator.
-- Existing client snapshots are migrated in the same transaction.
begin;
lock table public.atlas_workspaces in exclusive mode;

create table public.cliente (
  user_id uuid not null references auth.users(id) on delete cascade,
  codigo bigint not null check (codigo > 0),
  tipo text not null check (tipo in ('Pessoa Física', 'Pessoa Jurídica')),
  documento text not null check (btrim(documento) <> ''),
  nome text not null check (btrim(nome) <> ''),
  primary key (user_id, codigo)
);
create unique index cliente_documento_unique on public.cliente
  (user_id, upper(regexp_replace(documento, '[^a-zA-Z0-9]', '', 'g')));
alter table public.cliente enable row level security;
revoke all on public.cliente from public, anon, authenticated;
grant select on public.cliente to authenticated;
create policy cliente_read_own on public.cliente
  for select to authenticated using (user_id = (select auth.uid()));

insert into public.cliente(user_id, codigo, tipo, documento, nome)
select workspace.user_id, (client->>0)::bigint, client->>1, client->>2, client->>3
from public.atlas_workspaces as workspace,
  lateral jsonb_array_elements(workspace.payload->'clientes') as client;

-- Keep the outer payload shape compatible, but cliente is now the source of truth.
-- Advance revisions so sessions opened before the migration must reload.
update public.atlas_workspaces
  set payload = jsonb_set(payload, '{clientes}', '[]'::jsonb),
      revision = revision + 1, updated_at = now();

create or replace function public.atlas_save_workspace(expected_revision bigint, new_payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare next_revision bigint;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(new_payload->'clientes') is distinct from 'array' then
    raise exception 'Invalid client collection' using errcode = '22023';
  end if;
  if expected_revision = 0 then
    insert into public.atlas_workspaces(user_id, payload)
      values (auth.uid(), jsonb_set(new_payload, '{clientes}', '[]'::jsonb))
      on conflict do nothing returning revision into next_revision;
  else
    update public.atlas_workspaces
      set payload = jsonb_set(new_payload, '{clientes}', '[]'::jsonb),
          revision = revision + 1, updated_at = now()
      where user_id = auth.uid() and revision = expected_revision
      returning revision into next_revision;
  end if;
  if next_revision is null then return null; end if;

  insert into public.cliente as existing(user_id, codigo, tipo, documento, nome)
    select auth.uid(), (client->>0)::bigint, client->>1, client->>2, client->>3
    from jsonb_array_elements(new_payload->'clientes') as client
    on conflict (user_id, codigo) do update
      set tipo = excluded.tipo, documento = excluded.documento, nome = excluded.nome
      where (existing.tipo, existing.documento, existing.nome)
        is distinct from (excluded.tipo, excluded.documento, excluded.nome);
  delete from public.cliente as existing
    where existing.user_id = auth.uid() and not exists (
      select 1 from jsonb_array_elements(new_payload->'clientes') as client
      where (client->>0)::bigint = existing.codigo
    );
  return next_revision;
end;
$$;
revoke all on function public.atlas_save_workspace(bigint,jsonb) from public, anon;
grant execute on function public.atlas_save_workspace(bigint,jsonb) to authenticated;

-- One statement reads clients and the other collections at the same snapshot.
create function public.atlas_load_workspace()
returns table(payload jsonb, revision bigint)
language sql stable security invoker set search_path = '' as $$
  select jsonb_set(workspace.payload, '{clientes}', coalesce((
    select jsonb_agg(jsonb_build_array(client.codigo, client.tipo, client.documento, client.nome) order by client.codigo)
    from public.cliente as client where client.user_id = auth.uid()
  ), '[]'::jsonb)), workspace.revision
  from public.atlas_workspaces as workspace where workspace.user_id = auth.uid();
$$;
revoke all on function public.atlas_load_workspace() from public, anon;
grant execute on function public.atlas_load_workspace() to authenticated;
commit;
