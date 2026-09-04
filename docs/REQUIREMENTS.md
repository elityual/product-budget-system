# Requisitos funcionais

> Última revisão técnica: 4 de setembro de 2026.

Este documento consolida as anotações de `docs/ideas.text` e registra o estado observado no código atual. Os marcadores significam:

- **Implementado**: existe no protótipo atual.
- **Parcial**: existe, mas não cumpre todas as regras descritas.
- **Pendente**: ainda não existe.

## Clientes (`TabelaCliente`)

| Requisito | Estado | Observação |
| --- | --- | --- |
| Campos: código imutável, tipo, CPF/CNPJ e nome | Implementado | O código é numérico e sem prefixo; tipo usa dropdown sem pesquisa restrito a Pessoa Física/Jurídica; CPF/CNPJ e nome usam `required`. |
| Listar e pesquisar clientes | Implementado | A pesquisa segue o padrão visual de Produtos, considera todas as colunas e combina com o dropdown genérico de tipo de cliente. |
| Exibir orientação correspondente à operação | Implementado | Listar e incluir possuem título e descrição próprios. |
| Incluir cliente | Implementado | O código numérico é criado no navegador a partir do maior código existente. |
| Retornar à lista após incluir ou cancelar | Implementado | Fechar o formulário iniciado pelo submenu restaura Listar clientes. |
| Selecionar e carregar cliente para editar | Implementado | Cada linha da listagem possui um botão de edição. |
| Confirmar alteração | Implementado | A edição solicita confirmação antes de modificar os dados do cliente. |
| Selecionar cliente para excluir | Implementado | Cada linha da listagem possui um botão de exclusão. |
| Confirmar e validar senha na exclusão | Parcial | Há confirmação, mas nenhuma senha é solicitada. |

## Categorias (`TabelaCategorias`)

| Requisito | Estado | Observação |
| --- | --- | --- |
| Campos: código imutável e descrição obrigatória | Implementado | O código é numérico e sem prefixo; descrição usa `required` e a listagem utiliza pesquisa textual. |
| Listar, incluir e editar | Implementado | Usa dados em memória. |
| Confirmar alteração | Implementado | A edição solicita confirmação antes de modificar a descrição da categoria. |
| Excluir com confirmação e senha | Parcial | Confirma, mas não valida senha. |

## Itens/produtos (`TabelaItensProdutos`)

Campos pretendidos: código numérico imutável e sem prefixo, categoria, nome, descrição, valor de venda, data de cadastro e status.

| Requisito | Estado | Observação |
| --- | --- | --- |
| Listar produtos | Implementado | A listagem exibe todos os campos previstos e formata o valor de venda e o status. |
| Pesquisar e filtrar produtos | Parcial | Pesquisa e filtros funcionam, mas escolher uma categoria no combobox só reaplica a tabela quando o campo perde o foco. |
| Incluir produto | Implementado | Os campos salvos correspondem às colunas exibidas e a data de cadastro é gerada automaticamente. |
| Validar categoria, descrição, valor e status | Implementado | Os campos obrigatórios impedem valores vazios; a categoria deve corresponder a uma categoria cadastrada e o status usa dropdown restrito a Ativo/Inativo. |
| Editar e carregar dados | Implementado | Os campos são carregados e permanecem alinhados com as colunas da tabela. |
| Confirmar alteração | Pendente | Não há confirmação. |
| Excluir com confirmação e senha | Parcial | Confirma, mas não valida senha. |

## Orçamentos (`TabelaOrçamento`)

Campos pretendidos: código numérico imutável e sem prefixo, cliente e seu código numérico, data automática e imutável, validade e valor total calculado.

| Requisito | Estado | Observação |
| --- | --- | --- |
| Listar orçamentos | Implementado | Registros demonstrativos, incluídos e editados possuem todas as colunas esperadas pela tabela. |
| Incluir orçamento | Implementado | O fluxo salva o orçamento e seus itens juntos em memória após validar os dados obrigatórios. |
| Selecionar cliente e informar validade | Implementado | A seleção usa uma lista pesquisável dos clientes atuais, armazena nome e código do cliente e exige a validade. |
| Selecionar itens e quantidades | Implementado | A segunda etapa lista nome, descrição e valor, pesquisa por nome/descrição, filtra por categoria e aceita somente dígitos nos campos de quantidade. |
| Exigir ao menos um item | Implementado | O salvamento é bloqueado até existir ao menos uma quantidade inteira maior que zero. |
| Gerar data e calcular valor total | Implementado | A data é automática; totais dos itens e do orçamento são calculados a partir de quantidade e valor unitário. |

## Itens de orçamento (`TabelaItensOrçamento`)

A estrutura contém código numérico do orçamento, código numérico e nome do produto, quantidade, valor unitário e valor total do item (`quantidade × valor unitário`).

| Requisito | Estado | Observação |
| --- | --- | --- |
| Acessar pelo submenu de Orçamentos | Implementado | “Itens do orçamento” abre uma página própria de consulta. |
| Listar os campos da tabela | Implementado | A tabela demonstrativa exibe código do orçamento, código e nome do produto, quantidade, valor unitário e total do item. |
| Pesquisar e paginar itens | Implementado | Reutiliza a pesquisa textual e a paginação de até 10 registros. |
| Relacionar itens ao orçamento | Implementado | Cada item recebe o mesmo código numérico do orçamento criado; a persistência continua limitada à sessão. |
| Incluir itens pelo fluxo do orçamento | Implementado | Produtos com quantidade inteira positiva geram linhas em `itensOrcamento`; quantidades inválidas são descartadas também pela regra de dados. |
| Calcular e persistir o total | Implementado | Cada total é `quantidade × valor unitário` e a soma é armazenada no orçamento durante a sessão. |

## Requisitos transversais

| Requisito | Estado | Observação |
| --- | --- | --- |
| Persistência via Supabase | Pendente | Não há cliente, configuração ou consultas. |
| Sair do sistema | Parcial | Apenas exibe um alerta; não existe sessão. |
| Responsividade | Parcial | Há breakpoint móvel, mas o menu fica indisponível em telas pequenas. |
| Pesquisa e filtros padronizados | Implementado | Todas as listagens reutilizam a pesquisa visual de Produtos; filtros contextuais usam combobox ou dropdown genérico. |
| Paginação das tabelas | Implementado | Todas as listagens exibem no máximo 10 registros por página e oferecem navegação para a página anterior ou seguinte. |
| Renderização segura de dados | Implementado | Conteúdo textual é escapado nas tabelas e inserido com `textContent` nas listas dinâmicas. |
| Indicação visual de seleção | Implementado | Campos e listas selecionáveis destacam categoria, cliente ou produto escolhido sem alterar as regras de negócio. |
| Segurança de exclusão | Pendente | Sem autenticação ou autorização real. |

## Critério de atualização

Sempre que um requisito for implementado ou seu comportamento mudar, atualize a respectiva linha, observação e campos relacionados. Novos requisitos devem ser incluídos aqui e, quando afetarem a arquitetura ou a execução, também em `ARCHITECTURE.md` e `README.md`.

Defeitos técnicos, riscos e limitações de implementação são acompanhados separadamente em [`ISSUES.md`](ISSUES.md).
