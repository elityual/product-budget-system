-- Compatibilidade com orcamentos legados que exigem o usuario criador.
-- Execute depois de 202609090001_quotation_details.sql.
begin;
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid='public.orcamento'::regclass
      and attname='user_id' and not attisdropped
  ) then
    alter table public.orcamento alter column user_id set default auth.uid();
  end if;
end;
$$;
commit;
