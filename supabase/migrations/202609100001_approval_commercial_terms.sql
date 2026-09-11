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
