import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

for (const action of ['shutdown', 'pipe-close']) {
  test(`launcher encerra servidor por ${action}`, { timeout: 15000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'atlas-launcher-'));
    const child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', ATLAS_DATA_DIR: directory, ATLAS_LAUNCHER_ID: 'test-instance' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const exited = once(child, 'exit');
    try {
      let output = '';
      await new Promise((resolve, reject) => {
        child.stdout.on('data', chunk => { output += chunk; if (output.includes('ATLAS_READY:test-instance')) resolve(); });
        child.once('error', reject);
        child.once('exit', () => reject(new Error('Servidor encerrou antes de iniciar.')));
      });
      if (action === 'shutdown') child.stdin.write('shutdown\n');
      else child.stdin.end();
      const [code] = await exited;
      assert.equal(code, 0);
    } finally {
      if (child.exitCode === null) { child.kill(); await exited; }
      await rm(directory, { recursive: true, force: true });
    }
  });
}
