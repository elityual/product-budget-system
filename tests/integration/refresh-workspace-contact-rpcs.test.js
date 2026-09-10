import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

test('atualização de RPC antiga salva contatos obrigatórios do cliente atomicamente', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key, email text);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      insert into auth.users values ('33333333-3333-4333-8333-333333333333','admin@example.invalid');`);
    await db.exec(await migration('202609080001_initial.sql'));
    await db.exec(await migration('202609090001_quotation_details.sql'));

    await db.exec(`create or replace function public.atlas_save_workspace(expected_revision bigint,new_payload jsonb)
      returns jsonb language plpgsql security definer set search_path='' as $$ begin return null; end; $$;`);
    const before = (await db.query("select pg_get_functiondef('public.atlas_save_workspace(bigint,jsonb)'::regprocedure) as source")).rows[0].source;
    assert.doesNotMatch(before, /novoClienteContato/);

    const refresh = await migration('202609090005_refresh_workspace_contact_rpcs.sql');
    await db.exec(refresh);
    await db.exec(refresh);
    const after = (await db.query("select pg_get_functiondef('public.atlas_save_workspace(bigint,jsonb)'::regprocedure) as source")).rows[0].source;
    assert.match(after, /novoClienteContato/);

    await db.exec("set role authenticated; select set_config('request.jwt.claims','{\"sub\":\"33333333-3333-4333-8333-333333333333\"}',false);");
    const save = async (revision, payload) => (await db.query(
      'select public.atlas_save_workspace($1,$2::jsonb) as result', [revision, JSON.stringify(payload)]
    )).rows[0].result;

    let payload = (await db.query('select * from public.atlas_load_workspace()')).rows[0].payload;
    payload.clientes.push([null, 'Pessoa Física', '529.982.247-25', 'Cliente CPF']);
    payload.novoClienteContato = { email: 'cpf@cliente.test', pessoa: '', telefones: ['(11) 99999-0001', '(11) 3333-0001'] };
    let result = await save(0, payload);
    assert.deepEqual(result.payload.contatosClientes, [[1, 'cpf@cliente.test', '']]);
    assert.deepEqual(result.payload.telefonesClientes.map((row) => [row[1], row[2], row[3]]), [
      [1, '(11) 99999-0001', true], [1, '(11) 3333-0001', false]
    ]);

    payload = structuredClone(result.payload);
    payload.clientes.push([null, 'Pessoa Jurídica', '11.222.333/0001-81', 'Cliente CNPJ']);
    payload.novoClienteContato = { email: 'pj@cliente.test', pessoa: 'Ana Compradora', telefones: ['(11) 99999-0002'] };
    result = await save(1, payload);
    assert.deepEqual(result.payload.contatosClientes[1], [2, 'pj@cliente.test', 'Ana Compradora']);

    const reloaded = (await db.query('select * from public.atlas_load_workspace()')).rows[0];
    assert.deepEqual(reloaded.payload, result.payload);
    for (const contact of [
      { email: 'inválido', pessoa: 'Ana', telefones: ['(11) 99999-0003'] },
      { email: 'pj-invalida@cliente.test', pessoa: 'Ana', telefones: [] },
      { email: 'pj-invalida@cliente.test', pessoa: '  ', telefones: ['(11) 99999-0003'] }
    ]) {
      const invalid = structuredClone(result.payload);
      invalid.clientes.push([null, 'Pessoa Jurídica', '45.723.174/0001-10', 'PJ inválida']);
      invalid.novoClienteContato = contact;
      await assert.rejects(() => save(2, invalid), /Contato obrigatório/);
      assert.deepEqual((await db.query('select * from public.atlas_load_workspace()')).rows[0], reloaded);
    }

    await db.exec("reset role; set role anon; select set_config('request.jwt.claims','{}',false);");
    await assert.rejects(() => db.query('select * from public.atlas_load_workspace()'));
  } finally { await db.close(); }
});
