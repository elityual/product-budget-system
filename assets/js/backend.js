import { emptyData, permissions, approvedBudgets } from './data.js';

// Configuração pública do Supabase. A URL e a chave são fornecidas pelo operador.
export const backendConfig = { url: '', key: '' };
const modeKey = 'atlas.storage.mode';
const configKey = 'atlas.supabase.config';
const sessionKey = 'atlas.auth';
const localTokenKey = 'atlas.local.token';
let session;
let revision = 0;

export function storageMode() { return localStorage.getItem(modeKey) || 'supabase'; }

export function supabaseConfig() {
  try { return JSON.parse(localStorage.getItem(configKey) || '{}'); } catch { return {}; }
}

export function configureStorage(mode, config = {}) {
  localStorage.setItem(modeKey, mode);
  if (mode === 'supabase') {
    const value = { url: String(config.url || '').trim().replace(/\/$/, ''), key: String(config.key || '').trim() };
    localStorage.setItem(configKey, JSON.stringify(value));
    Object.assign(backendConfig, value);
  }
}

function readConfig() {
  try {
    const value = JSON.parse(localStorage.getItem(configKey) || '{}');
    backendConfig.url = typeof value.url === 'string' ? value.url.trim().replace(/\/$/, '') : '';
    backendConfig.key = typeof value.key === 'string' ? value.key.trim() : '';
  } catch { backendConfig.url = ''; backendConfig.key = ''; /* A configuração ausente será informada ao usuário. */ }
}

async function request(path, options = {}) {
  readConfig();
  if (!backendConfig.url || !backendConfig.key) throw new Error('Configure a URL e a chave publishable do seu projeto Supabase.');
  const response = await fetch(`${backendConfig.url}${path}`, {
    ...options,
    headers: { apikey: backendConfig.key, ...(session && !path.startsWith('/auth/v1/token') ? { Authorization: `Bearer ${session.access_token}` } : {}), 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Sessão expirada ou credenciais inválidas. Entre novamente.');
    throw new Error('Não foi possível acessar os dados. Verifique a conexão e a configuração do Supabase.');
  }
  return response.status === 204 ? null : response.json();
}

async function localRequest(path, options = {}) {
  const getToken = async (force = false) => {
    let value = force ? null : sessionStorage.getItem(localTokenKey);
    if (!value) {
      const status = await fetch('/api/status', { signal: AbortSignal.timeout(15000) });
      if (!status.ok) throw new Error('Servidor local indisponível. Execute npm start e tente novamente.');
      value = (await status.json()).token;
      sessionStorage.setItem(localTokenKey, value);
    }
    return value;
  };
  let token = await getToken();
  let response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', 'X-Atlas-Token': token, ...options.headers }, signal: AbortSignal.timeout(15000) });
  if (response.status === 401) {
    token = await getToken(true);
    response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', 'X-Atlas-Token': token, ...options.headers }, signal: AbortSignal.timeout(15000) });
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Não foi possível acessar o banco local.');
  }
  return response.status === 204 ? null : response.json();
}

export async function signIn(email, password) {
  if (storageMode() === 'local') return;
  const result = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
  session = result;
  sessionStorage.setItem(sessionKey, JSON.stringify(result));
}

export async function confirmPassword(password) {
  if (storageMode() === 'local') return;
  const result = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: session.user.email, password }) });
  if (result.user.id !== session.user.id) throw new Error('Usuário inválido.');
  session = result;
  sessionStorage.setItem(sessionKey, JSON.stringify(result));
}

export async function loadData() {
  if (storageMode() === 'local') {
    const result = await localRequest('/load');
    if (result.empresa) { localStorage.setItem('atlas.company.name', result.empresa); const name = document.querySelector('#brand-name'); if (name) name.textContent = result.empresa; }
    revision = result.revision; permissions.isAdmin = true; approvedBudgets.clear(); result.approved_codes.forEach((code) => approvedBudgets.add(code));
    return result.payload;
  }
  if (!session) { try { session = JSON.parse(sessionStorage.getItem(sessionKey)); } catch { session = null; } }
  if (!session || session.expires_at * 1000 <= Date.now()) return null;
  const rows = await request('/rest/v1/rpc/atlas_load_workspace', { method: 'POST', body: '{}' });
  approvedBudgets.clear(); permissions.isAdmin = false;
  if (!rows.length) { revision = 0; return emptyData(); }
  permissions.isAdmin = rows[0].is_admin === true; (rows[0].approved_codes || []).forEach((code) => approvedBudgets.add(code)); revision = rows[0].revision;
  const payload = rows[0].payload;
  if (!Object.keys(emptyData()).every((key) => Array.isArray(payload?.[key]))) throw new Error('Os dados armazenados possuem formato inválido.');
  return payload;
}

export async function saveData(payload) {
  const result = storageMode() === 'local'
    ? await localRequest('/save', { method: 'POST', body: JSON.stringify({ expected_revision: revision, payload }) })
    : await request('/rest/v1/rpc/atlas_save_workspace', { method: 'POST', body: JSON.stringify({ expected_revision: revision, new_payload: payload }) });
  if (result === null) throw new Error('Os dados mudaram em outra sessão. Recarregue a página antes de tentar novamente.');
  if (!Number.isSafeInteger(result.revision) || !Object.keys(emptyData()).every((key) => Array.isArray(result.payload?.[key]))) throw new Error('Resposta de gravação inválida. Confira a configuração do armazenamento.');
  revision = result.revision; approvedBudgets.clear(); (result.approved_codes || []).forEach((code) => approvedBudgets.add(code)); Object.assign(payload, result.payload);
}

export async function signOut() {
  try { if (storageMode() === 'supabase' && session) await request('/auth/v1/logout', { method: 'POST' }); }
  finally { session = null; approvedBudgets.clear(); permissions.isAdmin = false; sessionStorage.removeItem(sessionKey); sessionStorage.removeItem(localTokenKey); }
}

export async function approveBudget(code, payload) {
  const result = storageMode() === 'local'
    ? await localRequest('/approve', { method: 'POST', body: JSON.stringify({ expected_revision: revision, code }) })
    : await request('/rest/v1/rpc/atlas_approve_budget', { method: 'POST', body: JSON.stringify({ expected_revision: revision, budget_code: code }) });
  if (result === null) throw new Error('Os dados mudaram em outra sessão. Recarregue antes de aprovar.');
  if (!Number.isSafeInteger(result.revision) || !Array.isArray(result.approved_codes) || !Object.keys(emptyData()).every((key) => Array.isArray(result.payload?.[key]))) throw new Error('Resposta de aprovação inválida.');
  revision = result.revision; approvedBudgets.clear(); result.approved_codes.forEach((id) => approvedBudgets.add(id)); Object.assign(payload, result.payload);
}

export async function saveCompanyName(name) {
  const value = String(name || '').trim() || 'Atlas Máquinas & Obras';
  if (value.length > 160) throw new Error('Nome da empresa inválido.');
  localStorage.setItem('atlas.company.name', value);
  const element = document.querySelector('#brand-name'); if (element) element.textContent = value;
  if (storageMode() === 'local') await localRequest('/company', { method: 'POST', body: JSON.stringify({ empresa: value }) });
}

export async function downloadBackup() {
  if (storageMode() !== 'local') throw new Error('Backups locais só estão disponíveis no armazenamento local.');
  const blob = new Blob([JSON.stringify(await localRequest('/backup'), null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'atlas-backup.json'; link.click(); URL.revokeObjectURL(link.href);
}

export async function restoreBackup(file, payload) {
  if (storageMode() !== 'local') throw new Error('Restauração local só está disponível no armazenamento local.');
  const result = await localRequest('/restore', { method: 'POST', body: JSON.stringify(JSON.parse(await file.text())) });
  revision = result.revision; Object.assign(payload, result.payload); approvedBudgets.clear(); result.approved_codes.forEach((code) => approvedBudgets.add(code));
  if (result.empresa) {
    localStorage.setItem('atlas.company.name', result.empresa);
    const brand = document.querySelector('#brand-name');
    const setting = document.querySelector('#company-name');
    if (brand) brand.textContent = result.empresa;
    if (setting) setting.value = result.empresa;
  }
}
