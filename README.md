# Product and Budget Control System

> Última revisão técnica: 7 de setembro de 2026.

Sistema de gestão comercial para a **Atlas Máquinas & Obras**, com clientes, categorias, produtos, orçamentos e itens de orçamento.

**Estado atual:** integração Supabase implementada, com ISS-003 e ISS-004 concluídas conforme confirmação do usuário. O login é obrigatório e não há fallback silencioso para dados locais. Para novas instalações, veja [configuração do Supabase](docs/SUPABASE.md).

## Como executar

A aplicação usa módulos ES, sem framework, dependências JavaScript de runtime ou build. Sirva a pasta por HTTP; abrir `index.html` via `file://` não é suportado.

1. Execute as etapas de [docs/SUPABASE.md](docs/SUPABASE.md).
2. Inicie o servidor: `python -m http.server 8000`.
3. Abra `http://localhost:8000/` e entre com o usuário criado no Supabase.

A URL e a chave pública estão em `assets/js/backend.js`. Todos os usuários autenticados consultam, incluem e editam os mesmos dados. Exclusão de clientes, categorias e produtos é exclusiva de administradores; orçamentos e seus itens podem ser excluídos por todos os autenticados. Aplique todas as migrações até a 009. Os dados de teste ficam em `tests/fixtures/workspace.js` e não são importados pela aplicação.

## Validação e testes

Use Node.js 22 ou superior e Python 3. Os testes unitários usam o executor nativo e os testes SQL usam `@electric-sql/pglite` (PostgreSQL em memória, somente desenvolvimento); os testes de navegador usam a dependência de desenvolvimento `@playwright/test`, com versão fixada em `package-lock.json`.

```bash
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

No PowerShell, use `npm.cmd` e `npx.cmd` se a política bloquear scripts `.ps1`. É possível usar o Edge instalado sem baixar Chromium:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm.cmd run test:e2e
```

`PLAYWRIGHT_CHANNEL` é opcional e usado somente nos testes. `playwright.config.js` inicia um servidor Python em `127.0.0.1:8765`; a porta deve estar livre. Os testes de navegador simulam as respostas Supabase, sem gravar no projeto real. Cobrem CRUD, vínculos, confirmação e senha de exclusão, filtros, menu móvel, orçamento com itens, recarga e falhas/conflitos de gravação. Não substituem a validação das políticas SQL no projeto. Resultados e traces de falhas ficam em `test-results/`.

## Funcionalidades

- Navegação entre Clientes, Produtos e Orçamentos. Orçamentos oferece Listar, Orçamentos aprovados, Itens do orçamento e Novo orçamento, nessa ordem. O cabeçalho usa a data local.
- Menu móvel para telas de até 760 px, com botão, foco, Escape e fechamento ao navegar ou clicar fora.
- Pesquisa compartilhada, filtros de tipo, categoria e status, tabelas de até 10 registros e paginação. Categoria aplica o filtro imediatamente.
- Inclusão limpa filtros pelo botão principal e pelos submenus; cancelar mantém filtros limpos. Edição preserva filtros. Salvar inclusão revela o registro na última página.
- Formulário reutilizável; categorias usam combobox pesquisável, tipo/status usam dropdown sem pesquisa. Seleções têm realce visual.
- CPF no formato `000.000.000-00`; CNPJ numérico/alfanumérico no formato `00.000.000/0000-00`, em maiúsculas. Validação por tipo e dígitos verificadores; duplicidade ignora pontuação e caixa.
- Nomes e descrições não aceitam apenas espaços. Descrições são únicas por coleção de categorias/produtos, ignorando caixa e espaços repetidos. Preço finito, positivo e com até duas casas decimais.
- Produtos exibem nome, descrição, categoria, preço em reais, data automática imutável e status. Edição de clientes, categorias e produtos pede confirmação.
- Renomear categoria atualiza seus produtos; categoria em uso não pode ser excluída. No banco, produtos referenciam categorias por código; a interface recebe o nome por consulta.
- Renomear cliente atualiza seus orçamentos por código; cliente com orçamento não pode ser excluído. Edição do orçamento usa código, distinguindo clientes com o mesmo nome.
- Produtos usados em itens de orçamento não podem ser excluídos; a interface informa o vínculo e o banco o protege com chave estrangeira.
- Novo orçamento seleciona cliente, validade e quantidades inteiras positivas. Filtros da seleção preservam quantidades. Salvar exige ao menos um item e calcula os totais; editar preserva a data e recalcula o total dos itens. Excluir orçamento remove seus itens na mesma gravação.
- Exclusão solicita confirmação e senha verificada pelo Supabase Auth. No banco, exclusão de clientes/categorias/produtos exige administrador, enquanto orçamentos podem ser excluídos por todos os autenticados. Login, carregamento, gravação, recarga e logout estão implementados. Implementação confirmada pelo usuário.
- Falhas de gravação restauram o estado anterior; conflitos de revisão impedem sobrescrita por outra sessão.
- Texto escapado nas tabelas e inserido com `textContent` nas listas; botões de ícone possuem nomes acessíveis e foco visível.

## Limitações

- Todos os registros são gravados em tabelas próprias. RLS, chaves estrangeiras, unicidade, preços/quantidades positivos e totais são tratados no SQL. Validação dos dígitos CPF/CNPJ permanece no cliente.
- A senha de exclusão complementa o fluxo da interface; a RPC autoriza chamadas diretas pela identidade autenticada, sem exigir senha novamente.
- Token armazenado em `sessionStorage`, sem renovação automática. Após expirar, saia e entre novamente. Não há cadastro, recuperação de senha ou papéis administrativos na interface.
- Sem consulta de situação cadastral de CPF/CNPJ, modo offline, lint ou pipeline CI. Testes automatizados não equivalem a auditoria completa de acessibilidade.
- Os atalhos Painel, Relatórios e Configurações continuam desabilitados. O botão de menu é funcional no celular.

## Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| `index.html`, `assets/css/app.css` | Layout, login, modais, tabelas e estilos |
| `assets/js/app.js` | Inicialização, conexão dos controladores e rollback visual de gravação |
| `assets/js/listing.js`, `assets/js/records.js` | Listagens, filtros, formulários CRUD e eventos da tabela |
| `assets/js/budget-flow.js`, `assets/js/session.js` | Fluxo de orçamento e interface de login/logout |
| `assets/js/html.js` | Escape HTML compartilhado |
| `tests/fixtures/workspace.js`, `tests/fixtures/workspace-legacy.js`, `e2e/helpers/backend.js` | Dados de teste atuais, contrato histórico 001–007 e simulação do Supabase |
| `assets/js/backend.js` | Configuração pública, Auth, REST, sessão e revisão |
| `assets/js/relations.js` | Atualização de vínculos e bloqueio de exclusões em uso |
| `assets/js/navigation.js` | Menu móvel e foco |
| `assets/js/data.js` | Dados vazios da aplicação, estado de navegação e fábrica de coleções independentes |
| `assets/js/config.js` | Páginas, textos e campos |
| `assets/js/form.js` | Campos, comboboxes e dropdowns |
| `assets/js/validation.js` | Documentos, preços, normalização e duplicidades |
| `assets/js/budget.js`, `assets/js/table.js` | Orçamentos, cálculos, filtros e renderização |
| `tests/*.test.js` | Testes unitários e migrações/CRUD/RLS no PostgreSQL local (`database.test.js`) |
| `e2e/app.spec.js`, `playwright.config.js` | Testes de navegador e servidor de teste |
| `supabase/migrations/202609060001_workspaces.sql` | Workspace, RLS e RPC inicial |
| `supabase/migrations/202609060002_cliente.sql` | Tabela cliente, transferência dos clientes antigos e RPC de leitura |
| `supabase/migrations/202609060003_cliente_identity.sql` | Código de cliente automático no PostgreSQL |
| `supabase/migrations/202609060004_relational_tables.sql` | Categorias, produtos, orçamentos e itens em tabelas próprias, identity, FKs e RPCs |
| `supabase/migrations/202609060005_shared_access.sql` a `202609070009_budget_order_compatibility.sql` | Workspace compartilhado, permissões, aprovação e gravação direta dos orçamentos |
| `supabase/seeds/reset_simple_data.sql` | Limpa os dados comerciais e cria uma carga pequena de exemplo, preservando contas e administradores |
| `supabase/tests/authorization.sql` | Testes SQL com rollback |
| `package.json`, `package-lock.json`, `.gitignore` | Comandos, dependências fixadas e exclusões de artefatos |
| `docs/` | Arquitetura, requisitos, issues, configuração e anotações originais |

## Modelo de dados

O objeto `data` contém arrays posicionais e é substituído pelos dados carregados após login. A RPC salva em `cliente`, `categoria`, `produto`, `orcamento` e `item_orcamento`, atomicamente. Clientes, categorias, produtos e orçamentos usam `codigo bigint GENERATED ALWAYS AS IDENTITY`: o banco gera o código, e o navegador envia `null` ao incluir e recebe o código definitivo na resposta. Edições preservam códigos. Cada sequência é global à respectiva tabela, não reinicia por usuário e pode ter lacunas. Códigos antigos são preservados, inclusive nos orçamentos. Itens usam chave composta de workspace, orçamento e produto. `atlas_workspaces` mantém somente metadados de revisão; suas coleções JSON ficam vazias. A revisão protege contra sobrescrita concorrente. Novos produtos e orçamentos recebem a data do SQL; valores são armazenados com duas casas decimais e totais são recalculados no servidor.

| Coleção | Ordem dos campos |
| --- | --- |
| `clientes` | código, tipo, CPF/CNPJ, nome |
| `categorias` | código, descrição |
| `itens` | código, categoria, produto, descrição, valor, data, status |
| `orcamentos` | código, código do cliente, cliente, data, validade, total |
| `itensOrcamento` | código do orçamento, código do produto, produto, quantidade, valor unitário, total |

## Documentação

Mantenha README, [arquitetura](docs/ARCHITECTURE.md) e [requisitos](docs/REQUIREMENTS.md) sincronizados conforme `AGENTS.md`. Consulte também [issues](docs/ISSUES.md) e [Supabase](docs/SUPABASE.md).

### Novo orçamento: seleção e revisão de itens

A seleção inicial exibe somente o nome do cliente, mantendo o código como referência interna. A etapa de itens usa duas colunas: produtos e quantidades à esquerda, lista adicionada e total à direita. ADICIONAR ITENS transfere as quantidades para o rascunho e limpa a seleção; adicionar novamente o mesmo produto soma sua quantidade. Itens podem ser removidos da lista. SALVAR ORÇAMENTO exige validade e ao menos um item adicionado, e grava somente a lista da direita. Adicionar/remover itens não grava no Supabase; a gravação continua atômica ao salvar. No celular, as colunas ficam empilhadas. O estado do rascunho pertence a `budget-flow.js` e reinicia a cada novo orçamento.

Editar orçamento abre o fluxo de duas colunas com os itens existentes. Permite trocar cliente, validade e adicionar/remover itens; adicionar novamente soma quantidades. Salvar pede confirmação e preserva código, data original e nomes/preços históricos dos itens existentes. Cancelar a confirmação mantém o rascunho sem gravar. Orçamento e itens são atualizados juntos pela RPC existente.

O ícone da Atlas combina capacete de obra e letra A nas cores da marca. O SVG local `assets/icons/atlas.svg` é reutilizado no cabeçalho e como favicon da aba. No cabeçalho, a imagem usa texto alternativo vazio porque o nome da empresa já aparece ao lado.

## Revisão de issues: orçamentos e sessão

- Enter em um campo de quantidade adiciona os itens ao rascunho, sem submeter o orçamento. A gravação continua pelo botão Salvar.
- Na edição, o catálogo exibe o mesmo preço histórico usado para os produtos já presentes no orçamento; novos produtos usam o preço atual.
- Sair oculta a aplicação, esvazia dados e limpa tabela/formulário imediatamente. O login fica desabilitado enquanto o logout remoto termina (ou falha), evitando concorrência entre logout e uma nova sessão. O token local é removido mesmo quando a revogação remota falha.

## Avaliação e propostas

Veja [a avaliação do projeto](docs/PROJECT_REVIEW.md) para pontos fortes, melhorias sugeridas, prioridades e critérios de conclusão. O documento identifica separadamente o que já foi concluído e o que continua como proposta.

A migração `supabase/migrations/202609060005_shared_access.sql` implementa compartilhamento e administração; `tests/shared.test.js` e `supabase/tests/authorization.sql` verificam o novo contrato. `authorization_legacy.sql` preserva o teste histórico 001–004. Configure o primeiro admin conforme [SUPABASE.md](docs/SUPABASE.md).

## Atualização de permissões — migração 006

`supabase/migrations/202609060006_budget_permissions.sql` permite a todos os autenticados não anônimos editar/excluir orçamentos e remover itens do orçamento. Exclusão de clientes, categorias e produtos continua exclusiva de administradores. A exclusão de orçamento mantém confirmação e senha na interface; a remoção de itens é gravada ao salvar. Um orçamento mantido exige ao menos um item. O SQL aplica as permissões mesmo em chamadas diretas; revisão global, transação e bloqueios de vínculo continuam ativos. Aplique somente a 006 se a 005 já estiver instalada, depois recarregue a aplicação.

## Impressão e PDF de orçamento

Implementado: o botão Imprimir em cada orçamento salvo abre uma prévia em nova janela para todos os usuários autenticados. O documento contém Atlas Máquinas & Obras, cliente e CPF/CNPJ atual, código, emissão, validade, itens históricos, quantidades, preços, subtotais e total. Imprimir / Salvar PDF abre o diálogo nativo; selecione Salvar como PDF para exportar. Os controles não aparecem no documento impresso. Cabeçalhos/rodapés automáticos são configurados no navegador.

`assets/js/budget-print.js` gera o documento com escape de texto e filtra itens pelo código do orçamento; `records.js` trata a ação delegada de `table.js`. Estilos de impressão são locais ao documento, com formato A4 e cabeçalho de tabela repetido em múltiplas páginas. Não há serviço externo, biblioteca nova, gravação no banco ou download automático. Pop-ups bloqueados geram orientação. Testes em `tests/budget-print.test.js` e `e2e/app.spec.js` verificam escape, separação de itens, conteúdo e controles ocultos em mídia de impressão.

## Aprovação de orçamentos

Implementado no código: no menu de Orçamentos, Listar orçamentos aparece antes de Orçamentos aprovados. O submenu Orçamentos aprovados lista apenas aprovados, com pesquisa e paginação. O botão Aprovar orçamento fica no cabeçalho, depois de Novo orçamento, com 14 px de espaço entre os botões; abre a seleção de um orçamento pendente e pede confirmação. Não há botão de aprovação nas linhas. Todos os autenticados não anônimos podem aprovar. Não há estados Enviado/Cancelado, reversão de aprovação nem bloqueio de edição: editar um aprovado mantém sua aprovação, conforme o escopo limitado desta entrega.

Aplique somente `supabase/migrations/202609060007_budget_approval.sql` após 006 e recarregue as abas. A coluna `orcamento.aprovado` começa falsa para registros existentes/novos. `atlas_approve_budget(expected_revision,budget_code)` usa a revisão global e grava atomicamente; repetição, orçamento inexistente e acesso anônimo são rejeitados. `atlas_load_workspace()` retorna `approved_codes` além do contrato anterior, mantendo os arrays de orçamento com seis campos. `backend.js` mantém `approvedBudgets` separado do payload; a interface só atualiza a aprovação após confirmação do servidor. Não há dependência nova.

No submenu Orçamentos aprovados, a única ação por linha é Baixar PDF, que abre a prévia e permite Salvar como PDF pelo diálogo nativo do navegador. Não há ações de edição, exclusão ou aprovação nessa listagem; a listagem normal mantém as ações existentes. Pesquisa e paginação preservam o vínculo com o orçamento original. Esta alteração de interface não exige nova migração SQL.

A aprovação é iniciada exclusivamente pelo botão do cabeçalho Aprovar orçamento. A janela segue o padrão visual de Novo orçamento, permite pesquisar por cliente ou código e mostra cada pendente em uma opção selecionável com código, cliente, data de criação e validade. Sem pendentes, o botão fica desabilitado. O submenu Orçamentos aprovados mantém apenas a ação PDF por linha. Não é necessária nova migração para essa mudança de interface.

Nas listagens geral e de aprovados, Código do cliente aparece antes de Cliente. A migração 008 aplica a mesma ordem ao array retornado e recebido pelas RPCs: código, código do cliente, cliente, data, validade e total. A tabela relacional continua armazenando `cliente_codigo`; o nome é obtido de `cliente` por `JOIN`.

## Carga simples de dados

Depois de aplicar as migrações 001–008, execute `supabase/seeds/reset_simple_data.sql` inteiro no SQL Editor para substituir todos os dados comerciais por uma carga pequena. O script limpa itens, orçamentos, produtos, categorias e clientes, reinicia seus códigos identity e cadastra dois clientes, duas categorias, três produtos e um orçamento com dois itens. Usuários do Supabase Auth e `atlas_admins` são preservados. Ao terminar, recarregue todas as abas da aplicação.


## ISS-019 — gravação direta na ordem atual

Implementado no código, com aplicação remota pendente: `supabase/migrations/202609070009_budget_order_compatibility.sql` substitui a RPC após 008 para gravar diretamente `[codigo, clienteCodigo, clienteNome, data, validade, total]`. Apesar do nome do arquivo, não há suporte à entrada legada: nome antes do código é rejeitado com `22023`, antes de qualquer alteração. A função `atlas_save_workspace_legacy_order` é removida; não há conversão intermediária. O cliente é vinculado pelo código no índice 1, e o nome retornado vem do JOIN com `cliente`.

Autenticação, permissões, revisão global, aprovação, datas e sincronização transacional são preservadas. A migração avança a revisão; recarregue todas as abas com a interface atual antes de salvar. Não há nova dependência, serviço ou variável de ambiente. `tests/shared.test.js` cobre inclusão e edição na ordem atual, rejeição da ordem antiga e de entradas inválidas, conflitos e preservação do estado após falha. A migração 008 permanece como histórico; a 009 substitui seu adaptador.
