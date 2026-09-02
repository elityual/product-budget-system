// Dados de exemplo: substitua por consultas ao Supabase quando o banco existir.
const data = {
  clientes: [
    ['CLI-0001', 'Pessoa Jurídica', '12.345.678/0001-99', 'Construtora Horizonte'],
    ['CLI-0002', 'Pessoa Física', '123.456.789-10', 'Mariana Oliveira']
  ],
  categorias: [['CAT-001', 'Materiais de construção'], ['CAT-002', 'Ferramentas']],
  itens: [
    ['PRD-0001', 'Materiais de construção', 'Cimento CP II 50kg', 'R$ 42,90', 'Ativo'],
    ['PRD-0002', 'Ferramentas', 'Furadeira profissional', 'R$ 359,00', 'Inativo']
  ],
  orcamentos: [['ORC-0102', 'Construtora Horizonte', '01/09/2026', '30/09/2026', 'R$ 12.480,00']]
};

// Metadados: títulos, colunas e campos de cada opção do menu.
const pages = {
  clientes: { title: 'CLIENTES', subtitle: 'Cadastro de clientes', description: 'Consulte e gerencie os clientes cadastrados no sistema.', button: '+ INCLUIR CLIENTE', headers: ['Código', 'Tipo', 'CPF / CNPJ', 'Nome', 'Ações'], fields: [['tipo', 'Tipo de cliente', 'select', 'Pessoa Física,Pessoa Jurídica'], ['documento', 'CPF / CNPJ', 'text'], ['nome', 'Nome do cliente', 'text']] },
  categorias: { title: 'CATEGORIAS', subtitle: 'Categorias de produtos', description: 'Organize os produtos em categorias.', button: '+ INCLUIR CATEGORIA', headers: ['Código', 'Descrição', 'Ações'], fields: [['descricao', 'Descrição da categoria', 'text']] },
  itens: { title: 'ITENS / PRODUTOS', subtitle: 'Produtos cadastrados', description: 'Gerencie os itens disponíveis para inclusão em orçamentos.', button: '+ INCLUIR PRODUTO', headers: ['Código', 'Categoria', 'Produto', 'Valor de venda', 'Status', 'Ações'], fields: [['categoria', 'Categoria', 'select', 'Materiais de construção,Ferramentas'], ['produto', 'Nome do produto', 'text'], ['descricao', 'Descrição', 'text'], ['valor', 'Valor de venda', 'number'], ['status', 'Status', 'select', 'Ativo,Inativo']] },
  orcamentos: { title: 'ORÇAMENTOS', subtitle: 'Orçamentos', description: 'Acompanhe os orçamentos emitidos para seus clientes.', button: '+ NOVO ORÇAMENTO', headers: ['Código', 'Cliente', 'Data', 'Validade', 'Valor total', 'Ações'], fields: [['cliente', 'Cliente', 'select', 'Construtora Horizonte,Mariana Oliveira'], ['validade', 'Data de validade', 'date']] }
};

let currentPage = 'clientes';
const get = (selector) => document.querySelector(selector);

// Atualiza toda a área de conteúdo para a página selecionada.
function render() {
  const page = pages[currentPage];
  const search = get('#filter').value.toLowerCase();
  const rows = data[currentPage].filter((row) => row.join(' ').toLowerCase().includes(search));
  get('#crumb').textContent = page.title;
  get('#title').textContent = page.title;
  get('#subtitle').textContent = page.subtitle;
  get('#description').textContent = page.description;
  get('#new').textContent = page.button;
  get('#thead').innerHTML = `<tr>${page.headers.map((header) => `<th>${header}</th>`).join('')}</tr>`;
  get('#tbody').innerHTML = rows.map(createRow).join('') || `<tr><td colspan="${page.headers.length}">Nenhum registro encontrado.</td></tr>`;
  document.querySelectorAll('[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === currentPage));
}

// Cria uma linha de tabela, com ações de editar e excluir.
function createRow(row, index) {
  const cells = row.map((value, column) => {
    if (currentPage === 'itens' && column === 4) return `<td><span class="status ${value === 'Inativo' ? 'inactive' : ''}">${value}</span></td>`;
    return `<td>${value}</td>`;
  }).join('');
  return `<tr>${cells}<td><button class="action" onclick="edit(${index})">✎</button><button class="action" onclick="removeRecord(${index})">⌫</button></td></tr>`;
}

// Abre formulário novo ou carrega valores de um registro existente.
function openModal(index = null) {
  const page = pages[currentPage];
  const form = get('#form');
  get('#modal-title').textContent = index === null ? page.button.replace('+ ', '') : 'Editar registro';
  form.innerHTML = page.fields.map(createField).join('') + '<div class="footer"><button class="secondary" type="button" id="cancel">Cancelar</button><button class="primary">SALVAR</button></div>';
  if (index !== null) {
    form.dataset.index = index;
    form.querySelectorAll('input, select').forEach((field, position) => field.value = data[currentPage][index][position + 1] || '');
  } else delete form.dataset.index;
  get('#overlay').classList.remove('hidden');
  get('#cancel').onclick = closeModal;
}

function createField([name, label, type, options]) {
  if (type === 'select') return `<label>${label}<select name="${name}">${options.split(',').map((option) => `<option>${option}</option>`).join('')}</select></label>`;
  return `<label>${label}<input required name="${name}" type="${type}"></label>`;
}

function closeModal() { get('#overlay').classList.add('hidden'); }
function edit(index) { openModal(index); }
function removeRecord(index) { if (confirm('Confirma a exclusão? A senha será validada no sistema conectado.')) { data[currentPage].splice(index, 1); render(); } }
window.edit = edit;
window.removeRecord = removeRecord;

// Eventos de menu, pesquisa, modal e salvamento temporário.
document.querySelectorAll('[data-page]').forEach((button) => button.onclick = () => { currentPage = button.dataset.page; get('#filter').value = ''; render(); });
document.querySelectorAll('[data-new]').forEach((button) => button.onclick = () => { currentPage = button.dataset.new; openModal(); });
get('#new').onclick = () => openModal();
get('#filter').oninput = render;
get('#close').onclick = closeModal;
get('#overlay').onclick = (event) => { if (event.target === event.currentTarget) closeModal(); };
get('#exit').onclick = () => alert('Sessão encerrada.');

get('#form').onsubmit = (event) => {
  event.preventDefault();
  const values = [...new FormData(event.target).values()];
  const index = event.target.dataset.index;
  if (index !== undefined) data[currentPage][index] = [data[currentPage][index][0], ...values];
  else {
    const prefixes = { clientes: 'CLI-', categorias: 'CAT-', itens: 'PRD-', orcamentos: 'ORC-' };
    data[currentPage].push([prefixes[currentPage] + String(data[currentPage].length + 1).padStart(4, '0'), ...values]);
  }
  closeModal();
  render();
};

render();
