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
| Incluir cliente | Implementado | Código gerado pelo PostgreSQL em `cliente.codigo` (identity); o formulário envia null e recebe o código após salvar. Não reutiliza códigos excluídos; pode ter lacunas. O identity foi introduzido nas migrações 002/003; a instalação atual exige a sequência 001–008. |
| Retornar à lista após incluir ou cancelar | Implementado | Fechar o formulário iniciado pelo submenu restaura Listar clientes. |
| Selecionar e carregar cliente para editar | Implementado | Cada linha da listagem possui um botão de edição. |
| Confirmar alteração | Implementado | A edição solicita confirmação antes de modificar os dados do cliente. |
| Selecionar cliente para excluir | Implementado | Cada linha possui botão de exclusão; clientes com orçamentos vinculados são bloqueados. |
| Confirmar e validar senha na exclusão | Implementado | A interface confirma e verifica a senha no Supabase Auth; a exclusão deste cadastro é restrita a administradores no SQL. Conclusão confirmada pelo usuário (ISS-003). |

CPF numérico e CNPJ numérico/alfanumérico são validados localmente. CNPJ aceita A–Z e 0–9 nas primeiras 12 posições e somente números nos dois dígitos verificadores. Letras minúsculas são convertidas para maiúsculas e a duplicidade ignora caixa e pontuação. Não há consulta de situação cadastral.

Clientes são gravados em `public.cliente` (user_id, codigo, tipo, documento, nome). O código é imutável e gerado no servidor para novas linhas. Migrações 002/003 preservam clientes antigos e suas referências; conclusão confirmada pelo usuário.

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
| Persistência via Supabase | Implementado | Cliente REST, login, tabelas próprias para todas as entidades, códigos identity, FKs, totais SQL, revisão e rollback implementados e testados localmente. Conclusão confirmada pelo usuário (ISS-004). |
| Sair do sistema | Implementado | Tenta revogar sessão remota, remove token local, esvazia dados e retorna ao login. |
| Responsividade | Implementado | Menu móvel até 760 px com botão, foco, Escape, fechamento ao navegar e ao clicar fora; tabelas com rolagem horizontal. |
| Visibilidade de novos registros | Implementado | Iniciar inclusão pelo botão principal ou submenu limpa todos os filtros da listagem, inclusive em orçamentos. Cancelar mantém filtros limpos; editar preserva filtros. Salvar direciona à última página. |
| Pesquisa e filtros padronizados | Implementado | Todas as listagens reutilizam a pesquisa visual de Produtos; filtros contextuais usam combobox ou dropdown genérico. |
| Paginação das tabelas | Implementado | Todas as listagens exibem no máximo 10 registros por página e oferecem navegação para a página anterior ou seguinte. |
| Renderização segura de dados | Implementado | Conteúdo textual é escapado nas tabelas e inserido com `textContent` nas listas dinâmicas. |
| Indicação visual de seleção | Implementado | Campos e listas selecionáveis destacam categoria, cliente ou produto escolhido sem alterar as regras de negócio. |
| Segurança de exclusão | Implementado | Login obrigatório e senha adicional na interface. A RPC exige administrador para excluir clientes, categorias e produtos; permite excluir orçamentos e seus itens a todos os autenticados, sem impor nova senha a chamadas diretas. Conclusão confirmada pelo usuário (ISS-003). |

A ativação remota e o modelo de workspace compartilhado estão detalhados em [SUPABASE.md](SUPABASE.md). Login não oferece cadastro ou recuperação de senha e a sessão não renova tokens automaticamente. O modelo relacional e suas atualizações estão implementados nas migrações 001–008, com testes locais. A validação de DVs no banco permanece planejada.

## Critério de atualização

Sempre que um requisito for implementado ou seu comportamento mudar, atualize a respectiva linha, observação e campos relacionados. Novos requisitos devem ser incluídos aqui e, quando afetarem a arquitetura ou a execução, também em `ARCHITECTURE.md` e `README.md`.

Defeitos técnicos, riscos e limitações de implementação são acompanhados separadamente em [`ISSUES.md`](ISSUES.md).

A reorganização dos módulos preserva as regras funcionais acima. As coleções da aplicação começam vazias; exemplos existem nas fixtures de teste e na carga opcional `supabase/seeds/reset_simple_data.sql`. Todos os códigos novos são gerados pelo SQL.

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

## Atualização de permissões — migração 006

`supabase/migrations/202609060006_budget_permissions.sql` permite a todos os autenticados não anônimos editar/excluir orçamentos e remover itens do orçamento. Exclusão de clientes, categorias e produtos continua exclusiva de administradores. A exclusão de orçamento mantém confirmação e senha na interface; a remoção de itens é gravada ao salvar. Um orçamento mantido exige ao menos um item. O SQL aplica as permissões mesmo em chamadas diretas; revisão global, transação e bloqueios de vínculo continuam ativos. Aplique somente a 006 se a 005 já estiver instalada, depois recarregue a aplicação.

## Impressão e PDF de orçamento

Implementado: o botão Imprimir em cada orçamento salvo abre uma prévia em nova janela para todos os usuários autenticados. O documento contém Atlas Máquinas & Obras, cliente e CPF/CNPJ atual, código, emissão, validade, itens históricos, quantidades, preços, subtotais e total. Imprimir / Salvar PDF abre o diálogo nativo; selecione Salvar como PDF para exportar. Os controles não aparecem no documento impresso. Cabeçalhos/rodapés automáticos são configurados no navegador.

`assets/js/budget-print.js` gera o documento com escape de texto e filtra itens pelo código do orçamento; `records.js` trata a ação delegada de `table.js`. Estilos de impressão são locais ao documento, com formato A4 e cabeçalho de tabela repetido em múltiplas páginas. Não há serviço externo, biblioteca nova, gravação no banco ou download automático. Pop-ups bloqueados geram orientação. Testes em `tests/budget-print.test.js` e `e2e/app.spec.js` verificam escape, separação de itens, conteúdo e controles ocultos em mídia de impressão.

## Aprovação de orçamentos

Implementado no código: no menu de Orçamentos, Listar orçamentos aparece antes de Orçamentos aprovados. O submenu Orçamentos aprovados lista apenas aprovados, com pesquisa e paginação. O botão Aprovar orçamento fica no cabeçalho, depois de Novo orçamento, com 14 px de espaço entre os botões; abre a seleção de um orçamento pendente e pede confirmação. Não há botão de aprovação nas linhas. Todos os autenticados não anônimos podem aprovar. Não há estados Enviado/Cancelado, reversão de aprovação nem bloqueio de edição: editar um aprovado mantém sua aprovação, conforme o escopo limitado desta entrega.

Aplique somente `supabase/migrations/202609060007_budget_approval.sql` após 006 e recarregue as abas. A coluna `orcamento.aprovado` começa falsa para registros existentes/novos. `atlas_approve_budget(expected_revision,budget_code)` usa a revisão global e grava atomicamente; repetição, orçamento inexistente e acesso anônimo são rejeitados. `atlas_load_workspace()` retorna `approved_codes` além do contrato anterior, mantendo os arrays de orçamento com seis campos. `backend.js` mantém `approvedBudgets` separado do payload; a interface só atualiza a aprovação após confirmação do servidor. Não há dependência nova.

No submenu Orçamentos aprovados, a única ação por linha é Baixar PDF, que abre a prévia e permite Salvar como PDF pelo diálogo nativo do navegador. Não há ações de edição, exclusão ou aprovação nessa listagem; a listagem normal mantém as ações existentes. Pesquisa e paginação preservam o vínculo com o orçamento original. Esta alteração de interface não exige nova migração SQL.

A aprovação é iniciada exclusivamente pelo botão do cabeçalho Aprovar orçamento. A janela segue o padrão visual de Novo orçamento, permite pesquisar por cliente ou código e mostra cada pendente com código, cliente, data de criação e validade. Selecionar uma opção habilita Aprovar; Cancelar e fechar não alteram dados. Sem pendentes, o botão fica desabilitado. O submenu Orçamentos aprovados mantém apenas a ação PDF por linha. Não é necessária nova migração para essa mudança de interface.

Nas listagens geral e de aprovados, as primeiras colunas são Código, Código do cliente e Cliente. O registro de orçamento e as RPCs usam `[codigo, clienteCodigo, clienteNome, data, validade, total]`. A migração 008 converte a entrada para as regras de sincronização existentes e retorna a nova ordem; a relação SQL permanece por `orcamento.cliente_codigo`, com o nome consultado em `cliente`.

## Carga simples para implantação

Implementado em `supabase/seeds/reset_simple_data.sql`: após as migrações 001–008, o operador pode apagar todos os registros comerciais e carregar dois clientes, duas categorias, três produtos e um orçamento com dois itens. Os códigos são reiniciados e gerados pelos identity do PostgreSQL; referências e total são montados no SQL. A operação é transacional, preserva usuários e administradores e incrementa a revisão para exigir recarga das abas abertas.


## ISS-019 — gravação direta na ordem atual

Implementado no código, com aplicação remota pendente: `supabase/migrations/202609070009_budget_order_compatibility.sql` substitui a RPC após 008 para gravar diretamente `[codigo, clienteCodigo, clienteNome, data, validade, total]`. Apesar do nome do arquivo, não há suporte à entrada legada: nome antes do código é rejeitado com `22023`, antes de qualquer alteração. A função `atlas_save_workspace_legacy_order` é removida; não há conversão intermediária. O cliente é vinculado pelo código no índice 1, e o nome retornado vem do JOIN com `cliente`.

Autenticação, permissões, revisão global, aprovação, datas e sincronização transacional são preservadas. A migração avança a revisão; recarregue todas as abas com a interface atual antes de salvar. Não há nova dependência, serviço ou variável de ambiente. `tests/shared.test.js` cobre inclusão e edição na ordem atual, rejeição da ordem antiga e de entradas inválidas, conflitos e preservação do estado após falha. A migração 008 permanece como histórico; a 009 substitui seu adaptador.
