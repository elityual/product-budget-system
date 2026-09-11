# Configuração do Supabase a partir do zero

O Supabase é opcional. Escolha “Banco local neste computador” para usar SQLite sem conta ou internet. Esta página descreve a configuração do armazenamento em nuvem para uma instalação nova; não há migração de dados anteriores.

## Criar o projeto

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo.
2. Abra o SQL Editor e execute o arquivo inteiro [`supabase/install.sql`](../supabase/install.sql). Esse único arquivo instala as tabelas vazias, contatos, perfil da empresa, informações históricas, regras de orçamento, segurança e RPCs atuais. Ele já inclui as nove migrações necessárias à instalação nova; não execute essas migrações separadamente nessa instalação.
3. Em Authentication > Users, crie um usuário confirmado com e-mail e senha.
4. No SQL Editor, defina esse usuário como administrador, substituindo o e-mail:

```sql
insert into public.atlas_admins(user_id)
select id from auth.users where lower(email)=lower('SEU_EMAIL_AQUI')
on conflict do nothing;

select u.id,u.email
from public.atlas_admins a join auth.users u on u.id=a.user_id;
```

5. Copie Project URL e Publishable key em Project Settings > API. Nunca copie uma chave `service_role` para a aplicação.
6. Inicie `npm start`, selecione “Supabase (nuvem)” e informe os dois valores na tela. Eles ficam no armazenamento local do navegador; senhas não são salvas.

O banco começa vazio. A aplicação usa um único workspace compartilhado entre usuários autenticados. O primeiro administrador pode excluir clientes, categorias e produtos; todos os usuários autenticados podem editar e excluir orçamentos. A aprovação usa a mesma revisão global das gravações.

## Carga opcional de exemplo

Depois de confirmar que o projeto está vazio, o operador pode executar [`supabase/seeds/example_data.sql`](../supabase/seeds/example_data.sql). O script recusa execução se alguma tabela comercial já tiver registros. Ele cria dois clientes, duas categorias, dois produtos e um orçamento com dois itens. Essa carga não é necessária para uso normal.

## Verificação de uma instalação nova

- Entre com a conta criada e confirme que Clientes, Produtos e Orçamentos aparecem vazios.
- Crie uma categoria, um produto, um cliente e um orçamento; confira o total e a referência pelo código do cliente.
- Inative um produto usado em orçamento pendente; confirme que ele some do catálogo, continua identificado no item histórico e permite somente manter, reduzir ou remover sua quantidade.
- Abra outra sessão autenticada para confirmar o compartilhamento.
- Confirme que o administrador vê exclusões de catálogo e que uma conta comum não vê essas ações, mas pode editar orçamentos.
- Altere dados em duas abas e salve a aba antiga; a gravação deve ser rejeitada por conflito e os dados não devem ser sobrescritos.

Os testes locais em `tests/integration/initial-supabase.test.js` simulam Auth e PostgreSQL com PGlite. Eles comprovam o SQL em um ambiente isolado; não comprovam a configuração do seu projeto remoto. Registre resultados remotos sem incluir tokens, senhas ou identificadores pessoais.

## Permissões e dados

As tabelas comerciais e `orcamento_informacao` são relacionais. Códigos são gerados pelo PostgreSQL; datas de emissão, nomes e preços históricos são preservados; totais são calculados no servidor. A interface envia orçamentos na ordem `[codigo, clienteCodigo, clienteNome, data, validade, total, informacao]`.

RLS permite leitura apenas a sessões autenticadas não anônimas. Escritas diretas são revogadas; alterações passam pelas RPCs, que validam o formato, a revisão, as permissões, os vínculos e a atomicidade. A tabela `atlas_admins` só deve ser administrada pelo SQL Editor com acesso de projeto.

## Problemas comuns

### Inclusões rejeitadas por user_id nulo (23502)

Se uma inclusão retornar `null value in column "user_id"`, o projeto possui colunas comerciais de uma versão anterior. Depois de `202609090001_quotation_details.sql`, execute primeiro a consulta somente de leitura [`202609090003_legacy_user_id_audit.sql`](../supabase/audits/202609090003_legacy_user_id_audit.sql). Para o resultado com chaves primárias `(user_id, codigo)`, checks `shared_workspace_only` e FKs compostas entre cliente, categoria, produto, orçamento e itens, execute [`202609090004_migrate_legacy_composite_commercial_keys.sql`](../supabase/migrations/202609090004_migrate_legacy_composite_commercial_keys.sql). Ela cria `atlas_legacy_user_id_backup`, sem permissão para sessões da aplicação, arquiva os valores por chave e troca as chaves e FKs compostas pelo contrato atual baseado em código. Não usa `CASCADE`; dependências fora do esquema auditado fazem toda a transação falhar sem alterar o banco. A migração `202609090003_remove_legacy_commercial_user_id.sql` destina-se somente a instalações sem chaves compostas. Recarregue o Atlas e teste inclusão e edição. A validação no projeto remoto continua necessária.

`202609090002_legacy_budget_user.sql` permanece como correção temporária para instalações que desejem manter apenas `orcamento.user_id`; não a aplique antes da remoção completa de ISS-001.

### Gravação bloqueada por DELETE ou UPDATE sem WHERE

Se o cadastro retornar `21000: DELETE requires a WHERE clause`, execute **somente** o arquivo inteiro [`202609080002_safe_workspace_writes.sql`](../supabase/migrations/202609080002_safe_workspace_writes.sql) no SQL Editor do projeto já instalado. Ele substitui `atlas_save_workspace` e `atlas_approve_budget` em uma transação, preservando tabelas, dados e permissões. Não execute novamente a migração inicial sobre o banco existente e não desative a proteção de gravação.

A migração inicial já contém a correção para projetos novos. Depois de aplicar a correção em um projeto existente, recarregue o Atlas e cadastre um cliente; confira também os itens, totais e aprovação de um orçamento existente. A confirmação remota permanece pendente até essa verificação. O PGlite testa as transações e a preservação de dados, mas não reproduz a extensão de proteção do projeto Supabase.

Para habilitar contatos, perfil completo da empresa e snapshots do PDF em uma instalação existente, execute depois a migração `202609090001_quotation_details.sql`. Ela é reaplicável, migra os campos antigos de contato sem duplicá-los e substitui as RPCs pelo contrato atual. Nesse contrato, a criação de cliente envia um rascunho transitório `novoClienteContato`: e-mail válido e telefone são obrigatórios, e Pessoa Jurídica exige pessoa de contato. A RPC grava o cliente e esses contatos na mesma transação; clientes antigos sem essas informações permanecem carregáveis até sua edição de contato.

Se a consulta de diagnóstico da função indicar `suporta_contato_na_criacao = false`, execute [`202609090005_refresh_workspace_contact_rpcs.sql`](../supabase/migrations/202609090005_refresh_workspace_contact_rpcs.sql) depois de `202609090004_migrate_legacy_composite_commercial_keys.sql`. Essa migração substitui somente as RPCs de leitura e gravação, preservando registros, contatos, snapshots, aprovações, permissões e revisão. Ela é transacional e reaplicável; não repete a conversão de `cliente.detalhes`. Contatos enviados a uma RPC antiga e ignorados não existem no banco e precisam ser preenchidos pela ação **Contato**.

Depois de aplicar, confirme o contrato com:

```sql
select position('novoClienteContato' in pg_get_functiondef(
  'public.atlas_save_workspace(bigint,jsonb)'::regprocedure
)) > 0 as suporta_contato_na_criacao;
```

O resultado deve ser `true`. Em seguida, crie um CPF com dois telefones e um CNPJ com pessoa de contato, recarregue a aplicação e confira os registros pela ação **Contato**.

Por fim, execute [`202609090006_normalize_details.sql`](../supabase/migrations/202609090006_normalize_details.sql). A migração cria `orcamento_informacao`, copia termos e snapshots sem inventar valores ausentes, aproveita contatos legados apenas quando ainda não há registro relacionado, atualiza as RPCs e remove `cliente.detalhes` e `orcamento.detalhes`. Toda a operação ocorre em uma transação e pode ser reaplicada.

Confirme a remoção com:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('cliente', 'orcamento')
  and column_name = 'detalhes';
```

O resultado deve ficar vazio. Orçamentos continuam retornando o objeto comercial na posição 7 do payload, agora montado a partir de `orcamento_informacao`.

Execute depois [`202609090007_company_profile.sql`](../supabase/migrations/202609090007_company_profile.sql). Ela migra `atlas_workspaces.empresa` para `empresa_perfil`, reconhece perfis legados válidos, atualiza as RPCs e remove o JSON antigo. Ao próximo acesso, perfis parciais abrem o cadastro obrigatório; completos entram diretamente.

Essa migração confirma que `cliente.codigo` é uma chave primária ou única antes de criar as chaves estrangeiras. Em instalações antigas sem essa restrição, ela adiciona `cliente_codigo_unico`; se houver código nulo ou repetido, interrompe a transação com uma mensagem específica para que os dados sejam corrigidos primeiro.

- “Configure a URL e a chave”: selecione Supabase e preencha ambos os campos; use Project URL e Publishable key, sem barras extras na URL.
- “Sessão expirada”: entre novamente. A versão atual não renova tokens automaticamente.
- “Permission denied”: confira se o SQL inicial foi executado inteiro e se o usuário está confirmado no Auth.
- “Conflito”: recarregue a página para obter a revisão atual antes de salvar novamente.

Para uso sem Supabase, volte à tela inicial e escolha o banco local. O SQLite é criado automaticamente em `%LOCALAPPDATA%\ProductBudgetControl` (ou em `.local-data/ProductBudgetControl` sem `LOCALAPPDATA`); backups locais ficam disponíveis no cabeçalho.

Em projetos já instalados, execute [`202609110001_inactive_budget_products.sql`](../supabase/migrations/202609110001_inactive_budget_products.sql) depois de `202609100003_approved_budget_items.sql`. A migração é transacional e reaplicável, não altera o formato do payload e passa a rejeitar novas inclusões ou aumentos de produtos inativos sem modificar itens históricos existentes.
