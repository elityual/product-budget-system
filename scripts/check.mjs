import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkInstallSql } from './build-sql.mjs';

await checkInstallSql();

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const roots = ['assets/js', 'server', 'scripts', 'tests', 'e2e'];
const individualFiles = ['server.js', 'playwright.config.js'];

async function listJavaScript(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listJavaScript(file));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(file);
  }
  return files;
}

const files = [
  ...individualFiles.map((file) => join(root, file)),
  ...(await Promise.all(roots.map((directory) => listJavaScript(join(root, directory))))).flat()
].sort();

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`${files.length} arquivos JavaScript verificados.`);
