import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRow,
  filterRows,
  paginateRows,
  recordsPerPage
} from '../../assets/js/table.js';

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
    [1, 'Pessoa Física', '111', 'Ana'],
    [2, 'Pessoa Jurídica', '222', 'Empresa Horizonte'],
    [3, 'Pessoa Jurídica', '333', 'Empresa Atlas']
  ];

  const result = filterRows(clients, {
    search: 'atlas',
    clientType: 'Pessoa Jurídica'
  });

  assert.deepEqual(result, [{ row: clients[2], index: 2 }]);
});

test('filtra produtos por categoria e status', () => {
  const products = [
    [1, 'Ferramentas', 'Furadeira', '', 100, '01/09/2026', 'Ativo'],
    [2, 'Ferramentas', 'Serra', '', 200, '01/09/2026', 'Inativo'],
    [3, 'Materiais', 'Cimento', '', 50, '01/09/2026', 'Ativo']
  ];

  const result = filterRows(products, {
    category: 'Ferramentas',
    status: 'Ativo'
  });

  assert.deepEqual(result, [{ row: products[0], index: 0 }]);
});

test('renderiza itens de orçamento com valores monetários e sem ações', () => {
  const row = createRow(
    [102, 1, 'Cimento CP II 50kg', 2, 42.9, 85.8],
    0,
    'itensOrcamento'
  );

  assert.match(row, /R\$\s*42,90/);
  assert.match(row, /R\$\s*85,80/);
  assert.match(row, /<td>102<\/td>/);
  assert.doesNotMatch(row, /onclick=/);
});

test('mostra a situação do orçamento somente na listagem geral', () => {
  const budget = [102, 1, 'Cliente', '01/09/2026', '30/09/2026', 444.8];
  assert.match(createRow(budget, 0, 'orcamentos', true, false, false), /class="status pending">Pendente/);
  assert.match(createRow(budget, 0, 'orcamentos', true, false, true), /class="status">Aprovado pelo cliente/);
  assert.doesNotMatch(createRow(budget, 0, 'orcamentos', true, true, true), /Aprovado pelo cliente|Pendente/);
});

test('escapa conteúdo de usuário ao renderizar células', () => {
  const row = createRow(
    [1, 'Pessoa Física', '111', '<img src=x onerror="alert(1)"> & Empresa'],
    0,
    'clientes'
  );

  assert.doesNotMatch(row, /<img/);
  assert.doesNotMatch(row, /onerror="/);
  assert.match(row, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; Empresa/);
  assert.match(row, /data-action="contact"/);
});

test('escapa o texto exibido no status de produtos', () => {
  const row = createRow(
    [1, 'Categoria', 'Produto', 'Descrição', 10, '01/09/2026', '<script>alert(1)</script>'],
    0,
    'itens'
  );

  assert.doesNotMatch(row, /<script>/);
  assert.match(row, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
