import test from 'node:test';
import assert from 'node:assert/strict';

import { createField } from '../assets/js/form.js';

test('cria tipo de cliente como dropdown sem pesquisa', () => {
  const field = createField(
    ['tipo', 'Tipo de cliente', 'dropdown', 'Pessoa Física,Pessoa Jurídica'],
    []
  );

  assert.match(field, /data-dropdown/);
  assert.match(field, /name="tipo"/);
  assert.match(field, /Pessoa Física/);
  assert.match(field, /Pessoa Jurídica/);
  assert.doesNotMatch(field, /type="text"/);
  assert.doesNotMatch(field, /<select/);
});
