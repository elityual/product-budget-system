import { currentDate, money, validatePayload } from './validation.js';
import { validateCompanyProfile } from './company-profile.js';

const moneyDisplay = (value) => Number(value) / 100;
const revisionOf = (db) => Number(db.prepare("SELECT valor FROM atlas_meta WHERE chave='revision'").get().valor);
const informationDetails = (row) => {
  const details = {};
  if (row.pagamento) details.pagamento = row.pagamento;
  if (row.prazo_entrega) details.entrega = row.prazo_entrega;
  if (row.local_entrega) details.localEntrega = row.local_entrega;
  if (row.observacoes) details.observacoes = row.observacoes;
  const company = { nome: row.empresa_nome, cnpj: row.empresa_cnpj, endereco: row.empresa_endereco, telefone: row.empresa_telefone, email: row.empresa_email };
  if (Object.values(company).some(Boolean)) details.company = company;
  const client = { tipo: row.cliente_tipo, documento: row.cliente_documento, nome: row.cliente_nome, email: row.cliente_email, contato: row.cliente_pessoa_contato, telefone: row.cliente_telefone, endereco: row.cliente_endereco };
  if (Object.values(client).some(Boolean)) details.client = client;
  return details;
};

export function loadWorkspace(db) {
  const clientes = db.prepare('SELECT codigo,tipo,documento,nome FROM cliente ORDER BY codigo').all().map((row) => [row.codigo, row.tipo, row.documento, row.nome]);
  const contatosClientes = db.prepare('SELECT cliente_codigo,email,pessoa_contato FROM cliente_contato ORDER BY cliente_codigo').all().map((row) => [row.cliente_codigo,row.email,row.pessoa_contato]);
  const telefonesClientes = db.prepare('SELECT codigo,cliente_codigo,telefone,principal FROM cliente_telefone ORDER BY cliente_codigo,codigo').all().map((row) => [row.codigo,row.cliente_codigo,row.telefone,Boolean(row.principal)]);
  const enderecosClientes = db.prepare('SELECT codigo,cliente_codigo,cep,logradouro,numero,complemento,bairro,cidade,uf,texto_legado,principal FROM cliente_endereco ORDER BY cliente_codigo,codigo').all().map((row) => [row.codigo,row.cliente_codigo,row.cep,row.logradouro,row.numero,row.complemento,row.bairro,row.cidade,row.uf,row.texto_legado,Boolean(row.principal)]);
  const categorias = db.prepare('SELECT codigo,descricao FROM categoria ORDER BY codigo').all().map((row) => [row.codigo, row.descricao]);
  const itens = db.prepare(`SELECT p.codigo,c.descricao categoria,p.nome,p.descricao,p.valor_venda,p.data_cadastro,p.status
    FROM produto p JOIN categoria c ON c.codigo=p.categoria_codigo ORDER BY p.codigo`).all().map((row) => [row.codigo, row.categoria, row.nome, row.descricao, moneyDisplay(row.valor_venda), row.data_cadastro, row.status]);
  const orcamentos = db.prepare(`SELECT o.codigo,o.cliente_codigo,c.nome,o.data_emissao,o.validade,coalesce(sum(i.quantidade*i.valor_unitario),0) total,
    info.pagamento,info.prazo_entrega,info.local_entrega,info.observacoes,info.empresa_nome,info.empresa_cnpj,info.empresa_endereco,info.empresa_telefone,info.empresa_email,
    info.cliente_tipo,info.cliente_documento,info.cliente_nome,info.cliente_email,info.cliente_pessoa_contato,info.cliente_telefone,info.cliente_endereco
    FROM orcamento o JOIN cliente c ON c.codigo=o.cliente_codigo LEFT JOIN item_orcamento i ON i.orcamento_codigo=o.codigo
    LEFT JOIN orcamento_informacao info ON info.orcamento_codigo=o.codigo
  GROUP BY o.codigo,c.nome ORDER BY o.codigo`).all().map((row) => [row.codigo, row.cliente_codigo, row.nome, row.data_emissao, row.validade, moneyDisplay(row.total), informationDetails(row)]);
  const itensOrcamento = db.prepare(`SELECT orcamento_codigo,produto_codigo,produto_nome,produto_descricao,quantidade,valor_unitario,quantidade*valor_unitario valor_total
    FROM item_orcamento ORDER BY orcamento_codigo,produto_codigo`).all().map((row) => [row.orcamento_codigo, row.produto_codigo, row.produto_nome, row.quantidade, moneyDisplay(row.valor_unitario), moneyDisplay(row.valor_total), row.produto_descricao]);
  const approved_codes = db.prepare('SELECT codigo FROM orcamento WHERE aprovado=1 ORDER BY codigo').all().map((row) => row.codigo);
  const company = db.prepare('SELECT nome,cnpj,endereco,telefone,email,completo FROM empresa_perfil WHERE codigo=1').get();
  const empresa = { nome: company.nome, cnpj: company.cnpj, endereco: company.endereco, telefone: company.telefone, email: company.email, completo: Boolean(company.completo) };
  return { payload: { clientes, contatosClientes, telefonesClientes, enderecosClientes, categorias, itens, orcamentos, itensOrcamento }, revision: revisionOf(db), approved_codes, empresa };
}

export function saveWorkspace(db, expectedRevision, payload, inTransaction = false, allowUnknownCodes = false) {
  payload.contatosClientes ||= []; payload.telefonesClientes ||= []; payload.enderecosClientes ||= [];
  for (const row of payload.orcamentos || []) if (row.length === 6) row.push({});
  for (const row of payload.itensOrcamento || []) if (row.length === 6) row.push('');
  validatePayload(db, payload, allowUnknownCodes);
  if (revisionOf(db) !== Number(expectedRevision)) return null;
  const approvedItemRows = db.prepare('SELECT produto_codigo,produto_nome,quantidade,valor_unitario,produto_descricao FROM item_orcamento WHERE orcamento_codigo=? ORDER BY produto_codigo');
  for (const budget of db.prepare('SELECT codigo FROM orcamento WHERE aprovado=1').all()) {
    if (!payload.orcamentos.some((row) => Number(row[0]) === budget.codigo)) continue;
    const expected = approvedItemRows.all(budget.codigo).map((row) => [row.produto_codigo, row.produto_nome, row.quantidade, moneyDisplay(row.valor_unitario), row.produto_descricao || '']);
    const received = payload.itensOrcamento.filter((row) => Number(row[0]) === budget.codigo).map((row) => [Number(row[1]), row[2], Number(row[3]), moneyDisplay(money(row[4])), row[6] || '']).sort((left, right) => left[0] - right[0]);
    if (JSON.stringify(expected) !== JSON.stringify(received)) throw new Error('Os itens de um orçamento aprovado não podem ser alterados.');
  }
  if (!inTransaction) db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM item_orcamento').run();
    db.prepare('DELETE FROM cliente_telefone WHERE codigo IS NOT NULL').run();
    db.prepare('DELETE FROM cliente_endereco WHERE codigo IS NOT NULL').run();
    db.prepare('DELETE FROM cliente_contato WHERE cliente_codigo IS NOT NULL').run();
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
    let generatedClient = null;
    let generatedClientCount = 0;
    for (const row of payload.clientes) {
      if (row[0] == null) { const inserted = clientInsert.run(row[1], row[2], row[3]); generatedClient = Number(inserted.lastInsertRowid); generatedClientCount += 1; }
      else if (allowUnknownCodes && !db.prepare('SELECT 1 FROM cliente WHERE codigo=?').get(row[0])) clientInsertWithCode.run(row[0], row[1], row[2], row[3]);
      else clientUpdate.run(row[1], row[2], row[3], row[0]);
    }
    if (generatedClientCount && !payload.novoClienteContato) throw new Error('Contato obrigatório do novo cliente inválido.');
    const contactInsert = db.prepare('INSERT INTO cliente_contato(cliente_codigo,email,pessoa_contato) VALUES(?,?,?)');
    if (payload.novoClienteContato) {
      const contact = payload.novoClienteContato;
      if (generatedClientCount !== 1 || !generatedClient || !String(contact.email || '').match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) || !Array.isArray(contact.telefones) || !contact.telefones.length || contact.telefones.some((phone) => !String(phone).trim()) || (db.prepare('SELECT tipo FROM cliente WHERE codigo=?').get(generatedClient).tipo === 'Pessoa Jurídica' && !String(contact.pessoa || '').trim())) throw new Error('Contato obrigatório do novo cliente inválido.');
      contactInsert.run(generatedClient, String(contact.email).trim(), String(contact.pessoa || '').trim());
      const requiredPhone = db.prepare('INSERT INTO cliente_telefone(cliente_codigo,telefone,principal) VALUES(?,?,?)');
      contact.telefones.forEach((phone, index) => requiredPhone.run(generatedClient, String(phone).trim(), index === 0 ? 1 : 0));
    }
    for (const row of payload.contatosClientes) contactInsert.run(row[0],row[1],row[2]);
    const phoneInsert = db.prepare('INSERT INTO cliente_telefone(codigo,cliente_codigo,telefone,principal) VALUES(?,?,?,?)');
    const phoneNew = db.prepare('INSERT INTO cliente_telefone(cliente_codigo,telefone,principal) VALUES(?,?,?)');
    for (const row of payload.telefonesClientes) (row[0] == null ? phoneNew.run(row[1],row[2],row[3]?1:0) : phoneInsert.run(row[0],row[1],row[2],row[3]?1:0));
    const addressInsert = db.prepare('INSERT INTO cliente_endereco(codigo,cliente_codigo,cep,logradouro,numero,complemento,bairro,cidade,uf,texto_legado,principal) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    const addressNew = db.prepare('INSERT INTO cliente_endereco(cliente_codigo,cep,logradouro,numero,complemento,bairro,cidade,uf,texto_legado,principal) VALUES(?,?,?,?,?,?,?,?,?,?)');
    for (const row of payload.enderecosClientes) (row[0] == null ? addressNew.run(...row.slice(1,10),row[10]?1:0) : addressInsert.run(...row.slice(0,10),row[10]?1:0));

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
    const budgetInsertWithCode = db.prepare('INSERT INTO orcamento(codigo,cliente_codigo,data_emissao,validade,aprovado) VALUES(?,?,?,?,0)');
    const budgetUpdate = db.prepare('UPDATE orcamento SET cliente_codigo=?,validade=? WHERE codigo=?');
    const informationSave = db.prepare('INSERT OR REPLACE INTO orcamento_informacao VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    let generatedBudget = null;
    for (const row of payload.orcamentos) {
      if (row[0] == null) generatedBudget = Number(budgetInsert.run(row[1], currentDate(), row[4]).lastInsertRowid);
      else if (allowUnknownCodes && !db.prepare('SELECT 1 FROM orcamento WHERE codigo=?').get(row[0])) budgetInsertWithCode.run(row[0], row[1], row[3], row[4]);
      else budgetUpdate.run(row[1], row[4], row[0]);
      const code = row[0] ?? generatedBudget; const details = row[6] || {}; const company = details.company || {}; const client = details.client || {};
      informationSave.run(code, details.pagamento || '', details.entrega || '', details.localEntrega || '', details.observacoes || '',
        company.nome || '', company.cnpj || '', company.endereco || '', company.telefone || '', company.email || '',
        client.tipo || '', client.documento || '', client.nome || '', client.email || '', client.contato || '', client.telefone || '', client.endereco || '');
    }
    const itemInsert = db.prepare('INSERT INTO item_orcamento(orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario,produto_descricao) VALUES(?,?,?,?,?,?)');
    for (const row of payload.itensOrcamento) itemInsert.run(row[0] ?? generatedBudget, row[1], row[2], row[3], money(row[4]), row[6] || '');
    if (db.prepare('SELECT 1 FROM orcamento o WHERE NOT EXISTS(SELECT 1 FROM item_orcamento i WHERE i.orcamento_codigo=o.codigo) LIMIT 1').get()) throw new Error('Orçamento exige ao menos um item.');
    db.prepare("UPDATE atlas_meta SET valor=CAST(CAST(valor AS INTEGER)+1 AS TEXT) WHERE chave='revision'").run();
    if (!inTransaction) db.exec('COMMIT');
    return loadWorkspace(db);
  } catch (error) {
    if (!inTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

export function approveWorkspace(db, expectedRevision, code, conditions) {
  if (revisionOf(db) !== Number(expectedRevision)) return null;
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare('UPDATE orcamento SET aprovado=1 WHERE codigo=? AND aprovado=0').run(code);
    if (!result.changes) throw new Error('Orçamento inexistente ou já aprovado.');
    if (conditions !== undefined) {
      const values = ['pagamento', 'entrega', 'localEntrega', 'observacoes'].map((key) => String(conditions?.[key] || '').trim());
      db.prepare('UPDATE orcamento_informacao SET pagamento=?,prazo_entrega=?,local_entrega=?,observacoes=? WHERE orcamento_codigo=?').run(...values, code);
    }
    db.prepare("UPDATE atlas_meta SET valor=CAST(CAST(valor AS INTEGER)+1 AS TEXT) WHERE chave='revision'").run();
    db.exec('COMMIT');
    return loadWorkspace(db);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function saveCompany(db, value) {
  const empresa = validateCompanyProfile(typeof value === 'string' ? { nome: value } : value);
  db.prepare('UPDATE empresa_perfil SET nome=?,cnpj=?,endereco=?,telefone=?,email=?,completo=1 WHERE codigo=1').run(empresa.nome, empresa.cnpj, empresa.endereco, empresa.telefone, empresa.email);
  return { ...empresa, completo: true };
}
