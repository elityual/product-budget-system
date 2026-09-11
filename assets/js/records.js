import { printBudget } from './budget-print.js';
import { data, state, get, permissions, approvedBudgets } from './data.js';
import { pages } from './config.js';
import { createField, setupComboboxes, setupDropdowns } from './form.js';
import { formatCnpj, formatCpf, validateRecord } from './validation.js';
import { getDeletionError, updateRelatedRecords } from './relations.js';
import { confirmPassword, approveBudget, storageMode } from './backend.js';
import { formatDateForInput, createBudgetRecord } from './budget.js';
import { recordsPerPage } from './table.js';
export function createRecords({ render, resetFilters, persist, isSaving, setSaving, submitBudget, editBudget, openContact }) {
  function askDeletionPassword() {
    const dialog = get('#delete-password');
    const field = dialog.querySelector('input');
    field.value = '';
    dialog.returnValue = '';
    return new Promise((resolve) => {
      dialog.addEventListener('close', () => {
        const password = dialog.returnValue === 'confirm' ? field.value : null;
        field.value = '';
        resolve(password);
      }, { once: true });
      dialog.showModal();
    });
  }

  function openModal(index = null) {
    if (state.currentPage === 'orcamentos' && index !== null) {
      editBudget(index);
      return;
    }
    const page = pages[state.currentPage];
    const form = get('#form');
    const isEditing = index !== null;

    if (!isEditing) {
      resetFilters();
      state.currentTablePage = 1;
      render();
    }

    delete form.dataset.mode;

    get('#modal-title').textContent = isEditing
      ? 'Editar registro'
      : page.button.replace('+ ', '');
    const dynamicOptions = state.currentPage === 'orcamentos'
      ? { cliente: data.clientes.map((client) => client[3]) }
      : {};
    form.innerHTML = `
      ${page.fields
        .map((field) => createField(field, data.categorias, dynamicOptions))
        .join('')}
      <div class="footer">
        <button class="secondary" type="button" id="cancel">Cancelar</button>
        <button class="primary">SALVAR</button>
      </div>
    `;

    if (state.currentPage === 'clientes' && !isEditing) {
      form.dataset.mode = 'new-client';
      form.innerHTML = `<section class="client-create-section"><h3>Dados do cliente</h3>${pages.clientes.fields.map((field) => createField(field, data.categorias, dynamicOptions)).join('')}</section>
        <section class="client-create-section"><h3>Contato obrigatório</h3><label>E-mail<input required name="email" type="email"></label><label class="new-client-person">Pessoa de contato<input name="pessoa" type="text"></label><div><span class="field-label">Telefones</span><div id="new-client-phones"></div><button class="secondary" type="button" id="new-client-add-phone">Adicionar telefone</button></div></section><div class="footer"><button class="secondary" type="button" id="cancel">Cancelar</button><button class="primary">SALVAR</button></div>`;
      const phones = [''];
      const renderPhones = () => { const holder = get('#new-client-phones'); holder.replaceChildren(); phones.forEach((value, phoneIndex) => { const row = document.createElement('div'); row.className = 'contact-row'; row.innerHTML = `<input required type="tel" aria-label="Telefone ${phoneIndex + 1}" value="${value}"><span class="principal-badge">${phoneIndex === 0 ? 'Principal' : 'Adicional'}</span>${phones.length > 1 ? '<button type="button" class="secondary">Remover</button>' : ''}`; const input = row.querySelector('input'); input.oninput = () => { phones[phoneIndex] = input.value; }; row.querySelector('button')?.addEventListener('click', () => { phones.splice(phoneIndex, 1); renderPhones(); }); holder.append(row); }); };
      renderPhones(); get('#new-client-add-phone').onclick = () => { phones.push(''); renderPhones(); };
      const person = form.querySelector('.new-client-person');
      const updateContactType = () => { const legal = form.elements.tipo.value === 'Pessoa Jurídica'; person.classList.toggle('hidden', !legal); person.querySelector('input').required = legal; if (!legal) person.querySelector('input').value = ''; };
      form.elements.tipo.addEventListener('change', updateContactType); updateContactType();
      form.dataset.phones = JSON.stringify(phones);
      form.querySelector('#new-client-phones').addEventListener('input', () => { form.dataset.phones = JSON.stringify(phones); });
    }

    if (state.currentPage === 'orcamentos') {
      form.elements.cliente.replaceChildren(...data.clientes.map((client) =>
        new Option(`${client[3]} (código ${client[0]})`, String(client[0]))
      ));
    }

    if (isEditing) {
      form.dataset.index = index;
      const fieldValueIndexes = state.currentPage === 'itens'
        ? [1, 2, 3, 4, 6]
        : state.currentPage === 'orcamentos'
          ? [1, 4]
          : page.fields.map((_, position) => position + 1);

      form.querySelectorAll('input, select').forEach((field, position) => {
        const value = data[state.currentPage][index][fieldValueIndexes[position]] ?? '';
        field.value = field.type === 'date' ? formatDateForInput(value) : value;
      });
    } else {
      delete form.dataset.index;
    }

    setupComboboxes(form);
    setupDropdowns(form);

    const clearValidationErrors = () => {
      page.fields.forEach(([name]) => form.elements[name].setCustomValidity(''));
    };
    form.oninput = clearValidationErrors;
    form.onchange = clearValidationErrors;

    if (state.currentPage === 'clientes') {
      const documentField = form.elements.documento;
      const updateDocumentFormat = () => {
        const isCpf = form.elements.tipo.value === 'Pessoa Física';
        documentField.placeholder = isCpf ? '000.000.000-00' : '00.000.000/0000-00';
        if (isCpf) {
          documentField.pattern = '[0-9]{3}\\.[0-9]{3}\\.[0-9]{3}-[0-9]{2}';
          documentField.value = formatCpf(documentField.value);
        } else {
          documentField.pattern = '[A-Z0-9]{2}\\.[A-Z0-9]{3}\\.[A-Z0-9]{3}/[A-Z0-9]{4}-[0-9]{2}';
          documentField.value = formatCnpj(documentField.value);
        }
      };
      documentField.oninput = updateDocumentFormat;
      form.elements.tipo.onchange = updateDocumentFormat;
      updateDocumentFormat();
    }

    get('#overlay').classList.remove('hidden');
    get('#cancel').onclick = closeModal;
  }

  function closeModal() {
    get('#overlay').classList.add('hidden');

    if (state.currentPage === 'clientes' && state.currentClientAction === 'incluir') {
      state.currentClientAction = 'listar';
      render();
    }

    if (state.currentPage === 'itens' && state.currentProductAction === 'incluir') {
      state.currentProductAction = 'listar';
      render();
    }

    if (state.currentPage === 'orcamentos' && state.currentBudgetAction === 'incluir') {
      state.currentBudgetAction = 'listar';
      render();
    }
  }

  function edit(index) {
    openModal(index);
  }

  let selectedApprovalCode = '';

  function lockApprovalSelection(budget) {
    selectedApprovalCode = String(budget[0]);
    get('#approval-search').closest('label').classList.add('hidden');
    get('#approval-options').classList.add('hidden');
    const summary = get('#selected-approval-summary');
    get('#selected-approval-title').textContent = `Orçamento ${budget[0]} — ${budget[2]}`;
    get('#selected-approval-dates').textContent = `Criado em: ${budget[3]} · Validade: ${budget[4]}`;
    summary.classList.remove('hidden');
    get('#approval-error').classList.add('hidden');
    get('#confirm-approval').disabled = false;
    const terms = get('#approval-terms');
    terms.classList.remove('hidden');
    const commercial = budget[6] || {};
    ['pagamento', 'entrega', 'localEntrega', 'observacoes'].forEach((name) => { terms.querySelector(`[name="${name}"]`).value = commercial[name] || ''; });
    terms.querySelector('[name="pagamento"]').focus();
  }

  function renderApprovalOptions(search = '') {
    const options = get('#approval-options');
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    const pending = data.orcamentos.filter((row) => {
      if (approvedBudgets.has(row[0])) return false;
      return `${row[0]} ${row[2]}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch);
    });
    options.replaceChildren();
    if (!pending.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-options';
      empty.textContent = 'Nenhum orçamento pendente encontrado.';
      options.append(empty);
      return;
    }
    pending.forEach((budget) => {
      const option = document.createElement('label');
      option.className = 'client-option approval-option';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'approval-budget';
      radio.value = String(budget[0]);
      radio.checked = radio.value === selectedApprovalCode;
      option.classList.toggle('selected', radio.checked);
      radio.onchange = () => {
        if (selectedApprovalCode) return;
        lockApprovalSelection(budget);
      };
      const details = document.createElement('span');
      details.className = 'approval-details';
      const title = document.createElement('strong');
      title.textContent = `Orçamento ${budget[0]} — ${budget[2]}`;
      const dates = document.createElement('span');
      dates.textContent = `Criado em: ${budget[3]} · Validade: ${budget[4]}`;
      details.append(title, dates);
      option.append(radio, details);
      options.append(option);
    });
  }

  get('#approve-budget').onclick = () => {
    if (isSaving()) return;
    const dialog = get('#approval-dialog');
    selectedApprovalCode = '';
    get('#approval-search').value = '';
    get('#approval-search').closest('label').classList.remove('hidden');
    get('#approval-options').classList.remove('hidden');
    get('#selected-approval-summary').classList.add('hidden');
    get('#selected-approval-title').textContent = '';
    get('#selected-approval-dates').textContent = '';
    get('#approval-error').classList.add('hidden');
    get('#approval-terms').classList.add('hidden');
    get('#approval-dialog').querySelectorAll('#approval-terms input, #approval-terms textarea').forEach((field) => { field.value = ''; });
    get('#confirm-approval').disabled = true;
    renderApprovalOptions();
    dialog.returnValue = '';
    dialog.showModal();
    get('#approval-search').focus();
  };
  get('#approval-search').oninput = (event) => renderApprovalOptions(event.target.value);
  get('#approval-search').onkeydown = (event) => {
    if (event.key === 'Enter') event.preventDefault();
  };
  get('#close-approval').onclick = () => get('#approval-dialog').close('cancel');
  get('#approval-dialog').querySelector('form').onsubmit = (event) => {
    if (event.submitter?.value !== 'approve') return;
    event.preventDefault();
    const code = Number(selectedApprovalCode);
    const index = data.orcamentos.findIndex((row) => row[0] === code);
    if (index >= 0) void approveRecord(index);
  };

  async function approveRecord(index) {
    const budget = data.orcamentos[index];
    if (!budget || isSaving() || !confirm(`Registrar que o cliente aprovou o orçamento de código ${budget[0]}?`)) return;
    const terms = get('#approval-terms');
    const conditions = Object.fromEntries(['pagamento', 'entrega', 'localEntrega', 'observacoes'].map((name) => [name, terms.querySelector(`[name="${name}"]`).value.trim()]));
    setSaving(true);
    get('#application').inert = true;
    try {
      await approveBudget(budget[0], data, conditions);
      get('#approval-dialog').close('approve');
      render();
    } catch (error) { alert(error.message); }
    finally { setSaving(false); get('#application').inert = false; }
  }

  async function removeRecord(index) {
    if (!permissions.isAdmin && state.currentPage !== 'orcamentos') return;
    if (isSaving()) return;
    const error = getDeletionError(data, state.currentPage, index);
    if (error) {
      alert(error);
      return;
    }
    const confirmed = confirm(
      'Confirma a exclusão deste registro?'
    );

    if (confirmed) {
      if (storageMode() === 'supabase') {
        const password = await askDeletionPassword();
        if (password === null) return;
        setSaving(true);
        get('#application').inert = true;
        try {
          await confirmPassword(password);
        } catch (error) {
          alert(error.message);
          return;
        } finally {
          setSaving(false);
          get('#application').inert = false;
        }
      }
      const previous = structuredClone(data);
      if (state.currentPage === 'orcamentos') {
        const budgetCode = data.orcamentos[index][0];
        data.itensOrcamento = data.itensOrcamento.filter(
          (item) => item[0] !== budgetCode
        );
      }
      if (state.currentPage === 'clientes') {
        const clientCode = data.clientes[index][0];
        data.contatosClientes = data.contatosClientes.filter((row) => row[0] !== clientCode);
        data.telefonesClientes = data.telefonesClientes.filter((row) => row[1] !== clientCode);
        data.enderecosClientes = data.enderecosClientes.filter((row) => row[1] !== clientCode);
      }
      data[state.currentPage].splice(index, 1);
      if (!await persist(previous)) return;
      render();
    }
  }

  get('#close').onclick = closeModal;
  get('#overlay').onclick = (event) => {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  };

  get('#tbody').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || isSaving()) return;
    const index = Number(button.dataset.index);
    if (button.dataset.action === 'print' && state.currentPage === 'orcamentos') printBudget(data, index, approvedBudgets.has(data.orcamentos[index][0]));
    if (button.dataset.action === 'contact' && state.currentPage === 'clientes') openContact(index);
    if (button.dataset.action === 'edit') edit(index);
    if (button.dataset.action === 'delete') void removeRecord(index);
  });

  get('#form').onsubmit = async (event) => {
    event.preventDefault();
    if (isSaving()) return;
    const previous = structuredClone(data);
    const form = event.target;
    if (['budget-client-selection', 'budget-items'].includes(form.dataset.mode)) {
      await submitBudget(form, previous);
      return;
    }
    if (form.dataset.mode === 'new-client') {
      const result = validateRecord('clientes', Object.fromEntries(new FormData(form)), data.clientes);
      for (const [name, message] of Object.entries(result.errors)) form.elements[name].setCustomValidity(message);
      const phones = [...form.querySelectorAll('#new-client-phones input')].map((input) => input.value.trim());
      if (!phones.length || phones.some((phone) => !phone)) { alert('Informe pelo menos um telefone.'); return; }
      if (!form.elements.email.reportValidity()) return;
      if (result.errors.documento || result.errors.nome || !form.reportValidity()) return;
      data.novoClienteContato = { email: form.elements.email.value.trim(), pessoa: form.elements.tipo.value === 'Pessoa Jurídica' ? form.elements.pessoa.value.trim() : '', telefones: phones };
      data.clientes.push([null, result.values.tipo, result.values.documento, result.values.nome]);
      state.currentTablePage = Math.ceil(data.clientes.length / recordsPerPage);
      if (!await persist(previous)) return;
      closeModal(); render(); return;
    }
    const categoryField = form.elements.categoria;

    if (state.currentPage === 'itens' && categoryField) {
      const availableCategories = data.categorias.map((category) => category[1]);
      const isAvailableCategory = availableCategories.includes(categoryField.value);

      if (!isAvailableCategory) {
        categoryField.setCustomValidity('Selecione uma categoria cadastrada.');
        categoryField.reportValidity();
        return;
      }
    }

    const index = form.dataset.index;
    const result = validateRecord(
      state.currentPage,
      Object.fromEntries(new FormData(form)),
      data[state.currentPage],
      index === undefined ? undefined : Number(index)
    );
    for (const [name, message] of Object.entries(result.errors)) {
      form.elements[name].setCustomValidity(message);
    }
    if (!form.reportValidity()) return;
    const values = pages[state.currentPage].fields.map(([name]) => result.values[name]);

    if (index !== undefined && ['clientes', 'categorias', 'itens'].includes(state.currentPage)) {
      const recordReference =
        state.currentPage === 'clientes' ? 'deste cliente'
          : state.currentPage === 'itens' ? 'deste produto' : 'desta categoria';

      const removesContactPerson = state.currentPage === 'clientes' && data.clientes[index][1] === 'Pessoa Jurídica' && values[0] === 'Pessoa Física' && data.contatosClientes.some((row) => row[0] === data.clientes[index][0] && row[2]);
      const warning = removesContactPerson ? ' A pessoa de contato vinculada será removida.' : '';
      if (!confirm(`Confirma a alteração dos dados ${recordReference}?${warning}`)) {
        return;
      }
    }

    if (state.currentPage === 'itens') {
      const recordCode = index !== undefined
        ? data.itens[index][0]
        : null;
      const registrationDate = index !== undefined
        ? data.itens[index][5]
        : new Date().toLocaleDateString('pt-BR');
      const productRecord = [
        recordCode,
        ...values.slice(0, 4),
        registrationDate,
        values[4]
      ];

      if (index !== undefined) {
        data.itens[index] = productRecord;
      } else {
        data.itens.push(productRecord);
        state.currentTablePage = Math.ceil(data.itens.length / recordsPerPage);
      }
    } else if (state.currentPage === 'orcamentos') {
      const client = data.clientes.find((client) => String(client[0]) === values[0]);
      if (!client) {
        alert('Selecione um cliente cadastrado.');
        return;
      }
      const existingRecord = index !== undefined ? data.orcamentos[index] : undefined;
      const recordCode = existingRecord?.[0] ?? null;
      const budgetRecord = createBudgetRecord({
        code: recordCode,
        client: client[3],
        clientCode: client[0],
        validity: values[1],
        existingRecord
      });

      if (index !== undefined) {
        data.orcamentos[index] = budgetRecord;
      } else {
        data.orcamentos.push(budgetRecord);
        state.currentTablePage = Math.ceil(data.orcamentos.length / recordsPerPage);
      }
    } else if (index !== undefined) {
      const recordCode = data[state.currentPage][index][0];
      const record = [recordCode, ...values];
      if (state.currentPage === 'clientes' && record[1] === 'Pessoa Física') {
        const contact = data.contatosClientes.find((row) => row[0] === recordCode);
        if (contact) contact[2] = '';
      }
      updateRelatedRecords(data, state.currentPage, data[state.currentPage][index], record);
      data[state.currentPage][index] = record;
    } else {
      const recordCode = null;
      data[state.currentPage].push([recordCode, ...values]);
      state.currentTablePage = Math.ceil(
        data[state.currentPage].length / recordsPerPage
      );
    }

    if (!await persist(previous)) return;
    closeModal();
    render();
  };

  return { openModal, closeModal };
}
