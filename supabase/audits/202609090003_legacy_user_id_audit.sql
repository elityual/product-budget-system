-- Auditoria somente de leitura para ISS-001. Não altera o banco.
-- Execute no SQL Editor antes de 202609090003_remove_legacy_commercial_user_id.sql.
with commercial_tables as (
  select c.oid, n.nspname as schema_name, c.relname as table_name
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ('cliente','categoria','produto','orcamento','item_orcamento','cliente_contato','cliente_telefone','cliente_endereco')
), user_columns as (
  select t.oid, t.schema_name, t.table_name, a.attnum, a.attnotnull,
    pg_catalog.format_type(a.atttypid,a.atttypmod) as column_type,
    pg_catalog.pg_get_expr(ad.adbin,ad.adrelid) as column_default
  from commercial_tables t
  join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attname='user_id' and not a.attisdropped
  left join pg_catalog.pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
)
select 'column' as dependency_type, schema_name, table_name, 'user_id' as dependency_name,
  jsonb_build_object('type',column_type,'not_null',attnotnull,'default',column_default) as detail
from user_columns
union all
select 'constraint', u.schema_name, u.table_name, con.conname,
  jsonb_build_object('definition',pg_catalog.pg_get_constraintdef(con.oid),'type',con.contype)
from user_columns u join pg_catalog.pg_constraint con on con.conrelid=u.oid and u.attnum=any(con.conkey)
union all
select 'foreign_key_reference', u.schema_name, u.table_name, con.conname,
  jsonb_build_object('referencing_table',ref_ns.nspname || '.' || ref.relname,'definition',pg_catalog.pg_get_constraintdef(con.oid))
from user_columns u join pg_catalog.pg_constraint con on con.confrelid=u.oid and u.attnum=any(con.confkey)
  join pg_catalog.pg_class ref on ref.oid=con.conrelid
  join pg_catalog.pg_namespace ref_ns on ref_ns.oid=ref.relnamespace
union all
select 'index', u.schema_name, u.table_name, i.relname,
  jsonb_build_object('definition',pg_catalog.pg_get_indexdef(i.oid))
from user_columns u join pg_catalog.pg_index ix on ix.indrelid=u.oid and u.attnum=any(ix.indkey)
  join pg_catalog.pg_class i on i.oid=ix.indexrelid
union all
select 'policy', u.schema_name, u.table_name, p.polname,
  jsonb_build_object('using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid))
from user_columns u join pg_catalog.pg_policy p on p.polrelid=u.oid
where coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'') ilike '%user_id%'
   or coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),'') ilike '%user_id%'
union all
select 'trigger', u.schema_name, u.table_name, tg.tgname,
  jsonb_build_object('definition',pg_catalog.pg_get_triggerdef(tg.oid))
from user_columns u join pg_catalog.pg_trigger tg on tg.tgrelid=u.oid and not tg.tgisinternal
where pg_catalog.pg_get_triggerdef(tg.oid) ilike '%user_id%'
union all
select 'view', u.schema_name, u.table_name, dependent.relname,
  jsonb_build_object('schema',dependent_ns.nspname,'kind',dependent.relkind)
from user_columns u join pg_catalog.pg_depend d on d.refobjid=u.oid and d.refobjsubid=u.attnum
  join pg_catalog.pg_class dependent on dependent.oid=d.objid
  join pg_catalog.pg_namespace dependent_ns on dependent_ns.oid=dependent.relnamespace
where dependent.relkind in ('v','m')
order by table_name, dependency_type, dependency_name;
