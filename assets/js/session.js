import { data, state, get } from './data.js';
import { emptyData } from './data.js';
import { configureStorage, downloadBackup, loadData, restoreBackup, saveCompanyName, signIn, signOut, storageMode, supabaseConfig } from './backend.js';
export function setupSession({ render, resetFilters, closeModal }) {
  const modeField = get('#storage-mode');
  const settings = get('#supabase-settings');
  const localHelp = get('#local-help');
  const companySetting = get('#company-setting');
  const companyName = get('#company-name');
  const email = get('#auth-form [name=email]');
  const password = get('#auth-form [name=password]');
  const button = get('#auth-form button');
  const storageActions = get('#storage-actions');
  const updateStorageFields = () => {
    const local = modeField.value === 'local';
    settings.classList.toggle('hidden', local);
    localHelp.classList.toggle('hidden', !local);
    companySetting.classList.remove('hidden');
    email.disabled = local; password.disabled = local;
    email.required = !local; password.required = !local;
    button.textContent = local ? 'ABRIR BANCO LOCAL' : 'ENTRAR';
  };
  modeField.value = storageMode();
  const savedConfig = supabaseConfig();
  get('#supabase-url').value = savedConfig.url || '';
  get('#supabase-key').value = savedConfig.key || '';
  companyName.value = localStorage.getItem('atlas.company.name') || 'Atlas Máquinas & Obras';
  modeField.onchange = updateStorageFields;
  updateStorageFields();
  get('#exit').onclick = async () => {
    if (!get('#overlay').classList.contains('hidden') && !confirm('Há uma alteração em andamento. Sair descartará o rascunho atual. Continuar?')) return;
    const loginButton = get('#auth-form button');
    loginButton.disabled = true;
    get('#application').inert = true;
    get('#application').classList.add('hidden');
    storageActions.classList.add('hidden');
    Object.assign(data, emptyData());
    closeModal();
    render();
    get('#form').replaceChildren();
    get('#auth-panel').classList.remove('hidden');
    try {
      await signOut();
    } catch { /* As credenciais locais são sempre removidas. */ }
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
    storageActions.classList.toggle('hidden', storageMode() !== 'local');
  }

  get('#auth-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector('button');
    submit.disabled = true;
    get('#auth-error').textContent = '';
    try {
      const local = modeField.value === 'local';
      configureStorage(modeField.value, { url: get('#supabase-url').value, key: get('#supabase-key').value });
      await signIn(local ? '' : form.elements.email.value, local ? '' : form.elements.password.value);
      await saveCompanyName(companyName.value);
      await startSession();
    } catch (error) {
      get('#auth-error').textContent = error.message;
    } finally {
      form.elements.password.value = '';
      submit.disabled = false;
    }
  };

  get('#download-backup').onclick = () => downloadBackup().catch((error) => alert(error.message));
  get('#restore-backup').onclick = () => get('#restore-file').click();
  get('#restore-file').onchange = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file || !confirm('Restaurar este backup substituirá os dados locais atuais. Continuar?')) return;
    try { await restoreBackup(file, data); closeModal(); render(); }
    catch (error) { alert(`Não foi possível restaurar o backup: ${error.message}`); }
  };

  startSession().catch((error) => { get('#auth-error').textContent = error.message; });
}
