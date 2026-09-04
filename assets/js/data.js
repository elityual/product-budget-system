// Dados de exemplo: substitua por consultas ao Supabase quando o banco existir.
export const data = {
  clientes: [
    [1, 'Pessoa Jurídica', '12.345.678/0001-99', 'Construtora Horizonte'],
    [2, 'Pessoa Física', '123.456.789-10', 'Mariana Oliveira']
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
    [102, 'Construtora Horizonte', 1, '01/09/2026', '30/09/2026', 444.8]
  ],
  itensOrcamento: [
    [102, 1, 'Cimento CP II 50kg', 2, 42.9, 85.8],
    [102, 2, 'Furadeira profissional', 1, 359, 359]
  ]
};

export function getNextRecordCode(records) {
  const numericCodes = records
    .map((record) => record[0])
    .filter((code) => Number.isInteger(code) && code >= 0);

  return Math.max(0, ...numericCodes) + 1;
}
