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
    await db.exec(await sql('202609070009_budget_order_compatibility.sql'));
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

test('ISS-019 saves current budget order directly and rejects legacy input atomically', async () => {
  const {db,login,save,load} = await setup();
  try {
    for (const name of ['202609060005_shared_access.sql','202609060006_budget_permissions.sql','202609060007_budget_approval.sql','202609060008_budget_client_order.sql']) await db.exec(await sql(name));
    await login(editor);
    const before = await load();
    const legacy = structuredClone(before);
    const client = legacy.payload.clientes[0];
    legacy.payload.orcamentos.push([null,client[3],client[0],'07/09/2026','30/09/2026',0]);
    const product = legacy.payload.itens[0];
    legacy.payload.itensOrcamento.push([null,product[0],product[2],2,product[4],0]);
    await assert.rejects(save(legacy), /invalid input syntax for type bigint/);
    assert.deepEqual(await load(),before);
    await db.exec('reset role');
    await db.exec(await sql('202609070009_budget_order_compatibility.sql'));
    await login(editor);
    assert.equal(await save(legacy),null);
    legacy.revision = (await load()).revision;
    await assert.rejects(save(legacy), error => error.code === '22023');
    assert.deepEqual((await load()).payload,before.payload);
    legacy.payload.orcamentos.at(-1).splice(1,2,client[0],client[3]);
    const created = await save(legacy);
    const budget = created.payload.orcamentos.at(-1);
    assert.deepEqual(budget.slice(1,3),[client[0],client[3]]);
    assert.equal(budget[5],2*product[4]);
    const edit = structuredClone(created);
    const other = edit.payload.clientes[1];
    edit.payload.orcamentos.at(-1).splice(1,2,other[0],other[3]);
    const edited = await save(edit);
    assert.deepEqual(edited.payload.orcamentos.at(-1).slice(1,3),[other[0],other[3]]);
    const current = structuredClone(edited);
    current.payload.orcamentos.push([null,client[0],client[3],'07/09/2026','30/09/2026',0]);
    current.payload.itensOrcamento.push([null,product[0],product[2],1,product[4],0]);
    const saved = await save(current);
    assert.equal(saved.payload.orcamentos.at(-1)[1],client[0]);
    for (const row of [null,{},[],[null,client[3],client[0],'07/09/2026','30/09/2026',0],[null,'123','456','07/09/2026','30/09/2026',0],[null,1.5,'Client','07/09/2026','30/09/2026',0]]) {
      const invalid = structuredClone(saved);
      invalid.payload.orcamentos.push(row);
      await assert.rejects(save(invalid), error => error.code === '22023');
      assert.deepEqual((await load()).payload,saved.payload);
      assert.equal((await load()).revision,saved.revision);
    }
    await assert.rejects(db.query('select public.atlas_save_workspace_legacy_order($1,$2::jsonb)',[saved.revision,JSON.stringify(saved.payload)]), /does not exist/);
  } finally { await db.close(); }
});
