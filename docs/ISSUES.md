# Problemas e riscos conhecidos

> Última revisão técnica: 3 de setembro de 2026.

Este documento registra defeitos observados, riscos técnicos e limitações que podem causar comportamento inesperado. Requisitos de negócio ainda não concluídos continuam sendo acompanhados em [`REQUIREMENTS.md`](REQUIREMENTS.md).

## Critérios

- **Alta**: pode comprometer dados, segurança ou um fluxo principal.
- **Média**: afeta consistência, validação, acesso ou manutenção.
- **Baixa**: afeta principalmente experiência de uso ou qualidade interna.
- **Aberto**: problema reproduzível no código atual.
- **Planejado**: limitação conhecida ligada a um requisito ainda pendente.

## Resumo

| ID | Prioridade | Estado | Área | Problema |
| --- | --- | --- | --- | --- |
| ISS-001 | Alta | Aberto | Orçamentos | Inclusão e edição não respeitam o formato esperado pela tabela. |
| ISS-002 | Alta | Aberto | Segurança | Dados digitados são inseridos na tabela como HTML sem sanitização. |
| ISS-003 | Alta | Planejado | Segurança | Exclusões não solicitam nem validam senha ou autorização. |
| ISS-004 | Alta | Planejado | Dados | Todos os registros são perdidos ao recarregar a página. |
| ISS-005 | Média | Aberto | Identificadores | Excluir e incluir registros pode gerar códigos duplicados. |
| ISS-006 | Média | Aberto | Categorias | Renomear ou excluir uma categoria não atualiza os produtos relacionados. |
| ISS-007 | Média | Aberto | Validação | Valores e documentos aceitam dados de negócio inválidos. |
| ISS-008 | Média | Aberto | Responsividade | O menu fica indisponível em telas de até 760 px. |
| ISS-009 | Média | Planejado | Produtos | Edições de produtos não solicitam confirmação. |
| ISS-010 | Média | Aberto | Orçamentos | A lista de clientes do orçamento é fixa e pode ficar desatualizada. |
| ISS-011 | Média | Aberto | Testes | Não há testes de DOM, formulários, CRUD ou navegação completa. |
| ISS-012 | Baixa | Aberto | Acessibilidade | Botões representados apenas por ícones não possuem nomes acessíveis. |
| ISS-013 | Baixa | Aberto | Filtros | Um registro recém-incluído pode permanecer oculto por um filtro ativo. |

## Detalhes e correções sugeridas

### ISS-001 — Estrutura inconsistente de orçamentos

O cabeçalho espera código, cliente, data, validade e valor total, mas o formulário fornece somente cliente e validade. O salvamento genérico cria uma linha menor, e a edição carrega a data existente no campo de validade por usar índices posicionais genéricos.

**Impacto:** novos orçamentos aparecem em colunas erradas e podem perder significado ao serem editados.

**Correção sugerida:** implementar um fluxo próprio para orçamentos, armazenar objetos nomeados, gerar data, calcular total e modelar os itens antes de marcar os requisitos como concluídos.

### ISS-002 — Conteúdo de usuário renderizado como HTML

`table.js` monta células com interpolação direta (`<td>${value}</td>`) e `menu.js` aplica o resultado com `innerHTML`. Nomes e descrições contendo marcação podem alterar a página ou executar código no navegador.

**Impacto:** risco de XSS, especialmente quando os dados forem persistidos ou compartilhados por um back-end.

**Correção sugerida:** criar células com `textContent` ou escapar todo valor antes da interpolação; manter HTML somente para elementos controlados pela aplicação.

### ISS-003 — Exclusão sem autorização real

A aplicação usa `confirm()`, mas apenas informa que uma senha será validada. Nenhuma senha, sessão ou permissão é verificada.

**Impacto:** qualquer usuário com acesso à interface pode remover registros.

**Correção sugerida:** implementar autenticação e autorização no back-end; a confirmação visual deve complementar, não substituir, a regra de segurança.

### ISS-004 — Ausência de persistência

Os dados vivem apenas no módulo `data.js` e voltam ao estado demonstrativo quando a página é recarregada.

**Impacto:** todo cadastro, alteração ou exclusão da sessão é perdido.

**Correção sugerida:** integrar a camada de dados ao Supabase e tratar carregamento, falhas, concorrência e estados vazios.

### ISS-005 — Possibilidade de códigos duplicados

O próximo código usa `array.length + 1`. Após uma exclusão, esse número pode já pertencer a outro registro.

**Impacto:** códigos deixam de identificar registros de maneira única.

**Correção sugerida:** gerar identificadores no banco; enquanto o protótipo permanecer local, calcular o maior sufixo existente ou usar UUID.

### ISS-006 — Falta de integridade entre categorias e produtos

Produtos guardam o nome da categoria como texto. Alterar ou excluir uma categoria não modifica nem bloqueia os produtos que usam o nome antigo.

**Impacto:** produtos órfãos deixam de aparecer corretamente nos filtros e não podem reutilizar a categoria antiga em uma edição.

**Correção sugerida:** relacionar produtos ao código da categoria e definir uma regra explícita para renomeação e exclusão de categorias em uso.

### ISS-007 — Validações de domínio incompletas

CPF/CNPJ não possui validação de formato ou dígitos, descrições podem se repetir e o valor de venda aceita zero ou números negativos porque o campo numérico não define mínimo.

Essas validações são adicionais às regras mínimas atualmente registradas como implementadas em `REQUIREMENTS.md`.

**Impacto:** registros tecnicamente preenchidos podem ser inválidos para o negócio.

**Correção sugerida:** formalizar as regras, normalizar documentos, impedir duplicidades quando aplicável e exigir valor de venda maior que zero.

### ISS-008 — Navegação móvel indisponível

O breakpoint de 760 px oculta o elemento `aside`, mas não oferece botão ou painel alternativo para abrir o menu.

**Impacto:** usuários de telas pequenas não conseguem trocar de módulo.

**Correção sugerida:** transformar o menu lateral em drawer controlado pelo botão de menu e garantir foco, fechamento e atributos ARIA.

### ISS-009 — Produto editado sem confirmação

Clientes e categorias pedem confirmação antes da alteração, mas produtos ainda são salvos imediatamente.

**Impacto:** alterações acidentais são aplicadas sem uma etapa de revisão.

**Correção sugerida:** aplicar a confirmação prevista em `REQUIREMENTS.md` ou adotar um padrão único de confirmação para todas as entidades.

### ISS-010 — Clientes fixos no orçamento

As opções do campo Cliente são declaradas em `config.js`, sem usar os registros atuais de `data.clientes`.

**Impacto:** clientes incluídos, renomeados ou excluídos não são refletidos no formulário de orçamento.

**Correção sugerida:** gerar as opções a partir da fonte de clientes e armazenar também o código imutável do cliente no orçamento.

### ISS-011 — Cobertura automatizada limitada

Os testes verificam filtros e paginação, mas não executam a aplicação em um DOM nem cobrem inclusão, edição, exclusão, modal, autocomplete ou orçamento.

**Impacto:** regressões de integração podem passar mesmo com `npm test` aprovado.

**Correção sugerida:** adicionar testes de unidade para dados/formulários e testes de navegador para os fluxos principais.

### ISS-012 — Botões sem nomes acessíveis

As ações de editar e excluir usam apenas os símbolos `✎` e `⌫`; os botões da barra de ícones também não possuem texto ou `aria-label`.

**Impacto:** leitores de tela não conseguem comunicar claramente a finalidade dos controles.

**Correção sugerida:** adicionar nomes acessíveis, títulos coerentes e estados de foco visíveis.

### ISS-013 — Inclusão possivelmente escondida por filtros

Abrir um formulário pelo botão principal preserva os filtros atuais. Se o novo registro não corresponder a eles, ele não aparece depois do salvamento, mesmo que a página seja recalculada.

**Impacto:** o usuário pode interpretar que o cadastro falhou.

**Correção sugerida:** limpar filtros ao iniciar a inclusão, informar que o registro está oculto ou oferecer uma ação para remover os filtros.

## Manutenção

Ao corrigir um item, atualize seu estado e registre a validação realizada. Se a correção também concluir ou alterar um requisito, sincronize `REQUIREMENTS.md`, `ARCHITECTURE.md` e `README.md` no mesmo conjunto de mudanças.
