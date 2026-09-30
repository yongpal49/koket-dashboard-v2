// In-memory PostgreSQL verification. Never uses a remote database connection.
// npm install --prefix .local-audit --no-save @electric-sql/pglite
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PGlite } from '../.local-audit/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
try {
  for (const file of ['tests/sql/core-fixture.sql', 'supabase/migrations/20260928_dashboard_account_status.sql', 'tests/sql/core-assertions.sql', 'tests/sql/core-schema-assertions.sql']) {
    await db.exec(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
    console.log(`PASS ${file}`);
  }
  await db.exec("update public.users set department_code='computer_engineering', account_status='withdrawal_pending', withdrawn_at=null where user_id='00000000-0000-0000-0000-000000000001'");
  const { rows } = await db.query("select public.get_dashboard_core('2026-01-08','2026-01-08') as data");
  assert.equal(rows[0].data.kpis.current.completed_trades, 1);
  assert.equal(rows[0].data.metadata.definition_version, '20260928.1');
  console.log('PASS pending withdrawal remains distinct from completed withdrawal');
} finally { await db.close(); }
