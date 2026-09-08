# Planejamento de evolução

Este documento registra trabalho futuro. Ele não substitui os requisitos implementados em [REQUIREMENTS.md](REQUIREMENTS.md), nem relata defeitos confirmados, que pertencem a [ISSUES.md](ISSUES.md). A instalação Supabase é validada localmente pelos testes; cada projeto remoto deve seguir seu próprio roteiro em [SUPABASE.md](SUPABASE.md).

## Próximo

### RDM-001 — Recuperação e isolamento local

- **Objetivo:** revisar concorrência durante a restauração, escrita segura dos backups, falhas de criação de backup e futuras atualizações de esquema SQLite. O backup automático configurável de SQLite já está implementado; esta etapa cobre recuperação diante de interrupções e evolução do banco.
- **Justificativa:** o banco local já possui backup diário e restauração transacional, mas cenários de interrupção e evolução de esquema precisam de regras verificáveis.
- **Dependências:** testes controlando processos e arquivos temporários; definição da próxima versão de esquema antes de alterar tabelas.
- **Critério de conclusão:** testes demonstram que uma restauração concorrente, uma escrita interrompida ou uma atualização com falha não substituem o banco recuperável.

### RDM-002 — Segurança do servidor e distribuição

- **Objetivo:** validar `Host` e `Origin`, limitar tamanho e frequência das requisições locais e auditar a lista explícita de arquivos do pacote de fontes.
- **Justificativa:** o servidor atende somente `127.0.0.1`, mas ainda precisa resistir melhor a requisições inesperadas originadas no computador.
- **Dependências:** limites compatíveis com backup e restauração; cenários automatizados de requisições inválidas.
- **Critério de conclusão:** pedidos com cabeçalhos, corpo ou frequência inválidos são recusados sem impedir o uso normal, e o pacote contém somente arquivos permitidos.

### RDM-003 — Cobertura de recuperação e equivalência

- **Objetivo:** ampliar testes de reinício SQLite, retenção de backups, falha de restauração, troca de armazenamento e permissões equivalentes.
- **Justificativa:** as duas opções de armazenamento preservam o mesmo contrato comercial, o que precisa ser comprovado em cenários completos.
- **Dependências:** ambiente Supabase de validação pertencente ao operador e massa de dados sem informações pessoais.
- **Critério de conclusão:** a matriz de cenários produz os mesmos resultados comerciais no SQLite e no Supabase, com evidências locais e roteiro remoto separados.

## Depois

### RDM-004 — Sessão, rascunhos e limites

- **Objetivo:** renovar sessão Supabase, proteger uniformemente rascunhos e alinhar limites numéricos entre navegador e bancos.
- **Justificativa:** a expiração atual exige novo login, e os limites precisam ser verificados em todas as fronteiras de entrada.
- **Dependências:** decisão sobre recuperação de senha e contrato de renovação do Supabase.
- **Critério de conclusão:** a renovação preserva o trabalho em andamento quando possível; erros previsíveis retornam ao login; limites inválidos são rejeitados antes e durante a gravação.

### RDM-005 — Acessibilidade operacional

- **Objetivo:** revisar navegação por teclado, foco e mensagens de erro nos modais e fluxos comerciais.
- **Justificativa:** os controles atuais possuem foco visível e nomes acessíveis, mas a operação completa ainda requer auditoria prática.
- **Dependências:** roteiro de testes com teclado e leitor de tela.
- **Critério de conclusão:** os fluxos principais podem ser concluídos por teclado e mensagens de erro são associadas aos respectivos campos.

### RDM-006 — Pacote Windows completo

- **Objetivo:** gerar a distribuição Windows x64 que reutiliza esta aplicação, Node fixado e dados em `%LOCALAPPDATA%`.
- **Justificativa:** usuários finais não devem precisar instalar ferramentas de desenvolvimento.
- **Dependências:** verificações de recuperação, segurança e equivalência descritas em RDM-001 a RDM-003 e especificação do empacotamento Windows.
- **Critério de conclusão:** um usuário inicia a aplicação extraída sem Node.js, preserva dados em atualização e restaura backups válidos.

O launcher opcional `AtlasLauncher.exe` já cobre a execução assistida quando Node.js está instalado. O pacote portátil com Node.js incluído continua pendente neste item.

## Em avaliação

### RDM-007 — Desempenho orientado por medição

- **Objetivo:** medir leitura e gravação com volumes crescentes antes de escolher índices adicionais, operações incrementais ou paginação no servidor.
- **Justificativa:** a gravação atual mantém consistência ao sincronizar o workspace completo; alterações prematuras podem aumentar complexidade sem ganho útil.
- **Dependências:** massas sintéticas representativas e métricas de tempo e memória para os dois armazenamentos.
- **Critério de conclusão:** relatório reproduzível identifica o gargalo e fundamenta uma decisão técnica compatível com o contrato atual.

### RDM-008 — Modelo comercial ampliado

- **Objetivo:** avaliar múltiplas empresas, estados adicionais de orçamento e histórico comercial mais amplo somente se houver necessidade de negócio.
- **Justificativa:** essas mudanças alteram autorização, dados e operação; não pertencem à refatoração atual.
- **Dependências:** regras comerciais aprovadas, desenho de isolamento e migrações versionadas.
- **Critério de conclusão:** decisão documentada com contrato, permissões, migração e testes de isolamento.

Não estão planejadas nesta etapa sincronização entre SQLite e Supabase, acesso pela rede do escritório, importação entre bancos ou troca de framework.
