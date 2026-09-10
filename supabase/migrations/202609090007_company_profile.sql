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
