import { mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

export async function openDatabase(config) {
  await mkdir(config.dataRoot, { recursive: true });
  const db = new DatabaseSync(config.databasePath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS atlas_meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    INSERT INTO atlas_meta(chave, valor) VALUES ('revision', '0') ON CONFLICT(chave) DO NOTHING;
    INSERT INTO atlas_meta(chave, valor) VALUES ('empresa', '{"nome":"Atlas Máquinas & Obras"}') ON CONFLICT(chave) DO NOTHING;
    CREATE TABLE IF NOT EXISTS cliente (
      codigo INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, documento TEXT NOT NULL CHECK(trim(documento) <> ''), nome TEXT NOT NULL CHECK(trim(nome) <> '')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS cliente_documento_unico ON cliente(upper(replace(replace(replace(replace(replace(replace(documento,'.',''),'-',''),'/',''),'(',''),')',''),' ','')));
    CREATE TABLE IF NOT EXISTS cliente_contato (cliente_codigo INTEGER PRIMARY KEY REFERENCES cliente(codigo) ON DELETE CASCADE, email TEXT NOT NULL DEFAULT '', pessoa_contato TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS cliente_telefone (codigo INTEGER PRIMARY KEY AUTOINCREMENT, cliente_codigo INTEGER NOT NULL REFERENCES cliente(codigo) ON DELETE CASCADE, telefone TEXT NOT NULL CHECK(trim(telefone)<>''), principal INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS cliente_endereco (codigo INTEGER PRIMARY KEY AUTOINCREMENT, cliente_codigo INTEGER NOT NULL REFERENCES cliente(codigo) ON DELETE CASCADE, cep TEXT NOT NULL DEFAULT '', logradouro TEXT NOT NULL DEFAULT '', numero TEXT NOT NULL DEFAULT '', complemento TEXT NOT NULL DEFAULT '', bairro TEXT NOT NULL DEFAULT '', cidade TEXT NOT NULL DEFAULT '', uf TEXT NOT NULL DEFAULT '', texto_legado TEXT NOT NULL DEFAULT '', principal INTEGER NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX IF NOT EXISTS cliente_telefone_principal_unico ON cliente_telefone(cliente_codigo) WHERE principal=1;
    CREATE UNIQUE INDEX IF NOT EXISTS cliente_endereco_principal_unico ON cliente_endereco(cliente_codigo) WHERE principal=1;
    CREATE TABLE IF NOT EXISTS categoria (codigo INTEGER PRIMARY KEY AUTOINCREMENT, descricao TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS categoria_descricao_unica ON categoria(lower(trim(descricao)));
    CREATE TABLE IF NOT EXISTS produto (
      codigo INTEGER PRIMARY KEY AUTOINCREMENT, categoria_codigo INTEGER NOT NULL REFERENCES categoria(codigo),
      nome TEXT NOT NULL, descricao TEXT NOT NULL, valor_venda INTEGER NOT NULL CHECK(valor_venda > 0),
      data_cadastro TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('Ativo','Inativo'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS produto_descricao_unica ON produto(lower(trim(descricao)));
    CREATE TABLE IF NOT EXISTS orcamento (
      codigo INTEGER PRIMARY KEY AUTOINCREMENT, cliente_codigo INTEGER NOT NULL REFERENCES cliente(codigo),
      data_emissao TEXT NOT NULL, validade TEXT NOT NULL, aprovado INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS item_orcamento (
      orcamento_codigo INTEGER NOT NULL REFERENCES orcamento(codigo) ON DELETE CASCADE,
      produto_codigo INTEGER NOT NULL REFERENCES produto(codigo), produto_nome TEXT NOT NULL,
      quantidade INTEGER NOT NULL CHECK(quantidade > 0), valor_unitario INTEGER NOT NULL CHECK(valor_unitario > 0),
      PRIMARY KEY (orcamento_codigo, produto_codigo)
    );
  `);
  for (const statement of [
    "ALTER TABLE cliente ADD COLUMN detalhes TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE orcamento ADD COLUMN detalhes TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE item_orcamento ADD COLUMN produto_descricao TEXT NOT NULL DEFAULT ''"
  ]) { try { db.exec(statement); } catch (error) { if (!/duplicate column/i.test(error.message)) throw error; } }
  const legacy = db.prepare("SELECT codigo,detalhes FROM cliente WHERE detalhes<>'{}'").all();
  for (const row of legacy) { let value; try { value = JSON.parse(row.detalhes); } catch { continue; }
    db.prepare('INSERT OR IGNORE INTO cliente_contato(cliente_codigo,email,pessoa_contato) VALUES(?,?,?)').run(row.codigo, value.email || '', value.contato || '');
    if (value.telefone) db.prepare('INSERT INTO cliente_telefone(cliente_codigo,telefone,principal) SELECT ?,?,1 WHERE NOT EXISTS(SELECT 1 FROM cliente_telefone WHERE cliente_codigo=?)').run(row.codigo, value.telefone, row.codigo);
    if (value.endereco) db.prepare("INSERT INTO cliente_endereco(cliente_codigo,texto_legado,principal) SELECT ?,?,1 WHERE NOT EXISTS(SELECT 1 FROM cliente_endereco WHERE cliente_codigo=?)").run(row.codigo, value.endereco, row.codigo);
  }
  return db;
}

export function closeDatabase(db) {
  db.close();
}
