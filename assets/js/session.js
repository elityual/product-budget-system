import { data, state, get } from './data.js';
import { emptyData } from './data.js';
import { loadData, signIn, signOut } from './backend.js';
export function setupSession({ render, resetFilters, closeModal }) {
  get('#exit').onclick = async () => {
    const loginButton = get('#auth-form button');
    loginButton.disabled = true;
    get('#application').inert = true;
    get('#application').classList.add('hidden');
    Object.assign(data, emptyData());
    closeModal();
    render();
    get('#form').replaceChildren();
    get('#auth-panel').classList.remove('hidden');
    try {
      await signOut();
    } catch { /* Local credentials are always removed. */ }
    finally {
      get('#application').inert = false;
      loginButton.disabled = false;
    }
  };

  async function startSession() {
    const loaded = await loadData();
    if (!loaded) return;
    Object.assign(data, loaded);
    resetFilters();
    state.currentPage = 'clientes';
    state.currentMenu = 'clientes';
    state.currentClientAction = 'listar';
    state.currentTablePage = 1;
    render();
    get('#auth-panel').classList.add('hidden');
    get('#application').classList.remove('hidden');
  }

  get('#auth-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector('button');
    submit.disabled = true;
    get('#auth-error').textContent = '';
    try {
      await signIn(form.elements.email.value, form.elements.password.value);
      await startSession();
    } catch (error) {
      get('#auth-error').textContent = error.message;
    } finally {
      form.elements.password.value = '';
      submit.disabled = false;
    }
  };

  startSession().catch((error) => { get('#auth-error').textContent = error.message; });
}
