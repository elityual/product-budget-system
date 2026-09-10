-- ISS-001: converte o esquema legado de workspace compartilhado com chaves (user_id,codigo).
-- Use somente após a auditoria 202609090003 confirmar as dependências esperadas.
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
declare target record;
begin
  -- The legacy check guarantees one shared workspace; codes must therefore become unique by themselves.
  if exists (select 1 from public.cliente group by codigo having codigo is null or count(*) > 1)
     or exists (select 1 from public.categoria group by codigo having codigo is null or count(*) > 1)
     or exists (select 1 from public.produto group by codigo having codigo is null or count(*) > 1)
     or exists (select 1 from public.orcamento group by codigo having codigo is null or count(*) > 1) then
    raise exception 'ISS-001 interrompida: há códigos comerciais nulos ou repetidos; corrija-os antes de migrar.' using errcode='23505';
  end if;
  if exists (select 1 from public.item_orcamento group by orcamento_codigo,produto_codigo having orcamento_codigo is null or produto_codigo is null or count(*) > 1) then
    raise exception 'ISS-001 interrompida: há itens de orçamento nulos ou repetidos; corrija-os antes de migrar.' using errcode='23505';
  end if;

  for target in
    select c.oid, c.relname as table_name, a.attnum
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attname='user_id' and not a.attisdropped
    where n.nspname='public' and c.relname in ('cliente','categoria','produto','orcamento','item_orcamento')
  loop
    if exists (
      select 1 from pg_catalog.pg_constraint con
      where con.conrelid=target.oid and target.attnum=any(con.conkey)
        and con.contype <> 'n'
        and con.conname not in ('cliente_pkey','categoria_pkey','produto_pkey','orcamento_pkey','item_orcamento_pkey','shared_workspace_only','produto_user_id_categoria_codigo_fkey','orcamento_user_id_cliente_codigo_fkey','item_orcamento_user_id_orcamento_codigo_fkey','item_orcamento_user_id_produto_codigo_fkey')
    ) then
      raise exception 'ISS-001 interrompida: %.user_id participa de uma constraint não auditada.', target.table_name using errcode='2BP01';
    end if;
    if exists (
      select 1 from pg_catalog.pg_constraint con
      where con.confrelid=target.oid and target.attnum=any(con.confkey)
        and con.conname not in ('produto_user_id_categoria_codigo_fkey','orcamento_user_id_cliente_codigo_fkey','item_orcamento_user_id_orcamento_codigo_fkey','item_orcamento_user_id_produto_codigo_fkey')
    ) then
      raise exception 'ISS-001 interrompida: outra tabela referencia %.user_id por uma FK não auditada.', target.table_name using errcode='2BP01';
    end if;
    if exists (
      select 1 from pg_catalog.pg_index ix join pg_catalog.pg_class idx on idx.oid=ix.indexrelid
      where ix.indrelid=target.oid and target.attnum=any(ix.indkey)
        and idx.relname not in ('cliente_pkey','categoria_pkey','produto_pkey','orcamento_pkey','item_orcamento_pkey','cliente_documento_unique','categoria_descricao_unique','produto_descricao_unique','produto_categoria_idx','orcamento_cliente_idx','item_orcamento_produto_idx')
    ) then
      raise exception 'ISS-001 interrompida: %.user_id participa de um índice não auditado.', target.table_name using errcode='2BP01';
    end if;
    if exists (
      select 1 from pg_catalog.pg_policy pol
      where pol.polrelid=target.oid and (coalesce(pg_catalog.pg_get_expr(pol.polqual,pol.polrelid),'') ilike '%user_id%' or coalesce(pg_catalog.pg_get_expr(pol.polwithcheck,pol.polrelid),'') ilike '%user_id%')
    ) or exists (
      select 1 from pg_catalog.pg_trigger tg
      where tg.tgrelid=target.oid and not tg.tgisinternal and pg_catalog.pg_get_triggerdef(tg.oid) ilike '%user_id%'
    ) or exists (
      select 1 from pg_catalog.pg_depend d join pg_catalog.pg_class dependent on dependent.oid=d.objid
      where d.refobjid=target.oid and d.refobjsubid=target.attnum and dependent.relkind in ('v','m')
    ) then
      raise exception 'ISS-001 interrompida: %.user_id possui policy, trigger ou view dependente não suportada.', target.table_name using errcode='2BP01';
    end if;
  end loop;
end;
$$;

-- Preserve the old owner values before any key or column is removed.
do $$
begin
if not exists (
  select 1 from pg_catalog.pg_attribute
  where attrelid='public.cliente'::regclass and attname='user_id' and not attisdropped
) then
  return;
end if;

insert into public.atlas_legacy_user_id_backup(table_name,record_key,user_id)
select 'cliente',jsonb_build_object('codigo',codigo),user_id::text from public.cliente
on conflict(table_name,record_key) do nothing;
insert into public.atlas_legacy_user_id_backup(table_name,record_key,user_id)
select 'categoria',jsonb_build_object('codigo',codigo),user_id::text from public.categoria
on conflict(table_name,record_key) do nothing;
insert into public.atlas_legacy_user_id_backup(table_name,record_key,user_id)
select 'produto',jsonb_build_object('codigo',codigo),user_id::text from public.produto
on conflict(table_name,record_key) do nothing;
insert into public.atlas_legacy_user_id_backup(table_name,record_key,user_id)
select 'orcamento',jsonb_build_object('codigo',codigo),user_id::text from public.orcamento
on conflict(table_name,record_key) do nothing;
insert into public.atlas_legacy_user_id_backup(table_name,record_key,user_id)
select 'item_orcamento',jsonb_build_object('orcamento_codigo',orcamento_codigo,'produto_codigo',produto_codigo),user_id::text from public.item_orcamento
on conflict(table_name,record_key) do nothing;

-- Remove only the audited composite foreign keys before changing their parent keys.
alter table public.item_orcamento drop constraint if exists item_orcamento_user_id_orcamento_codigo_fkey;
alter table public.item_orcamento drop constraint if exists item_orcamento_user_id_produto_codigo_fkey;
alter table public.orcamento drop constraint if exists orcamento_user_id_cliente_codigo_fkey;
alter table public.produto drop constraint if exists produto_user_id_categoria_codigo_fkey;

alter table public.item_orcamento drop constraint if exists shared_workspace_only;
alter table public.orcamento drop constraint if exists shared_workspace_only;
alter table public.produto drop constraint if exists shared_workspace_only;
alter table public.categoria drop constraint if exists shared_workspace_only;
alter table public.cliente drop constraint if exists shared_workspace_only;

alter table public.item_orcamento drop constraint if exists item_orcamento_pkey;
alter table public.orcamento drop constraint if exists orcamento_pkey;
alter table public.produto drop constraint if exists produto_pkey;
alter table public.categoria drop constraint if exists categoria_pkey;
alter table public.cliente drop constraint if exists cliente_pkey;

drop index if exists public.item_orcamento_produto_idx;
drop index if exists public.orcamento_cliente_idx;
drop index if exists public.produto_categoria_idx;
drop index if exists public.produto_descricao_unique;
drop index if exists public.categoria_descricao_unique;
drop index if exists public.cliente_documento_unique;

alter table public.item_orcamento drop column user_id;
alter table public.orcamento drop column user_id;
alter table public.produto drop column user_id;
alter table public.categoria drop column user_id;
alter table public.cliente drop column user_id;

alter table public.cliente add primary key (codigo);
alter table public.categoria add primary key (codigo);
alter table public.produto add primary key (codigo);
alter table public.orcamento add primary key (codigo);
alter table public.item_orcamento add primary key (orcamento_codigo,produto_codigo);

alter table public.produto add constraint produto_categoria_codigo_fkey foreign key (categoria_codigo) references public.categoria(codigo) deferrable initially deferred;
alter table public.orcamento add constraint orcamento_cliente_codigo_fkey foreign key (cliente_codigo) references public.cliente(codigo) deferrable initially deferred;
alter table public.item_orcamento add constraint item_orcamento_orcamento_codigo_fkey foreign key (orcamento_codigo) references public.orcamento(codigo) on delete cascade deferrable initially deferred;
alter table public.item_orcamento add constraint item_orcamento_produto_codigo_fkey foreign key (produto_codigo) references public.produto(codigo) deferrable initially deferred;

create unique index cliente_documento_unico on public.cliente (upper(regexp_replace(documento,'[^a-zA-Z0-9]','','g')));
create unique index categoria_descricao_unica on public.categoria (lower(regexp_replace(btrim(descricao),'\s+',' ','g')));
create unique index produto_descricao_unica on public.produto (lower(regexp_replace(btrim(descricao),'\s+',' ','g')));
create index produto_categoria_idx on public.produto(categoria_codigo);
create index orcamento_cliente_idx on public.orcamento(cliente_codigo);
create index item_orcamento_produto_idx on public.item_orcamento(produto_codigo);
end;
$$;

commit;
