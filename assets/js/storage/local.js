import { localTokenKey } from './config.js';

async function token(force = false) {
  let value = force ? null : sessionStorage.getItem(localTokenKey);
  if (!value) {
    const response = await fetch('/api/status', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Servidor local indisponível. Execute npm start e tente novamente.');
    value = (await response.json()).token;
    sessionStorage.setItem(localTokenKey, value);
  }
  return value;
}

export async function localRequest(path, options = {}) {
  const { timeout = 15000, ...requestOptions } = options;
  let accessToken = await token();
  let response = await fetch(`/api${path}`, { ...requestOptions, headers: { 'Content-Type': 'application/json', 'X-Atlas-Token': accessToken, ...requestOptions.headers }, signal: AbortSignal.timeout(timeout) });
  if (response.status === 401) {
    accessToken = await token(true);
    response = await fetch(`/api${path}`, { ...requestOptions, headers: { 'Content-Type': 'application/json', 'X-Atlas-Token': accessToken, ...requestOptions.headers }, signal: AbortSignal.timeout(timeout) });
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Não foi possível acessar o banco local.');
  }
  return response.status === 204 ? null : response.json();
}

export function clearLocalSession() { sessionStorage.removeItem(localTokenKey); }
