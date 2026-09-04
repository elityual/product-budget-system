import test from 'node:test';
import assert from 'node:assert/strict';

import { getNextRecordCode } from '../assets/js/data.js';

test('gera código numérico depois do maior código existente', () => {
  assert.equal(getNextRecordCode([[1], [3], [2]]), 4);
});

test('gera código 1 para uma tabela vazia', () => {
  assert.equal(getNextRecordCode([]), 1);
});
