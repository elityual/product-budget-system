import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chooseBackupDirectory } from '../../server/automatic-backups.js';

test('seletor carrega o script nativo, usa STA e preserva caminhos Unicode com espaços', async () => {
  let loadedUrl;
  const nativeScript = 'script nativo com acentuação';
  const result = await chooseBackupDirectory({ platform: 'win32', loadScript: async (url, encoding) => {
    loadedUrl = url;
    assert.equal(encoding, 'utf8');
    return nativeScript;
  }, execute: async (file, args, options) => {
    assert.equal(file, 'powershell.exe');
    assert.ok(args.includes('-STA'));
    assert.ok(!args.includes('-NonInteractive'));
    const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
    assert.equal(script, nativeScript);
    assert.equal(options.encoding, 'utf8');
    return { stdout: 'C:\\Usuários\\João Silva\r\n' };
  } });
  assert.equal(loadedUrl.pathname.endsWith('/server/windows-folder-picker.ps1'), true);
  assert.deepEqual(result, { directory: 'C:\\Usuários\\João Silva' });
});

test('script nativo promove somente o diálogo do processo e descarta os recursos', async () => {
  const script = await readFile(new URL('../../server/windows-folder-picker.ps1', import.meta.url), 'utf8');
  assert.match(script, /candidateProcessId != processId/);
  assert.match(script, /window == owner/);
  assert.match(script, /SetWindowPos\(window, new IntPtr\(-1\)/);
  assert.match(script, /SetForegroundWindow\(window\)/);
  assert.match(script, /\$timer\.Stop\(\)/);
  for (const resource of ['timer', 'dialog', 'owner']) assert.match(script, new RegExp(`\\$${resource}\\.Dispose\\(\\)`));
});

test('cancelar seleção retorna caminho vazio', async () => {
  assert.deepEqual(await chooseBackupDirectory({ platform: 'win32', execute: async () => ({ stdout: '' }) }), { directory: '' });
});

test('falha e timeout não expõem o comando na mensagem da interface', async () => {
  for (const killed of [false, true]) {
    await assert.rejects(chooseBackupDirectory({ platform: 'win32', execute: async () => {
      throw Object.assign(new Error('Command failed: powershell.exe ...'), { killed });
    } }), (error) => {
      assert.doesNotMatch(error.message, /Command failed|powershell.exe/);
      assert.match(error.message, killed ? /tempo.*terminou/ : /seletor de pastas/);
      return true;
    });
  }
});
