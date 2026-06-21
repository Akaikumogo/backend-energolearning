/**
 * ElektroLearn — Energo ID cutover fresh-start tozalash.
 *
 * SAQLANADI:
 *   - users: MODERATOR, SUPERADMIN
 *   - moderator_permissions
 *   - organizations (moderatorlar + keyin Energo ID branches mirror)
 *   - levels, theories, questions, question_options (o'quv kontenti)
 *
 * O'CHIRILADI:
 *   - barcha USER xodimlar va energo/nes mirror
 *   - progress, yurak yo'qotishlar, sertifikatlar, faollik loglari
 *   - imtihonlar, audio kutubxona, bildirishnomalar, audit loglar
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
  const { rows } = await client.query(`SELECT to_regclass($1) AS reg`, [
    `public.${table}`,
  ]);
  return !!rows[0]?.reg;
}

async function reportCount(client, label, table) {
  if (!(await tableExists(client, table))) {
    console.log(`  ${label}: (jadval yo'q)`);
    return 0;
  }
  const n = await count(client, `SELECT COUNT(*)::int AS count FROM "${table}"`);
  console.log(`  ${label}: ${n}`);
  return n;
}

async function deleteAll(client, table) {
  if (!(await tableExists(client, table))) return 0;
  const n = await count(client, `SELECT COUNT(*)::int AS count FROM "${table}"`);
  if (n === 0) return 0;
  await client.query(`DELETE FROM "${table}"`);
  console.log(`  ${table}: ${n} o'chirildi`);
  return n;
}

/** FK tartibida — avval bolalar, keyin ota jadvallar. */
const DELETE_ORDER = [
  'exam_attempt_answers',
  'exam_attempts',
  'exam_sessions',
  'exam_assignments',
  'exam_question_options',
  'exam_question_positions',
  'exam_questions',
  'exams',
  'exam_question_catalogs',
  'positions',
  'user_question_attempts',
  'user_progress',
  'user_level_completions',
  'certificates',
  'employee_checks',
  'employee_certificates',
  'user_activity_events',
  'user_sessions',
  'daily_plans',
  'ai_chat_messages',
  'ai_chat_sessions',
  'notifications',
  'admin_audit_logs',
  'moderator_violations',
  'user_positions',
  'audio_paragraphs',
  'audio_chapters',
  'audio_books',
  'nes_employee_position_history',
  'nes_employee_history',
  'nes_employees',
  'terminated_employees',
];

const KEEP_CONTENT = ['levels', 'theories', 'questions', 'question_options'];

async function main() {
  const client = new Client({
    connectionString: buildConnString(),
    ssl: process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  console.log('\n=== ElektroLearn Fresh Start (Energo ID cutover) ===');
  console.log(`CONFIRM=${CONFIRM ? 'yes' : 'no (dry-run)'}\n`);

  console.log('Saqlanadi:');
  for (const table of [
    ...KEEP_CONTENT,
    'users (MODERATOR/SUPERADMIN)',
    'moderator_permissions',
    'organizations',
  ]) {
    if (table.startsWith('users')) {
      const n = await count(
        client,
        `SELECT COUNT(*)::int AS count FROM users WHERE role IN ('MODERATOR', 'SUPERADMIN')`,
      );
      console.log(`  ${table}: ${n}`);
      continue;
    }
    if (!(await tableExists(client, table))) continue;
    await reportCount(client, table, table);
  }

  console.log('\nO\'chiriladi (hisobot):');
  for (const table of DELETE_ORDER) {
    await reportCount(client, table, table);
  }
  const userCount = await count(
    client,
    `SELECT COUNT(*)::int AS count FROM users WHERE role = 'USER'`,
  );
  console.log(`  users (USER rol): ${userCount}`);

  if (await tableExists(client, 'employee_sync_settings')) {
    console.log(`  employee_sync_settings (energo-id): reset`);
  }
  if (await tableExists(client, 'app_sync_locks')) {
    console.log(`  app_sync_locks (sync lock): tozalanadi`);
  }
  console.log(`  refresh_tokens (USER lar): o'chiriladi`);

  if (!CONFIRM) {
    console.log('\nDry-run tugadi. Haqiqiy tozalash uchun:');
    console.log('  npm run cutover:energo-id -- --confirm');
    console.log('\nKeyin:');
    console.log('  1. pm2 restart backend');
    console.log('  2. Admin → ENERGO ID → sinxronlash');
    await client.end();
    return;
  }

  console.log('\nTozalash boshlandi...\n');

  await client.query('BEGIN');

  try {
    for (const table of DELETE_ORDER) {
      await deleteAll(client, table);
    }

    if (await tableExists(client, 'refresh_tokens')) {
      const n = await count(
        client,
        `SELECT COUNT(*)::int AS count FROM refresh_tokens rt
         INNER JOIN users u ON u.id = rt."userId"
         WHERE u.role = 'USER'`,
      );
      await client.query(
        `DELETE FROM refresh_tokens rt
         USING users u
         WHERE u.id = rt."userId" AND u.role = 'USER'`,
      );
      console.log(`  refresh_tokens (USER): ${n} o'chirildi`);
    }

    if (await tableExists(client, 'employee_sync_settings')) {
      await client.query(
        `DELETE FROM employee_sync_settings WHERE source = 'energo-id'`,
      );
      console.log(`  employee_sync_settings (energo-id): reset`);
    }

    if (await tableExists(client, 'app_sync_locks')) {
      await client.query(
        `DELETE FROM app_sync_locks WHERE name = 'elektrolearn-energo-employee-sync'`,
      );
      console.log(`  app_sync_locks: tozalandi`);
    }

    const deletedUsers = await client.query(
      `DELETE FROM users WHERE role = 'USER' RETURNING id`,
    );
    console.log(`  users (USER): ${deletedUsers.rowCount} o'chirildi`);

    await client.query('COMMIT');

    console.log('\nTozalash muvaffaqiyatli yakunlandi.');
    console.log('\nKeyingi qadamlar:');
    console.log('  1. Backend restart (pm2 restart ...)');
    console.log('  2. ENERGO_ID_CLIENT_SECRET va BASE_URL tekshiring');
    console.log('  3. Admin panel → ENERGO ID → «ENERGO ID sinxronlash»');
    console.log('  4. Demo xodim bilan login test');
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
