# Product and Budget Control System

> Última revisão técnica: 7 de setembro de 2026.

Sistema de gestão comercial para a **Atlas Máquinas & Obras**, com clientes, categorias, produtos, orçamentos e itens de orçamento.

**Estado atual:** primeira versão pública em preparação, com dois armazenamentos selecionáveis: SQLite local para uso sem internet e Supabase configurado pelo operador. Não há configuração fixa de projeto nem suporte a instalações anteriores. Para começar do zero, consulte [configuração do Supabase](docs/SUPABASE.md).

## Como executar para desenvolvimento

A aplicação usa módulos ES e um servidor Node.js 24, sem framework ou dependência de runtime externa. O servidor entrega a interface e o banco SQLite local; abrir `index.html` via `file://` não é suportado.

1. Instale Node.js 24 ou superior.
2. Instale as dependências de desenvolvimento: `npm ci`.
3. Inicie o servidor: `npm start`.
4. Abra `http://127.0.0.1:8765/` e escolha SQLite local ou Supabase.

No SQLite local o banco é criado vazio em `%LOCALAPPDATA%\ProductBudgetControl` (ou em `.local-data/ProductBudgetControl` quando `LOCALAPPDATA` não está disponível). No Supabase, crie seu próprio projeto e execute [a instalação inicial](supabase/migrations/202609080001_initial.sql); a aplicação pede a URL e a chave publishable na tela.

## Validação e testes

Use Node.js 24 ou superior. Os testes unitários usam o executor nativo, os testes SQL usam `@electric-sql/pglite` e os testes de navegador usam `@playwright/test`.

```bash
npm ci
npm run check
npm test
npm run package:source
npx playwright install chromium
npm run test:e2e
```

No PowerShell, use `npm.cmd` e `npx.cmd` se a política bloquear scripts `.ps1`. É possível usar o Edge instalado sem baixar Chromium:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm.cmd run test:e2e
```

`PLAYWRIGHT_CHANNEL` é opcional e usado somente nos testes. `playwright.config.js` inicia `server.js` em `127.0.0.1:8765` com banco descartável `.test-data`. Os testes de navegador simulam as respostas Supabase, sem gravar no projeto real. Cobrem CRUD, vínculos, confirmação, filtros, menu móvel, orçamento, recarga e falhas/conflitos. Não substituem a validação das políticas SQL no projeto. Resultados e traces ficam em `test-results/`.

`npm run package:source` cria `release/product-budget-control-source.tar.gz` com os fontes permitidos para distribuição. O arquivo exclui dependências, bancos, backups, caches, credenciais e resultados de testes; a publicação é manual.

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
- Exclusão solicita confirmação; no Supabase também verifica a senha pelo Auth. No banco, exclusão de clientes/categorias/produtos exige administrador, enquanto orçamentos podem ser excluídos por todos os autenticados ou pelo usuário local. Login, carregamento, gravação, recarga e logout estão implementados.
- Falhas de gravação restauram o estado anterior; conflitos de revisão impedem sobrescrita por outra sessão.
- O modo SQLite local funciona sem login e sem internet, salva o nome da empresa e oferece backup/restauração no cabeçalho. O modo Supabase usa o projeto informado pelo operador.
- Texto escapado nas tabelas e inserido com `textContent` nas listas; botões de ícone possuem nomes acessíveis e foco visível.

## Limitações

- Todos os registros são gravados em tabelas próprias. RLS, chaves estrangeiras, unicidade, preços/quantidades positivos e totais são tratados no SQL. Validação dos dígitos CPF/CNPJ permanece no cliente.
- A senha de exclusão complementa o fluxo da interface; a RPC autoriza chamadas diretas pela identidade autenticada, sem exigir senha novamente.
- Token armazenado em `sessionStorage`, sem renovação automática. Após expirar, saia e entre novamente. Não há cadastro, recuperação de senha ou papéis administrativos na interface.
- Sem consulta de situação cadastral de CPF/CNPJ ou lint dedicado. A validação automatizada não equivale a uma auditoria completa de acessibilidade.
- Os atalhos Painel, Relatórios e Configurações continuam desabilitados. O botão de menu é funcional no celular.

## Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| `index.html`, `assets/css/app.css` | Layout, login, modais, tabelas e estilos |
| `assets/js/app.js` | Inicialização, conexão dos controladores e rollback visual de gravação |
| `assets/js/listing.js`, `assets/js/records.js` | Listagens, filtros, formulários CRUD e eventos da tabela |
| `assets/js/budget-flow.js`, `assets/js/session.js` | Fluxo de orçamento e interface de login/logout |
| `assets/js/html.js` | Escape HTML compartilhado |
| `tests/fixtures/workspace.js`, `e2e/helpers/backend.js` | Dados de teste atuais e simulação do Supabase |
| `assets/js/backend.js`, `server.js` | Interface de armazenamento, Auth, REST, SQLite local, sessão, revisão e backups |
| `assets/js/relations.js` | Atualização de vínculos e bloqueio de exclusões em uso |
| `assets/js/navigation.js` | Menu móvel e foco |
| `assets/js/data.js` | Dados vazios da aplicação, estado de navegação e fábrica de coleções independentes |
| `assets/js/config.js` | Páginas, textos e campos |
| `assets/js/form.js` | Campos, comboboxes e dropdowns |
| `assets/js/validation.js` | Documentos, preços, normalização e duplicidades |
| `assets/js/budget.js`, `assets/js/table.js` | Orçamentos, cálculos, filtros e renderização |
| `tests/*.test.js` | Testes unitários, SQLite local e instalação Supabase limpa |
| `e2e/app.spec.js`, `playwright.config.js` | Testes de navegador e servidor de teste |
| `supabase/migrations/202609080001_initial.sql` | Instalação Supabase do zero: tabelas, RLS, permissões, aprovação e RPCs |
| `supabase/seeds/example_data.sql` | Carga opcional de demonstração, protegida contra bancos já preenchidos |
| `tests/initial-supabase.test.js` | Teste da instalação Supabase em banco vazio |
| `package.json`, `package-lock.json`, `.gitignore` | Comandos, dependências fixadas e exclusões de artefatos |
| `docs/` | Arquitetura, requisitos, issues, configuração e anotações originais |

## Modelo de dados

O objeto `data` contém arrays posicionais e é carregado pelo armazenamento selecionado. SQLite e Supabase salvam em `cliente`, `categoria`, `produto`, `orcamento` e `item_orcamento`, atomicamente. Códigos são gerados pelo banco; o navegador envia `null` ao incluir e recebe o código definitivo. A ordem do orçamento é sempre código, código do cliente, nome, data, validade e total. Edições preservam códigos, datas de emissão e preços históricos; a revisão protege contra sobrescrita concorrente. O SQLite armazena valores monetários em centavos inteiros e o Supabase usa `numeric(14,2)`.

| Coleção | Ordem dos campos |
| --- | --- |
| `clientes` | código, tipo, CPF/CNPJ, nome |
| `categorias` | código, descrição |
| `itens` | código, categoria, produto, descrição, valor, data, status |
| `orcamentos` | código, código do cliente, cliente, data, validade, total |
| `itensOrcamento` | código do orçamento, código do produto, produto, quantidade, valor unitário, total |

## Documentação

Mantenha README, [arquitetura](docs/ARCHITECTURE.md) e [requisitos](docs/REQUIREMENTS.md) sincronizados conforme `AGENTS.md`. Consulte também [issues](docs/ISSUES.md) e [Supabase](docs/SUPABASE.md).

Para contribuir, leia [CONTRIBUTING.md](CONTRIBUTING.md). A automação em `.github/workflows/ci.yml` executa sintaxe, testes, instalação Supabase limpa e testes de navegador em cada alteração.

### Novo orçamento: seleção e revisão de itens

A tela inicial permite escolher SQLite local ou Supabase e definir o nome da empresa exibido na aplicação e na impressão. O SQLite não exige login e funciona sem internet; o Supabase usa as credenciais informadas pelo operador. O cabeçalho do modo local oferece backup e restauração validados.

A seleção inicial do orçamento exibe somente o nome do cliente, mantendo o código como referência interna. A etapa de itens usa duas colunas: produtos e quantidades à esquerda, lista adicionada e total à direita. ADICIONAR ITENS transfere as quantidades para o rascunho e limpa a seleção; adicionar novamente o mesmo produto soma sua quantidade. Itens podem ser removidos da lista. SALVAR ORÇAMENTO exige validade e ao menos um item adicionado, e grava somente a lista da direita. No celular, as colunas ficam empilhadas.

Editar orçamento abre o fluxo de duas colunas com os itens existentes. Permite trocar cliente, validade e adicionar/remover itens; adicionar novamente soma quantidades. Salvar pede confirmação e preserva código, data original e nomes/preços históricos dos itens existentes. Cancelar a confirmação mantém o rascunho sem gravar. Orçamento e itens são atualizados juntos pela RPC existente.

O ícone da Atlas combina capacete de obra e letra A nas cores da marca. O SVG local `assets/icons/atlas.svg` é reutilizado no cabeçalho e como favicon da aba. No cabeçalho, a imagem usa texto alternativo vazio porque o nome da empresa já aparece ao lado.

## Revisão de issues: orçamentos e sessão

- Enter em um campo de quantidade adiciona os itens ao rascunho, sem submeter o orçamento. A gravação continua pelo botão Salvar.
- Na edição, o catálogo exibe o mesmo preço histórico usado para os produtos já presentes no orçamento; novos produtos usam o preço atual.
- Sair oculta a aplicação, esvazia dados e limpa tabela/formulário imediatamente. O login fica desabilitado enquanto o logout remoto termina (ou falha), evitando concorrência entre logout e uma nova sessão. O token local é removido mesmo quando a revogação remota falha.

## Avaliação e propostas

Veja [a avaliação do projeto](docs/PROJECT_REVIEW.md) para pontos fortes, melhorias sugeridas, prioridades e critérios de conclusão. O documento identifica separadamente o que já foi concluído e o que continua como proposta.

A migração inicial `supabase/migrations/202609080001_initial.sql` cria diretamente o modelo final em um projeto Supabase vazio. `tests/initial-supabase.test.js` verifica o contrato; configure o primeiro administrador conforme [SUPABASE.md](docs/SUPABASE.md).

## Permissões

O SQL inicial permite a todos os autenticados editar e excluir orçamentos e itens; somente administradores podem excluir clientes, categorias e produtos. A exclusão de orçamento mantém confirmação na interface, e um orçamento mantido exige ao menos um item.

## Impressão e PDF de orçamento

Implementado: o botão Imprimir em cada orçamento salvo abre uma prévia em nova janela para usuários autenticados e para o usuário local. O documento contém o nome configurado da empresa, cliente e CPF/CNPJ atual, código, emissão, validade, itens históricos, quantidades, preços, subtotais e total. Imprimir / Salvar PDF abre o diálogo nativo; selecione Salvar como PDF para exportar. Os controles não aparecem no documento impresso. Cabeçalhos/rodapés automáticos são configurados no navegador.

`assets/js/budget-print.js` gera o documento com escape de texto e filtra itens pelo código do orçamento; `records.js` trata a ação delegada de `table.js`. Estilos de impressão são locais ao documento, com formato A4 e cabeçalho de tabela repetido em múltiplas páginas. Não há serviço externo, biblioteca nova, gravação no banco ou download automático. Pop-ups bloqueados geram orientação. Testes em `tests/budget-print.test.js` e `e2e/app.spec.js` verificam escape, separação de itens, conteúdo e controles ocultos em mídia de impressão.

## Aprovação de orçamentos

Implementado no código: no menu de Orçamentos, Listar orçamentos aparece antes de Orçamentos aprovados. O submenu Orçamentos aprovados lista apenas aprovados, com pesquisa e paginação. O botão Aprovar orçamento fica no cabeçalho, depois de Novo orçamento, com 14 px de espaço entre os botões; abre a seleção de um orçamento pendente e pede confirmação. Não há botão de aprovação nas linhas. Todos os autenticados não anônimos podem aprovar. Não há estados Enviado/Cancelado, reversão de aprovação nem bloqueio de edição: editar um aprovado mantém sua aprovação, conforme o escopo limitado desta entrega.

A coluna `orcamento.aprovado` começa falsa. `atlas_approve_budget(expected_revision,budget_code)` usa a revisão global e grava atomicamente; repetição, orçamento inexistente e acesso anônimo são rejeitados. `atlas_load_workspace()` retorna `approved_codes` e os arrays de orçamento têm seis campos.

No submenu Orçamentos aprovados, a única ação por linha é Baixar PDF, que abre a prévia e permite Salvar como PDF pelo diálogo nativo do navegador. Não há ações de edição, exclusão ou aprovação nessa listagem; a listagem normal mantém as ações existentes. Pesquisa e paginação preservam o vínculo com o orçamento original. Esta alteração de interface não exige nova migração SQL.

A aprovação é iniciada exclusivamente pelo botão do cabeçalho Aprovar orçamento. A janela segue o padrão visual de Novo orçamento, permite pesquisar por cliente ou código e mostra cada pendente em uma opção selecionável com código, cliente, data de criação e validade. Sem pendentes, o botão fica desabilitado. O submenu Orçamentos aprovados mantém apenas a ação PDF por linha. Não é necessária nova migração para essa mudança de interface.

Nas listagens geral e de aprovados, Código do cliente aparece antes de Cliente. O contrato atual usa `[codigo, clienteCodigo, clienteNome, data, validade, total]`; a tabela relacional armazena `cliente_codigo` e o nome é obtido de `cliente` por `JOIN`.

## Carga simples de dados

Para demonstração opcional, execute `supabase/seeds/example_data.sql` somente em um banco vazio. O script recusa bancos com registros e cria dois clientes, duas categorias, dois produtos e um orçamento com dois itens; ele não é necessário para uso normal.


## Armazenamento local e Supabase

No modo local, `server.js` mantém o SQLite em `%LOCALAPPDATA%\ProductBudgetControl`, sem login e sem internet. O banco é criado vazio; o cabeçalho oferece backup e restauração validados, e o nome da empresa pode ser definido na primeira abertura.

No modo Supabase, a aplicação usa o projeto informado na tela, com login, RLS e permissões do SQL inicial. Os dois modos compartilham o contrato atual e não sincronizam dados entre si. A interface não contém URL, chave ou credenciais de produção.
