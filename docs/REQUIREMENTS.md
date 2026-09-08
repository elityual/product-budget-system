# Catálogo de requisitos

> Última revisão: 8 de setembro de 2026.

Este documento descreve o comportamento que a aplicação deve oferecer e o estado observado no código. Ele é organizado por área para facilitar manutenção e validação. Detalhes de módulos, tabelas, RPCs e contratos técnicos ficam em [ARCHITECTURE.md](ARCHITECTURE.md); instalação do Supabase fica em [SUPABASE.md](SUPABASE.md); defeitos confirmados ficam em [ISSUES.md](ISSUES.md); trabalho futuro fica em [ROADMAP.md](ROADMAP.md).

## Como ler

Cada requisito possui um identificador estável. Identificadores existentes não devem ser renumerados; novos requisitos recebem o próximo número da área correspondente.

| Estado | Significado |
| --- | --- |
| **Implementado** | O comportamento existe no código atual e possui validação local apropriada. |
| **Parcial** | Uma parte existe, mas há uma regra ou cenário ainda não coberto. |
| **Pendente** | O comportamento ainda não está disponível. |

Testes locais demonstram o comportamento do código e do SQL em ambiente isolado. Eles não comprovam a configuração, as políticas ou a disponibilidade de um projeto Supabase remoto.

## Índice

- [Clientes](#clientes)
- [Categorias](#categorias)
- [Produtos](#produtos)
- [Orçamentos](#orçamentos)
- [Itens de orçamento](#itens-de-orçamento)
- [Acesso, sessão e permissões](#acesso-sessão-e-permissões)
- [Armazenamento e recuperação](#armazenamento-e-recuperação)
- [Regras comuns da interface](#regras-comuns-da-interface)
- [Limitações e manutenção](#limitações-e-manutenção)

## Clientes

| ID | Requisito | Regra verificável | Estado |
| --- | --- | --- | --- |
| CLI-001 | Campos do cliente | Cada registro possui código numérico imutável, tipo Pessoa Física ou Pessoa Jurídica, CPF/CNPJ e nome. | Implementado |
| CLI-002 | Cadastro | Inclusão envia código nulo e recebe o código gerado pelo banco; códigos excluídos não são reutilizados. | Implementado |
| CLI-003 | Documento | CPF e CNPJ são validados conforme o tipo e os dígitos verificadores. CPF usa máscara `000.000.000-00`; CNPJ aceita letras nas 12 primeiras posições, mantém DVs numéricos e usa máscara com letras maiúsculas. | Implementado |
| CLI-004 | Nome e unicidade | Nome não pode conter apenas espaços; documento é único entre clientes, ignorando pontuação e caixa. | Implementado |
| CLI-005 | Consulta | A lista permite pesquisar todas as colunas e filtrar pelo tipo de cliente. | Implementado |
| CLI-006 | Edição | A linha pode ser carregada e alterada após confirmação; o código permanece igual. | Implementado |
| CLI-007 | Exclusão | A exclusão pede confirmação; cliente vinculado a orçamento não pode ser removido. | Implementado |

Não há consulta externa de situação cadastral de CPF/CNPJ.

## Categorias

| ID | Requisito | Regra verificável | Estado |
| --- | --- | --- | --- |
| CAT-001 | Campos | Cada categoria possui código numérico imutável e descrição obrigatória. | Implementado |
| CAT-002 | Unicidade | Descrição sem espaços externos é única, ignorando caixa e espaços repetidos; a própria linha é ignorada na edição. | Implementado |
| CAT-003 | Cadastro e edição | Inclusão, consulta e edição funcionam pela listagem; edição pede confirmação e preserva o código. | Implementado |
| CAT-004 | Vínculo com produtos | Renomear categoria atualiza a exibição dos produtos; categoria usada por produto não pode ser excluída. | Implementado |

## Produtos

| ID | Requisito | Regra verificável | Estado |
| --- | --- | --- | --- |
| PRO-001 | Campos | Cada produto possui código, categoria, nome, descrição, valor de venda, data de cadastro e status Ativo ou Inativo. | Implementado |
| PRO-002 | Cadastro | Categoria, nome, descrição, valor e status são obrigatórios; a data de cadastro é gerada automaticamente. | Implementado |
| PRO-003 | Preço e textos | O preço é finito, positivo e tem no máximo duas casas; nome, descrição e categoria não podem ser vazios. | Implementado |
| PRO-004 | Unicidade | A descrição do produto é única na coleção, ignorando caixa, espaços externos e repetidos; a própria linha é ignorada na edição. | Implementado |
| PRO-005 | Consulta | A lista permite pesquisa textual, filtro imediato por categoria e filtro por status, com paginação. | Implementado |
| PRO-006 | Edição | Dados existentes são carregados, a alteração pede confirmação e o código e a data permanecem iguais. | Implementado |
| PRO-007 | Exclusão | A exclusão pede confirmação; produto usado em item de orçamento não pode ser removido. | Implementado |

## Orçamentos

| ID | Requisito | Regra verificável | Estado |
| --- | --- | --- | --- |
| ORC-001 | Campos e contrato | O orçamento usa `[codigo, clienteCodigo, clienteNome, data, validade, total]`; código e data de emissão são imutáveis. | Implementado |
| ORC-002 | Cliente | A criação e a edição selecionam cliente por código e nome; clientes homônimos continuam distinguíveis pelo código. | Implementado |
| ORC-003 | Validade | A validade é obrigatória e deve ser uma data válida. | Implementado |
| ORC-004 | Seleção de produtos | A etapa de itens pesquisa por nome ou descrição, filtra por categoria e mostra preço e descrição do produto. | Implementado |
| ORC-005 | Quantidades | Somente quantidades inteiras positivas entram no rascunho; adicionar o mesmo produto novamente soma a quantidade. | Implementado |
| ORC-006 | Salvamento atômico | Um orçamento só é salvo com pelo menos um item; orçamento e itens são persistidos na mesma operação. | Implementado |
| ORC-007 | Totais | O total de cada item é quantidade × preço unitário e o total do orçamento é a soma dos itens. Valores usam precisão de centavos. | Implementado |
| ORC-008 | Edição | É possível trocar cliente, validade e itens; a data de emissão e os nomes e preços históricos dos itens já existentes são preservados. | Implementado |
| ORC-009 | Exclusão | A exclusão pede confirmação e remove os itens vinculados na mesma gravação. | Implementado |
| ORC-010 | Aprovação | Orçamentos pendentes podem ser aprovados pelo botão do cabeçalho, após seleção e confirmação; a aprovação é persistida e aparece na lista de aprovados. | Implementado |
| ORC-011 | Aprovados | A lista de aprovados exibe somente registros aprovados, permite pesquisa e paginação e oferece apenas a ação de PDF. | Implementado |
| ORC-012 | Edição de aprovados | Editar um orçamento aprovado mantém sua aprovação. Estados Enviado e Cancelado, reversão e bloqueio de edição não fazem parte do comportamento atual. | Implementado |
| ORC-013 | Impressão | A prévia contém empresa, cliente, documento atual, código, emissão, validade, itens históricos, subtotais e total; controles de interface ficam ocultos na impressão. | Implementado |
| ORC-014 | PDF | O botão da prévia abre o diálogo nativo do navegador para imprimir ou salvar como PDF, por evento JavaScript compatível com a política de segurança. | Implementado |

O rascunho é mantido no navegador até a confirmação de salvamento. Cancelar a confirmação não grava alterações.

## Itens de orçamento

| ID | Requisito | Regra verificável | Estado |
| --- | --- | --- | --- |
| IOR-001 | Consulta | O submenu possui uma lista própria com código do orçamento, código e nome do produto, quantidade, valor unitário e total do item. | Implementado |
| IOR-002 | Pesquisa e paginação | A lista permite pesquisa textual e mostra no máximo dez registros por página. | Implementado |
| IOR-003 | Vínculo | Cada item pertence a um orçamento e referencia o produto por código; o nome e o preço salvos representam o histórico do orçamento. | Implementado |
| IOR-004 | Integridade | O banco calcula o total do item e impede vínculos inexistentes por suas regras relacionais. | Implementado |

## Acesso, sessão e permissões

### Identidade e seleção de armazenamento

- **UI-009 — Marca:** o título da aba e a marca fixa do cabeçalho exibem Atlas; o centro do cabeçalho mostra o nome configurado da empresa e a data, inclusive após restauração, enquanto orçamentos e PDFs usam o mesmo nome. **Implementado**.
- **UI-011 — Configurações:** a engrenagem abre uma janela com rascunho de pasta e intervalo de backup no SQLite, último backup ou erro, salvar, cancelar, X e Escape; no Supabase informa que os backups locais não se aplicam. **Implementado**.
- **UI-010 — Armazenamento:** a tela inicial usa o dropdown compartilhado da interface para selecionar SQLite local ou Supabase, preservando os valores, a seleção salva e os campos de acesso de cada modo. **Implementado**.

| ID | Requisito | Regra verificável | Estado |
| --- | --- | --- | --- |
| ACS-001 | Escolha de acesso | A tela inicial permite escolher SQLite local ou Supabase; somente um armazenamento é usado por sessão. | Implementado |
| ACS-002 | Login Supabase | O modo Supabase exige usuário autenticado não anônimo; senhas não são salvas, o token fica em sessionStorage e URL/chave publishable ficam em localStorage. | Implementado |
| ACS-003 | Modo local | O SQLite local funciona sem login e sem internet para um usuário no mesmo computador. | Implementado |
| ACS-004 | Logout | Sair revoga a sessão remota quando aplicável, remove tokens, limpa dados em memória e retorna à tela inicial mesmo se a revogação falhar. | Implementado |
| ACS-005 | Rascunho na saída | Sair com formulário aberto pede confirmação antes de descartar o rascunho. | Implementado |
| ACS-006 | Permissões Supabase | Usuários autenticados podem consultar, incluir e editar; exclusões de clientes, categorias e produtos exigem administrador; orçamentos podem ser excluídos por autenticados. | Implementado |
| ACS-007 | Permissões locais | O usuário local possui as permissões comerciais do banco local; exclusões continuam exigindo confirmação na interface, sem senha. | Implementado |
| ACS-008 | Sessão expirada | Quando o token Supabase expira, o usuário precisa entrar novamente. | Implementado |
| ACS-009 | Renovação e recuperação | Renovação automática de sessão e recuperação de senha devem manter o fluxo sem novo login manual. | Pendente |

## Armazenamento e recuperação

| ID | Requisito | Regra verificável | Estado |
| --- | --- | --- | --- |
| ARM-001 | Banco inicial vazio | SQLite e Supabase começam sem registros comerciais. Dados de exemplo são opcionais e separados. | Implementado |
| ARM-002 | Isolamento | SQLite e Supabase são bancos independentes; a escolha é feita na tela inicial. Sair limpa dados e tokens; a confirmação de descarte aplica-se à saída com formulário aberto. | Implementado |
| ARM-003 | Revisão | Cada gravação usa revisão global; conflito retorna falha e não sobrescreve dados mais recentes. | Implementado |
| ARM-004 | Configuração da empresa | O nome configurado aparece no centro do cabeçalho e na impressão, é atualizado após restauração e é persistido no armazenamento local. | Implementado |
| ARM-005 | Backup diário | A inicialização local cria backup diário e retém sete cópias. | Implementado |
| ARM-006 | Restauração | Backup local é validado, uma cópia de recuperação é criada antes da substituição e a restauração ocorre em transação. Arquivo inválido mantém os dados atuais. | Implementado |
| ARM-007 | Caminho e rede | O servidor local escuta somente `127.0.0.1`; bancos, configurações privadas e backups não são servidos por HTTP. | Implementado |
| ARM-008 | Valores monetários | SQLite armazena centavos inteiros; Supabase usa precisão decimal de duas casas. | Implementado |
| ARM-009 | Validação de fronteira | Limites numéricos e validação completa de documentos também no servidor Supabase. | Pendente |
| ARM-010 | Backup automático local | SQLite local mostra na tela inicial os botões Escolher pasta e Salvar backups e um dropdown de intervalo; Configurações permite alterar esses valores após entrar. A configuração memoriza a pasta, substitui o temporizador ao salvar um novo intervalo e cria uma cópia ao aplicar a configuração. Cópias periódicas e no encerramento limpo dependem de mudança na revisão desde a última cópia automática; mantém 30 cópias automáticas. | Implementado |
| ARM-011 | Backup manual local | O botão Backup cria uma cópia manual mesmo sem alterações e abre a pasta configurada no Explorador do Windows; cópias manuais não entram na retenção automática. | Implementado |

O roteiro para validar uma instalação Supabase real está em [SUPABASE.md](SUPABASE.md). O teste PGlite da instalação inicial é local e não substitui esse roteiro.

## Regras comuns da interface

| ID | Requisito | Regra verificável | Estado |
| --- | --- | --- | --- |
| UI-001 | Pesquisa e filtros | Listagens usam pesquisa textual e filtros contextuais; mudar um filtro retorna à primeira página quando necessário. | Implementado |
| UI-002 | Paginação | Listagens exibem no máximo dez registros e preservam o índice do registro ao filtrar. | Implementado |
| UI-003 | Inclusão e edição | Iniciar inclusão limpa filtros; editar preserva filtros; cancelar retorna à listagem adequada. | Implementado |
| UI-004 | Confirmações | Alterações, exclusões, aprovação, saída com rascunho e restauração pedem confirmação nos fluxos definidos. | Implementado |
| UI-005 | Acessibilidade | Botões de ícone possuem nomes acessíveis, símbolos são ocultados de leitores e o foco de teclado é visível. | Implementado |
| UI-006 | Responsividade | Menu móvel funciona até 760 px, com foco, Escape, fechamento ao navegar e tabelas com rolagem horizontal. | Implementado |
| UI-007 | Segurança de saída | Conteúdo textual é escapado em tabelas e inserido com `textContent` ou `Option` nas listas dinâmicas. | Implementado |
| UI-008 | Fluxo sem perda | Falha de gravação restaura o snapshot anterior e mantém o formulário para correção. | Implementado |

## Limitações e manutenção

### Distribuição Windows opcional

- **WIN-004 — Propriedade do servidor:** o launcher confirma a prontidão do próprio filho por identificador, recusa porta ocupada e aguarda a saída ao fechar. A perda do pipe de controle solicita encerramento do servidor. **Implementado**.

- **WIN-001 — Launcher:** `npm run build:launcher` gera `AtlasLauncher.exe`; o EXE inicia o servidor existente, aguarda sua disponibilidade e abre o navegador, mantendo `npm start` como alternativa. **Implementado**.
- **WIN-002 — Encerramento:** a janela do launcher oferece abertura do navegador e parada do processo iniciado por ela; a parada usa o comando interno de stdin e preserva dados e backups. **Implementado**.
- **WIN-003 — Pré-requisitos:** o launcher exige Node.js 24 ou superior instalado e os arquivos `server.js` e `package.json` ao seu lado; não inclui runtime próprio. **Implementado**.

- Não há sincronização ou importação entre SQLite e Supabase, acesso pela rede do escritório, múltiplas empresas ou estados comerciais além da aprovação.
- A confirmação de senha para exclusão é uma regra adicional da interface Supabase; a autorização definitiva é aplicada pelas RPCs e políticas do banco.
- A validação de CPF/CNPJ não consulta órgãos externos. A renovação de sessão, recuperação de senha e validação completa de limites no servidor estão pendentes.
- O pacote Windows pronto para usuário final pertence à etapa separada registrada no [ROADMAP.md](ROADMAP.md).
- A seleção nativa da pasta de backup e a abertura no Explorador estão disponíveis somente no Windows; a interface não oferece campo manual de caminho em outros sistemas.
- Atualizações futuras devem alterar a linha do requisito afetado, conservar seu ID, atualizar a observação e sincronizar README e arquitetura quando instalação, fluxo ou tecnologia mudarem.
