-- Apply once after migrations 001, 002 and 003. All changes are transactional.
begin;
lock table public.atlas_workspaces in exclusive mode;
lock table public.cliente in access exclusive mode;

create function public.atlas_parse_date(value text) returns date
language sql immutable strict set search_path = '' as $$
  select case when value ~ '^\d{2}/\d{2}/\d{4}$'
    then make_date(split_part(value,'/',3)::int, split_part(value,'/',2)::int, split_part(value,'/',1)::int)
    else value::date end;
$$;
revoke all on function public.atlas_parse_date(text) from public, anon, authenticated;

create table public.categoria (
  user_id uuid not null references auth.users(id) on delete cascade,
  codigo bigint generated always as identity,
  descricao text not null check (btrim(descricao) <> ''),
  primary key (user_id, codigo)
);
create unique index categoria_descricao_unique on public.categoria
  (user_id, lower(regexp_replace(btrim(descricao), '\s+', ' ', 'g')));
create table public.produto (
  user_id uuid not null references auth.users(id) on delete cascade,
  codigo bigint generated always as identity,
  categoria_codigo bigint not null,
  nome text not null check (btrim(nome) <> ''),
  descricao text not null check (btrim(descricao) <> ''),
  valor_venda numeric(14,2) not null check (valor_venda > 0),
  data_cadastro date not null default current_date,
  status text not null check (status in ('Ativo','Inativo')),
  primary key (user_id, codigo),
  foreign key (user_id,categoria_codigo) references public.categoria(user_id,codigo) deferrable initially deferred
);
create unique index produto_descricao_unique on public.produto
  (user_id, lower(regexp_replace(btrim(descricao), '\s+', ' ', 'g')));
create index produto_categoria_idx on public.produto(user_id,categoria_codigo);
create table public.orcamento (
  user_id uuid not null references auth.users(id) on delete cascade,
  codigo bigint generated always as identity,
  cliente_codigo bigint not null,
  data_emissao date not null default current_date,
  validade date not null,
  valor_total numeric(18,2) not null check (valor_total >= 0),
  primary key (user_id,codigo),
  foreign key (user_id,cliente_codigo) references public.cliente(user_id,codigo) deferrable initially deferred
);
create index orcamento_cliente_idx on public.orcamento(user_id,cliente_codigo);
create table public.item_orcamento (
  user_id uuid not null references auth.users(id) on delete cascade,
  orcamento_codigo bigint not null,
  produto_codigo bigint not null,
  produto_nome text not null,
  quantidade bigint not null check (quantidade > 0),
  valor_unitario numeric(14,2) not null check (valor_unitario > 0),
  valor_total numeric(18,2) generated always as (quantidade * valor_unitario) stored,
  primary key (user_id,orcamento_codigo,produto_codigo),
  foreign key (user_id,orcamento_codigo) references public.orcamento(user_id,codigo) on delete cascade deferrable initially deferred,
  foreign key (user_id,produto_codigo) references public.produto(user_id,codigo) deferrable initially deferred
);
create index item_orcamento_produto_idx on public.item_orcamento(user_id,produto_codigo);

-- Import existing data, preserving codes, dates, prices and references.
insert into public.categoria(user_id,codigo,descricao) overriding system value
select w.user_id,(r->>0)::bigint,r->>1 from public.atlas_workspaces w,
  lateral jsonb_array_elements(w.payload->'categorias') r;
insert into public.produto(user_id,codigo,categoria_codigo,nome,descricao,valor_venda,data_cadastro,status) overriding system value
select w.user_id,(r->>0)::bigint,
  (select c.codigo from public.categoria c where c.user_id=w.user_id and c.descricao=r->>1),
  r->>2,r->>3,(r->>4)::numeric,public.atlas_parse_date(r->>5),r->>6
from public.atlas_workspaces w, lateral jsonb_array_elements(w.payload->'itens') r;
insert into public.orcamento(user_id,codigo,cliente_codigo,data_emissao,validade,valor_total) overriding system value
select w.user_id,(r->>0)::bigint,(r->>2)::bigint,public.atlas_parse_date(r->>3),public.atlas_parse_date(r->>4),(r->>5)::numeric
from public.atlas_workspaces w, lateral jsonb_array_elements(w.payload->'orcamentos') r;
insert into public.item_orcamento(user_id,orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario)
select w.user_id,(r->>0)::bigint,(r->>1)::bigint,r->>2,(r->>3)::bigint,(r->>4)::numeric
from public.atlas_workspaces w, lateral jsonb_array_elements(w.payload->'itensOrcamento') r;

-- Validate imported references before changing table security settings.
set constraints all immediate;

do $migration$
declare entity text; largest bigint;
begin
  foreach entity in array array['categoria','produto','orcamento','item_orcamento'] loop
    execute format('alter table public.%I enable row level security',entity);
    execute format('revoke all on public.%I from public, anon, authenticated',entity);
    execute format('grant select on public.%I to authenticated',entity);
    execute format('create policy read_own on public.%I for select to authenticated using (user_id = (select auth.uid()))',entity);
    if entity <> 'item_orcamento' then
      execute format('select max(codigo) from public.%I',entity) into largest;
      perform setval(pg_get_serial_sequence('public.'||entity,'codigo'),coalesce(largest,1),largest is not null);
      execute format('revoke all on sequence %s from public, anon, authenticated',pg_get_serial_sequence('public.'||entity,'codigo'));
    end if;
  end loop;
end;
$migration$;

create or replace function public.atlas_load_workspace()
returns table(payload jsonb, revision bigint)
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'clientes',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.tipo,c.documento,c.nome) order by c.codigo) from public.cliente c where c.user_id=auth.uid()),'[]'::jsonb),
    'categorias',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.descricao) order by c.codigo) from public.categoria c where c.user_id=auth.uid()),'[]'::jsonb),
    'itens',coalesce((select jsonb_agg(jsonb_build_array(p.codigo,c.descricao,p.nome,p.descricao,p.valor_venda,to_char(p.data_cadastro,'DD/MM/YYYY'),p.status) order by p.codigo) from public.produto p join public.categoria c on (c.user_id,c.codigo)=(p.user_id,p.categoria_codigo) where p.user_id=auth.uid()),'[]'::jsonb),
    'orcamentos',coalesce((select jsonb_agg(jsonb_build_array(o.codigo,c.nome,o.cliente_codigo,to_char(o.data_emissao,'DD/MM/YYYY'),to_char(o.validade,'DD/MM/YYYY'),o.valor_total) order by o.codigo) from public.orcamento o join public.cliente c on (c.user_id,c.codigo)=(o.user_id,o.cliente_codigo) where o.user_id=auth.uid()),'[]'::jsonb),
    'itensOrcamento',coalesce((select jsonb_agg(jsonb_build_array(i.orcamento_codigo,i.produto_codigo,i.produto_nome,i.quantidade,i.valor_unitario,i.valor_total) order by i.orcamento_codigo,i.produto_codigo) from public.item_orcamento i where i.user_id=auth.uid()),'[]'::jsonb)
  ), w.revision from public.atlas_workspaces w where w.user_id=auth.uid();
$$;

-- Reuse the authenticated revision check and client identity logic internally.
alter function public.atlas_save_workspace(bigint,jsonb) rename to atlas_save_clients_internal;
revoke all on function public.atlas_save_clients_internal(bigint,jsonb) from public,anon,authenticated;
create function public.atlas_save_workspace(expected_revision bigint,new_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  saved jsonb; result_payload jsonb; r jsonb; collection text; relation_name text;
  existing_code bigint; generated_budget bigint;
begin
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
          into existing_code using auth.uid(),(r->>0)::bigint;
        if existing_code is null then raise exception 'New codes must be generated by SQL' using errcode='22023'; end if;
      end if;
    end loop;
  end loop;
  if (select count(*) from jsonb_array_elements(new_payload->'orcamentos') r0 where r0->>0 is null)>1 then
    raise exception 'Save one new budget at a time' using errcode='22023';
  end if;

  -- Remove omitted rows in dependency order. Deferred FKs validate final state.
  delete from public.item_orcamento where user_id=auth.uid();
  delete from public.orcamento o where o.user_id=auth.uid() and not exists(select 1 from jsonb_array_elements(new_payload->'orcamentos') r0 where (r0->>0)::bigint=o.codigo);
  delete from public.produto p where p.user_id=auth.uid() and not exists(select 1 from jsonb_array_elements(new_payload->'itens') r0 where (r0->>0)::bigint=p.codigo);
  delete from public.categoria c where c.user_id=auth.uid() and not exists(select 1 from jsonb_array_elements(new_payload->'categorias') r0 where (r0->>0)::bigint=c.codigo);

  for r in select value from jsonb_array_elements(new_payload->'categorias') loop
    if r->>0 is null then insert into public.categoria(user_id,descricao) values(auth.uid(),r->>1);
    else update public.categoria set descricao=r->>1 where user_id=auth.uid() and codigo=(r->>0)::bigint; end if;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'itens') loop
    select codigo into existing_code from public.categoria where user_id=auth.uid() and descricao=r->>1;
    if r->>0 is null then
      insert into public.produto(user_id,categoria_codigo,nome,descricao,valor_venda,status)
        values(auth.uid(),existing_code,r->>2,r->>3,(r->>4)::numeric,r->>6);
    else
      update public.produto set categoria_codigo=existing_code,nome=r->>2,descricao=r->>3,valor_venda=(r->>4)::numeric,status=r->>6
        where user_id=auth.uid() and codigo=(r->>0)::bigint;
    end if;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'orcamentos') loop
    if r->>0 is null then
      insert into public.orcamento(user_id,cliente_codigo,validade,valor_total)
        values(auth.uid(),(r->>2)::bigint,public.atlas_parse_date(r->>4),0) returning codigo into generated_budget;
    else
      update public.orcamento set cliente_codigo=(r->>2)::bigint,validade=public.atlas_parse_date(r->>4)
        where user_id=auth.uid() and codigo=(r->>0)::bigint;
    end if;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'itensOrcamento') loop
    insert into public.item_orcamento(user_id,orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario)
      values(auth.uid(),coalesce((r->>0)::bigint,generated_budget),(r->>1)::bigint,r->>2,(r->>3)::bigint,(r->>4)::numeric);
  end loop;
  if exists(select 1 from public.orcamento o where o.user_id=auth.uid() and not exists(select 1 from public.item_orcamento i where (i.user_id,i.orcamento_codigo)=(o.user_id,o.codigo))) then
    raise exception 'Budget requires at least one item' using errcode='23514';
  end if;
  update public.orcamento o set valor_total=(select sum(i.valor_total) from public.item_orcamento i where (i.user_id,i.orcamento_codigo)=(o.user_id,o.codigo)) where o.user_id=auth.uid();
  -- No business records remain in JSON; this table now holds revision metadata.
  update public.atlas_workspaces set payload='{"clientes":[],"categorias":[],"itens":[],"orcamentos":[],"itensOrcamento":[]}' where user_id=auth.uid();
  select loaded.payload into result_payload from public.atlas_load_workspace() loaded;
  return jsonb_build_object('revision',saved->'revision','payload',result_payload);
end;
$$;
revoke all on function public.atlas_save_workspace(bigint,jsonb) from public,anon;
grant execute on function public.atlas_save_workspace(bigint,jsonb) to authenticated;
update public.atlas_workspaces set payload='{"clientes":[],"categorias":[],"itens":[],"orcamentos":[],"itensOrcamento":[]}',revision=revision+1;
commit;
