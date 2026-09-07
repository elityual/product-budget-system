# Issues e decisões técnicas

> Documento público. Não inclua tokens, senhas, e-mails, nomes de pessoas ou identificadores de projetos nos relatos.

## Situação atual

As regras funcionais de clientes, categorias, produtos e orçamentos estão implementadas e cobertas pelos testes locais. O armazenamento agora pode ser SQLite local ou Supabase configurado pelo operador. A migração pública do Supabase é a instalação única `supabase/migrations/202609080001_initial.sql`.

## ISS-019 — ordem dos campos do orçamento

Resolvida no contrato inicial. O único formato aceito é `[codigo, clienteCodigo, clienteNome, data, validade, total]`. Entradas com nome antes do código são rejeitadas antes da sincronização. O código do cliente é a referência relacional; o nome é retornado pelo `JOIN`.

## Limitações conhecidas

- A sessão Supabase não é renovada automaticamente; após expirar, entre novamente.
- A validação de dígitos CPF/CNPJ ocorre no navegador e nas restrições de formato do banco, sem consulta cadastral externa.
- O SQLite local é de usuário único no mesmo computador e não oferece sincronização com Supabase.
- A validação remota deve ser executada pelo operador em um projeto Supabase recém-criado, seguindo [SUPABASE.md](SUPABASE.md).
- O pacote Windows pronto para uso pertence ao Plano 2 e ainda não é gerado nesta etapa.

## Próximas melhorias

Renovação de sessão, recuperação de senha, validação completa de limites no servidor Supabase, revisão independente de acessibilidade e empacotamento Windows são melhorias planejadas. Elas não fazem parte da instalação inicial documentada.
