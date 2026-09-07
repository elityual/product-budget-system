# Avaliação do projeto e sugestões de evolução

Atualizado em 7 de setembro de 2026.

Este documento registra uma avaliação do código e da documentação disponíveis. A tabela distingue itens concluídos, parciais e ainda sugeridos. O estado funcional permanece em [REQUIREMENTS.md](REQUIREMENTS.md), e defeitos confirmados são acompanhados em [ISSUES.md](ISSUES.md).

## Minha avaliação

O projeto tem uma boa base para um sistema comercial pequeno: o fluxo de clientes, produtos e orçamentos está conectado, os dados possuem relações protegidas no SQL e os testes já exercitam situações além do caminho feliz. A separação recente dos módulos tornou a manutenção mais clara.

Eu o considero um protótipo funcional avançado, com condições de seguir para uma implantação piloto. Ainda não o trataria como pronto para uso operacional contínuo: a sessão expira sem renovação e não há evidência de um procedimento de restauração dos dados. ISS-003/004 foram posteriormente concluídas conforme confirmação do usuário; essa confirmação não equivale a uma auditoria independente de produção.

Minha prioridade seria consolidar a operação e melhorar o trabalho diário com orçamentos antes de ampliar a quantidade de telas.

## O que está funcionando bem

- **Integridade dos dados:** códigos gerados pelo SQL, chaves estrangeiras no workspace compartilhado, totais calculados no servidor e gravação transacional.
- **Proteção contra sobrescrita:** revisão do workspace detecta conflitos entre sessões, e a interface restaura o estado anterior quando a gravação falha.
- **Orçamentos utilizáveis:** seleção em duas colunas, revisão dos itens, confirmação na edição e preservação de preços históricos.
- **Organização simples:** módulos ES sem etapa de build; controladores de listagem, formulário, orçamento e sessão possuem responsabilidades distintas.
- **Testes úteis:** a última execução completa registrada teve 32 testes unitários/SQL e 15 testes de navegador aprovados. Os testes de navegador simulam o Supabase e não substituem a validação remota.

## Mudanças sugeridas, em ordem de prioridade

Esforço relativo: pequeno corresponde a uma alteração localizada; médio envolve vários componentes; grande exige evolução do contrato de dados ou de autorização. Não são estimativas de prazo.

| Prioridade | Sugestão | Motivo | Esforço | Critério de conclusão |
| --- | --- | --- | --- | --- |
| Concluído | Validar a implantação real | ISS-003/004 encerradas conforme confirmação do usuário. | Médio | Evidências SQL apresentadas na conversa e confirmação do usuário; sem nova auditoria remota pelo assistente. |
| 1 | Definir backup e testar restauração | Persistir dados não garante recuperá-los após um erro operacional. | Médio | Documentar o mecanismo disponível no ambiente e restaurar uma cópia em um banco separado. |
| 1 | Renovar sessão e oferecer recuperação de senha | A expiração hoje interrompe o uso e exige novo login. | Médio | Sessão renovada sem perder rascunho; falha retorna ao login de forma previsível; recuperação funciona de ponta a ponta. |
| 1 | Validar limites numéricos e documentos também no servidor | Os DVs ficam no navegador; quantidades e valores precisam respeitar a precisão do JavaScript e os limites SQL. | Médio | Chamadas diretas inválidas são rejeitadas; interface informa limites antes do envio; testes cobrem extremos e adições acumuladas. |
| Concluído | Editar quantidades diretamente na lista selecionada | A lista da direita permite alterar quantidades positivas. | Pequeno | Total atualizado, gravação conjunta e preço histórico preservado. |
| 2 | Avisar sobre alterações não salvas | Fechar um formulário pode descartar trabalho sem indicação. | Médio | Fechar ou navegar com alterações pede confirmação; cancelar mantém o rascunho. |
| Concluído | Criar impressão/PDF do orçamento | Prévia de impressão implementada para orçamentos salvos. | Médio | Empresa, cliente, validade, itens e total; controles ocultos na impressão; PDF pelo diálogo do navegador. |
| Parcial | Adicionar situação do orçamento | Aprovação implementada com menu de aprovados e botão no cabeçalho; demais estados fora do escopo aprovado. | Médio | Aprovação persistida pela migração 007; edição permanece permitida e mantém aprovação. Estados Enviado/Cancelado não implementados. |
| 2 | Melhorar acessibilidade e mensagens | Há controles personalizados, modais e mensagens nativas que merecem revisão de teclado e foco. | Médio | Fluxos completos por teclado, foco inicial/retorno nos modais e erros associados aos campos. |
| 2 | Automatizar os testes em CI | Os testes atuais só protegem mudanças quando alguém os executa. | Pequeno | Cada proposta de alteração executa sintaxe, testes SQL/unitários e navegador, publicando falhas. |
| 3 | Substituir arrays posicionais por objetos nomeados | Expressões como `row[4]` tornam alterações de campos mais arriscadas. | Grande | Modelo de domínio nomeado, com adaptação explícita na fronteira da RPC e testes de compatibilidade. |
| 3 | Salvar alterações por operação e paginar no servidor | Hoje cada gravação sincroniza todas as coleções e recria os itens do workspace; o custo cresce com o volume. | Grande | Medir volumes e latência primeiro; evoluir RPCs mantendo transação de orçamento/itens e detecção de conflitos. |
| 3 | Avaliar múltiplas empresas, se necessário | O modelo agora compartilha todos os dados entre usuários autenticados, com exclusão por admin. | Grande | Só introduzir separação por empresa se o negócio exigir; testar o isolamento entre empresas. |

## Cuidados técnicos na próxima etapa

**Preservar contratos durante mudanças.** O modelo de arrays aparece no navegador, nas RPCs e nos testes. A troca por objetos deve ser gradual, com um adaptador, evitando mudar todas essas fronteiras ao mesmo tempo. Migrações já aplicadas devem permanecer no histórico; mudanças de banco entram em novas migrações.

**Separar confirmação de autorização.** A senha adicional de exclusão é uma regra da interface. Se o negócio exigir reautenticação obrigatória inclusive para chamadas diretas, a regra precisa ser projetada e verificada no servidor. O mecanismo atual usa a identidade autenticada, o workspace compartilhado e `atlas_admins` para restringir a exclusão de clientes, categorias e produtos.

**Preservar o contexto histórico.** Nome e preço do produto já são históricos nos itens. Para documentos comerciais emitidos, vale decidir se os dados da empresa e do cliente também precisam de uma cópia histórica, pois renomear um cliente atualmente altera sua identificação nos orçamentos.

**Reduzir repetição na documentação.** README, arquitetura e requisitos ainda repetem alguns detalhes sobre migrações. O idioma foi normalizado; a próxima revisão estrutural pode manter o README resumido, a arquitetura voltada a decisões técnicas e os requisitos limitados a regras verificáveis. Este documento deve concentrar avaliações e propostas.

## O que eu manteria por enquanto

Manteria JavaScript com módulos ES, a separação atual dos controladores, um único CSS e as migrações numeradas. Não há evidência nesta revisão que justifique uma troca de framework ou mais camadas de serviços. Também deixaria painel e relatórios para depois de validar quais decisões os usuários precisam tomar com esses dados.

## Sequência prática recomendada

1. Validar Supabase, recuperação de dados e limites de entrada.
2. Melhorar sessão e colocar os testes na rotina automática de alterações.
3. Proteger rascunhos contra fechamento ou navegação acidental.
4. Definir os estados restantes do orçamento e as necessidades de histórico comercial.
5. Medir uso e volume antes de alterar a persistência ou introduzir compartilhamento por empresa.

Desde a avaliação inicial, edição direta de quantidades, impressão/PDF e aprovação de orçamento foram implementadas. As linhas da tabela acima distinguem itens concluídos, parciais e ainda sugeridos.

Atualização de escopo: o usuário aprovou o compartilhamento global. A migração 005 implementa o workspace comum; a 006 permite que todos excluam orçamentos e seus itens, enquanto clientes, categorias e produtos continuam exclusivos de administradores. A conclusão das ISS-003/004 foi confirmada pelo usuário.

## Atualização de permissões — migração 006

`supabase/migrations/202609060006_budget_permissions.sql` permite a todos os autenticados não anônimos editar/excluir orçamentos e remover itens do orçamento. Exclusão de clientes, categorias e produtos continua exclusiva de administradores. A exclusão de orçamento mantém confirmação e senha na interface; a remoção de itens é gravada ao salvar. Um orçamento mantido exige ao menos um item. O SQL aplica as permissões mesmo em chamadas diretas; revisão global, transação e bloqueios de vínculo continuam ativos. Aplique somente a 006 se a 005 já estiver instalada, depois recarregue a aplicação.

## Aprovação de orçamentos

Implementado no código: submenu Orçamentos aprovados lista apenas aprovados, com pesquisa e paginação. O botão Aprovar orçamento fica no cabeçalho, ao lado de Novo orçamento; abre a seleção de um orçamento pendente e pede confirmação. Não há botão de aprovação nas linhas. Todos os autenticados não anônimos podem aprovar. Não há estados Enviado/Cancelado, reversão de aprovação nem bloqueio de edição: editar um aprovado mantém sua aprovação, conforme o escopo limitado desta entrega.

Aplique somente `supabase/migrations/202609060007_budget_approval.sql` após 006 e recarregue as abas. A coluna `orcamento.aprovado` começa falsa para registros existentes/novos. `atlas_approve_budget(expected_revision,budget_code)` usa a revisão global e grava atomicamente; repetição, orçamento inexistente e acesso anônimo são rejeitados. `atlas_load_workspace()` retorna `approved_codes` além do contrato anterior, mantendo os arrays de orçamento com seis campos. `backend.js` mantém `approvedBudgets` separado do payload; a interface só atualiza a aprovação após confirmação do servidor. Não há dependência nova.

No submenu Orçamentos aprovados, a única ação por linha é Baixar PDF, que abre a prévia e permite Salvar como PDF pelo diálogo nativo do navegador. Não há ações de edição, exclusão ou aprovação nessa listagem; a listagem normal mantém as ações existentes. Pesquisa e paginação preservam o vínculo com o orçamento original. Esta alteração de interface não exige nova migração SQL.

A aprovação é iniciada exclusivamente pelo botão do cabeçalho Aprovar orçamento, que abre um diálogo com código, cliente e validade dos pendentes. Sem pendentes, o botão fica desabilitado. O submenu Orçamentos aprovados mantém apenas a ação PDF por linha. Não é necessária nova migração para essa mudança de interface.

## Atualizações de contrato e carga

A migração 008 padroniza os orçamentos como `[codigo, clienteCodigo, clienteNome, data, validade, total]` na interface e nas RPCs. `supabase/seeds/reset_simple_data.sql` oferece uma limpeza e carga opcional, preservando usuários e administradores. Ambas foram verificadas no PostgreSQL local.
