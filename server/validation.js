export const emptyPayload = () => ({ clientes: [], categorias: [], itens: [], orcamentos: [], itensOrcamento: [] });

export function currentDate() {
  return new Intl.DateTimeFormat('pt-BR').format(new Date());
}

export function validDate(value) {
  const text = String(value ?? '').trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text) || /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const day = text.includes('/') ? Number(match[1]) : Number(match[3]);
  const month = Number(match[2]);
  const year = text.includes('/') ? Number(match[3]) : Number(match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function money(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Valor de venda inválido.');
  const [whole, fraction = ''] = text.split('.');
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Valor de venda inválido.');
  return Number(cents);
}

export function validatePayload(db, payload, allowUnknownCodes = false) {
  const sizes = { clientes: 4, categorias: 2, itens: 7, orcamentos: 6, itensOrcamento: 6 };
  for (const [collection, size] of Object.entries(sizes)) {
    if (!Array.isArray(payload?.[collection])) throw new Error(`Coleção inválida: ${collection}.`);
    for (const row of payload[collection]) if (!Array.isArray(row) || row.length !== size) throw new Error(`Linha inválida em ${collection}.`);
  }
  for (const row of payload.orcamentos) {
    if (!Number.isInteger(Number(row[1])) || Number(row[1]) <= 0 || typeof row[2] !== 'string' || !row[2].trim()) throw new Error('O orçamento deve usar código do cliente antes do nome.');
    if (!validDate(row[3]) || !validDate(row[4])) throw new Error('Data de orçamento inválida.');
  }
  for (const row of payload.clientes) if (!['Pessoa Física', 'Pessoa Jurídica'].includes(row[1]) || !String(row[2] ?? '').trim() || !String(row[3] ?? '').trim()) throw new Error('Cliente inválido.');
  const documents = payload.clientes.map((row) => String(row[2]).replace(/[^a-z0-9]/gi, '').toLocaleUpperCase('pt-BR'));
  if (new Set(documents).size !== documents.length) throw new Error('Documento de cliente repetido.');
  for (const row of payload.categorias) if (!String(row[1] ?? '').trim()) throw new Error('Categoria inválida.');
  const categories = payload.categorias.map((row) => String(row[1]).trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR'));
  if (new Set(categories).size !== categories.length) throw new Error('Categoria repetida.');
  for (const row of payload.itens) {
    if (!String(row[1] ?? '').trim() || !String(row[2] ?? '').trim() || !String(row[3] ?? '').trim() || !validDate(row[5]) || !['Ativo', 'Inativo'].includes(row[6])) throw new Error('Produto inválido.');
    money(row[4]);
  }
  const products = payload.itens.map((row) => String(row[3]).trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR'));
  if (new Set(products).size !== products.length) throw new Error('Produto repetido.');
  for (const [collection, table] of [['clientes', 'cliente'], ['categorias', 'categoria'], ['itens', 'produto'], ['orcamentos', 'orcamento']]) {
    const codes = payload[collection].map((row) => row[0]).filter((code) => code != null);
    if (codes.some((code) => !Number.isInteger(Number(code)) || Number(code) <= 0) || new Set(codes.map(Number)).size !== codes.length) throw new Error(`Código inválido ou repetido em ${collection}.`);
    if (!allowUnknownCodes) for (const code of codes) if (!db.prepare(`SELECT 1 FROM ${table} WHERE codigo=?`).get(Number(code))) throw new Error('Códigos existentes devem ser gerados pelo banco.');
  }
  if (payload.orcamentos.filter((row) => row[0] == null).length > 1) throw new Error('Salve um orçamento novo por vez.');
  for (const row of payload.itensOrcamento) {
    if ((row[0] != null && (!Number.isInteger(Number(row[0])) || Number(row[0]) <= 0)) || row[1] == null || !Number.isInteger(Number(row[1])) || Number(row[1]) <= 0 || !String(row[2] ?? '').trim() || !Number.isInteger(Number(row[3])) || Number(row[3]) <= 0) throw new Error('Item de orçamento inválido.');
    money(row[4]);
  }
}
