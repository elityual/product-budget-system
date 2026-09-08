import { configKey, sessionKey } from './config.js';

function config() {
  try {
    const value = JSON.parse(localStorage.getItem(configKey) || '{}');
    return { url: typeof value.url === 'string' ? value.url.trim().replace(/\/$/, '') : '', key: typeof value.key === 'string' ? value.key.trim() : '' };
  } catch { return { url: '', key: '' }; }
}

export async function supabaseRequest(path, session, options = {}) {
  const current = config();
  if (!current.url || !current.key) throw new Error('Configure a URL e a chave publishable do seu projeto Supabase.');
  const response = await fetch(`${current.url}${path}`, {
    ...options,
    headers: { apikey: current.key, ...(session && !path.startsWith('/auth/v1/token') ? { Authorization: `Bearer ${session.access_token}` } : {}), 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Sessão expirada ou credenciais inválidas. Entre novamente.');
    throw new Error('Não foi possível acessar os dados. Verifique a conexão e a configuração do Supabase.');
  }
  return response.status === 204 ? null : response.json();
}

export function readSupabaseSession() {
  try { return JSON.parse(sessionStorage.getItem(sessionKey)); } catch { return null; }
}

export function saveSupabaseSession(session) { sessionStorage.setItem(sessionKey, JSON.stringify(session)); }
export function clearSupabaseSession() { sessionStorage.removeItem(sessionKey); }
