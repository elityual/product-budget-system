import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const tables = `
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key);
  insert into auth.users values ('33333333-3333-4333-8333-333333333333');
  create table public.cliente(codigo bigint primary key, user_id uuid not null references auth.users(id));
  create table public.categoria(codigo bigint primary key, user_id uuid not null references auth.users(id));
  create table public.produto(codigo bigint primary key, user_id uuid not null references auth.users(id));
  create table public.orcamento(codigo bigint primary key, user_id uuid not null references auth.users(id));
  create table public.item_orcamento(orcamento_codigo bigint, produto_codigo bigint, user_id uuid not null references auth.users(id), primary key(orcamento_codigo,produto_codigo));
  create table public.cliente_contato(cliente_codigo bigint primary key, user_id uuid not null references auth.users(id));
  create table public.cliente_telefone(codigo bigint primary key, user_id uuid not null references auth.users(id));
  create table public.cliente_endereco(codigo bigint primary key, user_id uuid not null references auth.users(id));
  insert into public.cliente values (1,'33333333-3333-4333-8333-333333333333');
  insert into public.categoria values (2,'33333333-3333-4333-8333-333333333333');
  insert into public.produto values (3,'33333333-3333-4333-8333-333333333333');
  insert into public.orcamento values (4,'33333333-3333-4333-8333-333333333333');
  insert into public.item_orcamento values (4,3,'33333333-3333-4333-8333-333333333333');
  insert into public.cliente_contato values (1,'33333333-3333-4333-8333-333333333333');
  insert into public.cliente_telefone values (5,'33333333-3333-4333-8333-333333333333');
  insert into public.cliente_endereco values (6,'33333333-3333-4333-8333-333333333333');`;

test('removes supported legacy user_id columns and archives their values', async () => {
  const db = new PGlite();
  const migration = await readFile(new URL('../../supabase/migrations/202609090003_remove_legacy_commercial_user_id.sql', import.meta.url), 'utf8');
  try {
    await db.exec(tables);
    await db.exec(migration);
    await db.exec(migration);
    const remaining = await db.query(`select count(*)::int as count from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('cliente','categoria','produto','orcamento','item_orcamento','cliente_contato','cliente_telefone','cliente_endereco') and a.attname='user_id' and not a.attisdropped`);
    assert.equal(remaining.rows[0].count, 0);
    const backup = await db.query('select table_name,record_key,user_id from public.atlas_legacy_user_id_backup order by table_name');
    assert.equal(backup.rows.length, 8);
    assert.deepEqual(backup.rows.find((row) => row.table_name === 'item_orcamento').record_key, { orcamento_codigo: 4, produto_codigo: 3 });
    assert.equal(backup.rows.every((row) => row.user_id === '33333333-3333-4333-8333-333333333333'), true);
  } finally { await db.close(); }
});

test('rolls back without archiving when user_id has an unsupported dependency', async () => {
  const db = new PGlite();
  const migration = await readFile(new URL('../../supabase/migrations/202609090003_remove_legacy_commercial_user_id.sql', import.meta.url), 'utf8');
  try {
    await db.exec(tables);
    await db.exec('alter table public.produto add constraint produto_user_id_unico unique(user_id)');
    await assert.rejects(() => db.exec(migration), /constraint não suportada/);
    await db.exec('rollback');
    const column = await db.query("select 1 from pg_attribute where attrelid='public.produto'::regclass and attname='user_id' and not attisdropped");
    assert.equal(column.rows.length, 1);
    const archive = await db.query("select to_regclass('public.atlas_legacy_user_id_backup') as table_name");
    assert.equal(archive.rows[0].table_name, null);
  } finally { await db.close(); }
});

test('rolls back before archiving when another table references a commercial user_id', async () => {
  const db = new PGlite();
  const migration = await readFile(new URL('../../supabase/migrations/202609090003_remove_legacy_commercial_user_id.sql', import.meta.url), 'utf8');
  try {
    await db.exec(tables);
    await db.exec('alter table public.cliente add constraint cliente_user_id_unico unique(user_id); create table public.auditoria_cliente(cliente_user_id uuid references public.cliente(user_id));');
    await assert.rejects(() => db.exec(migration), /outra tabela referencia/);
    await db.exec('rollback');
    const archive = await db.query("select to_regclass('public.atlas_legacy_user_id_backup') as table_name");
    assert.equal(archive.rows[0].table_name, null);
  } finally { await db.close(); }
});
