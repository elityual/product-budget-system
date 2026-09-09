# Configuração do Supabase a partir do zero

O Supabase é opcional. Escolha “Banco local neste computador” para usar SQLite sem conta ou internet. Esta página descreve a configuração do armazenamento em nuvem para uma instalação nova; não há migração de dados anteriores.

## Criar o projeto

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo.
2. Abra o SQL Editor e execute, nesta ordem, os arquivos inteiros [`supabase/migrations/202609080001_initial.sql`](../supabase/migrations/202609080001_initial.sql) e [`supabase/migrations/202609090001_quotation_details.sql`](../supabase/migrations/202609090001_quotation_details.sql). Eles criam as tabelas vazias, contatos relacionados, regras de segurança e RPCs atuais.
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
- Abra outra sessão autenticada para confirmar o compartilhamento.
- Confirme que o administrador vê exclusões de catálogo e que uma conta comum não vê essas ações, mas pode editar orçamentos.
- Altere dados em duas abas e salve a aba antiga; a gravação deve ser rejeitada por conflito e os dados não devem ser sobrescritos.

Os testes locais em `tests/integration/initial-supabase.test.js` simulam Auth e PostgreSQL com PGlite. Eles comprovam o SQL em um ambiente isolado; não comprovam a configuração do seu projeto remoto. Registre resultados remotos sem incluir tokens, senhas ou identificadores pessoais.

## Permissões e dados

As tabelas `cliente`, `categoria`, `produto`, `orcamento` e `item_orcamento` são relacionais. Códigos são gerados pelo PostgreSQL; datas de emissão e nomes/preços dos itens existentes são preservados; totais são calculados no servidor. A interface envia orçamentos somente na ordem `[codigo, clienteCodigo, clienteNome, data, validade, total]`.

RLS permite leitura apenas a sessões autenticadas não anônimas. Escritas diretas são revogadas; alterações passam pelas RPCs, que validam o formato, a revisão, as permissões, os vínculos e a atomicidade. A tabela `atlas_admins` só deve ser administrada pelo SQL Editor com acesso de projeto.

## Problemas comuns

### Orçamento rejeitado por user_id nulo (23502)

Se criar orçamento retornar `null value in column "user_id" of relation "orcamento"`, execute o arquivo completo [`202609090002_legacy_budget_user.sql`](../supabase/migrations/202609090002_legacy_budget_user.sql), após a migração de detalhes. Ele define `auth.uid()` como valor padrão da coluna legada, mantendo NOT NULL, chaves estrangeiras, dados existentes e políticas. É reaplicável e não altera instalações sem essa coluna. Recarregue o Atlas e tente salvar novamente. O projeto remoto precisa ser validado pelo operador; os testes locais verificam a compatibilidade em PostgreSQL isolado.

### Gravação bloqueada por DELETE ou UPDATE sem WHERE

Se o cadastro retornar `21000: DELETE requires a WHERE clause`, execute **somente** o arquivo inteiro [`202609080002_safe_workspace_writes.sql`](../supabase/migrations/202609080002_safe_workspace_writes.sql) no SQL Editor do projeto já instalado. Ele substitui `atlas_save_workspace` e `atlas_approve_budget` em uma transação, preservando tabelas, dados e permissões. Não execute novamente a migração inicial sobre o banco existente e não desative a proteção de gravação.

A migração inicial já contém a correção para projetos novos. Depois de aplicar a correção em um projeto existente, recarregue o Atlas e cadastre um cliente; confira também os itens, totais e aprovação de um orçamento existente. A confirmação remota permanece pendente até essa verificação. O PGlite testa as transações e a preservação de dados, mas não reproduz a extensão de proteção do projeto Supabase.

Para habilitar contatos, perfil completo da empresa e snapshots do PDF em uma instalação existente, execute depois a migração `202609090001_quotation_details.sql`. Ela é reaplicável, migra os campos antigos de contato sem duplicá-los e substitui as RPCs pelo contrato atual. Nesse contrato, a criação de cliente envia um rascunho transitório `novoClienteContato`: e-mail válido e telefone são obrigatórios, e Pessoa Jurídica exige pessoa de contato. A RPC grava o cliente e esses contatos na mesma transação; clientes antigos sem essas informações permanecem carregáveis até sua edição de contato.

Essa migração confirma que `cliente.codigo` é uma chave primária ou única antes de criar as chaves estrangeiras. Em instalações antigas sem essa restrição, ela adiciona `cliente_codigo_unico`; se houver código nulo ou repetido, interrompe a transação com uma mensagem específica para que os dados sejam corrigidos primeiro.

- “Configure a URL e a chave”: selecione Supabase e preencha ambos os campos; use Project URL e Publishable key, sem barras extras na URL.
- “Sessão expirada”: entre novamente. A versão atual não renova tokens automaticamente.
- “Permission denied”: confira se o SQL inicial foi executado inteiro e se o usuário está confirmado no Auth.
- “Conflito”: recarregue a página para obter a revisão atual antes de salvar novamente.

Para uso sem Supabase, volte à tela inicial e escolha o banco local. O SQLite é criado automaticamente em `%LOCALAPPDATA%\ProductBudgetControl` (ou em `.local-data/ProductBudgetControl` sem `LOCALAPPDATA`); backups locais ficam disponíveis no cabeçalho.
