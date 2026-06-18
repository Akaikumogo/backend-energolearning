/**
 * `initial_password` ustuni NULL bo'lgan moderatorlarga yangi parol generatsiya qiladi.
 * Yangi parol:
 *   1) bcrypt bilan hashlanadi va `password_hash` yangilanadi
 *   2) plain matn `initial_password`'ga saqlanadi (Excel exportda chiqishi uchun)
 *
 * MUHIM: bu xodimlarning eski parollarini bekor qiladi. Ular yangi parol bilan
 *        kirishadi. Excel'ni qayta export qilib, yangi parollarni xodimlarga
 *        xabar bering.
 *
 * Qaysi rollarni ta'sir qiladi: faqat MODERATOR.
 * (SUPERADMIN'ni o'tkazib yuboramiz — uning paroli env'da)
 *
 * Ishga tushirish:
 *   /admin/scripts/run  body: { "script": "reset-moderator-passwords" }
 *   yoki  /admin/scripts/run  body: { "script": "reset-moderator-passwords", "env": { "DRY_RUN": "1" } }
 */

import { Client } from 'pg';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const DRY_RUN = process.env.DRY_RUN === '1';

function generatePassword() {
  // 10 belgi: chalkash bo'lmaydigan harf+raqam
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function buildConnString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.DB_HOST || process.env.PGHOST || 'localhost';
  const port = process.env.DB_PORT || process.env.PGPORT || '5432';
  const user = process.env.DB_USER || process.env.PGUSER || 'postgres';
  const password =
    process.env.DB_PASSWORD || process.env.PGPASSWORD || '';
  const database =
    process.env.DB_NAME || process.env.PGDATABASE || 'postgres';
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(
    password,
  )}@${host}:${port}/${database}`;
}

async function main() {
  const conn = buildConnString();
  const client = new Client({
    connectionString: conn,
    ssl: process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  console.log(`DRY_RUN=${DRY_RUN ? '1' : '0'}`);
  console.log('1) initial_password NULL bo\'lgan moderatorlar tanlanmoqda...');

  const { rows } = await client.query(
    `SELECT id, email, first_name, last_name
       FROM users
      WHERE role = 'MODERATOR'
        AND (initial_password IS NULL OR initial_password = '')
      ORDER BY last_name, first_name`,
  );

  console.log(`   Topildi: ${rows.length} ta moderator`);

  const report = [];
  let updated = 0;

  for (const u of rows) {
    const newPassword = generatePassword();
    const hash = await bcrypt.hash(newPassword, 10);

    if (!DRY_RUN) {
      await client.query(
        `UPDATE users
            SET password_hash = $1,
                initial_password = $2,
                must_change_password = TRUE,
                updated_at = NOW()
          WHERE id = $3`,
        [hash, newPassword, u.id],
      );
      updated += 1;
    }

    report.push({
      id: u.id,
      name: `${u.last_name} ${u.first_name}`.trim(),
      email: u.email,
      newPassword,
    });
    console.log(
      `   ${DRY_RUN ? '[DRY]' : 'OK '} ${u.last_name} ${u.first_name} -> ${newPassword}`,
    );
  }

  await client.end();

  console.log(
    `\n${DRY_RUN ? '[DRY_RUN]' : 'YANGILANDI'}: ${rows.length} ta moderator parol yangilandi (DBga yozildi: ${updated})`,
  );
  console.log(
    '\nKeyingi qadam: Moderators sahifasi -> "Excel export" tugma. Yangi parollar Excel\'da chiqadi.',
  );
  console.log('\n=== HISOBOT (JSON) ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e?.stack || e?.message || e);
  process.exit(1);
});
