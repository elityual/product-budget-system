// Example workspace shared by browser and migration tests.
export const data = {
  clientes: [
    [1, 'Pessoa Jurídica', '11.222.333/0001-81', 'Construtora Horizonte'],
    [2, 'Pessoa Física', '529.982.247-25', 'Mariana Oliveira']
  ],
  categorias: [
    [1, 'Materiais de construção'],
    [2, 'Ferramentas']
  ],
  itens: [
    [1, 'Materiais de construção', 'Cimento CP II 50kg', 'Saco de cimento de 50 kg', 42.9, '01/09/2026', 'Ativo'],
    [2, 'Ferramentas', 'Furadeira profissional', 'Furadeira elétrica de uso profissional', 359, '01/09/2026', 'Inativo']
  ],
  orcamentos: [
    [102, 1, 'Construtora Horizonte', '01/09/2026', '30/09/2026', 444.8]
  ],
  itensOrcamento: [
    [102, 1, 'Cimento CP II 50kg', 2, 42.9, 85.8],
    [102, 2, 'Furadeira profissional', 1, 359, 359]
  ]
};

