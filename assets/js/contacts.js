import { data, get } from './data.js';

const addressFields = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'textoLegado'];
const labels = { cep: 'CEP', logradouro: 'Logradouro', numero: 'Número', complemento: 'Complemento', bairro: 'Bairro', cidade: 'Cidade', uf: 'UF' };

export function createContacts({ persist }) {
  const dialog = get('#contact-dialog');
  const form = get('#contact-form');
  let clientIndex = -1;
  let editing = false;
  let saving = false;
  let draft;

  const normalizePrincipals = (rows) => {
    if (!rows.length) return rows;
    if (!rows.some((row) => row.principal)) rows[0].principal = true;
    let found = false;
    rows.forEach((row) => { row.principal = row.principal && !found; found ||= row.principal; });
    return rows;
  };

  function current() {
    const client = data.clientes[clientIndex];
    const code = client[0];
    const contact = data.contatosClientes.find((row) => row[0] === code);
    return {
      client,
      email: contact?.[1] || '', pessoa: contact?.[2] || '',
      phones: data.telefonesClientes.filter((row) => row[1] === code).map((row) => ({ id: row[0], telefone: row[2], principal: row[3] })),
      addresses: data.enderecosClientes.filter((row) => row[1] === code).map((row) => ({ id: row[0], cep: row[2], logradouro: row[3], numero: row[4], complemento: row[5], bairro: row[6], cidade: row[7], uf: row[8], textoLegado: row[9], principal: row[10] }))
    };
  }

  function syncTopFields() {
    if (form.elements.email) draft.email = form.elements.email.value;
    if (form.elements.pessoa) draft.pessoa = form.elements.pessoa.value;
  }

  function setError(message = '') {
    const error = form.querySelector('#contact-error');
    if (error) error.textContent = message;
  }

  function viewValue(label, value, empty = 'Não informado') {
    return `<div class="contact-view-value"><span>${label}</span><strong>${escapeText(value || empty)}</strong></div>`;
  }

  function render() {
    const { client } = draft;
    get('#contact-title').textContent = `Contato — ${client[3]}`;
    get('#contact-identity').textContent = `Código ${client[0]} · ${client[1] === 'Pessoa Jurídica' ? 'CNPJ' : 'CPF'}: ${client[2]}`;
    const pj = client[1] === 'Pessoa Jurídica';
    form.innerHTML = `
      <section class="contact-section contact-details"><h3>Contato</h3>
        ${editing ? `<label>E-mail<input name="email" type="email" required value="${escapeAttribute(draft.email)}"></label>${pj ? `<label>Pessoa de contato<input name="pessoa" required value="${escapeAttribute(draft.pessoa)}"></label>` : ''}` : `${viewValue('E-mail', draft.email)}${pj ? viewValue('Pessoa de contato', draft.pessoa) : ''}`}
      </section>
      <section class="contact-section"><div class="contact-section-heading"><h3 class="contact-field-label">Telefones</h3>${editing ? '<button type="button" class="secondary" id="add-phone">Adicionar telefone</button>' : ''}</div><div id="contact-phones"></div></section>
      <section class="contact-section"><div class="contact-section-heading"><h3 class="contact-field-label">Endereços</h3>${editing ? '<button type="button" class="secondary" id="add-address">Adicionar endereço</button>' : ''}</div><div id="contact-addresses"></div></section>
      <p id="contact-error" class="contact-error" role="alert"></p>
      <div class="footer"><button type="button" class="secondary" id="contact-cancel">${editing ? 'Cancelar' : 'Fechar'}</button>${editing ? '<button class="primary" type="submit">Salvar</button>' : '<button type="button" class="primary" id="edit-contact">Editar</button>'}</div>`;
    renderPhones(); renderAddresses();
    get('#contact-cancel').onclick = () => editing ? (editing = false, draft = current(), render()) : dialog.close();
    if (editing) {
      get('#add-phone').onclick = () => { syncTopFields(); draft.phones.push({ id: null, telefone: '', principal: !draft.phones.length }); render(); form.querySelector('#contact-phones .contact-row:last-child input[type=tel]')?.focus(); };
      get('#add-address').onclick = () => { syncTopFields(); draft.addresses.push(Object.fromEntries([...addressFields.map((key) => [key, '']), ['id', null], ['principal', !draft.addresses.length]])); render(); form.querySelector('#contact-addresses .contact-address:last-child [name=cep]')?.focus(); };
    } else get('#edit-contact').onclick = () => { editing = true; render(); };
  }

  function renderPhones() {
    const container = get('#contact-phones');
    if (!draft.phones.length) { container.innerHTML = '<p class="contact-empty">Nenhum telefone cadastrado.</p>'; return; }
    draft.phones.forEach((phone, index) => {
      const row = document.createElement('div'); row.className = 'contact-row';
      if (editing) row.innerHTML = `<input type="tel" required aria-label="Telefone ${index + 1}" value="${escapeAttribute(phone.telefone)}"><label class="principal-choice"><input type="radio" name="principal-phone" ${phone.principal ? 'checked' : ''}> Principal</label><button type="button" class="secondary" ${draft.phones.length === 1 ? 'disabled title="É necessário manter um telefone"' : ''}>Remover</button>`;
      else row.innerHTML = `<strong>${escapeText(phone.telefone)}</strong>${phone.principal ? '<span class="principal-badge">Principal</span>' : ''}`;
      const input = row.querySelector('input[type=tel]');
      if (input) input.oninput = (event) => { phone.telefone = event.target.value; setError(); };
      row.querySelector('input[type=radio]')?.addEventListener('change', () => { draft.phones.forEach((item, position) => { item.principal = position === index; }); });
      row.querySelector('button')?.addEventListener('click', () => { syncTopFields(); draft.phones.splice(index, 1); normalizePrincipals(draft.phones); render(); });
      container.append(row);
    });
  }

  function renderAddresses() {
    const container = get('#contact-addresses');
    if (!draft.addresses.length) { container.innerHTML = '<p class="contact-empty">Nenhum endereço cadastrado.</p>'; return; }
    draft.addresses.forEach((address, index) => {
      const row = document.createElement('article'); row.className = 'contact-address';
      if (!editing) {
        const lines = [[address.logradouro, address.numero].filter(Boolean).join(', '), address.complemento, [address.bairro, address.cidade, address.uf].filter(Boolean).join(' · '), address.cep ? `CEP ${address.cep}` : '', address.textoLegado].filter(Boolean);
        row.innerHTML = `<div><strong>Endereço ${index + 1}</strong>${address.principal ? '<span class="principal-badge">Principal</span>' : ''}</div>${lines.map((line) => `<p>${escapeText(line)}</p>`).join('')}`;
      } else {
        row.innerHTML = `<div class="contact-address-heading"><strong>Endereço ${index + 1}</strong><label class="principal-choice"><input type="radio" name="principal-address" ${address.principal ? 'checked' : ''}> Principal</label><button type="button" class="secondary">Remover</button></div>${address.textoLegado ? `<p class="legacy-address">Endereço anterior: ${escapeText(address.textoLegado)}</p>` : ''}<div class="contact-address-grid">${addressFields.slice(0, 7).map((key) => `<label>${labels[key]}<input name="${key}" value="${escapeAttribute(address[key])}" ${key === 'uf' ? 'maxlength="2"' : ''}></label>`).join('')}</div>`;
        addressFields.slice(0, 7).forEach((key) => { row.querySelector(`[name=${key}]`).oninput = (event) => { address[key] = event.target.value; setError(); }; });
        row.querySelector('input[type=radio]').onchange = () => draft.addresses.forEach((item, position) => { item.principal = position === index; });
        row.querySelector('button').addEventListener('click', () => { syncTopFields(); draft.addresses.splice(index, 1); normalizePrincipals(draft.addresses); render(); });
      }
      container.append(row);
    });
  }

  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!editing || saving) return;
    syncTopFields();
    const email = draft.email.trim();
    if (!email || !form.elements.email.checkValidity()) { setError('Informe um e-mail válido.'); form.elements.email.focus(); return; }
    if (draft.client[1] === 'Pessoa Jurídica' && !draft.pessoa.trim()) { setError('Informe a pessoa de contato.'); form.elements.pessoa.focus(); return; }
    if (!draft.phones.length || draft.phones.some((phone) => !phone.telefone.trim())) { setError('Informe pelo menos um telefone e remova os campos vazios.'); return; }
    for (const address of draft.addresses) {
      const hasValue = addressFields.some((key) => address[key]?.trim());
      if (!hasValue) { setError('Preencha ou remova os endereços vazios.'); return; }
      if (address.cep && !/^\d{5}-?\d{3}$/.test(address.cep.trim())) { setError('Informe o CEP com oito dígitos.'); return; }
      if (address.uf && !/^[A-Za-z]{2}$/.test(address.uf.trim())) { setError('Informe a UF com duas letras.'); return; }
    }
    normalizePrincipals(draft.phones); normalizePrincipals(draft.addresses);
    const previous = structuredClone(data); const code = draft.client[0];
    data.contatosClientes = data.contatosClientes.filter((row) => row[0] !== code);
    data.contatosClientes.push([code, email, draft.client[1] === 'Pessoa Jurídica' ? draft.pessoa.trim() : '']);
    data.telefonesClientes = data.telefonesClientes.filter((row) => row[1] !== code).concat(draft.phones.map((row) => [row.id, code, row.telefone.trim(), row.principal]));
    data.enderecosClientes = data.enderecosClientes.filter((row) => row[1] !== code).concat(draft.addresses.map((row) => [row.id, code, row.cep.trim(), row.logradouro.trim(), row.numero.trim(), row.complemento.trim(), row.bairro.trim(), row.cidade.trim(), row.uf.trim().toUpperCase(), row.textoLegado || '', row.principal]));
    saving = true;
    form.querySelectorAll('button, input').forEach((element) => { element.disabled = true; });
    try { if (await persist(previous)) { editing = false; dialog.close(); } }
    finally { saving = false; if (dialog.open && editing) render(); }
  };
  get('#close-contact').onclick = () => { if (!saving) dialog.close(); };
  return { open(index) { clientIndex = index; editing = false; saving = false; draft = current(); dialog.showModal(); render(); } };
}

function escapeAttribute(value) { return String(value || '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'); }
function escapeText(value) { return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
