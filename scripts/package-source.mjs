import { gzipSync } from 'node:zlib';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkInstallSql } from './build-sql.mjs';

await checkInstallSql();

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(root, 'release');
const outputFile = join(outputDirectory, 'product-budget-control-source.tar.gz');
const rootFiles = ['.gitignore', 'CONTRIBUTING.md', 'LICENSE', 'README.md', 'index.html', 'package.json', 'package-lock.json', 'playwright.config.js', 'server.js'];
const publicDirectories = ['.github', 'assets', 'docs', 'e2e', 'launcher', 'scripts', 'server', 'supabase', 'tests'];

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(file));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}

function octal(value, length) {
  const text = value.toString(8).padStart(length - 1, '0');
  return `${text}\0`;
}

function tarHeader(name, size, modified) {
  const header = Buffer.alloc(512);
  const write = (value, offset, length) => header.write(value, offset, Math.min(length, Buffer.byteLength(value)), 'utf8');
  if (Buffer.byteLength(name) > 100) throw new Error(`Caminho longo demais para o pacote: ${name}`);
  write(name, 0, 100);
  write(octal(0o644, 8), 100, 8);
  write(octal(0, 8), 108, 8);
  write(octal(0, 8), 116, 8);
  write(octal(size, 12), 124, 12);
  write(octal(Math.floor(modified.getTime() / 1000), 12), 136, 12);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  write('ustar\0', 257, 6);
  write('00', 263, 2);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  return header;
}

const files = [
  ...rootFiles.map((file) => join(root, file)),
  ...(await Promise.all(publicDirectories.map((directory) => listFiles(join(root, directory))))).flat()
].sort();
const chunks = [];
for (const file of files) {
  const name = relative(root, file).replaceAll('\\', '/');
  const content = await readFile(file);
  const modified = (await stat(file)).mtime;
  chunks.push(tarHeader(name, content.length, modified), content);
  const padding = (512 - (content.length % 512)) % 512;
  if (padding) chunks.push(Buffer.alloc(padding));
}
chunks.push(Buffer.alloc(1024));
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, gzipSync(Buffer.concat(chunks), { level: 9 }));
console.log(`Fontes empacotados em ${relative(root, outputFile).replaceAll('\\', '/')}`);
