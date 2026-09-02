# Requisitos funcionais

Este documento consolida as anotações de `docs/ideas.text` e registra o estado observado no código atual. Os marcadores significam:

- **Implementado**: existe no protótipo atual.
- **Parcial**: existe, mas não cumpre todas as regras descritas.
- **Pendente**: ainda não existe.

## Clientes (`TabelaCliente`)

| Requisito | Estado | Observação |
| --- | --- | --- |
| Campos: código imutável, tipo, CPF/CNPJ e nome | Implementado | CPF/CNPJ e nome usam `required`. |
| Listar e pesquisar clientes | Implementado | A pesquisa considera todas as colunas. |
| Exibir orientação correspondente à operação | Implementado | Listar, incluir, editar e excluir possuem título e descrição próprios. |
| Incluir cliente | Implementado | O código é criado no navegador. |
| Retornar à lista após incluir ou cancelar | Implementado | Fechar o formulário iniciado pelo submenu restaura Listar clientes. |
| Selecionar e carregar cliente para editar | Implementado | O submenu Editar torna as linhas selecionáveis. |
| Confirmar alteração | Pendente | O salvamento é imediato. |
| Selecionar cliente para excluir | Implementado | O submenu Excluir torna as linhas selecionáveis. |
| Confirmar e validar senha na exclusão | Parcial | Há confirmação, mas nenhuma senha é solicitada. |

## Categorias (`TabelaCategorias`)

| Requisito | Estado | Observação |
| --- | --- | --- |
| Campos: código imutável e descrição obrigatória | Implementado | Descrição usa `required`. |
| Listar, incluir e editar | Implementado | Usa dados em memória. |
| Confirmar alteração | Pendente | Não há confirmação. |
| Excluir com confirmação e senha | Parcial | Confirma, mas não valida senha. |

## Itens/produtos (`TabelaItensProdutos`)

Campos pretendidos: código imutável, categoria, nome, descrição, valor de venda, data de cadastro e status.

| Requisito | Estado | Observação |
| --- | --- | --- |
| Listar produtos | Parcial | Não exibe descrição nem data de cadastro. |
| Incluir produto | Parcial | O formulário possui os principais campos, mas o registro salvo não corresponde às colunas exibidas. |
| Validar categoria, descrição, valor e status | Parcial | Inputs usam `required`; selects sempre possuem uma opção fixa. |
| Editar e carregar dados | Parcial | Existe, mas campos e formato da linha ficam desalinhados. |
| Confirmar alteração | Pendente | Não há confirmação. |
| Excluir com confirmação e senha | Parcial | Confirma, mas não valida senha. |

## Orçamentos (`TabelaOrçamento`)

Campos pretendidos: código imutável, cliente e seu código, data automática e imutável, validade e valor total calculado.

| Requisito | Estado | Observação |
| --- | --- | --- |
| Listar orçamentos | Implementado | Usa um registro demonstrativo. |
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
| Segurança de exclusão | Pendente | Sem autenticação ou autorização real. |

## Critério de atualização

Sempre que um requisito for implementado ou seu comportamento mudar, atualize a respectiva linha, observação e campos relacionados. Novos requisitos devem ser incluídos aqui e, quando afetarem a arquitetura ou a execução, também em `ARCHITECTURE.md` e `README.md`.
