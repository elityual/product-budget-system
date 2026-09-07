export function getDeletionError(data, page, index) {
  const record = data[page][index];
  if (page === 'categorias' && data.itens.some((product) => product[1] === record[1])) {
    return 'Não é possível excluir uma categoria usada por produtos.';
  }
  if (page === 'clientes' && data.orcamentos.some((budget) => budget[1] === record[0])) {
    return 'Não é possível excluir um cliente com orçamentos vinculados.';
  }
  if (page === 'itens' && data.itensOrcamento.some((item) => item[1] === record[0])) {
    return 'Não é possível excluir um produto usado em orçamentos.';
  }
  return '';
}

export function updateRelatedRecords(data, page, previous, updated) {
  if (page === 'categorias') {
    data.itens.forEach((product) => {
      if (product[1] === previous[1]) product[1] = updated[1];
    });
  }
  if (page === 'clientes') {
    data.orcamentos.forEach((budget) => {
      if (budget[1] === previous[0]) budget[2] = updated[3];
    });
  }
}
