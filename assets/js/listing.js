import { data, state, get, permissions, approvedBudgets } from './data.js';
import { clientActionContent, pages } from './config.js';
import { setupComboboxes, setupDropdowns } from './form.js';
import { createRow, filterRows, paginateRows } from './table.js';
export function createListing({ openModal, openBudgetClientSelection }) {
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

    const approving = state.currentPage === 'orcamentos' && state.currentBudgetAction === 'aprovados';
    const page = approving ? {
      ...pages.orcamentos,
      title: 'ORÇAMENTOS APROVADOS',
      subtitle: 'Orçamentos aprovados',
      description: 'Consulte os orçamentos aprovados e gere o PDF.',
      button: '',
      headers: ['Código', 'Código do cliente', 'Cliente', 'Data', 'Validade', 'Valor total', 'Ações']
    } : pages[state.currentPage];
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
    const visibleRows = approving ? filteredRows.filter(({row}) => approvedBudgets.has(row[0])) : filteredRows;
    const pagination = paginateRows(visibleRows, state.currentTablePage);
    state.currentTablePage = pagination.currentPage;

    get('#crumb').textContent = page.title;
    get('#title').textContent = page.title;
    get('#subtitle').textContent = actionContent?.subtitle || page.subtitle;
    get('#description').textContent = actionContent?.description || page.description;
    get('#approve-budget').classList.toggle('hidden', state.currentPage !== 'orcamentos' || approving);
    get('#approve-budget').disabled = !data.orcamentos.some((row) => !approvedBudgets.has(row[0]));
    get('#new').textContent = page.button;
    get('#new').classList.toggle('hidden', !page.button);
    get('#client-type-filter').classList.toggle('hidden', !isClientList);
    get('#category-filter-container').classList.toggle('hidden', !isProductList);
    get('#status-filter-container').classList.toggle('hidden', !isProductList);

    get('#thead').innerHTML = `
      <tr>${page.headers.map((header) => `<th>${header}</th>`).join('')}</tr>
    `;
    get('#tbody').innerHTML = pagination.visibleRows
      .map(({ row, index }) => createRow(
        row,
        index,
        state.currentPage,
        permissions.isAdmin || state.currentPage === 'orcamentos',
        approving
      ))
      .join('') || `
      <tr>
        <td colspan="${page.headers.length}">Nenhum registro encontrado.</td>
      </tr>
    `;

    const recordLabel = visibleRows.length === 1 ? 'registro' : 'registros';
    get('#page-info').textContent =
      `Página ${state.currentTablePage} de ${pagination.totalPages} · ` +
      `${visibleRows.length} ${recordLabel}`;
    get('#previous-page').disabled = state.currentTablePage === 1;
    get('#next-page').disabled = state.currentTablePage === pagination.totalPages;

    renderMenu();
  }

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

  return { render, resetFilters };
}
