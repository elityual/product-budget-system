import { gzipSync } from 'node:zlib';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(root, 'release');
const outputFile = join(outputDirectory, 'product-budget-control-source.tar.gz');
const ignoredDirectories = new Set(['.git', '.local-data', '.npm-cache', '.test-data', 'backups', 'node_modules', 'release', 'test-results']);
const ignoredFiles = new Set(['AGENTS.md']);

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(fullPath));
    else if (entry.isFile() && !ignoredFiles.has(entry.name) && !entry.name.endsWith('.sqlite') && !entry.name.endsWith('.sqlite-shm') && !entry.name.endsWith('.sqlite-wal') && !/^\.env(?:\.|$)/.test(entry.name)) files.push(fullPath);
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

const files = (await listFiles(root)).sort();
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
