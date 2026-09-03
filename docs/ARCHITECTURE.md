# Arquitetura

> Última revisão técnica: 3 de setembro de 2026.

## Visão geral

A aplicação é uma página estática, sem framework e sem back-end. Ela usa módulos ES e deve ser carregada por um servidor HTTP estático:

```text
index.html
   ├── assets/css/menu.css    → aparência e responsividade
   └── assets/js/menu.js      → ponto de entrada
          ├── config.js       → configuração das páginas
          ├── data.js         → dados demonstrativos
          ├── form.js         → campos e autocomplete
          └── table.js        → filtros, paginação e linhas
```

Todo o estado da sessão existe em memória no JavaScript. Recarregar ou fechar a página restaura os dados demonstrativos definidos no código.

Defeitos e riscos que não representam por si só um requisito funcional são acompanhados em [`ISSUES.md`](ISSUES.md).

## Responsabilidades dos arquivos

### `index.html`

- Define a barra superior, a navegação lateral e a área principal.
- Declara os botões de menu por meio dos atributos `data-page`, `data-new`, `data-menu`, `data-client-action`, `data-product-action` e `data-budget-action`.
- Disponibiliza filtros contextuais de tipo, categoria e status, controles de paginação e elementos vazios (`thead`, `tbody` e `form`) preenchidos dinamicamente.
- Contém o overlay e o contêiner do modal reutilizável.
- Carrega o CSS e o ponto de entrada JavaScript com `type="module"`.

### `assets/css/menu.css`

- Centraliza cores em propriedades personalizadas de `:root`.
- Organiza a tela em barra superior, coluna de ícones, menu e conteúdo.
- Estiliza botões, tabela, estados de produto e modal.
- Oculta submenus com `.sub.hidden`.
- Em telas de até 760 px, oculta o menu lateral, reduz margens e transforma o formulário em uma coluna.

### Módulos JavaScript

- `assets/js/data.js`: exporta os registros demonstrativos (`data`) e os prefixos usados na geração de códigos (`recordPrefixes`).
- `assets/js/config.js`: exporta `pages`, com textos, colunas e campos de cada página, e `clientActionContent`.
- `assets/js/table.js`: concentra as regras puras `filterRows()` e `paginateRows()`, o limite `recordsPerPage`, a formatação monetária e a criação das linhas.
- `assets/js/form.js`: cria os campos do modal e controla a pesquisa e seleção de categorias no combobox.
- `assets/js/menu.js`: ponto de entrada que mantém `state`, atualiza a data do cabeçalho, renderiza a interface, controla navegação e modal, conecta eventos e aplica as operações CRUD em memória.

### Testes e comandos

- `package.json` declara o projeto como módulo ES e fornece `npm run check` e `npm test`; não adiciona dependências externas.
- `tests/table.test.js` usa o executor nativo `node:test` para validar filtros, preservação de índices e paginação de até 10 registros.

## Fluxo de navegação e renderização

1. O navegador carrega `menu.js` como módulo ES; suas importações são resolvidas por HTTP, a data local preenche o cabeçalho e o ponto de entrada chama `render()` na página `clientes`.
2. Um clique no menu altera o estado de navegação. Clientes, Produtos e Orçamentos expõem submenus padronizados como “Listar” e “Novo”; Produtos também expõe Categorias. Editar e excluir são acionados diretamente nas linhas.
3. `render()` seleciona a configuração em `pages`, aplica o texto correspondente à operação, combina a pesquisa textual com os filtros contextuais, preserva o índice original de cada registro e exibe a fatia de até 10 linhas correspondente à página atual.
4. Inclusão ou edição abre o modal gerado a partir de `page.fields`. Ao fechar um cadastro iniciado por um submenu “Novo”, a navegação retorna para a respectiva listagem.
5. O submit valida se a categoria do produto corresponde a um registro disponível e solicita confirmação ao editar clientes ou categorias. Para produtos, gera a data de cadastro na inclusão e preserva essa data na edição; depois atualiza `data` e renderiza novamente.
6. A exclusão remove diretamente uma posição do array após `confirm()`.
7. Trocar de área, listagem, pesquisa ou filtro retorna à primeira página; uma inclusão direciona para a última página disponível para revelar o novo registro.

No fluxo atual de orçamentos, o formulário fornece apenas cliente e validade. Como o salvamento genérico não gera data nem valor total, os novos registros ficam menores que a estrutura esperada pela tabela; esse comportamento permanece parcial e está registrado em `REQUIREMENTS.md`.

## Convenções importantes

- Os identificadores de página (`clientes`, `categorias`, `itens`, `orcamentos`) precisam coincidir entre `data`, `pages`, `recordPrefixes` e os atributos HTML.
- Os registros são arrays posicionais. A ordem dos valores deve permanecer alinhada com `headers` e `fields`; em produtos, a ordem é código, categoria, produto, descrição, valor de venda, data de cadastro e status. A data não integra `fields` porque é automática e imutável.
- Na edição, o primeiro valor é tratado como código imutável; os campos começam na posição seguinte.
- `menu.js` importa dependências por caminhos relativos com extensão `.js`.
- Funções chamadas por atributos `onclick` gerados como string são expostas no objeto `window` pelo ponto de entrada.
- A execução local exige um servidor HTTP; `file://` não é suportado devido às restrições dos módulos ES no navegador.
- O projeto usa português do Brasil e arquivos UTF-8.

## Evolução planejada

A fonte `docs/ideas.text` prevê persistência no Supabase. Ao implementar essa etapa, recomenda-se:

- substituir arrays posicionais por objetos nomeados;
- substituir o módulo demonstrativo de dados por uma camada de acesso ao Supabase;
- buscar clientes e categorias dinamicamente;
- gerar identificadores no banco;
- implementar autenticação/autorização para exclusões;
- modelar orçamento e itens de orçamento em tabelas relacionadas;
- validar regras tanto no cliente quanto no banco;
- ampliar os testes para formulários, cálculos, validações, operações CRUD e interação no navegador.

Quando essa arquitetura mudar, este documento e o README devem ser atualizados junto com o código.
