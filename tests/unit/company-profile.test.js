import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCompanyProfile as validateBrowser } from '../../assets/js/company-profile.js';
import { validateCompanyProfile as validateServer } from '../../server/company-profile.js';

const complete = { nome: 'Empresa', cnpj: '11.222.333/0001-81', endereco: 'Rua A', telefone: '11999990000', email: 'empresa@example.test' };

test('perfil completo usa a mesma regra no navegador e SQLite', () => {
  assert.equal(validateBrowser(complete).complete, true);
  assert.deepEqual(validateServer(complete), complete);
  for (const field of ['nome', 'cnpj', 'endereco', 'telefone', 'email']) {
    const invalid = { ...complete, [field]: '' };
    assert.equal(validateBrowser(invalid).complete, false);
    assert.throws(() => validateServer(invalid));
  }
  assert.equal(validateBrowser({ ...complete, cnpj: '11.222.333/0001-82' }).complete, false);
  assert.throws(() => validateServer({ ...complete, email: 'inválido' }));
});
