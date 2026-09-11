import { data, state, get, approvedBudgets } from './data.js';
import { calculateBudgetTotal, createBudgetItemRecords, createBudgetRecord, filterBudgetClients, filterBudgetProducts, formatDateForInput, inactiveBudgetItemViolations } from './budget.js';
import { formatCurrency, recordsPerPage } from './table.js';
export function createBudgetFlow({ render, resetFilters, closeModal, persist }) {
  let selectedBudgetClientCode = "";
  let budgetQuantities = {};
  let selectedQuantities = {};
  let editingIndex = null;
  let originalItems = [];
  function renderBudgetClientOptions(search = '') {
    const optionsContainer = get('#budget-client-options');
    const clients = filterBudgetClients(data.clientes, search);
    optionsContainer.replaceChildren();

    if (clients.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.className = 'empty-options';
      emptyMessage.textContent = 'Nenhum cliente encontrado.';
      optionsContainer.append(emptyMessage);
      return;
    }

    clients.forEach((client) => {
      const option = document.createElement('label');
      option.className = 'client-option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'cliente';
      radio.value = String(client[0]);
      radio.checked = String(client[0]) === selectedBudgetClientCode;
      option.classList.toggle('selected', radio.checked);
      radio.onchange = () => {
        selectedBudgetClientCode = String(client[0]);
        optionsContainer.querySelectorAll('.client-option').forEach((clientOption) => {
          clientOption.classList.toggle(
            'selected',
            clientOption.querySelector('input').checked
          );
        });
        get('#confirm-budget-client').disabled = false;
      };

      const name = document.createElement('span');
      name.textContent = client[3];
      option.append(radio, name);
      optionsContainer.append(option);
    });
  }

  function openBudgetClientSelection() {
    editingIndex = null;
    originalItems = [];
    resetFilters();
    state.currentTablePage = 1;
    render();
    const form = get('#form');
    form.oninput = null;
    form.onchange = null;
    selectedBudgetClientCode = '';
    delete form.dataset.index;
    form.dataset.mode = 'budget-client-selection';
    get('#modal-title').textContent = 'Selecionar cliente';
    form.innerHTML = `
      <label class="modal-search">Pesquisar cliente
        <input id="budget-client-search" type="search" placeholder="Digite o nome do cliente" autocomplete="off">
      </label>
      <div class="client-options" id="budget-client-options"></div>
      <div class="footer">
        <button class="secondary" type="button" id="cancel">Cancelar</button>
        <button class="primary" id="confirm-budget-client" disabled>CONFIRMAR</button>
      </div>
    `;

    renderBudgetClientOptions();
    get('#budget-client-search').oninput = (event) => {
      renderBudgetClientOptions(event.target.value);
      get('#confirm-budget-client').disabled = !selectedBudgetClientCode;
    };
    get('#cancel').onclick = closeModal;
    get('#overlay').classList.remove('hidden');
  }

  function renderBudgetProductOptions(search = '', category = '') {
    const productsContainer = get('#budget-products');
    const products = filterBudgetProducts(data.itens, { search, category });
    productsContainer.replaceChildren();

    if (products.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.className = 'empty-options';
      emptyMessage.textContent = 'Nenhum produto encontrado.';
      productsContainer.append(emptyMessage);
      return;
    }

    products.forEach((product) => {
      const productRow = document.createElement('div');
      productRow.className = 'budget-product';
      productRow.classList.toggle('selected', Number(budgetQuantities[product[0]]) > 0);

      const details = document.createElement('div');
      const name = document.createElement('strong');
      const description = document.createElement('span');
      const value = document.createElement('span');
      name.textContent = product[2];
      description.textContent = product[3];
      const historicalItem = originalItems.find((item) => item[1] === product[0]);
      value.textContent = formatCurrency(historicalItem ? historicalItem[4] : product[4]);
      details.append(name, description, value);

      const quantityLabel = document.createElement('label');
      quantityLabel.textContent = 'Quantidade';
      const quantity = document.createElement('input');
      quantity.type = 'text';
      quantity.inputMode = 'numeric';
      quantity.pattern = '[0-9]*';
      quantity.value = budgetQuantities[product[0]] ?? '0';
      quantity.dataset.productCode = String(product[0]);
      quantity.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          get('#add-budget-items').click();
        }
      };
      quantity.oninput = () => {
        quantity.value = quantity.value.replace(/\D/g, '');
        budgetQuantities[product[0]] = quantity.value;
        productRow.classList.toggle('selected', Number(quantity.value) > 0);
        get('#budget-items-error').classList.add('hidden');
      };
      quantityLabel.append(quantity);

      productRow.append(details, quantityLabel);
      productsContainer.append(productRow);
    });
  }

  function selectedItems() {
    return createBudgetItemRecords({ budgetCode: null, products: data.itens, quantities: selectedQuantities }).map((item) => {
      const original = originalItems.find((row) => row[1] === item[1]);
      return original ? [null, item[1], original[2], item[3], original[4], item[3] * original[4], original[6] || ''] : item;
    });
  }

  function editBudget(index) {
    editingIndex = index;
    const budget = data.orcamentos[index];
    selectedBudgetClientCode = String(budget[1]);
    originalItems = data.itensOrcamento.filter((item) => item[0] === budget[0]);
    openBudgetItemsForm();
    const form = get('#form');
    form.elements.validade.value = formatDateForInput(budget[4]);
    get('#overlay').classList.remove('hidden');
  }

  function renderSelectedItems() {
    const container = get('#selected-budget-items');
    const itemsLocked = editingIndex !== null && approvedBudgets.has(data.orcamentos[editingIndex][0]);
    const items = itemsLocked ? originalItems.map((item) => [null, ...item.slice(1)]) : selectedItems();
    const isEditing = editingIndex !== null;
    container.replaceChildren();
    if (!items.length) container.textContent = 'Nenhum item adicionado.';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = isEditing ? `budget-selected-item${itemsLocked ? ' readonly' : ''}` : 'budget-product';
      const details = document.createElement('div');
      if (isEditing) details.className = 'budget-item-identity';
      const name = document.createElement('strong');
      name.textContent = item[2];
      details.append(name);
      const product = data.itens.find((row) => Number(row[0]) === Number(item[1]));
      const inactive = product?.[6] === 'Inativo';
      if (inactive) {
        const status = document.createElement('span');
        status.className = 'budget-inactive-product';
        status.textContent = 'Produto inativo';
        details.append(status);
      }
      if (isEditing && item[6]) {
        const description = document.createElement('span');
        description.textContent = item[6];
        details.append(description);
      }
      if (!isEditing) {
        const price = document.createElement('span');
        price.textContent = `${item[3]} x ${formatCurrency(item[4])} = ${formatCurrency(item[5])}`;
        details.append(price);
      }
      const quantityLabel = document.createElement('label');
      quantityLabel.className = 'budget-item-metric';
      const quantityCaption = document.createElement('span');
      quantityCaption.textContent = 'Quantidade';
      quantityLabel.append(quantityCaption);
      const quantityInput = document.createElement('input');
      quantityInput.type = 'number';
      quantityInput.min = '1';
      quantityInput.step = '1';
      quantityInput.required = true;
      const originalQuantity = originalItems.find((row) => Number(row[1]) === Number(item[1]))?.[3];
      if (inactive && originalQuantity != null) quantityInput.max = String(originalQuantity);
      quantityInput.value = item[3];
      quantityInput.setAttribute('aria-label', `Quantidade de ${item[2]}`);
      quantityInput.onchange = () => {
        if (!quantityInput.reportValidity()) return;
        selectedQuantities[item[1]] = Number(quantityInput.value);
        renderSelectedItems();
      };
      if (itemsLocked) {
        const quantity = document.createElement('strong');
        quantity.textContent = item[3];
        quantityLabel.append(quantity);
      } else {
        quantityLabel.append(quantityInput);
      }
      const unitPrice = document.createElement('div');
      unitPrice.className = 'budget-item-metric';
      unitPrice.innerHTML = `<span>Valor unitário</span><strong>${formatCurrency(item[4])}</strong>`;
      const subtotal = document.createElement('div');
      subtotal.className = 'budget-item-metric budget-item-subtotal';
      subtotal.innerHTML = `<span>Subtotal</span><strong>${formatCurrency(item[5])}</strong>`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = 'Remover';
      remove.setAttribute('aria-label', `Remover ${item[2]}`);
      remove.onclick = () => {
        delete selectedQuantities[item[1]];
        renderSelectedItems();
      };
      if (isEditing) {
        row.append(details, quantityLabel, unitPrice, subtotal);
        if (!itemsLocked) row.append(remove);
      } else {
        details.append(quantityLabel);
        row.append(details, remove);
      }
      container.append(row);
    });
    get('#budget-total').textContent = `Total: ${formatCurrency(calculateBudgetTotal(items))}`;
    get('#save-budget').disabled = !items.length;
  }

  function openBudgetItemsForm() {
    const form = get('#form');
    const selectedClient = data.clientes.find(
      (client) => String(client[0]) === selectedBudgetClientCode
    );
    budgetQuantities = {};
    selectedQuantities = Object.fromEntries(originalItems.map((item) => [item[1], item[3]]));
    const existingRecord = editingIndex === null ? null : data.orcamentos[editingIndex];
    const itemsLocked = Boolean(existingRecord && approvedBudgets.has(existingRecord[0]));
    form.oninput = null;
    form.onchange = null;
    form.dataset.mode = 'budget-items';
    get('#modal-title').textContent = existingRecord ? 'Editar orçamento' : 'Itens do orçamento';
    form.innerHTML = `
      ${existingRecord ? `<header class="budget-edit-heading"><div><strong>Orçamento ${existingRecord[0]}</strong><span>${itemsLocked ? 'Aprovado pelo cliente' : 'Pendente'}</span></div></header><section class="budget-edit-basics">` : ''}
      <label class="selected-client" id="selected-budget-client">Cliente</label>
      <label class="budget-validity">Data de validade
        <input required name="validade" type="date">
      </label>
      ${existingRecord ? '</section>' : ''}
      ${itemsLocked ? `<section class="budget-terms"><header class="budget-terms-heading"><h3>Condições comerciais</h3><p>Preenchimento opcional</p></header>
        <div class="budget-terms-grid">
          <label>Condições de pagamento<input name="pagamento" type="text"></label>
          <label>Prazo de entrega<input name="entrega" type="text"></label>
          <label class="budget-terms-full">Local de entrega<input name="localEntrega" type="text"></label>
          <label class="budget-terms-full">Observações<textarea name="observacoes" rows="4"></textarea></label>
        </div>
      </section>` : ''}
      <div class="budget-workspace${existingRecord ? ' budget-workspace-edit' : ''}${itemsLocked ? ' budget-workspace-approved' : ''}">
      ${itemsLocked ? '' : `<section class="budget-catalog" aria-label="Produtos disponíveis">
      <h3>Produtos disponíveis</h3>
      <div class="budget-product-filters">
        <label>Pesquisar produto
          <input id="budget-product-search" type="search" placeholder="Nome ou descrição" autocomplete="off">
        </label>
        <label>Categoria
          <select id="budget-product-category"><option value="">Todas</option></select>
        </label>
      </div>
      <div class="budget-products" id="budget-products"></div>
      <p class="form-error hidden" id="budget-items-error" role="alert">
        Selecione ao menos um item com quantidade maior que zero.
      </p>
      <div class="footer">
        ${existingRecord ? '' : '<button class="secondary" type="button" id="exit-budget-items">SAIR</button>'}
        <button class="primary" type="button" id="add-budget-items">ADICIONAR ITENS</button>
      </div>
      </section>`}
      <section class="budget-summary" aria-label="Itens do orçamento">
        <h3>Itens do orçamento</h3>
        ${itemsLocked ? '<p class="budget-readonly-note">Itens somente para consulta</p>' : ''}
        <div id="selected-budget-items" aria-live="polite"></div>
        <p id="budget-total" aria-live="polite"></p>
        ${existingRecord ? '' : '<button class="primary" id="save-budget" disabled>SALVAR ORÇAMENTO</button>'}
      </section>
      </div>
      ${existingRecord ? `<footer class="budget-edit-footer"><button class="secondary" type="button" id="exit-budget-items">SAIR</button><button class="primary" id="save-budget" disabled>SALVAR ORÇAMENTO</button></footer>` : ''}
    `;

    if (!existingRecord) get('#selected-budget-client').append(`: ${selectedClient[3]}`);
    if (editingIndex !== null) {
      const select = document.createElement('select');
      select.name = 'cliente';
      select.setAttribute('aria-label', 'Cliente');
      data.clientes.forEach((client) => select.append(new Option(`${client[3]} (c\u00f3digo ${client[0]})`, String(client[0]))));
      select.value = selectedBudgetClientCode;
      select.onchange = () => { selectedBudgetClientCode = select.value; };
      get('#selected-budget-client').append(select);
      const details = data.orcamentos[editingIndex][6] || {};
      ['pagamento', 'entrega', 'localEntrega', 'observacoes'].forEach((name) => { if (form.elements[name]) form.elements[name].value = details[name] || ''; });
    }
    const categoryFilter = get('#budget-product-category');
    if (!categoryFilter) {
      renderSelectedItems();
      get('#exit-budget-items').onclick = closeModal;
      return;
    }
    data.categorias.forEach((category) => {
      categoryFilter.append(new Option(category[1], category[1]));
    });
    const applyProductFilters = () => renderBudgetProductOptions(
      get('#budget-product-search').value,
      categoryFilter.value
    );
    get('#budget-product-search').oninput = applyProductFilters;
    get('#budget-product-search').onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
      }
    };
    categoryFilter.onchange = applyProductFilters;
    renderBudgetProductOptions();
    renderSelectedItems();
    get('#add-budget-items').onclick = () => {
      const items = createBudgetItemRecords({ budgetCode: null, products: data.itens, quantities: budgetQuantities });
      if (!items.length) {
        get('#budget-items-error').classList.remove('hidden');
        return;
      }
      items.forEach((item) => {
        selectedQuantities[item[1]] = Number(selectedQuantities[item[1]] || 0) + item[3];
      });
      budgetQuantities = {};
      applyProductFilters();
      renderSelectedItems();
    };

    get('#exit-budget-items').onclick = closeModal;
  }


  async function submit(form, previous) {
    if (form.dataset.mode === 'budget-client-selection') {
      if (selectedBudgetClientCode) {
        openBudgetItemsForm();
      }
      return;
    }

    if (form.dataset.mode === 'budget-items') {
      const selectedClient = data.clientes.find(
        (client) => String(client[0]) === selectedBudgetClientCode
      );
      const existingRecord = editingIndex === null ? undefined : data.orcamentos[editingIndex];
      const budgetCode = existingRecord?.[0] ?? null;
      const approvedEdit = Boolean(existingRecord && approvedBudgets.has(budgetCode));
      const budgetItems = (approvedEdit ? originalItems : selectedItems())
        .map((item) => [budgetCode, ...item.slice(1)]);

      if (!approvedEdit && inactiveBudgetItemViolations(data.itens, originalItems, selectedQuantities).length) {
        const error = get('#budget-items-error');
        if (error) {
          error.textContent = 'Produtos inativos só podem manter ou reduzir a quantidade já salva.';
          error.classList.remove('hidden');
        }
        return;
      }

      if (budgetItems.length === 0) {
        get('#budget-items-error')?.classList.remove('hidden');
        return;
      }

      if (existingRecord && !confirm(approvedEdit
        ? "Confirma a altera\u00e7\u00e3o deste or\u00e7amento?"
        : "Confirma a altera\u00e7\u00e3o deste or\u00e7amento e seus itens?")) return;
      const record = createBudgetRecord({
        code: budgetCode,
        client: selectedClient[3],
        clientCode: selectedClient[0],
        validity: form.elements.validade.value,
        total: calculateBudgetTotal(budgetItems),
        existingRecord,
        details: { ...(existingRecord?.[6] || {}), ...Object.fromEntries(['pagamento', 'entrega', 'localEntrega', 'observacoes'].filter((name) => form.elements[name]).map((name) => [name, form.elements[name].value.trim()])), company: { ...structuredClone(data.empresa || {}), ...(existingRecord?.[6]?.company || {}) }, client: existingRecord?.[1] === selectedClient[0] && existingRecord?.[6]?.client ? { ...clientSnapshot(selectedClient), ...existingRecord[6].client } : clientSnapshot(selectedClient) }
      });
      if (existingRecord) {
        data.orcamentos[editingIndex] = record;
        data.itensOrcamento = data.itensOrcamento.filter((item) => item[0] !== budgetCode);
      } else {
        data.orcamentos.push(record);
      }
      data.itensOrcamento.push(...budgetItems);
      if (!await persist(previous)) return;
      if (!existingRecord) state.currentTablePage = Math.ceil(data.orcamentos.length / recordsPerPage);
      closeModal();
      render();
      return;
    }

  }
  function clientSnapshot(client) {
    const code = client[0];
    const contact = data.contatosClientes.find((row) => row[0] === code) || [];
    const phone = data.telefonesClientes.find((row) => row[1] === code && row[3]) || data.telefonesClientes.find((row) => row[1] === code);
    const address = data.enderecosClientes.find((row) => row[1] === code && row[10]) || data.enderecosClientes.find((row) => row[1] === code);
    return { tipo: client[1], documento: client[2], nome: client[3], email: contact[1] || '', contato: client[1] === 'Pessoa Jurídica' ? contact[2] || '' : '', telefone: phone?.[2] || '', endereco: address ? (address[9] || [address[3], address[4], address[5], address[6], address[7], address[8], address[2]].filter(Boolean).join(', ')) : '' };
  }
  return { openBudgetClientSelection, editBudget, submit };
}
