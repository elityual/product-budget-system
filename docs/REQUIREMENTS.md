# Requisitos funcionais

> Última revisão técnica: 7 de setembro de 2026.

Este documento consolida as anotações de `docs/ideas.text` e registra o estado observado no código atual. Os marcadores significam:

- **Implementado**: existe no protótipo atual.
- **Parcial**: existe, mas não cumpre todas as regras descritas.
- **Pendente**: ainda não existe.

## Clientes (`TabelaCliente`)

| Requisito | Estado | Observação |
| --- | --- | --- |
| Campos: código imutável, tipo, CPF/CNPJ e nome | Implementado | O código é numérico e sem prefixo; tipo usa dropdown sem pesquisa restrito a Pessoa Física/Jurídica; CPF/CNPJ e nome usam `required`. |
| Listar e pesquisar clientes | Implementado | A pesquisa segue o padrão visual de Produtos, considera todas as colunas e combina com o dropdown genérico de tipo de cliente. |
| Exibir orientação correspondente à operação | Implementado | Listar e incluir possuem título e descrição próprios. |
| Validar documento e nome | Implementado | CPF numérico e CNPJ numérico ou alfanumérico deve corresponder ao tipo e aos dígitos verificadores; CPF digitado e salvo no formato `000.000.000-00`, CNPJ digitado e salvo com máscara `00.000.000/0000-00` e letras maiúsculas; documento único entre clientes. Nome não aceita apenas espaços. Regras aplicadas na inclusão e edição. |
| Incluir cliente | Implementado | Código gerado pelo banco em `cliente.codigo`; o formulário envia null e recebe o código após salvar. Não reutiliza códigos excluídos; pode ter lacunas. O contrato inicial está em `supabase/migrations/202609080001_initial.sql`. |
| Retornar à lista após incluir ou cancelar | Implementado | Fechar o formulário iniciado pelo submenu restaura Listar clientes. |
| Selecionar e carregar cliente para editar | Implementado | Cada linha da listagem possui um botão de edição. |
| Confirmar alteração | Implementado | A edição solicita confirmação antes de modificar os dados do cliente. |
| Selecionar cliente para excluir | Implementado | Cada linha possui botão de exclusão; clientes com orçamentos vinculados são bloqueados. |
| Confirmar e validar senha na exclusão | Implementado | No Supabase a interface confirma e verifica a senha no Auth, e a exclusão de catálogo é restrita a administradores no SQL. No SQLite local há confirmação, sem exigir senha ou login. |

CPF numérico e CNPJ numérico/alfanumérico são validados localmente. CNPJ aceita A–Z e 0–9 nas primeiras 12 posições e somente números nos dois dígitos verificadores. Letras minúsculas são convertidas para maiúsculas e a duplicidade ignora caixa e pontuação. Não há consulta de situação cadastral.

Clientes são gravados em `public.cliente` (codigo, tipo, documento, nome) no Supabase e na tabela equivalente do SQLite. O código é imutável e gerado no servidor para novas linhas. A instalação começa vazia.

## Categorias (`TabelaCategorias`)

| Requisito | Estado | Observação |
| --- | --- | --- |
| Campos: código imutável e descrição obrigatória | Implementado | O código é numérico e sem prefixo; descrição usa `required` e a listagem utiliza pesquisa textual. |
| Descrição única | Implementado | Obrigatória após remover espaços externos; comparação ignora caixa e espaços repetidos. A edição desconsidera o próprio registro. |
| Listar, incluir e editar | Implementado | Usa o snapshot carregado; renomear categoria atualiza produtos e excluir categoria em uso é bloqueado. |
| Confirmar alteração | Implementado | A edição solicita confirmação antes de modificar a descrição da categoria. |
| Excluir com confirmação e senha | Implementado | Confirma e verifica senha no Auth; conclusão confirmada pelo usuário (ISS-003). |

## Itens/produtos (`TabelaItensProdutos`)

Campos implementados: código numérico imutável e sem prefixo, categoria, nome, descrição, valor de venda, data de cadastro e status.

| Requisito | Estado | Observação |
| --- | --- | --- |
| Listar produtos | Implementado | A listagem exibe todos os campos previstos e formata o valor de venda e o status. |
| Pesquisar e filtrar produtos | Implementado | Pesquisa combinada com categoria e status; selecionar categoria ou Todas aplica imediatamente o filtro e retorna à primeira página. |
| Incluir produto | Implementado | Os campos salvos correspondem às colunas exibidas e a data de cadastro é gerada automaticamente. |
| Validar preço e descrição na inclusão e edição | Implementado | Preço finito, positivo e com até duas casas decimais; nome e descrição não aceitam apenas espaços. Descrição única entre produtos, ignorando caixa e espaços repetidos e desconsiderando o próprio registro na edição. |
| Validar categoria, descrição, valor e status | Implementado | Os campos obrigatórios impedem valores vazios; a categoria deve corresponder a uma categoria cadastrada e o status usa dropdown restrito a Ativo/Inativo. |
| Editar e carregar dados | Implementado | Os campos são carregados e permanecem alinhados com as colunas da tabela. |
| Confirmar alteração | Implementado | Produtos pedem confirmação antes de salvar; cancelar mantém dados anteriores e formulário. |
| Excluir com confirmação e senha | Implementado | Confirma e verifica senha no Auth; conclusão confirmada pelo usuário (ISS-003). |

## Orçamentos (`TabelaOrçamento`)

Campos implementados: código numérico imutável e sem prefixo, código do cliente, nome do cliente, data automática e imutável, validade e valor total calculado.

| Requisito | Estado | Observação |
| --- | --- | --- |
| Listar orçamentos | Implementado | Registros carregados, incluídos e editados possuem todas as colunas esperadas pela tabela. A carga demonstrativa é opcional e separada da aplicação. |
| Incluir orçamento | Implementado | O fluxo monta orçamento e itens e envia o snapshot em uma gravação após validar os dados obrigatórios. |
| Integridade do cliente | Implementado | Seleção/edição usa código, inclusive para homônimos; renomear cliente atualiza orçamentos e excluir cliente vinculado é bloqueado. |
| Selecionar cliente e informar validade | Implementado | A seleção usa uma lista pesquisável dos clientes atuais, armazena nome e código do cliente e exige a validade. |
| Selecionar itens e quantidades | Implementado | A segunda etapa lista nome, descrição e valor, pesquisa por nome/descrição, filtra por categoria e aceita somente dígitos nos campos de quantidade. |
| Exigir ao menos um item | Implementado | O salvamento é bloqueado até existir ao menos uma quantidade inteira maior que zero. |
| Gerar data e calcular valor total | Implementado | A data é automática; totais dos itens e do orçamento são calculados a partir de quantidade e valor unitário. |

Códigos de categorias, produtos e orçamentos são gerados pelo SQL via identity. Produtos e orçamentos recebem data automática no SQL, preservada na edição. Chaves estrangeiras protegem categoria, cliente e produto vinculados; excluir um orçamento remove seus itens. Produtos usados em orçamento não podem ser excluídos.

## Itens de orçamento (`TabelaItensOrçamento`)

A estrutura contém código numérico do orçamento, código numérico e nome do produto, quantidade, valor unitário e valor total do item (`quantidade × valor unitário`).

| Requisito | Estado | Observação |
| --- | --- | --- |
| Acessar pelo submenu de Orçamentos | Implementado | “Itens do orçamento” abre uma página própria de consulta. |
| Listar os campos da tabela | Implementado | A tabela exibe código do orçamento, código e nome do produto, quantidade, valor unitário e total do item. |
| Pesquisar e paginar itens | Implementado | Reutiliza a pesquisa textual e a paginação de até 10 registros. |
| Relacionar itens ao orçamento | Implementado | Cada item recebe o mesmo código numérico do orçamento criado; o snapshot de orçamento e itens é enviado junto. |
| Incluir itens pelo fluxo do orçamento | Implementado | Produtos com quantidade inteira positiva geram linhas em `itensOrcamento`; quantidades inválidas são descartadas também pela regra de dados. |
| Calcular e persistir o total | Implementado | Cada total é coluna SQL calculada (`quantidade × valor unitário`) e a RPC soma os itens no orçamento. Valores monetários usam numeric com duas casas decimais. |

## Requisitos transversais

| Requisito | Estado | Observação |
| --- | --- | --- |
| Nomes acessíveis dos botões de ícone | Implementado | Editar/excluir identificam ação, entidade e código; fechar formulário, menu móvel e três atalhos indisponíveis possuem nomes e títulos. Símbolos são ocultados da leitura assistiva. Atalhos sem ação estão desabilitados e identificados como indisponíveis. |
| Foco visível nos botões | Implementado | Botões habilitados recebem contorno e halo ao navegar pelo teclado com `:focus-visible`. |
| Persistência via SQLite local | Implementado | `server.js` cria banco relacional vazio, grava transações, calcula totais, controla revisão e oferece backup/restauração; o modo local não exige login. |
| Persistência via Supabase | Implementado | A instalação inicial cria tabelas, RLS, códigos identity, FKs, totais SQL, revisão e RPCs em um projeto novo. A URL e a chave publishable são informadas pelo operador. |
| Sair do sistema | Implementado | Tenta revogar sessão remota, remove token local, esvazia dados e retorna ao login. |
| Responsividade | Implementado | Menu móvel até 760 px com botão, foco, Escape, fechamento ao navegar e ao clicar fora; tabelas com rolagem horizontal. |
| Visibilidade de novos registros | Implementado | Iniciar inclusão pelo botão principal ou submenu limpa todos os filtros da listagem, inclusive em orçamentos. Cancelar mantém filtros limpos; editar preserva filtros. Salvar direciona à última página. |
| Pesquisa e filtros padronizados | Implementado | Todas as listagens reutilizam a pesquisa visual de Produtos; filtros contextuais usam combobox ou dropdown genérico. |
| Paginação das tabelas | Implementado | Todas as listagens exibem no máximo 10 registros por página e oferecem navegação para a página anterior ou seguinte. |
| Renderização segura de dados | Implementado | Conteúdo textual é escapado nas tabelas e inserido com `textContent` nas listas dinâmicas. |
| Indicação visual de seleção | Implementado | Campos e listas selecionáveis destacam categoria, cliente ou produto escolhido sem alterar as regras de negócio. |
| Segurança de exclusão | Implementado | No Supabase, a RPC exige administrador para excluir clientes, categorias e produtos; no SQLite local o usuário único tem essa permissão. A interface mantém confirmação antes da exclusão. |

## Armazenamento, configuração e recuperação

| Requisito | Estado | Observação |
| --- | --- | --- |
| Escolher SQLite local ou Supabase na abertura | Implementado | A tela inicial seleciona um armazenamento por vez. Os bancos permanecem separados e a troca limpa a sessão e o estado em memória; um formulário aberto pede confirmação antes de descartar o rascunho. |
| Usar SQLite sem login e restringir o servidor ao computador | Implementado | `server.js` escuta apenas `127.0.0.1`, usa token por inicialização e mantém o banco fora do repositório. Acesso a arquivos privados e rotas desconhecidas é recusado. |
| Configurar o nome da empresa | Implementado | O nome é salvo na configuração local do navegador e, no SQLite, também no banco; aparece no cabeçalho e na impressão. |
| Fazer backup e restaurar o banco local | Implementado | Há backup diário na inicialização com retenção de sete cópias, cópia de recuperação antes da restauração, validação de esquema e rejeição sem substituir dados quando o arquivo é inválido. |

A configuração remota está detalhada em [SUPABASE.md](SUPABASE.md). O Supabase exige login; o SQLite local é de usuário único e não exige login. O modelo relacional final está em uma única migração inicial. A validação de DVs permanece no cliente.

## Critério de atualização

Sempre que um requisito for implementado ou seu comportamento mudar, atualize a respectiva linha, observação e campos relacionados. Novos requisitos devem ser incluídos aqui e, quando afetarem a arquitetura ou a execução, também em `ARCHITECTURE.md` e `README.md`.

Defeitos técnicos, riscos e limitações de implementação são acompanhados separadamente em [`ISSUES.md`](ISSUES.md).

A reorganização dos módulos preserva as regras funcionais acima. As coleções começam vazias; exemplos existem nas fixtures de teste e na carga opcional protegida `supabase/seeds/example_data.sql`. Todos os códigos novos são gerados pelo banco.

### Novo orçamento: seleção e revisão de itens

A seleção inicial exibe somente o nome do cliente, mantendo o código como referência interna. A etapa de itens usa duas colunas: produtos e quantidades à esquerda, lista adicionada e total à direita. ADICIONAR ITENS transfere as quantidades para o rascunho e limpa a seleção; adicionar novamente o mesmo produto soma sua quantidade. Itens podem ser removidos da lista. SALVAR ORÇAMENTO exige validade e ao menos um item adicionado, e grava somente a lista da direita. Adicionar/remover itens não grava no Supabase; a gravação continua atômica ao salvar. No celular, as colunas ficam empilhadas. O estado do rascunho pertence a `budget-flow.js` e reinicia a cada novo orçamento.

Editar orçamento abre o fluxo de duas colunas com os itens existentes. Permite trocar cliente, validade e adicionar/remover itens; adicionar novamente soma quantidades. Salvar pede confirmação e preserva código, data original e nomes/preços históricos dos itens existentes. Cancelar a confirmação mantém o rascunho sem gravar. Orçamento e itens são atualizados juntos pela RPC existente.

O ícone da Atlas combina capacete de obra e letra A nas cores da marca. O SVG local `assets/icons/atlas.svg` é reutilizado no cabeçalho e como favicon da aba. No cabeçalho, a imagem usa texto alternativo vazio porque o nome da empresa já aparece ao lado.

## Revisão de issues: orçamentos e sessão

- Enter em um campo de quantidade adiciona os itens ao rascunho, sem submeter o orçamento. A gravação continua pelo botão Salvar.
- Na edição, o catálogo exibe o mesmo preço histórico usado para os produtos já presentes no orçamento; novos produtos usam o preço atual.
- Sair oculta a aplicação, esvazia dados e limpa tabela/formulário imediatamente. O login fica desabilitado enquanto o logout remoto termina (ou falha), evitando concorrência entre logout e uma nova sessão. O token local é removido mesmo quando a revogação remota falha.

## Papéis e compartilhamento

Implementado, com conclusão confirmada pelo usuário: todos os autenticados não anônimos consultam, incluem e editam o workspace comum. Apenas administradores podem excluir clientes, categorias e produtos. Todos os autenticados podem excluir orçamentos e remover seus itens. Quantidades positivas podem ser editadas diretamente na lista da direita por todos; itens novos de rascunho podem ser removidos antes da gravação. Nenhum usuário se torna administrador automaticamente. O operador configura atlas_admins pelo SQL Editor.

## Permissões

A instalação inicial aplica essas permissões diretamente: todos os autenticados não anônimos editam e removem orçamentos e itens; clientes, categorias e produtos só podem ser excluídos por administradores. A gravação é transacional e usa revisão global.

## Impressão e PDF de orçamento

Implementado: o botão Imprimir em cada orçamento salvo abre uma prévia em nova janela para usuários autenticados e para o usuário local. O documento contém o nome configurado da empresa, cliente e CPF/CNPJ atual, código, emissão, validade, itens históricos, quantidades, preços, subtotais e total. Imprimir / Salvar PDF abre o diálogo nativo; selecione Salvar como PDF para exportar. Os controles não aparecem no documento impresso. Cabeçalhos/rodapés automáticos são configurados no navegador.

`assets/js/budget-print.js` gera o documento com escape de texto e filtra itens pelo código do orçamento; `records.js` trata a ação delegada de `table.js`. Estilos de impressão são locais ao documento, com formato A4 e cabeçalho de tabela repetido em múltiplas páginas. Não há serviço externo, biblioteca nova, gravação no banco ou download automático. Pop-ups bloqueados geram orientação. Testes em `tests/budget-print.test.js` e `e2e/app.spec.js` verificam escape, separação de itens, conteúdo e controles ocultos em mídia de impressão.

## Aprovação de orçamentos

Implementado no código: no menu de Orçamentos, Listar orçamentos aparece antes de Orçamentos aprovados. O submenu Orçamentos aprovados lista apenas aprovados, com pesquisa e paginação. O botão Aprovar orçamento fica no cabeçalho, depois de Novo orçamento, com 14 px de espaço entre os botões; abre a seleção de um orçamento pendente e pede confirmação. Não há botão de aprovação nas linhas. Todos os autenticados não anônimos podem aprovar. Não há estados Enviado/Cancelado, reversão de aprovação nem bloqueio de edição: editar um aprovado mantém sua aprovação, conforme o escopo limitado desta entrega.

A instalação inicial cria `orcamento.aprovado` como falso. `atlas_approve_budget(expected_revision,budget_code)` usa a revisão global e grava atomicamente; repetição, orçamento inexistente e acesso anônimo são rejeitados.

No submenu Orçamentos aprovados, a única ação por linha é Baixar PDF, que abre a prévia e permite Salvar como PDF pelo diálogo nativo do navegador. Não há ações de edição, exclusão ou aprovação nessa listagem; a listagem normal mantém as ações existentes. Pesquisa e paginação preservam o vínculo com o orçamento original. Esta alteração de interface não exige nova migração SQL.

A aprovação é iniciada exclusivamente pelo botão do cabeçalho Aprovar orçamento. A janela segue o padrão visual de Novo orçamento, permite pesquisar por cliente ou código e mostra cada pendente com código, cliente, data de criação e validade. Selecionar uma opção habilita Aprovar; Cancelar e fechar não alteram dados. Sem pendentes, o botão fica desabilitado. O submenu Orçamentos aprovados mantém apenas a ação PDF por linha. Não é necessária nova migração para essa mudança de interface.

Nas listagens geral e de aprovados, as primeiras colunas são Código, Código do cliente e Cliente. O registro de orçamento e as RPCs usam `[codigo, clienteCodigo, clienteNome, data, validade, total]`; a relação SQL permanece por `orcamento.cliente_codigo`, com o nome consultado em `cliente`.

## Carga simples para implantação

Implementado em `supabase/seeds/example_data.sql`: em um banco Supabase vazio, o operador pode carregar dois clientes, duas categorias, dois produtos e um orçamento com dois itens. O script recusa tabelas preenchidas e não participa da instalação normal.


## ISS-019 — gravação direta na ordem atual

O contrato único de orçamento é `[codigo, clienteCodigo, clienteNome, data, validade, total]`. A instalação inicial rejeita a ordem antiga antes de qualquer alteração; o cliente é vinculado pelo código no índice 1.
