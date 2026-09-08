import { currentDate, money, validatePayload } from './validation.js';

const moneyDisplay = (value) => Number(value) / 100;
const revisionOf = (db) => Number(db.prepare("SELECT valor FROM atlas_meta WHERE chave='revision'").get().valor);

export function loadWorkspace(db) {
  const clientes = db.prepare('SELECT codigo,tipo,documento,nome FROM cliente ORDER BY codigo').all().map((row) => [row.codigo, row.tipo, row.documento, row.nome]);
  const categorias = db.prepare('SELECT codigo,descricao FROM categoria ORDER BY codigo').all().map((row) => [row.codigo, row.descricao]);
  const itens = db.prepare(`SELECT p.codigo,c.descricao categoria,p.nome,p.descricao,p.valor_venda,p.data_cadastro,p.status
    FROM produto p JOIN categoria c ON c.codigo=p.categoria_codigo ORDER BY p.codigo`).all().map((row) => [row.codigo, row.categoria, row.nome, row.descricao, moneyDisplay(row.valor_venda), row.data_cadastro, row.status]);
  const orcamentos = db.prepare(`SELECT o.codigo,o.cliente_codigo,c.nome,o.data_emissao,o.validade,coalesce(sum(i.quantidade*i.valor_unitario),0) total
    FROM orcamento o JOIN cliente c ON c.codigo=o.cliente_codigo LEFT JOIN item_orcamento i ON i.orcamento_codigo=o.codigo
    GROUP BY o.codigo,c.nome ORDER BY o.codigo`).all().map((row) => [row.codigo, row.cliente_codigo, row.nome, row.data_emissao, row.validade, moneyDisplay(row.total)]);
  const itensOrcamento = db.prepare(`SELECT orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario,quantidade*valor_unitario valor_total
    FROM item_orcamento ORDER BY orcamento_codigo,produto_codigo`).all().map((row) => [row.orcamento_codigo, row.produto_codigo, row.produto_nome, row.quantidade, moneyDisplay(row.valor_unitario), moneyDisplay(row.valor_total)]);
  const approved_codes = db.prepare('SELECT codigo FROM orcamento WHERE aprovado=1 ORDER BY codigo').all().map((row) => row.codigo);
  return { payload: { clientes, categorias, itens, orcamentos, itensOrcamento }, revision: revisionOf(db), approved_codes, empresa: db.prepare("SELECT valor FROM atlas_meta WHERE chave='empresa'").get().valor };
}

export function saveWorkspace(db, expectedRevision, payload, inTransaction = false, allowUnknownCodes = false) {
  validatePayload(db, payload, allowUnknownCodes);
  if (revisionOf(db) !== Number(expectedRevision)) return null;
  if (!inTransaction) db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM item_orcamento').run();
    const deleteMissing = (table, rows) => {
      const codes = rows.filter((row) => row[0] != null).map((row) => Number(row[0]));
      if (!codes.length) return db.prepare(`DELETE FROM ${table}`).run();
      return db.prepare(`DELETE FROM ${table} WHERE codigo NOT IN (${codes.map(() => '?').join(',')})`).run(...codes);
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
      if (row[0] == null) generatedBudget = Number(budgetInsert.run(row[1], currentDate(), row[4]).lastInsertRowid);
      else if (allowUnknownCodes && !db.prepare('SELECT 1 FROM orcamento WHERE codigo=?').get(row[0])) budgetInsertWithCode.run(row[0], row[1], row[3], row[4]);
      else budgetUpdate.run(row[1], row[4], row[0]);
    }
    const itemInsert = db.prepare('INSERT INTO item_orcamento(orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario) VALUES(?,?,?,?,?)');
    for (const row of payload.itensOrcamento) itemInsert.run(row[0] ?? generatedBudget, row[1], row[2], row[3], money(row[4]));
    if (db.prepare('SELECT 1 FROM orcamento o WHERE NOT EXISTS(SELECT 1 FROM item_orcamento i WHERE i.orcamento_codigo=o.codigo) LIMIT 1').get()) throw new Error('Orçamento exige ao menos um item.');
    db.prepare("UPDATE atlas_meta SET valor=CAST(CAST(valor AS INTEGER)+1 AS TEXT) WHERE chave='revision'").run();
    if (!inTransaction) db.exec('COMMIT');
    return loadWorkspace(db);
  } catch (error) {
    if (!inTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

export function approveWorkspace(db, expectedRevision, code) {
  if (revisionOf(db) !== Number(expectedRevision)) return null;
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare('UPDATE orcamento SET aprovado=1 WHERE codigo=? AND aprovado=0').run(code);
    if (!result.changes) throw new Error('Orçamento inexistente ou já aprovado.');
    db.prepare("UPDATE atlas_meta SET valor=CAST(CAST(valor AS INTEGER)+1 AS TEXT) WHERE chave='revision'").run();
    db.exec('COMMIT');
    return loadWorkspace(db);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function saveCompany(db, value) {
  const empresa = String(value || '').trim() || 'Atlas Máquinas & Obras';
  if (empresa.length > 160) throw new Error('Nome da empresa inválido.');
  db.prepare("UPDATE atlas_meta SET valor=? WHERE chave='empresa'").run(empresa);
  return empresa;
}
