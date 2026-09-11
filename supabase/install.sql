-- Atlas: instalação completa para um projeto Supabase novo.
-- Gerado por npm run build:sql. Não editar diretamente.
-- Execute este arquivo inteiro no SQL Editor; configure o administrador conforme docs/SUPABASE.md.
-- Sem dados de exemplo. Para atualizar bancos existentes, use as migrações individuais.

-- Origem: 202609080001_initial.sql
-- Instalação inicial do Atlas. Execute o arquivo inteiro em um projeto vazio.
begin;

create table public.atlas_workspaces (
  user_id uuid primary key default '00000000-0000-4000-8000-000000000001'::uuid,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.atlas_workspaces default values;

create table public.atlas_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table public.cliente (
  codigo bigint generated always as identity primary key,
  tipo text not null check (tipo in ('Pessoa Física','Pessoa Jurídica')),
  documento text not null check (btrim(documento) <> ''),
  nome text not null check (btrim(nome) <> '')
);
create unique index cliente_documento_unico on public.cliente (upper(regexp_replace(documento,'[^a-zA-Z0-9]','','g')));

create table public.categoria (
  codigo bigint generated always as identity primary key,
  descricao text not null check (btrim(descricao) <> '')
);
create unique index categoria_descricao_unica on public.categoria (lower(regexp_replace(btrim(descricao),'\s+',' ','g')));

create table public.produto (
  codigo bigint generated always as identity primary key,
  categoria_codigo bigint not null references public.categoria(codigo) deferrable initially deferred,
  nome text not null check (btrim(nome) <> ''),
  descricao text not null check (btrim(descricao) <> ''),
  valor_venda numeric(14,2) not null check (valor_venda > 0),
  data_cadastro date not null default current_date,
  status text not null check (status in ('Ativo','Inativo'))
);
create unique index produto_descricao_unica on public.produto (lower(regexp_replace(btrim(descricao),'\s+',' ','g')));

create table public.orcamento (
  codigo bigint generated always as identity primary key,
  cliente_codigo bigint not null references public.cliente(codigo) deferrable initially deferred,
  data_emissao date not null default current_date,
  validade date not null,
  aprovado boolean not null default false
);

create table public.item_orcamento (
  orcamento_codigo bigint not null references public.orcamento(codigo) on delete cascade deferrable initially deferred,
  produto_codigo bigint not null references public.produto(codigo) deferrable initially deferred,
  produto_nome text not null,
  quantidade bigint not null check (quantidade > 0),
  valor_unitario numeric(14,2) not null check (valor_unitario > 0),
  valor_total numeric(18,2) generated always as (quantidade * valor_unitario) stored,
  primary key (orcamento_codigo, produto_codigo)
);

create function public.atlas_parse_date(value text) returns date
language sql immutable strict set search_path = '' as $$
  select case when value ~ '^\d{2}/\d{2}/\d{4}$'
    then make_date(split_part(value,'/',3)::int,split_part(value,'/',2)::int,split_part(value,'/',1)::int)
    else value::date end
$$;

create function public.atlas_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    and exists(select 1 from public.atlas_admins where user_id=auth.uid())
$$;

create function public.atlas_load_workspace()
returns table(payload jsonb, revision bigint, is_admin boolean, approved_codes jsonb)
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'clientes',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.tipo,c.documento,c.nome) order by c.codigo) from public.cliente c),'[]'::jsonb),
    'categorias',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.descricao) order by c.codigo) from public.categoria c),'[]'::jsonb),
    'itens',coalesce((select jsonb_agg(jsonb_build_array(p.codigo,c.descricao,p.nome,p.descricao,p.valor_venda,to_char(p.data_cadastro,'DD/MM/YYYY'),p.status) order by p.codigo) from public.produto p join public.categoria c on c.codigo=p.categoria_codigo),'[]'::jsonb),
    'orcamentos',coalesce((select jsonb_agg(jsonb_build_array(o.codigo,o.cliente_codigo,c.nome,to_char(o.data_emissao,'DD/MM/YYYY'),to_char(o.validade,'DD/MM/YYYY'),coalesce((select sum(i.valor_total) from public.item_orcamento i where i.orcamento_codigo=o.codigo),0)) order by o.codigo) from public.orcamento o join public.cliente c on c.codigo=o.cliente_codigo),'[]'::jsonb),
    'itensOrcamento',coalesce((select jsonb_agg(jsonb_build_array(i.orcamento_codigo,i.produto_codigo,i.produto_nome,i.quantidade,i.valor_unitario,i.valor_total) order by i.orcamento_codigo,i.produto_codigo) from public.item_orcamento i),'[]'::jsonb)
  ), w.revision, public.atlas_is_admin(), coalesce((select jsonb_agg(codigo order by codigo) from public.orcamento where aprovado),'[]'::jsonb)
  from public.atlas_workspaces w;
$$;

create function public.atlas_save_workspace(expected_revision bigint,new_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  row_value jsonb; collection text; relation_name text; existing_code bigint; generated_budget bigint;
  deletion_requested boolean; next_revision bigint; result_payload jsonb;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Autenticação necessária' using errcode='42501';
  end if;
  perform 1 from public.atlas_workspaces where revision=expected_revision for update;
  if not found then return null; end if;
  foreach collection in array array['clientes','categorias','itens','orcamentos','itensOrcamento'] loop
    if jsonb_typeof(new_payload->collection) is distinct from 'array' then raise exception 'Coleção inválida: %',collection using errcode='22023'; end if;
    for row_value in select value from jsonb_array_elements(new_payload->collection) loop
      if jsonb_typeof(row_value) <> 'array' or jsonb_array_length(row_value) <> (case collection when 'clientes' then 4 when 'categorias' then 2 when 'itens' then 7 else 6 end) then
        raise exception 'Linha inválida em %',collection using errcode='22023';
      end if;
    end loop;
  end loop;
  -- Contrato único de orçamento: código, código do cliente, nome, emissão, validade e total.
  for row_value in select value from jsonb_array_elements(new_payload->'orcamentos') loop
    if jsonb_typeof(row_value->1) is distinct from 'number' or jsonb_typeof(row_value->2) is distinct from 'string'
       or row_value->>1 !~ '^[0-9]+$' or (row_value->>1)::bigint <= 0 then
      raise exception 'Orçamento deve usar código do cliente antes do nome' using errcode='22023';
    end if;
    if row_value->>3 !~ '^([0-9]{2}/[0-9]{2}/[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})$'
       or row_value->>4 !~ '^([0-9]{2}/[0-9]{2}/[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})$' then
      raise exception 'Data de orçamento inválida' using errcode='22023';
    end if;
    perform public.atlas_parse_date(row_value->>3);
    perform public.atlas_parse_date(row_value->>4);
  end loop;
  foreach collection in array array['clientes','categorias','itens','orcamentos'] loop
    if exists(
      select 1
      from jsonb_array_elements(new_payload->collection) duplicate_row
      where duplicate_row->>0 is not null
      group by duplicate_row->>0
      having count(*) > 1
    ) then
      raise exception 'Códigos repetidos em %',collection using errcode='22023';
    end if;
  end loop;
  for row_value in select value from jsonb_array_elements(new_payload->'itens') loop
    if row_value->>5 !~ '^([0-9]{2}/[0-9]{2}/[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})$' then
      raise exception 'Data de cadastro de produto inválida' using errcode='22023';
    end if;
    perform public.atlas_parse_date(row_value->>5);
  end loop;
  for row_value in select value from jsonb_array_elements(new_payload->'itens') loop
    if row_value->>4 !~ '^[0-9]+(\.[0-9]{1,2})?$' or (row_value->>4)::numeric <= 0
       or row_value->>6 not in ('Ativo','Inativo') then
      raise exception 'Produto inválido' using errcode='22023';
    end if;
  end loop;
  for row_value in select value from jsonb_array_elements(new_payload->'itensOrcamento') loop
    if row_value->>1 !~ '^[0-9]+$' or (row_value->>1)::bigint <= 0
       or row_value->>3 !~ '^[0-9]+$' or (row_value->>3)::bigint <= 0
       or row_value->>4 !~ '^[0-9]+(\.[0-9]{1,2})?$' or (row_value->>4)::numeric <= 0 then
      raise exception 'Item de orçamento inválido' using errcode='22023';
    end if;
    if row_value->>0 is not null and (row_value->>0) !~ '^[0-9]+$' then
      raise exception 'Código de orçamento inválido' using errcode='22023';
    end if;
  end loop;
  if not public.atlas_is_admin() then
    foreach collection in array array['clientes','categorias','itens'] loop
      relation_name := case collection when 'clientes' then 'cliente' when 'categorias' then 'categoria' else 'produto' end;
      execute format('select exists(select 1 from public.%I e where not exists(select 1 from jsonb_array_elements($1) r where (r->>0)::bigint=e.codigo))',relation_name) into deletion_requested using new_payload->collection;
      if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
    end loop;
  end if;
  foreach collection in array array['clientes','categorias','itens','orcamentos'] loop
    relation_name := case collection when 'clientes' then 'cliente' when 'categorias' then 'categoria' when 'itens' then 'produto' else 'orcamento' end;
    for row_value in select value from jsonb_array_elements(new_payload->collection) loop
      if jsonb_typeof(row_value->0) not in ('number','null') then raise exception 'Código inválido' using errcode='22023'; end if;
      if row_value->>0 is not null then
        execute format('select codigo from public.%I where codigo=$1',relation_name) into existing_code using (row_value->>0)::bigint;
        if existing_code is null then raise exception 'Novos códigos devem ser gerados pelo banco' using errcode='22023'; end if;
      end if;
    end loop;
  end loop;
  if (select count(*) from jsonb_array_elements(new_payload->'orcamentos') r where r->>0 is null)>1 then raise exception 'Salve um orçamento novo por vez' using errcode='22023'; end if;

  -- Substituição integral intencional; a chave não nula delimita os itens existentes.
  delete from public.item_orcamento where orcamento_codigo is not null;
  delete from public.orcamento where not exists(select 1 from jsonb_array_elements(new_payload->'orcamentos') r where (r->>0)::bigint=codigo);
  delete from public.produto where not exists(select 1 from jsonb_array_elements(new_payload->'itens') r where (r->>0)::bigint=codigo);
  delete from public.categoria where not exists(select 1 from jsonb_array_elements(new_payload->'categorias') r where (r->>0)::bigint=codigo);
  delete from public.cliente where not exists(select 1 from jsonb_array_elements(new_payload->'clientes') r where (r->>0)::bigint=codigo);

  for row_value in select value from jsonb_array_elements(new_payload->'clientes') loop
    if row_value->>0 is null then insert into public.cliente(tipo,documento,nome) values(row_value->>1,row_value->>2,row_value->>3);
    else update public.cliente set tipo=row_value->>1,documento=row_value->>2,nome=row_value->>3 where codigo=(row_value->>0)::bigint; end if;
  end loop;
  for row_value in select value from jsonb_array_elements(new_payload->'categorias') loop
    if row_value->>0 is null then insert into public.categoria(descricao) values(row_value->>1);
    else update public.categoria set descricao=row_value->>1 where codigo=(row_value->>0)::bigint; end if;
  end loop;
  for row_value in select value from jsonb_array_elements(new_payload->'itens') loop
    select codigo into existing_code from public.categoria where lower(regexp_replace(btrim(descricao),'\s+',' ','g'))=lower(regexp_replace(btrim(row_value->>1),'\s+',' ','g'));
    if row_value->>0 is null then insert into public.produto(categoria_codigo,nome,descricao,valor_venda,status) values(existing_code,row_value->>2,row_value->>3,(row_value->>4)::numeric,row_value->>6);
    else update public.produto set categoria_codigo=existing_code,nome=row_value->>2,descricao=row_value->>3,valor_venda=(row_value->>4)::numeric,status=row_value->>6 where codigo=(row_value->>0)::bigint; end if;
  end loop;
  for row_value in select value from jsonb_array_elements(new_payload->'orcamentos') loop
    if row_value->>0 is null then insert into public.orcamento(cliente_codigo,validade) values((row_value->>1)::bigint,public.atlas_parse_date(row_value->>4)) returning codigo into generated_budget;
    else update public.orcamento set cliente_codigo=(row_value->>1)::bigint,validade=public.atlas_parse_date(row_value->>4) where codigo=(row_value->>0)::bigint; end if;
  end loop;
  for row_value in select value from jsonb_array_elements(new_payload->'itensOrcamento') loop
    insert into public.item_orcamento(orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario) values(coalesce((row_value->>0)::bigint,generated_budget),(row_value->>1)::bigint,row_value->>2,(row_value->>3)::bigint,(row_value->>4)::numeric);
  end loop;
  if exists(select 1 from public.orcamento o where not exists(select 1 from public.item_orcamento i where i.orcamento_codigo=o.codigo)) then raise exception 'Orçamento exige ao menos um item' using errcode='23514'; end if;
  update public.atlas_workspaces set revision=revision+1,updated_at=now() where revision=expected_revision returning revision into next_revision;
  select loaded.payload into result_payload from public.atlas_load_workspace() loaded;
  return jsonb_build_object('revision',next_revision,'payload',result_payload,'approved_codes',(select coalesce(jsonb_agg(codigo order by codigo),'[]'::jsonb) from public.orcamento where aprovado));
end;
$$;

create function public.atlas_approve_budget(expected_revision bigint,budget_code bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare next_revision bigint; result_payload jsonb;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  perform 1 from public.atlas_workspaces where revision=expected_revision for update;
  if not found then return null; end if;
  update public.orcamento set aprovado=true where codigo=budget_code and not aprovado;
  if not found then raise exception 'Orçamento inexistente ou já aprovado' using errcode='22023'; end if;
  update public.atlas_workspaces set revision=revision+1,updated_at=now() where revision=expected_revision returning revision into next_revision;
  select loaded.payload into result_payload from public.atlas_load_workspace() loaded;
  return jsonb_build_object('revision',next_revision,'payload',result_payload,'approved_codes',(select jsonb_agg(codigo order by codigo) from public.orcamento where aprovado));
end;
$$;

alter table public.atlas_workspaces enable row level security;
alter table public.atlas_admins enable row level security;
do $$ declare table_name text; begin
  foreach table_name in array array['cliente','categoria','produto','orcamento','item_orcamento'] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;
-- As tabelas só podem ser lidas por sessões autenticadas; gravações passam pelas RPCs.
create policy leitura_autenticada on public.atlas_workspaces for select to authenticated using (auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
create policy leitura_autenticada on public.cliente for select to authenticated using (auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
create policy leitura_autenticada on public.categoria for select to authenticated using (auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
create policy leitura_autenticada on public.produto for select to authenticated using (auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
create policy leitura_autenticada on public.orcamento for select to authenticated using (auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
create policy leitura_autenticada on public.item_orcamento for select to authenticated using (auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
revoke all on public.atlas_admins,public.atlas_workspaces,public.cliente,public.categoria,public.produto,public.orcamento,public.item_orcamento from public,anon,authenticated;
grant select on public.atlas_workspaces,public.cliente,public.categoria,public.produto,public.orcamento,public.item_orcamento to authenticated;
revoke all on function public.atlas_load_workspace(),public.atlas_save_workspace(bigint,jsonb),public.atlas_approve_budget(bigint,bigint) from public,anon;
grant execute on function public.atlas_load_workspace(),public.atlas_save_workspace(bigint,jsonb),public.atlas_approve_budget(bigint,bigint) to authenticated;
revoke all on function public.atlas_parse_date(text),public.atlas_is_admin() from public,anon,authenticated;
grant execute on function public.atlas_is_admin() to authenticated;
commit;

-- Origem: 202609090001_quotation_details.sql
-- Detalhes opcionais de documentos comerciais. Execute após as migrações de 08/09/2026.
begin;
alter table public.atlas_workspaces add column if not exists empresa jsonb not null default '{"nome":"Atlas Máquinas & Obras"}'::jsonb;
alter table public.cliente add column if not exists detalhes jsonb not null default '{}'::jsonb;
alter table public.orcamento add column if not exists detalhes jsonb not null default '{}'::jsonb;
alter table public.item_orcamento add column if not exists produto_descricao text not null default '';
-- Instalações antigas podem ter `cliente.codigo` sem PK/UNIQUE; a FK exige uma chave candidata.
do $$
declare codigo_attnum smallint;
begin
  select attnum into codigo_attnum from pg_attribute
    where attrelid='public.cliente'::regclass and attname='codigo' and not attisdropped;
  if codigo_attnum is null then raise exception 'A tabela public.cliente não possui a coluna codigo' using errcode='42703'; end if;
  if exists(select 1 from public.cliente group by codigo having codigo is null or count(*)>1) then
    raise exception 'Não é possível criar os contatos: cliente.codigo contém valor nulo ou repetido' using errcode='23505';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.cliente'::regclass and contype in ('p','u') and conkey=array[codigo_attnum]) then
    alter table public.cliente add constraint cliente_codigo_unico unique(codigo);
  end if;
end;
$$;
create table if not exists public.cliente_contato (cliente_codigo bigint primary key references public.cliente(codigo) on delete cascade, email text not null default '', pessoa_contato text not null default '');
create table if not exists public.cliente_telefone (codigo bigint generated always as identity primary key, cliente_codigo bigint not null references public.cliente(codigo) on delete cascade, telefone text not null check (btrim(telefone)<>''), principal boolean not null default false);
create table if not exists public.cliente_endereco (codigo bigint generated always as identity primary key, cliente_codigo bigint not null references public.cliente(codigo) on delete cascade, cep text not null default '', logradouro text not null default '', numero text not null default '', complemento text not null default '', bairro text not null default '', cidade text not null default '', uf text not null default '', texto_legado text not null default '', principal boolean not null default false);
create unique index if not exists cliente_telefone_principal_unico on public.cliente_telefone(cliente_codigo) where principal;
create unique index if not exists cliente_endereco_principal_unico on public.cliente_endereco(cliente_codigo) where principal;
insert into public.cliente_contato(cliente_codigo,email,pessoa_contato) select codigo,coalesce(detalhes->>'email',''),coalesce(detalhes->>'contato','') from public.cliente where detalhes<>'{}'::jsonb on conflict(cliente_codigo) do nothing;
insert into public.cliente_telefone(cliente_codigo,telefone,principal) select codigo,detalhes->>'telefone',true from public.cliente c where coalesce(detalhes->>'telefone','')<>'' and not exists(select 1 from public.cliente_telefone t where t.cliente_codigo=c.codigo);
insert into public.cliente_endereco(cliente_codigo,texto_legado,principal) select codigo,detalhes->>'endereco',true from public.cliente c where coalesce(detalhes->>'endereco','')<>'' and not exists(select 1 from public.cliente_endereco e where e.cliente_codigo=c.codigo);
alter table public.cliente_contato enable row level security;
alter table public.cliente_telefone enable row level security;
alter table public.cliente_endereco enable row level security;
drop policy if exists leitura_autenticada on public.cliente_contato; create policy leitura_autenticada on public.cliente_contato for select to authenticated using (auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
drop policy if exists leitura_autenticada on public.cliente_telefone; create policy leitura_autenticada on public.cliente_telefone for select to authenticated using (auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
drop policy if exists leitura_autenticada on public.cliente_endereco; create policy leitura_autenticada on public.cliente_endereco for select to authenticated using (auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
revoke all on public.cliente_contato,public.cliente_telefone,public.cliente_endereco from public,anon,authenticated;
grant select on public.cliente_contato,public.cliente_telefone,public.cliente_endereco to authenticated;

-- Perfil compartilhado do workspace; somente sessões autenticadas podem alterá-lo.
create or replace function public.atlas_save_company(profile jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sanitized jsonb; next_revision bigint;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  if jsonb_typeof(profile) <> 'object' or btrim(coalesce(profile->>'nome','')) = '' or length(profile->>'nome') > 160 then raise exception 'Empresa inválida' using errcode='22023'; end if;
  sanitized := jsonb_build_object('nome',btrim(profile->>'nome'),'cnpj',btrim(coalesce(profile->>'cnpj','')),'endereco',btrim(coalesce(profile->>'endereco','')),'telefone',btrim(coalesce(profile->>'telefone','')),'email',btrim(coalesce(profile->>'email','')));
  update public.atlas_workspaces set empresa=sanitized, revision=revision+1, updated_at=now()
    where user_id='00000000-0000-4000-8000-000000000001'::uuid returning revision into next_revision;
  return jsonb_build_object('empresa',sanitized,'revision',next_revision);
end;
$$;
revoke all on function public.atlas_save_company(jsonb) from public,anon;
grant execute on function public.atlas_save_company(jsonb) to authenticated;

create or replace function public.atlas_load_workspace()
returns table(payload jsonb, revision bigint, is_admin boolean, approved_codes jsonb)
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'clientes',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.tipo,c.documento,c.nome) order by c.codigo) from public.cliente c),'[]'::jsonb),
    'contatosClientes',coalesce((select jsonb_agg(jsonb_build_array(x.cliente_codigo,x.email,x.pessoa_contato) order by x.cliente_codigo) from public.cliente_contato x),'[]'::jsonb),
    'telefonesClientes',coalesce((select jsonb_agg(jsonb_build_array(x.codigo,x.cliente_codigo,x.telefone,x.principal) order by x.cliente_codigo,x.codigo) from public.cliente_telefone x),'[]'::jsonb),
    'enderecosClientes',coalesce((select jsonb_agg(jsonb_build_array(x.codigo,x.cliente_codigo,x.cep,x.logradouro,x.numero,x.complemento,x.bairro,x.cidade,x.uf,x.texto_legado,x.principal) order by x.cliente_codigo,x.codigo) from public.cliente_endereco x),'[]'::jsonb),
    'categorias',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.descricao) order by c.codigo) from public.categoria c),'[]'::jsonb),
    'itens',coalesce((select jsonb_agg(jsonb_build_array(p.codigo,c.descricao,p.nome,p.descricao,p.valor_venda,to_char(p.data_cadastro,'DD/MM/YYYY'),p.status) order by p.codigo) from public.produto p join public.categoria c on c.codigo=p.categoria_codigo),'[]'::jsonb),
    'orcamentos',coalesce((select jsonb_agg(jsonb_build_array(o.codigo,o.cliente_codigo,c.nome,to_char(o.data_emissao,'DD/MM/YYYY'),to_char(o.validade,'DD/MM/YYYY'),coalesce((select sum(i.valor_total) from public.item_orcamento i where i.orcamento_codigo=o.codigo),0),o.detalhes) order by o.codigo) from public.orcamento o join public.cliente c on c.codigo=o.cliente_codigo),'[]'::jsonb),
    'itensOrcamento',coalesce((select jsonb_agg(jsonb_build_array(i.orcamento_codigo,i.produto_codigo,i.produto_nome,i.quantidade,i.valor_unitario,i.valor_total,i.produto_descricao) order by i.orcamento_codigo,i.produto_codigo) from public.item_orcamento i),'[]'::jsonb),
    'empresa',w.empresa
  ),w.revision,public.atlas_is_admin(),coalesce((select jsonb_agg(codigo order by codigo) from public.orcamento where aprovado),'[]'::jsonb)
  from public.atlas_workspaces w where w.user_id='00000000-0000-4000-8000-000000000001'::uuid;
$$;

create or replace function public.atlas_save_workspace(expected_revision bigint,new_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; existing_code bigint; generated_budget bigint; generated_client bigint; generated_client_count integer := 0; phone_text text; next_revision bigint; result_payload jsonb; deletion_requested boolean;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  perform 1 from public.atlas_workspaces where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision for update;
  if not found then return null; end if;
  if not public.atlas_is_admin() then
    select exists(select 1 from public.cliente e where not exists(select 1 from jsonb_array_elements(new_payload->'clientes') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
    select exists(select 1 from public.categoria e where not exists(select 1 from jsonb_array_elements(new_payload->'categorias') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
    select exists(select 1 from public.produto e where not exists(select 1 from jsonb_array_elements(new_payload->'itens') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new_payload->'telefonesClientes','[]'::jsonb)) x group by x->>1 having count(*) filter(where (x->>3)::boolean)<>1)
     or exists(select 1 from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) x group by x->>1 having count(*) filter(where (x->>10)::boolean)<>1) then raise exception 'Cada lista de contato deve possuir um principal' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new_payload->'contatosClientes','[]'::jsonb)) x where coalesce(x->>1,'')<>'' and x->>1 !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or exists(select 1 from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) x where (coalesce(x->>2,'')<>'' and x->>2 !~ '^[0-9]{5}-?[0-9]{3}$') or (coalesce(x->>8,'')<>'' and x->>8 !~ '^[A-Za-z]{2}$')) then raise exception 'Contato de cliente inválido' using errcode='22023'; end if;
  delete from public.item_orcamento where orcamento_codigo is not null;
  delete from public.cliente_telefone where codigo is not null;
  delete from public.cliente_endereco where codigo is not null;
  delete from public.cliente_contato where cliente_codigo is not null;
  delete from public.orcamento where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'orcamentos') j where (j->>0)::bigint=codigo);
  delete from public.produto where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'itens') j where (j->>0)::bigint=codigo);
  delete from public.categoria where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'categorias') j where (j->>0)::bigint=codigo);
  delete from public.cliente where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'clientes') j where (j->>0)::bigint=codigo);
  for r in select value from jsonb_array_elements(new_payload->'clientes') loop
    if jsonb_array_length(r)<>4 then raise exception 'Cliente inválido' using errcode='22023'; end if;
    if r->>0 is null then insert into public.cliente(tipo,documento,nome) values(r->>1,r->>2,r->>3) returning codigo into generated_client; generated_client_count := generated_client_count + 1;
    else update public.cliente set tipo=r->>1,documento=r->>2,nome=r->>3 where codigo=(r->>0)::bigint; end if;
  end loop;
  if generated_client_count>0 and not new_payload ? 'novoClienteContato' then raise exception 'Contato obrigatório do novo cliente inválido' using errcode='22023'; end if;
  if new_payload ? 'novoClienteContato' then
    if generated_client_count<>1 or generated_client is null or jsonb_typeof(new_payload->'novoClienteContato')<>'object' or coalesce(new_payload->'novoClienteContato'->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or jsonb_typeof(new_payload->'novoClienteContato'->'telefones')<>'array' or jsonb_array_length(new_payload->'novoClienteContato'->'telefones')=0 or exists(select 1 from jsonb_array_elements_text(new_payload->'novoClienteContato'->'telefones') value where btrim(value)='') or (exists(select 1 from public.cliente where codigo=generated_client and tipo='Pessoa Jurídica') and btrim(coalesce(new_payload->'novoClienteContato'->>'pessoa',''))='') then raise exception 'Contato obrigatório do novo cliente inválido' using errcode='22023'; end if;
    insert into public.cliente_contato(cliente_codigo,email,pessoa_contato) values(generated_client,btrim(new_payload->'novoClienteContato'->>'email'),btrim(coalesce(new_payload->'novoClienteContato'->>'pessoa','')));
    for phone_text in select value from jsonb_array_elements_text(new_payload->'novoClienteContato'->'telefones') loop insert into public.cliente_telefone(cliente_codigo,telefone,principal) values(generated_client,btrim(phone_text),not exists(select 1 from public.cliente_telefone where cliente_codigo=generated_client)); end loop;
  end if;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'contatosClientes','[]'::jsonb)) loop insert into public.cliente_contato(cliente_codigo,email,pessoa_contato) values((r->>0)::bigint,r->>1,r->>2); end loop;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'telefonesClientes','[]'::jsonb)) loop insert into public.cliente_telefone(cliente_codigo,telefone,principal) values((r->>1)::bigint,r->>2,(r->>3)::boolean); end loop;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) loop insert into public.cliente_endereco(cliente_codigo,cep,logradouro,numero,complemento,bairro,cidade,uf,texto_legado,principal) values((r->>1)::bigint,r->>2,r->>3,r->>4,r->>5,r->>6,r->>7,upper(r->>8),r->>9,(r->>10)::boolean); end loop;
  for r in select value from jsonb_array_elements(new_payload->'categorias') loop if r->>0 is null then insert into public.categoria(descricao) values(r->>1); else update public.categoria set descricao=r->>1 where codigo=(r->>0)::bigint; end if; end loop;
  for r in select value from jsonb_array_elements(new_payload->'itens') loop
    select codigo into existing_code from public.categoria where lower(regexp_replace(btrim(descricao),'\s+',' ','g'))=lower(regexp_replace(btrim(r->>1),'\s+',' ','g'));
    if r->>0 is null then insert into public.produto(categoria_codigo,nome,descricao,valor_venda,status) values(existing_code,r->>2,r->>3,(r->>4)::numeric,r->>6); else update public.produto set categoria_codigo=existing_code,nome=r->>2,descricao=r->>3,valor_venda=(r->>4)::numeric,status=r->>6 where codigo=(r->>0)::bigint; end if;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'orcamentos') loop
    if r->>0 is null then insert into public.orcamento(cliente_codigo,validade,detalhes) values((r->>1)::bigint,public.atlas_parse_date(r->>4),coalesce(r->6,'{}'::jsonb)) returning codigo into generated_budget;
    else update public.orcamento set cliente_codigo=(r->>1)::bigint,validade=public.atlas_parse_date(r->>4),detalhes=coalesce(r->6,'{}'::jsonb) where codigo=(r->>0)::bigint; end if;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'itensOrcamento') loop insert into public.item_orcamento(orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario,produto_descricao) values(coalesce((r->>0)::bigint,generated_budget),(r->>1)::bigint,r->>2,(r->>3)::bigint,(r->>4)::numeric,coalesce(r->>6,'')); end loop;
  update public.atlas_workspaces set revision=revision+1,updated_at=now() where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision returning revision into next_revision;
  select loaded.payload into result_payload from public.atlas_load_workspace() loaded;
  return jsonb_build_object('revision',next_revision,'payload',result_payload,'empresa',result_payload->'empresa','approved_codes',(select coalesce(jsonb_agg(codigo order by codigo),'[]'::jsonb) from public.orcamento where aprovado));
end;
$$;
commit;

-- Origem: 202609090005_refresh_workspace_contact_rpcs.sql
-- Atualiza somente as RPCs para o contrato de contatos obrigatórios na criação.
-- Execute após 202609090004_migrate_legacy_composite_commercial_keys.sql.
-- Não repete a migração de dados legados de cliente.detalhes.
begin;

do $$
begin
  if to_regclass('public.cliente_contato') is null
     or to_regclass('public.cliente_telefone') is null
     or to_regclass('public.cliente_endereco') is null then
    raise exception 'Execute 202609090001_quotation_details.sql antes desta migração' using errcode='42P01';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid in (
      'public.cliente'::regclass,'public.categoria'::regclass,'public.produto'::regclass,
      'public.orcamento'::regclass,'public.item_orcamento'::regclass
    ) and a.attname='user_id' and not a.attisdropped
  ) then
    raise exception 'Execute 202609090004_migrate_legacy_composite_commercial_keys.sql antes desta migração' using errcode='55000';
  end if;
end;
$$;

create or replace function public.atlas_load_workspace()
returns table(payload jsonb, revision bigint, is_admin boolean, approved_codes jsonb)
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'clientes',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.tipo,c.documento,c.nome) order by c.codigo) from public.cliente c),'[]'::jsonb),
    'contatosClientes',coalesce((select jsonb_agg(jsonb_build_array(x.cliente_codigo,x.email,x.pessoa_contato) order by x.cliente_codigo) from public.cliente_contato x),'[]'::jsonb),
    'telefonesClientes',coalesce((select jsonb_agg(jsonb_build_array(x.codigo,x.cliente_codigo,x.telefone,x.principal) order by x.cliente_codigo,x.codigo) from public.cliente_telefone x),'[]'::jsonb),
    'enderecosClientes',coalesce((select jsonb_agg(jsonb_build_array(x.codigo,x.cliente_codigo,x.cep,x.logradouro,x.numero,x.complemento,x.bairro,x.cidade,x.uf,x.texto_legado,x.principal) order by x.cliente_codigo,x.codigo) from public.cliente_endereco x),'[]'::jsonb),
    'categorias',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.descricao) order by c.codigo) from public.categoria c),'[]'::jsonb),
    'itens',coalesce((select jsonb_agg(jsonb_build_array(p.codigo,c.descricao,p.nome,p.descricao,p.valor_venda,to_char(p.data_cadastro,'DD/MM/YYYY'),p.status) order by p.codigo) from public.produto p join public.categoria c on c.codigo=p.categoria_codigo),'[]'::jsonb),
    'orcamentos',coalesce((select jsonb_agg(jsonb_build_array(o.codigo,o.cliente_codigo,c.nome,to_char(o.data_emissao,'DD/MM/YYYY'),to_char(o.validade,'DD/MM/YYYY'),coalesce((select sum(i.valor_total) from public.item_orcamento i where i.orcamento_codigo=o.codigo),0),o.detalhes) order by o.codigo) from public.orcamento o join public.cliente c on c.codigo=o.cliente_codigo),'[]'::jsonb),
    'itensOrcamento',coalesce((select jsonb_agg(jsonb_build_array(i.orcamento_codigo,i.produto_codigo,i.produto_nome,i.quantidade,i.valor_unitario,i.valor_total,i.produto_descricao) order by i.orcamento_codigo,i.produto_codigo) from public.item_orcamento i),'[]'::jsonb),
    'empresa',w.empresa
  ),w.revision,public.atlas_is_admin(),coalesce((select jsonb_agg(codigo order by codigo) from public.orcamento where aprovado),'[]'::jsonb)
  from public.atlas_workspaces w where w.user_id='00000000-0000-4000-8000-000000000001'::uuid;
$$;

create or replace function public.atlas_save_workspace(expected_revision bigint,new_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; existing_code bigint; generated_budget bigint; generated_client bigint; generated_client_count integer := 0; phone_text text; next_revision bigint; result_payload jsonb; deletion_requested boolean;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  perform 1 from public.atlas_workspaces where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision for update;
  if not found then return null; end if;
  if not public.atlas_is_admin() then
    select exists(select 1 from public.cliente e where not exists(select 1 from jsonb_array_elements(new_payload->'clientes') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
    select exists(select 1 from public.categoria e where not exists(select 1 from jsonb_array_elements(new_payload->'categorias') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
    select exists(select 1 from public.produto e where not exists(select 1 from jsonb_array_elements(new_payload->'itens') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new_payload->'telefonesClientes','[]'::jsonb)) x group by x->>1 having count(*) filter(where (x->>3)::boolean)<>1)
     or exists(select 1 from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) x group by x->>1 having count(*) filter(where (x->>10)::boolean)<>1) then raise exception 'Cada lista de contato deve possuir um principal' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new_payload->'contatosClientes','[]'::jsonb)) x where coalesce(x->>1,'')<>'' and x->>1 !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or exists(select 1 from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) x where (coalesce(x->>2,'')<>'' and x->>2 !~ '^[0-9]{5}-?[0-9]{3}$') or (coalesce(x->>8,'')<>'' and x->>8 !~ '^[A-Za-z]{2}$')) then raise exception 'Contato de cliente inválido' using errcode='22023'; end if;
  delete from public.item_orcamento where orcamento_codigo is not null;
  delete from public.cliente_telefone where codigo is not null;
  delete from public.cliente_endereco where codigo is not null;
  delete from public.cliente_contato where cliente_codigo is not null;
  delete from public.orcamento where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'orcamentos') j where (j->>0)::bigint=codigo);
  delete from public.produto where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'itens') j where (j->>0)::bigint=codigo);
  delete from public.categoria where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'categorias') j where (j->>0)::bigint=codigo);
  delete from public.cliente where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'clientes') j where (j->>0)::bigint=codigo);
  for r in select value from jsonb_array_elements(new_payload->'clientes') loop
    if jsonb_array_length(r)<>4 then raise exception 'Cliente inválido' using errcode='22023'; end if;
    if r->>0 is null then insert into public.cliente(tipo,documento,nome) values(r->>1,r->>2,r->>3) returning codigo into generated_client; generated_client_count := generated_client_count + 1;
    else update public.cliente set tipo=r->>1,documento=r->>2,nome=r->>3 where codigo=(r->>0)::bigint; end if;
  end loop;
  if generated_client_count>0 and not new_payload ? 'novoClienteContato' then raise exception 'Contato obrigatório do novo cliente inválido' using errcode='22023'; end if;
  if new_payload ? 'novoClienteContato' then
    if generated_client_count<>1 or generated_client is null or jsonb_typeof(new_payload->'novoClienteContato')<>'object' or coalesce(new_payload->'novoClienteContato'->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or jsonb_typeof(new_payload->'novoClienteContato'->'telefones')<>'array' or jsonb_array_length(new_payload->'novoClienteContato'->'telefones')=0 or exists(select 1 from jsonb_array_elements_text(new_payload->'novoClienteContato'->'telefones') value where btrim(value)='') or (exists(select 1 from public.cliente where codigo=generated_client and tipo='Pessoa Jurídica') and btrim(coalesce(new_payload->'novoClienteContato'->>'pessoa',''))='') then raise exception 'Contato obrigatório do novo cliente inválido' using errcode='22023'; end if;
    insert into public.cliente_contato(cliente_codigo,email,pessoa_contato) values(generated_client,btrim(new_payload->'novoClienteContato'->>'email'),btrim(coalesce(new_payload->'novoClienteContato'->>'pessoa','')));
    for phone_text in select value from jsonb_array_elements_text(new_payload->'novoClienteContato'->'telefones') loop insert into public.cliente_telefone(cliente_codigo,telefone,principal) values(generated_client,btrim(phone_text),not exists(select 1 from public.cliente_telefone where cliente_codigo=generated_client)); end loop;
  end if;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'contatosClientes','[]'::jsonb)) loop insert into public.cliente_contato(cliente_codigo,email,pessoa_contato) values((r->>0)::bigint,r->>1,r->>2); end loop;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'telefonesClientes','[]'::jsonb)) loop insert into public.cliente_telefone(cliente_codigo,telefone,principal) values((r->>1)::bigint,r->>2,(r->>3)::boolean); end loop;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) loop insert into public.cliente_endereco(cliente_codigo,cep,logradouro,numero,complemento,bairro,cidade,uf,texto_legado,principal) values((r->>1)::bigint,r->>2,r->>3,r->>4,r->>5,r->>6,r->>7,upper(r->>8),r->>9,(r->>10)::boolean); end loop;
  for r in select value from jsonb_array_elements(new_payload->'categorias') loop if r->>0 is null then insert into public.categoria(descricao) values(r->>1); else update public.categoria set descricao=r->>1 where codigo=(r->>0)::bigint; end if; end loop;
  for r in select value from jsonb_array_elements(new_payload->'itens') loop
    select codigo into existing_code from public.categoria where lower(regexp_replace(btrim(descricao),'\s+',' ','g'))=lower(regexp_replace(btrim(r->>1),'\s+',' ','g'));
    if r->>0 is null then insert into public.produto(categoria_codigo,nome,descricao,valor_venda,status) values(existing_code,r->>2,r->>3,(r->>4)::numeric,r->>6); else update public.produto set categoria_codigo=existing_code,nome=r->>2,descricao=r->>3,valor_venda=(r->>4)::numeric,status=r->>6 where codigo=(r->>0)::bigint; end if;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'orcamentos') loop
    if r->>0 is null then insert into public.orcamento(cliente_codigo,validade,detalhes) values((r->>1)::bigint,public.atlas_parse_date(r->>4),coalesce(r->6,'{}'::jsonb)) returning codigo into generated_budget;
    else update public.orcamento set cliente_codigo=(r->>1)::bigint,validade=public.atlas_parse_date(r->>4),detalhes=coalesce(r->6,'{}'::jsonb) where codigo=(r->>0)::bigint; end if;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'itensOrcamento') loop insert into public.item_orcamento(orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario,produto_descricao) values(coalesce((r->>0)::bigint,generated_budget),(r->>1)::bigint,r->>2,(r->>3)::bigint,(r->>4)::numeric,coalesce(r->>6,'')); end loop;
  update public.atlas_workspaces set revision=revision+1,updated_at=now() where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision returning revision into next_revision;
  select loaded.payload into result_payload from public.atlas_load_workspace() loaded;
  return jsonb_build_object('revision',next_revision,'payload',result_payload,'empresa',result_payload->'empresa','approved_codes',(select coalesce(jsonb_agg(codigo order by codigo),'[]'::jsonb) from public.orcamento where aprovado));
end;
$$;

revoke all on function public.atlas_load_workspace(), public.atlas_save_workspace(bigint,jsonb) from public, anon;
grant execute on function public.atlas_load_workspace(), public.atlas_save_workspace(bigint,jsonb) to authenticated;

commit;

-- Origem: 202609090006_normalize_details.sql
-- Remove cliente.detalhes e orcamento.detalhes após normalizar seus valores.
-- Execute após 202609090005_refresh_workspace_contact_rpcs.sql.
begin;

create table if not exists public.orcamento_informacao (
  orcamento_codigo bigint primary key references public.orcamento(codigo) on delete cascade,
  pagamento text not null default '', prazo_entrega text not null default '', local_entrega text not null default '', observacoes text not null default '',
  empresa_nome text not null default '', empresa_cnpj text not null default '', empresa_endereco text not null default '', empresa_telefone text not null default '', empresa_email text not null default '',
  cliente_tipo text not null default '', cliente_documento text not null default '', cliente_nome text not null default '', cliente_email text not null default '',
  cliente_pessoa_contato text not null default '', cliente_telefone text not null default '', cliente_endereco text not null default ''
);
alter table public.orcamento_informacao enable row level security;
drop policy if exists leitura_autenticada on public.orcamento_informacao;
create policy leitura_autenticada on public.orcamento_informacao for select to authenticated using (auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
revoke all on public.orcamento_informacao from public,anon,authenticated;
grant select on public.orcamento_informacao to authenticated;

do $$
begin
  if exists(select 1 from pg_attribute where attrelid='public.cliente'::regclass and attname='detalhes' and not attisdropped) then
    execute $sql$insert into public.cliente_contato(cliente_codigo,email,pessoa_contato) select codigo,coalesce(detalhes->>'email',''),coalesce(detalhes->>'contato','') from public.cliente where detalhes<>'{}'::jsonb on conflict(cliente_codigo) do nothing$sql$;
    execute $sql$insert into public.cliente_telefone(cliente_codigo,telefone,principal) select codigo,detalhes->>'telefone',true from public.cliente c where coalesce(detalhes->>'telefone','')<>'' and not exists(select 1 from public.cliente_telefone t where t.cliente_codigo=c.codigo)$sql$;
    execute $sql$insert into public.cliente_endereco(cliente_codigo,texto_legado,principal) select codigo,detalhes->>'endereco',true from public.cliente c where coalesce(detalhes->>'endereco','')<>'' and not exists(select 1 from public.cliente_endereco e where e.cliente_codigo=c.codigo)$sql$;
  end if;
  if exists(select 1 from pg_attribute where attrelid='public.orcamento'::regclass and attname='detalhes' and not attisdropped) then
    execute $sql$insert into public.orcamento_informacao(orcamento_codigo,pagamento,prazo_entrega,local_entrega,observacoes,empresa_nome,empresa_cnpj,empresa_endereco,empresa_telefone,empresa_email,cliente_tipo,cliente_documento,cliente_nome,cliente_email,cliente_pessoa_contato,cliente_telefone,cliente_endereco)
      select codigo,coalesce(detalhes->>'pagamento',''),coalesce(detalhes->>'entrega',''),coalesce(detalhes->>'localEntrega',''),coalesce(detalhes->>'observacoes',''),coalesce(detalhes->'company'->>'nome',''),coalesce(detalhes->'company'->>'cnpj',''),coalesce(detalhes->'company'->>'endereco',''),coalesce(detalhes->'company'->>'telefone',''),coalesce(detalhes->'company'->>'email',''),coalesce(detalhes->'client'->>'tipo',''),coalesce(detalhes->'client'->>'documento',''),coalesce(detalhes->'client'->>'nome',''),coalesce(detalhes->'client'->>'email',''),coalesce(detalhes->'client'->>'contato',''),coalesce(detalhes->'client'->>'telefone',''),coalesce(detalhes->'client'->>'endereco','') from public.orcamento where detalhes<>'{}'::jsonb on conflict(orcamento_codigo) do nothing$sql$;
  end if;
end;
$$;
create or replace function public.atlas_load_workspace()
returns table(payload jsonb, revision bigint, is_admin boolean, approved_codes jsonb)
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'clientes',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.tipo,c.documento,c.nome) order by c.codigo) from public.cliente c),'[]'::jsonb),
    'contatosClientes',coalesce((select jsonb_agg(jsonb_build_array(x.cliente_codigo,x.email,x.pessoa_contato) order by x.cliente_codigo) from public.cliente_contato x),'[]'::jsonb),
    'telefonesClientes',coalesce((select jsonb_agg(jsonb_build_array(x.codigo,x.cliente_codigo,x.telefone,x.principal) order by x.cliente_codigo,x.codigo) from public.cliente_telefone x),'[]'::jsonb),
    'enderecosClientes',coalesce((select jsonb_agg(jsonb_build_array(x.codigo,x.cliente_codigo,x.cep,x.logradouro,x.numero,x.complemento,x.bairro,x.cidade,x.uf,x.texto_legado,x.principal) order by x.cliente_codigo,x.codigo) from public.cliente_endereco x),'[]'::jsonb),
    'categorias',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.descricao) order by c.codigo) from public.categoria c),'[]'::jsonb),
    'itens',coalesce((select jsonb_agg(jsonb_build_array(p.codigo,c.descricao,p.nome,p.descricao,p.valor_venda,to_char(p.data_cadastro,'DD/MM/YYYY'),p.status) order by p.codigo) from public.produto p join public.categoria c on c.codigo=p.categoria_codigo),'[]'::jsonb),
    'orcamentos',coalesce((select jsonb_agg(jsonb_build_array(o.codigo,o.cliente_codigo,c.nome,to_char(o.data_emissao,'DD/MM/YYYY'),to_char(o.validade,'DD/MM/YYYY'),coalesce((select sum(i.valor_total) from public.item_orcamento i where i.orcamento_codigo=o.codigo),0),jsonb_strip_nulls(jsonb_build_object('pagamento',nullif(info.pagamento,''),'entrega',nullif(info.prazo_entrega,''),'localEntrega',nullif(info.local_entrega,''),'observacoes',nullif(info.observacoes,''),'company',case when concat(info.empresa_nome,info.empresa_cnpj,info.empresa_endereco,info.empresa_telefone,info.empresa_email)<>'' then jsonb_build_object('nome',info.empresa_nome,'cnpj',info.empresa_cnpj,'endereco',info.empresa_endereco,'telefone',info.empresa_telefone,'email',info.empresa_email) end,'client',case when concat(info.cliente_tipo,info.cliente_documento,info.cliente_nome,info.cliente_email,info.cliente_pessoa_contato,info.cliente_telefone,info.cliente_endereco)<>'' then jsonb_build_object('tipo',info.cliente_tipo,'documento',info.cliente_documento,'nome',info.cliente_nome,'email',info.cliente_email,'contato',info.cliente_pessoa_contato,'telefone',info.cliente_telefone,'endereco',info.cliente_endereco) end))) order by o.codigo) from public.orcamento o join public.cliente c on c.codigo=o.cliente_codigo left join public.orcamento_informacao info on info.orcamento_codigo=o.codigo),'[]'::jsonb),
    'itensOrcamento',coalesce((select jsonb_agg(jsonb_build_array(i.orcamento_codigo,i.produto_codigo,i.produto_nome,i.quantidade,i.valor_unitario,i.valor_total,i.produto_descricao) order by i.orcamento_codigo,i.produto_codigo) from public.item_orcamento i),'[]'::jsonb),
    'empresa',w.empresa
  ),w.revision,public.atlas_is_admin(),coalesce((select jsonb_agg(codigo order by codigo) from public.orcamento where aprovado),'[]'::jsonb)
  from public.atlas_workspaces w where w.user_id='00000000-0000-4000-8000-000000000001'::uuid;
$$;

create or replace function public.atlas_save_workspace(expected_revision bigint,new_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; existing_code bigint; generated_budget bigint; generated_client bigint; generated_client_count integer := 0; phone_text text; next_revision bigint; result_payload jsonb; deletion_requested boolean;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  perform 1 from public.atlas_workspaces where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision for update;
  if not found then return null; end if;
  if not public.atlas_is_admin() then
    select exists(select 1 from public.cliente e where not exists(select 1 from jsonb_array_elements(new_payload->'clientes') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
    select exists(select 1 from public.categoria e where not exists(select 1 from jsonb_array_elements(new_payload->'categorias') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
    select exists(select 1 from public.produto e where not exists(select 1 from jsonb_array_elements(new_payload->'itens') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new_payload->'telefonesClientes','[]'::jsonb)) x group by x->>1 having count(*) filter(where (x->>3)::boolean)<>1)
     or exists(select 1 from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) x group by x->>1 having count(*) filter(where (x->>10)::boolean)<>1) then raise exception 'Cada lista de contato deve possuir um principal' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new_payload->'contatosClientes','[]'::jsonb)) x where coalesce(x->>1,'')<>'' and x->>1 !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or exists(select 1 from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) x where (coalesce(x->>2,'')<>'' and x->>2 !~ '^[0-9]{5}-?[0-9]{3}$') or (coalesce(x->>8,'')<>'' and x->>8 !~ '^[A-Za-z]{2}$')) then raise exception 'Contato de cliente inválido' using errcode='22023'; end if;
  delete from public.item_orcamento where orcamento_codigo is not null;
  delete from public.cliente_telefone where codigo is not null;
  delete from public.cliente_endereco where codigo is not null;
  delete from public.cliente_contato where cliente_codigo is not null;
  delete from public.orcamento where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'orcamentos') j where (j->>0)::bigint=codigo);
  delete from public.produto where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'itens') j where (j->>0)::bigint=codigo);
  delete from public.categoria where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'categorias') j where (j->>0)::bigint=codigo);
  delete from public.cliente where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'clientes') j where (j->>0)::bigint=codigo);
  for r in select value from jsonb_array_elements(new_payload->'clientes') loop
    if jsonb_array_length(r)<>4 then raise exception 'Cliente inválido' using errcode='22023'; end if;
    if r->>0 is null then insert into public.cliente(tipo,documento,nome) values(r->>1,r->>2,r->>3) returning codigo into generated_client; generated_client_count := generated_client_count + 1;
    else update public.cliente set tipo=r->>1,documento=r->>2,nome=r->>3 where codigo=(r->>0)::bigint; end if;
  end loop;
  if generated_client_count>0 and not new_payload ? 'novoClienteContato' then raise exception 'Contato obrigatório do novo cliente inválido' using errcode='22023'; end if;
  if new_payload ? 'novoClienteContato' then
    if generated_client_count<>1 or generated_client is null or jsonb_typeof(new_payload->'novoClienteContato')<>'object' or coalesce(new_payload->'novoClienteContato'->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or jsonb_typeof(new_payload->'novoClienteContato'->'telefones')<>'array' or jsonb_array_length(new_payload->'novoClienteContato'->'telefones')=0 or exists(select 1 from jsonb_array_elements_text(new_payload->'novoClienteContato'->'telefones') value where btrim(value)='') or (exists(select 1 from public.cliente where codigo=generated_client and tipo='Pessoa Jurídica') and btrim(coalesce(new_payload->'novoClienteContato'->>'pessoa',''))='') then raise exception 'Contato obrigatório do novo cliente inválido' using errcode='22023'; end if;
    insert into public.cliente_contato(cliente_codigo,email,pessoa_contato) values(generated_client,btrim(new_payload->'novoClienteContato'->>'email'),btrim(coalesce(new_payload->'novoClienteContato'->>'pessoa','')));
    for phone_text in select value from jsonb_array_elements_text(new_payload->'novoClienteContato'->'telefones') loop insert into public.cliente_telefone(cliente_codigo,telefone,principal) values(generated_client,btrim(phone_text),not exists(select 1 from public.cliente_telefone where cliente_codigo=generated_client)); end loop;
  end if;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'contatosClientes','[]'::jsonb)) loop insert into public.cliente_contato(cliente_codigo,email,pessoa_contato) values((r->>0)::bigint,r->>1,r->>2); end loop;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'telefonesClientes','[]'::jsonb)) loop insert into public.cliente_telefone(cliente_codigo,telefone,principal) values((r->>1)::bigint,r->>2,(r->>3)::boolean); end loop;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) loop insert into public.cliente_endereco(cliente_codigo,cep,logradouro,numero,complemento,bairro,cidade,uf,texto_legado,principal) values((r->>1)::bigint,r->>2,r->>3,r->>4,r->>5,r->>6,r->>7,upper(r->>8),r->>9,(r->>10)::boolean); end loop;
  for r in select value from jsonb_array_elements(new_payload->'categorias') loop if r->>0 is null then insert into public.categoria(descricao) values(r->>1); else update public.categoria set descricao=r->>1 where codigo=(r->>0)::bigint; end if; end loop;
  for r in select value from jsonb_array_elements(new_payload->'itens') loop
    select codigo into existing_code from public.categoria where lower(regexp_replace(btrim(descricao),'\s+',' ','g'))=lower(regexp_replace(btrim(r->>1),'\s+',' ','g'));
    if r->>0 is null then insert into public.produto(categoria_codigo,nome,descricao,valor_venda,status) values(existing_code,r->>2,r->>3,(r->>4)::numeric,r->>6); else update public.produto set categoria_codigo=existing_code,nome=r->>2,descricao=r->>3,valor_venda=(r->>4)::numeric,status=r->>6 where codigo=(r->>0)::bigint; end if;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'orcamentos') loop
    if r->>0 is null then insert into public.orcamento(cliente_codigo,validade) values((r->>1)::bigint,public.atlas_parse_date(r->>4)) returning codigo into generated_budget;
    else update public.orcamento set cliente_codigo=(r->>1)::bigint,validade=public.atlas_parse_date(r->>4) where codigo=(r->>0)::bigint; end if;
    insert into public.orcamento_informacao(orcamento_codigo,pagamento,prazo_entrega,local_entrega,observacoes,empresa_nome,empresa_cnpj,empresa_endereco,empresa_telefone,empresa_email,cliente_tipo,cliente_documento,cliente_nome,cliente_email,cliente_pessoa_contato,cliente_telefone,cliente_endereco)
    values(coalesce((r->>0)::bigint,generated_budget),coalesce(r->6->>'pagamento',''),coalesce(r->6->>'entrega',''),coalesce(r->6->>'localEntrega',''),coalesce(r->6->>'observacoes',''),coalesce(r->6->'company'->>'nome',''),coalesce(r->6->'company'->>'cnpj',''),coalesce(r->6->'company'->>'endereco',''),coalesce(r->6->'company'->>'telefone',''),coalesce(r->6->'company'->>'email',''),coalesce(r->6->'client'->>'tipo',''),coalesce(r->6->'client'->>'documento',''),coalesce(r->6->'client'->>'nome',''),coalesce(r->6->'client'->>'email',''),coalesce(r->6->'client'->>'contato',''),coalesce(r->6->'client'->>'telefone',''),coalesce(r->6->'client'->>'endereco',''))
    on conflict(orcamento_codigo) do update set pagamento=excluded.pagamento,prazo_entrega=excluded.prazo_entrega,local_entrega=excluded.local_entrega,observacoes=excluded.observacoes,empresa_nome=excluded.empresa_nome,empresa_cnpj=excluded.empresa_cnpj,empresa_endereco=excluded.empresa_endereco,empresa_telefone=excluded.empresa_telefone,empresa_email=excluded.empresa_email,cliente_tipo=excluded.cliente_tipo,cliente_documento=excluded.cliente_documento,cliente_nome=excluded.cliente_nome,cliente_email=excluded.cliente_email,cliente_pessoa_contato=excluded.cliente_pessoa_contato,cliente_telefone=excluded.cliente_telefone,cliente_endereco=excluded.cliente_endereco;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'itensOrcamento') loop insert into public.item_orcamento(orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario,produto_descricao) values(coalesce((r->>0)::bigint,generated_budget),(r->>1)::bigint,r->>2,(r->>3)::bigint,(r->>4)::numeric,coalesce(r->>6,'')); end loop;
  update public.atlas_workspaces set revision=revision+1,updated_at=now() where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision returning revision into next_revision;
  select loaded.payload into result_payload from public.atlas_load_workspace() loaded;
  return jsonb_build_object('revision',next_revision,'payload',result_payload,'empresa',result_payload->'empresa','approved_codes',(select coalesce(jsonb_agg(codigo order by codigo),'[]'::jsonb) from public.orcamento where aprovado));
end;
$$;


do $$ begin
  if exists(select 1 from pg_attribute where attrelid='public.cliente'::regclass and attname='detalhes' and not attisdropped) then alter table public.cliente drop column detalhes; end if;
  if exists(select 1 from pg_attribute where attrelid='public.orcamento'::regclass and attname='detalhes' and not attisdropped) then alter table public.orcamento drop column detalhes; end if;
end; $$;

revoke all on function public.atlas_load_workspace(), public.atlas_save_workspace(bigint,jsonb) from public,anon;
grant execute on function public.atlas_load_workspace(), public.atlas_save_workspace(bigint,jsonb) to authenticated;
commit;

-- Origem: 202609090007_company_profile.sql
-- Move o perfil da empresa para uma tabela própria e remove o JSON do workspace.
-- Execute após 202609090006_normalize_details.sql.
begin;

create or replace function public.atlas_valid_cnpj(value text)
returns boolean language plpgsql immutable set search_path='' as $$
declare document text := upper(regexp_replace(coalesce(value,''),'[.\-/[:space:]]','','g')); digits integer[] := '{}'; position integer; idx integer; total integer; remainder integer;
begin
  if document !~ '^[A-Z0-9]{12}[0-9]{2}$' or document ~ '^([0-9])\1{13}$' then return false; end if;
  for idx in 1..14 loop digits := array_append(digits,ascii(substr(document,idx,1))-48); end loop;
  for position in 12..13 loop
    total := 0;
    for idx in 0..position-1 loop total := total + digits[idx+1] * (mod(position-1-idx,8)+2); end loop;
    remainder := mod(total,11);
    if digits[position+1] <> (case when remainder<2 then 0 else 11-remainder end) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.atlas_company_complete(nome text,cnpj text,endereco text,telefone text,email text)
returns boolean language sql immutable set search_path='' as $$
  select btrim(coalesce(nome,''))<>'' and length(btrim(nome))<=160 and public.atlas_valid_cnpj(cnpj)
    and btrim(coalesce(endereco,''))<>'' and btrim(coalesce(telefone,''))<>''
    and btrim(coalesce(email,'')) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
$$;

create table if not exists public.empresa_perfil(
  workspace_user_id uuid primary key references public.atlas_workspaces(user_id) on delete cascade,
  nome text not null default '', cnpj text not null default '', endereco text not null default '', telefone text not null default '', email text not null default '', completo boolean not null default false
);
alter table public.empresa_perfil enable row level security;
drop policy if exists leitura_autenticada on public.empresa_perfil;
create policy leitura_autenticada on public.empresa_perfil for select to authenticated using(auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
revoke all on public.empresa_perfil from public,anon,authenticated;
grant select on public.empresa_perfil to authenticated;

do $$ begin
  if exists(select 1 from pg_attribute where attrelid='public.atlas_workspaces'::regclass and attname='empresa' and not attisdropped) then
    execute $sql$insert into public.empresa_perfil(workspace_user_id,nome,cnpj,endereco,telefone,email,completo)
      select user_id,btrim(coalesce(empresa->>'nome','')),btrim(coalesce(empresa->>'cnpj','')),btrim(coalesce(empresa->>'endereco','')),btrim(coalesce(empresa->>'telefone','')),btrim(coalesce(empresa->>'email','')),
      public.atlas_company_complete(empresa->>'nome',empresa->>'cnpj',empresa->>'endereco',empresa->>'telefone',empresa->>'email') from public.atlas_workspaces
      on conflict(workspace_user_id) do nothing$sql$;
  else
    insert into public.empresa_perfil(workspace_user_id,nome) select user_id,'Atlas Máquinas & Obras' from public.atlas_workspaces on conflict(workspace_user_id) do nothing;
  end if;
end; $$;

create or replace function public.atlas_save_company(profile jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sanitized jsonb; next_revision bigint;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  if jsonb_typeof(profile)<>'object' or not public.atlas_company_complete(profile->>'nome',profile->>'cnpj',profile->>'endereco',profile->>'telefone',profile->>'email') then raise exception 'Preencha todos os dados válidos da empresa' using errcode='22023'; end if;
  sanitized:=jsonb_build_object('nome',btrim(profile->>'nome'),'cnpj',btrim(profile->>'cnpj'),'endereco',btrim(profile->>'endereco'),'telefone',btrim(profile->>'telefone'),'email',btrim(profile->>'email'),'completo',true);
  update public.empresa_perfil set nome=sanitized->>'nome',cnpj=sanitized->>'cnpj',endereco=sanitized->>'endereco',telefone=sanitized->>'telefone',email=sanitized->>'email',completo=true where workspace_user_id='00000000-0000-4000-8000-000000000001'::uuid;
  if not found then raise exception 'Perfil da empresa inexistente' using errcode='23503'; end if;
  update public.atlas_workspaces set revision=revision+1,updated_at=now() where user_id='00000000-0000-4000-8000-000000000001'::uuid returning revision into next_revision;
  return jsonb_build_object('empresa',sanitized,'revision',next_revision);
end;
$$;
create or replace function public.atlas_load_workspace()
returns table(payload jsonb, revision bigint, is_admin boolean, approved_codes jsonb)
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'clientes',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.tipo,c.documento,c.nome) order by c.codigo) from public.cliente c),'[]'::jsonb),
    'contatosClientes',coalesce((select jsonb_agg(jsonb_build_array(x.cliente_codigo,x.email,x.pessoa_contato) order by x.cliente_codigo) from public.cliente_contato x),'[]'::jsonb),
    'telefonesClientes',coalesce((select jsonb_agg(jsonb_build_array(x.codigo,x.cliente_codigo,x.telefone,x.principal) order by x.cliente_codigo,x.codigo) from public.cliente_telefone x),'[]'::jsonb),
    'enderecosClientes',coalesce((select jsonb_agg(jsonb_build_array(x.codigo,x.cliente_codigo,x.cep,x.logradouro,x.numero,x.complemento,x.bairro,x.cidade,x.uf,x.texto_legado,x.principal) order by x.cliente_codigo,x.codigo) from public.cliente_endereco x),'[]'::jsonb),
    'categorias',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.descricao) order by c.codigo) from public.categoria c),'[]'::jsonb),
    'itens',coalesce((select jsonb_agg(jsonb_build_array(p.codigo,c.descricao,p.nome,p.descricao,p.valor_venda,to_char(p.data_cadastro,'DD/MM/YYYY'),p.status) order by p.codigo) from public.produto p join public.categoria c on c.codigo=p.categoria_codigo),'[]'::jsonb),
    'orcamentos',coalesce((select jsonb_agg(jsonb_build_array(o.codigo,o.cliente_codigo,c.nome,to_char(o.data_emissao,'DD/MM/YYYY'),to_char(o.validade,'DD/MM/YYYY'),coalesce((select sum(i.valor_total) from public.item_orcamento i where i.orcamento_codigo=o.codigo),0),jsonb_strip_nulls(jsonb_build_object('pagamento',nullif(info.pagamento,''),'entrega',nullif(info.prazo_entrega,''),'localEntrega',nullif(info.local_entrega,''),'observacoes',nullif(info.observacoes,''),'company',case when concat(info.empresa_nome,info.empresa_cnpj,info.empresa_endereco,info.empresa_telefone,info.empresa_email)<>'' then jsonb_build_object('nome',info.empresa_nome,'cnpj',info.empresa_cnpj,'endereco',info.empresa_endereco,'telefone',info.empresa_telefone,'email',info.empresa_email) end,'client',case when concat(info.cliente_tipo,info.cliente_documento,info.cliente_nome,info.cliente_email,info.cliente_pessoa_contato,info.cliente_telefone,info.cliente_endereco)<>'' then jsonb_build_object('tipo',info.cliente_tipo,'documento',info.cliente_documento,'nome',info.cliente_nome,'email',info.cliente_email,'contato',info.cliente_pessoa_contato,'telefone',info.cliente_telefone,'endereco',info.cliente_endereco) end))) order by o.codigo) from public.orcamento o join public.cliente c on c.codigo=o.cliente_codigo left join public.orcamento_informacao info on info.orcamento_codigo=o.codigo),'[]'::jsonb),
    'itensOrcamento',coalesce((select jsonb_agg(jsonb_build_array(i.orcamento_codigo,i.produto_codigo,i.produto_nome,i.quantidade,i.valor_unitario,i.valor_total,i.produto_descricao) order by i.orcamento_codigo,i.produto_codigo) from public.item_orcamento i),'[]'::jsonb),
    'empresa',(select jsonb_build_object('nome',e.nome,'cnpj',e.cnpj,'endereco',e.endereco,'telefone',e.telefone,'email',e.email,'completo',e.completo) from public.empresa_perfil e where e.workspace_user_id=w.user_id)
  ),w.revision,public.atlas_is_admin(),coalesce((select jsonb_agg(codigo order by codigo) from public.orcamento where aprovado),'[]'::jsonb)
  from public.atlas_workspaces w where w.user_id='00000000-0000-4000-8000-000000000001'::uuid;
$$;


create or replace function public.atlas_save_workspace(expected_revision bigint,new_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; existing_code bigint; generated_budget bigint; generated_client bigint; generated_client_count integer := 0; phone_text text; next_revision bigint; result_payload jsonb; deletion_requested boolean;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  perform 1 from public.atlas_workspaces where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision for update;
  if not found then return null; end if;
  if not public.atlas_is_admin() then
    select exists(select 1 from public.cliente e where not exists(select 1 from jsonb_array_elements(new_payload->'clientes') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
    select exists(select 1 from public.categoria e where not exists(select 1 from jsonb_array_elements(new_payload->'categorias') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
    select exists(select 1 from public.produto e where not exists(select 1 from jsonb_array_elements(new_payload->'itens') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new_payload->'telefonesClientes','[]'::jsonb)) x group by x->>1 having count(*) filter(where (x->>3)::boolean)<>1)
     or exists(select 1 from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) x group by x->>1 having count(*) filter(where (x->>10)::boolean)<>1) then raise exception 'Cada lista de contato deve possuir um principal' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new_payload->'contatosClientes','[]'::jsonb)) x where coalesce(x->>1,'')<>'' and x->>1 !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or exists(select 1 from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) x where (coalesce(x->>2,'')<>'' and x->>2 !~ '^[0-9]{5}-?[0-9]{3}$') or (coalesce(x->>8,'')<>'' and x->>8 !~ '^[A-Za-z]{2}$')) then raise exception 'Contato de cliente inválido' using errcode='22023'; end if;
  delete from public.item_orcamento where orcamento_codigo is not null;
  delete from public.cliente_telefone where codigo is not null;
  delete from public.cliente_endereco where codigo is not null;
  delete from public.cliente_contato where cliente_codigo is not null;
  delete from public.orcamento where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'orcamentos') j where (j->>0)::bigint=codigo);
  delete from public.produto where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'itens') j where (j->>0)::bigint=codigo);
  delete from public.categoria where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'categorias') j where (j->>0)::bigint=codigo);
  delete from public.cliente where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'clientes') j where (j->>0)::bigint=codigo);
  for r in select value from jsonb_array_elements(new_payload->'clientes') loop
    if jsonb_array_length(r)<>4 then raise exception 'Cliente inválido' using errcode='22023'; end if;
    if r->>0 is null then insert into public.cliente(tipo,documento,nome) values(r->>1,r->>2,r->>3) returning codigo into generated_client; generated_client_count := generated_client_count + 1;
    else update public.cliente set tipo=r->>1,documento=r->>2,nome=r->>3 where codigo=(r->>0)::bigint; end if;
  end loop;
  if generated_client_count>0 and not new_payload ? 'novoClienteContato' then raise exception 'Contato obrigatório do novo cliente inválido' using errcode='22023'; end if;
  if new_payload ? 'novoClienteContato' then
    if generated_client_count<>1 or generated_client is null or jsonb_typeof(new_payload->'novoClienteContato')<>'object' or coalesce(new_payload->'novoClienteContato'->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or jsonb_typeof(new_payload->'novoClienteContato'->'telefones')<>'array' or jsonb_array_length(new_payload->'novoClienteContato'->'telefones')=0 or exists(select 1 from jsonb_array_elements_text(new_payload->'novoClienteContato'->'telefones') value where btrim(value)='') or (exists(select 1 from public.cliente where codigo=generated_client and tipo='Pessoa Jurídica') and btrim(coalesce(new_payload->'novoClienteContato'->>'pessoa',''))='') then raise exception 'Contato obrigatório do novo cliente inválido' using errcode='22023'; end if;
    insert into public.cliente_contato(cliente_codigo,email,pessoa_contato) values(generated_client,btrim(new_payload->'novoClienteContato'->>'email'),btrim(coalesce(new_payload->'novoClienteContato'->>'pessoa','')));
    for phone_text in select value from jsonb_array_elements_text(new_payload->'novoClienteContato'->'telefones') loop insert into public.cliente_telefone(cliente_codigo,telefone,principal) values(generated_client,btrim(phone_text),not exists(select 1 from public.cliente_telefone where cliente_codigo=generated_client)); end loop;
  end if;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'contatosClientes','[]'::jsonb)) loop insert into public.cliente_contato(cliente_codigo,email,pessoa_contato) values((r->>0)::bigint,r->>1,r->>2); end loop;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'telefonesClientes','[]'::jsonb)) loop insert into public.cliente_telefone(cliente_codigo,telefone,principal) values((r->>1)::bigint,r->>2,(r->>3)::boolean); end loop;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) loop insert into public.cliente_endereco(cliente_codigo,cep,logradouro,numero,complemento,bairro,cidade,uf,texto_legado,principal) values((r->>1)::bigint,r->>2,r->>3,r->>4,r->>5,r->>6,r->>7,upper(r->>8),r->>9,(r->>10)::boolean); end loop;
  for r in select value from jsonb_array_elements(new_payload->'categorias') loop if r->>0 is null then insert into public.categoria(descricao) values(r->>1); else update public.categoria set descricao=r->>1 where codigo=(r->>0)::bigint; end if; end loop;
  for r in select value from jsonb_array_elements(new_payload->'itens') loop
    select codigo into existing_code from public.categoria where lower(regexp_replace(btrim(descricao),'\s+',' ','g'))=lower(regexp_replace(btrim(r->>1),'\s+',' ','g'));
    if r->>0 is null then insert into public.produto(categoria_codigo,nome,descricao,valor_venda,status) values(existing_code,r->>2,r->>3,(r->>4)::numeric,r->>6); else update public.produto set categoria_codigo=existing_code,nome=r->>2,descricao=r->>3,valor_venda=(r->>4)::numeric,status=r->>6 where codigo=(r->>0)::bigint; end if;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'orcamentos') loop
    if r->>0 is null then insert into public.orcamento(cliente_codigo,validade) values((r->>1)::bigint,public.atlas_parse_date(r->>4)) returning codigo into generated_budget;
    else update public.orcamento set cliente_codigo=(r->>1)::bigint,validade=public.atlas_parse_date(r->>4) where codigo=(r->>0)::bigint; end if;
    insert into public.orcamento_informacao(orcamento_codigo,pagamento,prazo_entrega,local_entrega,observacoes,empresa_nome,empresa_cnpj,empresa_endereco,empresa_telefone,empresa_email,cliente_tipo,cliente_documento,cliente_nome,cliente_email,cliente_pessoa_contato,cliente_telefone,cliente_endereco)
    values(coalesce((r->>0)::bigint,generated_budget),coalesce(r->6->>'pagamento',''),coalesce(r->6->>'entrega',''),coalesce(r->6->>'localEntrega',''),coalesce(r->6->>'observacoes',''),coalesce(r->6->'company'->>'nome',''),coalesce(r->6->'company'->>'cnpj',''),coalesce(r->6->'company'->>'endereco',''),coalesce(r->6->'company'->>'telefone',''),coalesce(r->6->'company'->>'email',''),coalesce(r->6->'client'->>'tipo',''),coalesce(r->6->'client'->>'documento',''),coalesce(r->6->'client'->>'nome',''),coalesce(r->6->'client'->>'email',''),coalesce(r->6->'client'->>'contato',''),coalesce(r->6->'client'->>'telefone',''),coalesce(r->6->'client'->>'endereco',''))
    on conflict(orcamento_codigo) do update set pagamento=excluded.pagamento,prazo_entrega=excluded.prazo_entrega,local_entrega=excluded.local_entrega,observacoes=excluded.observacoes,empresa_nome=excluded.empresa_nome,empresa_cnpj=excluded.empresa_cnpj,empresa_endereco=excluded.empresa_endereco,empresa_telefone=excluded.empresa_telefone,empresa_email=excluded.empresa_email,cliente_tipo=excluded.cliente_tipo,cliente_documento=excluded.cliente_documento,cliente_nome=excluded.cliente_nome,cliente_email=excluded.cliente_email,cliente_pessoa_contato=excluded.cliente_pessoa_contato,cliente_telefone=excluded.cliente_telefone,cliente_endereco=excluded.cliente_endereco;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'itensOrcamento') loop insert into public.item_orcamento(orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario,produto_descricao) values(coalesce((r->>0)::bigint,generated_budget),(r->>1)::bigint,r->>2,(r->>3)::bigint,(r->>4)::numeric,coalesce(r->>6,'')); end loop;
  update public.atlas_workspaces set revision=revision+1,updated_at=now() where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision returning revision into next_revision;
  select loaded.payload into result_payload from public.atlas_load_workspace() loaded;
  return jsonb_build_object('revision',next_revision,'payload',result_payload,'empresa',result_payload->'empresa','approved_codes',(select coalesce(jsonb_agg(codigo order by codigo),'[]'::jsonb) from public.orcamento where aprovado));
end;
$$;


do $$ begin
  if exists(select 1 from pg_attribute where attrelid='public.atlas_workspaces'::regclass and attname='empresa' and not attisdropped) then alter table public.atlas_workspaces drop column empresa; end if;
end; $$;
revoke all on function public.atlas_load_workspace(),public.atlas_save_workspace(bigint,jsonb),public.atlas_save_company(jsonb) from public,anon;
grant execute on function public.atlas_load_workspace(),public.atlas_save_workspace(bigint,jsonb),public.atlas_save_company(jsonb) to authenticated;
revoke all on function public.atlas_valid_cnpj(text),public.atlas_company_complete(text,text,text,text,text) from public,anon,authenticated;
commit;

-- Origem: 202609100001_approval_commercial_terms.sql
-- Grava condições comerciais junto com a aprovação do orçamento.
-- Execute após 202609090007_company_profile.sql.
begin;
create or replace function public.atlas_approve_budget(expected_revision bigint,budget_code bigint,conditions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare next_revision bigint; result_payload jsonb;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  perform 1 from public.atlas_workspaces where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision for update;
  if not found then return null; end if;
  update public.orcamento set aprovado=true where codigo=budget_code and not aprovado;
  if not found then raise exception 'Orçamento inexistente ou já aprovado' using errcode='22023'; end if;
  if conditions is not null then
    update public.orcamento_informacao set pagamento=btrim(coalesce(conditions->>'pagamento','')),prazo_entrega=btrim(coalesce(conditions->>'entrega','')),local_entrega=btrim(coalesce(conditions->>'localEntrega','')),observacoes=btrim(coalesce(conditions->>'observacoes','')) where orcamento_codigo=budget_code;
  end if;
  update public.atlas_workspaces set revision=revision+1,updated_at=now() where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision returning revision into next_revision;
  select loaded.payload into result_payload from public.atlas_load_workspace() loaded;
  return jsonb_build_object('revision',next_revision,'payload',result_payload,'empresa',result_payload->'empresa','approved_codes',(select coalesce(jsonb_agg(codigo order by codigo),'[]'::jsonb) from public.orcamento where aprovado));
end;
$$;
create or replace function public.atlas_approve_budget(expected_revision bigint,budget_code bigint)
returns jsonb language sql security definer set search_path = '' as $$ select public.atlas_approve_budget(expected_revision,budget_code,null) $$;
revoke all on function public.atlas_approve_budget(bigint,bigint,jsonb),public.atlas_approve_budget(bigint,bigint) from public,anon;
grant execute on function public.atlas_approve_budget(bigint,bigint,jsonb),public.atlas_approve_budget(bigint,bigint) to authenticated;
commit;

-- Origem: 202609100002_budget_total.sql
-- Persiste o total calculado pelos itens, inclusive em bancos legados.
-- Execute após 202609100001_approval_commercial_terms.sql.
begin;
alter table public.orcamento add column if not exists valor_total numeric(18,2);
update public.orcamento o set valor_total=coalesce((select sum(i.valor_total) from public.item_orcamento i where i.orcamento_codigo=o.codigo),0) where o.codigo is not null;
alter table public.orcamento alter column valor_total set not null;

create or replace function public.atlas_save_workspace(expected_revision bigint,new_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare budget_total numeric(18,2); r jsonb; existing_code bigint; generated_budget bigint; generated_client bigint; generated_client_count integer := 0; phone_text text; next_revision bigint; result_payload jsonb; deletion_requested boolean;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  perform 1 from public.atlas_workspaces where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision for update;
  if not found then return null; end if;
  if (select count(*) from jsonb_array_elements(new_payload->'orcamentos') x where x->>0 is null)>1 then
    raise exception 'Somente um orçamento novo pode ser salvo por vez' using errcode='22023';
  end if;
  if not public.atlas_is_admin() then
    select exists(select 1 from public.cliente e where not exists(select 1 from jsonb_array_elements(new_payload->'clientes') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
    select exists(select 1 from public.categoria e where not exists(select 1 from jsonb_array_elements(new_payload->'categorias') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
    select exists(select 1 from public.produto e where not exists(select 1 from jsonb_array_elements(new_payload->'itens') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new_payload->'telefonesClientes','[]'::jsonb)) x group by x->>1 having count(*) filter(where (x->>3)::boolean)<>1)
     or exists(select 1 from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) x group by x->>1 having count(*) filter(where (x->>10)::boolean)<>1) then raise exception 'Cada lista de contato deve possuir um principal' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new_payload->'contatosClientes','[]'::jsonb)) x where coalesce(x->>1,'')<>'' and x->>1 !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or exists(select 1 from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) x where (coalesce(x->>2,'')<>'' and x->>2 !~ '^[0-9]{5}-?[0-9]{3}$') or (coalesce(x->>8,'')<>'' and x->>8 !~ '^[A-Za-z]{2}$')) then raise exception 'Contato de cliente inválido' using errcode='22023'; end if;
  delete from public.item_orcamento where orcamento_codigo is not null;
  delete from public.cliente_telefone where codigo is not null;
  delete from public.cliente_endereco where codigo is not null;
  delete from public.cliente_contato where cliente_codigo is not null;
  delete from public.orcamento where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'orcamentos') j where (j->>0)::bigint=codigo);
  delete from public.produto where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'itens') j where (j->>0)::bigint=codigo);
  delete from public.categoria where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'categorias') j where (j->>0)::bigint=codigo);
  delete from public.cliente where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'clientes') j where (j->>0)::bigint=codigo);
  for r in select value from jsonb_array_elements(new_payload->'clientes') loop
    if jsonb_array_length(r)<>4 then raise exception 'Cliente inválido' using errcode='22023'; end if;
    if r->>0 is null then insert into public.cliente(tipo,documento,nome) values(r->>1,r->>2,r->>3) returning codigo into generated_client; generated_client_count := generated_client_count + 1;
    else update public.cliente set tipo=r->>1,documento=r->>2,nome=r->>3 where codigo=(r->>0)::bigint; end if;
  end loop;
  if generated_client_count>0 and not new_payload ? 'novoClienteContato' then raise exception 'Contato obrigatório do novo cliente inválido' using errcode='22023'; end if;
  if new_payload ? 'novoClienteContato' then
    if generated_client_count<>1 or generated_client is null or jsonb_typeof(new_payload->'novoClienteContato')<>'object' or coalesce(new_payload->'novoClienteContato'->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or jsonb_typeof(new_payload->'novoClienteContato'->'telefones')<>'array' or jsonb_array_length(new_payload->'novoClienteContato'->'telefones')=0 or exists(select 1 from jsonb_array_elements_text(new_payload->'novoClienteContato'->'telefones') value where btrim(value)='') or (exists(select 1 from public.cliente where codigo=generated_client and tipo='Pessoa Jurídica') and btrim(coalesce(new_payload->'novoClienteContato'->>'pessoa',''))='') then raise exception 'Contato obrigatório do novo cliente inválido' using errcode='22023'; end if;
    insert into public.cliente_contato(cliente_codigo,email,pessoa_contato) values(generated_client,btrim(new_payload->'novoClienteContato'->>'email'),btrim(coalesce(new_payload->'novoClienteContato'->>'pessoa','')));
    for phone_text in select value from jsonb_array_elements_text(new_payload->'novoClienteContato'->'telefones') loop insert into public.cliente_telefone(cliente_codigo,telefone,principal) values(generated_client,btrim(phone_text),not exists(select 1 from public.cliente_telefone where cliente_codigo=generated_client)); end loop;
  end if;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'contatosClientes','[]'::jsonb)) loop insert into public.cliente_contato(cliente_codigo,email,pessoa_contato) values((r->>0)::bigint,r->>1,r->>2); end loop;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'telefonesClientes','[]'::jsonb)) loop insert into public.cliente_telefone(cliente_codigo,telefone,principal) values((r->>1)::bigint,r->>2,(r->>3)::boolean); end loop;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) loop insert into public.cliente_endereco(cliente_codigo,cep,logradouro,numero,complemento,bairro,cidade,uf,texto_legado,principal) values((r->>1)::bigint,r->>2,r->>3,r->>4,r->>5,r->>6,r->>7,upper(r->>8),r->>9,(r->>10)::boolean); end loop;
  for r in select value from jsonb_array_elements(new_payload->'categorias') loop if r->>0 is null then insert into public.categoria(descricao) values(r->>1); else update public.categoria set descricao=r->>1 where codigo=(r->>0)::bigint; end if; end loop;
  for r in select value from jsonb_array_elements(new_payload->'itens') loop
    select codigo into existing_code from public.categoria where lower(regexp_replace(btrim(descricao),'\s+',' ','g'))=lower(regexp_replace(btrim(r->>1),'\s+',' ','g'));
    if r->>0 is null then insert into public.produto(categoria_codigo,nome,descricao,valor_venda,status) values(existing_code,r->>2,r->>3,(r->>4)::numeric,r->>6); else update public.produto set categoria_codigo=existing_code,nome=r->>2,descricao=r->>3,valor_venda=(r->>4)::numeric,status=r->>6 where codigo=(r->>0)::bigint; end if;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'orcamentos') loop
    select coalesce(sum((i->>3)::bigint * (i->>4)::numeric(14,2)),0) into budget_total
      from jsonb_array_elements(new_payload->'itensOrcamento') i
      where (i->>0)::bigint is not distinct from (r->>0)::bigint;
    if r->>0 is null then insert into public.orcamento(cliente_codigo,validade,valor_total) values((r->>1)::bigint,public.atlas_parse_date(r->>4),budget_total) returning codigo into generated_budget;
    else update public.orcamento set cliente_codigo=(r->>1)::bigint,validade=public.atlas_parse_date(r->>4),valor_total=budget_total where codigo=(r->>0)::bigint; end if;
    insert into public.orcamento_informacao(orcamento_codigo,pagamento,prazo_entrega,local_entrega,observacoes,empresa_nome,empresa_cnpj,empresa_endereco,empresa_telefone,empresa_email,cliente_tipo,cliente_documento,cliente_nome,cliente_email,cliente_pessoa_contato,cliente_telefone,cliente_endereco)
    values(coalesce((r->>0)::bigint,generated_budget),coalesce(r->6->>'pagamento',''),coalesce(r->6->>'entrega',''),coalesce(r->6->>'localEntrega',''),coalesce(r->6->>'observacoes',''),coalesce(r->6->'company'->>'nome',''),coalesce(r->6->'company'->>'cnpj',''),coalesce(r->6->'company'->>'endereco',''),coalesce(r->6->'company'->>'telefone',''),coalesce(r->6->'company'->>'email',''),coalesce(r->6->'client'->>'tipo',''),coalesce(r->6->'client'->>'documento',''),coalesce(r->6->'client'->>'nome',''),coalesce(r->6->'client'->>'email',''),coalesce(r->6->'client'->>'contato',''),coalesce(r->6->'client'->>'telefone',''),coalesce(r->6->'client'->>'endereco',''))
    on conflict(orcamento_codigo) do update set pagamento=excluded.pagamento,prazo_entrega=excluded.prazo_entrega,local_entrega=excluded.local_entrega,observacoes=excluded.observacoes,empresa_nome=excluded.empresa_nome,empresa_cnpj=excluded.empresa_cnpj,empresa_endereco=excluded.empresa_endereco,empresa_telefone=excluded.empresa_telefone,empresa_email=excluded.empresa_email,cliente_tipo=excluded.cliente_tipo,cliente_documento=excluded.cliente_documento,cliente_nome=excluded.cliente_nome,cliente_email=excluded.cliente_email,cliente_pessoa_contato=excluded.cliente_pessoa_contato,cliente_telefone=excluded.cliente_telefone,cliente_endereco=excluded.cliente_endereco;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'itensOrcamento') loop insert into public.item_orcamento(orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario,produto_descricao) values(coalesce((r->>0)::bigint,generated_budget),(r->>1)::bigint,r->>2,(r->>3)::bigint,(r->>4)::numeric,coalesce(r->>6,'')); end loop;
  update public.atlas_workspaces set revision=revision+1,updated_at=now() where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision returning revision into next_revision;
  select loaded.payload into result_payload from public.atlas_load_workspace() loaded;
  return jsonb_build_object('revision',next_revision,'payload',result_payload,'empresa',result_payload->'empresa','approved_codes',(select coalesce(jsonb_agg(codigo order by codigo),'[]'::jsonb) from public.orcamento where aprovado));
end;
$$;

revoke all on function public.atlas_save_workspace(bigint,jsonb) from public,anon;
grant execute on function public.atlas_save_workspace(bigint,jsonb) to authenticated;
commit;

-- Origem: 202609100003_approved_budget_items.sql
-- Persiste o total calculado pelos itens, inclusive em bancos legados.
-- Execute após 202609100002_budget_total.sql.
begin;
alter table public.orcamento add column if not exists valor_total numeric(18,2);
update public.orcamento o set valor_total=coalesce((select sum(i.valor_total) from public.item_orcamento i where i.orcamento_codigo=o.codigo),0) where o.codigo is not null;
alter table public.orcamento alter column valor_total set not null;

create or replace function public.atlas_save_workspace(expected_revision bigint,new_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare budget_total numeric(18,2); r jsonb; existing_code bigint; generated_budget bigint; generated_client bigint; generated_client_count integer := 0; phone_text text; next_revision bigint; result_payload jsonb; deletion_requested boolean;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  perform 1 from public.atlas_workspaces where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision for update;
  if not found then return null; end if;
  if (select count(*) from jsonb_array_elements(new_payload->'orcamentos') x where x->>0 is null)>1 then
    raise exception 'Somente um orçamento novo pode ser salvo por vez' using errcode='22023';
  end if;
  if exists(
    select 1 from public.orcamento o
    where o.aprovado and exists(select 1 from jsonb_array_elements(new_payload->'orcamentos') b where (b->>0)::bigint=o.codigo)
      and coalesce((select jsonb_agg(jsonb_build_array(i.produto_codigo,i.produto_nome,i.quantidade,i.valor_unitario,coalesce(i.produto_descricao,'')) order by i.produto_codigo) from public.item_orcamento i where i.orcamento_codigo=o.codigo),'[]'::jsonb)
        is distinct from coalesce((select jsonb_agg(jsonb_build_array((x->>1)::bigint,x->>2,(x->>3)::bigint,(x->>4)::numeric,coalesce(x->>6,'')) order by (x->>1)::bigint) from jsonb_array_elements(new_payload->'itensOrcamento') x where (x->>0)::bigint=o.codigo),'[]'::jsonb)
  ) then raise exception 'Os itens de um orçamento aprovado não podem ser alterados' using errcode='22023'; end if;
  if not public.atlas_is_admin() then
    select exists(select 1 from public.cliente e where not exists(select 1 from jsonb_array_elements(new_payload->'clientes') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
    select exists(select 1 from public.categoria e where not exists(select 1 from jsonb_array_elements(new_payload->'categorias') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
    select exists(select 1 from public.produto e where not exists(select 1 from jsonb_array_elements(new_payload->'itens') j where (j->>0)::bigint=e.codigo)) into deletion_requested;
    if deletion_requested then raise exception 'Somente administradores podem excluir cadastros' using errcode='42501'; end if;
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new_payload->'telefonesClientes','[]'::jsonb)) x group by x->>1 having count(*) filter(where (x->>3)::boolean)<>1)
     or exists(select 1 from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) x group by x->>1 having count(*) filter(where (x->>10)::boolean)<>1) then raise exception 'Cada lista de contato deve possuir um principal' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new_payload->'contatosClientes','[]'::jsonb)) x where coalesce(x->>1,'')<>'' and x->>1 !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or exists(select 1 from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) x where (coalesce(x->>2,'')<>'' and x->>2 !~ '^[0-9]{5}-?[0-9]{3}$') or (coalesce(x->>8,'')<>'' and x->>8 !~ '^[A-Za-z]{2}$')) then raise exception 'Contato de cliente inválido' using errcode='22023'; end if;
  delete from public.item_orcamento where orcamento_codigo is not null;
  delete from public.cliente_telefone where codigo is not null;
  delete from public.cliente_endereco where codigo is not null;
  delete from public.cliente_contato where cliente_codigo is not null;
  delete from public.orcamento where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'orcamentos') j where (j->>0)::bigint=codigo);
  delete from public.produto where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'itens') j where (j->>0)::bigint=codigo);
  delete from public.categoria where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'categorias') j where (j->>0)::bigint=codigo);
  delete from public.cliente where codigo is not null and not exists(select 1 from jsonb_array_elements(new_payload->'clientes') j where (j->>0)::bigint=codigo);
  for r in select value from jsonb_array_elements(new_payload->'clientes') loop
    if jsonb_array_length(r)<>4 then raise exception 'Cliente inválido' using errcode='22023'; end if;
    if r->>0 is null then insert into public.cliente(tipo,documento,nome) values(r->>1,r->>2,r->>3) returning codigo into generated_client; generated_client_count := generated_client_count + 1;
    else update public.cliente set tipo=r->>1,documento=r->>2,nome=r->>3 where codigo=(r->>0)::bigint; end if;
  end loop;
  if generated_client_count>0 and not new_payload ? 'novoClienteContato' then raise exception 'Contato obrigatório do novo cliente inválido' using errcode='22023'; end if;
  if new_payload ? 'novoClienteContato' then
    if generated_client_count<>1 or generated_client is null or jsonb_typeof(new_payload->'novoClienteContato')<>'object' or coalesce(new_payload->'novoClienteContato'->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or jsonb_typeof(new_payload->'novoClienteContato'->'telefones')<>'array' or jsonb_array_length(new_payload->'novoClienteContato'->'telefones')=0 or exists(select 1 from jsonb_array_elements_text(new_payload->'novoClienteContato'->'telefones') value where btrim(value)='') or (exists(select 1 from public.cliente where codigo=generated_client and tipo='Pessoa Jurídica') and btrim(coalesce(new_payload->'novoClienteContato'->>'pessoa',''))='') then raise exception 'Contato obrigatório do novo cliente inválido' using errcode='22023'; end if;
    insert into public.cliente_contato(cliente_codigo,email,pessoa_contato) values(generated_client,btrim(new_payload->'novoClienteContato'->>'email'),btrim(coalesce(new_payload->'novoClienteContato'->>'pessoa','')));
    for phone_text in select value from jsonb_array_elements_text(new_payload->'novoClienteContato'->'telefones') loop insert into public.cliente_telefone(cliente_codigo,telefone,principal) values(generated_client,btrim(phone_text),not exists(select 1 from public.cliente_telefone where cliente_codigo=generated_client)); end loop;
  end if;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'contatosClientes','[]'::jsonb)) loop insert into public.cliente_contato(cliente_codigo,email,pessoa_contato) values((r->>0)::bigint,r->>1,r->>2); end loop;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'telefonesClientes','[]'::jsonb)) loop insert into public.cliente_telefone(cliente_codigo,telefone,principal) values((r->>1)::bigint,r->>2,(r->>3)::boolean); end loop;
  for r in select value from jsonb_array_elements(coalesce(new_payload->'enderecosClientes','[]'::jsonb)) loop insert into public.cliente_endereco(cliente_codigo,cep,logradouro,numero,complemento,bairro,cidade,uf,texto_legado,principal) values((r->>1)::bigint,r->>2,r->>3,r->>4,r->>5,r->>6,r->>7,upper(r->>8),r->>9,(r->>10)::boolean); end loop;
  for r in select value from jsonb_array_elements(new_payload->'categorias') loop if r->>0 is null then insert into public.categoria(descricao) values(r->>1); else update public.categoria set descricao=r->>1 where codigo=(r->>0)::bigint; end if; end loop;
  for r in select value from jsonb_array_elements(new_payload->'itens') loop
    select codigo into existing_code from public.categoria where lower(regexp_replace(btrim(descricao),'\s+',' ','g'))=lower(regexp_replace(btrim(r->>1),'\s+',' ','g'));
    if r->>0 is null then insert into public.produto(categoria_codigo,nome,descricao,valor_venda,status) values(existing_code,r->>2,r->>3,(r->>4)::numeric,r->>6); else update public.produto set categoria_codigo=existing_code,nome=r->>2,descricao=r->>3,valor_venda=(r->>4)::numeric,status=r->>6 where codigo=(r->>0)::bigint; end if;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'orcamentos') loop
    select coalesce(sum((i->>3)::bigint * (i->>4)::numeric(14,2)),0) into budget_total
      from jsonb_array_elements(new_payload->'itensOrcamento') i
      where (i->>0)::bigint is not distinct from (r->>0)::bigint;
    if r->>0 is null then insert into public.orcamento(cliente_codigo,validade,valor_total) values((r->>1)::bigint,public.atlas_parse_date(r->>4),budget_total) returning codigo into generated_budget;
    else update public.orcamento set cliente_codigo=(r->>1)::bigint,validade=public.atlas_parse_date(r->>4),valor_total=budget_total where codigo=(r->>0)::bigint; end if;
    insert into public.orcamento_informacao(orcamento_codigo,pagamento,prazo_entrega,local_entrega,observacoes,empresa_nome,empresa_cnpj,empresa_endereco,empresa_telefone,empresa_email,cliente_tipo,cliente_documento,cliente_nome,cliente_email,cliente_pessoa_contato,cliente_telefone,cliente_endereco)
    values(coalesce((r->>0)::bigint,generated_budget),coalesce(r->6->>'pagamento',''),coalesce(r->6->>'entrega',''),coalesce(r->6->>'localEntrega',''),coalesce(r->6->>'observacoes',''),coalesce(r->6->'company'->>'nome',''),coalesce(r->6->'company'->>'cnpj',''),coalesce(r->6->'company'->>'endereco',''),coalesce(r->6->'company'->>'telefone',''),coalesce(r->6->'company'->>'email',''),coalesce(r->6->'client'->>'tipo',''),coalesce(r->6->'client'->>'documento',''),coalesce(r->6->'client'->>'nome',''),coalesce(r->6->'client'->>'email',''),coalesce(r->6->'client'->>'contato',''),coalesce(r->6->'client'->>'telefone',''),coalesce(r->6->'client'->>'endereco',''))
    on conflict(orcamento_codigo) do update set pagamento=excluded.pagamento,prazo_entrega=excluded.prazo_entrega,local_entrega=excluded.local_entrega,observacoes=excluded.observacoes,empresa_nome=excluded.empresa_nome,empresa_cnpj=excluded.empresa_cnpj,empresa_endereco=excluded.empresa_endereco,empresa_telefone=excluded.empresa_telefone,empresa_email=excluded.empresa_email,cliente_tipo=excluded.cliente_tipo,cliente_documento=excluded.cliente_documento,cliente_nome=excluded.cliente_nome,cliente_email=excluded.cliente_email,cliente_pessoa_contato=excluded.cliente_pessoa_contato,cliente_telefone=excluded.cliente_telefone,cliente_endereco=excluded.cliente_endereco;
  end loop;
  for r in select value from jsonb_array_elements(new_payload->'itensOrcamento') loop insert into public.item_orcamento(orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario,produto_descricao) values(coalesce((r->>0)::bigint,generated_budget),(r->>1)::bigint,r->>2,(r->>3)::bigint,(r->>4)::numeric,coalesce(r->>6,'')); end loop;
  update public.atlas_workspaces set revision=revision+1,updated_at=now() where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision returning revision into next_revision;
  select loaded.payload into result_payload from public.atlas_load_workspace() loaded;
  return jsonb_build_object('revision',next_revision,'payload',result_payload,'empresa',result_payload->'empresa','approved_codes',(select coalesce(jsonb_agg(codigo order by codigo),'[]'::jsonb) from public.orcamento where aprovado));
end;
$$;

revoke all on function public.atlas_save_workspace(bigint,jsonb) from public,anon;
grant execute on function public.atlas_save_workspace(bigint,jsonb) to authenticated;
commit;

-- Origem: 202609110001_inactive_budget_products.sql
-- Impede novas inclusões e aumentos de produtos inativos nos orçamentos.
-- Execute após 202609100003_approved_budget_items.sql.
begin;

create or replace function public.atlas_capture_budget_item_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  execute 'create temporary table if not exists atlas_budget_item_limits(orcamento_codigo bigint,produto_codigo bigint,quantidade bigint,primary key(orcamento_codigo,produto_codigo)) on commit drop';
  execute 'truncate table pg_temp.atlas_budget_item_limits';
  execute 'insert into pg_temp.atlas_budget_item_limits(orcamento_codigo,produto_codigo,quantidade) select orcamento_codigo,produto_codigo,quantidade from public.item_orcamento';
  return null;
end;
$$;

create or replace function public.atlas_validate_inactive_budget_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare product_status text; previous_quantity bigint;
begin
  select status into product_status from public.produto where codigo=new.produto_codigo;
  if product_status='Inativo' then
    if to_regclass('pg_temp.atlas_budget_item_limits') is not null then
      execute 'select quantidade from pg_temp.atlas_budget_item_limits where orcamento_codigo=$1 and produto_codigo=$2'
        into previous_quantity using new.orcamento_codigo,new.produto_codigo;
    end if;
    if previous_quantity is null or new.quantidade>previous_quantity then
      raise exception 'Produto inativo não pode ser incluído nem ter sua quantidade aumentada no orçamento' using errcode='22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists atlas_capture_budget_item_limits on public.item_orcamento;
create trigger atlas_capture_budget_item_limits before delete on public.item_orcamento
for each statement execute function public.atlas_capture_budget_item_limits();

drop trigger if exists atlas_validate_inactive_budget_item on public.item_orcamento;
create trigger atlas_validate_inactive_budget_item before insert or update on public.item_orcamento
for each row execute function public.atlas_validate_inactive_budget_item();

revoke all on function public.atlas_capture_budget_item_limits() from public,anon,authenticated;
revoke all on function public.atlas_validate_inactive_budget_item() from public,anon,authenticated;
commit;
