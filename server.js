import { createAutomaticBackup } from './server/backups.js';
import { startAutomaticBackups } from './server/automatic-backups.js';
import { createConfig } from './server/config.js';
import { closeDatabase, openDatabase } from './server/database.js';
import { createHttpServer } from './server/http.js';

const config = createConfig();
const db = await openDatabase(config);
await createAutomaticBackup(config, db);
const automaticBackups = startAutomaticBackups(config, db);
await automaticBackups.schedule();
const server = createHttpServer(config, db, automaticBackups);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => {
    automaticBackups.stop().then((settings) => {
      if (settings?.lastError) console.error(`Backup automático final não concluído: ${settings.lastError}`);
    }).catch((error) => console.error(`Backup automático final não concluído: ${error.message}`)).finally(() => { closeDatabase(db); process.exit(0); });
  });
  server.closeAllConnections?.();
}

// The Windows launcher can request a graceful stop through stdin. Normal
// `npm start` usage is unchanged; the stream is otherwise ignored.
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (chunk.trim() === 'shutdown') shutdown();
});
// O pipe fecha também quando o launcher termina inesperadamente.
if (process.env.ATLAS_LAUNCHER_ID) process.stdin.once('end', shutdown);

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
server.listen(config.port, '127.0.0.1', () => {
  console.log(`Atlas disponível em http://127.0.0.1:${config.port}`);
  if (process.env.ATLAS_LAUNCHER_ID) console.log(`ATLAS_READY:${process.env.ATLAS_LAUNCHER_ID}`);
});
