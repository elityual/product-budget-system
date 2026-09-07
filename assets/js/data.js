
export const emptyData = () => ({ clientes: [], categorias: [], itens: [], orcamentos: [], itensOrcamento: [] });
export const data = emptyData();
export const state = {
  currentPage: 'clientes',
  currentMenu: 'clientes',
  currentClientAction: 'listar',
  currentProductAction: 'listar',
  currentBudgetAction: 'listar',
  currentTablePage: 1
};

export const get = (selector) => document.querySelector(selector);

export const permissions = { isAdmin: false };

export const approvedBudgets = new Set();
