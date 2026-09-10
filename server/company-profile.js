const normalizeCnpj = (value) => String(value ?? '').trim().replace(/[.\-/\s]/g, '').toUpperCase();

export function validCnpj(value) {
  const document = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(document) || /^(\d)\1+$/.test(document)) return false;
  const digits = [...document].map((character) => character.charCodeAt(0) - 48);
  for (let position = 12; position < 14; position += 1) {
    const sum = digits.slice(0, position).reduce((total, digit, index) => total + digit * ((position - 1 - index) % 8 + 2), 0);
    const remainder = sum % 11;
    if (digits[position] !== (remainder < 2 ? 0 : 11 - remainder)) return false;
  }
  return true;
}

export const normalizeCompanyProfile = (profile) => Object.fromEntries(['nome', 'cnpj', 'endereco', 'telefone', 'email'].map((field) => [field, String(profile?.[field] || '').trim()]));

export function validateCompanyProfile(profile) {
  const value = normalizeCompanyProfile(profile);
  if (!value.nome || value.nome.length > 160) throw new Error('Informe o nome da empresa.');
  if (!validCnpj(value.cnpj)) throw new Error('Informe um CNPJ válido.');
  if (!value.endereco) throw new Error('Informe o endereço da empresa.');
  if (!value.telefone) throw new Error('Informe o telefone da empresa.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) throw new Error('Informe um e-mail válido.');
  return value;
}
