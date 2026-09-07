# Configuração e validação do Supabase

O código atual usa um único workspace compartilhado. Todos os usuários autenticados, exceto sessões anônimas do Auth, podem consultar, incluir e editar. Todos os autenticados podem editar/excluir orçamentos e remover seus itens; somente administradores podem excluir clientes, categorias e produtos. O usuário apresentou evidências da estrutura 005 e do teste SQL remoto. O usuário confirmou a conclusão das ISS-003/004. As etapas abaixo permanecem como referência para instalação e verificação.

## Instalação e atualização

1. Aplique somente as migrações pendentes de `supabase/migrations/`, em ordem, de 001 até `202609070009_budget_order_compatibility.sql`. Não repita migrações aplicadas. Não exclua tabelas para forçar execução.
2. A 005 reúne as contas antigas em um workspace, preservando códigos, datas, preços e referências. Se houver códigos duplicados entre contas, documentos repetidos ou descrições equivalentes, ela falha e reverte tudo. Nesse caso, revise os conflitos e suas referências antes de tentar novamente; não há deduplicação automática.
3. Crie contas confirmadas em Authentication > Users. A aplicação oferece login, mas não cadastro ou recuperação de senha.
4. Defina o administrador no SQL Editor, conforme a seção abaixo. Nenhuma conta recebe administração automaticamente.
5. Recarregue todas as abas após a migração. A revisão global foi avançada para invalidar snapshots anteriores. Sirva `index.html` por HTTP.

A URL e a chave publishable ficam em `assets/js/backend.js`. São configurações públicas; não use uma chave service_role no navegador. Não há SDK, build ou variável de ambiente de runtime nova.

## Definir o administrador

Execute no SQL Editor com acesso administrativo ao projeto. Substitua o e-mail pelo de uma conta existente:

```sql
insert into public.atlas_admins (user_id)
select id from auth.users where lower(email) = lower('SEU_EMAIL_AQUI')
on conflict do nothing;

select u.id, u.email
from public.atlas_admins a join auth.users u on u.id = a.user_id;
```

Confira se o e-mail aparece no resultado. Se não aparecer, confira se a conta existe e se o e-mail está correto. Recarregue a aplicação para atualizar os botões. A tabela `atlas_admins` não permite leitura ou escrita direta pelo navegador; usuários não podem promover a própria conta por metadados ou pela API pública.

Para revogar o papel, execute com acesso administrativo:

```sql
delete from public.atlas_admins
where user_id in (select id from auth.users where lower(email) = lower('EMAIL_A_REMOVER'));
```

A RPC consulta a tabela a cada gravação, portanto a revogação bloqueia novas exclusões imediatamente, mesmo se uma aba antiga ainda mostrar o botão.

## Permissões e integridade

| Operação | Usuário autenticado | Administrador |
| --- | --- | --- |
| Consultar todos os dados | Sim | Sim |
| Incluir e editar registros | Sim | Sim |
| Alterar quantidade positiva de item salvo | Sim | Sim |
| Remover item apenas do rascunho novo | Sim | Sim |
| Remover item já salvo | Sim | Sim |
| Excluir cliente, categoria ou produto | Não | Sim |
| Excluir orçamento | Sim | Sim |
| Promover usuários pelo navegador | Não | Não |

Os bloqueios de vínculo continuam valendo para administradores: cliente com orçamento, categoria com produto e produto usado em orçamento não podem ser excluídos mantendo dependentes. A exclusão de um orçamento remove seus itens. Confirmação e senha adicional de exclusão de registros continuam na interface; o SQL exige papel de administrador, sem exigir a senha novamente em chamadas diretas.

As tabelas são `cliente`, `categoria`, `produto`, `orcamento` e `item_orcamento`. `atlas_workspaces` mantém uma única revisão global, com arrays JSON vazios. A coluna legada `user_id` dessas seis tabelas identifica agora o workspace fixo `00000000-0000-4000-8000-000000000001`, não o criador. Ela é restrita por CHECK e não referencia mais auth.users: apagar uma conta não apaga dados compartilhados. Não existe registro de autoria individual nesta mudança.

`atlas_load_workspace()` retorna payload, revision, is_admin e approved_codes. RLS permite leitura compartilhada somente às sessões autenticadas não anônimas. Escritas diretas são revogadas. `atlas_save_workspace(expected_revision,new_payload)` bloqueia a revisão global, verifica se clientes/categorias/produtos existentes foram omitidos por um não administrador e só então sincroniza as coleções. Conflito retorna null. Helpers internos continuam sem execução pelo navegador. A revisão protege contra conflitos também entre usuários diferentes.

Códigos identity continuam sendo gerados pelo SQL e podem ter lacunas. Datas originais são preservadas; totais são calculados no servidor. CPF/CNPJ têm validação de DVs no navegador. O histórico de preço/nome de itens permanece no orçamento.

## Validação remota

Execute todo o arquivo `supabase/tests/authorization.sql` após 008. Ele usa contas temporárias em transação revertida, testa leitura compartilhada, inclusão pelo editor, proibição de exclusão de categoria/autopromoção, exclusão pelo admin, conflito e bloqueio de anônimos. Se os UUIDs de teste já existirem, o script falhará sem substituí-los. Sequências podem adquirir lacunas. `authorization_legacy.sql` é exclusivo para testar o histórico 001–004, não para o banco atualizado.

No navegador, use uma conta comum e uma administradora em sessões separadas:

1. Cadastre na primeira e recarregue a segunda: ambas devem ver os mesmos registros.
2. Edite na segunda e recarregue a primeira: a alteração deve aparecer.
3. Confirme que a conta comum não vê exclusão de clientes/categorias/produtos, mas pode editar/excluir orçamentos e remover seus itens.
4. Teste exclusão pelo admin com senha incorreta/correta e com registros vinculados.
5. Carregue ambas, salve em uma e tente salvar o snapshot antigo na outra: deve haver conflito, sem sobrescrever.
6. Registre resultados em ISSUES.md. Não registre senhas nem tokens.

## Testes locais e sessão

`npm test` testa o histórico 001–004 em `tests/database.test.js` e a sequência compartilhada 005–009 em `tests/shared.test.js`, incluindo dados de duas contas, conflitos legados, autorização, exclusão, aprovação, ordem dos campos e preservação após apagar uma conta Auth. PGlite executa PostgreSQL local; apenas o contexto Auth é simulado. Os testes de navegador em `e2e/app.spec.js` simulam as respostas Supabase. Nenhum desses testes comprova implantação remota.

A sessão usa sessionStorage e não renova tokens automaticamente. Sair limpa os dados visíveis imediatamente e remove o token mesmo se o logout remoto falhar. Erros de gravação restauram o snapshot anterior. Após conflito ou resultado de rede incerto, recarregue para obter os dados confirmados.

## Erro atlas_shared_revision inexistente

A versão atual da migração 005 mantém a revisão em uma variável dentro de um bloco DO, sem tabela temporária. Se uma versão anterior falhou com `42P01` para `atlas_shared_revision`, copie novamente o arquivo atualizado e execute o script inteiro, de BEGIN até COMMIT, sem selecionar apenas um trecho. O erro isolado não permite confirmar como o editor executou a transação. Se houve execução parcial fora da transação ou aparecer erro de objeto já existente, confira o estado antes de repetir; não exclua tabelas para contornar o erro.

## Atualização de permissões — migração 006

`supabase/migrations/202609060006_budget_permissions.sql` permite a todos os autenticados não anônimos editar/excluir orçamentos e remover itens do orçamento. Exclusão de clientes, categorias e produtos continua exclusiva de administradores. A exclusão de orçamento mantém confirmação e senha na interface; a remoção de itens é gravada ao salvar. Um orçamento mantido exige ao menos um item. O SQL aplica as permissões mesmo em chamadas diretas; revisão global, transação e bloqueios de vínculo continuam ativos. Aplique somente a 006 se a 005 já estiver instalada, depois recarregue a aplicação.

## Aprovação de orçamentos

Implementado no código: submenu Orçamentos aprovados lista apenas aprovados, com pesquisa e paginação. O botão Aprovar orçamento fica no cabeçalho, ao lado de Novo orçamento; abre a seleção de um orçamento pendente e pede confirmação. Não há botão de aprovação nas linhas. Todos os autenticados não anônimos podem aprovar. Não há estados Enviado/Cancelado, reversão de aprovação nem bloqueio de edição: editar um aprovado mantém sua aprovação, conforme o escopo limitado desta entrega.

Aplique somente `supabase/migrations/202609060007_budget_approval.sql` após 006 e recarregue as abas. A coluna `orcamento.aprovado` começa falsa para registros existentes/novos. `atlas_approve_budget(expected_revision,budget_code)` usa a revisão global e grava atomicamente; repetição, orçamento inexistente e acesso anônimo são rejeitados. `atlas_load_workspace()` retorna `approved_codes` além do contrato anterior, mantendo os arrays de orçamento com seis campos. `backend.js` mantém `approvedBudgets` separado do payload; a interface só atualiza a aprovação após confirmação do servidor. Não há dependência nova.

No submenu Orçamentos aprovados, a única ação por linha é Baixar PDF, que abre a prévia e permite Salvar como PDF pelo diálogo nativo do navegador. Não há ações de edição, exclusão ou aprovação nessa listagem; a listagem normal mantém as ações existentes. Pesquisa e paginação preservam o vínculo com o orçamento original. Esta alteração de interface não exige nova migração SQL.

A aprovação é iniciada exclusivamente pelo botão do cabeçalho Aprovar orçamento, que abre um diálogo com código, cliente e validade dos pendentes. Sem pendentes, o botão fica desabilitado. O submenu Orçamentos aprovados mantém apenas a ação PDF por linha. Não é necessária nova migração para essa mudança de interface.

## Ordem de cliente nos orçamentos — migração 008

`supabase/migrations/202609060008_budget_client_order.sql` deve ser aplicada uma vez após 007. As listagens geral e de aprovados e as RPCs passam a usar `[codigo, clienteCodigo, clienteNome, data, validade, total]`. A tabela `orcamento` já armazena `cliente_codigo`; o nome não é duplicado e continua vindo de `cliente` por `JOIN`. A migração preserva registros e aprovações, mantém seis campos no array e incrementa a revisão global. Recarregue todas as abas junto com a nova versão da interface antes de editar.

## Limpar e carregar dados simples

Depois de aplicar até a migração 008, abra `supabase/seeds/reset_simple_data.sql`, copie o arquivo inteiro para o SQL Editor e execute uma vez. Ele substitui todo o conteúdo de `cliente`, `categoria`, `produto`, `orcamento` e `item_orcamento`, reinicia os códigos em 1 e cria uma carga pequena vinculada. O processo preserva `auth.users` e `atlas_admins`, avança a revisão do workspace e mostra as contagens finais. Recarregue todas as abas após o resultado. Para manter os dados atuais, não execute esse arquivo.


## ISS-019 — gravação direta na ordem atual

Implementado no código, com aplicação remota pendente: `supabase/migrations/202609070009_budget_order_compatibility.sql` substitui a RPC após 008 para gravar diretamente `[codigo, clienteCodigo, clienteNome, data, validade, total]`. Apesar do nome do arquivo, não há suporte à entrada legada: nome antes do código é rejeitado com `22023`, antes de qualquer alteração. A função `atlas_save_workspace_legacy_order` é removida; não há conversão intermediária. O cliente é vinculado pelo código no índice 1, e o nome retornado vem do JOIN com `cliente`.

Autenticação, permissões, revisão global, aprovação, datas e sincronização transacional são preservadas. A migração avança a revisão; recarregue todas as abas com a interface atual antes de salvar. Não há nova dependência, serviço ou variável de ambiente. `tests/shared.test.js` cobre inclusão e edição na ordem atual, rejeição da ordem antiga e de entradas inválidas, conflitos e preservação do estado após falha. A migração 008 permanece como histórico; a 009 substitui seu adaptador.
