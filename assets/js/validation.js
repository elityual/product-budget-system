const normalizeText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const comparisonKey = (value) => normalizeText(value).toLocaleLowerCase('pt-BR');

export function normalizeDocument(value) {
  return String(value ?? '').trim().replace(/[.\-/\s]/g, '').toUpperCase();
}

export function formatCpf(value) {
  const digits = normalizeDocument(value);
  if (!/^\d{0,11}$/.test(digits)) return String(value ?? '');
  return digits.replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, '$1-$2');
}

export function isValidDocument(value, type) {
  const document = normalizeDocument(value);
  const length = type === 'Pessoa Física' ? 11 : type === 'Pessoa Jurídica' ? 14 : 0;
  const pattern = length === 11 ? /^\d{11}$/ : /^[A-Z0-9]{12}\d{2}$/;
  if (!length || !pattern.test(document) || /^(\d)\1+$/.test(document)) {
    return false;
  }
  const digits = [...document].map((character) => character.charCodeAt(0) - 48);
  for (let position = length - 2; position < length; position += 1) {
    const sum = digits.slice(0, position).reduce((total, digit, index) => {
      const weight = length === 11 ? position + 1 - index : (position - 1 - index) % 8 + 2;
      return total + digit * weight;
    }, 0);
    const remainder = sum % 11;
    if (digits[position] !== (remainder < 2 ? 0 : 11 - remainder)) return false;
  }
  return true;
}

export function formatCnpj(value) {
  const characters = normalizeDocument(value);
  if (!/^[A-Z0-9]{0,12}\d{0,2}$/.test(characters) || characters.length > 14) {
    return String(value ?? '').toUpperCase();
  }
  return characters.replace(/^([A-Z0-9]{2})([A-Z0-9])/, '$1.$2')
    .replace(/^([A-Z0-9]{2}\.[A-Z0-9]{3})([A-Z0-9])/, '$1.$2')
    .replace(/^([A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3})([A-Z0-9])/, '$1/$2')
    .replace(/^([A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4})(\d)/, '$1-$2');
}

// Retorna campos normalizados sem alterar a entrada nem os registros armazenados.
export function validateRecord(page, input, records, editingIndex) {
  const values = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, normalizeText(value)]));
  const errors = {};
  const duplicate = (column, value, normalize = comparisonKey) => records.some(
    (row, index) => index !== editingIndex && normalize(row[column]) === normalize(value)
  );
  if (page === 'clientes') {
    values.documento = normalizeDocument(values.documento);
    if (!isValidDocument(values.documento, values.tipo)) {
      errors.documento = 'Informe um CPF válido ou CNPJ numérico/alfanumérico válido para o tipo de cliente selecionado.';
    } else if (duplicate(2, values.documento, normalizeDocument)) {
      errors.documento = 'Já existe um cliente com este documento.';
    }
    if (!values.nome) errors.nome = 'Informe o nome do cliente.';
    if (!errors.documento) {
      values.documento = values.tipo === 'Pessoa Física'
        ? formatCpf(values.documento) : formatCnpj(values.documento);
    }
  }
  if (page === 'categorias' || page === 'itens') {
    if (!values.descricao) errors.descricao = 'Informe a descrição.';
    else if (duplicate(page === 'categorias' ? 1 : 3, values.descricao)) {
      errors.descricao = 'Já existe um registro com esta descrição.';
    }
  }
  if (page === 'itens') {
    if (!values.produto) errors.produto = 'Informe o nome do produto.';
    const price = Number(values.valor);
    if (!/^\d+(?:\.\d{1,2})?$/.test(values.valor) || !Number.isFinite(price) || price <= 0) {
      errors.valor = 'Informe um valor maior que zero com até duas casas decimais.';
    } else values.valor = price;
  }
  return { values, errors };
}
