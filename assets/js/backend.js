import { emptyData, permissions, approvedBudgets } from './data.js';
import { configureStorage, storageMode, supabaseConfig } from './storage/config.js';
import { clearLocalSession, localRequest } from './storage/local.js';
import { clearSupabaseSession, readSupabaseSession, saveSupabaseSession, supabaseRequest } from './storage/supabase.js';

export { configureStorage, storageMode, supabaseConfig };
let session;
let revision = 0;
let companyName = '';

function applyWorkspace(result, payload) {
  if (!Number.isSafeInteger(result?.revision) || !Object.keys(emptyData()).every((key) => Array.isArray(result.payload?.[key]))) throw new Error('Resposta de armazenamento inválida. Confira a configuração.');
  revision = result.revision;
  companyName = result.empresa || companyName;
  approvedBudgets.clear();
  (result.approved_codes || []).forEach((code) => approvedBudgets.add(code));
  if (payload) Object.assign(payload, result.payload);
  return result;
}

export function configuredCompanyName() { return companyName; }

export async function signIn(email, password) {
  if (storageMode() === 'local') return;
  session = await supabaseRequest('/auth/v1/token?grant_type=password', null, { method: 'POST', body: JSON.stringify({ email, password }) });
  saveSupabaseSession(session);
}

export async function confirmPassword(password) {
  if (storageMode() === 'local') return;
  const result = await supabaseRequest('/auth/v1/token?grant_type=password', null, { method: 'POST', body: JSON.stringify({ email: session.user.email, password }) });
  if (result.user.id !== session.user.id) throw new Error('Usuário inválido.');
  session = result;
  saveSupabaseSession(session);
}

export async function loadData() {
  if (storageMode() === 'local') {
    const result = await localRequest('/load');
    permissions.isAdmin = true;
    return applyWorkspace(result).payload;
  }
  if (!session) session = readSupabaseSession();
  if (!session || session.expires_at * 1000 <= Date.now()) return null;
  const rows = await supabaseRequest('/rest/v1/rpc/atlas_load_workspace', session, { method: 'POST', body: '{}' });
  permissions.isAdmin = rows[0]?.is_admin === true;
  if (!rows.length) { revision = 0; approvedBudgets.clear(); return emptyData(); }
  return applyWorkspace(rows[0]).payload;
}

export async function saveData(payload) {
  const result = storageMode() === 'local'
    ? await localRequest('/save', { method: 'POST', body: JSON.stringify({ expected_revision: revision, payload }) })
    : await supabaseRequest('/rest/v1/rpc/atlas_save_workspace', session, { method: 'POST', body: JSON.stringify({ expected_revision: revision, new_payload: payload }) });
  if (result === null) throw new Error('Os dados mudaram em outra sessão. Recarregue a página antes de tentar novamente.');
  applyWorkspace(result, payload);
}

export async function signOut() {
  try { if (storageMode() === 'supabase' && session) await supabaseRequest('/auth/v1/logout', session, { method: 'POST' }); }
  finally {
    session = null;
    permissions.isAdmin = false;
    approvedBudgets.clear();
    clearSupabaseSession();
    clearLocalSession();
  }
}

export async function approveBudget(code, payload) {
  const result = storageMode() === 'local'
    ? await localRequest('/approve', { method: 'POST', body: JSON.stringify({ expected_revision: revision, code }) })
    : await supabaseRequest('/rest/v1/rpc/atlas_approve_budget', session, { method: 'POST', body: JSON.stringify({ expected_revision: revision, budget_code: code }) });
  if (result === null) throw new Error('Os dados mudaram em outra sessão. Recarregue antes de aprovar.');
  if (!Array.isArray(result.approved_codes)) throw new Error('Resposta de aprovação inválida.');
  applyWorkspace(result, payload);
}

export async function saveCompanyName(name) {
  const empresa = String(name || '').trim() || 'Atlas Máquinas & Obras';
  if (empresa.length > 160) throw new Error('Nome da empresa inválido.');
  if (storageMode() === 'local') return localRequest('/company', { method: 'POST', body: JSON.stringify({ empresa }) });
  return { empresa };
}

export async function createManualBackup() {
  if (storageMode() !== 'local') throw new Error('Backups locais só estão disponíveis no armazenamento local.');
  return localRequest('/backup-manual', { method: 'POST', body: '{}', timeout: 30000 });
}

export async function loadBackupSettings() { return localRequest('/backup-settings'); }
export async function saveBackupSettings(settings) { return localRequest('/backup-settings', { method: 'PUT', body: JSON.stringify(settings) }); }
export async function chooseBackupDirectory() { return localRequest('/backup-folder', { method: 'POST', body: '{}', timeout: 130000 }); }

export async function restoreBackup(file, payload) {
  if (storageMode() !== 'local') throw new Error('Restauração local só está disponível no armazenamento local.');
  const result = await localRequest('/restore', { method: 'POST', body: JSON.stringify(JSON.parse(await file.text())) });
  return applyWorkspace(result, payload);
}
