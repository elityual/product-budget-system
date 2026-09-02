// Dados de exemplo: substitua por consultas ao Supabase quando o banco existir.
const data = {
  clientes: [
    ['CLI-0001', 'Pessoa Jurídica', '12.345.678/0001-99', 'Construtora Horizonte'],
    ['CLI-0002', 'Pessoa Física', '123.456.789-10', 'Mariana Oliveira']
  ],
  categorias: [
    ['CAT-001', 'Materiais de construção'],
    ['CAT-002', 'Ferramentas']
  ],
  itens: [
    ['PRD-0001', 'Materiais de construção', 'Cimento CP II 50kg', 'R$ 42,90', 'Ativo'],
    ['PRD-0002', 'Ferramentas', 'Furadeira profissional', 'R$ 359,00', 'Inativo']
  ],
  orcamentos: [
    ['ORC-0102', 'Construtora Horizonte', '01/09/2026', '30/09/2026', 'R$ 12.480,00']
  ]
};

// Configuração de cada página do menu.
const pageClientes = {
  title: 'CLIENTES',
  subtitle: 'Cadastro de clientes',
  description: 'Consulte e gerencie os clientes cadastrados no sistema.',
  button: '+ INCLUIR CLIENTE',
  headers: ['Código', 'Tipo', 'CPF / CNPJ', 'Nome'],
  fields: [
    ['tipo', 'Tipo de cliente', 'select', 'Pessoa Física,Pessoa Jurídica'],
    ['documento', 'CPF / CNPJ', 'text'],
    ['nome', 'Nome do cliente', 'text']
  ]
};

// Textos específicos de cada operação da área de clientes.
const clientActionContent = {
  listar: {
    subtitle: 'Lista de clientes',
    description: 'Consulte e pesquise todos os clientes cadastrados no sistema.'
  },
  incluir: {
    subtitle: 'Incluir cliente',
    description: 'Preencha o formulário para cadastrar um novo cliente.'
  },
  editar: {
    subtitle: 'Editar cliente',
    description: 'Pesquise e selecione um cliente na lista para editar seus dados.'
  },
  excluir: {
    subtitle: 'Excluir cliente',
    description: 'Pesquise e selecione um cliente na lista para confirmar sua exclusão.'
  }
};

const pageCategorias = {
  title: 'CATEGORIAS',
  subtitle: 'Categorias de produtos',
  description: 'Organize os produtos em categorias.',
  button: '+ INCLUIR CATEGORIA',
  headers: ['Código', 'Descrição', 'Ações'],
  fields: [['descricao', 'Descrição da categoria', 'text']]
};

const pageItens = {
  title: 'ITENS / PRODUTOS',
  subtitle: 'Produtos cadastrados',
  description: 'Gerencie os itens disponíveis para inclusão em orçamentos.',
  button: '+ INCLUIR PRODUTO',
  headers: ['Código', 'Categoria', 'Produto', 'Valor de venda', 'Status', 'Ações'],
  fields: [
    ['categoria', 'Categoria', 'select', 'Materiais de construção,Ferramentas'],
    ['produto', 'Nome do produto', 'text'],
    ['descricao', 'Descrição', 'text'],
    ['valor', 'Valor de venda', 'number'],
    ['status', 'Status', 'select', 'Ativo,Inativo']
  ]
};

const pageOrcamentos = {
  title: 'ORÇAMENTOS',
  subtitle: 'Orçamentos',
  description: 'Acompanhe os orçamentos emitidos para seus clientes.',
  button: '+ NOVO ORÇAMENTO',
  headers: ['Código', 'Cliente', 'Data', 'Validade', 'Valor total', 'Ações'],
  fields: [
    ['cliente', 'Cliente', 'select', 'Construtora Horizonte,Mariana Oliveira'],
    ['validade', 'Data de validade', 'date']
  ]
};

const pages = {
  clientes: pageClientes,
  categorias: pageCategorias,
  itens: pageItens,
  orcamentos: pageOrcamentos
};

let currentPage = 'clientes';
let currentMenu = 'clientes';
let currentClientAction = 'listar';
const get = (selector) => document.querySelector(selector);
const recordPrefixes = {
  clientes: 'CLI-',
  categorias: 'CAT-',
  itens: 'PRD-',
  orcamentos: 'ORC-'
};

// Renderização da página.
function render() {
  const page = pages[currentPage];
  const actionContent = currentPage === 'clientes'
    ? clientActionContent[currentClientAction]
    : null;
  const search = get('#filter').value.toLowerCase();
  const rows = data[currentPage].filter((row) => {
    return row.join(' ').toLowerCase().includes(search);
  });

  get('#crumb').textContent = page.title;
  get('#title').textContent = page.title;
  get('#subtitle').textContent = actionContent?.subtitle || page.subtitle;
  get('#description').textContent = actionContent?.description || page.description;
  get('#new').textContent = page.button;
  get('#new').classList.toggle(
    'hidden',
    currentPage === 'clientes' && ['editar', 'excluir'].includes(currentClientAction)
  );

  get('#thead').innerHTML = `
    <tr>${page.headers.map((header) => `<th>${header}</th>`).join('')}</tr>
  `;
  get('#tbody').innerHTML = rows.map(createRow).join('') || `
    <tr>
      <td colspan="${page.headers.length}">Nenhum registro encontrado.</td>
    </tr>
  `;

  document.querySelectorAll('aside > button[data-menu]').forEach((button) => {
    const isSubmenu = button.classList.contains('sub');
    const belongsToCurrentMenu = button.dataset.menu === currentMenu;
    const isCurrentClientAction =
      button.dataset.clientAction === currentClientAction;
    const isCurrentNewClientAction =
      button.dataset.new === 'clientes' && currentClientAction === 'incluir';

    button.classList.toggle('hidden', isSubmenu && !belongsToCurrentMenu);
    button.classList.toggle(
      'active',
      (!isSubmenu && belongsToCurrentMenu) ||
        (isSubmenu && (isCurrentClientAction || isCurrentNewClientAction))
    );
  });
}

// Criação dos elementos visuais.
function createRow(row, index) {
  const cells = row
    .map((value, column) => {
      const isInactiveItem = currentPage === 'itens' && column === 4 && value === 'Inativo';

      if (currentPage === 'itens' && column === 4) {
        const inactiveClass = isInactiveItem ? 'inactive' : '';
        return `<td><span class="status ${inactiveClass}">${value}</span></td>`;
      }

      return `<td>${value}</td>`;
    })
    .join('');

  const isSelectableClient =
    currentPage === 'clientes' && currentClientAction !== 'listar';
  const rowClass = isSelectableClient ? 'selectable-row' : '';
  const rowClick = isSelectableClient ? ` onclick="selectClient(${index})"` : '';
  const actions = currentPage === 'clientes' ? '' : createRecordActions(index);

  return `<tr class="${rowClass}"${rowClick}>${cells}${actions}</tr>`;
}

function createRecordActions(index) {
  return `
    <td>
      <button class="action" onclick="edit(${index})">✎</button>
      <button class="action" onclick="removeRecord(${index})">⌫</button>
    </td>
  `;
}

function createField([name, label, type, options]) {
  if (type === 'select') {
    const selectOptions = options
      .split(',')
      .map((option) => `<option>${option}</option>`)
      .join('');

    return `<label>${label}<select name="${name}">${selectOptions}</select></label>`;
  }

  return `<label>${label}<input required name="${name}" type="${type}"></label>`;
}

// Modal de cadastro e edição.
function openModal(index = null) {
  const page = pages[currentPage];
  const form = get('#form');
  const isEditing = index !== null;

  get('#modal-title').textContent = isEditing
    ? 'Editar registro'
    : page.button.replace('+ ', '');
  form.innerHTML = `
    ${page.fields.map(createField).join('')}
    <div class="footer">
      <button class="secondary" type="button" id="cancel">Cancelar</button>
      <button class="primary">SALVAR</button>
    </div>
  `;

  if (isEditing) {
    form.dataset.index = index;
    form.querySelectorAll('input, select').forEach((field, position) => {
      field.value = data[currentPage][index][position + 1] || '';
    });
  } else {
    delete form.dataset.index;
  }

  get('#overlay').classList.remove('hidden');
  get('#cancel').onclick = closeModal;
}

function closeModal() {
  get('#overlay').classList.add('hidden');

  // O submenu Incluir é uma ação temporária; ao fechar, volta para a listagem.
  if (currentPage === 'clientes' && currentClientAction === 'incluir') {
    currentClientAction = 'listar';
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
    data[currentPage].splice(index, 1);
    render();
  }
}

function selectClient(index) {
  if (currentClientAction === 'editar') {
    edit(index);
  }

  if (currentClientAction === 'excluir') {
    removeRecord(index);
  }
}

window.edit = edit;
window.removeRecord = removeRecord;
window.selectClient = selectClient;

// Eventos.
function changePage(button) {
  currentPage = button.dataset.page;
  currentMenu = button.dataset.menu;
  currentClientAction = 'listar';
  get('#filter').value = '';
  render();
}

function openNewRecord(button) {
  currentPage = button.dataset.new;
  currentMenu = button.dataset.menu;
  currentClientAction = currentPage === 'clientes' ? 'incluir' : 'listar';
  render();
  openModal();
}

function selectClientAction(button) {
  currentPage = 'clientes';
  currentMenu = 'clientes';
  currentClientAction = button.dataset.clientAction;
  get('#filter').value = '';
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

get('#new').onclick = () => openModal();
get('#filter').oninput = render;
get('#close').onclick = closeModal;
get('#overlay').onclick = (event) => {
  if (event.target === event.currentTarget) {
    closeModal();
  }
};
get('#exit').onclick = () => alert('Sessão encerrada.');

// Salvamento temporário dos dados.
get('#form').onsubmit = (event) => {
  event.preventDefault();

  const form = event.target;
  const values = [...new FormData(form).values()];
  const index = form.dataset.index;

  if (index !== undefined) {
    const recordCode = data[currentPage][index][0];
    data[currentPage][index] = [recordCode, ...values];
  } else {
    const nextRecordNumber = String(data[currentPage].length + 1).padStart(4, '0');
    const recordCode = recordPrefixes[currentPage] + nextRecordNumber;
    data[currentPage].push([recordCode, ...values]);
  }

  closeModal();
  render();
};

render();
