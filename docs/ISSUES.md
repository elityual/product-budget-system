# Problemas e riscos conhecidos

> Última revisão técnica: 7 de setembro de 2026.

Este documento registra defeitos observados, riscos técnicos e limitações que podem causar comportamento inesperado. Requisitos de negócio ainda não concluídos continuam sendo acompanhados em [`REQUIREMENTS.md`](REQUIREMENTS.md).

## Critérios

- **Alta**: pode comprometer dados, segurança ou um fluxo principal.
- **Média**: afeta consistência, validação, acesso ou manutenção.
- **Baixa**: afeta principalmente experiência de uso ou qualidade interna.
- **Aberto**: problema reproduzível no código atual.
- **Parcial**: código preparado, mas ativação ou validação externa ainda pendente.
- **Planejado**: limitação conhecida ligada a um requisito ainda pendente.
- **Corrigido**: o defeito foi removido e a validação correspondente foi registrada.

## Resumo

Não há issue aberta nesta revisão. As ISS-001 a ISS-018 estão corrigidas; melhorias planejadas permanecem em `PROJECT_REVIEW.md` e `REQUIREMENTS.md`.

| ID | Prioridade | Estado | Área | Problema |
| --- | --- | --- | --- | --- |
| ISS-001 | Alta | Corrigido | Orçamentos | Inclusão e edição passam a respeitar o formato esperado pela tabela. |
| ISS-002 | Alta | Corrigido | Segurança | Dados textuais são escapados antes da renderização nas tabelas. |
| ISS-003 | Alta | Corrigido | Segurança | Autenticação e permissões implementadas; conclusão confirmada pelo usuário. |
| ISS-004 | Alta | Corrigido | Dados | Persistência Supabase, revisão e rollback implementados; conclusão confirmada pelo usuário. |
| ISS-005 | Média | Corrigido | Identificadores | Códigos são gerados pelo SQL via identity. |
| ISS-006 | Média | Corrigido | Categorias | Renomeação atualiza produtos; exclusão de categoria em uso é bloqueada. |
| ISS-007 | Média | Corrigido | Validação | Documentos, duplicidades e preços são validados. |
| ISS-008 | Média | Corrigido | Responsividade | Menu móvel disponível com botão, foco e fechamento acessível. |
| ISS-009 | Média | Corrigido | Produtos | Edição de produtos solicita confirmação antes de salvar. |
| ISS-010 | Média | Corrigido | Orçamentos | A seleção de clientes usa os registros atuais em memória. |
| ISS-011 | Média | Corrigido | Testes | Testes de navegador cobrem CRUD, navegação, relações e falhas de gravação. |
| ISS-012 | Baixa | Corrigido | Acessibilidade | Botões de ícone possuem nomes acessíveis e títulos; botões têm foco visível. |
| ISS-013 | Baixa | Corrigido | Filtros | Iniciar inclusão limpa os filtros para revelar o novo registro. |
| ISS-014 | Média | Corrigido | Orçamentos | Clientes são associados por código e alterações mantêm vínculos coerentes. |
| ISS-015 | Baixa | Corrigido | Filtros | Selecionar categoria atualiza imediatamente a lista de produtos. |
| ISS-016 | Média | Corrigido | Orçamentos | Enter na quantidade submetia o formulário em vez de adicionar itens. |
| ISS-017 | Alta | Corrigido | Sessão | Logout pendente mantinha a aplicação interativa. |
| ISS-018 | Média | Corrigido | Orçamentos | Catálogo mostrava preço atual na edição, mas cobrava o histórico. |

## Detalhes e correções sugeridas

### ISS-001 — Estrutura inconsistente de orçamentos

Antes da correção, o cabeçalho esperava código, cliente, data, validade e valor total, mas o formulário fornecia somente cliente e validade. O salvamento genérico criava uma linha menor, e a edição carregava a data existente no campo de validade por usar índices posicionais genéricos.

**Impacto:** novos orçamentos aparecem em colunas erradas e podem perder significado ao serem editados.

**Correção aplicada:** o fluxo de novo orçamento não usa mais o salvamento genérico nem permite persistir uma linha incompleta. Ele armazena nome e código do cliente, gera a data, posiciona a validade, cria os itens e calcula o total. A edição carrega validade e itens, pede confirmação, preserva a data original e recalcula o total.

**Validação:** `npm run check` e `npm test`, incluindo testes da estrutura criada, preservação de data e total, conversão da validade, seleção de quantidades e cálculo dos itens.

### ISS-002 — Conteúdo de usuário renderizado como HTML

Antes da correção, `table.js` montava células com interpolação direta (`<td>${value}</td>`) e `menu.js` aplicava o resultado com `innerHTML`. Nomes e descrições contendo marcação podiam alterar a página ou executar código no navegador.

**Impacto:** risco de XSS, especialmente quando os dados forem persistidos ou compartilhados por um back-end.

**Correção aplicada:** `table.js` escapa caracteres HTML em todas as células textuais, inclusive no status dos produtos, antes de montar as linhas. Listas dinâmicas de clientes e produtos usam `textContent`, e opções dinâmicas de `select` também são escapadas.

**Validação:** testes automatizados verificam que marcação e atributos de evento são exibidos como texto, inclusive na célula especial de status.

### ISS-003 — Exclusão sem autorização real

**Implementado no código:** login Supabase obrigatório, senha de exclusão verificada no Auth e logout com limpeza local. As migrações 005/006 definem leitura e edição compartilhadas: apenas administradores excluem clientes, categorias e produtos; todos os autenticados podem excluir orçamentos e seus itens. A confirmação de senha é adicional na interface, sem exigência equivalente na RPC.

**Validação e encerramento:** conclusão confirmada pelo usuário nesta conversa, após os resultados SQL remotos apresentados. Os testes locais complementam essa evidência; o assistente não realizou uma nova auditoria remota.

### ISS-004 — Ausência de persistência

**Implementado no código:** todas as entidades em tabelas próprias, com códigos identity, FKs e acesso compartilhado autenticado, carregamento após login, gravação atômica das coleções, controle de revisão e restauração local em falha. Usuários novos acessam os registros compartilhados. A aplicação não envia exemplos automaticamente; a carga opcional é executada pelo operador.

**Validação e encerramento:** conclusão confirmada pelo usuário nesta conversa, após os resultados SQL remotos apresentados. Os testes locais complementam essa evidência; o assistente não realizou uma nova auditoria remota.

### ISS-005 — Possibilidade de códigos duplicados

Antes da correção, o próximo código usava `array.length + 1`. Após uma exclusão, esse número podia já pertencer a outro registro.

**Impacto:** códigos deixam de identificar registros de maneira única.

**Correção aplicada:** todos os códigos passaram a ser números inteiros sem prefixo. Clientes passam a receber códigos do PostgreSQL (`GENERATED ALWAYS AS IDENTITY`, migração 003); o navegador envia null e usa o código retornado. A migração 004 aplica identity também às categorias, produtos e orçamentos; itens usam chave composta. Nenhum cadastro usa geração local de códigos. A revisão impede sobrescrita concorrente. ISS-004 concluída conforme confirmação do usuário.

**Validação:** testes SQL cobrem migração, códigos identity e rejeição de códigos manuais; o teste de estado verifica coleções inicialmente vazias.

### ISS-006 — Falta de integridade entre categorias e produtos

**Correção aplicada:** `relations.js` atualiza os produtos ao renomear uma categoria e bloqueia sua exclusão enquanto houver produtos vinculados. A migração 004 armazena a referência por código com FK; a interface recebe o nome por join. Descrições são únicas e as mudanças são transacionais.

### ISS-007 — Validações de domínio incompletas

**Correção aplicada:** inclusão e edição validam CPF numérico e CNPJ numérico ou alfanumérico conforme o tipo e os dígitos verificadores, normalizam documentos e bloqueiam documentos duplicados. O CPF usa máscara progressiva e é salvo como `000.000.000-00`; a comparação de duplicidade ignora pontuação. Descrições são obrigatórias e únicas em cada coleção (categorias ou produtos), ignorando caixa e espaços repetidos. A edição desconsidera o próprio registro. Nomes não aceitam apenas espaços; preços devem ser finitos, positivos e ter até duas casas decimais. Os documentos demonstrativos foram ajustados para cumprir essas regras.

**Limitação:** Não há consulta de situação cadastral. CNPJ numérico e alfanumérico são suportados, com máscara e letras maiúsculas.

**Validação:** `npm run check` e `npm test`: documentos válidos/inválidos, tipo, normalização, duplicidades na inclusão/edição e limites de preço.

### ISS-008 — Navegação móvel indisponível

**Correção aplicada:** `navigation.js` controla o menu expansível até 760 px, com botão habilitado, `aria-controls`, `aria-expanded`, foco inicial, Escape e retorno de foco. Navegar, clicar fora ou mover o foco para fora fecha o painel; mudança de breakpoint restaura o estado.

### ISS-009 — Produto editado sem confirmação

**Correção aplicada:** produtos usam confirmação antes da gravação, assim como clientes e categorias. Cancelar mantém o formulário e os dados anteriores.

### ISS-010 — Clientes fixos no orçamento

Antes da correção, as opções do campo Cliente eram declaradas em `config.js`, sem usar os registros atuais de `data.clientes`.

**Impacto:** clientes incluídos, renomeados ou excluídos não são refletidos no formulário de orçamento.

**Correção aplicada:** “Novo orçamento” gera uma lista pesquisável diretamente de `data.clientes`, portanto inclusões e alterações de clientes aparecem sem manutenção de opções fixas. O código selecionado é mantido durante a transição, e nome e código são persistidos no orçamento concluído.

**Validação:** teste automatizado da busca por nome e verificação de sintaxe do fluxo do modal.

### ISS-011 — Cobertura automatizada limitada

**Correção aplicada:** `@playwright/test`, `playwright.config.js` e `e2e/app.spec.js` adicionam testes de DOM em navegador real. Cobrem CRUD, categorias/clientes vinculados, homônimos, confirmação, senha, menu móvel, filtros, orçamento/itens, recarga, falhas e conflitos.

### ISS-012 — Botões sem nomes acessíveis

**Correção aplicada:** editar e excluir possuem `aria-label` e `title` com ação, entidade e código do registro, escapados para uso seguro em atributos HTML. Fechar formulário, o botão de menu móvel e os três atalhos indisponíveis possuem nomes e títulos; os símbolos usam `aria-hidden="true"`. Atalhos sem ação estão desabilitados e identificados como indisponíveis. O CSS oferece foco visível aos botões habilitados.

**Validação:** revisão dos botões em `index.html`, `table.js`, `form.js` e `menu.js`; `npm run check` e os 24 testes existentes passaram. Os fluxos agora possuem cobertura de navegador na ISS-011; não houve auditoria com leitor de tela.

### ISS-013 — Inclusão possivelmente escondida por filtros

**Correção aplicada:** inclusão pelo botão principal ou submenu limpa pesquisa, tipo, categoria e status e retorna à primeira página. A regra cobre clientes, categorias, produtos e novos orçamentos. Cancelar mantém filtros limpos; editar preserva os filtros. O salvamento continua direcionando à última página.

**Validação:** revisão dos pontos de entrada e salvamento; `npm run check` e `npm test`. A suíte da ISS-011 também cobre os filtros no navegador.

### ISS-014 — Falta de integridade entre clientes e orçamentos

**Correção aplicada:** edição de orçamento usa código do cliente no valor do select e nome/código no texto. Renomear atualiza orçamentos pelo código; excluir cliente vinculado é bloqueado.

### ISS-015 — Categoria selecionada com atualização atrasada

**Correção aplicada:** o combobox emite `change` com propagação imediatamente após selecionar uma opção, inclusive Todas, depois de atualizar valor, seleção e estado visual. O `blur` apenas valida e fecha as opções, sem evento sintético adicional.

**Validação:** revisão da ordem dos eventos; `npm run check` e `npm test`. A suíte da ISS-011 também cobre os filtros no navegador.

## Manutenção

Na revisão de 6 de setembro, as ISS-006, ISS-008, ISS-009, ISS-011 e ISS-014 foram verificadas com `npm run check`, `npm test` e `npm run test:e2e` no Edge (`PLAYWRIGHT_CHANNEL=msedge`). Os testes exercitam o DOM real; as respostas Supabase são simuladas e não comprovam a configuração remota das ISS-003/004.

Ao corrigir um item, atualize seu estado e registre a validação realizada. Se a correção também concluir ou alterar um requisito, sincronize `REQUIREMENTS.md`, `ARCHITECTURE.md` e `README.md` no mesmo conjunto de mudanças.

### ISS-016 — Enter na quantidade salvava em vez de adicionar

**Reprodução:** abrir um orçamento existente, digitar quantidade no catálogo e pressionar Enter. O submit implícito acionava a confirmação de gravação, ainda sem incluir a quantidade digitada.

**Correção:** `budget-flow.js` intercepta Enter nas quantidades e executa Adicionar itens. O teste verifica o rascunho atualizado e a ausência de gravação.

### ISS-017 — Aplicação disponível durante logout

**Reprodução:** atrasar a resposta do endpoint logout e clicar Sair. A interface anterior aguardava a rede antes de ocultar os dados, permitindo outras operações durante a saída.

**Correção:** `session.js` oculta/bloqueia a aplicação e limpa o estado e DOM imediatamente; o login aguarda o término da saída. O teste retém a resposta e retorna erro, verificando limpeza e desbloqueio.

### ISS-018 — Preço exibido diferente do aplicado

**Reprodução:** alterar o preço de um produto e editar um orçamento anterior que o utiliza. O catálogo exibia o preço atual, enquanto adicionar usava o preço histórico.

**Correção:** o catálogo da edição mostra o valor histórico para os itens existentes. Teste de navegador usa produto de 100,00 com item histórico de 42,90 e verifica o valor exibido.

## Compartilhamento aprovado

As migrações 005–008 implementam o workspace compartilhado, permissões atuais, aprovação e o contrato vigente dos orçamentos. Orçamentos e seus itens podem ser excluídos por todos os autenticados; exclusão de clientes/categorias/produtos exige administrador. ISS-003/004 encerradas conforme confirmação do usuário. O isolamento por proprietário pertence ao histórico até 004.

Validação local mais recente: `npm run check`, `npm test` (32 testes) e `npm run test:e2e` no Edge (15 cenários) passaram. O teste SQL de autorização e a carga simples também foram executados no PostgreSQL local. Os testes locais não comprovam o estado remoto das migrações 006–008.

## Atualização de permissões — migração 006

`supabase/migrations/202609060006_budget_permissions.sql` permite a todos os autenticados não anônimos editar/excluir orçamentos e remover itens do orçamento. Exclusão de clientes, categorias e produtos continua exclusiva de administradores. A exclusão de orçamento mantém confirmação e senha na interface; a remoção de itens é gravada ao salvar. Um orçamento mantido exige ao menos um item. O SQL aplica as permissões mesmo em chamadas diretas; revisão global, transação e bloqueios de vínculo continuam ativos. Aplique somente a 006 se a 005 já estiver instalada, depois recarregue a aplicação.

## ISS-019

{
2  "host": "db-dnvfbfjgufgcokjmqsji",
3  "identifier": "dnvfbfjgufgcokjmqsji",
4  "parsed.application_name": "PostgREST 14.5",
5  "parsed.backend_type": "client backend",
6  "parsed.command_tag": "SELECT",
7  "parsed.connection_from": "::1:59091",
8  "parsed.context": "SQL statement \"insert into public.orcamento(user_id,cliente_codigo,validade,valor_total)\r\n        values('00000000-0000-4000-8000-000000000001'::uuid,(r->>2)::bigint,public.atlas_parse_date(r->>4),0) returning codigo\"\nPL/pgSQL function public.atlas_save_workspace_legacy_order(bigint,jsonb) line 77 at SQL statement\nPL/pgSQL function public.atlas_save_workspace(bigint,jsonb) line 23 at RETURN",
9  "parsed.database_name": "postgres",
10  "parsed.error_severity": "ERROR",
11  "parsed.process_id": "665923",
12  "parsed.query": "WITH pgrst_source AS (SELECT pgrst_call.pgrst_scalar FROM (SELECT $1 AS json_data) pgrst_payload, LATERAL (SELECT \"expected_revision\", \"new_payload\" FROM json_to_record(pgrst_payload.json_data) AS _(\"expected_revision\" bigint, \"new_payload\" jsonb) LIMIT 1) pgrst_body , LATERAL (SELECT \"public\".\"atlas_save_workspace\"(\"expected_revision\" := pgrst_body.\"expected_revision\", \"new_payload\" := pgrst_body.\"new_payload\") pgrst_scalar) pgrst_call) SELECT null::bigint AS total_result_set, 1 AS page_total, coalesce(json_agg(_postgrest_t.pgrst_scalar)->0, 'null') AS body, nullif(current_setting('response.headers', true), '') AS response_headers, nullif(current_setting('response.status', true), '') AS response_status, '' AS response_inserted FROM (SELECT \"atlas_save_workspace\".* FROM \"pgrst_source\" AS \"atlas_save_workspace\"   LIMIT $2 OFFSET $3) _postgrest_t",
13  "parsed.query_id": "-2015652190137316153",
14  "parsed.session_id": "6a9e30f9.a2943",
15  "parsed.session_line_num": "4",
16  "parsed.session_start_time": "2026-09-07 03:35:21 UTC",
17  "parsed.sql_state_code": "22P02",
18  "parsed.timestamp": "2026-09-07 03:36:29.226 UTC",
19  "parsed.transaction_id": "1619",
20  "parsed.user_name": "authenticator",
21  "parsed.virtual_transaction_id": "26/1543",
22  "project": "dnvfbfjgufgcokjmqsji",
23  "id": "841d23ac-d969-4136-b02e-0b8ac6ce7d2a",
24  "timestamp": "2026-09-07T03:36:29.226000",
25  "service_name": "postgres_logs",
26  "level": "error",
27  "method": "",
28  "path": "",
29  "status_code": "22P02",
30  "request_path": "",
31  "request_host": null,
32  "request_method": null,
33  "request_url": null,
34  "request_search": null,
35  "response_origin_time": null,
36  "response_content_type": null,
37  "response_cache_status": null,
38  "headers_user_agent": null,
39  "headers_x_client_info": null,
40  "headers_x_forwarded_proto": null,
41  "headers_x_real_ip": null,
42  "headers_referer": null,
43  "cf_ray": null,
44  "cf_country": null,
45  "cf_datacenter": null,
46  "client_ip": null,
47  "client_continent": null,
48  "client_country": null,
49  "client_city": null,
50  "client_region": null,
51  "client_region_code": null,
52  "client_latitude": null,
53  "client_longitude": null,
54  "client_timezone": null,
55  "network_protocol": null,
56  "network_datacenter": null,
57  "execution_id": null,
58  "function_id": null,
59  "deployment_id": null,
60  "execution_time_ms": null,
61  "execution_region": null,
62  "backend_type": "client backend",
63  "command_tag": "SELECT",
64  "connection_from": "::1:59091",
65  "database_name": "postgres",
66  "database_user": "authenticator",
67  "process_id": "665923",
68  "query": "WITH pgrst_source AS (SELECT pgrst_call.pgrst_scalar FROM (SELECT $1 AS json_data) pgrst_payload, LATERAL (SELECT \"expected_revision\", \"new_payload\" FROM json_to_record(pgrst_payload.json_data) AS _(\"expected_revision\" bigint, \"new_payload\" jsonb) LIMIT 1) pgrst_body , LATERAL (SELECT \"public\".\"atlas_save_workspace\"(\"expected_revision\" := pgrst_body.\"expected_revision\", \"new_payload\" := pgrst_body.\"new_payload\") pgrst_scalar) pgrst_call) SELECT null::bigint AS total_result_set, 1 AS page_total, coalesce(json_agg(_postgrest_t.pgrst_scalar)->0, 'null') AS body, nullif(current_setting('response.headers', true), '') AS response_headers, nullif(current_setting('response.status', true), '') AS response_status, '' AS response_inserted FROM (SELECT \"atlas_save_workspace\".* FROM \"pgrst_source\" AS \"atlas_save_workspace\"   LIMIT $2 OFFSET $3) _postgrest_t",
69  "detail": null,
70  "query_id": "-2015652190137316153",
71  "session_id": "6a9e30f9.a2943",
72  "session_start_time": "2026-09-07 03:35:21 UTC",
73  "transaction_id": "1619",
74  "virtual_transaction_id": "26/1543",
75  "error_severity": "ERROR",
76  "sql_state_code": "22P02",
77  "event_message": "invalid input syntax for type bigint: \"Guilherme Estevam Montefusco Cipriano\"",
78  "raw_log_data": {
79    "event_message": "invalid input syntax for type bigint: \"Guilherme Estevam Montefusco Cipriano\"",
80    "id": "841d23ac-d969-4136-b02e-0b8ac6ce7d2a",
81    "log_attributes": {
82      "host": "db-dnvfbfjgufgcokjmqsji",
83      "identifier": "dnvfbfjgufgcokjmqsji",
84      "parsed.application_name": "PostgREST 14.5",
85      "parsed.backend_type": "client backend",
86      "parsed.command_tag": "SELECT",
87      "parsed.connection_from": "::1:59091",
88      "parsed.context": "SQL statement \"insert into public.orcamento(user_id,cliente_codigo,validade,valor_total)\r\n        values('00000000-0000-4000-8000-000000000001'::uuid,(r->>2)::bigint,public.atlas_parse_date(r->>4),0) returning codigo\"\nPL/pgSQL function public.atlas_save_workspace_legacy_order(bigint,jsonb) line 77 at SQL statement\nPL/pgSQL function public.atlas_save_workspace(bigint,jsonb) line 23 at RETURN",
89      "parsed.database_name": "postgres",
90      "parsed.error_severity": "ERROR",
91      "parsed.process_id": "665923",
92      "parsed.query": "WITH pgrst_source AS (SELECT pgrst_call.pgrst_scalar FROM (SELECT $1 AS json_data) pgrst_payload, LATERAL (SELECT \"expected_revision\", \"new_payload\" FROM json_to_record(pgrst_payload.json_data) AS _(\"expected_revision\" bigint, \"new_payload\" jsonb) LIMIT 1) pgrst_body , LATERAL (SELECT \"public\".\"atlas_save_workspace\"(\"expected_revision\" := pgrst_body.\"expected_revision\", \"new_payload\" := pgrst_body.\"new_payload\") pgrst_scalar) pgrst_call) SELECT null::bigint AS total_result_set, 1 AS page_total, coalesce(json_agg(_postgrest_t.pgrst_scalar)->0, 'null') AS body, nullif(current_setting('response.headers', true), '') AS response_headers, nullif(current_setting('response.status', true), '') AS response_status, '' AS response_inserted FROM (SELECT \"atlas_save_workspace\".* FROM \"pgrst_source\" AS \"atlas_save_workspace\"   LIMIT $2 OFFSET $3) _postgrest_t",
93      "parsed.query_id": "-2015652190137316153",
94      "parsed.session_id": "6a9e30f9.a2943",
95      "parsed.session_line_num": "4",
96      "parsed.session_start_time": "2026-09-07 03:35:21 UTC",
97      "parsed.sql_state_code": "22P02",
98      "parsed.timestamp": "2026-09-07 03:36:29.226 UTC",
99      "parsed.transaction_id": "1619",
100      "parsed.user_name": "authenticator",
101      "parsed.virtual_transaction_id": "26/1543",
102      "project": "dnvfbfjgufgcokjmqsji"
103    },
104    "severity_text": "ERROR",
105    "source": "postgres_logs",
106    "timestamp": "2026-09-07T03:36:29.226000"
107  },
108  "service_specific_data": {}
109}

{
  "id": "9bf80b3d-7a96-4668-9817-2fd549ff6548",
  "date": "2026-09-07T03:36:10.900Z",
  "method": "POST",
  "pathname": "/rest/v1/rpc/atlas_save_workspace",
  "status": "400",
  "timestamp": "2026-09-07T03:36:10.900000",
  "level": "warning",
  "event_message": "POST | 400 | https://dnvfbfjgufgcokjmqsji.supabase.co/rest/v1/rpc/atlas_save_workspace | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
  "headers": {},
  "regions": [],
  "log_type": "edge",
  "latency": 0,
  "log_count": null,
  "logs": [],
  "auth_user": "bb95e233-d51e-4d65-bd58-9c0057bccfa5"
}