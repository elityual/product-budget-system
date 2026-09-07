# Arquitetura

> Última revisão técnica: 7 de setembro de 2026.

## Visão geral

Interface com módulos ES, servida por `server.js`, e uma fronteira de armazenamento que atende SQLite local ou Supabase Auth/PostgREST. A configuração do Supabase é feita pelo operador; instruções em [SUPABASE.md](SUPABASE.md).

`index.html` carrega `app.js`, que importa configuração de páginas, estado, validação, renderização, relações, navegação e backend. Não existe framework, bundler ou SDK de runtime.

## Componentes

- `index.html`: seleção de armazenamento, configuração Supabase, nome da empresa, área principal, menu, filtros, tabela, paginação, modal de cadastro, backup e restauração. Botões de ícone usam nomes acessíveis e símbolos ocultos da leitura assistiva.
- `assets/css/app.css`: tema, layouts, filtros, componentes, foco visível, estados e menu móvel. O menu abre lateralmente até 760 px e o conteúdo permite rolagem horizontal da tabela.
- `config.js`: metadados de páginas, colunas e campos. Os identificadores coincidem com `data` e atributos HTML.
- `data.js`: workspace vazio mutável, estado de navegação, seletor DOM e fábrica `emptyData()`. Os dados de teste ficam em `tests/fixtures/workspace.js`; o SQL gera os códigos novos.
- `app.js`: inicialização, data do cabeçalho, conexão dos controladores e persistência. `persist()` bloqueia interação durante a gravação e restaura o snapshot anterior em caso de falha.
- `backend.js`: interface de armazenamento, seleção local/Supabase, requisições Auth/REST ou HTTP local com timeout de 15 segundos, login, validação da senha de exclusão, logout, carregamento, gravação, aprovação e backup. Usa `sessionStorage` apenas para sessão e token local; não persiste senhas.
- `server.js`: servidor local restrito a `127.0.0.1`, banco SQLite em `%LOCALAPPDATA%\\ProductBudgetControl` (ou `.local-data/ProductBudgetControl` sem essa variável), validação transacional, revisão, aprovação, configurações da empresa e backups.
- `relations.js`: bloqueia excluir categorias usadas por produtos e clientes usados por orçamentos e produtos usados por itens de orçamento; atualiza produtos ao renomear categorias e nomes de clientes nos orçamentos pelo código.
- `navigation.js`: controla menu móvel, `aria-expanded`, abertura com foco, Escape com retorno do foco, fechamento ao selecionar, clicar fora ou mover foco para fora. É uma navegação expansível, sem comportamento de diálogo modal.
- `form.js`: geração dos campos, combobox pesquisável e dropdown sem pesquisa. Selecionar emite `change` imediatamente com propagação; blur do combobox valida/fecha sem emitir evento sintético adicional.
- `validation.js`: valida CPF e CNPJ numérico/alfanumérico por tipo e DVs, normaliza textos, aplica máscaras e bloqueia duplicidades e preços inválidos. Comparação exclui o próprio registro na edição.
- `budget.js`: busca, datas, registros e cálculos de orçamentos/itens; preserva a data e aceita o total recalculado na edição.
- `table.js`: busca, filtros, paginação, formatação monetária e linhas com escape de HTML, inclusive nos nomes acessíveis das ações.

## Fluxos e estado

1. A página apresenta login. Uma sessão válida na aba tenta carregar o workspace; erro mantém login visível e exibe mensagem. Um usuário novo recebe os dados compartilhados existentes.
2. Após carregar, `session.js` substitui `data`, limpa filtros e abre Clientes. O menu configura página e ação; tabelas mantêm índices originais ao filtrar/paginar, com 10 registros por página.
3. Inclusão por botão ou submenu limpa pesquisa/tipo/categoria/status e retorna à primeira página. Cancelar mantém filtros limpos; editar preserva filtros. Salvar inclusão direciona à última página.
4. Submit valida categoria e domínio, pede confirmação ao editar cliente/categoria/produto e monta os arrays. Em cliente/categoria, também atualiza os vínculos antes de salvar o snapshot inteiro.
5. Novo orçamento seleciona cliente por código e preserva quantidades durante filtros de produtos. Exige validade e ao menos um item inteiro positivo; orçamento e itens são gravados juntos. Editar usa opções com valor igual ao código e texto com nome/código para distinguir homônimos; preserva a data e recalcula o total dos itens.
6. Exclusão bloqueia vínculos em uso e pede confirmação. No Supabase, uma segunda janela verifica a senha no Auth; no SQLite local não há senha. Depois remove o registro e, para orçamentos, seus itens. O armazenamento persiste todo o resultado atomicamente.
7. Logout tenta revogar a sessão remota, sempre apaga credenciais locais, esvazia dados e retorna ao login. Ao sair com um formulário aberto, a interface confirma o descarte do rascunho. Após expirar o token, é necessário sair e entrar novamente.

## Persistência e autorização

`supabase/migrations/202609080001_initial.sql` cria diretamente o modelo final em um projeto vazio: tabelas relacionais, identidades, vínculos, aprovação, revisão, RLS e RPCs. Não há conversão de contas ou dados anteriores. SQLite usa a mesma forma de dados, com valores monetários em centavos inteiros.

`supabase/seeds/example_data.sql` é uma carga opcional e protegida: verifica se as tabelas estão vazias antes de inserir exemplos. Não participa da instalação normal.

`atlas_workspaces` mantém uma única revisão global no Supabase. RLS permite leitura a usuários autenticados não anônimos; escritas diretas são revogadas. O modo local é de usuário único, sem Auth, e o token por inicialização impede chamadas HTTP acidentais sem a sessão do servidor.

No modo local, a inicialização grava um backup diário em `backups/` e retém sete arquivos diários. A restauração aceita somente o esquema atual, grava uma cópia `antes-restaurar-...` antes de substituir as tabelas e executa a troca em transação; arquivos inválidos deixam o banco atual intacto. A revisão restaurada nunca diminui a revisão atual, evitando que uma sessão antiga sobrescreva a recuperação. O nome da empresa fica em `atlas_meta` e é espelhado no armazenamento do navegador para a impressão.

A RPC pública autentica, bloqueia a revisão global e verifica omissões de clientes, categorias e produtos antes de qualquer gravação: `atlas_is_admin()` é exigido para excluir clientes, categorias e produtos. Usuários autenticados podem editar e excluir orçamentos e seus itens. A tabela de administradores é gerenciada apenas pelo operador do banco, nunca pelo cliente ou `user_metadata`. Todos os demais usuários podem incluir e editar, inclusive quantidades positivas de itens salvos. A resposta de leitura inclui `is_admin` e `approved_codes`; `backend.js` atualiza `permissions` e `approvedBudgets` em `data.js`, e os controladores ocultam ações proibidas. A verificação SQL é a autoridade mesmo se o navegador for modificado.

As duas implementações preservam o contrato de arrays, códigos gerados, datas, FKs e totais. A escrita retorna `{revision,payload,approved_codes}`; conflitos retornam `null`. A senha de exclusão é confirmação adicional da interface; no modo local ela não é enviada a um serviço remoto. Instruções de implantação e primeiro administrador estão em [SUPABASE.md](SUPABASE.md).

## Convenções

- Códigos são gerados pelo banco; somente inserções sem código recebem um novo valor. Edições não alteram códigos. Itens usam a chave composta do orçamento e produto. Nenhum cadastro novo gera código no navegador. A revisão evita sobrescrita concorrente.
- No banco, produto referencia categoria por `categoria_codigo`; orçamento referencia cliente por `cliente_codigo`. Os arrays da interface recebem os nomes por joins. Itens preservam nome e preço históricos do produto e referenciam os códigos do orçamento e do produto.
- CPF é salvo com máscara `000.000.000-00`; CNPJ usa `00.000.000/0000-00` e maiúsculas. Duplicidade ignora pontuação e caixa.
- CNPJ usa ASCII menos 48 e módulo 11 conforme o [manual oficial](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf).
- Conteúdo textual em HTML é escapado; listas DOM usam `textContent`/`Option`. Ações de tabela usam `data-action` e um listener delegado, sem funções globais em `window`.
- Português do Brasil, UTF-8 e imports relativos com extensão `.js`.

- `atlas_parse_date()` converte datas da interface; datas de cadastro/emissão de novos registros são `current_date` do SQL e permanecem imutáveis na edição. Total do item é coluna calculada; total do orçamento é recalculado pela RPC e exige ao menos um item. O fluxo aceita um novo orçamento por chamada, associando os itens cujo código de orçamento é null ao código recém-gerado.

## Testes e comandos

`npm run check` valida sintaxe; `npm test` executa os testes unitários, SQLite local e instalação Supabase limpa com `@electric-sql/pglite`. `npm run test:e2e` usa `@playwright/test`; `playwright.config.js` inicia `server.js` na porta 8765 e usa banco descartável. `npm run package:source` gera o arquivo manual `release/product-budget-control-source.tar.gz` com os fontes permitidos. Requer Node.js 24+ e navegador instalado via Playwright ou canal configurado. Dependências de desenvolvimento estão em `package-lock.json`; o servidor usa apenas módulos nativos do Node.

A suíte de navegador cobre CRUD, relações, confirmação, navegação móvel, filtros, orçamento/itens, recarga e falhas/conflitos, com respostas Supabase simuladas. `tests/local-server.test.js` verifica persistência e backup do SQLite. `tests/initial-supabase.test.js` verifica uma instalação vazia. `.gitignore` exclui dependências, bancos locais, backups, relatórios, traces e arquivos `.env`.

## Evolução pendente

Validação de DVs no servidor, recuperação de senha e renovação automática de sessão continuam pendentes. A CI em `.github/workflows/ci.yml` já valida sintaxe, testes e testes de navegador; as propostas restantes estão em [PROJECT_REVIEW.md](PROJECT_REVIEW.md) e os defeitos confirmados ficam em [ISSUES.md](ISSUES.md).

## Organização dos controladores

`app.js` conecta as fábricas de controladores por callbacks explícitos, sem imports circulares. `listing.js` controla listagens, navegação e filtros. `records.js` controla formulários CRUD, exclusão e submissão comum. `budget-flow.js` mantém cliente e quantidades selecionados em seu próprio escopo. `session.js` trata login, logout e restauração da sessão. O estado compartilhado fica em `data.js`; o transporte REST permanece em `backend.js`.

As ações da tabela usam `data-action` e `data-index` com listener delegado no corpo da tabela. `html.js` fornece escape HTML compartilhado para `form.js` e `table.js`.

Os cenários de navegador ficam em `e2e/app.spec.js`, com simulação do Supabase em `e2e/helpers/backend.js`. `tests/fixtures/workspace.js` é usado somente pelos testes. `tests/local-server.test.js` verifica o servidor SQLite e `tests/initial-supabase.test.js` verifica a instalação limpa. A migração pública é única e não mantém contratos históricos.

### Novo orçamento: seleção e revisão de itens

A seleção inicial exibe somente o nome do cliente, mantendo o código como referência interna. A etapa de itens usa duas colunas: produtos e quantidades à esquerda, lista adicionada e total à direita. ADICIONAR ITENS transfere as quantidades para o rascunho e limpa a seleção; adicionar novamente o mesmo produto soma sua quantidade. Itens podem ser removidos da lista. SALVAR ORÇAMENTO exige validade e ao menos um item adicionado, e grava somente a lista da direita. Adicionar/remover itens não grava no Supabase; a gravação continua atômica ao salvar. No celular, as colunas ficam empilhadas. O estado do rascunho pertence a `budget-flow.js` e reinicia a cada novo orçamento.

Editar orçamento abre o fluxo de duas colunas com os itens existentes. Permite trocar cliente, validade e adicionar/remover itens; adicionar novamente soma quantidades. Salvar pede confirmação e preserva código, data original e nomes/preços históricos dos itens existentes. Cancelar a confirmação mantém o rascunho sem gravar. Orçamento e itens são atualizados juntos pela RPC existente.

O ícone da Atlas combina capacete de obra e letra A nas cores da marca. O SVG local `assets/icons/atlas.svg` é reutilizado no cabeçalho e como favicon da aba. No cabeçalho, a imagem usa texto alternativo vazio porque o nome da empresa já aparece ao lado.

## Revisão de issues: orçamentos e sessão

- Enter em um campo de quantidade adiciona os itens ao rascunho, sem submeter o orçamento. A gravação continua pelo botão Salvar.
- Na edição, o catálogo exibe o mesmo preço histórico usado para os produtos já presentes no orçamento; novos produtos usam o preço atual.
- Sair oculta a aplicação, esvazia dados e limpa tabela/formulário imediatamente. O login fica desabilitado enquanto o logout remoto termina (ou falha), evitando concorrência entre logout e uma nova sessão. O token local é removido mesmo quando a revogação remota falha.

Na instalação inicial, a revisão compartilhada fica em `atlas_workspaces` e é incrementada dentro da mesma transação das alterações comerciais. Não há dependência de tabela temporária.

## Permissões

A instalação inicial aplica essas permissões diretamente: todos os autenticados não anônimos editam e removem orçamentos e itens; clientes, categorias e produtos só podem ser excluídos por administradores. A gravação é transacional, usa revisão global e mantém os bloqueios de vínculo.

## Impressão e PDF de orçamento

Implementado: o botão Imprimir em cada orçamento salvo abre uma prévia em nova janela para usuários autenticados e para o usuário local. O documento contém o nome configurado da empresa, cliente e CPF/CNPJ atual, código, emissão, validade, itens históricos, quantidades, preços, subtotais e total. Imprimir / Salvar PDF abre o diálogo nativo; selecione Salvar como PDF para exportar. Os controles não aparecem no documento impresso. Cabeçalhos/rodapés automáticos são configurados no navegador.

`assets/js/budget-print.js` gera o documento com escape de texto e filtra itens pelo código do orçamento; `records.js` trata a ação delegada de `table.js`. Estilos de impressão são locais ao documento, com formato A4 e cabeçalho de tabela repetido em múltiplas páginas. Não há serviço externo, biblioteca nova, gravação no banco ou download automático. Pop-ups bloqueados geram orientação. Testes em `tests/budget-print.test.js` e `e2e/app.spec.js` verificam escape, separação de itens, conteúdo e controles ocultos em mídia de impressão.

## Aprovação de orçamentos

Implementado no código: no menu de Orçamentos, Listar orçamentos aparece antes de Orçamentos aprovados. O submenu Orçamentos aprovados lista apenas aprovados, com pesquisa e paginação. O botão Aprovar orçamento fica no cabeçalho, depois de Novo orçamento, com 14 px de espaço entre os botões; abre a seleção de um orçamento pendente e pede confirmação. Não há botão de aprovação nas linhas. Todos os autenticados não anônimos podem aprovar. Não há estados Enviado/Cancelado, reversão de aprovação nem bloqueio de edição: editar um aprovado mantém sua aprovação, conforme o escopo limitado desta entrega.

A instalação inicial cria `orcamento.aprovado` como falso. `atlas_approve_budget(expected_revision,budget_code)` usa a revisão global e grava atomicamente; repetição, orçamento inexistente e acesso anônimo são rejeitados. `atlas_load_workspace()` retorna `approved_codes`; `backend.js` mantém esse conjunto separado do payload.

No submenu Orçamentos aprovados, a única ação por linha é Baixar PDF, que abre a prévia e permite Salvar como PDF pelo diálogo nativo do navegador. Não há ações de edição, exclusão ou aprovação nessa listagem; a listagem normal mantém as ações existentes. Pesquisa e paginação preservam o vínculo com o orçamento original. Esta alteração de interface não exige nova migração SQL.

A aprovação é iniciada exclusivamente pelo botão do cabeçalho Aprovar orçamento. `records.js` monta a janela com elementos DOM e `textContent`, permite pesquisa por cliente ou código e apresenta código, cliente, data de criação e validade. A opção selecionada recebe o mesmo destaque usado na seleção de cliente do novo orçamento. Enter no campo de pesquisa não submete o formulário. Sem pendentes, o botão fica desabilitado. O submenu Orçamentos aprovados mantém apenas a ação PDF por linha. Não é necessária nova migração para essa mudança de interface.

`config.js` e `listing.js` exibem Código do cliente antes de Cliente nas listagens geral e de aprovados. O contrato posicional de `orcamentos` é `[codigo, clienteCodigo, clienteNome, data, validade, total]`; a tabela `orcamento` guarda `cliente_codigo` e o nome continua derivado por `JOIN` com `cliente`.


## ISS-019 — gravação direta na ordem atual

O contrato único de orçamento é `[codigo, clienteCodigo, clienteNome, data, validade, total]`. A instalação inicial rejeita a ordem antiga antes de qualquer alteração. O cliente é vinculado pelo código no índice 1, e o nome retornado vem do JOIN com `cliente`.
