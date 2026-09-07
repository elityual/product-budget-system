# Avaliação do projeto e sugestões de evolução

Atualizado em 7 de setembro de 2026.

Este documento registra uma avaliação do código e da documentação disponíveis. A tabela distingue itens concluídos, parciais e ainda sugeridos. O estado funcional permanece em [REQUIREMENTS.md](REQUIREMENTS.md), e defeitos confirmados são acompanhados em [ISSUES.md](ISSUES.md). A primeira instalação usa a migração única `supabase/migrations/202609080001_initial.sql`; os arquivos de migração numerados anteriores não fazem parte do procedimento público.

## Minha avaliação

O projeto tem uma boa base para um sistema comercial pequeno: o fluxo de clientes, produtos e orçamentos está conectado, os dados possuem relações protegidas no SQL e os testes já exercitam situações além do caminho feliz. A separação recente dos módulos tornou a manutenção mais clara.

Eu o considero um protótipo funcional avançado, com condições de seguir para uma implantação piloto. Ainda não o trataria como pronto para uso operacional contínuo: a sessão expira sem renovação e a validação de documentos ainda fica no navegador. O modo local já oferece restauração transacional e cópia de recuperação. ISS-003/004 foram posteriormente concluídas conforme confirmação do usuário; essa confirmação não equivale a uma auditoria independente de produção.

Minha prioridade seria consolidar a operação e melhorar o trabalho diário com orçamentos antes de ampliar a quantidade de telas.

## O que está funcionando bem

- **Integridade dos dados:** códigos gerados pelo SQL, chaves estrangeiras no workspace compartilhado, totais calculados no servidor e gravação transacional.
- **Proteção contra sobrescrita:** revisão do workspace detecta conflitos entre sessões, e a interface restaura o estado anterior quando a gravação falha.
- **Orçamentos utilizáveis:** seleção em duas colunas, revisão dos itens, confirmação na edição e preservação de preços históricos.
- **Organização simples:** módulos ES sem etapa de build; controladores de listagem, formulário, orçamento e sessão possuem responsabilidades distintas.
- **Testes úteis:** `npm test` cobre 26 testes unitários, SQLite e instalação Supabase limpa. Os testes de navegador simulam o Supabase e não substituem a validação remota; exigem um navegador Playwright instalado.

## Mudanças sugeridas, em ordem de prioridade

Esforço relativo: pequeno corresponde a uma alteração localizada; médio envolve vários componentes; grande exige evolução do contrato de dados ou de autorização. Não são estimativas de prazo.

| Prioridade | Sugestão | Motivo | Esforço | Critério de conclusão |
| --- | --- | --- | --- | --- |
| Concluído | Validar a implantação real | ISS-003/004 encerradas conforme confirmação do usuário. | Médio | Evidências SQL apresentadas na conversa e confirmação do usuário; sem nova auditoria remota pelo assistente. |
| Concluído | Definir backup e testar restauração | Persistir dados não garante recuperá-los após um erro operacional. | Médio | O SQLite cria backup diário, retém sete cópias, grava uma cópia de recuperação antes da restauração e valida o esquema; o teste local cobre restauração e rejeição sem perda. |
| 1 | Renovar sessão e oferecer recuperação de senha | A expiração hoje interrompe o uso e exige novo login. | Médio | Sessão renovada sem perder rascunho; falha retorna ao login de forma previsível; recuperação funciona de ponta a ponta. |
| 1 | Validar limites numéricos e documentos também no servidor | Os DVs ficam no navegador; quantidades e valores precisam respeitar a precisão do JavaScript e os limites SQL. | Médio | Chamadas diretas inválidas são rejeitadas; interface informa limites antes do envio; testes cobrem extremos e adições acumuladas. |
| Concluído | Editar quantidades diretamente na lista selecionada | A lista da direita permite alterar quantidades positivas. | Pequeno | Total atualizado, gravação conjunta e preço histórico preservado. |
| Parcial | Avisar sobre alterações não salvas | Fechar um formulário de inclusão ou edição pode descartar trabalho sem indicação em alguns caminhos de navegação. | Médio | Sair com um formulário aberto já pede confirmação; fechar ou navegar por todos os caminhos ainda precisa de proteção uniforme. |
| Concluído | Criar impressão/PDF do orçamento | Prévia de impressão implementada para orçamentos salvos. | Médio | Empresa, cliente, validade, itens e total; controles ocultos na impressão; PDF pelo diálogo do navegador. |
| Parcial | Adicionar situação do orçamento | Aprovação implementada com menu de aprovados e botão no cabeçalho; demais estados fora do escopo aprovado. | Médio | Aprovação persistida pela instalação inicial; edição permanece permitida e mantém aprovação. Estados Enviado/Cancelado não implementados. |
| 2 | Melhorar acessibilidade e mensagens | Há controles personalizados, modais e mensagens nativas que merecem revisão de teclado e foco. | Médio | Fluxos completos por teclado, foco inicial/retorno nos modais e erros associados aos campos. |
| Concluído | Automatizar os testes em CI | Os testes precisam rodar em cada alteração para proteger o repositório público. | Pequeno | `.github/workflows/ci.yml` executa sintaxe, testes SQL/unitários e navegador; a publicação não é automática. |
| 3 | Substituir arrays posicionais por objetos nomeados | Expressões como `row[4]` tornam alterações de campos mais arriscadas. | Grande | Modelo de domínio nomeado, com adaptação explícita na fronteira da RPC e testes de compatibilidade. |
| 3 | Salvar alterações por operação e paginar no servidor | Hoje cada gravação sincroniza todas as coleções e recria os itens do workspace; o custo cresce com o volume. | Grande | Medir volumes e latência primeiro; evoluir RPCs mantendo transação de orçamento/itens e detecção de conflitos. |
| 3 | Avaliar múltiplas empresas, se necessário | O modelo agora compartilha todos os dados entre usuários autenticados, com exclusão por admin. | Grande | Só introduzir separação por empresa se o negócio exigir; testar o isolamento entre empresas. |

## Cuidados técnicos na próxima etapa

**Preservar contratos durante mudanças.** O modelo de arrays aparece no navegador, nas RPCs e nos testes. A ordem do orçamento é código, código do cliente, nome, data, validade e total. Mudanças futuras devem entrar em uma nova migração após a instalação inicial, sem reintroduzir formatos legados.

**Separar confirmação de autorização.** A senha adicional de exclusão é uma regra da interface. Se o negócio exigir reautenticação obrigatória inclusive para chamadas diretas, a regra precisa ser projetada e verificada no servidor. O mecanismo atual usa a identidade autenticada, o workspace compartilhado e `atlas_admins` para restringir a exclusão de clientes, categorias e produtos.

**Preservar o contexto histórico.** Nome e preço do produto já são históricos nos itens. Para documentos comerciais emitidos, vale decidir se os dados da empresa e do cliente também precisam de uma cópia histórica, pois renomear um cliente atualmente altera sua identificação nos orçamentos.

**Reduzir repetição na documentação.** README, arquitetura e requisitos ainda repetem alguns detalhes sobre migrações. O idioma foi normalizado; a próxima revisão estrutural pode manter o README resumido, a arquitetura voltada a decisões técnicas e os requisitos limitados a regras verificáveis. Este documento deve concentrar avaliações e propostas.

## O que eu manteria por enquanto

Manteria JavaScript com módulos ES, a separação atual dos controladores, um único CSS e a migração inicial única para instalações novas. Alterações de esquema futuras podem receber novas migrações numeradas, sem reintroduzir contratos legados. Não há evidência nesta revisão que justifique uma troca de framework ou mais camadas de serviços. Também deixaria painel e relatórios para depois de validar quais decisões os usuários precisam tomar com esses dados.

## Sequência prática recomendada

1. Validar um projeto Supabase real e limites de entrada do servidor.
2. Melhorar sessão e recuperação de senha.
3. Proteger rascunhos contra todos os caminhos de fechamento ou navegação.
4. Definir os estados restantes do orçamento e as necessidades de histórico comercial.
5. Medir uso e volume antes de alterar a persistência ou introduzir compartilhamento por empresa.

Desde a avaliação inicial, edição direta de quantidades, impressão/PDF e aprovação de orçamento foram implementadas. As linhas da tabela acima distinguem itens concluídos, parciais e ainda sugeridos.

O escopo atual usa um workspace compartilhado no Supabase e um banco local de usuário único. A instalação inicial aplica as permissões de catálogo e orçamento diretamente; o SQLite concede acesso completo ao usuário local.

## Permissões

Essas permissões fazem parte da instalação inicial. Usuários autenticados editam e removem orçamentos; clientes, categorias e produtos exigem administrador. Revisão global, transação e bloqueios de vínculo continuam ativos.

## Aprovação de orçamentos

Implementado no código: submenu Orçamentos aprovados lista apenas aprovados, com pesquisa e paginação. O botão Aprovar orçamento fica no cabeçalho, ao lado de Novo orçamento; abre a seleção de um orçamento pendente e pede confirmação. Não há botão de aprovação nas linhas. Todos os autenticados não anônimos podem aprovar. Não há estados Enviado/Cancelado, reversão de aprovação nem bloqueio de edição: editar um aprovado mantém sua aprovação, conforme o escopo limitado desta entrega.

A aprovação faz parte da instalação inicial. A coluna começa falsa, a RPC usa a revisão global e a resposta inclui `approved_codes`; repetição, orçamento inexistente e acesso anônimo são rejeitados.

No submenu Orçamentos aprovados, a única ação por linha é Baixar PDF, que abre a prévia e permite Salvar como PDF pelo diálogo nativo do navegador. Não há ações de edição, exclusão ou aprovação nessa listagem; a listagem normal mantém as ações existentes. Pesquisa e paginação preservam o vínculo com o orçamento original. Esta alteração de interface não exige nova migração SQL.

A aprovação é iniciada exclusivamente pelo botão do cabeçalho Aprovar orçamento, que abre um diálogo com código, cliente e validade dos pendentes. Sem pendentes, o botão fica desabilitado. O submenu Orçamentos aprovados mantém apenas a ação PDF por linha. Não é necessária nova migração para essa mudança de interface.

## Atualizações de contrato e carga

A migração `202609080001_initial.sql` cria o banco Supabase vazio e usa diretamente `[codigo, clienteCodigo, clienteNome, data, validade, total]`. `supabase/seeds/example_data.sql` oferece uma carga opcional protegida para demonstração. O servidor local cria o SQLite automaticamente.
