# Issues e limitações conhecidas

> Documento público. Não inclua tokens, senhas, e-mails, nomes de pessoas ou identificadores de projetos nos relatos.

## Situação atual

As regras funcionais de clientes, categorias, produtos e orçamentos estão implementadas e cobertas pelos testes locais. O armazenamento agora pode ser SQLite local ou Supabase configurado pelo operador. A migração pública do Supabase é a instalação única `supabase/migrations/202609080001_initial.sql`.

Contratos implementados ficam em [REQUIREMENTS.md](REQUIREMENTS.md) e [ARCHITECTURE.md](ARCHITECTURE.md). Melhorias futuras são acompanhadas somente em [ROADMAP.md](ROADMAP.md).

## Limitações conhecidas

- A sessão Supabase não é renovada automaticamente; após expirar, entre novamente.
- A validação dos dígitos CPF/CNPJ ocorre no navegador; as restrições de formato do banco não substituem essa verificação. Não há consulta cadastral externa.
- O SQLite local é de usuário único no mesmo computador e não oferece sincronização com Supabase.
- A validação remota deve ser executada pelo operador em um projeto Supabase recém-criado, seguindo [SUPABASE.md](SUPABASE.md).
- O launcher Windows opcional já existe, mas exige Node.js instalado. O pacote com Node.js incluído permanece pendente em RDM-006 do roadmap.
- O seletor de pasta de backup e a abertura no Explorador dependem do Windows; a interface atual não oferece entrada manual do caminho em outros sistemas.

## ISS - 001

{
    "code": "23502",
    "details": "Failing row contains (null, 6, 1, 2026-09-09, 2026-09-11, null, f, {\"client\": {\"email\": \"\", \"contato\": \"\", \"endereco\": \"\", \"telefon...).",
    "hint": null,
    "message": "null value in column \"user_id\" of relation \"orcamento\" violates not-null constraint"
}

i have this same problem for all the functions that save in supabase, i dont have the problem for editing what exist

(what this userid is use for)

