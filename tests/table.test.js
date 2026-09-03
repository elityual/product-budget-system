import test from 'node:test';
import assert from 'node:assert/strict';

import { filterRows, paginateRows, recordsPerPage } from '../assets/js/table.js';

test('limita cada página a dez registros', () => {
  const rows = Array.from({ length: 25 }, (_, index) => [`REG-${index + 1}`]);
  const indexedRows = filterRows(rows);

  const firstPage = paginateRows(indexedRows, 1);
  const lastPage = paginateRows(indexedRows, 3);

  assert.equal(recordsPerPage, 10);
  assert.equal(firstPage.visibleRows.length, 10);
  assert.equal(lastPage.visibleRows.length, 5);
  assert.equal(lastPage.totalPages, 3);
});

test('ajusta uma página solicitada para o intervalo disponível', () => {
  const rows = filterRows(Array.from({ length: 12 }, (_, index) => [index]));

  assert.equal(paginateRows(rows, 0).currentPage, 1);
  assert.equal(paginateRows(rows, 99).currentPage, 2);
});

test('combina pesquisa e filtro preservando o índice original', () => {
  const clients = [
    ['CLI-1', 'Pessoa Física', '111', 'Ana'],
    ['CLI-2', 'Pessoa Jurídica', '222', 'Empresa Horizonte'],
    ['CLI-3', 'Pessoa Jurídica', '333', 'Empresa Atlas']
  ];

  const result = filterRows(clients, {
    search: 'atlas',
    clientType: 'Pessoa Jurídica'
  });

  assert.deepEqual(result, [{ row: clients[2], index: 2 }]);
});

test('filtra produtos por categoria e status', () => {
  const products = [
    ['PRD-1', 'Ferramentas', 'Furadeira', '', 100, '01/09/2026', 'Ativo'],
    ['PRD-2', 'Ferramentas', 'Serra', '', 200, '01/09/2026', 'Inativo'],
    ['PRD-3', 'Materiais', 'Cimento', '', 50, '01/09/2026', 'Ativo']
  ];

  const result = filterRows(products, {
    category: 'Ferramentas',
    status: 'Ativo'
  });

  assert.deepEqual(result, [{ row: products[0], index: 0 }]);
});
