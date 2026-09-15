/**
 * The schema as Postgres itself reports it. The same queries run against the
 * linked production project (snapshot.ts) and against a local build
 * (db.ts), so "do the migration files reproduce production?" becomes a diff
 * instead of a code review.
 *
 * Only what the app owns is compared: the public schema, the storage policies
 * this app created, and the one trigger it attaches to auth.users. Supabase's
 * own internals are excluded, since they are not ours to reproduce.
 */
export const CATALOG_QUERIES = {
  columns: `
    select table_name, column_name, data_type, udt_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, column_name`,
  constraints: `
    select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where connamespace = 'public'::regnamespace
      -- Postgres 18 (PGlite) catalogs NOT NULL as constraints, 17 does not;
      -- nullability is already compared through columns.is_nullable
      and contype <> 'n'
    order by 1, 2`,
  indexes: `
    select tablename, indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
    order by 1, 2`,
  rls: `
    select relname, relrowsecurity
    from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r'
    order by 1`,
  functions: `
    select p.proname as name,
           pg_get_function_identity_arguments(p.oid) as args,
           p.prosecdef as security_definer,
           coalesce(array_to_string(p.proconfig, ','), '') as config,
           pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by 1, 2`,
  function_grants: `
    select routine_name, grantee, privilege_type
    from information_schema.role_routine_grants
    where routine_schema = 'public'
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
    order by 1, 2`,
  policies: `
    select schemaname, tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
       or (schemaname = 'storage' and (qual like '%completion-photos%' or with_check like '%completion-photos%'))
    order by 1, 2, 3`,
  triggers: `
    select c.relnamespace::regnamespace::text || '.' || c.relname as tbl,
           t.tgname,
           pg_get_triggerdef(t.oid) as def
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal
      and (c.relnamespace = 'public'::regnamespace or (c.relnamespace = 'auth'::regnamespace and c.relname = 'users'))
    order by 1, 2`,
} as const;

export type CatalogName = keyof typeof CATALOG_QUERIES;
export type Catalog = Record<CatalogName, Record<string, unknown>[]>;

/** Whitespace in deparsed SQL is not meaningful; everything else is. */
export function normalizeCatalog(catalog: Catalog): Catalog {
  const out = {} as Catalog;
  for (const name of Object.keys(CATALOG_QUERIES) as CatalogName[]) {
    out[name] = (catalog[name] ?? [])
      .map((row) =>
        Object.fromEntries(
          Object.entries(row)
            // key order differs between the CLI's JSON and a local driver
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => [
              key,
              typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value,
            ]),
        ),
      )
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return out;
}

/** Human-readable differences, or an empty list when the catalogs agree. */
export function diffCatalogs(expected: Catalog, actual: Catalog): string[] {
  const problems: string[] = [];
  const left = normalizeCatalog(expected);
  const right = normalizeCatalog(actual);
  for (const name of Object.keys(CATALOG_QUERIES) as CatalogName[]) {
    const want = new Set(left[name].map((row) => JSON.stringify(row)));
    const have = new Set(right[name].map((row) => JSON.stringify(row)));
    for (const row of want) if (!have.has(row)) problems.push(`${name}: missing ${row}`);
    for (const row of have) if (!want.has(row)) problems.push(`${name}: unexpected ${row}`);
  }
  return problems;
}
