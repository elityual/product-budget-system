# Arquitetura

> Última revisão técnica: 4 de setembro de 2026.

## Visão geral

A aplicação é uma página estática, sem framework e sem back-end. Ela usa módulos ES e deve ser carregada por um servidor HTTP estático:

```text
index.html
   ├── assets/css/menu.css    → aparência e responsividade
   └── assets/js/menu.js      → ponto de entrada
          ├── config.js       → configuração das páginas
          ├── budget.js       → filtros, montagem e cálculos de orçamento
          ├── data.js         → dados demonstrativos
          ├── form.js         → campos, comboboxes e dropdowns
          └── table.js        → filtros, paginação e linhas
```

Todo o estado da sessão existe em memória no JavaScript. Recarregar ou fechar a página restaura os dados demonstrativos definidos no código.

Defeitos e riscos que não representam por si só um requisito funcional são acompanhados em [`ISSUES.md`](ISSUES.md).

## Responsabilidades dos arquivos

### `index.html`

- Define a barra superior, a navegação lateral e a área principal.
- Declara os botões de menu por meio dos atributos `data-page`, `data-new`, `data-menu`, `data-client-action`, `data-product-action` e `data-budget-action`.
- Disponibiliza a pesquisa compartilhada por todas as tabelas, filtros contextuais de tipo, categoria e status, controles de paginação e elementos vazios (`thead`, `tbody` e `form`) preenchidos dinamicamente. Tipo de cliente e status usam a estrutura genérica de dropdown; categoria usa a estrutura genérica de combobox.
- Contém o overlay e o contêiner do modal reutilizável.
- Carrega o CSS e o ponto de entrada JavaScript com `type="module"`.

### `assets/css/menu.css`

- Centraliza cores em propriedades personalizadas de `:root`.
- Organiza a tela em barra superior, coluna de ícones, menu e conteúdo.
- Estiliza botões, tabela, estados de produto e modal.
- Mantém foco e seleção visíveis em campos, opções de categoria, clientes e produtos escolhidos no orçamento.
- Define a barra de pesquisa e filtros de Produtos como padrão visual de todas as listagens, padronizando altura, borda, fundo e espaçamento; remove margens internas no contexto da barra e desenha o ícone de pesquisa em CSS.
- Oculta submenus com `.sub.hidden`.
- Em telas de até 760 px, oculta o menu lateral, reduz margens e transforma o formulário em uma coluna.

### Módulos JavaScript

- `assets/js/data.js`: exporta os registros demonstrativos (`data`) e `getNextRecordCode()`, que gera códigos inteiros a partir do maior código da coleção.
- `assets/js/budget.js`: filtra clientes e produtos, converte datas, monta registros de orçamento e itens e calcula o valor total, preservando data e total na edição.
- `assets/js/config.js`: exporta `pages`, com textos, colunas e campos de cada página, e `clientActionContent`.
- `assets/js/table.js`: concentra as regras puras `filterRows()` e `paginateRows()`, o limite `recordsPerPage`, a formatação monetária e a criação das linhas com escape de conteúdo textual.
- `assets/js/form.js`: cria os campos do modal e controla os componentes genéricos de combobox pesquisável e dropdown sem pesquisa, usados em formulários e filtros.
- `assets/js/menu.js`: ponto de entrada que mantém `state`, atualiza a data do cabeçalho, renderiza a interface, controla navegação e modal, conecta eventos e aplica as operações CRUD em memória.

### Testes e comandos

- `package.json` declara o projeto como módulo ES e fornece `npm run check` e `npm test`; não adiciona dependências externas.
- `tests/table.test.js` usa o executor nativo `node:test` para validar filtros, preservação de índices, paginação, formatação de linhas e escape de HTML.
- `tests/budget.test.js` valida pesquisa de clientes, pesquisa e categoria de produtos, estrutura dos registros, campos imutáveis, conversão de datas, quantidades e cálculo de totais.
- `tests/data.test.js` valida a geração numérica para coleções preenchidas, com lacunas ou vazias.
- `tests/form.test.js` valida a estrutura do dropdown customizado sem campo de pesquisa.

## Fluxo de navegação e renderização

1. O navegador carrega `menu.js` como módulo ES; suas importações são resolvidas por HTTP, a data local preenche o cabeçalho e o ponto de entrada chama `render()` na página `clientes`.
2. Um clique no menu altera o estado de navegação. Clientes, Produtos e Orçamentos expõem submenus padronizados como “Listar” e “Novo”; Produtos também expõe Categorias e Orçamentos expõe a listagem de Itens do orçamento. Editar e excluir são acionados diretamente nas linhas das entidades editáveis.
3. `render()` seleciona a configuração em `pages`, aplica o texto correspondente à operação, combina a pesquisa textual com os filtros contextuais, preserva o índice original de cada registro e exibe a fatia de até 10 linhas correspondente à página atual.
4. Inclusão ou edição comum abre o modal gerado a partir de `page.fields`; o novo orçamento usa as etapas específicas de cliente e itens. Ao fechar um cadastro iniciado por um submenu “Novo”, a navegação retorna para a respectiva listagem.
5. O submit valida se a categoria do produto corresponde a um registro disponível e solicita confirmação ao editar clientes ou categorias. Para produtos, gera a data de cadastro na inclusão e preserva essa data na edição. O novo orçamento exige validade e ao menos uma quantidade inteira positiva, calcula os totais e grava orçamento e itens juntos. Na edição de orçamentos, o fluxo específico posiciona a validade corretamente e preserva data e total; depois atualiza `data` e renderiza novamente.
6. A exclusão remove uma posição do array após `confirm()`; ao excluir um orçamento, seus itens relacionados também são removidos da memória.
7. Trocar de área, listagem, pesquisa ou filtro retorna à primeira página; uma inclusão direciona para a última página disponível para revelar o novo registro.

No fluxo de novo orçamento, `menu.js` monta uma lista pesquisável diretamente de `data.clientes`. Selecionar um cliente habilita a confirmação, que troca o conteúdo do modal pela lista de produtos, suas descrições, valores unitários, campos de quantidade e validade. A lista pode ser pesquisada por nome ou descrição e filtrada por categoria; as quantidades ficam em estado temporário durante a filtragem e o campo remove caracteres que não sejam dígitos. `budget.js` aplica novamente a regra de números inteiros positivos, calcula o total e monta os registros; o submit grava ambos os arrays somente quando existe ao menos um item.

Categorias, clientes e produtos selecionáveis recebem classes visuais de seleção. Nos produtos do orçamento, a classe acompanha a quantidade positiva e permanece coerente quando a lista é filtrada e reconstruída.

## Convenções importantes

- Os identificadores de página (`clientes`, `categorias`, `itens`, `orcamentos`, `itensOrcamento`) precisam coincidir entre `data`, `pages` e os atributos HTML.
- Todo código de registro é armazenado como número inteiro, sem sigla ou prefixo. Novos códigos usam `maior código + 1`, sem reutilizar lacunas deixadas por exclusões.
- Os registros são arrays posicionais. A ordem dos valores deve permanecer alinhada com `headers` e `fields`; em produtos, a ordem é código, categoria, produto, descrição, valor de venda, data de cadastro e status. A data não integra `fields` porque é automática e imutável.
- Em orçamentos, a ordem é código, cliente, código do cliente, data de emissão, validade e valor total numérico. `budget.js` concentra o mapeamento, a criação dos itens e os cálculos; valores monetários são formatados apenas na renderização.
- Em itens de orçamento, a ordem é código do orçamento, código do produto, nome do produto, quantidade, valor unitário e valor total do item. Os dois primeiros valores referenciam registros existentes nas coleções `orcamentos` e `itens`. A página é somente para consulta e não renderiza ações de edição ou exclusão.
- Na edição, o primeiro valor é tratado como código imutável; os campos começam na posição seguinte.
- `menu.js` importa dependências por caminhos relativos com extensão `.js`.
- Funções chamadas por atributos `onclick` gerados como string são expostas no objeto `window` pelo ponto de entrada.
- Dados exibidos em HTML gerado são convertidos para texto escapado. As listas dinâmicas de clientes e produtos usam `textContent`; apenas estrutura controlada pela aplicação é atribuída com `innerHTML`.
- Campos `combobox` oferecem pesquisa textual e restringem o valor às opções disponíveis. Campos `dropdown` não possuem pesquisa, armazenam a opção em um campo oculto e compartilham o mesmo padrão visual de lista e seleção. Os dois componentes emitem `change` ao escolher uma opção e podem ser usados tanto em formulários quanto em filtros.
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
