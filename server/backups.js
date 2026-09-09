import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validatePayload } from './validation.js';
import { loadWorkspace, saveWorkspace } from './workspace.js';

export function createBackup(db) {
  return { schema_version: 1, ...loadWorkspace(db) };
}

export async function createAutomaticBackup(config, db) {
  try {
    const directory = join(config.dataRoot, 'backups');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(createBackup(db), null, 2), 'utf8');
    const files = (await readdir(directory)).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().reverse();
    for (const old of files.slice(7)) await unlink(join(directory, old)).catch(() => {});
  } catch { /* O banco continua disponível se o backup automático falhar. */ }
}

export async function restoreBackup(config, db, body) {
  if (body.schema_version !== 1) throw new Error('Versão de backup incompatível.');
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new Error('Revisão de backup inválida.');
  if (!Array.isArray(body.approved_codes) || body.approved_codes.some((code) => !Number.isSafeInteger(code) || code <= 0) || new Set(body.approved_codes).size !== body.approved_codes.length) throw new Error('Lista de aprovações inválida.');
  if (typeof body.empresa === 'string') body.empresa = { nome: body.empresa };
  if (!body.empresa || typeof body.empresa !== 'object' || String(body.empresa.nome || '').trim().length > 160) throw new Error('Nome da empresa inválido.');
  body.payload.contatosClientes ||= []; body.payload.telefonesClientes ||= []; body.payload.enderecosClientes ||= [];
  for (const row of body.payload?.clientes || []) if (row.length > 4) {
    const details = row[4] || {}; const code = row[0];
    if ((details.email || details.contato) && !body.payload.contatosClientes.some((item) => item[0] === code)) body.payload.contatosClientes.push([code, details.email || '', details.contato || '']);
    if (details.telefone && !body.payload.telefonesClientes.some((item) => item[1] === code)) body.payload.telefonesClientes.push([null, code, details.telefone, true]);
    if (details.endereco && !body.payload.enderecosClientes.some((item) => item[1] === code)) body.payload.enderecosClientes.push([null, code, '', '', '', '', '', '', '', details.endereco, true]);
    row.splice(4);
  }
  for (const row of body.payload?.orcamentos || []) if (row.length === 6) row.push({});
  for (const row of body.payload?.itensOrcamento || []) if (row.length === 6) row.push('');
  validatePayload(db, body.payload, true);
  const budgetCodes = new Set(body.payload.orcamentos.map((row) => row[0]).filter((code) => code != null).map(Number));
  if (body.approved_codes.some((code) => !budgetCodes.has(code))) throw new Error('Aprovação não corresponde a um orçamento do backup.');
  const directory = join(config.dataRoot, 'backups');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `antes-restaurar-${Date.now()}.json`), JSON.stringify(createBackup(db), null, 2), 'utf8');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("UPDATE atlas_meta SET valor=? WHERE chave='empresa'").run(JSON.stringify(body.empresa));
    for (const table of ['item_orcamento', 'orcamento', 'produto', 'categoria', 'cliente']) db.prepare(`DELETE FROM ${table}`).run();
    const currentRevision = Number(db.prepare("SELECT valor FROM atlas_meta WHERE chave='revision'").get().valor);
    saveWorkspace(db, currentRevision, body.payload, true, true);
    for (const code of body.approved_codes) db.prepare('UPDATE orcamento SET aprovado=1 WHERE codigo=?').run(code);
    const revision = Math.max(Number(db.prepare("SELECT valor FROM atlas_meta WHERE chave='revision'").get().valor), body.revision);
    db.prepare("UPDATE atlas_meta SET valor=? WHERE chave='revision'").run(String(revision));
    db.exec('COMMIT');
    return loadWorkspace(db);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
