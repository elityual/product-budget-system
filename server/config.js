import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('../server.js', import.meta.url)));

export function createConfig(environment = process.env) {
  const dataRoot = environment.ATLAS_DATA_DIR
    || join(environment.LOCALAPPDATA || join(root, '.local-data'), 'ProductBudgetControl');
  return {
    root,
    port: Number(environment.PORT || 8765),
    dataRoot,
    databasePath: join(dataRoot, 'atlas.sqlite'),
    token: randomBytes(24).toString('hex')
  };
}
