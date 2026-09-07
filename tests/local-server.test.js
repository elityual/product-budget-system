import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const empty = { clientes: [], categorias: [], itens: [], orcamentos: [], itensOrcamento: [] };

async function startLocalServer() {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-local-'));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), ATLAS_DATA_DIR: directory }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  let status;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { status = await fetch(`${base}/api/status`); if (status.ok) break; } catch { /* O servidor ainda está iniciando. */ }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  if (!status?.ok) throw new Error('Servidor local não iniciou.');
  const token = (await status.json()).token;
  const request = (path, options = {}) => fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json', 'X-Atlas-Token': token, ...options.headers } });
  return { child, directory, base, request };
}

test('servidor local persiste dados, calcula orçamento e restaura backup', async () => {
  const local = await startLocalServer();
  try {
    const load = async () => (await local.request('/api/load')).json();
    assert.deepEqual((await load()).payload, empty);
    const unauthorized = await fetch(`${local.base}/api/load`);
    assert.equal(unauthorized.status, 401);
    assert.equal((await fetch(`${local.base}/atlas.sqlite`)).status, 404);
    assert.equal((await fetch(`${local.base}/server.js`)).status, 404);
    const payload = {
      clientes: [[null, 'Pessoa Jurídica', '11.222.333/0001-81', 'Cliente local']],
      categorias: [[null, 'Materiais']],
      itens: [[null, 'Materiais', 'Cimento', 'Saco', 42.9, '01/01/1900', 'Ativo']],
      orcamentos: [[null, 1, 'Cliente local', '01/01/1900', '31/12/2026', 0]],
      itensOrcamento: [[null, 1, 'Cimento', 2, 42.9, 0]]
    };
    let response = await local.request('/api/save', { method: 'POST', body: JSON.stringify({ expected_revision: 0, payload }) });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.payload.orcamentos[0][5], 85.8);
    assert.equal(saved.payload.orcamentos[0][3] === '01/01/1900', false);
    const revisedPayload = structuredClone(saved.payload);
    revisedPayload.itens[0][4] = 1.11;
    revisedPayload.itensOrcamento[0][4] = 1.11;
    response = await local.request('/api/save', { method: 'POST', body: JSON.stringify({ expected_revision: saved.revision, payload: revisedPayload }) });
    const revised = await response.json();
    assert.equal(revised.payload.orcamentos[0][5], 2.22);
    response = await local.request('/api/backup');
    const backup = await response.json();
    assert.equal(backup.schema_version, 1);
    assert.ok((await readdir(join(local.directory, 'backups'))).length >= 1);
    const restore = await local.request('/api/restore', { method: 'POST', body: JSON.stringify(backup) });
    assert.equal((await restore.json()).payload.clientes[0][0], 1);
    assert.equal((await load()).payload.orcamentos[0][5], 2.22);
    response = await local.request('/api/restore', { method: 'POST', body: JSON.stringify({ schema_version: 99, payload: empty }) });
    assert.equal(response.status, 400);
    assert.equal((await load()).payload.orcamentos[0][5], 2.22);
    response = await local.request('/api/restore', { method: 'POST', body: JSON.stringify({ ...backup, approved_codes: [999] }) });
    assert.equal(response.status, 400);
    assert.equal((await load()).payload.orcamentos[0][5], 2.22);
    response = await local.request('/api/save', { method: 'POST', body: JSON.stringify({ expected_revision: 0, payload }) });
    assert.equal(await response.json(), null);
  } finally {
    local.child.kill();
    if (local.child.exitCode === null) await new Promise((resolve) => local.child.once('exit', resolve));
    await rm(local.directory, { recursive: true, force: true });
  }
});
