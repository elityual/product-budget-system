import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { data as fixtures } from './fixtures/workspace.js';
import { data as legacyFixtures } from './fixtures/workspace-legacy.js';
const owner = '33333333-3333-4333-8333-333333333333';
const editor = '44444444-4444-4444-8444-444444444444';
const sql = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const seed = (name) => readFile(new URL(`../supabase/seeds/${name}`, import.meta.url), 'utf8');
async function setup(duplicate = false) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key, email text);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    insert into auth.users values ('${owner}','admin@example.invalid'),('${editor}','editor@example.invalid');`);
  const login = async (id, extra = {}) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub:id, ...extra })]);
  };
  const save = async ({ revision, payload }) => (await db.query('select public.atlas_save_workspace($1,$2::jsonb) as result', [revision,JSON.stringify(payload)])).rows[0].result;
  const load = async () => (await db.query('select * from public.atlas_load_workspace()')).rows[0];
  await db.exec(await sql('202609060001_workspaces.sql'));
  await login(owner); await save({revision:0,payload:legacyFixtures});
  await login(editor); await save({revision:0,payload:duplicate ? legacyFixtures : {...legacyFixtures,clientes:[],categorias:[[10,'Outra categoria']],itens:[],orcamentos:[],itensOrcamento:[]}});
  await db.exec('reset role');
  for (const name of ['202609060002_cliente.sql','202609060003_cliente_identity.sql','202609060004_relational_tables.sql']) await db.exec(await sql(name));
  return {db,login,save,load};
}
test('shared migration preserves accounts and enforces admin deletion on the server', async () => {
  const {db,login,save,load} = await setup();
  try {
    const priorRevision = (await db.query('select max(revision)::int as revision from public.atlas_workspaces')).rows[0].revision;
    await db.exec(await sql('202609060005_shared_access.sql'));
    assert.equal((await db.query('select revision::int from public.atlas_workspaces')).rows[0].revision, priorRevision + 1);
    await db.exec(await sql('202609060006_budget_permissions.sql'));
    await db.exec(await sql('202609060007_budget_approval.sql'));
    await db.exec(await sql('202609060008_budget_client_order.sql'));
    await db.exec(await readFile(new URL('../supabase/tests/authorization.sql', import.meta.url), 'utf8'));
    await db.exec(`insert into public.atlas_admins values ('${owner}')`);
    await login(editor);
    const original = await load();
    assert.equal(original.is_admin,false);
    assert.equal(original.payload.categorias.length,3);
    assert.deepEqual(original.payload.clientes,fixtures.clientes);
    assert.deepEqual(original.payload.orcamentos,fixtures.orcamentos);
    await login(owner);
    assert.deepEqual((await load()).payload,original.payload);
    assert.equal((await load()).is_admin,true);
    await login(editor, {user_metadata:{role:'admin'}});
    assert.equal((await load()).is_admin,false);
    await assert.rejects(db.exec(`insert into public.atlas_admins values ('${editor}')`),/permission denied/);
    for (const table of ['cliente','categoria','produto','orcamento','item_orcamento']) {
      await assert.rejects(db.exec(`delete from public.${table}`),/permission denied/);
    }
    for (const collection of ['clientes','categorias','itens']) {
      const attempt = structuredClone(original);
      attempt.payload[collection].pop();
      await assert.rejects(save(attempt),/Only administrators/);
      assert.deepEqual(await load(),original);
    }
    original.payload.clientes[0][3]='Shared edit';
    original.payload.categorias.push([null,'Shared category']);
    original.payload.itensOrcamento[0][3]=3;
    const saved = await save(original);
    assert.equal(saved.payload.orcamentos[0][5],487.7);
    assert.ok(saved.payload.categorias.at(-1)[0]>10);
    await login(owner);
    assert.equal((await load()).payload.clientes[0][3],'Shared edit');
    assert.equal(await save(original),null);
    await login(editor);
    const pendingApproval = await load();
    const approve = async (rev) => (await db.query('select public.atlas_approve_budget($1,102) as result',[rev])).rows[0].result;
    assert.deepEqual(pendingApproval.approved_codes,[]);
    assert.equal(await approve(pendingApproval.revision-1),null);
    const approved = await approve(pendingApproval.revision);
    assert.deepEqual(approved.approved_codes,[102]);
    await assert.rejects(approve(approved.revision),/already approved/);
    await login(owner);
    assert.deepEqual((await load()).approved_codes,[102]);
    await login(editor,{is_anonymous:true});
    await assert.rejects(approve(approved.revision),/Authentication required/);
    await login(editor);
    const removingItem = await load();
    removingItem.payload.itensOrcamento.pop();
    const itemRemoved = await save(removingItem);
    assert.equal(itemRemoved.payload.itensOrcamento.length, 1);
    assert.equal(itemRemoved.payload.orcamentos[0][5],128.7);
    const emptyBudget = await load();
    emptyBudget.payload.itensOrcamento=[];
    await assert.rejects(save(emptyBudget),/at least one item/);
    const deleting = await load();
    deleting.payload.orcamentos=[]; deleting.payload.itensOrcamento=[];
    const deleted=await save(deleting);
    assert.equal(deleted.payload.orcamentos.length,0);
    await login(editor,{is_anonymous:true});
    assert.equal(await load(),undefined);
    await assert.rejects(save(deleted),/Authentication required/);
    await db.exec('set role anon');
    await assert.rejects(load(),/permission denied/);
    await assert.rejects(save(deleted),/permission denied/);
    await db.exec('reset role');
    await db.exec(`delete from auth.users where id='${owner}'`);
    await login(editor);
    assert.deepEqual((await load()).payload,deleted.payload);
    await db.exec('reset role');
    await db.exec(await seed('reset_simple_data.sql'));
    await login(editor);
    const seeded = await load();
    assert.deepEqual(
      [seeded.payload.clientes.length,seeded.payload.categorias.length,seeded.payload.itens.length,seeded.payload.orcamentos.length,seeded.payload.itensOrcamento.length],
      [2,2,3,1,2]
    );
    assert.equal(seeded.payload.orcamentos[0][1],seeded.payload.clientes[0][0]);
    assert.equal(seeded.payload.orcamentos[0][5],444.8);
  } finally { await db.close(); }
});
test('shared migration aborts without losing data when legacy accounts have duplicate codes', async () => {
  const {db,login,load} = await setup(true);
  try {
    await assert.rejects(db.exec(await sql('202609060005_shared_access.sql')),/duplicate codes/);
    await db.exec('rollback');
    for (const id of [owner,editor]) {
      await login(id);
      assert.deepEqual((await load()).payload,legacyFixtures);
    }
  } finally { await db.close(); }
});
