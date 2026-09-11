import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { createBackup, restoreBackup } from './backups.js';
import { approveWorkspace, loadWorkspace, saveCompany, saveWorkspace } from './workspace.js';
import { chooseBackupDirectory, readBackupSettings, saveBackupSettings } from './automatic-backups.js';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
async function readJson(request) { let body = ''; for await (const chunk of request) body += chunk; return JSON.parse(body || '{}'); }
function json(response, status, body, headers = {}) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); response.end(JSON.stringify(body)); }
async function staticFile(config, pathname, response) {
  if (pathname !== '/' && pathname !== '/index.html' && !pathname.startsWith('/assets/')) return json(response, 404, { error: 'Arquivo não encontrado.' });
  const target = resolve(config.root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (relative(config.root, target).startsWith('..')) return json(response, 404, { error: 'Arquivo não encontrado.' });
  try {
    if (!(await stat(target)).isFile()) throw new Error();
    response.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https:; object-src 'none'; base-uri 'none'", 'X-Content-Type-Options': 'nosniff' });
    createReadStream(target).pipe(response);
  } catch { json(response, 404, { error: 'Arquivo não encontrado.' }); }
}

export function createHttpServer(config, db, automaticBackups = null) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (!url.pathname.startsWith('/api/')) return staticFile(config, url.pathname, response);
      if (url.pathname === '/api/status' && request.method === 'GET') return json(response, 200, { mode: 'local', token: config.token, empresa: loadWorkspace(db).empresa });
      if (request.headers['x-atlas-token'] !== config.token) return json(response, 401, { error: 'Sessão local inválida.' });
      if (url.pathname === '/api/backup-settings' && request.method === 'GET') return json(response, 200, await readBackupSettings(config));
      if (url.pathname === '/api/backup-settings' && request.method === 'PUT') {
        const settings = await saveBackupSettings(config, await readJson(request));
        return json(response, 200, automaticBackups ? await automaticBackups.configured() : settings);
      }
      if (url.pathname === '/api/backup-folder' && request.method === 'POST') return json(response, 200, await chooseBackupDirectory());
      if (url.pathname === '/api/backup-manual' && request.method === 'POST') {
        if (!automaticBackups) throw new Error('Backup automático indisponível.');
        return json(response, 200, await automaticBackups.manual());
      }
      if (url.pathname === '/api/load' && request.method === 'GET') return json(response, 200, loadWorkspace(db));
      if (url.pathname === '/api/save' && request.method === 'POST') { const body = await readJson(request); return json(response, 200, saveWorkspace(db, body.expected_revision, body.payload)); }
      if (url.pathname === '/api/approve' && request.method === 'POST') { const body = await readJson(request); return json(response, 200, approveWorkspace(db, body.expected_revision, body.code, body.conditions)); }
      if (url.pathname === '/api/backup' && request.method === 'GET') return json(response, 200, createBackup(db), { 'Content-Disposition': 'attachment; filename="atlas-backup.json"' });
      if (url.pathname === '/api/restore' && request.method === 'POST') return json(response, 200, await restoreBackup(config, db, await readJson(request)));
      if (url.pathname === '/api/company' && request.method === 'POST') { const body = await readJson(request); return json(response, 200, { empresa: saveCompany(db, body.empresa) }); }
      return json(response, 404, { error: 'Rota não encontrada.' });
    } catch (error) { return json(response, 400, { error: error.message || 'Não foi possível concluir a operação.' }); }
  });
}
