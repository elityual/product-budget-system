import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateBudgetTotal,
  createBudgetItemRecords,
  createBudgetRecord,
  filterBudgetClients,
  filterBudgetProducts,
  formatDateForDisplay,
  formatDateForInput
} from '../../assets/js/budget.js';

test('pesquisa clientes pelo nome para iniciar um orçamento', () => {
  const clients = [
    [1, 'Pessoa Jurídica', '12.345.678/0001-99', 'Construtora Horizonte'],
    [2, 'Pessoa Física', '123.456.789-10', 'Mariana Oliveira']
  ];

  assert.deepEqual(filterBudgetClients(clients, '  HORIZONTE '), [clients[0]]);
  assert.deepEqual(filterBudgetClients(clients, 'cliente inexistente'), []);
});

test('pesquisa e filtra produtos do orçamento por categoria', () => {
  const products = [
    [1, 'Materiais', 'Cimento', 'Saco de 50 kg', 42.9],
    [2, 'Ferramentas', 'Furadeira', 'Modelo elétrico', 359],
    [3, 'Ferramentas', 'Serra', 'Disco para madeira', 220]
  ];

  assert.deepEqual(filterBudgetProducts(products, {
    search: 'elétrico',
    category: 'Ferramentas'
  }), [products[1]]);
  assert.deepEqual(filterBudgetProducts(products, {
    search: 'cimento',
    category: 'Ferramentas'
  }), []);
});

test('cria orçamento com todas as colunas esperadas', () => {
  const record = createBudgetRecord({
    code: 2,
    client: 'Mariana Oliveira',
    clientCode: 2,
    validity: '2026-10-15',
    total: 718,
    currentDate: new Date(2026, 8, 4)
  });

  assert.deepEqual(record, [
    2,
    2,
    'Mariana Oliveira',
    '04/09/2026',
    '15/10/2026',
    718, {}
  ]);
});

test('preserva data e total ao editar um orçamento', () => {
  const existingRecord = [
    102,
    1,
    'Construtora Horizonte',
    '01/09/2026',
    '30/09/2026',
    12480, {}
  ];

  const record = createBudgetRecord({
    code: existingRecord[0],
    client: 'Mariana Oliveira',
    clientCode: 2,
    validity: '2026-11-30',
    existingRecord
  });

  assert.deepEqual(record, [
    102,
    2,
    'Mariana Oliveira',
    '01/09/2026',
    '30/11/2026',
    12480, {}
  ]);
});

test('cria itens selecionados e calcula o total do orçamento', () => {
  const products = [
    [1, 'Materiais', 'Cimento', 'Saco', 42.9, '01/09/2026', 'Ativo'],
    [2, 'Ferramentas', 'Furadeira', 'Elétrica', 359, '01/09/2026', 'Ativo']
  ];
  const items = createBudgetItemRecords({
    budgetCode: 103,
    products,
    quantities: { 1: 2, 2: 1 }
  });

  assert.deepEqual(items, [
    [103, 1, 'Cimento', 2, 42.9, 85.8, 'Saco'],
    [103, 2, 'Furadeira', 1, 359, 359, 'Elétrica']
  ]);
  assert.equal(calculateBudgetTotal(items), 444.8);
});

test('ignora produtos sem quantidade inteira positiva', () => {
  const products = [
    [1, 'Materiais', 'Cimento', 'Saco', 42.9, '01/09/2026', 'Ativo']
  ];

  assert.deepEqual(createBudgetItemRecords({
    budgetCode: 103,
    products,
    quantities: { 1: 0 }
  }), []);
  assert.deepEqual(createBudgetItemRecords({
    budgetCode: 103,
    products,
    quantities: { 1: 1.5 }
  }), []);
});

test('converte datas entre a tabela e o campo HTML', () => {
  assert.equal(formatDateForInput('30/09/2026'), '2026-09-30');
  assert.equal(formatDateForDisplay('2026-09-30'), '30/09/2026');
});
