import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const shared = '00000000-0000-4000-8000-000000000001';
const setup = `
  create role anon; create role authenticated;
  create table public.cliente(user_id uuid not null, codigo bigint not null, tipo text not null, documento text not null, nome text not null, constraint cliente_pkey primary key(user_id,codigo), constraint shared_workspace_only check(user_id='${shared}'::uuid));
  create unique index cliente_documento_unique on public.cliente(user_id,upper(regexp_replace(documento,'[^a-zA-Z0-9]','','g')));
  create table public.categoria(user_id uuid not null, codigo bigint not null, descricao text not null, constraint categoria_pkey primary key(user_id,codigo), constraint shared_workspace_only check(user_id='${shared}'::uuid));
  create unique index categoria_descricao_unique on public.categoria(user_id,lower(regexp_replace(btrim(descricao),'\\s+',' ','g')));
  create table public.produto(user_id uuid not null, codigo bigint not null, categoria_codigo bigint not null, nome text not null, descricao text not null, valor_venda numeric not null, data_cadastro date not null, status text not null, constraint produto_pkey primary key(user_id,codigo), constraint shared_workspace_only check(user_id='${shared}'::uuid), constraint produto_user_id_categoria_codigo_fkey foreign key(user_id,categoria_codigo) references public.categoria(user_id,codigo) deferrable initially deferred);
  create unique index produto_descricao_unique on public.produto(user_id,lower(regexp_replace(btrim(descricao),'\\s+',' ','g')));
  create index produto_categoria_idx on public.produto(user_id,categoria_codigo);
  create table public.orcamento(user_id uuid not null default '${shared}'::uuid, codigo bigint not null, cliente_codigo bigint not null, data_emissao date not null, validade date not null, aprovado boolean not null default false, constraint orcamento_pkey primary key(user_id,codigo), constraint shared_workspace_only check(user_id='${shared}'::uuid), constraint orcamento_user_id_cliente_codigo_fkey foreign key(user_id,cliente_codigo) references public.cliente(user_id,codigo) deferrable initially deferred);
  create index orcamento_cliente_idx on public.orcamento(user_id,cliente_codigo);
  create table public.item_orcamento(user_id uuid not null, orcamento_codigo bigint not null, produto_codigo bigint not null, produto_nome text not null, quantidade bigint not null, valor_unitario numeric not null, constraint item_orcamento_pkey primary key(user_id,orcamento_codigo,produto_codigo), constraint shared_workspace_only check(user_id='${shared}'::uuid), constraint item_orcamento_user_id_orcamento_codigo_fkey foreign key(user_id,orcamento_codigo) references public.orcamento(user_id,codigo) on delete cascade deferrable initially deferred, constraint item_orcamento_user_id_produto_codigo_fkey foreign key(user_id,produto_codigo) references public.produto(user_id,codigo) deferrable initially deferred);
  create index item_orcamento_produto_idx on public.item_orcamento(user_id,produto_codigo);
  insert into public.cliente values('${shared}',1,'Pessoa Física','529.982.247-25','Cliente');
  insert into public.categoria values('${shared}',2,'Materiais');
  insert into public.produto values('${shared}',3,2,'Cimento','Saco',42.90,'2026-01-01','Ativo');
  insert into public.orcamento values('${shared}',4,1,'2026-01-01','2026-12-31',false);
  insert into public.item_orcamento values('${shared}',4,3,'Cimento',2,42.90);`;

test('converts audited composite commercial keys to shared workspace keys', async () => {
  const db = new PGlite();
  const migration = await readFile(new URL('../../supabase/migrations/202609090004_migrate_legacy_composite_commercial_keys.sql', import.meta.url), 'utf8');
  try {
    await db.exec(setup);
    await db.exec(migration);
    await db.exec(migration);
    const userColumns = await db.query("select count(*)::int as count from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and c.relname in ('cliente','categoria','produto','orcamento','item_orcamento') and a.attname='user_id' and not a.attisdropped");
    assert.equal(userColumns.rows[0].count, 0);
    const keys = await db.query("select c.relname,pg_get_constraintdef(con.oid) as definition from pg_constraint con join pg_class c on c.oid=con.conrelid where c.relnamespace='public'::regnamespace and c.relname in ('cliente','categoria','produto','orcamento','item_orcamento') and con.contype='p' order by c.relname");
    assert.deepEqual(keys.rows.map((row) => [row.relname,row.definition]), [
      ['categoria','PRIMARY KEY (codigo)'], ['cliente','PRIMARY KEY (codigo)'], ['item_orcamento','PRIMARY KEY (orcamento_codigo, produto_codigo)'], ['orcamento','PRIMARY KEY (codigo)'], ['produto','PRIMARY KEY (codigo)']
    ]);
    assert.equal((await db.query('select count(*)::int as count from public.atlas_legacy_user_id_backup')).rows[0].count, 5);
    await db.exec("insert into public.categoria(codigo,descricao) values(5,'Ferramentas'); insert into public.produto(codigo,categoria_codigo,nome,descricao,valor_venda,data_cadastro,status) values(6,5,'Chave','Chave de fenda',10,'2026-01-01','Ativo');");
  } finally { await db.close(); }
});
