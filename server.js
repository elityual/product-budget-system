import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readdir, unlink, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8765);
const dataRoot = process.env.ATLAS_DATA_DIR
  || join(process.env.LOCALAPPDATA || join(root, '.local-data'), 'ProductBudgetControl');
const databasePath = join(dataRoot, 'atlas.sqlite');
const token = randomBytes(24).toString('hex');
const emptyPayload = () => ({ clientes: [], categorias: [], itens: [], orcamentos: [], itensOrcamento: [] });

await mkdir(dataRoot, { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
  CREATE TABLE IF NOT EXISTS atlas_meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  INSERT INTO atlas_meta(chave, valor) VALUES ('revision', '0') ON CONFLICT(chave) DO NOTHING;
  INSERT INTO atlas_meta(chave, valor) VALUES ('empresa', 'Atlas Máquinas & Obras') ON CONFLICT(chave) DO NOTHING;
  CREATE TABLE IF NOT EXISTS cliente (
    codigo INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, documento TEXT NOT NULL CHECK(trim(documento) <> ''), nome TEXT NOT NULL CHECK(trim(nome) <> '')
  );
  CREATE UNIQUE INDEX IF NOT EXISTS cliente_documento_unico ON cliente(upper(replace(replace(replace(replace(replace(replace(documento,'.',''),'-',''),'/',''),'(',''),')',''),' ','')));
  CREATE TABLE IF NOT EXISTS categoria (codigo INTEGER PRIMARY KEY AUTOINCREMENT, descricao TEXT NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS categoria_descricao_unica ON categoria(lower(trim(descricao)));
  CREATE TABLE IF NOT EXISTS produto (
    codigo INTEGER PRIMARY KEY AUTOINCREMENT, categoria_codigo INTEGER NOT NULL REFERENCES categoria(codigo),
    nome TEXT NOT NULL, descricao TEXT NOT NULL, valor_venda INTEGER NOT NULL CHECK(valor_venda > 0),
    data_cadastro TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('Ativo','Inativo'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS produto_descricao_unica ON produto(lower(trim(descricao)));
  CREATE TABLE IF NOT EXISTS orcamento (
    codigo INTEGER PRIMARY KEY AUTOINCREMENT, cliente_codigo INTEGER NOT NULL REFERENCES cliente(codigo),
    data_emissao TEXT NOT NULL, validade TEXT NOT NULL, aprovado INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS item_orcamento (
    orcamento_codigo INTEGER NOT NULL REFERENCES orcamento(codigo) ON DELETE CASCADE,
    produto_codigo INTEGER NOT NULL REFERENCES produto(codigo), produto_nome TEXT NOT NULL,
    quantidade INTEGER NOT NULL CHECK(quantidade > 0), valor_unitario INTEGER NOT NULL CHECK(valor_unitario > 0),
    PRIMARY KEY (orcamento_codigo, produto_codigo)
  );
`);

function currentDate() {
  return new Intl.DateTimeFormat('pt-BR').format(new Date());
}

function validDate(value) {
  const text = String(value ?? '').trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text) || /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const day = text.includes('/') ? Number(match[1]) : Number(match[3]);
  const month = text.includes('/') ? Number(match[2]) : Number(match[2]);
  const year = text.includes('/') ? Number(match[3]) : Number(match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function money(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new Error('Valor de venda inválido.');
  }
  const [whole, fraction = ''] = text.split('.');
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Valor de venda inválido.');
  }
  return Number(cents);
}

function moneyDisplay(value) { return Number(value) / 100; }

function loadPayload() {
  const clientes = db.prepare('SELECT codigo,tipo,documento,nome FROM cliente ORDER BY codigo').all()
    .map((r) => [r.codigo, r.tipo, r.documento, r.nome]);
  const categorias = db.prepare('SELECT codigo,descricao FROM categoria ORDER BY codigo').all()
    .map((r) => [r.codigo, r.descricao]);
  const itens = db.prepare(`SELECT p.codigo,c.descricao categoria,p.nome,p.descricao,p.valor_venda,p.data_cadastro,p.status
    FROM produto p JOIN categoria c ON c.codigo=p.categoria_codigo ORDER BY p.codigo`).all()
    .map((r) => [r.codigo, r.categoria, r.nome, r.descricao, moneyDisplay(r.valor_venda), r.data_cadastro, r.status]);
  const orcamentos = db.prepare(`SELECT o.codigo,o.cliente_codigo,c.nome,o.data_emissao,o.validade,
    coalesce(sum(i.quantidade*i.valor_unitario),0) total
    FROM orcamento o JOIN cliente c ON c.codigo=o.cliente_codigo
    LEFT JOIN item_orcamento i ON i.orcamento_codigo=o.codigo
    GROUP BY o.codigo,c.nome ORDER BY o.codigo`).all()
    .map((r) => [r.codigo, r.cliente_codigo, r.nome, r.data_emissao, r.validade, moneyDisplay(r.total)]);
  const itensOrcamento = db.prepare(`SELECT orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario,
    quantidade*valor_unitario valor_total FROM item_orcamento ORDER BY orcamento_codigo,produto_codigo`).all()
    .map((r) => [r.orcamento_codigo, r.produto_codigo, r.produto_nome, r.quantidade, moneyDisplay(r.valor_unitario), moneyDisplay(r.valor_total)]);
  const approved = db.prepare('SELECT codigo FROM orcamento WHERE aprovado=1 ORDER BY codigo').all().map((r) => r.codigo);
  return { payload: { clientes, categorias, itens, orcamentos, itensOrcamento }, revision: Number(db.prepare("SELECT valor FROM atlas_meta WHERE chave='revision'").get().valor), approved_codes: approved, empresa: db.prepare("SELECT valor FROM atlas_meta WHERE chave='empresa'").get().valor };
}

function validatePayload(payload, allowUnknownCodes = false) {
  const sizes = { clientes: 4, categorias: 2, itens: 7, orcamentos: 6, itensOrcamento: 6 };
  for (const [collection, size] of Object.entries(sizes)) {
    if (!Array.isArray(payload?.[collection])) throw new Error(`Coleção inválida: ${collection}.`);
    for (const row of payload[collection]) {
      if (!Array.isArray(row) || row.length !== size) throw new Error(`Linha inválida em ${collection}.`);
    }
  }
  for (const row of payload.orcamentos) {
    if (!Number.isInteger(Number(row[1])) || Number(row[1]) <= 0 || typeof row[2] !== 'string' || !row[2].trim()) {
      throw new Error('O orçamento deve usar código do cliente antes do nome.');
    }
  }
  for (const row of payload.clientes) {
    if (!['Pessoa Física', 'Pessoa Jurídica'].includes(row[1]) || !String(row[2] ?? '').trim() || !String(row[3] ?? '').trim()) {
      throw new Error('Cliente inválido.');
    }
  }
  for (const row of payload.categorias) {
    if (!String(row[1] ?? '').trim()) throw new Error('Categoria inválida.');
  }
  const normalizedCategories = payload.categorias.map((row) => String(row[1]).trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR'));
  if (new Set(normalizedCategories).size !== normalizedCategories.length) throw new Error('Categoria repetida.');
  for (const row of payload.itens) {
    if (!String(row[1] ?? '').trim() || !String(row[2] ?? '').trim() || !String(row[3] ?? '').trim() || !validDate(row[5]) || !['Ativo', 'Inativo'].includes(row[6])) {
      throw new Error('Produto inválido.');
    }
    money(row[4]);
  }
  const normalizedProducts = payload.itens.map((row) => String(row[3]).trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR'));
  if (new Set(normalizedProducts).size !== normalizedProducts.length) throw new Error('Produto repetido.');
  const normalizedDocuments = payload.clientes.map((row) => String(row[2]).replace(/[^a-z0-9]/gi, '').toLocaleUpperCase('pt-BR'));
  if (new Set(normalizedDocuments).size !== normalizedDocuments.length) throw new Error('Documento de cliente repetido.');
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
  for (const row of payload.orcamentos) {
    if (!validDate(row[3]) || !validDate(row[4])) throw new Error('Data de orçamento inválida.');
  }
}

function savePayload(expectedRevision, payload, alreadyInTransaction = false, allowUnknownCodes = false) {
  validatePayload(payload, allowUnknownCodes);
  const actual = Number(db.prepare("SELECT valor FROM atlas_meta WHERE chave='revision'").get().valor);
  if (actual !== Number(expectedRevision)) return null;
  if (!alreadyInTransaction) db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM item_orcamento').run();
    const keep = (rows) => rows.filter((row) => row[0] != null).map((row) => Number(row[0]));
    const deleteMissing = (table, rows) => {
      const codes = keep(rows);
      if (!codes.length) return db.prepare(`DELETE FROM ${table}`).run();
      db.prepare(`DELETE FROM ${table} WHERE codigo NOT IN (${codes.map(() => '?').join(',')})`).run(...codes);
    };
    deleteMissing('orcamento', payload.orcamentos);
    deleteMissing('produto', payload.itens);
    deleteMissing('categoria', payload.categorias);
    deleteMissing('cliente', payload.clientes);
    const clientInsert = db.prepare('INSERT INTO cliente(tipo,documento,nome) VALUES(?,?,?)');
    const clientInsertWithCode = db.prepare('INSERT INTO cliente(codigo,tipo,documento,nome) VALUES(?,?,?,?)');
    const clientUpdate = db.prepare('UPDATE cliente SET tipo=?,documento=?,nome=? WHERE codigo=?');
    for (const row of payload.clientes) {
      if (row[0] == null) clientInsert.run(row[1], row[2], row[3]);
      else if (allowUnknownCodes && !db.prepare('SELECT 1 FROM cliente WHERE codigo=?').get(row[0])) clientInsertWithCode.run(row[0], row[1], row[2], row[3]);
      else clientUpdate.run(row[1], row[2], row[3], row[0]);
    }
    const categoryInsert = db.prepare('INSERT INTO categoria(descricao) VALUES(?)');
    const categoryInsertWithCode = db.prepare('INSERT INTO categoria(codigo,descricao) VALUES(?,?)');
    const categoryUpdate = db.prepare('UPDATE categoria SET descricao=? WHERE codigo=?');
    for (const row of payload.categorias) {
      if (row[0] == null) categoryInsert.run(row[1]);
      else if (allowUnknownCodes && !db.prepare('SELECT 1 FROM categoria WHERE codigo=?').get(row[0])) categoryInsertWithCode.run(row[0], row[1]);
      else categoryUpdate.run(row[1], row[0]);
    }
    const categoryCode = db.prepare('SELECT codigo FROM categoria WHERE lower(trim(descricao))=lower(trim(?))');
    const productInsert = db.prepare('INSERT INTO produto(categoria_codigo,nome,descricao,valor_venda,data_cadastro,status) VALUES(?,?,?,?,?,?)');
    const productInsertWithCode = db.prepare('INSERT INTO produto(codigo,categoria_codigo,nome,descricao,valor_venda,data_cadastro,status) VALUES(?,?,?,?,?,?,?)');
    const productUpdate = db.prepare('UPDATE produto SET categoria_codigo=?,nome=?,descricao=?,valor_venda=?,status=? WHERE codigo=?');
    for (const row of payload.itens) {
      const category = categoryCode.get(row[1]);
      if (!category) throw new Error('Categoria de produto inexistente.');
      const value = money(row[4]);
      if (row[0] == null) productInsert.run(category.codigo, row[2], row[3], value, currentDate(), row[6]);
      else if (allowUnknownCodes && !db.prepare('SELECT 1 FROM produto WHERE codigo=?').get(row[0])) productInsertWithCode.run(row[0], category.codigo, row[2], row[3], value, row[5], row[6]);
      else productUpdate.run(category.codigo, row[2], row[3], value, row[6], row[0]);
    }
    const budgetInsert = db.prepare('INSERT INTO orcamento(cliente_codigo,data_emissao,validade,aprovado) VALUES(?,?,?,0)');
    const budgetInsertWithCode = db.prepare('INSERT INTO orcamento(codigo,cliente_codigo,data_emissao,validade,aprovado) VALUES(?,?,?, ?,0)');
    const budgetUpdate = db.prepare('UPDATE orcamento SET cliente_codigo=?,validade=? WHERE codigo=?');
    let generatedBudget = null;
    for (const row of payload.orcamentos) {
      if (row[0] == null) { generatedBudget = Number(budgetInsert.run(row[1], currentDate(), row[4]).lastInsertRowid); }
      else if (allowUnknownCodes && !db.prepare('SELECT 1 FROM orcamento WHERE codigo=?').get(row[0])) budgetInsertWithCode.run(row[0], row[1], row[3], row[4]);
      else budgetUpdate.run(row[1], row[4], row[0]);
    }
    const itemInsert = db.prepare('INSERT INTO item_orcamento(orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario) VALUES(?,?,?,?,?)');
    for (const row of payload.itensOrcamento) itemInsert.run(row[0] ?? generatedBudget, row[1], row[2], row[3], money(row[4]));
    const missing = db.prepare('SELECT 1 FROM orcamento o WHERE NOT EXISTS(SELECT 1 FROM item_orcamento i WHERE i.orcamento_codigo=o.codigo) LIMIT 1').get();
    if (missing) throw new Error('Orçamento exige ao menos um item.');
    db.prepare("UPDATE atlas_meta SET valor=CAST(CAST(valor AS INTEGER)+1 AS TEXT) WHERE chave='revision'").run();
    if (!alreadyInTransaction) db.exec('COMMIT');
    return loadPayload();
  } catch (error) { if (!alreadyInTransaction) db.exec('ROLLBACK'); throw error; }
}

function approveBudget(expectedRevision, code) {
  const actual = Number(db.prepare("SELECT valor FROM atlas_meta WHERE chave='revision'").get().valor);
  if (actual !== Number(expectedRevision)) return null;
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare('UPDATE orcamento SET aprovado=1 WHERE codigo=? AND aprovado=0').run(code);
    if (!result.changes) throw new Error('Orçamento inexistente ou já aprovado.');
    db.prepare("UPDATE atlas_meta SET valor=CAST(CAST(valor AS INTEGER)+1 AS TEXT) WHERE chave='revision'").run();
    db.exec('COMMIT');
    return loadPayload();
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(body));
}

async function backup() {
  const result = loadPayload();
  return { schema_version: 1, empresa: db.prepare("SELECT valor FROM atlas_meta WHERE chave='empresa'").get().valor, ...result };
}

async function automaticBackup() {
  try {
    const directory = join(dataRoot, 'backups');
    await mkdir(directory, { recursive: true });
    const file = join(directory, `${new Date().toISOString().slice(0, 10)}.json`);
    await writeFile(file, JSON.stringify(await backup(), null, 2), 'utf8');
    const files = (await readdir(directory)).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().reverse();
    for (const old of files.slice(7)) await unlink(join(directory, old)).catch(() => {});
  } catch { /* O banco continua disponível se o backup automático falhar. */ }
}

async function restore(body) {
  if (body.schema_version !== 1) throw new Error('Versão de backup incompatível.');
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new Error('Revisão de backup inválida.');
  if (!Array.isArray(body.approved_codes) || body.approved_codes.some((code) => !Number.isSafeInteger(code) || code <= 0) || new Set(body.approved_codes).size !== body.approved_codes.length) {
    throw new Error('Lista de aprovações inválida.');
  }
  if (typeof body.empresa !== 'string' || body.empresa.trim().length > 160) throw new Error('Nome da empresa inválido.');
  validatePayload(body.payload, true);
  const budgetCodes = new Set(body.payload.orcamentos.map((row) => row[0]).filter((code) => code != null).map(Number));
  if (body.approved_codes.some((code) => !budgetCodes.has(Number(code)))) throw new Error('Aprovação não corresponde a um orçamento do backup.');
  const recoveryDirectory = join(dataRoot, 'backups');
  await mkdir(recoveryDirectory, { recursive: true });
  await writeFile(join(recoveryDirectory, `antes-restaurar-${Date.now()}.json`), JSON.stringify(await backup(), null, 2), 'utf8');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("UPDATE atlas_meta SET valor=? WHERE chave='empresa'").run(String(body.empresa || 'Atlas Máquinas & Obras'));
    db.prepare('DELETE FROM item_orcamento').run();
    db.prepare('DELETE FROM orcamento').run();
    db.prepare('DELETE FROM produto').run();
    db.prepare('DELETE FROM categoria').run();
    db.prepare('DELETE FROM cliente').run();
    const currentRevision = Number(db.prepare("SELECT valor FROM atlas_meta WHERE chave='revision'").get().valor);
    savePayload(currentRevision, body.payload, true, true);
    for (const code of body.approved_codes || []) db.prepare('UPDATE orcamento SET aprovado=1 WHERE codigo=?').run(code);
    const restoredRevision = Math.max(
      Number(db.prepare("SELECT valor FROM atlas_meta WHERE chave='revision'").get().valor),
      Number(body.revision)
    );
    db.prepare("UPDATE atlas_meta SET valor=? WHERE chave='revision'").run(String(restoredRevision));
    db.exec('COMMIT');
    return loadPayload();
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
async function staticFile(pathname, response) {
  if (pathname !== '/' && pathname !== '/index.html' && !pathname.startsWith('/assets/')) return json(response, 404, { error: 'Arquivo não encontrado.' });
  const target = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (relative(root, target).startsWith('..')) return json(response, 404, { error: 'Arquivo não encontrado.' });
  try { const info = await stat(target); if (!info.isFile()) throw new Error(); response.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https:; object-src 'none'; base-uri 'none'", 'X-Content-Type-Options': 'nosniff' }); createReadStream(target).pipe(response); }
  catch { json(response, 404, { error: 'Arquivo não encontrado.' }); }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/status' && request.method === 'GET') return json(response, 200, { mode: 'local', token, empresa: db.prepare("SELECT valor FROM atlas_meta WHERE chave='empresa'").get().valor });
      if (request.headers['x-atlas-token'] !== token) return json(response, 401, { error: 'Sessão local inválida.' });
      if (url.pathname === '/api/load' && request.method === 'GET') return json(response, 200, loadPayload());
      if (url.pathname === '/api/save' && request.method === 'POST') { const body = await readJson(request); return json(response, 200, savePayload(body.expected_revision, body.payload)); }
      if (url.pathname === '/api/approve' && request.method === 'POST') { const body = await readJson(request); return json(response, 200, approveBudget(body.expected_revision, body.code)); }
      if (url.pathname === '/api/backup' && request.method === 'GET') return json(response, 200, await backup(), { 'Content-Disposition': 'attachment; filename="atlas-backup.json"' });
      if (url.pathname === '/api/restore' && request.method === 'POST') return json(response, 200, await restore(await readJson(request)));
      if (url.pathname === '/api/company' && request.method === 'POST') {
        const body = await readJson(request);
        const empresa = String(body.empresa || '').trim() || 'Atlas Máquinas & Obras';
        if (empresa.length > 160) throw new Error('Nome da empresa inválido.');
        db.prepare("UPDATE atlas_meta SET valor=? WHERE chave='empresa'").run(empresa);
        return json(response, 200, { empresa });
      }
      return json(response, 404, { error: 'Rota não encontrada.' });
    }
    return staticFile(url.pathname, response);
  } catch (error) { json(response, 400, { error: error.message || 'Não foi possível concluir a operação.' }); }
});

await automaticBackup();
server.listen(port, '127.0.0.1', () => console.log(`Atlas disponível em http://127.0.0.1:${port}`));
