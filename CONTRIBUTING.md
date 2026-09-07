# Contribuição

Use Node.js 24 ou superior. Instale as dependências com `npm ci` e execute `npm run check` e `npm test` antes de enviar uma alteração. Os testes de navegador exigem um navegador instalado pelo Playwright ou o canal `msedge`. Para revisar o arquivo distribuído, execute `npm run package:source`.

O servidor local inicia em `127.0.0.1:8765` e mantém dados fora do repositório. Nunca adicione bancos SQLite, backups, arquivos `.env`, tokens, senhas, URLs de projetos reais ou dados pessoais. Para testar Supabase, use o simulador em `e2e/helpers/backend.js` ou um projeto descartável.

Comentários próprios, mensagens de erro e documentação devem permanecer em português do Brasil. Preserve o contrato atual das coleções, especialmente a ordem de `orcamentos`: `[codigo, clienteCodigo, clienteNome, data, validade, total]`.

O pacote de fontes é criado somente com a lista implícita de arquivos do repositório; confirme que nenhum banco, backup, cache, credencial ou dado pessoal entrou em `release/` antes de compartilhar o arquivo.

Alterações de esquema do Supabase devem partir da instalação inicial para uma nova migração numerada. Atualize `README.md`, `docs/ARCHITECTURE.md` e `docs/REQUIREMENTS.md` no mesmo conjunto de mudanças. Não execute a carga de exemplo em bancos com dados reais.
