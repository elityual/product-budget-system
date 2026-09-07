import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('migração inicial cria um Supabase vazio e aceita o contrato atual', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key, email text);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      insert into auth.users values ('33333333-3333-4333-8333-333333333333','admin@example.invalid');`);
    await db.exec(await readFile(new URL('../supabase/migrations/202609080001_initial.sql', import.meta.url), 'utf8'));
    await db.exec("set role authenticated; select set_config('request.jwt.claims','{\"sub\":\"33333333-3333-4333-8333-333333333333\"}',false);");
    let result = (await db.query('select * from public.atlas_load_workspace()')).rows[0];
    assert.deepEqual(result.payload, { clientes: [], categorias: [], itens: [], orcamentos: [], itensOrcamento: [] });
    const payload = { clientes: [[null, 'Pessoa Jurídica', '11.222.333/0001-81', 'Cliente']], categorias: [[null, 'Materiais']], itens: [[null, 'Materiais', 'Cimento', 'Saco', 42.9, '01/01/1900', 'Ativo']], orcamentos: [[null, 1, 'Cliente', '01/01/1900', '31/12/2026', 0]], itensOrcamento: [[null, 1, 'Cimento', 2, 42.9, 0]] };
    result = (await db.query('select public.atlas_save_workspace(0,$1::jsonb) as result', [JSON.stringify(payload)])).rows[0].result;
    assert.equal(result.payload.orcamentos[0][5], 85.8);
    assert.equal(result.payload.orcamentos[0][1], 1);
    assert.deepEqual(result.approved_codes, []);
    await assert.rejects(() => db.query('select public.atlas_save_workspace(1,$1::jsonb) as result', [JSON.stringify({ ...payload, clientes: [] })]));
    assert.equal((await db.query('select * from public.atlas_load_workspace()')).rows[0].payload.clientes.length, 1);
    result = (await db.query('select public.atlas_approve_budget(1,1) as result')).rows[0].result;
    assert.deepEqual(result.approved_codes, [1]);
    assert.equal(result.revision, 2);
    assert.equal((await db.query('select public.atlas_save_workspace(1,$1::jsonb) as result', [JSON.stringify(payload)])).rows[0].result, null);
    await db.exec("reset role; set role anon; select set_config('request.jwt.claims','{}',false);");
    await assert.rejects(() => db.query('select * from public.atlas_load_workspace()'));
  } finally { await db.close(); }
});
