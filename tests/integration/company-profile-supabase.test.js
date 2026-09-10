import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

test('Supabase migra o perfil para tabela própria e exige perfil completo', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$; grant usage on schema auth to anon,authenticated;
      insert into auth.users values('33333333-3333-4333-8333-333333333333','admin@test');`);
    await db.exec(await migration('202609080001_initial.sql'));
    await db.exec(await migration('202609090001_quotation_details.sql'));
    await db.query("update public.atlas_workspaces set empresa=$1::jsonb where user_id='00000000-0000-4000-8000-000000000001'", [JSON.stringify({ nome: 'Empresa', cnpj: '11.222.333/0001-81', endereco: 'Rua A', telefone: '11999990000', email: 'empresa@example.test' })]);
    await db.exec(await migration('202609090006_normalize_details.sql'));
    const profileMigration = await migration('202609090007_company_profile.sql');
    await db.exec(profileMigration); await db.exec(profileMigration);
    assert.equal((await db.query("select count(*)::int count from pg_attribute where attrelid='public.atlas_workspaces'::regclass and attname='empresa' and not attisdropped")).rows[0].count, 0);
    assert.equal((await db.query('select completo from public.empresa_perfil')).rows[0].completo, true);

    await db.exec("set role authenticated; select set_config('request.jwt.claims','{\"sub\":\"33333333-3333-4333-8333-333333333333\"}',false);");
    const loaded = (await db.query('select * from public.atlas_load_workspace()')).rows[0];
    assert.equal(loaded.payload.empresa.completo, true);
    await assert.rejects(() => db.query("select public.atlas_save_company($1::jsonb)", [JSON.stringify({ nome: 'Inválida', cnpj: '', endereco: '', telefone: '', email: '' })]));
    const saved = (await db.query("select public.atlas_save_company($1::jsonb) result", [JSON.stringify({ nome: 'Empresa nova', cnpj: '11.222.333/0001-81', endereco: 'Rua B', telefone: '1133334444', email: 'nova@example.test' })])).rows[0].result;
    assert.equal(saved.empresa.completo, true);
    assert.equal(saved.revision, 1);
    await db.exec("reset role; set role anon; select set_config('request.jwt.claims','{}',false);");
    await assert.rejects(() => db.query('select * from public.atlas_load_workspace()'));
  } finally { await db.close(); }
});
