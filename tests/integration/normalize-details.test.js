import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { createConfig } from '../../server/config.js';
import { closeDatabase, openDatabase } from '../../server/database.js';
import { loadWorkspace } from '../../server/workspace.js';

const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const details = { pagamento: '30 dias', entrega: '10 dias', localEntrega: 'Obra', observacoes: 'Texto', company: { nome: 'Empresa histórica', cnpj: '12', endereco: 'Rua A', telefone: '11', email: 'empresa@test' }, client: { tipo: 'Pessoa Jurídica', documento: '34', nome: 'Cliente histórico', email: 'cliente@test', contato: 'Ana', telefone: '22', endereco: 'Rua B' } };

test('Supabase normaliza detalhes, preserva payload e permite reaplicação', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$; grant usage on schema auth to anon,authenticated;
      insert into auth.users values('33333333-3333-4333-8333-333333333333','admin@test');`);
    await db.exec(await migration('202609080001_initial.sql'));
    await db.exec(await migration('202609090001_quotation_details.sql'));
    await db.query("insert into public.cliente(tipo,documento,nome,detalhes) values('Pessoa Jurídica','11.222.333/0001-81','Cliente atual',$1::jsonb)", [JSON.stringify({ email: 'legacy@example.test', contato: 'Ana', telefone: '9999', endereco: 'Endereço livre' })]);
    await db.query("insert into public.orcamento(cliente_codigo,validade,detalhes) values(1,'2026-12-31',$1::jsonb)", [JSON.stringify(details)]);
    await db.exec("insert into public.categoria(descricao) values('Categoria'); insert into public.produto(categoria_codigo,nome,descricao,valor_venda,status) values(1,'Produto','Descrição',10,'Ativo'); insert into public.item_orcamento(orcamento_codigo,produto_codigo,produto_nome,quantidade,valor_unitario) values(1,1,'Produto',1,10);");

    const normalize = await migration('202609090006_normalize_details.sql');
    await db.exec(normalize); await db.exec(normalize);
    const columns = await db.query("select c.relname,a.attname from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and c.relname in ('cliente','orcamento') and a.attname='detalhes' and not a.attisdropped");
    assert.equal(columns.rows.length, 0);
    assert.equal((await db.query('select count(*)::int count from public.orcamento_informacao')).rows[0].count, 1);

    await db.exec("set role authenticated; select set_config('request.jwt.claims','{\"sub\":\"33333333-3333-4333-8333-333333333333\"}',false);");
    const loaded = (await db.query('select * from public.atlas_load_workspace()')).rows[0];
    assert.deepEqual(loaded.payload.orcamentos[0][6], details);
    assert.deepEqual(loaded.payload.contatosClientes[0], [1, 'legacy@example.test', 'Ana']);
    const changed = structuredClone(loaded.payload);
    changed.orcamentos[0][6].pagamento = 'À vista';
    const saved = (await db.query('select public.atlas_save_workspace(0,$1::jsonb) result', [JSON.stringify(changed)])).rows[0].result;
    assert.equal(saved.payload.orcamentos[0][6].pagamento, 'À vista');
    assert.equal((await db.query('select pagamento from public.orcamento_informacao where orcamento_codigo=1')).rows[0].pagamento, 'À vista');
    const approved = (await db.query('select public.atlas_approve_budget(1,1) result')).rows[0].result;
    assert.deepEqual(approved.approved_codes, [1]);
  } finally { await db.close(); }
});

test('SQLite normaliza detalhes legados sem alterar o contrato do workspace', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-details-'));
  const config = createConfig({ ...process.env, ATLAS_DATA_DIR: directory, PORT: '0' });
  const legacy = new DatabaseSync(config.databasePath);
  try {
    legacy.exec(`PRAGMA foreign_keys=ON; create table cliente(codigo integer primary key autoincrement,tipo text not null,documento text not null,nome text not null,detalhes text not null default '{}');
      create table orcamento(codigo integer primary key autoincrement,cliente_codigo integer not null references cliente(codigo),data_emissao text not null,validade text not null,aprovado integer not null default 0,detalhes text not null default '{}');
      insert into cliente(tipo,documento,nome,detalhes) values('Pessoa Jurídica','11.222.333/0001-81','Cliente atual','{"email":"legacy@example.test","contato":"Ana","telefone":"9999","endereco":"Endereço livre"}');`);
    legacy.prepare('insert into orcamento(cliente_codigo,data_emissao,validade,detalhes) values(?,?,?,?)').run(1, '01/01/2026', '31/12/2026', JSON.stringify(details));
  } finally { legacy.close(); }
  const db = await openDatabase(config);
  try {
    assert.equal(db.prepare("select count(*) count from pragma_table_info('cliente') where name='detalhes'").get().count, 0);
    assert.equal(db.prepare("select count(*) count from pragma_table_info('orcamento') where name='detalhes'").get().count, 0);
    assert.deepEqual(loadWorkspace(db).payload.orcamentos[0][6], details);
    assert.deepEqual(loadWorkspace(db).payload.contatosClientes[0], [1, 'legacy@example.test', 'Ana']);
  } finally { closeDatabase(db); await rm(directory, { recursive: true, force: true }); }
});
