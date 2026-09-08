import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAutomaticBackup } from '../../server/backups.js';
import { createConfig } from '../../server/config.js';
import { closeDatabase, openDatabase } from '../../server/database.js';
import { createHttpServer } from '../../server/http.js';
import { saveBackupSettings, startAutomaticBackups } from '../../server/automatic-backups.js';

const empty = { clientes: [], categorias: [], itens: [], orcamentos: [], itensOrcamento: [] };

async function startLocalServer(directory = null) {
  const dataDirectory = directory || await mkdtemp(join(tmpdir(), 'atlas-local-'));
  const config = createConfig({ ...process.env, PORT: '0', ATLAS_DATA_DIR: dataDirectory });
  const db = await openDatabase(config);
  await createAutomaticBackup(config, db);
  const automaticBackups = startAutomaticBackups(config, db, { openFolder: false });
  const server = createHttpServer(config, db, automaticBackups);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const status = await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(3000) });
  const token = (await status.json()).token;
  const request = (path, options = {}) => fetch(`${base}${path}`, { ...options, signal: options.signal || AbortSignal.timeout(3000), headers: { 'Content-Type': 'application/json', 'X-Atlas-Token': token, ...options.headers } });
  return { db, directory: dataDirectory, server, base, request, automaticBackups };
}

async function stopLocalServer(local) {
  await new Promise((resolve, reject) => local.server.close((error) => error ? reject(error) : resolve()));
  await local.automaticBackups.stop();
  closeDatabase(local.db);
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
    await stopLocalServer(local);
    const restarted = await startLocalServer(local.directory);
    try {
      const persisted = await (await restarted.request('/api/load')).json();
      assert.equal(persisted.payload.orcamentos[0][5], 2.22);
      assert.equal(persisted.revision, 3);
    } finally { await stopLocalServer(restarted); }
  } finally {
    if (local.server.listening) await stopLocalServer(local);
    await rm(local.directory, { recursive: true, force: true });
  }
});

test('backup automático local cria cópia na pasta configurada', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'atlas-data-'));
  const destination = await mkdtemp(join(tmpdir(), 'atlas-backup-'));
  const config = createConfig({ ...process.env, ATLAS_DATA_DIR: dataDirectory, PORT: '0' });
  const db = await openDatabase(config);
  try {
    const backups = startAutomaticBackups(config, db);
    await saveBackupSettings(config, { directory: destination, intervalMinutes: 15 });
    const completed = await backups.configured();
    assert.equal(completed.lastBackupRevision, 0);
    assert.equal((await readdir(join(destination, 'Atlas Backups'))).filter((file) => file.endsWith('.json')).length, 1);
    await backups.stop();
  } finally { closeDatabase(db); await rm(dataDirectory, { recursive: true, force: true }); await rm(destination, { recursive: true, force: true }); }
});

test('trocar intervalo substitui o temporizador de backup local', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'atlas-timer-data-'));
  const destination = await mkdtemp(join(tmpdir(), 'atlas-timer-backup-'));
  const config = createConfig({ ...process.env, ATLAS_DATA_DIR: dataDirectory, PORT: '0' });
  const db = await openDatabase(config);
  const timers = []; const cleared = [];
  try {
    await saveBackupSettings(config, { directory: destination, intervalMinutes: 15 });
    const backups = startAutomaticBackups(config, db, { setTimer: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; }, clearTimer: (timer) => cleared.push(timer) });
    await backups.schedule();
    await saveBackupSettings(config, { directory: destination, intervalMinutes: 5 });
    await backups.schedule();
    await saveBackupSettings(config, { directory: destination, intervalMinutes: 30 });
    await backups.schedule();
    assert.deepEqual(timers.map((timer) => timer.delay), [15, 5, 30].map((minutes) => minutes * 60_000));
    assert.deepEqual(cleared, timers.slice(0, 2));
    await backups.stop();
  } finally { closeDatabase(db); await rm(dataDirectory, { recursive: true, force: true }); await rm(destination, { recursive: true, force: true }); }
});

test('backup manual local cria cópia mesmo sem alterações', async () => {
  const local = await startLocalServer();
  const destination = await mkdtemp(join(tmpdir(), 'atlas-manual-'));
  try {
    await saveBackupSettings({ dataRoot: local.directory }, { directory: destination, intervalMinutes: 15 });
    const response = await local.request('/api/backup-manual', { method: 'POST', body: '{}' });
    const backup = await response.json();
    assert.equal(response.status, 200);
    assert.equal(backup.opened, false);
    assert.match(backup.path, /atlas-manual-/);
    assert.equal((await readdir(join(destination, 'Atlas Backups'))).filter((file) => file.includes('manual')).length, 1);
  } finally { if (local.server.listening) await stopLocalServer(local); await rm(local.directory, { recursive: true, force: true }); await rm(destination, { recursive: true, force: true }); }
});
