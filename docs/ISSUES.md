# Problemas e riscos conhecidos

> Última revisão técnica: 4 de setembro de 2026.

Este documento registra defeitos observados, riscos técnicos e limitações que podem causar comportamento inesperado. Requisitos de negócio ainda não concluídos continuam sendo acompanhados em [`REQUIREMENTS.md`](REQUIREMENTS.md).

## Critérios

- **Alta**: pode comprometer dados, segurança ou um fluxo principal.
- **Média**: afeta consistência, validação, acesso ou manutenção.
- **Baixa**: afeta principalmente experiência de uso ou qualidade interna.
- **Aberto**: problema reproduzível no código atual.
- **Planejado**: limitação conhecida ligada a um requisito ainda pendente.
- **Corrigido**: o defeito foi removido e a validação correspondente foi registrada.

## Resumo

| ID | Prioridade | Estado | Área | Problema |
| --- | --- | --- | --- | --- |
| ISS-001 | Alta | Corrigido | Orçamentos | Inclusão e edição passam a respeitar o formato esperado pela tabela. |
| ISS-002 | Alta | Corrigido | Segurança | Dados textuais são escapados antes da renderização nas tabelas. |
| ISS-003 | Alta | Planejado | Segurança | Exclusões não solicitam nem validam senha ou autorização. |
| ISS-004 | Alta | Planejado | Dados | Todos os registros são perdidos ao recarregar a página. |
| ISS-005 | Média | Corrigido | Identificadores | Códigos numéricos são gerados depois do maior valor existente. |
| ISS-006 | Média | Aberto | Categorias | Renomear ou excluir uma categoria não atualiza os produtos relacionados. |
| ISS-007 | Média | Aberto | Validação | Valores e documentos aceitam dados de negócio inválidos. |
| ISS-008 | Média | Aberto | Responsividade | O menu fica indisponível em telas de até 760 px. |
| ISS-009 | Média | Planejado | Produtos | Edições de produtos não solicitam confirmação. |
| ISS-010 | Média | Corrigido | Orçamentos | A seleção de clientes usa os registros atuais em memória. |
| ISS-011 | Média | Aberto | Testes | Não há testes de DOM nem dos fluxos integrados de CRUD e navegação. |
| ISS-012 | Baixa | Aberto | Acessibilidade | Botões representados apenas por ícones não possuem nomes acessíveis. |
| ISS-013 | Baixa | Aberto | Filtros | Um registro recém-incluído pode permanecer oculto por um filtro ativo. |
| ISS-014 | Média | Aberto | Orçamentos | Alterações de clientes podem deixar referências inconsistentes nos orçamentos. |
| ISS-015 | Baixa | Aberto | Filtros | Selecionar uma categoria não atualiza imediatamente a lista de produtos. |

## Detalhes e correções sugeridas

### ISS-001 — Estrutura inconsistente de orçamentos

Antes da correção, o cabeçalho esperava código, cliente, data, validade e valor total, mas o formulário fornecia somente cliente e validade. O salvamento genérico criava uma linha menor, e a edição carregava a data existente no campo de validade por usar índices posicionais genéricos.

**Impacto:** novos orçamentos aparecem em colunas erradas e podem perder significado ao serem editados.

**Correção aplicada:** o fluxo de novo orçamento não usa mais o salvamento genérico nem permite persistir uma linha incompleta. Ele armazena nome e código do cliente, gera a data, posiciona a validade, cria os itens e calcula o total. A edição carrega a validade correta e preserva a data e o total existentes.

**Validação:** `npm run check` e `npm test`, incluindo testes da estrutura criada, preservação de data e total, conversão da validade, seleção de quantidades e cálculo dos itens.

### ISS-002 — Conteúdo de usuário renderizado como HTML

Antes da correção, `table.js` montava células com interpolação direta (`<td>${value}</td>`) e `menu.js` aplicava o resultado com `innerHTML`. Nomes e descrições contendo marcação podiam alterar a página ou executar código no navegador.

**Impacto:** risco de XSS, especialmente quando os dados forem persistidos ou compartilhados por um back-end.

**Correção aplicada:** `table.js` escapa caracteres HTML em todas as células textuais, inclusive no status dos produtos, antes de montar as linhas. Listas dinâmicas de clientes e produtos usam `textContent`, e opções dinâmicas de `select` também são escapadas.

**Validação:** testes automatizados verificam que marcação e atributos de evento são exibidos como texto, inclusive na célula especial de status.

### ISS-003 — Exclusão sem autorização real

A aplicação usa `confirm()`, mas apenas informa que uma senha será validada. Nenhuma senha, sessão ou permissão é verificada.

**Impacto:** qualquer usuário com acesso à interface pode remover registros.

**Correção sugerida:** implementar autenticação e autorização no back-end; a confirmação visual deve complementar, não substituir, a regra de segurança.

### ISS-004 — Ausência de persistência

Os dados vivem apenas no módulo `data.js` e voltam ao estado demonstrativo quando a página é recarregada.

**Impacto:** todo cadastro, alteração ou exclusão da sessão é perdido.

**Correção sugerida:** integrar a camada de dados ao Supabase e tratar carregamento, falhas, concorrência e estados vazios.

### ISS-005 — Possibilidade de códigos duplicados

Antes da correção, o próximo código usava `array.length + 1`. Após uma exclusão, esse número podia já pertencer a outro registro.

**Impacto:** códigos deixam de identificar registros de maneira única.

**Correção aplicada:** todos os códigos passaram a ser números inteiros sem prefixo. Enquanto o protótipo permanecer local, o próximo valor é calculado como o maior código existente mais um, portanto uma exclusão intermediária não provoca duplicidade.

**Validação:** testes automatizados cobrem tabelas vazias, fora de ordem e com lacunas entre códigos.

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

Antes da correção, as opções do campo Cliente eram declaradas em `config.js`, sem usar os registros atuais de `data.clientes`.

**Impacto:** clientes incluídos, renomeados ou excluídos não são refletidos no formulário de orçamento.

**Correção aplicada:** “Novo orçamento” gera uma lista pesquisável diretamente de `data.clientes`, portanto inclusões e alterações de clientes aparecem sem manutenção de opções fixas. O código selecionado é mantido durante a transição, e nome e código são persistidos no orçamento concluído.

**Validação:** teste automatizado da busca por nome e verificação de sintaxe do fluxo do modal.

### ISS-011 — Cobertura automatizada limitada

Os testes unitários cobrem filtros, paginação, geração de campos, códigos, escape de HTML e regras de orçamento, mas não executam a aplicação em um DOM nem cobrem os fluxos integrados de inclusão, edição, exclusão, modal ou navegação.

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

### ISS-014 — Falta de integridade entre clientes e orçamentos

Orçamentos armazenam código e nome do cliente. Renomear ou excluir um cliente não atualiza nem bloqueia os orçamentos relacionados; além disso, a edição do orçamento procura o código pelo nome e pode escolher o primeiro registro incorreto quando existem nomes duplicados.

**Impacto:** um orçamento pode apontar para um cliente inexistente, exibir um nome antigo ou associar o código de outra pessoa durante uma edição.

**Correção sugerida:** usar o código como referência única em todas as operações, obter o nome por essa referência e definir regras explícitas para alteração e exclusão de clientes relacionados.

### ISS-015 — Categoria selecionada com atualização atrasada

O combobox genérico emite `change` no `blur`, mas não no clique da opção. Como o filtro de categoria escuta `change`, a tabela de produtos só é recalculada depois que o foco sai do campo.

**Impacto:** o usuário seleciona uma categoria e pode interpretar que o filtro não funcionou.

**Correção sugerida:** emitir `change` imediatamente ao confirmar uma opção do combobox e manter o evento de perda de foco apenas para validação e fechamento.

## Manutenção

Ao corrigir um item, atualize seu estado e registre a validação realizada. Se a correção também concluir ou alterar um requisito, sincronize `REQUIREMENTS.md`, `ARCHITECTURE.md` e `README.md` no mesmo conjunto de mudanças.
