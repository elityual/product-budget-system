import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCpf, isValidDocument, validateRecord } from '../assets/js/validation.js';
import { createField } from '../assets/js/form.js';

test('valida CPF e CNPJ numéricos, com e sem pontuação, e seu tipo', () => {
  for (const value of ['529.982.247-25', '52998224725']) assert.ok(isValidDocument(value, 'Pessoa Física'));
  for (const value of ['11.222.333/0001-81', '11222333000181']) assert.ok(isValidDocument(value, 'Pessoa Jurídica'));
  for (const value of ['', '11111111111', '52998224724', '5299822472', 'abc52998224725']) assert.equal(isValidDocument(value, 'Pessoa Física'), false);
  for (const value of ['00000000000000', '11222333000182', '52998224725']) assert.equal(isValidDocument(value, 'Pessoa Jurídica'), false);
  assert.equal(isValidDocument('11222333000181', 'Pessoa Física'), false);
  assert.equal(isValidDocument('52998224725', 'Outro'), false);
});

test('normaliza documentos e bloqueia duplicidade sem bloquear o próprio cliente', () => {
  const rows = [[1, 'Pessoa Física', '529.982.247-25', 'Ana']];
  const input = { tipo: 'Pessoa Física', documento: '52998224725', nome: '  Ana  Silva ' };
  assert.ok(validateRecord('clientes', input, rows).errors.documento);
  const result = validateRecord('clientes', input, rows, 0);
  assert.deepEqual(result.errors, {});
  assert.equal(result.values.documento, '529.982.247-25');
  assert.equal(result.values.nome, 'Ana Silva');
  assert.equal(input.nome, '  Ana  Silva ');
  assert.ok(validateRecord('clientes', { ...input, nome: '  ' }, [], 0).errors.nome);
});

test('formata CPF completo e parcial sem truncar documentos inválidos', () => {
  assert.equal(formatCpf('52998224725'), '529.982.247-25');
  assert.equal(formatCpf('529.982.247-25'), '529.982.247-25');
  assert.equal(formatCpf('5299'), '529.9');
  assert.equal(formatCpf('5299822'), '529.982.2');
  assert.equal(formatCpf('5299822472'), '529.982.247-2');
  assert.equal(formatCpf(''), '');
  assert.equal(formatCpf('11222333000181'), '11222333000181');
  assert.equal(formatCpf('abc'), 'abc');
});

test('descrições são únicas na coleção, ignorando caixa e espaços, inclusive em edições', () => {
  for (const [page, rows] of [['categorias', [[1, 'Uma descrição'], [2, 'Outra']]], ['itens', [[1, 'Cat', 'Produto', 'Uma descrição'], [2, 'Cat', 'Produto', 'Outra']]]]) {
    const input = { descricao: ' UMA   descrição ', produto: 'Produto', valor: '1.00' };
    assert.ok(validateRecord(page, input, rows).errors.descricao);
    assert.ok(validateRecord(page, input, rows, 1).errors.descricao);
    assert.equal(validateRecord(page, input, rows, 0).errors.descricao, undefined);
    assert.ok(validateRecord(page, { ...input, descricao: '  ' }, rows).errors.descricao);
  }
});

test('preço deve ser finito, positivo e ter até duas casas decimais', () => {
  for (const valor of ['', ' ', '0', '-1', 'NaN', 'Infinity', '1.001', '1,50', '1e3']) {
    assert.ok(validateRecord('itens', { produto: 'Nome', descricao: 'Descrição', valor }, []).errors.valor, valor);
  }
  for (const valor of ['0.01', '1', '42.90']) {
    const result = validateRecord('itens', { produto: 'Nome', descricao: 'Descrição', valor }, []);
    assert.deepEqual(result.errors, {});
    assert.equal(result.values.valor, Number(valor));
  }
  assert.match(createField(['valor', 'Valor', 'number'], []), /min="0.01"/);
});

test('CNPJ alfanumérico segue o exemplo oficial e preserva os dois DVs numéricos', () => {
  for (const value of ['12.ABC.345/01DE-35', '12abc34501de35']) {
    assert.ok(isValidDocument(value, 'Pessoa Jurídica'));
    assert.equal(isValidDocument(value, 'Pessoa Física'), false);
  }
  for (const value of ['12ABC34501DE34', '12ABC34501DE3A', '12ABC34501DEAA', '12ÁBC34501DE35', '12ABC34501DE350']) {
    assert.equal(isValidDocument(value, 'Pessoa Jurídica'), false, value);
  }
});

test('CNPJ usa máscara progressiva e duplicidade ignora caixa e pontuação', async () => {
  const { formatCnpj } = await import('../assets/js/validation.js');
  assert.equal(formatCnpj('12abc34501de35'), '12.ABC.345/01DE-35');
  assert.equal(formatCnpj('11222333000181'), '11.222.333/0001-81');
  assert.equal(formatCnpj('12.ABC.345/01DE-35'), '12.ABC.345/01DE-35');
  assert.equal(formatCnpj('12a'), '12.A');
  assert.equal(formatCnpj('12abc3'), '12.ABC.3');
  assert.equal(formatCnpj('12abc3450'), '12.ABC.345/0');
  assert.equal(formatCnpj('12abc34501de3'), '12.ABC.345/01DE-3');
  assert.equal(formatCnpj(''), '');
  assert.equal(formatCnpj('12ABC34501DE350'), '12ABC34501DE350');
  const input = { tipo: 'Pessoa Jurídica', documento: '12abc34501de35', nome: 'Empresa' };
  const rows = [[1, input.tipo, '12.ABC.345/01DE-35', input.nome]];
  assert.ok(validateRecord('clientes', input, rows).errors.documento);
  const result = validateRecord('clientes', input, rows, 0);
  assert.deepEqual(result.errors, {});
  assert.equal(result.values.documento, '12.ABC.345/01DE-35');
});
