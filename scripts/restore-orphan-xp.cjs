/**
 * Production: arxivlangan (energo_id NULL) XP userlarni diagnostika / tiklash.
 *
 *   node scripts/restore-orphan-xp.cjs --dry-run
 *   node scripts/restore-orphan-xp.cjs --apply
 *
 * Requires DATABASE_URL (production .env).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

const dryRun = !process.argv.includes('--apply');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL yo‘q');
    process.exit(1);
  }
  const c = new Client({ connectionString: url });
  await c.connect();

  const orphan = await c.query(`
    SELECT
      COUNT(DISTINCT u.id)::int AS users,
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp_answers
    FROM users u
    JOIN user_question_attempts a ON a.user_id = u.id
    WHERE u.energo_id IS NULL AND u.role IN ('USER', 'MODERATOR')
  `);
  const active = await c.query(`
    SELECT
      COUNT(DISTINCT u.id)::int AS users,
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp_answers
    FROM users u
    JOIN user_question_attempts a ON a.user_id = u.id
    WHERE u.energo_id IS NOT NULL AND u.role IN ('USER', 'MODERATOR')
  `);
  console.log('ORPHAN XP', orphan.rows[0]);
  console.log('ACTIVE XP', active.rows[0]);

  const farg = await c.query(`
    SELECT o.name,
      COUNT(DISTINCT u.id) FILTER (WHERE u.energo_id IS NOT NULL)::int AS active_users,
      COUNT(DISTINCT u.id) FILTER (WHERE u.energo_id IS NULL)::int AS orphan_users,
      COALESCE(SUM(x.cnt) FILTER (WHERE u.energo_id IS NOT NULL),0)::int AS xp_active,
      COALESCE(SUM(x.cnt) FILTER (WHERE u.energo_id IS NULL),0)::int AS xp_orphan
    FROM organizations o
    LEFT JOIN user_organizations uo ON uo."organizationId" = o.id
    LEFT JOIN users u ON u.id = uo."userId" AND u.role IN ('USER','MODERATOR')
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt FROM user_question_attempts a
      WHERE a.user_id = u.id AND a.is_correct AND a.counts_for_xp
    ) x ON true
    WHERE o.name ILIKE '%farg%' OR o.name ILIKE '%фарг%'
    GROUP BY o.id, o.name
    ORDER BY o.name
  `);
  console.log('FARGONA', JSON.stringify(farg.rows, null, 2));

  const candidates = await c.query(`
    SELECT u.id, u.email,
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp_ans,
      (SELECT t.energo_id FROM terminated_employees t WHERE t.user_id=u.id ORDER BY t.terminated_at DESC LIMIT 1) AS old_energo_id,
      (SELECT t.personnel_number FROM terminated_employees t WHERE t.user_id=u.id ORDER BY t.terminated_at DESC LIMIT 1) AS pn,
      (SELECT t.organization_name FROM terminated_employees t WHERE t.user_id=u.id ORDER BY t.terminated_at DESC LIMIT 1) AS org_name
    FROM users u
    JOIN user_question_attempts a ON a.user_id=u.id
    WHERE u.energo_id IS NULL AND u.role IN ('USER','MODERATOR')
    GROUP BY u.id
    HAVING COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp) > 0
    ORDER BY xp_ans DESC
    LIMIT 50
  `);
  console.log('TOP ORPHANS', candidates.rows.length);

  if (dryRun) {
    console.log('DRY-RUN — qo‘llash: node scripts/restore-orphan-xp.cjs --apply');
    console.log(JSON.stringify(candidates.rows.slice(0, 15), null, 2));
    await c.end();
    return;
  }

  let restored = 0;
  let merged = 0;
  for (const row of candidates.rows) {
    const oldId = row.old_energo_id;
    if (!oldId) continue;

    const holder = await c.query(
      `SELECT id FROM users WHERE energo_id = $1::uuid LIMIT 1`,
      [oldId],
    );
    if (holder.rows[0] && holder.rows[0].id !== row.id) {
      const target = holder.rows[0].id;
      await c.query(
        `DELETE FROM user_question_attempts d
         USING user_question_attempts k
         WHERE d.user_id = $1::uuid AND k.user_id = $2::uuid
           AND d.question_id = k.question_id
           AND date_trunc('day', d.answered_at AT TIME ZONE 'Asia/Tashkent')
             = date_trunc('day', k.answered_at AT TIME ZONE 'Asia/Tashkent')`,
        [row.id, target],
      );
      await c.query(
        `UPDATE user_question_attempts SET user_id = $2::uuid WHERE user_id = $1::uuid`,
        [row.id, target],
      );
      console.log(`MERGE xp ${row.email} → ${target} (${row.xp_ans})`);
      merged += 1;
      continue;
    }

    await c.query(
      `UPDATE users SET energo_id = $1::uuid, report_active = true, login_blocked = false, updated_at = NOW()
       WHERE id = $2::uuid AND energo_id IS NULL`,
      [oldId, row.id],
    );
    console.log(`RESTORE ${row.email} energo=${oldId} xp=${row.xp_ans}`);
    restored += 1;
  }

  console.log({ restored, merged });
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
