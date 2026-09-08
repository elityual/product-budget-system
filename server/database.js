import { mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

export async function openDatabase(config) {
  await mkdir(config.dataRoot, { recursive: true });
  const db = new DatabaseSync(config.databasePath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS atlas_meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    INSERT INTO atlas_meta(chave, valor) VALUES ('revision', '0') ON CONFLICT(chave) DO NOTHING;
    INSERT INTO atlas_meta(chave, valor) VALUES ('empresa', 'Atlas Máquinas & Obras') ON CONFLICT(chave) DO NOTHING;
    CREATE TABLE IF NOT EXISTS cliente (
      codigo INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, documento TEXT NOT NULL CHECK(trim(documento) <> ''), nome TEXT NOT NULL CHECK(trim(nome) <> '')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS cliente_documento_unico ON cliente(upper(replace(replace(replace(replace(replace(replace(documento,'.',''),'-',''),'/',''),'(',''),')',''),' ','')));
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
  return db;
}

export function closeDatabase(db) {
  db.close();
}
