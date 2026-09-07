import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { data as fixtures } from './fixtures/workspace-legacy.js';

const sqlFile = (path) => readFile(new URL(`../supabase/${path}`, import.meta.url), 'utf8');
const owner = '33333333-3333-4333-8333-333333333333';

test('migrações e CRUD relacional em PostgreSQL local', async (t) => {
  const db = new PGlite();
  try {
    // Only the Supabase Auth context is simulated; tables, SQL, RLS and FKs are real.
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, email text);
      create function auth.jwt() returns jsonb language sql stable as
        $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      create function auth.uid() returns uuid language sql stable as
        $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      insert into auth.users values ('${owner}','fixture@example.invalid');
    `);
    const login = async (id = owner) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, role: 'authenticated' })]);
    };
    const save = async (revision, payload) => (await db.query(
      'select public.atlas_save_workspace($1,$2::jsonb) as result', [revision, JSON.stringify(payload)]
    )).rows[0].result;
    const load = async () => (await db.query('select * from public.atlas_load_workspace()')).rows[0];

    await db.exec(await sqlFile('migrations/202609060001_workspaces.sql'));
    await login();
    await save(0, fixtures);
    await db.exec('reset role');
    for (const name of ['202609060002_cliente.sql', '202609060003_cliente_identity.sql', '202609060004_relational_tables.sql']) {
      try { await db.exec(await sqlFile(`migrations/${name}`)); }
      catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }); }
    }
    await login();

    await t.test('preserva dados antigos e esvazia JSON após transferir para tabelas', async () => {
      assert.deepEqual((await load()).payload, fixtures);
      const rows = await db.query('select payload from public.atlas_workspaces');
      assert.ok(Object.values(rows.rows[0].payload).every((collection) => collection.length === 0));
      for (const table of ['cliente','categoria','produto','orcamento','item_orcamento']) {
        assert.ok((await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n > 0);
      }
    });

    await t.test('códigos SQL, edição, datas imutáveis e orçamento/itens atômicos', async () => {
      let state = await load();
      state.payload.categorias.push([null, 'Categoria SQL']);
      let saved = await save(state.revision, state.payload);
      const category = saved.payload.categorias.at(-1);
      assert.ok(category[0] > 2);
      saved.payload.itens.push([null, 'Categoria SQL', 'Produto SQL', 'Descrição SQL', 10.50, '01/01/1900', 'Ativo']);
      saved = await save(saved.revision, saved.payload);
      const product = structuredClone(saved.payload.itens.at(-1));
      assert.ok(product[0] > 2);
      assert.notEqual(product[5], '01/01/1900');
      saved.payload.orcamentos.push([null, fixtures.clientes[0][3], 1, '01/01/1900', '31/12/2026', 999]);
      saved.payload.itensOrcamento.push([null, product[0], product[2], 3, 10.5, 999]);
      saved = await save(saved.revision, saved.payload);
      const budget = structuredClone(saved.payload.orcamentos.at(-1));
      assert.ok(budget[0] > 102);
      assert.equal(budget[5], 31.5);
      assert.equal(saved.payload.itensOrcamento.at(-1)[0], budget[0]);
      assert.equal(saved.payload.itensOrcamento.at(-1)[5], 31.5);
      assert.notEqual(budget[3], '01/01/1900');
      saved.payload.categorias.at(-1)[1] = 'Categoria renomeada';
      saved.payload.itens.at(-1)[1] = 'Categoria renomeada';
      saved.payload.itens.at(-1)[5] = '01/01/1900';
      saved.payload.orcamentos.at(-1)[3] = '01/01/1900';
      saved = await save(saved.revision, saved.payload);
      assert.equal(saved.payload.itens.at(-1)[5], product[5]);
      assert.equal(saved.payload.orcamentos.at(-1)[3], budget[3]);
      assert.equal(saved.payload.itens.at(-1)[1], 'Categoria renomeada');
      saved.payload.orcamentos = saved.payload.orcamentos.filter((row) => row[0] !== budget[0]);
      saved.payload.itensOrcamento = saved.payload.itensOrcamento.filter((row) => row[0] !== budget[0]);
      saved = await save(saved.revision, saved.payload);
      saved.payload.itens = saved.payload.itens.filter((row) => row[0] !== product[0]);
      saved.payload.categorias = saved.payload.categorias.filter((row) => row[0] !== category[0]);
      saved = await save(saved.revision, saved.payload);
      assert.deepEqual(saved.payload, fixtures);
    });

    await t.test('FKs e revisão impedem órfãos e gravação parcial', async () => {
      const previous = await load();
      const invalid = structuredClone(previous.payload);
      invalid.itens = invalid.itens.slice(1);
      await assert.rejects(save(previous.revision, invalid), /foreign key/i);
      assert.deepEqual(await load(), previous);
      const forged = structuredClone(previous.payload);
      forged.categorias.push([999999, 'Código manual']);
      await assert.rejects(save(previous.revision, forged), /generated by SQL/);
      assert.deepEqual(await load(), previous);
      assert.equal(await save(previous.revision - 1, previous.payload), null);
      assert.deepEqual(await load(), previous);
    });

    await t.test('testes SQL de autorização e identidade de clientes', async () => {
      await db.exec('reset role');
      await db.exec(await sqlFile('tests/authorization_legacy.sql'));
      await login();
    });

    await t.test('outra conta e anônimo não acessam as novas tabelas', async () => {
      await login('44444444-4444-4444-8444-444444444444');
      for (const table of ['categoria','produto','orcamento','item_orcamento']) {
        assert.equal((await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n, 0);
        await assert.rejects(db.exec(`delete from public.${table}`), /permission denied/);
      }
      await assert.rejects(db.query('select public.atlas_save_clients_internal(0,$1::jsonb)', [JSON.stringify(fixtures)]), /permission denied/);
      await db.exec('set role anon');
      for (const table of ['categoria','produto','orcamento','item_orcamento']) {
        await assert.rejects(db.exec(`select * from public.${table}`), /permission denied/);
      }
    });
  } finally {
    await db.close();
  }
});
