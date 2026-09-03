# Product and Budget Control System

> Última revisão técnica: 3 de setembro de 2026.

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

`check` valida a sintaxe de todos os módulos. Os testes automatizados cobrem paginação, limites de página, pesquisa e filtros de clientes e produtos.

No PowerShell, se a política de execução bloquear `npm.ps1`, use os comandos equivalentes `npm.cmd run check` e `npm.cmd test`.

## Funcionalidades atuais

- Navegação padronizada entre Clientes, Produtos e Orçamentos, com submenus “Listar” e “Novo”; Produtos também oferece Categorias.
- Submenus exibidos de acordo com a área selecionada.
- Títulos e instruções da área de clientes adaptados à operação selecionada.
- Retorno automático para a respectiva listagem depois de salvar ou cancelar uma inclusão iniciada pelo submenu.
- Pesquisa textual sobre todas as colunas, filtro por tipo em Clientes e filtros por categoria e status em Listar produtos.
- Paginação em todas as tabelas, com limite de 10 registros por página e navegação entre páginas.
- Botões de editar e excluir em cada linha das listas, inclusive em Clientes.
- Formulário modal reutilizado para incluir e editar registros.
- Campo pesquisável de categoria dos produtos, com sugestões e seleção restritas às categorias cadastradas.
- Produtos exibem descrição, valor de venda formatado em reais, data de cadastro e status em colunas próprias.
- A inclusão de produtos gera automaticamente uma data de cadastro que permanece imutável durante edições.
- Edição de clientes e categorias com confirmação antes de salvar a alteração.
- Exclusão com confirmação simples do navegador.
- Geração local de códigos com os prefixos `CLI-`, `CAT-`, `PRD-` e `ORC-`.
- Indicação visual do status ativo/inativo dos produtos.
- Layout adaptado para telas de até 760 px.
- Data do cabeçalho atualizada a partir da data local do sistema ao carregar a página.

## Limitações conhecidas

- Não há banco de dados, autenticação, API ou persistência local.
- A integração planejada com Supabase ainda não existe.
- A senha mencionada na confirmação de exclusão não é solicitada nem validada.
- Alterações de produtos e orçamentos não pedem confirmação antes de salvar.
- O fluxo completo de orçamento (seleção de itens, quantidades e totais) ainda não existe.
- Novos orçamentos salvam apenas cliente e validade, portanto suas linhas não preenchem corretamente data, validade e valor total na tabela.
- O select de clientes dos orçamentos usa opções fixas, não os registros em memória.
- Um produto só pode ser salvo com uma categoria previamente cadastrada; digitar no campo serve apenas para pesquisar as opções disponíveis.
- Novos códigos são baseados no tamanho do array; após exclusões, isso pode gerar códigos repetidos.
- Campos e linhas ainda não representam todos os atributos definidos nos requisitos.
- Valores inseridos nas tabelas ainda não são sanitizados para uso com dados externos não confiáveis.
- Em telas de até 760 px, o menu lateral é ocultado sem uma navegação móvel substituta.
- Os testes atuais cobrem as regras puras de tabela, mas ainda não há testes de interface no navegador, lint ou pipeline de CI.
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
│       ├── config.js      # Metadados das páginas e formulários
│       ├── data.js        # Dados demonstrativos e prefixos
│       ├── form.js        # Campos e autocomplete do formulário
│       ├── menu.js        # Estado, navegação, eventos e CRUD
│       └── table.js       # Filtros, paginação e linhas das tabelas
├── docs/
│   ├── ARCHITECTURE.md    # Organização técnica e fluxo da aplicação
│   ├── ISSUES.md          # Problemas e riscos conhecidos
│   ├── ideas.text         # Anotações originais de requisitos
│   └── REQUIREMENTS.md    # Requisitos funcionais e estado de implementação
└── tests/
    └── table.test.js      # Testes das regras de tabela
```

## Modelo de dados atual

Os dados ficam no objeto `data`, em `assets/js/data.js`, como arrays posicionais:

| Coleção | Formato atual |
| --- | --- |
| `clientes` | código, tipo, CPF/CNPJ, nome |
| `categorias` | código, descrição |
| `itens` | código, categoria, produto, descrição, valor de venda, data de cadastro, status |
| `orcamentos` | código, cliente, data, validade, valor total |

Consulte [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) para o modelo pretendido e a diferença entre o que está implementado e o que falta.

## Manutenção

Ao alterar comportamento, estrutura, execução, dados ou requisitos, atualize a documentação no mesmo conjunto de mudanças. A política detalhada está em `AGENTS.md`.

## Documentação complementar

- [Arquitetura e fluxo interno](docs/ARCHITECTURE.md)
- [Problemas e riscos conhecidos](docs/ISSUES.md)
- [Requisitos e progresso de implementação](docs/REQUIREMENTS.md)
