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
