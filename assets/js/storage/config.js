export const modeKey = 'atlas.storage.mode';
export const configKey = 'atlas.supabase.config';
export const sessionKey = 'atlas.auth';
export const localTokenKey = 'atlas.local.token';

export function storageMode() { return localStorage.getItem(modeKey) || 'supabase'; }

export function supabaseConfig() {
  try { return JSON.parse(localStorage.getItem(configKey) || '{}'); } catch { return {}; }
}

export function configureStorage(mode, config = {}) {
  localStorage.setItem(modeKey, mode);
  if (mode === 'supabase') {
    localStorage.setItem(configKey, JSON.stringify({
      url: String(config.url || '').trim().replace(/\/$/, ''),
      key: String(config.key || '').trim()
    }));
  }
}
