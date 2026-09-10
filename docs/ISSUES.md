# Issues e limitações conhecidas

> Documento público. Não inclua tokens, senhas, e-mails, nomes de pessoas ou identificadores de projetos nos relatos.

## Situação atual

As regras funcionais de clientes, categorias, produtos e orçamentos estão implementadas e cobertas pelos testes locais. O armazenamento agora pode ser SQLite local ou Supabase configurado pelo operador. A instalação nova usa `supabase/migrations/202609080001_initial.sql`; instalações existentes usam as migrações corretivas documentadas em [SUPABASE.md](SUPABASE.md).

Contratos implementados ficam em [REQUIREMENTS.md](REQUIREMENTS.md) e [ARCHITECTURE.md](ARCHITECTURE.md). Melhorias futuras são acompanhadas somente em [ROADMAP.md](ROADMAP.md).

## Limitações conhecidas

- A sessão Supabase não é renovada automaticamente; após expirar, entre novamente.
- A validação dos dígitos CPF/CNPJ ocorre no navegador; as restrições de formato do banco não substituem essa verificação. Não há consulta cadastral externa.
- O SQLite local é de usuário único no mesmo computador e não oferece sincronização com Supabase.
- A validação remota deve ser executada pelo operador em um projeto Supabase recém-criado, seguindo [SUPABASE.md](SUPABASE.md).
- O launcher Windows opcional já existe, mas exige Node.js instalado. O pacote com Node.js incluído permanece pendente em RDM-006 do roadmap.
- O seletor de pasta de backup e a abertura no Explorador dependem do Windows; a interface atual não oferece entrada manual do caminho em outros sistemas.

## ISS - 001

**Estado: correção implementada; validação remota pendente.**

Instalações legadas podem ter `user_id` obrigatório nas tabelas comerciais. A interface atual não envia esse campo porque o Atlas usa um workspace comercial compartilhado; por isso inclusões falham enquanto edições de registros já preenchidos funcionam.

Execute a auditoria `supabase/audits/202609090003_legacy_user_id_audit.sql`. Para o esquema legado identificado, com chaves e FKs compostas por `user_id` e código, execute `supabase/migrations/202609090004_migrate_legacy_composite_commercial_keys.sql`. A migração guarda os valores por chave em uma tabela protegida, converte os relacionamentos para os códigos comerciais e interrompe sem alterações se encontrar índice, policy, trigger, view ou constraint desconhecida. Ela preserva os `user_id` de administradores, workspace e Supabase Auth.

A issue será marcada como resolvida após aplicar a migração no projeto remoto e confirmar inclusões de cliente, categoria, produto e orçamento.

Após converter as chaves, execute `supabase/migrations/202609090005_refresh_workspace_contact_rpcs.sql`. Ela corrige instalações em que `atlas_save_workspace` ainda não reconhece `novoClienteContato`, salvando cliente, e-mail, pessoa de contato de PJ e telefones na mesma transação. A migração não repete a conversão dos campos legados. Contatos ignorados por chamadas anteriores devem ser preenchidos manualmente pela ação **Contato**. A validação remota continua pendente.

Em seguida, execute `supabase/migrations/202609090006_normalize_details.sql` para concluir o modelo atual. Ela preserva os valores existentes em tabelas relacionadas e remove as colunas legadas `detalhes`; a confirmação no projeto remoto continua fazendo parte da validação pendente de ISS-001.

A sequência instalada termina em `202609090007_company_profile.sql`, que move os dados da empresa para tabela própria. Essa etapa não altera a recuperação de `user_id`, mas precisa ser aplicada para que as RPCs correspondam ao contrato atual.

