/**
 * ElektroLearn — Energo ID cutover fresh-start tozalash.
 *
 * Barcha USER rolidagi xodimlar va ularning progress/imtihon ma'lumotlari o'chadi.
 * MODERATOR va SUPERADMIN saqlanadi.
 *
 * Ishga tushirish:
 *   node scripts/cutover-energo-id-fresh-start.mjs          # dry-run
 *   node scripts/cutover-energo-id-fresh-start.mjs --confirm
 */

import { Client } from 'pg';

const CONFIRM = process.argv.includes('--confirm');

function buildConnString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.DB_HOST || process.env.PGHOST || 'localhost';
  const port = process.env.DB_PORT || process.env.PGPORT || '5432';
  const user = process.env.DB_USER || process.env.PGUSER || 'postgres';
  const password = process.env.DB_PASSWORD || process.env.PGPASSWORD || '';
  const database = process.env.DB_NAME || process.env.PGDATABASE || 'postgres';
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

async function count(client, sql, params = []) {
  const { rows } = await client.query(sql, params);
  return Number(rows[0]?.count ?? 0);
}

async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT to_regclass($1) AS reg`,
    [`public.${table}`],
  );
  return !!rows[0]?.reg;
}

async function main() {
  const client = new Client({
    connectionString: buildConnString(),
    ssl: process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  console.log(`\n=== Energo ID Cutover Fresh Start ===`);
  console.log(`CONFIRM=${CONFIRM ? 'yes' : 'no (dry-run)'}\n`);

  const userCount = await count(
    client,
    `SELECT COUNT(*)::int AS count FROM users WHERE role = 'USER'`,
  );
  const moderatorCount = await count(
    client,
    `SELECT COUNT(*)::int AS count FROM users WHERE role IN ('MODERATOR', 'SUPERADMIN')`,
  );
  const nesCount = await tableExists(client, 'nes_employees')
    ? await count(client, `SELECT COUNT(*)::int AS count FROM nes_employees`)
    : 0;
  const terminatedCount = await tableExists(client, 'terminated_employees')
    ? await count(client, `SELECT COUNT(*)::int AS count FROM terminated_employees`)
    : 0;

  console.log('Hisobot:');
  console.log(`  USER xodimlar (o'chiladi):        ${userCount}`);
  console.log(`  MODERATOR/SUPERADMIN (saqlanadi): ${moderatorCount}`);
  console.log(`  nes_employees:                    ${nesCount}`);
  console.log(`  terminated_employees:             ${terminatedCount}`);
  console.log('');

  if (!CONFIRM) {
    console.log('Dry-run tugadi. Haqiqiy tozalash uchun:');
    console.log('  node scripts/cutover-energo-id-fresh-start.mjs --confirm');
    await client.end();
    return;
  }

  console.log('Tozalash boshlandi...\n');

  await client.query('BEGIN');

  try {
    if (await tableExists(client, 'nes_employee_position_history')) {
      const n = await count(client, `SELECT COUNT(*)::int AS count FROM nes_employee_position_history`);
      await client.query(`DELETE FROM nes_employee_position_history`);
      console.log(`  nes_employee_position_history: ${n} o'chirildi`);
    }

    if (await tableExists(client, 'nes_employee_history')) {
      const n = await count(client, `SELECT COUNT(*)::int AS count FROM nes_employee_history`);
      await client.query(`DELETE FROM nes_employee_history`);
      console.log(`  nes_employee_history: ${n} o'chirildi`);
    }

    if (await tableExists(client, 'nes_employees')) {
      await client.query(`DELETE FROM nes_employees`);
      console.log(`  nes_employees: ${nesCount} o'chirildi`);
    }

    if (await tableExists(client, 'terminated_employees')) {
      await client.query(`DELETE FROM terminated_employees`);
      console.log(`  terminated_employees: ${terminatedCount} o'chirildi`);
    }

    if (await tableExists(client, 'employee_sync_settings')) {
      await client.query(`DELETE FROM employee_sync_settings WHERE source = 'energo-id'`);
      console.log(`  employee_sync_settings (energo-id): reset`);
    }

    if (await tableExists(client, 'app_sync_locks')) {
      await client.query(`DELETE FROM app_sync_locks WHERE name = 'elektrolearn-energo-employee-sync'`);
      console.log(`  app_sync_locks: tozalandi`);
    }

    const deletedUsers = await client.query(`DELETE FROM users WHERE role = 'USER' RETURNING id`);
    console.log(`  users (USER): ${deletedUsers.rowCount} o'chirildi`);

    await client.query('COMMIT');
    console.log('\nTozalash muvaffaqiyatli yakunlandi.');
    console.log('\nKeyingi qadamlar:');
    console.log('  1. ElektroLearn .env da ENERGO_ID_BASE_URL ni o\'rnating');
    console.log('  2. POST /admin/nes-employees/sync — Energo ID dan birinchi pull');
    console.log('  3. Demo xodim bilan login test');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('FATAL:', e?.stack || e?.message || e);
  process.exit(1);
});
