import { isValidDocument } from './validation.js';

export function validateCompanyProfile(profile) {
  const value = Object.fromEntries(['nome', 'cnpj', 'endereco', 'telefone', 'email'].map((field) => [field, String(profile?.[field] || '').trim()]));
  const errors = {};
  if (!value.nome || value.nome.length > 160) errors.nome = 'Informe o nome da empresa.';
  if (!isValidDocument(value.cnpj, 'Pessoa Jurídica')) errors.cnpj = 'Informe um CNPJ válido.';
  if (!value.endereco) errors.endereco = 'Informe o endereço da empresa.';
  if (!value.telefone) errors.telefone = 'Informe o telefone da empresa.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) errors.email = 'Informe um e-mail válido.';
  return { value, errors, complete: Object.keys(errors).length === 0 };
}
