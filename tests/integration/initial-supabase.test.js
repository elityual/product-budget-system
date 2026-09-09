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
    await db.exec(await readFile(new URL('../../supabase/migrations/202609080001_initial.sql', import.meta.url), 'utf8'));
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
    // Aplicação corretiva sobre banco populado preserva dados e ACLs das funções.
    const beforeUpgrade = (await db.query('select * from public.atlas_load_workspace()')).rows[0];
    await db.exec('reset role');
    const aclQuery = "select proname,proacl::text from pg_proc where pronamespace='public'::regnamespace and proname in ('atlas_save_workspace','atlas_approve_budget') order by proname";
    const beforeAcl = (await db.query(aclQuery)).rows;
    const correction = await readFile(new URL('../../supabase/migrations/202609080002_safe_workspace_writes.sql', import.meta.url), 'utf8');
    await db.exec(correction);
    await db.exec(correction);
    const contactsMigration = await readFile(new URL('../../supabase/migrations/202609090001_quotation_details.sql', import.meta.url), 'utf8');
    await db.exec(contactsMigration);
    await db.exec(contactsMigration);
    assert.deepEqual((await db.query(aclQuery)).rows, beforeAcl);
    await db.exec('set role authenticated');
    const upgraded = (await db.query('select * from public.atlas_load_workspace()')).rows[0];
    assert.deepEqual(upgraded.payload.clientes, beforeUpgrade.payload.clientes);
    assert.deepEqual(upgraded.payload.contatosClientes, []);
    const save = async (revision, value) => (await db.query('select public.atlas_save_workspace($1,$2::jsonb) as result', [revision, JSON.stringify(value)])).rows[0].result;
    const withClient = structuredClone(upgraded.payload);
    withClient.contatosClientes = [[1, 'compras@cliente.test', 'Ana Compradora']];
    withClient.telefonesClientes = [[null, 1, '(11) 99999-0000', true]];
    withClient.enderecosClientes = [[null, 1, '01001-000', 'Praça da Sé', '1', '', 'Sé', 'São Paulo', 'SP', '', true]];
    withClient.clientes.push([null, 'Pessoa Física', '529.982.247-25', 'Cliente novo']);
    withClient.novoClienteContato = { email: 'novo@cliente.test', pessoa: '', telefones: ['(11) 98888-0000'] };
    result = await save(2, withClient);
    assert.deepEqual(result.payload.itensOrcamento, upgraded.payload.itensOrcamento);
    assert.deepEqual(result.payload.orcamentos, upgraded.payload.orcamentos);
    assert.deepEqual(result.approved_codes, [1]);
    assert.equal(result.payload.contatosClientes[0][2], 'Ana Compradora');
    assert.equal(result.payload.telefonesClientes[0][2], '(11) 99999-0000');
    assert.deepEqual(result.payload.contatosClientes[1], [2, 'novo@cliente.test', '']);
    result.payload.clientes[1][3] = 'Cliente editado';
    result = await save(3, result.payload);
    assert.equal(result.payload.clientes[1][3], 'Cliente editado');
    const beforeFailure = (await db.query('select * from public.atlas_load_workspace()')).rows[0];
    const invalid = structuredClone(result.payload);
    invalid.itensOrcamento[0][1] = 999999;
    await assert.rejects(() => save(4, invalid));
    assert.deepEqual((await db.query('select * from public.atlas_load_workspace()')).rows[0], beforeFailure);
    const withoutBudget = structuredClone(result.payload);
    withoutBudget.orcamentos = []; withoutBudget.itensOrcamento = [];
    result = await save(4, withoutBudget);
    assert.deepEqual(result.payload.orcamentos, []);
    assert.deepEqual(result.payload.itensOrcamento, []);
    assert.equal(result.payload.clientes.length, 2);
    await db.exec("reset role; set role anon; select set_config('request.jwt.claims','{}',false);");
    await assert.rejects(() => db.query('select * from public.atlas_load_workspace()'));
  } finally { await db.close(); }
});

test('RPCs usam WHERE em DELETE e UPDATE em todas as migrações', async () => {
  for (const name of ['202609080001_initial.sql', '202609080002_safe_workspace_writes.sql', '202609090001_quotation_details.sql']) {
    const sql = await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
    const statements = sql.match(/\b(?:delete\s+from|update\s+public\.)[^;]+;/gi) || [];
    assert.ok(statements.length >= 1);
    for (const statement of statements) assert.match(statement, /\bwhere\b/i, `${name}: ${statement}`);
  }
});

test('cliente novo pode ser salvo sozinho em banco vazio', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select '33333333-3333-4333-8333-333333333333'::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
      grant usage on schema auth to anon,authenticated;`);
    await db.exec(await readFile(new URL('../../supabase/migrations/202609080001_initial.sql', import.meta.url), 'utf8'));
    await db.exec('set role authenticated');
    const payload = { clientes: [[null, 'Pessoa Física', '529.982.247-25', 'Primeiro cliente']], categorias: [], itens: [], orcamentos: [], itensOrcamento: [] };
    const result = (await db.query('select public.atlas_save_workspace(0,$1::jsonb) as result', [JSON.stringify(payload)])).rows[0].result;
    assert.equal(result.revision, 1);
    assert.deepEqual(result.payload.clientes, [[1, 'Pessoa Física', '529.982.247-25', 'Primeiro cliente']]);
    assert.deepEqual(result.payload.itensOrcamento, []);
  } finally { await db.close(); }
});
