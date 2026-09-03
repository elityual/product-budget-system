// Dados de exemplo: substitua por consultas ao Supabase quando o banco existir.
export const data = {
  clientes: [
    ['CLI-0001', 'Pessoa Jurídica', '12.345.678/0001-99', 'Construtora Horizonte'],
    ['CLI-0002', 'Pessoa Física', '123.456.789-10', 'Mariana Oliveira']
  ],
  categorias: [
    ['CAT-001', 'Materiais de construção'],
    ['CAT-002', 'Ferramentas']
  ],
  itens: [
    ['PRD-0001', 'Materiais de construção', 'Cimento CP II 50kg', 'Saco de cimento de 50 kg', 42.9, '01/09/2026', 'Ativo'],
    ['PRD-0002', 'Ferramentas', 'Furadeira profissional', 'Furadeira elétrica de uso profissional', 359, '01/09/2026', 'Inativo']
  ],
  orcamentos: [
    ['ORC-0102', 'Construtora Horizonte', '01/09/2026', '30/09/2026', 'R$ 12.480,00']
  ]
};

export const recordPrefixes = {
  clientes: 'CLI-',
  categorias: 'CAT-',
  itens: 'PRD-',
  orcamentos: 'ORC-'
};
