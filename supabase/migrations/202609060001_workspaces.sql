-- Run in the project's SQL Editor. Each authenticated user owns one workspace.
begin;
create table public.atlas_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint atlas_payload_shape check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array['clientes','categorias','itens','orcamentos','itensOrcamento']
    and jsonb_typeof(payload->'clientes') = 'array'
    and jsonb_typeof(payload->'categorias') = 'array'
    and jsonb_typeof(payload->'itens') = 'array'
    and jsonb_typeof(payload->'orcamentos') = 'array'
    and jsonb_typeof(payload->'itensOrcamento') = 'array'
  )
);
alter table public.atlas_workspaces enable row level security;
revoke all on public.atlas_workspaces from public, anon, authenticated;
grant select on public.atlas_workspaces to authenticated;
create policy atlas_read_own on public.atlas_workspaces
  for select to authenticated using (user_id = (select auth.uid()));

-- All writes are atomic and compare revisions to prevent lost updates.
create function public.atlas_save_workspace(expected_revision bigint, new_payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare next_revision bigint;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if expected_revision = 0 then
    insert into public.atlas_workspaces(user_id, payload)
      values (auth.uid(), new_payload)
      on conflict do nothing returning revision into next_revision;
  else
    update public.atlas_workspaces
      set payload = new_payload, revision = revision + 1, updated_at = now()
      where user_id = auth.uid() and revision = expected_revision
      returning revision into next_revision;
  end if;
  return next_revision;
end;
$$;
revoke all on function public.atlas_save_workspace(bigint,jsonb) from public, anon;
grant execute on function public.atlas_save_workspace(bigint,jsonb) to authenticated;
commit;
