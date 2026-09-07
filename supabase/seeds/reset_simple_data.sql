-- Run after migrations 001-008 to replace all business data with a small example set.
-- Auth users and public.atlas_admins are preserved. All changes are transactional.
begin;

lock table public.atlas_workspaces, public.cliente, public.categoria,
  public.produto, public.orcamento, public.item_orcamento in access exclusive mode;

-- Clear dependent tables together and restart the SQL-generated identity codes at 1.
truncate table public.item_orcamento, public.orcamento, public.produto,
  public.categoria, public.cliente restart identity;

do $seed$
declare
  workspace_id constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  cliente_empresa bigint;
  cliente_pessoa bigint;
  categoria_materiais bigint;
  categoria_ferramentas bigint;
  produto_cimento bigint;
  produto_furadeira bigint;
  orcamento_exemplo bigint;
begin
  insert into public.cliente(user_id,tipo,documento,nome)
  values(workspace_id,'Pessoa Jurídica','11.222.333/0001-81','Construtora Horizonte')
  returning codigo into cliente_empresa;

  insert into public.cliente(user_id,tipo,documento,nome)
  values(workspace_id,'Pessoa Física','529.982.247-25','Mariana Oliveira')
  returning codigo into cliente_pessoa;

  insert into public.categoria(user_id,descricao)
  values(workspace_id,'Materiais de construção')
  returning codigo into categoria_materiais;

  insert into public.categoria(user_id,descricao)
  values(workspace_id,'Ferramentas')
  returning codigo into categoria_ferramentas;

  insert into public.produto(user_id,categoria_codigo,nome,descricao,valor_venda,status)
  values(workspace_id,categoria_materiais,'Cimento CP II 50kg','Saco de cimento de 50 kg',42.90,'Ativo')
  returning codigo into produto_cimento;

  insert into public.produto(user_id,categoria_codigo,nome,descricao,valor_venda,status)
  values(workspace_id,categoria_ferramentas,'Furadeira profissional','Furadeira elétrica de uso profissional',359.00,'Ativo')
  returning codigo into produto_furadeira;

  insert into public.produto(user_id,categoria_codigo,nome,descricao,valor_venda,status)
  values(workspace_id,categoria_materiais,'Capacete de segurança','Capacete para uso em obras',59.90,'Ativo');

  insert into public.orcamento(user_id,cliente_codigo,validade,valor_total)
  values(workspace_id,cliente_empresa,current_date + 30,0)
  returning codigo into orcamento_exemplo;

  insert into public.item_orcamento(
    user_id,orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario
  ) values
    (workspace_id,orcamento_exemplo,produto_cimento,'Cimento CP II 50kg',2,42.90),
    (workspace_id,orcamento_exemplo,produto_furadeira,'Furadeira profissional',1,359.00);

  update public.orcamento as budget
  set valor_total = (
    select sum(item.valor_total)
    from public.item_orcamento as item
    where (item.user_id,item.orcamento_codigo)=(budget.user_id,budget.codigo)
  )
  where (budget.user_id,budget.codigo)=(workspace_id,orcamento_exemplo);
end;
$seed$;

-- Invalidate application snapshots that still contain the removed records.
update public.atlas_workspaces
set payload='{"clientes":[],"categorias":[],"itens":[],"orcamentos":[],"itensOrcamento":[]}'::jsonb,
    revision=revision+1,
    updated_at=now()
where user_id='00000000-0000-4000-8000-000000000001'::uuid;

commit;

-- Summary shown by the Supabase SQL Editor after a successful reset.
select
  (select count(*) from public.cliente) as clientes,
  (select count(*) from public.categoria) as categorias,
  (select count(*) from public.produto) as produtos,
  (select count(*) from public.orcamento) as orcamentos,
  (select count(*) from public.item_orcamento) as itens_orcamento;
