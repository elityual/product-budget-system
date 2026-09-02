# Arquitetura

## Visão geral

A aplicação é uma página estática, sem framework e sem back-end. O navegador carrega três arquivos diretamente:

```text
index.html
   ├── assets/css/menu.css  → aparência e responsividade
   └── assets/js/menu.js    → estado, renderização e interações
```

Todo o estado da sessão existe em memória no JavaScript. Recarregar ou fechar a página restaura os dados demonstrativos definidos no código.

## Responsabilidades dos arquivos

### `index.html`

- Define a barra superior, a navegação lateral e a área principal.
- Declara os botões de menu por meio dos atributos `data-page`, `data-new`, `data-menu` e `data-client-action`.
- Disponibiliza elementos vazios (`thead`, `tbody` e `form`) preenchidos dinamicamente.
- Contém o overlay e o contêiner do modal reutilizável.
- Carrega o CSS e o JavaScript por caminhos relativos.

### `assets/css/menu.css`

- Centraliza cores em propriedades personalizadas de `:root`.
- Organiza a tela em barra superior, coluna de ícones, menu e conteúdo.
- Estiliza botões, tabela, estados de produto e modal.
- Oculta submenus com `.sub.hidden`.
- Em telas de até 760 px, oculta o menu lateral, reduz margens e transforma o formulário em uma coluna.

### `assets/js/menu.js`

- `data`: registros demonstrativos de cada módulo.
- `pageClientes`, `pageCategorias`, `pageItens` e `pageOrcamentos`: texto, colunas e campos de formulário de cada página.
- `clientActionContent`: títulos e descrições específicos para listar, incluir, editar e excluir clientes.
- `pages`: índice das configurações por identificador.
- `currentPage`, `currentMenu` e `currentClientAction`: estado de navegação.
- `recordPrefixes`: prefixos usados para gerar códigos.
- `render()`: filtra os dados, atualiza títulos, monta a tabela e sincroniza o menu.
- `createRow()` e `createRecordActions()`: geram as linhas e ações da tabela.
- `createField()`: transforma a definição de um campo em HTML.
- `openModal()` e `closeModal()`: controlam o formulário modal.
- `edit()`, `removeRecord()` e `selectClient()`: executam ações sobre registros.
- Handlers no final do arquivo conectam menus, pesquisa, modal, saída e submissão do formulário.

## Fluxo de navegação e renderização

1. O script inicia na página `clientes` e chama `render()`.
2. Um clique no menu altera o estado (`currentPage`, `currentMenu` ou `currentClientAction`).
3. `render()` seleciona a configuração em `pages`, aplica o texto correspondente à operação de clientes, filtra o array pesquisado e recria cabeçalho e corpo da tabela.
4. Inclusão ou edição abre o modal gerado a partir de `page.fields`. Ao fechar o cadastro iniciado pelo submenu Incluir, a navegação retorna para Listar clientes.
5. O submit preserva o código durante a edição ou cria um código durante a inclusão, atualiza `data` e renderiza novamente.
6. A exclusão remove diretamente uma posição do array após `confirm()`.

## Convenções importantes

- Os identificadores de página (`clientes`, `categorias`, `itens`, `orcamentos`) precisam coincidir entre `data`, `pages`, `recordPrefixes` e os atributos HTML.
- Os registros são arrays posicionais. A ordem dos valores deve permanecer alinhada com `headers` e `fields`.
- Na edição, o primeiro valor é tratado como código imutável; os campos começam na posição seguinte.
- Funções chamadas por atributos `onclick` gerados como string são exportadas no objeto `window`.
- O projeto usa português do Brasil e arquivos UTF-8.

## Evolução planejada

A fonte `docs/ideas.text` prevê persistência no Supabase. Ao implementar essa etapa, recomenda-se:

- substituir arrays posicionais por objetos nomeados;
- separar acesso a dados, regras de negócio e apresentação;
- buscar clientes e categorias dinamicamente;
- gerar identificadores no banco;
- implementar autenticação/autorização para exclusões;
- modelar orçamento e itens de orçamento em tabelas relacionadas;
- validar regras tanto no cliente quanto no banco;
- adicionar testes para cálculos, validações e operações CRUD.

Quando essa arquitetura mudar, este documento e o README devem ser atualizados junto com o código.
