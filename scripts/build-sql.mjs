import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = new URL('../supabase/install.sql', import.meta.url);
const migrations = [
  '202609080001_initial.sql',
  '202609090001_quotation_details.sql',
  '202609090005_refresh_workspace_contact_rpcs.sql',
  '202609090006_normalize_details.sql',
  '202609090007_company_profile.sql',
  '202609100001_approval_commercial_terms.sql',
  '202609100002_budget_total.sql',
  '202609100003_approved_budget_items.sql',
  '202609110001_inactive_budget_products.sql'
];

export async function buildInstallSql() {
  const sections = await Promise.all(migrations.map(async (name) => {
    const sql = await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
    return `-- Origem: ${name}\n${sql.replaceAll('\r\n', '\n').trim()}\n`;
  }));
  return '-- Atlas: instalação completa para um projeto Supabase novo.\n'
    + '-- Gerado por npm run build:sql. Não editar diretamente.\n'
    + '-- Execute este arquivo inteiro no SQL Editor; configure o administrador conforme docs/SUPABASE.md.\n'
    + '-- Sem dados de exemplo. Para atualizar bancos existentes, use as migrações individuais.\n\n'
    + sections.join('\n');
}

export async function checkInstallSql() {
  const expected = await buildInstallSql();
  const actual = await readFile(output, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  if (actual.replaceAll('\r\n', '\n') !== expected) {
    throw new Error('supabase/install.sql está desatualizado. Execute npm run build:sql.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) await checkInstallSql();
  else await writeFile(output, await buildInstallSql(), 'utf8');
  console.log('supabase/install.sql ' + (process.argv.includes('--check') ? 'verificado.' : 'gerado.'));
}
