# Arquitetura

> Última revisão técnica: 8 de setembro de 2026.

## Visão geral

A aplicação é uma interface estática com módulos ES, servida por Node.js em `127.0.0.1`. Ela trabalha com um armazenamento por vez: SQLite local, sem login, ou Supabase pertencente ao operador, com Auth, RLS e RPCs. A identidade fixa da interface é Atlas; o nome da empresa armazenado permanece separado e é usado em documentos e PDFs. Não há framework, bundler, sincronização entre bancos ou configuração Supabase fixa no código.

`index.html` inicia `assets/js/app.js`. O estado comercial usa arrays posicionais para preservar o contrato das RPCs. O orçamento tem sempre a ordem `[codigo, clienteCodigo, clienteNome, data, validade, total]`.

## Navegador

A barra estreita de ícones é uma coluna sticky com a altura útil da janela; o cabeçalho também permanece sticky e Sair usa `margin-top: auto` para ocupar o rodapé. O botão conserva `#exit`, nome acessível e o controlador de sessão existente. Na listagem geral de orçamentos, `listing.js` consulta `approvedBudgets` pelo código e passa o resultado a `table.js`, que acrescenta o selo de situação sem modificar os arrays comerciais. A listagem dedicada não recebe essa coluna.

Nas Configurações, a linha dos três botões aparece antes do texto “Pasta dos backups automáticos”, seguido pelo caminho selecionado e pelo intervalo.

As Configurações agrupam Alterar pasta, Backup manual e Restaurar em `#storage-actions`, dentro de `#settings-local`; o cabeçalho não contém mais ações de backup. Os botões compartilham `.backup-controls`, com hover, foco, clique e estado desabilitado. O seletor exibe “Escolhendo pasta…” enquanto aguarda e só aplica o resultado ao rascunho que iniciou a seleção. Backup manual continua usando a pasta persistida; a restauração mantém seleção de arquivo e confirmação existentes.

- `assets/js/data.js` mantém estado de navegação, permissões e coleções vazias; `assets/js/config.js` define páginas, campos e colunas.
- `app.js`, `listing.js`, `records.js`, `contacts.js`, `budget-flow.js`, `relations.js`, `navigation.js`, `form.js`, `table.js`, `validation.js` e `budget.js` são controladores e regras da interface. `contacts.js` mantém o rascunho do diálogo de contato e só troca as coleções em memória ao salvar.
- `session.js` controla elementos HTML da sessão, o nome exibido da empresa no cabeçalho, confirmação de restauração, backup manual e a janela de Configurações. A janela mantém pasta e intervalo como rascunho até salvar; no SQLite usa as mesmas APIs da tela inicial e, no Supabase, informa que o backup local não se aplica. Downloads e atualizações do DOM não pertencem ao armazenamento.
- O mesmo módulo abre `#company-dialog` depois do carregamento quando `empresa.completo` não corresponde a um perfil válido. O diálogo não pode ser dispensado e salva seu rascunho pela API de empresa antes de liberar a sessão.
- `budget-print.js` cria a prévia de orçamento em uma nova janela e registra o clique de Imprimir / Salvar PDF no DOM dessa janela. Assim a impressão não depende de JavaScript embutido, que a política HTTP bloqueia.
- `backend.js` é a fachada comum. Mantém revisão, permissões, aprovações e o contrato retornado aos controladores.
- `assets/js/storage/config.js` guarda somente a escolha de armazenamento e a configuração pública do Supabase. `local.js` cuida do token e do transporte HTTP local. `supabase.js` cuida do transporte Auth/PostgREST e da sessão remota. Esses adaptadores retornam dados e metadados; não acessam o DOM.
- O seletor de armazenamento usa o mesmo componente de dropdown customizado dos filtros (`form.js`), com um campo oculto para preservar os valores `local` e `supabase` e eventos `change` para atualizar os campos de login.

O token Supabase fica em `sessionStorage`. A URL e a chave publishable ficam em `localStorage`; senhas não são persistidas. O token do SQLite existe somente em `sessionStorage` e muda a cada execução do servidor.

## Servidor local

Compatibilidade Supabase: `202609090002_legacy_budget_user.sql` define o default `auth.uid()` em `orcamento.user_id` somente quando essa coluna legada existe. A RPC continua omitindo o campo; o banco registra o usuário autenticado em novas inserções. A migração preserva valores anteriores, restrições e RLS e não modifica o esquema novo sem essa coluna.

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

No Supabase, `202609100002_budget_total.sql` acrescenta `orcamento.valor_total numeric(18,2)` quando ausente e recalcula valores existentes a partir dos itens. A RPC `atlas_save_workspace` calcula e persiste o total antes de inserir ou atualizar cada orçamento, na mesma transação dos itens. O cálculo associa códigos existentes e identificadores nulos do único orçamento novo permitido; o preço usa a precisão `numeric(14,2)` da coluna do item. A leitura continua somando os itens e o contrato JSON permanece igual. O SQLite não é alterado por essa migração.

A migração `202609100003_approved_budget_items.sql` substitui a RPC de gravação para comparar, antes de qualquer exclusão, os itens recebidos com os itens persistidos de cada orçamento aprovado. A comparação ordena pelo produto e considera produto, nome histórico, quantidade, preço e descrição. O servidor SQLite aplica a mesma comparação. A interface oculta catálogo, adição, remoção e quantidade ao editar aprovados, mas mantém cliente, validade e condições comerciais editáveis.

`budget-flow.js` usa uma composição específica durante a edição: código e situação precedem cliente e validade; as condições comerciais de aprovados vêm antes da área de itens; e catálogo e resumo usam painéis separados. Linhas selecionadas apresentam identidade, quantidade, preço unitário e subtotal em colunas no desktop e em blocos rotulados no celular. A edição aprovada renderiza e envia `originalItems` diretamente, ocupa toda a largura e deixa os itens sem controles. Um rodapé comum reúne saída e salvamento. A criação mantém sua composição anterior.

A RPC `atlas_save_company` restringe seu UPDATE ao UUID fixo do workspace compartilhado criado pela instalação inicial (`00000000-0000-4000-8000-000000000001`). A migração de detalhes pode ser reaplicada para corrigir a ausência de WHERE sem remover dados ou desativar a proteção de gravação.

As RPCs de gravação e aprovação atualizam a revisão com `WHERE revision=expected_revision`, após o bloqueio existente. A substituição transacional dos itens usa `WHERE orcamento_codigo IS NOT NULL` (coluna da chave primária), mantendo a abrangência anterior com condição explícita. A migração `202609080002_safe_workspace_writes.sql` usa `CREATE OR REPLACE FUNCTION` para atualizar instalações existentes sem recriar tabelas nem alterar ACLs. Os testes verificam dados, permissões, aplicação repetida, rollback e presença de WHERE; a proteção específica do Supabase exige confirmação remota.

`supabase/migrations/202609080001_initial.sql` cria uma instalação vazia com tabelas relacionais, RLS, permissões e RPCs. A migração `202609090001_quotation_details.sql` acrescenta perfis e detalhes comerciais opcionais às instalações existentes. Códigos são gerados pelo banco, vínculos usam chaves estrangeiras e totais são calculados no servidor. Escritas retornam `{ revision, payload, approved_codes }`; conflito de revisão retorna `null`.

A migração `202609100001_approval_commercial_terms.sql` amplia `atlas_approve_budget` para receber condições comerciais opcionais. A RPC e o servidor local atualizam somente os quatro campos comerciais em `orcamento_informacao` e aprovam na mesma transação, preservando os snapshots de empresa e cliente. A assinatura anterior continua disponível e preserva as condições existentes.

No diálogo de aprovação, `records.js` aceita uma única seleção por abertura. Ao selecionar, ele oculta pesquisa e lista, mostra o resumo do orçamento e transfere o foco para pagamento; o código selecionado permanece no estado até o cancelamento, sucesso ou reabertura. Falhas de aprovação não reconstroem o diálogo e preservam a seleção e as condições digitadas.

`.budget-terms` é o painel compartilhado das condições comerciais na aprovação e na edição de aprovados. Ele usa título, indicação de preenchimento opcional e uma grade responsiva: pagamento e prazo dividem a linha no desktop, enquanto local e observações ocupam toda a largura. A área de observações permite redimensionamento vertical. O resumo da aprovação usa título e datas em elementos separados para preservar a hierarquia visual.

Para instalações anteriores ao modelo compartilhado, `supabase/audits/202609090003_legacy_user_id_audit.sql` lista dependências de `user_id` comercial. O resultado auditado com chaves compostas `(user_id,codigo)` usa `202609090004_migrate_legacy_composite_commercial_keys.sql`, que arquiva os valores em `atlas_legacy_user_id_backup`, substitui chaves e FKs compostas por códigos e então remove a coluna. A tabela de recuperação não é acessível por sessões da aplicação. A migração genérica `202609090003_remove_legacy_commercial_user_id.sql` é reservada para tabelas sem chaves compostas. Constraints, índices, políticas, triggers e views não mapeados interrompem a transação. `atlas_admins.user_id` e `atlas_workspaces.user_id` não fazem parte dessa remoção.

Contatos usam as coleções `contatosClientes`, `telefonesClientes` e `enderecosClientes`. As tabelas `cliente_contato`, `cliente_telefone` e `cliente_endereco` possuem FK com exclusão em cascata; índices parciais impedem mais de um telefone ou endereço principal por cliente. A migração converte uma única vez os valores antigos de `cliente.detalhes`, mantendo endereços livres em `texto_legado`. Na criação, `novoClienteContato` é um campo transitório do payload: a API/RPC associa e-mail, pessoa de contato de PJ e telefones ao único cliente novo retornado pelo banco na mesma transação; a resposta carregada não o preserva. Edições de contato persistem somente as três coleções nomeadas.

`202609090005_refresh_workspace_contact_rpcs.sql` reapresenta esse contrato a instalações cuja função permaneceu em uma versão anterior. A migração altera apenas `atlas_load_workspace` e `atlas_save_workspace`, mantém ACLs autenticadas e não relê nem converte `cliente.detalhes`. Ela exige que as tabelas de contato existam e que a migração das chaves comerciais legadas já tenha sido concluída.

Após essa etapa, `202609090006_normalize_details.sql` elimina as colunas genéricas `cliente.detalhes` e `orcamento.detalhes`. Termos comerciais e snapshots passam para `orcamento_informacao`, uma relação 1:1 com exclusão em cascata e colunas textuais explícitas. As RPCs e o adaptador SQLite recompõem o objeto da posição 7 do orçamento, mantendo o contrato do navegador e de backup. Grupos de snapshot ausentes não são materializados no objeto, preservando o fallback para dados atuais até o próximo salvamento.

`202609090007_company_profile.sql` substitui `atlas_workspaces.empresa` por `empresa_perfil`, ligada ao workspace. Nome, CNPJ, endereço, telefone, e-mail e o estado validado de completude ficam em colunas explícitas. SQLite usa a mesma estrutura com uma linha de código 1. O contrato externo continua retornando `empresa` como objeto para cabeçalho, snapshots e backups.

Antes de criar essas FKs, a migração de contatos verifica a chave candidata de `cliente.codigo`. Instalações legadas sem PK/UNIQUE recebem uma restrição única somente quando os códigos existentes são não nulos e não repetidos.

No Supabase, usuários autenticados não anônimos leem e alteram o workspace compartilhado. Exclusões de clientes, categorias e produtos exigem administrador; orçamentos podem ser alterados pelos autenticados. No SQLite, o usuário do computador possui essas permissões. A confirmação por senha para exclusão é uma camada da interface do modo Supabase; a autoridade permanece no banco.

O SQLite cria backup diário ao iniciar e retém sete cópias. A restauração valida o formato, cria uma cópia anterior e troca os dados em transação. A carga `supabase/seeds/example_data.sql` é opcional e só funciona em banco comercial vazio.

## Fluxo de dados

1. A tela de sessão escolhe o armazenamento e carrega dados por `backend.js`.
2. A fachada solicita o adaptador escolhido, atualiza revisão, permissões e aprovações e devolve o payload aos controladores.
3. Os controladores alteram o estado em memória e chamam a persistência por callback de `app.js`.
4. SQLite ou RPC Supabase validam e gravam o workspace de modo atômico. O orçamento preserva seus dados comerciais e descrições de produto já registrados; a resposta substitui o estado local; em falha, `app.js` restaura o snapshot visual.

## Testes, distribuição e convenções

- `tests/unit/` cobre funções isoladas; `tests/integration/` cobre SQLite e SQL inicial com PGlite; `tests/fixtures/` contém dados sem uso comercial; `e2e/` cobre o navegador.
- `npm run check` descobre e valida a sintaxe de arquivos JavaScript nas pastas de código e testes. `npm test` descobre arquivos `*.test.js`. `npm run test:e2e` inicia o servidor local descartável configurado em `playwright.config.js`, na porta 8766 por padrão ou na definida por `PLAYWRIGHT_PORT`; isso permite testar sem parar a aplicação em 8765.
- `scripts/package-source.mjs` cria o pacote de fontes a partir de uma lista explícita de arquivos e diretórios públicos. Ele não usa exclusões para decidir o conteúdo distribuído.
- Código e comentários próprios usam português do Brasil, UTF-8 e imports relativos com extensão `.js`.

O estado das regras comerciais está em [REQUIREMENTS.md](REQUIREMENTS.md), defeitos confirmados em [ISSUES.md](ISSUES.md) e trabalho posterior em [ROADMAP.md](ROADMAP.md).

O seletor em `server/automatic-backups.js` carrega `server/windows-folder-picker.ps1` em UTF-8 e executa Windows PowerShell com `-NoProfile -STA -EncodedCommand` (script em Base64 UTF-16LE), saída UTF-8 e timeout de dois minutos. O script mantém uma janela proprietária invisível no monitor ativo e usa um temporizador Windows Forms para localizar somente a outra janela visível do próprio processo. Ao encontrá-la, aplica `SetWindowPos(HWND_TOPMOST)` ao diálogo real e solicita `SetForegroundWindow` uma vez; o temporizador para em seguida. Temporizador, diálogo e janela proprietária são descartados em `finally`; cancelamento retorna caminho vazio. Falhas são convertidas em mensagens para a interface, preservando a causa no servidor. `tests/unit/backup-directory.test.js` cobre o carregamento e a codificação do script, o contrato nativo, caminhos Unicode, cancelamento e mensagens de falha/timeout. O foco efetivo precisa ser confirmado manualmente no Windows.
