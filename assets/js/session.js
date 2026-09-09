import { data, state, get } from './data.js';
import { emptyData } from './data.js';
import { chooseBackupDirectory, configureStorage, configuredCompanyName, createManualBackup, loadBackupSettings, loadData, restoreBackup, saveBackupSettings, saveCompanyName, signIn, signOut, storageMode, supabaseConfig } from './backend.js';
import { setupDropdowns } from './form.js';
export function setupSession({ render, resetFilters, closeModal }) {
  const modeField = get('#storage-mode');
  const settings = get('#supabase-settings');
  const localHelp = get('#local-help');
  const companySetting = get('#company-setting');
  const companyName = get('#company-name');
  const companyFields = { nome: companyName, cnpj: get('#company-cnpj'), endereco: get('#company-address'), telefone: get('#company-phone'), email: get('#company-email') };
  const email = get('#auth-form [name=email]');
  const password = get('#auth-form [name=password]');
  const button = get('#auth-form button');
  const storageActions = get('#storage-actions');
  const backupSettings = get('#local-backup-settings');
  const backupDirectory = get('#backup-directory');
  const backupInterval = get('#backup-interval');
  const backupStatus = get('#backup-status');
  const settingsDialog = get('#settings-dialog');
  const settingsButton = get('#settings-button');
  const settingsLocal = get('#settings-local');
  const settingsSupabase = get('#settings-supabase');
  const settingsDirectory = get('#settings-directory');
  const settingsInterval = get('#settings-interval');
  const settingsStatus = get('#settings-backup-status');
  const settingsError = get('#settings-error');
  const settingsSave = get('#settings-save');
  let selectedBackupDirectory = '';
  let backupSettingsVersion = 0;
  let settingsDraft = null;
  const displayBackupDirectory = () => { backupDirectory.textContent = selectedBackupDirectory || 'Nenhuma pasta selecionada.'; };
  const applyCompanyName = (empresa) => {
    const profile = typeof empresa === 'string' ? { nome: empresa } : empresa || {};
    const value = profile.nome || 'Atlas Máquinas & Obras';
    localStorage.setItem('atlas.company.name', value);
    get('#brand-name').textContent = 'Atlas';
    get('#header-company-name').textContent = value;
    Object.entries(companyFields).forEach(([name, field]) => { field.value = profile[name] || (name === 'nome' ? value : ''); const key = name === 'nome' ? 'name' : name === 'endereco' ? 'address' : name === 'telefone' ? 'phone' : name; const settingsField = get(`#settings-company-${key}`); if (settingsField) settingsField.value = field.value; });
  };
  const backupMessage = (settings) => settings.lastError || (settings.lastBackupAt ? `Último backup automático: ${new Date(settings.lastBackupAt).toLocaleString('pt-BR')}` : 'Escolha uma pasta para ativar os backups automáticos.');
  const showBackupSettings = async () => {
    const version = ++backupSettingsVersion;
    try {
      const settings = await loadBackupSettings();
      if (version !== backupSettingsVersion) return;
      selectedBackupDirectory = settings.directory || '';
      displayBackupDirectory();
      backupInterval.value = String(settings.intervalMinutes || 15);
      setupDropdowns(get('#backup-interval-dropdown').parentElement);
      backupStatus.textContent = backupMessage(settings);
    } catch (error) { backupStatus.textContent = error.message; }
  };
  const updateStorageFields = () => {
    const local = modeField.value === 'local';
    settings.classList.toggle('hidden', local);
    backupSettings.classList.toggle('hidden', !local);
    localHelp.classList.toggle('hidden', !local);
    companySetting.classList.remove('hidden');
    email.disabled = local; password.disabled = local;
    email.required = !local; password.required = !local;
    button.textContent = local ? 'ABRIR BANCO LOCAL' : 'ENTRAR';
    if (local) showBackupSettings();
  };
  modeField.value = storageMode();
  const savedConfig = supabaseConfig();
  get('#supabase-url').value = savedConfig.url || '';
  get('#supabase-key').value = savedConfig.key || '';
  applyCompanyName(localStorage.getItem('atlas.company.name') || 'Atlas Máquinas & Obras');
  modeField.onchange = updateStorageFields;
  backupInterval.onchange = () => { backupSettingsVersion++; };
  updateStorageFields();
  setupDropdowns(get('#auth-panel'));
  get('#choose-backup-directory').onclick = async () => {
    const choose = get('#choose-backup-directory');
    choose.disabled = true;
    try {
      const result = await chooseBackupDirectory();
      if (result.directory) { backupSettingsVersion++; selectedBackupDirectory = result.directory; displayBackupDirectory(); }
    }
    catch (error) { backupStatus.textContent = error.message; }
    finally { choose.disabled = false; }
  };
  const persistBackupSettings = async () => {
    const settings = await saveBackupSettings({ directory: selectedBackupDirectory, intervalMinutes: Number(backupInterval.value) });
    backupSettingsVersion++; selectedBackupDirectory = settings.directory; displayBackupDirectory(); backupStatus.textContent = `Backups ativados. Último backup: ${new Date(settings.lastBackupAt).toLocaleString('pt-BR')}`;
    return settings;
  };
  get('#save-backup-settings').onclick = async () => {
    const save = get('#save-backup-settings');
    save.disabled = true;
    try { await persistBackupSettings(); } catch (error) { backupStatus.textContent = error.message; }
    finally { save.disabled = false; }
  };
  const closeSettings = () => { if (settingsDialog.open) settingsDialog.close(); };
  const fillSettingsDraft = (settings) => {
    settingsDraft = { directory: settings.directory || '', intervalMinutes: Number(settings.intervalMinutes || 15) };
    settingsDirectory.textContent = settingsDraft.directory || 'Nenhuma pasta selecionada.';
    settingsInterval.value = String(settingsDraft.intervalMinutes);
    settingsStatus.textContent = backupMessage(settings);
    setupDropdowns(settingsDialog);
  };
  settingsButton.onclick = async () => {
    settingsError.textContent = '';
    const local = storageMode() === 'local';
    settingsLocal.classList.toggle('hidden', !local);
    settingsSupabase.classList.toggle('hidden', local);
    settingsSave.classList.remove('hidden');
    settingsDialog.showModal();
    if (!local) return;
    try { fillSettingsDraft(await loadBackupSettings()); }
    catch (error) { settingsError.textContent = error.message; }
  };
  get('#close-settings').onclick = closeSettings;
  get('#settings-cancel').onclick = closeSettings;
  settingsDialog.onclose = () => { settingsDraft = null; settingsButton.focus(); };
  get('#settings-choose-directory').onclick = async () => {
    const choose = get('#settings-choose-directory');
    const draft = settingsDraft;
    if (!draft) return;
    choose.disabled = true;
    choose.textContent = 'Escolhendo pasta…';
    settingsError.textContent = '';
    try {
      const result = await chooseBackupDirectory();
      if (result.directory && settingsDraft === draft) { draft.directory = result.directory; settingsDirectory.textContent = result.directory; }
    } catch (error) { settingsError.textContent = error.message; }
    finally { choose.disabled = false; choose.textContent = 'Alterar pasta'; }
  };
  settingsInterval.onchange = () => { if (settingsDraft) settingsDraft.intervalMinutes = Number(settingsInterval.value); };
  settingsSave.onclick = async () => {
    settingsSave.disabled = true;
    settingsError.textContent = '';
    try {
      const profile = Object.fromEntries(['nome', 'cnpj', 'endereco', 'telefone', 'email'].map((name) => { const key = name === 'nome' ? 'name' : name === 'endereco' ? 'address' : name === 'telefone' ? 'phone' : name; return [name, get(`#settings-company-${key}`).value.trim()]; }));
      applyCompanyName((await saveCompanyName(profile)).empresa);
      if (storageMode() !== 'local') { closeSettings(); return; }
      const settings = await saveBackupSettings({ directory: settingsDraft.directory, intervalMinutes: Number(settingsInterval.value) });
      backupSettingsVersion++;
      selectedBackupDirectory = settings.directory || '';
      displayBackupDirectory();
      backupInterval.value = String(settings.intervalMinutes || 15);
      setupDropdowns(get('#auth-panel'));
      backupStatus.textContent = backupMessage(settings);
      closeSettings();
    } catch (error) { settingsError.textContent = error.message; }
    finally { settingsSave.disabled = false; }
  };
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
    applyCompanyName(configuredCompanyName());
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
      if (local) await persistBackupSettings();
      await signIn(local ? '' : form.elements.email.value, local ? '' : form.elements.password.value);
      applyCompanyName((await saveCompanyName(Object.fromEntries(Object.entries(companyFields).map(([name, field]) => [name, field.value.trim()])))).empresa);
      await startSession();
    } catch (error) {
      get('#auth-error').textContent = error.message;
    } finally {
      form.elements.password.value = '';
      submit.disabled = false;
    }
  };

  get('#download-backup').onclick = async () => {
    const backupButton = get('#download-backup');
    backupButton.disabled = true;
    try {
      const backup = await createManualBackup();
      if (!backup.opened) alert(`Backup concluído em ${backup.path}. Não foi possível abrir a pasta automaticamente.`);
    } catch (error) { alert(error.message); }
    finally { backupButton.disabled = false; }
  };
  get('#restore-backup').onclick = () => get('#restore-file').click();
  get('#restore-file').onchange = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file || !confirm('Restaurar este backup substituirá os dados locais atuais. Continuar?')) return;
    try { applyCompanyName((await restoreBackup(file, data)).empresa); closeModal(); render(); }
    catch (error) { alert(`Não foi possível restaurar o backup: ${error.message}`); }
  };

  startSession().catch((error) => { get('#auth-error').textContent = error.message; });
}
