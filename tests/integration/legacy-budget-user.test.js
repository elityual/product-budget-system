import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('legacy quotation creator default preserves rows and required ownership', async () => {
  const db = new PGlite();
  const migration = await readFile(new URL('../../supabase/migrations/202609090002_legacy_budget_user.sql', import.meta.url), 'utf8');
  try {
    await db.exec(`create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('33333333-3333-4333-8333-333333333333'), ('44444444-4444-4444-8444-444444444444');
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.user_id',true),'')::uuid $$;
      create table public.orcamento(codigo bigint generated always as identity primary key);
    `);
    await db.exec(migration); // Current installations have no user_id.
    await db.exec(`alter table public.orcamento add column user_id uuid not null references auth.users(id);
      insert into public.orcamento(user_id) values ('44444444-4444-4444-8444-444444444444');`);
    await db.exec(migration);
    await db.exec(migration);
    await db.exec("select set_config('request.user_id','33333333-3333-4333-8333-333333333333',false)");
    await db.exec('insert into public.orcamento default values');
    assert.deepEqual((await db.query('select user_id from public.orcamento order by codigo')).rows.map(row => row.user_id), [
      '44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333'
    ]);
    await db.exec("select set_config('request.user_id','',false)");
    await assert.rejects(db.exec('insert into public.orcamento default values'), /null value/);
  } finally { await db.close(); }
});
