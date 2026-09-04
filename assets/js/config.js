const pageClientes = {
  title: 'CLIENTES',
  subtitle: 'Cadastro de clientes',
  description: 'Consulte e gerencie os clientes cadastrados no sistema.',
  button: '+ INCLUIR CLIENTE',
  headers: ['Código', 'Tipo', 'CPF / CNPJ', 'Nome', 'Ações'],
  fields: [
    ['tipo', 'Tipo de cliente', 'dropdown', 'Pessoa Física,Pessoa Jurídica'],
    ['documento', 'CPF / CNPJ', 'text'],
    ['nome', 'Nome do cliente', 'text']
  ]
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
  title: 'PRODUTOS',
  subtitle: 'Produtos cadastrados',
  description: 'Gerencie os itens disponíveis para inclusão em orçamentos.',
  button: '+ INCLUIR PRODUTO',
  headers: ['Código', 'Categoria', 'Produto', 'Descrição', 'Valor de venda', 'Data de cadastro', 'Status', 'Ações'],
  fields: [
    ['categoria', 'Categoria', 'combobox'],
    ['produto', 'Nome do produto', 'text'],
    ['descricao', 'Descrição', 'text'],
    ['valor', 'Valor de venda', 'number'],
    ['status', 'Status', 'dropdown', 'Ativo,Inativo']
  ]
};

const pageOrcamentos = {
  title: 'ORÇAMENTOS',
  subtitle: 'Orçamentos',
  description: 'Acompanhe os orçamentos emitidos para seus clientes.',
  button: '+ NOVO ORÇAMENTO',
  headers: ['Código', 'Cliente', 'Código do cliente', 'Data', 'Validade', 'Valor total', 'Ações'],
  fields: [
    ['cliente', 'Cliente', 'select'],
    ['validade', 'Data de validade', 'date']
  ]
};

const pageItensOrcamento = {
  title: 'ITENS DO ORÇAMENTO',
  subtitle: 'Itens dos orçamentos',
  description: 'Consulte os produtos e valores registrados nos orçamentos.',
  button: '',
  headers: [
    'Código do orçamento',
    'Código do produto',
    'Produto',
    'Quantidade',
    'Valor unitário',
    'Valor total do item'
  ],
  fields: []
};

export const pages = {
  clientes: pageClientes,
  categorias: pageCategorias,
  itens: pageItens,
  orcamentos: pageOrcamentos,
  itensOrcamento: pageItensOrcamento
};

export const clientActionContent = {
  listar: {
    subtitle: 'Lista de clientes',
    description: 'Consulte e pesquise todos os clientes cadastrados no sistema.'
  },
  incluir: {
    subtitle: 'Incluir cliente',
    description: 'Preencha o formulário para cadastrar um novo cliente.'
  }
};
