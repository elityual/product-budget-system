# Requisitos funcionais

> Última revisão técnica: 3 de setembro de 2026.

Este documento consolida as anotações de `docs/ideas.text` e registra o estado observado no código atual. Os marcadores significam:

- **Implementado**: existe no protótipo atual.
- **Parcial**: existe, mas não cumpre todas as regras descritas.
- **Pendente**: ainda não existe.

## Clientes (`TabelaCliente`)

| Requisito | Estado | Observação |
| --- | --- | --- |
| Campos: código imutável, tipo, CPF/CNPJ e nome | Implementado | CPF/CNPJ e nome usam `required`. |
| Listar e pesquisar clientes | Implementado | A pesquisa considera todas as colunas e pode ser combinada com o filtro por tipo de cliente. |
| Exibir orientação correspondente à operação | Implementado | Listar e incluir possuem título e descrição próprios. |
| Incluir cliente | Implementado | O código é criado no navegador. |
| Retornar à lista após incluir ou cancelar | Implementado | Fechar o formulário iniciado pelo submenu restaura Listar clientes. |
| Selecionar e carregar cliente para editar | Implementado | Cada linha da listagem possui um botão de edição. |
| Confirmar alteração | Implementado | A edição solicita confirmação antes de modificar os dados do cliente. |
| Selecionar cliente para excluir | Implementado | Cada linha da listagem possui um botão de exclusão. |
| Confirmar e validar senha na exclusão | Parcial | Há confirmação, mas nenhuma senha é solicitada. |

## Categorias (`TabelaCategorias`)

| Requisito | Estado | Observação |
| --- | --- | --- |
| Campos: código imutável e descrição obrigatória | Implementado | Descrição usa `required`; a listagem utiliza pesquisa textual. |
| Listar, incluir e editar | Implementado | Usa dados em memória. |
| Confirmar alteração | Implementado | A edição solicita confirmação antes de modificar a descrição da categoria. |
| Excluir com confirmação e senha | Parcial | Confirma, mas não valida senha. |

## Itens/produtos (`TabelaItensProdutos`)

Campos pretendidos: código imutável, categoria, nome, descrição, valor de venda, data de cadastro e status.

| Requisito | Estado | Observação |
| --- | --- | --- |
| Listar produtos | Implementado | A listagem exibe todos os campos previstos, formata o valor de venda e oferece pesquisa e filtros por categoria e status. |
| Incluir produto | Implementado | Os campos salvos correspondem às colunas exibidas e a data de cadastro é gerada automaticamente. |
| Validar categoria, descrição, valor e status | Implementado | Os campos obrigatórios impedem valores vazios; a categoria deve corresponder a uma categoria cadastrada e o status sempre possui uma opção válida. |
| Editar e carregar dados | Implementado | Os campos são carregados e permanecem alinhados com as colunas da tabela. |
| Confirmar alteração | Pendente | Não há confirmação. |
| Excluir com confirmação e senha | Parcial | Confirma, mas não valida senha. |

## Orçamentos (`TabelaOrçamento`)

Campos pretendidos: código imutável, cliente e seu código, data automática e imutável, validade e valor total calculado.

| Requisito | Estado | Observação |
| --- | --- | --- |
| Listar orçamentos | Parcial | O registro demonstrativo é exibido corretamente, mas novos orçamentos não possuem todas as colunas esperadas. |
| Incluir orçamento | Parcial | O formulário salva cliente e validade, mas ainda não gera data, valor total nem itens, deixando a nova linha incompleta. |
| Selecionar cliente e informar validade | Parcial | O cliente vem de opções fixas; a validade é obrigatória. |
| Selecionar itens e quantidades | Pendente | Não há segunda etapa ou mini-menu. |
| Exigir ao menos um item | Pendente | Itens não são modelados no formulário. |
| Gerar data e calcular valor total | Pendente | Não há geração nem cálculo. |

## Itens de orçamento (`TabelaItensOrçamento`)

A estrutura pretendida contém código e nome do produto, quantidade, valor unitário e valor total do item (`quantidade × valor unitário`). Toda essa estrutura está **pendente**.

## Requisitos transversais

| Requisito | Estado | Observação |
| --- | --- | --- |
| Persistência via Supabase | Pendente | Não há cliente, configuração ou consultas. |
| Sair do sistema | Parcial | Apenas exibe um alerta; não existe sessão. |
| Responsividade | Parcial | Há breakpoint móvel, mas o menu fica indisponível em telas pequenas. |
| Paginação das tabelas | Implementado | Todas as listagens exibem no máximo 10 registros por página e oferecem navegação para a página anterior ou seguinte. |
| Segurança de exclusão | Pendente | Sem autenticação ou autorização real. |

## Critério de atualização

Sempre que um requisito for implementado ou seu comportamento mudar, atualize a respectiva linha, observação e campos relacionados. Novos requisitos devem ser incluídos aqui e, quando afetarem a arquitetura ou a execução, também em `ARCHITECTURE.md` e `README.md`.

Defeitos técnicos, riscos e limitações de implementação são acompanhados separadamente em [`ISSUES.md`](ISSUES.md).
