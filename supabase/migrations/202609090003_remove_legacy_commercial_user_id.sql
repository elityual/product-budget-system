-- ISS-001: remove ownership columns from legacy commercial tables.
-- Execute after 202609090002_legacy_budget_user.sql.
-- The current Atlas contract shares commercial records between authenticated users.
begin;

create table if not exists public.atlas_legacy_user_id_backup (
  table_name text not null,
  record_key jsonb not null,
  user_id text,
  archived_at timestamptz not null default now(),
  primary key (table_name, record_key)
);
alter table public.atlas_legacy_user_id_backup enable row level security;
revoke all on public.atlas_legacy_user_id_backup from public, anon, authenticated;

do $$
declare
  target record;
  constraint_name text;
  key_expression text;
begin
  for target in
    select c.oid, n.nspname as schema_name, c.relname as table_name, a.attnum
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attname='user_id' and not a.attisdropped
    where n.nspname='public'
      and c.relname in ('cliente','categoria','produto','orcamento','item_orcamento','cliente_contato','cliente_telefone','cliente_endereco')
    order by c.relname
  loop
    if exists (
      select 1 from pg_catalog.pg_constraint con
      where con.confrelid=target.oid and target.attnum=any(con.confkey)
    ) then
      raise exception 'ISS-001 interrompida: outra tabela referencia %.user_id por chave estrangeira; execute a auditoria e revise a dependência antes de migrar.', target.table_name using errcode='2BP01';
    end if;
    -- A FK on user_id is the only dependency that this migration removes deliberately.
    if exists (
      select 1 from pg_catalog.pg_constraint con
      where con.conrelid=target.oid and target.attnum=any(con.conkey)
        and con.contype not in ('f','n')
    ) then
      raise exception 'ISS-001 interrompida: %.user_id participa de uma constraint não suportada; execute a auditoria e revise a dependência antes de migrar.', target.table_name using errcode='2BP01';
    end if;
    if exists (
      select 1 from pg_catalog.pg_index ix
      where ix.indrelid=target.oid and target.attnum=any(ix.indkey)
    ) then
      raise exception 'ISS-001 interrompida: %.user_id participa de um índice; execute a auditoria e revise a dependência antes de migrar.', target.table_name using errcode='2BP01';
    end if;
    if exists (
      select 1 from pg_catalog.pg_policy pol
      where pol.polrelid=target.oid
        and (coalesce(pg_catalog.pg_get_expr(pol.polqual,pol.polrelid),'') ilike '%user_id%'
          or coalesce(pg_catalog.pg_get_expr(pol.polwithcheck,pol.polrelid),'') ilike '%user_id%')
    ) then
      raise exception 'ISS-001 interrompida: %.user_id é usado por uma política RLS; execute a auditoria e revise a dependência antes de migrar.', target.table_name using errcode='2BP01';
    end if;
    if exists (
      select 1 from pg_catalog.pg_trigger tg
      where tg.tgrelid=target.oid and not tg.tgisinternal
        and pg_catalog.pg_get_triggerdef(tg.oid) ilike '%user_id%'
    ) then
      raise exception 'ISS-001 interrompida: %.user_id é usado por um trigger; execute a auditoria e revise a dependência antes de migrar.', target.table_name using errcode='2BP01';
    end if;
    if exists (
      select 1 from pg_catalog.pg_depend d
      join pg_catalog.pg_class dependent on dependent.oid=d.objid
      where d.refobjid=target.oid and d.refobjsubid=target.attnum and dependent.relkind in ('v','m')
    ) then
      raise exception 'ISS-001 interrompida: %.user_id é usado por uma view; execute a auditoria e revise a dependência antes de migrar.', target.table_name using errcode='2BP01';
    end if;
  end loop;

  for target in
    select c.oid, n.nspname as schema_name, c.relname as table_name, a.attnum
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attname='user_id' and not a.attisdropped
    where n.nspname='public'
      and c.relname in ('cliente','categoria','produto','orcamento','item_orcamento','cliente_contato','cliente_telefone','cliente_endereco')
    order by c.relname
  loop
    key_expression := case target.table_name
      when 'item_orcamento' then 'jsonb_build_object(''orcamento_codigo'',orcamento_codigo,''produto_codigo'',produto_codigo)'
      when 'cliente_contato' then 'jsonb_build_object(''cliente_codigo'',cliente_codigo)'
      else 'jsonb_build_object(''codigo'',codigo)'
    end;
    execute format(
      'insert into public.atlas_legacy_user_id_backup(table_name,record_key,user_id)
       select %L,%s,user_id::text from %I.%I
       on conflict(table_name,record_key) do nothing',
      target.table_name, key_expression, target.schema_name, target.table_name
    );
    for constraint_name in
      select conname from pg_catalog.pg_constraint
      where conrelid=target.oid and target.attnum=any(conkey) and contype='f'
    loop
      execute format('alter table %I.%I drop constraint %I', target.schema_name, target.table_name, constraint_name);
    end loop;
    execute format('alter table %I.%I drop column user_id', target.schema_name, target.table_name);
  end loop;
end;
$$;

commit;
