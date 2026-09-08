-- Correção para instalações existentes. Execute inteiro no SQL Editor.
-- Preserva tabelas, dados e permissões; não desativa a proteção de gravação.
begin;

create or replace function public.atlas_save_workspace(expected_revision bigint,new_payload jsonb)
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

create or replace function public.atlas_approve_budget(expected_revision bigint,budget_code bigint)
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

commit;

