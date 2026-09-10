import test from 'node:test';
import assert from 'node:assert/strict';
import { createBudgetDocument } from '../../assets/js/budget-print.js';
import { data } from '../fixtures/workspace.js';

test('print escapes user text and isolates items by budget code', () => {
  const client = [...data.clientes[0]];
  client[3] = '<script>alert(1)</script>';
  const items = structuredClone(data.itensOrcamento);
  items[0][2] = '<img src=x onerror=alert(1)>';
  items.push([999, 1, 'Other budget secret', 1, 10, 10]);
  const budget = [...data.orcamentos[0], { pagamento: '30 dias', observacoes: 'Entrega inclusa' }];
  items[0][6] = 'Descrição <segura>';
  const html = createBudgetDocument(budget, client, items, { nome: 'Atlas', cnpj: '11.222.333/0001-81', email: 'vendas@atlas.test' });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('Other budget secret'));
  assert.ok(html.includes('id="print-budget"'));
  assert.ok(!html.includes('onclick='));
  assert.ok(html.includes('Condições comerciais'));
  assert.ok(html.includes('Descrição &lt;segura&gt;'));
});

test('print uses saved client identity snapshot', () => {
  const client = [1, 'Pessoa Física', '529.982.247-25', 'Nome atual'];
  const budget = [1, 1, 'Nome atual', '01/09/2026', '30/09/2026', 10, { client: { tipo: 'Pessoa Jurídica', documento: '11.222.333/0001-81', nome: 'Nome histórico' } }];
  const html = createBudgetDocument(budget, client, [[1, 1, 'Produto', 1, 10, 10, '']], { nome: 'Atlas' });
  assert.match(html, /Nome histórico/);
  assert.match(html, /11\.222\.333\/0001-81/);
  assert.doesNotMatch(html, /Nome atual/);
});
