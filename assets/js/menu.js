import { clientActionContent, pages } from './config.js';
import {
  calculateBudgetTotal,
  createBudgetItemRecords,
  createBudgetRecord,
  filterBudgetClients,
  filterBudgetProducts,
  formatDateForInput
} from './budget.js';
import { data, getNextRecordCode } from './data.js';
import { createField, setupComboboxes, setupDropdowns } from './form.js';
import {
  createRow,
  filterRows,
  formatCurrency,
  paginateRows,
  recordsPerPage
} from './table.js';

const state = {
  currentPage: 'clientes',
  currentMenu: 'clientes',
  currentClientAction: 'listar',
  currentProductAction: 'listar',
  currentBudgetAction: 'listar',
  currentTablePage: 1
};

const get = (selector) => document.querySelector(selector);
let selectedBudgetClientCode = '';
let budgetQuantities = {};

function updateHeaderDate() {
  const currentDate = new Date();
  const dateElement = get('#current-date');
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const day = String(currentDate.getDate()).padStart(2, '0');

  dateElement.dateTime = `${year}-${month}-${day}`;
  dateElement.textContent = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long'
  }).format(currentDate);
}

function updateCategoryFilterOptions() {
  const categoryFilter = get('#category-filter');
  const selectedCategory = categoryFilter.value;
  const optionsContainer = get('#category-filter-options');
  optionsContainer.replaceChildren();

  const options = [
    ['', 'Todas'],
    ...data.categorias.map((category) => [category[1], category[1]])
  ];

  options.forEach(([value, text]) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.dataset.comboboxOption = value;
    option.textContent = text;
    optionsContainer.append(option);
  });

  categoryFilter.value = selectedCategory;
  setupComboboxes(get('#category-filter-container'));
}

function renderMenu() {
  document.querySelectorAll('aside > button[data-menu]').forEach((button) => {
    const isSubmenu = button.classList.contains('sub');
    const belongsToCurrentMenu = button.dataset.menu === state.currentMenu;
    const isCurrentClientAction =
      button.dataset.clientAction === state.currentClientAction;
    const isCurrentNewClientAction =
      button.dataset.new === 'clientes' && state.currentClientAction === 'incluir';
    const isCurrentProductAction =
      state.currentPage === 'itens' &&
      button.dataset.productAction === state.currentProductAction;
    const isCurrentNewProductAction =
      state.currentPage === 'itens' &&
      button.dataset.new === 'itens' &&
      state.currentProductAction === 'incluir';
    const isCurrentBudgetAction =
      state.currentPage === 'orcamentos' &&
      button.dataset.budgetAction === state.currentBudgetAction;
    const isCurrentNewBudgetAction =
      state.currentPage === 'orcamentos' &&
      button.dataset.new === 'orcamentos' &&
      state.currentBudgetAction === 'incluir';
    const isCurrentSubmenuPage = button.dataset.page === state.currentPage;

    button.classList.toggle('hidden', isSubmenu && !belongsToCurrentMenu);
    button.classList.toggle(
      'active',
      (!isSubmenu && belongsToCurrentMenu) ||
        (isSubmenu &&
          (isCurrentClientAction ||
            isCurrentNewClientAction ||
            isCurrentProductAction ||
            isCurrentNewProductAction ||
            isCurrentBudgetAction ||
            isCurrentNewBudgetAction ||
            isCurrentSubmenuPage))
    );
  });
}

function render() {
  updateCategoryFilterOptions();
  setupDropdowns(get('#client-type-filter'));
  setupDropdowns(get('#status-filter-container'));

  const page = pages[state.currentPage];
  const actionContent = state.currentPage === 'clientes'
    ? clientActionContent[state.currentClientAction]
    : null;
  const isClientList =
    state.currentPage === 'clientes' && state.currentClientAction === 'listar';
  const isProductList =
    state.currentPage === 'itens' && state.currentProductAction === 'listar';
  const filteredRows = filterRows(data[state.currentPage], {
    search: get('#filter').value,
    clientType: isClientList ? get('#client-type').value : '',
    category: isProductList ? get('#category-filter').value : '',
    status: isProductList ? get('#status-filter').value : ''
  });
  const pagination = paginateRows(filteredRows, state.currentTablePage);
  state.currentTablePage = pagination.currentPage;

  get('#crumb').textContent = page.title;
  get('#title').textContent = page.title;
  get('#subtitle').textContent = actionContent?.subtitle || page.subtitle;
  get('#description').textContent = actionContent?.description || page.description;
  get('#new').textContent = page.button;
  get('#new').classList.toggle('hidden', !page.button);
  get('#client-type-filter').classList.toggle('hidden', !isClientList);
  get('#category-filter-container').classList.toggle('hidden', !isProductList);
  get('#status-filter-container').classList.toggle('hidden', !isProductList);

  get('#thead').innerHTML = `
    <tr>${page.headers.map((header) => `<th>${header}</th>`).join('')}</tr>
  `;
  get('#tbody').innerHTML = pagination.visibleRows
    .map(({ row, index }) => createRow(row, index, state.currentPage))
    .join('') || `
    <tr>
      <td colspan="${page.headers.length}">Nenhum registro encontrado.</td>
    </tr>
  `;

  const recordLabel = filteredRows.length === 1 ? 'registro' : 'registros';
  get('#page-info').textContent =
    `Página ${state.currentTablePage} de ${pagination.totalPages} · ` +
    `${filteredRows.length} ${recordLabel}`;
  get('#previous-page').disabled = state.currentTablePage === 1;
  get('#next-page').disabled = state.currentTablePage === pagination.totalPages;

  renderMenu();
}

function openModal(index = null) {
  const page = pages[state.currentPage];
  const form = get('#form');
  const isEditing = index !== null;

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

  get('#overlay').classList.remove('hidden');
  get('#cancel').onclick = closeModal;
}

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
  const form = get('#form');
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
    value.textContent = formatCurrency(product[4]);
    details.append(name, description, value);

    const quantityLabel = document.createElement('label');
    quantityLabel.textContent = 'Quantidade';
    const quantity = document.createElement('input');
    quantity.type = 'text';
    quantity.inputMode = 'numeric';
    quantity.pattern = '[0-9]*';
    quantity.value = budgetQuantities[product[0]] ?? '0';
    quantity.dataset.productCode = String(product[0]);
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

function openBudgetItemsForm() {
  const form = get('#form');
  const selectedClient = data.clientes.find(
    (client) => String(client[0]) === selectedBudgetClientCode
  );
  budgetQuantities = {};
  form.dataset.mode = 'budget-items';
  get('#modal-title').textContent = 'Itens do orçamento';
  form.innerHTML = `
    <p class="selected-client" id="selected-budget-client"></p>
    <label class="budget-validity">Data de validade
      <input required name="validade" type="date">
    </label>
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
      <button class="secondary" type="button" id="exit-budget-items">SAIR</button>
      <button class="primary">SALVAR ORÇAMENTO</button>
    </div>
  `;

  get('#selected-budget-client').textContent = `Cliente: ${selectedClient[3]}`;
  const categoryFilter = get('#budget-product-category');
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

  get('#exit-budget-items').onclick = closeModal;
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

function removeRecord(index) {
  const confirmed = confirm(
    'Confirma a exclusão? A senha será validada no sistema conectado.'
  );

  if (confirmed) {
    if (state.currentPage === 'orcamentos') {
      const budgetCode = data.orcamentos[index][0];
      data.itensOrcamento = data.itensOrcamento.filter(
        (item) => item[0] !== budgetCode
      );
    }
    data[state.currentPage].splice(index, 1);
    render();
  }
}

window.edit = edit;
window.removeRecord = removeRecord;

function resetFilters() {
  get('#filter').value = '';
  get('#client-type').value = '';
  get('#category-filter').value = '';
  get('#status-filter').value = '';
}

function changePage(button) {
  state.currentPage = button.dataset.page;
  state.currentMenu = button.dataset.menu;
  state.currentClientAction = 'listar';
  state.currentProductAction = 'listar';
  state.currentBudgetAction = 'listar';
  state.currentTablePage = 1;
  resetFilters();
  render();
}

function openNewRecord(button) {
  state.currentPage = button.dataset.new;
  state.currentMenu = button.dataset.menu;
  state.currentClientAction = state.currentPage === 'clientes' ? 'incluir' : 'listar';
  state.currentProductAction = state.currentPage === 'itens' ? 'incluir' : 'listar';
  state.currentBudgetAction = state.currentPage === 'orcamentos' ? 'incluir' : 'listar';
  state.currentTablePage = 1;
  render();
  if (state.currentPage === 'orcamentos') {
    openBudgetClientSelection();
  } else {
    openModal();
  }
}

function selectClientAction(button) {
  state.currentPage = 'clientes';
  state.currentMenu = 'clientes';
  state.currentClientAction = button.dataset.clientAction;
  state.currentTablePage = 1;
  get('#filter').value = '';
  get('#client-type').value = '';
  render();
}

function selectProductAction(button) {
  state.currentPage = 'itens';
  state.currentMenu = 'produtos';
  state.currentProductAction = button.dataset.productAction;
  state.currentTablePage = 1;
  get('#filter').value = '';
  get('#category-filter').value = '';
  get('#status-filter').value = '';
  render();
}

function selectBudgetAction(button) {
  state.currentPage = 'orcamentos';
  state.currentMenu = 'orcamentos';
  state.currentBudgetAction = button.dataset.budgetAction;
  state.currentTablePage = 1;
  get('#filter').value = '';
  render();
}

function renderFirstPage() {
  state.currentTablePage = 1;
  render();
}

document.querySelectorAll('[data-page]').forEach((button) => {
  button.onclick = () => changePage(button);
});

document.querySelectorAll('[data-new]').forEach((button) => {
  button.onclick = () => openNewRecord(button);
});

document.querySelectorAll('[data-client-action]').forEach((button) => {
  button.onclick = () => selectClientAction(button);
});

document.querySelectorAll('[data-product-action]').forEach((button) => {
  button.onclick = () => selectProductAction(button);
});

document.querySelectorAll('[data-budget-action]').forEach((button) => {
  button.onclick = () => selectBudgetAction(button);
});

get('#new').onclick = () => {
  if (state.currentPage === 'orcamentos') {
    state.currentBudgetAction = 'incluir';
    renderMenu();
    openBudgetClientSelection();
  } else {
    openModal();
  }
};
get('#filter').oninput = renderFirstPage;
get('#client-type').onchange = renderFirstPage;
get('#category-filter').onchange = renderFirstPage;
get('#status-filter').onchange = renderFirstPage;
get('#previous-page').onclick = () => {
  if (state.currentTablePage > 1) {
    state.currentTablePage -= 1;
    render();
  }
};
get('#next-page').onclick = () => {
  state.currentTablePage += 1;
  render();
};
get('#close').onclick = closeModal;
get('#overlay').onclick = (event) => {
  if (event.target === event.currentTarget) {
    closeModal();
  }
};
get('#exit').onclick = () => alert('Sessão encerrada.');

get('#form').onsubmit = (event) => {
  event.preventDefault();

  const form = event.target;

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
    const budgetCode = getNextRecordCode(data.orcamentos);
    const budgetItems = createBudgetItemRecords({
      budgetCode,
      products: data.itens,
      quantities: budgetQuantities
    });

    if (budgetItems.length === 0) {
      get('#budget-items-error').classList.remove('hidden');
      return;
    }

    data.orcamentos.push(createBudgetRecord({
      code: budgetCode,
      client: selectedClient[3],
      clientCode: selectedClient[0],
      validity: form.elements.validade.value,
      total: calculateBudgetTotal(budgetItems)
    }));
    data.itensOrcamento.push(...budgetItems);
    state.currentTablePage = Math.ceil(data.orcamentos.length / recordsPerPage);
    closeModal();
    render();
    return;
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

  const values = [...new FormData(form).values()];
  const index = form.dataset.index;

  if (index !== undefined && ['clientes', 'categorias'].includes(state.currentPage)) {
    const recordReference =
      state.currentPage === 'clientes' ? 'deste cliente' : 'desta categoria';

    if (!confirm(`Confirma a alteração dos dados ${recordReference}?`)) {
      return;
    }
  }

  if (state.currentPage === 'itens') {
    const recordCode = index !== undefined
      ? data.itens[index][0]
      : getNextRecordCode(data.itens);
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
    const existingRecord = index !== undefined ? data.orcamentos[index] : undefined;
    const recordCode = existingRecord?.[0] ?? getNextRecordCode(data.orcamentos);
    const budgetRecord = createBudgetRecord({
      code: recordCode,
      client: values[0],
      clientCode: data.clientes.find((client) => client[3] === values[0])?.[0],
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
    data[state.currentPage][index] = [recordCode, ...values];
  } else {
    const recordCode = getNextRecordCode(data[state.currentPage]);
    data[state.currentPage].push([recordCode, ...values]);
    state.currentTablePage = Math.ceil(
      data[state.currentPage].length / recordsPerPage
    );
  }

  closeModal();
  render();
};

updateHeaderDate();
render();
