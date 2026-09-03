import { clientActionContent, pages } from './config.js';
import { data, recordPrefixes } from './data.js';
import { createField, setupCategoryCombobox } from './form.js';
import { createRow, filterRows, paginateRows, recordsPerPage } from './table.js';

const state = {
  currentPage: 'clientes',
  currentMenu: 'clientes',
  currentClientAction: 'listar',
  currentProductAction: 'listar',
  currentBudgetAction: 'listar',
  currentTablePage: 1
};

const get = (selector) => document.querySelector(selector);

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
  const options = [new Option('Todas', '')];

  data.categorias.forEach((category) => {
    options.push(new Option(category[1], category[1]));
  });

  categoryFilter.replaceChildren(...options);
  categoryFilter.value = selectedCategory;
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
  get('#new').classList.remove('hidden');
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

  get('#modal-title').textContent = isEditing
    ? 'Editar registro'
    : page.button.replace('+ ', '');
  form.innerHTML = `
    ${page.fields.map((field) => createField(field, data.categorias)).join('')}
    <div class="footer">
      <button class="secondary" type="button" id="cancel">Cancelar</button>
      <button class="primary">SALVAR</button>
    </div>
  `;

  setupCategoryCombobox(form);

  if (isEditing) {
    form.dataset.index = index;
    const fieldValueIndexes = state.currentPage === 'itens'
      ? [1, 2, 3, 4, 6]
      : page.fields.map((_, position) => position + 1);

    form.querySelectorAll('input, select').forEach((field, position) => {
      field.value = data[state.currentPage][index][fieldValueIndexes[position]] ?? '';
    });
  } else {
    delete form.dataset.index;
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

function removeRecord(index) {
  const confirmed = confirm(
    'Confirma a exclusão? A senha será validada no sistema conectado.'
  );

  if (confirmed) {
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
  openModal();
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

get('#new').onclick = () => openModal();
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
      : recordPrefixes.itens + String(data.itens.length + 1).padStart(4, '0');
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
  } else if (index !== undefined) {
    const recordCode = data[state.currentPage][index][0];
    data[state.currentPage][index] = [recordCode, ...values];
  } else {
    const nextRecordNumber = String(data[state.currentPage].length + 1).padStart(4, '0');
    const recordCode = recordPrefixes[state.currentPage] + nextRecordNumber;
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
