-- Apply once after 007. Budget arrays expose the client code before the client name.
begin;

create or replace function public.atlas_load_workspace()
returns table(payload jsonb, revision bigint, is_admin boolean, approved_codes jsonb)
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'clientes',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.tipo,c.documento,c.nome) order by c.codigo) from public.cliente c where c.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb),
    'categorias',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.descricao) order by c.codigo) from public.categoria c where c.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb),
    'itens',coalesce((select jsonb_agg(jsonb_build_array(p.codigo,c.descricao,p.nome,p.descricao,p.valor_venda,to_char(p.data_cadastro,'DD/MM/YYYY'),p.status) order by p.codigo) from public.produto p join public.categoria c on (c.user_id,c.codigo)=(p.user_id,p.categoria_codigo) where p.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb),
    'orcamentos',coalesce((select jsonb_agg(jsonb_build_array(o.codigo,o.cliente_codigo,c.nome,to_char(o.data_emissao,'DD/MM/YYYY'),to_char(o.validade,'DD/MM/YYYY'),o.valor_total) order by o.codigo) from public.orcamento o join public.cliente c on (c.user_id,c.codigo)=(o.user_id,o.cliente_codigo) where o.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb),
    'itensOrcamento',coalesce((select jsonb_agg(jsonb_build_array(i.orcamento_codigo,i.produto_codigo,i.produto_nome,i.quantidade,i.valor_unitario,i.valor_total) order by i.orcamento_codigo,i.produto_codigo) from public.item_orcamento i where i.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb)
  ), w.revision, public.atlas_is_admin(), coalesce((select jsonb_agg(codigo order by codigo) from public.orcamento where aprovado),'[]'::jsonb)
  from public.atlas_workspaces w
  where w.user_id='00000000-0000-4000-8000-000000000001'::uuid;
$$;

revoke all on function public.atlas_load_workspace() from public,anon;
grant execute on function public.atlas_load_workspace() to authenticated;

-- Keep the proven synchronization rules from 006 and adapt only their positional input.
alter function public.atlas_save_workspace(bigint,jsonb) rename to atlas_save_workspace_legacy_order;
revoke all on function public.atlas_save_workspace_legacy_order(bigint,jsonb) from public,anon,authenticated;

create function public.atlas_save_workspace(expected_revision bigint,new_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  row_value jsonb;
  legacy_budgets jsonb;
  legacy_payload jsonb;
begin
  if jsonb_typeof(new_payload->'orcamentos') is distinct from 'array' then
    raise exception 'Invalid collection: orcamentos' using errcode='22023';
  end if;
  for row_value in select value from jsonb_array_elements(new_payload->'orcamentos') loop
    if jsonb_typeof(row_value) <> 'array' or jsonb_array_length(row_value) <> 6 then
      raise exception 'Invalid budget row' using errcode='22023';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_array(
    budget.value->0,budget.value->2,budget.value->1,budget.value->3,budget.value->4,budget.value->5
  )),'[]'::jsonb)
  into legacy_budgets
  from jsonb_array_elements(new_payload->'orcamentos') as budget(value);

  legacy_payload := jsonb_set(new_payload,'{orcamentos}',legacy_budgets);
  return public.atlas_save_workspace_legacy_order(expected_revision,legacy_payload);
end;
$$;

revoke all on function public.atlas_save_workspace(bigint,jsonb) from public,anon;
grant execute on function public.atlas_save_workspace(bigint,jsonb) to authenticated;

-- Open clients must reload before saving with the new positional contract.
update public.atlas_workspaces set revision=revision+1,updated_at=now();
commit;
