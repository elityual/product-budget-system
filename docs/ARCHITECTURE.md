# Arquitetura

> Última revisão técnica: 8 de setembro de 2026.

## Visão geral

A aplicação é uma interface estática com módulos ES, servida por Node.js em `127.0.0.1`. Ela trabalha com um armazenamento por vez: SQLite local, sem login, ou Supabase pertencente ao operador, com Auth, RLS e RPCs. A identidade fixa da interface é Atlas; o nome da empresa armazenado permanece separado e é usado em documentos e PDFs. Não há framework, bundler, sincronização entre bancos ou configuração Supabase fixa no código.

`index.html` inicia `assets/js/app.js`. O estado comercial usa arrays posicionais para preservar o contrato das RPCs. O orçamento tem sempre a ordem `[codigo, clienteCodigo, clienteNome, data, validade, total]`.

## Navegador

- `assets/js/data.js` mantém estado de navegação, permissões e coleções vazias; `assets/js/config.js` define páginas, campos e colunas.
- `app.js`, `listing.js`, `records.js`, `budget-flow.js`, `relations.js`, `navigation.js`, `form.js`, `table.js`, `validation.js` e `budget.js` são controladores e regras da interface.
- `session.js` controla elementos HTML da sessão, o nome exibido da empresa no cabeçalho, confirmação de restauração, backup manual e a janela de Configurações. A janela mantém pasta e intervalo como rascunho até salvar; no SQLite usa as mesmas APIs da tela inicial e, no Supabase, informa que o backup local não se aplica. Downloads e atualizações do DOM não pertencem ao armazenamento.
- `budget-print.js` cria a prévia de orçamento em uma nova janela e registra o clique de Imprimir / Salvar PDF no DOM dessa janela. Assim a impressão não depende de JavaScript embutido, que a política HTTP bloqueia.
- `backend.js` é a fachada comum. Mantém revisão, permissões, aprovações e o contrato retornado aos controladores.
- `assets/js/storage/config.js` guarda somente a escolha de armazenamento e a configuração pública do Supabase. `local.js` cuida do token e do transporte HTTP local. `supabase.js` cuida do transporte Auth/PostgREST e da sessão remota. Esses adaptadores retornam dados e metadados; não acessam o DOM.
- O seletor de armazenamento usa o mesmo componente de dropdown customizado dos filtros (`form.js`), com um campo oculto para preservar os valores `local` e `supabase` e eventos `change` para atualizar os campos de login.

O token Supabase fica em `sessionStorage`. A URL e a chave publishable ficam em `localStorage`; senhas não são persistidas. O token do SQLite existe somente em `sessionStorage` e muda a cada execução do servidor.

## Servidor local

O launcher passa `ATLAS_LAUNCHER_ID` ao processo filho e aceita apenas a mensagem `ATLAS_READY:<id>` recebida pelo stdout desse filho depois de escutar a porta. Ele drena stdout/stderr e recusa portas ocupadas. O servidor encerra também ao receber EOF no stdin quando iniciado pelo launcher. O fechamento da janela aguarda a saída do filho sem encerramento forçado por prazo.

`server.js` é o inicializador: cria configuração, abre o banco, cria o backup diário, agenda os backups configurados e inicia HTTP. Em `SIGINT`, `SIGTERM` ou parada pelo launcher, fecha as conexões HTTP, aguarda a fila de backup e fecha SQLite. A cópia final depende de mudança na revisão desde a última cópia automática. Importar os módulos em `server/` não abre banco nem inicia serviço.

`launcher/AtlasLauncher.cs` é uma alternativa opcional para Windows. O comando `npm run build:launcher` compila `AtlasLauncher.exe` com o compilador .NET Framework instalado no Windows; o binário fica fora do controle de versão. O launcher procura `node.exe` no `PATH`, inicia `server.js` na pasta do próprio EXE, aguarda a confirmação `ATLAS_READY:<id>` do filho, abre o navegador e encerra somente o processo filho. A mensagem `shutdown` em stdin aciona o mesmo fechamento gracioso de `SIGINT`; a execução normal por `npm start` permanece inalterada. Um mutex por caminho impede duas janelas para a mesma pasta.

- `server/config.js`: resolve caminhos de dados, porta e diretório público.
- `server/database.js`: abre, inicializa e fecha SQLite.
- `server/validation.js`: valida arrays, datas e valores do contrato.
- `server/workspace.js`: lê, grava e aprova em transações, com revisão e vínculos relacionais.
- `server/backups.js`: cria exportações, backup diário, retenção e restauração com cópia de recuperação. `server/automatic-backups.js` guarda as configurações locais, valida a pasta externa, cria cópias atômicas e agenda backups SQLite.
- As rotas locais protegidas por token `/api/backup-settings` e `/api/backup-folder` leem e configuram o backup e solicitam o seletor nativo de pasta no Windows. A tela inicial mostra os controles somente para SQLite, mantém o caminho no estado da sessão até o salvamento e bloqueia novas seleções enquanto o diálogo estiver aberto. O encerramento aguarda a fila de backup antes de fechar SQLite.
- O intervalo de backup usa o componente de dropdown compartilhado. Ao salvar, `automatic-backups.js` limpa o temporizador anterior e agenda uma única execução com o novo intervalo; a fila absorve falhas anteriores antes de aceitar uma nova tarefa.
- A rota local protegida `/api/backup-manual` usa a mesma fila de backup, grava uma cópia manual fora da retenção automática e abre apenas a subpasta configurada `Atlas Backups` no Explorador do Windows. O cabeçalho centraliza o nome de empresa armazenado e a data, enquanto Atlas permanece na extremidade esquerda; em telas pequenas esse texto é ocultado.
- `server/http.js`: aplica token, limites de corpo, rotas `/api/*` e entrega somente arquivos públicos.

O SQLite mantém valores monetários como centavos inteiros. O servidor recebe a conexão e a configuração por parâmetro, não por estado criado na importação. Arquivos do banco, configuração privada e backup não são rotas HTTP.

## Persistência e autorização

`supabase/migrations/202609080001_initial.sql` cria uma instalação vazia com tabelas relacionais, RLS, permissões e RPCs. Códigos são gerados pelo banco, vínculos usam chaves estrangeiras e totais são calculados no servidor. Escritas retornam `{ revision, payload, approved_codes }`; conflito de revisão retorna `null`.

No Supabase, usuários autenticados não anônimos leem e alteram o workspace compartilhado. Exclusões de clientes, categorias e produtos exigem administrador; orçamentos podem ser alterados pelos autenticados. No SQLite, o usuário do computador possui essas permissões. A confirmação por senha para exclusão é uma camada da interface do modo Supabase; a autoridade permanece no banco.

O SQLite cria backup diário ao iniciar e retém sete cópias. A restauração valida o formato, cria uma cópia anterior e troca os dados em transação. A carga `supabase/seeds/example_data.sql` é opcional e só funciona em banco comercial vazio.

## Fluxo de dados

1. A tela de sessão escolhe o armazenamento e carrega dados por `backend.js`.
2. A fachada solicita o adaptador escolhido, atualiza revisão, permissões e aprovações e devolve o payload aos controladores.
3. Os controladores alteram o estado em memória e chamam a persistência por callback de `app.js`.
4. SQLite ou RPC Supabase validam e gravam o workspace de modo atômico. A resposta substitui o estado local; em falha, `app.js` restaura o snapshot visual.

## Testes, distribuição e convenções

- `tests/unit/` cobre funções isoladas; `tests/integration/` cobre SQLite e SQL inicial com PGlite; `tests/fixtures/` contém dados sem uso comercial; `e2e/` cobre o navegador.
- `npm run check` descobre e valida a sintaxe de arquivos JavaScript nas pastas de código e testes. `npm test` descobre arquivos `*.test.js`. `npm run test:e2e` inicia o servidor local descartável configurado em `playwright.config.js`, na porta 8766 por padrão ou na definida por `PLAYWRIGHT_PORT`; isso permite testar sem parar a aplicação em 8765.
- `scripts/package-source.mjs` cria o pacote de fontes a partir de uma lista explícita de arquivos e diretórios públicos. Ele não usa exclusões para decidir o conteúdo distribuído.
- Código e comentários próprios usam português do Brasil, UTF-8 e imports relativos com extensão `.js`.

O estado das regras comerciais está em [REQUIREMENTS.md](REQUIREMENTS.md), defeitos confirmados em [ISSUES.md](ISSUES.md) e trabalho posterior em [ROADMAP.md](ROADMAP.md).
