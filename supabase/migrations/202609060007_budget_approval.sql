-- Apply once after 006. Approval is available to all authenticated non-anonymous users.
begin;
alter table public.orcamento add column aprovado boolean not null default false;
drop function public.atlas_load_workspace();
create function public.atlas_load_workspace()
returns table(payload jsonb, revision bigint, is_admin boolean, approved_codes jsonb)
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'clientes',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.tipo,c.documento,c.nome) order by c.codigo) from public.cliente c where c.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb),
    'categorias',coalesce((select jsonb_agg(jsonb_build_array(c.codigo,c.descricao) order by c.codigo) from public.categoria c where c.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb),
    'itens',coalesce((select jsonb_agg(jsonb_build_array(p.codigo,c.descricao,p.nome,p.descricao,p.valor_venda,to_char(p.data_cadastro,'DD/MM/YYYY'),p.status) order by p.codigo) from public.produto p join public.categoria c on (c.user_id,c.codigo)=(p.user_id,p.categoria_codigo) where p.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb),
    'orcamentos',coalesce((select jsonb_agg(jsonb_build_array(o.codigo,c.nome,o.cliente_codigo,to_char(o.data_emissao,'DD/MM/YYYY'),to_char(o.validade,'DD/MM/YYYY'),o.valor_total) order by o.codigo) from public.orcamento o join public.cliente c on (c.user_id,c.codigo)=(o.user_id,o.cliente_codigo) where o.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb),
    'itensOrcamento',coalesce((select jsonb_agg(jsonb_build_array(i.orcamento_codigo,i.produto_codigo,i.produto_nome,i.quantidade,i.valor_unitario,i.valor_total) order by i.orcamento_codigo,i.produto_codigo) from public.item_orcamento i where i.user_id='00000000-0000-4000-8000-000000000001'::uuid),'[]'::jsonb)
  ), w.revision, public.atlas_is_admin(), coalesce((select jsonb_agg(codigo order by codigo) from public.orcamento where aprovado),'[]'::jsonb) from public.atlas_workspaces w where w.user_id='00000000-0000-4000-8000-000000000001'::uuid;
$$;


revoke all on function public.atlas_load_workspace() from public,anon;
grant execute on function public.atlas_load_workspace() to authenticated;


create function public.atlas_approve_budget(expected_revision bigint,budget_code bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare next_revision bigint; loaded record;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  perform 1 from public.atlas_workspaces where user_id='00000000-0000-4000-8000-000000000001'::uuid and revision=expected_revision for update;
  if not found then return null; end if;
  update public.orcamento set aprovado=true where codigo=budget_code and not aprovado;
  if not found then raise exception 'Budget missing or already approved' using errcode='22023'; end if;
  update public.atlas_workspaces set revision=revision+1,updated_at=now()
    where user_id='00000000-0000-4000-8000-000000000001'::uuid returning revision into next_revision;
  select * into loaded from public.atlas_load_workspace();
  return jsonb_build_object('revision',next_revision,'payload',loaded.payload,'approved_codes',loaded.approved_codes);
end $$;
revoke all on function public.atlas_approve_budget(bigint,bigint) from public,anon;
grant execute on function public.atlas_approve_budget(bigint,bigint) to authenticated;
update public.atlas_workspaces set revision=revision+1;
commit;
