import { emptyData, permissions, approvedBudgets } from './data.js';

// Public client configuration. Never put service_role keys here.
export const backendConfig = {
  url: 'https://dnvfbfjgufgcokjmqsji.supabase.co',
  key: 'sb_publishable_yzPPSspRbE_YW57gJqBc9w_mszv4Wxw'
};

const sessionKey = 'atlas.auth';
let session;
let revision = 0;


async function request(path, options = {}) {
  const response = await fetch(`${backendConfig.url}${path}`, {
    ...options,
    headers: {
      apikey: backendConfig.key,
      ...(session && !path.startsWith('/auth/v1/token') ? { Authorization: `Bearer ${session.access_token}` } : {}),
      'Content-Type': 'application/json',
      ...options.headers
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Sessão expirada ou credenciais inválidas. Entre novamente.');
    throw new Error('Não foi possível acessar os dados. Verifique a conexão e a configuração do Supabase.');
  }
  return response.status === 204 ? null : response.json();
}

export async function signIn(email, password) {
  const result = await request('/auth/v1/token?grant_type=password', {
    method: 'POST', body: JSON.stringify({ email, password })
  });
  session = result;
  sessionStorage.setItem(sessionKey, JSON.stringify(result));
}

export async function confirmPassword(password) {
  const result = await request('/auth/v1/token?grant_type=password', {
    method: 'POST', body: JSON.stringify({ email: session.user.email, password })
  });
  if (result.user.id !== session.user.id) throw new Error('Usuário inválido.');
  session = result;
  sessionStorage.setItem(sessionKey, JSON.stringify(result));
}

export async function loadData() {
  if (!session) {
    try { session = JSON.parse(sessionStorage.getItem(sessionKey)); } catch { session = null; }
  }
  if (!session || session.expires_at * 1000 <= Date.now()) return null;
  const rows = await request('/rest/v1/rpc/atlas_load_workspace', { method: 'POST', body: '{}' });
  approvedBudgets.clear();
  permissions.isAdmin = false;
  if (!rows.length) {
    revision = 0;
    return emptyData();
  }
  permissions.isAdmin = rows[0].is_admin === true;
  (rows[0].approved_codes || []).forEach((code) => approvedBudgets.add(code));
  revision = rows[0].revision;
  const payload = rows[0].payload;
  if (!Object.keys(emptyData()).every((key) => Array.isArray(payload?.[key]))) {
    throw new Error('Os dados armazenados possuem formato inválido.');
  }
  return payload;
}

export async function saveData(payload) {
  const result = await request('/rest/v1/rpc/atlas_save_workspace', {
    method: 'POST', body: JSON.stringify({ expected_revision: revision, new_payload: payload })
  });
  if (result === null) throw new Error('Os dados mudaram em outra sessão. Recarregue a página antes de tentar novamente.');
  if (!Number.isSafeInteger(result.revision) || !Object.keys(emptyData()).every((key) => Array.isArray(result.payload?.[key]))) {
    throw new Error('Resposta de gravação inválida. Confira as migrações do Supabase e recarregue os dados.');
  }
  revision = result.revision;
  Object.assign(payload, result.payload);
}

export async function signOut() {
  try {
    if (session) await request('/auth/v1/logout', { method: 'POST' });
  } finally {
    session = null;
    approvedBudgets.clear();
    permissions.isAdmin = false;
    sessionStorage.removeItem(sessionKey);
  }
}

export async function approveBudget(code, payload) {
  const result = await request('/rest/v1/rpc/atlas_approve_budget', {
    method: 'POST', body: JSON.stringify({ expected_revision: revision, budget_code: code })
  });
  if (result === null) throw new Error('Os dados mudaram em outra sessão. Recarregue antes de aprovar.');
  if (!Number.isSafeInteger(result.revision) || !Array.isArray(result.approved_codes)
    || !Object.keys(emptyData()).every((key) => Array.isArray(result.payload?.[key]))) {
    throw new Error('Resposta de aprovação inválida. Confira a migração 007.');
  }
  revision = result.revision;
  approvedBudgets.clear();
  result.approved_codes.forEach((id) => approvedBudgets.add(id));
  Object.assign(payload,result.payload);
}
