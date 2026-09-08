import { access, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createBackup } from './backups.js';

const execFileAsync = promisify(execFile);
const intervals = new Set([5, 15, 30, 60]);
const settingsFile = 'backup-settings.json';
const prefix = 'atlas-backup-';
const defaults = () => ({ directory: '', intervalMinutes: 15, lastBackupAt: '', lastBackupRevision: -1, lastError: '' });
const settingsPath = (config) => join(config.dataRoot, settingsFile);
const targetDirectory = (directory) => join(directory, 'Atlas Backups');

export async function readBackupSettings(config) {
  try {
    const settings = { ...defaults(), ...JSON.parse(await readFile(settingsPath(config), 'utf8')) };
    return { ...settings, intervalMinutes: intervals.has(Number(settings.intervalMinutes)) ? Number(settings.intervalMinutes) : 15 };
  } catch { return defaults(); }
}

async function writeSettings(config, settings) {
  await mkdir(config.dataRoot, { recursive: true });
  const temporary = `${settingsPath(config)}.tmp`;
  await writeFile(temporary, JSON.stringify(settings, null, 2), 'utf8');
  await rename(temporary, settingsPath(config));
}

async function validateDirectory(directory) {
  if (typeof directory !== 'string' || !directory.trim()) throw new Error('Escolha uma pasta para os backups automáticos.');
  const target = targetDirectory(directory.trim());
  await mkdir(target, { recursive: true });
  const probe = join(target, `.atlas-write-test-${process.pid}-${Date.now()}`);
  await writeFile(probe, 'ok', 'utf8'); await unlink(probe); await access(target, constants.W_OK);
  return directory.trim();
}

export async function saveBackupSettings(config, input) {
  const directory = await validateDirectory(input?.directory);
  const intervalMinutes = Number(input?.intervalMinutes);
  if (!intervals.has(intervalMinutes)) throw new Error('Intervalo de backup inválido.');
  const settings = { ...(await readBackupSettings(config)), directory, intervalMinutes, lastError: '' };
  await writeSettings(config, settings);
  return settings;
}

export async function chooseBackupDirectory({ platform = process.platform, execute = execFileAsync, loadScript = readFile } = {}) {
  if (platform !== 'win32') throw new Error('A seleção de pasta nativa está disponível somente no Windows.');
  try {
    const script = await loadScript(new URL('./windows-folder-picker.ps1', import.meta.url), 'utf8');
    const { stdout } = await execute('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 120000, encoding: 'utf8' });
    return { directory: stdout.trim() };
  } catch (error) {
    const message = error.killed
      ? 'O tempo para escolher a pasta terminou. Clique em Escolher pasta e tente novamente.'
      : 'Não foi possível abrir o seletor de pastas do Windows. Tente novamente; se o problema continuar, reinicie o Atlas.';
    throw new Error(message, { cause: error });
  }
}

async function writeBackup(config, db, reason) {
  const settings = await readBackupSettings(config);
  if (!settings.directory) return settings;
  const backup = createBackup(db);
  if (settings.lastBackupRevision === backup.revision && reason !== 'configured') return settings;
  try {
    const directory = targetDirectory(settings.directory);
    await mkdir(directory, { recursive: true });
    const output = join(directory, `${prefix}${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await writeFile(`${output}.tmp`, JSON.stringify(backup, null, 2), 'utf8'); await rename(`${output}.tmp`, output);
    const files = (await readdir(directory)).filter((name) => name.startsWith(prefix) && name.endsWith('.json')).sort().reverse();
    for (const old of files.slice(30)) await unlink(join(directory, old)).catch(() => {});
    const updated = { ...settings, lastBackupAt: new Date().toISOString(), lastBackupRevision: backup.revision, lastError: '' };
    await writeSettings(config, updated); return updated;
  } catch (error) {
    const updated = { ...settings, lastError: error.message || 'Não foi possível criar o backup automático.' };
    await writeSettings(config, updated).catch(() => {}); return updated;
  }
}

async function writeManualBackup(config, db, openFolder = true) {
  const settings = await readBackupSettings(config);
  if (!settings.directory) throw new Error('Configure uma pasta para os backups automáticos antes de criar um backup manual.');
  const directory = targetDirectory(settings.directory);
  await mkdir(directory, { recursive: true });
  const output = join(directory, `atlas-manual-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(`${output}.tmp`, JSON.stringify(createBackup(db), null, 2), 'utf8');
  await rename(`${output}.tmp`, output);
  let opened = true;
  try {
    if (!openFolder || process.platform !== 'win32') throw new Error('Explorador do Windows indisponível.');
    await execFileAsync('explorer.exe', [directory], { windowsHide: true });
  } catch { opened = false; }
  return { path: output, directory, opened };
}

export function startAutomaticBackups(config, db, { openFolder = true, setTimer = setInterval, clearTimer = clearInterval } = {}) {
  let timer; let queue = Promise.resolve();
  const run = (reason) => {
    queue = queue.catch(() => {}).then(() => writeBackup(config, db, reason));
    return queue;
  };
  const schedule = async () => {
    const settings = await readBackupSettings(config);
    if (timer) clearTimer(timer);
    if (settings.directory) timer = setTimer(() => run('interval'), settings.intervalMinutes * 60_000);
    return settings;
  };
  return {
    schedule,
    async configured() { const settings = await run('configured'); await schedule(); return settings; },
    async manual() { queue = queue.catch(() => {}).then(() => writeManualBackup(config, db, openFolder)); return queue; },
    async stop() { if (timer) clearTimer(timer); await run('shutdown'); }
  };
}
