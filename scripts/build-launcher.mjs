import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const compiler = process.env.WINDIR ? join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe') : '';
const output = join(root, 'AtlasLauncher.exe');
if (!compiler) throw new Error('WINDIR não está configurado.');
await mkdir(join(root, 'launcher'), { recursive: true });
const result = spawnSync(compiler, ['/nologo', '/target:winexe', '/optimize+', '/out:' + output, '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', join(root, 'launcher', 'AtlasLauncher.cs')], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('Launcher criado em AtlasLauncher.exe');
