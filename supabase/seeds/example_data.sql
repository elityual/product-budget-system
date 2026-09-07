-- Carga opcional para demonstração. Execute somente em um banco vazio.
begin;
do $$ begin
  if exists(select 1 from public.cliente) or exists(select 1 from public.categoria)
     or exists(select 1 from public.produto) or exists(select 1 from public.orcamento)
     or exists(select 1 from public.item_orcamento) then
    raise exception 'A carga de exemplo exige tabelas comerciais vazias.' using errcode='22023';
  end if;
end $$;
insert into public.cliente(tipo,documento,nome) values
  ('Pessoa Jurídica','11.222.333/0001-81','Construtora Horizonte'),
  ('Pessoa Física','529.982.247-25','Mariana Oliveira');
insert into public.categoria(descricao) values ('Materiais de construção'),('Ferramentas');
insert into public.produto(categoria_codigo,nome,descricao,valor_venda,status)
select c.codigo,'Cimento CP II 50kg','Saco de cimento de 50 kg',42.90,'Ativo' from public.categoria c where c.descricao='Materiais de construção'
union all
select c.codigo,'Furadeira profissional','Furadeira elétrica de uso profissional',359.00,'Inativo' from public.categoria c where c.descricao='Ferramentas';
insert into public.orcamento(cliente_codigo,validade)
select codigo,current_date+30 from public.cliente where nome='Construtora Horizonte';
insert into public.item_orcamento(orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario)
select o.codigo,p.codigo,p.nome,2,p.valor_venda from public.orcamento o join public.produto p on p.nome='Cimento CP II 50kg';
insert into public.item_orcamento(orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario)
select o.codigo,p.codigo,p.nome,1,p.valor_venda from public.orcamento o join public.produto p on p.nome='Furadeira profissional';
update public.atlas_workspaces set revision=revision+1,updated_at=now();
commit;
