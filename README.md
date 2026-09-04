# Product and Budget Control System

> Última revisão técnica: 4 de setembro de 2026.

Protótipo de um sistema de gestão comercial para a **Atlas Máquinas & Obras**. A interface permite navegar entre clientes, categorias, produtos e orçamentos, pesquisar registros e simular operações de cadastro, edição e exclusão.

> Estado atual: protótipo front-end. Os dados são demonstrativos, ficam apenas na memória do navegador e são perdidos ao recarregar a página. A integração com Supabase descrita nos requisitos ainda não foi implementada.

## Como executar

O projeto não possui dependências de runtime, compilação ou instalação, mas usa módulos ES e precisa ser servido por HTTP. Abrir `index.html` diretamente por `file://` não é uma forma de execução suportada.

1. Clone ou baixe o repositório.
2. Na pasta do projeto, inicie um servidor HTTP estático. Por exemplo, com Python:

```bash
python -m http.server 8000
```

Depois, acesse `http://localhost:8000/`.

## Validação e testes

Com Node.js 18 ou superior instalado, não é necessário executar `npm install` porque os testes usam apenas recursos nativos:

```bash
npm run check
npm test
```

`check` valida a sintaxe de todos os módulos. Os testes automatizados cobrem paginação, limites de página, pesquisa, filtros, geração de códigos e montagem e cálculo dos registros de orçamento.

No PowerShell, se a política de execução bloquear `npm.ps1`, use os comandos equivalentes `npm.cmd run check` e `npm.cmd test`.

## Funcionalidades atuais

- Navegação padronizada entre Clientes, Produtos e Orçamentos, com submenus “Listar” e “Novo”; Produtos também oferece Categorias e Orçamentos oferece Itens do orçamento.
- Submenus exibidos de acordo com a área selecionada.
- Títulos e instruções da área de clientes adaptados à operação selecionada.
- Retorno automático para a respectiva listagem depois de salvar ou cancelar uma inclusão iniciada pelo submenu.
- Todas as listagens reutilizam o padrão visual de pesquisa de Produtos. Filtros contextuais usam os componentes genéricos: tipo de cliente e status são dropdowns sem pesquisa, enquanto categoria é um combobox pesquisável.
- Paginação em todas as tabelas, com limite de 10 registros por página e navegação entre páginas.
- Botões de editar e excluir nas listas editáveis; Itens do orçamento permanece como consulta sem ações por linha.
- Formulário modal reutilizado para incluir e editar registros.
- Tipo de cliente e status do produto usam um dropdown visual reutilizável, sem pesquisa; a categoria de produto continua usando o combobox pesquisável.
- Campo pesquisável de categoria dos produtos, com sugestões e seleção restritas às categorias cadastradas.
- Produtos exibem descrição, valor de venda formatado em reais, data de cadastro e status em colunas próprias.
- A inclusão de produtos gera automaticamente uma data de cadastro que permanece imutável durante edições.
- “Novo orçamento” abre uma lista pesquisável de clientes e, após a confirmação, permite informar validade e quantidades inteiras dos produtos disponíveis.
- A seleção de itens oferece pesquisa por nome ou descrição e filtro pelas categorias cadastradas, preservando as quantidades enquanto os filtros mudam.
- Campos de seleção e listas clicáveis compartilham realce visual: categorias e clientes selecionados ficam destacados, e produtos são realçados quando recebem quantidade.
- O salvamento exige ao menos um item, gera a data, calcula os totais dos itens e do orçamento e registra o código numérico do cliente.
- A edição de orçamentos carrega a validade na coluna correta e preserva código, data de emissão e valor total; excluir um orçamento também remove seus itens da sessão.
- A listagem de itens de orçamento exibe código do orçamento, código e nome do produto, quantidade, valor unitário e total do item, com pesquisa e paginação compartilhadas com as demais tabelas.
- Valores textuais cadastrados são escapados antes da renderização nas tabelas; listas dinâmicas usam texto seguro no DOM.
- Edição de clientes e categorias com confirmação antes de salvar a alteração.
- Exclusão com confirmação simples do navegador.
- Geração local de códigos exclusivamente numéricos, usando o maior código existente em cada tabela mais um.
- Indicação visual do status ativo/inativo dos produtos.
- Layout adaptado para telas de até 760 px.
- Data do cabeçalho atualizada a partir da data local do sistema ao carregar a página.

## Limitações conhecidas

- Não há banco de dados, autenticação, API ou persistência local.
- A integração planejada com Supabase ainda não existe.
- A senha mencionada na confirmação de exclusão não é solicitada nem validada.
- Alterações de produtos e orçamentos não pedem confirmação antes de salvar.
- Um produto só pode ser salvo com uma categoria previamente cadastrada; digitar no campo serve apenas para pesquisar as opções disponíveis.
- A categoria pesquisável de Listar produtos só reaplica o filtro quando o campo perde o foco, não imediatamente ao selecionar a opção.
- Renomear ou excluir clientes pode deixar nome e código divergentes nos orçamentos existentes; a edição também é ambígua quando clientes possuem o mesmo nome.
- Em telas de até 760 px, o menu lateral é ocultado sem uma navegação móvel substituta.
- Os testes atuais cobrem regras puras de tabelas, códigos e orçamentos, mas ainda não há testes de interface no navegador, lint ou pipeline de CI.
- O backlog detalhado de defeitos e riscos técnicos está em `docs/ISSUES.md`.

## Estrutura do repositório

```text
.
├── AGENTS.md              # Regra para manter a documentação sincronizada
├── index.html             # Página principal da aplicação
├── LICENSE                # Licença do repositório
├── package.json           # Metadados e comandos de validação/teste
├── README.md              # Visão geral, execução e estado do projeto
├── assets/
│   ├── css/
│   │   └── menu.css       # Tema, layout, tabelas, modal e responsividade
│   └── js/
│       ├── budget.js      # Filtros, datas, montagem e cálculos de orçamentos
│       ├── config.js      # Metadados das páginas e formulários
│       ├── data.js        # Dados demonstrativos e geração de códigos numéricos
│       ├── form.js        # Campos, comboboxes e dropdowns reutilizáveis
│       ├── menu.js        # Estado, navegação, eventos e CRUD
│       └── table.js       # Filtros, paginação e linhas das tabelas
├── docs/
│   ├── ARCHITECTURE.md    # Organização técnica e fluxo da aplicação
│   ├── ISSUES.md          # Problemas e riscos conhecidos
│   ├── ideas.text         # Anotações originais de requisitos
│   └── REQUIREMENTS.md    # Requisitos funcionais e estado de implementação
└── tests/
    ├── budget.test.js     # Testes da estrutura e das datas de orçamentos
    ├── data.test.js       # Testes da geração de códigos numéricos
    ├── form.test.js       # Testes dos campos de seleção customizados
    └── table.test.js      # Testes das regras de tabela
```

## Modelo de dados atual

Os dados ficam no objeto `data`, em `assets/js/data.js`, como arrays posicionais:

O código na primeira posição de cada registro é um número inteiro, imutável e sem prefixo textual.

| Coleção | Formato atual |
| --- | --- |
| `clientes` | código, tipo, CPF/CNPJ, nome |
| `categorias` | código, descrição |
| `itens` | código, categoria, produto, descrição, valor de venda, data de cadastro, status |
| `orcamentos` | código, cliente, código do cliente, data, validade, valor total |
| `itensOrcamento` | código do orçamento, código do produto, produto, quantidade, valor unitário, valor total do item |

Consulte [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) para o modelo pretendido e a diferença entre o que está implementado e o que falta.

## Manutenção

Ao alterar comportamento, estrutura, execução, dados ou requisitos, atualize a documentação no mesmo conjunto de mudanças. A política detalhada está em `AGENTS.md`.

## Documentação complementar

- [Arquitetura e fluxo interno](docs/ARCHITECTURE.md)
- [Problemas e riscos conhecidos](docs/ISSUES.md)
- [Requisitos e progresso de implementação](docs/REQUIREMENTS.md)
