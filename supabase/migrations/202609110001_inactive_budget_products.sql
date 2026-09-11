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
