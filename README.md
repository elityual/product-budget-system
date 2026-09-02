# Product and Budget Control System

Protótipo de um sistema de gestão comercial para a **Atlas Máquinas & Obras**. A interface permite navegar entre clientes, categorias, produtos e orçamentos, pesquisar registros e simular operações de cadastro, edição e exclusão.

> Estado atual: protótipo front-end. Os dados são demonstrativos, ficam apenas na memória do navegador e são perdidos ao recarregar a página. A integração com Supabase descrita nos requisitos ainda não foi implementada.

## Como executar

O projeto não possui dependências, compilação ou instalação.

1. Clone ou baixe o repositório.
2. Abra `index.html` em um navegador moderno.

Também é possível servir a pasta com qualquer servidor HTTP estático. Por exemplo, com Python instalado:

```bash
python -m http.server 8000
```

Depois, acesse `http://localhost:8000/`.

## Funcionalidades atuais

- Navegação entre Clientes, Categorias, Itens/Produtos e Orçamentos.
- Submenus exibidos de acordo com a área selecionada.
- Títulos e instruções da área de clientes adaptados à operação selecionada.
- Retorno automático para Listar clientes depois de salvar ou cancelar uma inclusão.
- Pesquisa textual sobre todas as colunas da página atual.
- Formulário modal reutilizado para incluir e editar registros.
- Exclusão com confirmação simples do navegador.
- Geração local de códigos com os prefixos `CLI-`, `CAT-`, `PRD-` e `ORC-`.
- Indicação visual do status ativo/inativo dos produtos.
- Layout adaptado para telas de até 760 px.

## Limitações conhecidas

- Não há banco de dados, autenticação, API ou persistência local.
- A integração planejada com Supabase ainda não existe.
- A senha mencionada na confirmação de exclusão não é solicitada nem validada.
- Alterações não pedem confirmação antes de salvar.
- O fluxo completo de orçamento (seleção de itens, quantidades e totais) ainda não existe.
- Os selects de clientes e categorias usam opções fixas, não os registros em memória.
- Novos códigos são baseados no tamanho do array; após exclusões, isso pode gerar códigos repetidos.
- Campos e linhas ainda não representam todos os atributos definidos nos requisitos.
- Não existem testes automatizados, lint ou pipeline de CI.
- A data exibida no cabeçalho é fixa (`01 de setembro de 2026`).

## Estrutura do repositório

```text
.
├── AGENTS.md              # Regra para manter a documentação sincronizada
├── index.html             # Página principal da aplicação
├── LICENSE                # Licença do repositório
├── README.md              # Visão geral, execução e estado do projeto
├── assets/
│   ├── css/
│   │   └── menu.css       # Tema, layout, tabelas, modal e responsividade
│   └── js/
│       └── menu.js        # Dados, metadados, renderização e eventos
├── docs/
│   ├── ARCHITECTURE.md    # Organização técnica e fluxo da aplicação
│   ├── ideas.text         # Anotações originais de requisitos
│   └── REQUIREMENTS.md    # Requisitos funcionais e estado de implementação
└── (sem dependências geradas ou arquivos de build)
```

## Modelo de dados atual

Os dados ficam no objeto `data`, em `assets/js/menu.js`, como arrays posicionais:

| Coleção | Formato atual |
| --- | --- |
| `clientes` | código, tipo, CPF/CNPJ, nome |
| `categorias` | código, descrição |
| `itens` | código, categoria, produto, valor de venda, status |
| `orcamentos` | código, cliente, data, validade, valor total |

Consulte [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) para o modelo pretendido e a diferença entre o que está implementado e o que falta.

## Manutenção

Ao alterar comportamento, estrutura, execução, dados ou requisitos, atualize a documentação no mesmo conjunto de mudanças. A política detalhada está em `AGENTS.md`.

## Documentação complementar

- [Arquitetura e fluxo interno](docs/ARCHITECTURE.md)
- [Requisitos e progresso de implementação](docs/REQUIREMENTS.md)
