/**
 * Farg'ona / orphan XP diagnostikasi.
 * Usage: node scripts/diagnose-fargona-xp.cjs
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const orgs = await c.query(`
    SELECT id, name, archived_at IS NOT NULL AS archived
    FROM organizations
    WHERE name ILIKE '%farg%'
       OR name ILIKE '%fergan%'
       OR name ILIKE '%фарг%'
       OR name ILIKE '%ФАРГ%'
    ORDER BY name
    LIMIT 30
  `);
  console.log('=== FARGONA ORGS ===');
  console.log(JSON.stringify(orgs.rows, null, 2));

  const orphanXp = await c.query(`
    SELECT
      COUNT(DISTINCT u.id)::int AS users,
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp_answers
    FROM users u
    JOIN user_question_attempts a ON a.user_id = u.id
    WHERE u.energo_id IS NULL
      AND u.role IN ('USER', 'MODERATOR')
  `);
  console.log('=== ORPHAN (energo_id NULL) XP ===', orphanXp.rows[0]);

  const withEnergoXp = await c.query(`
    SELECT
      COUNT(DISTINCT u.id)::int AS users,
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp_answers
    FROM users u
    JOIN user_question_attempts a ON a.user_id = u.id
    WHERE u.energo_id IS NOT NULL
      AND u.role IN ('USER', 'MODERATOR')
  `);
  console.log('=== WITH energo_id XP ===', withEnergoXp.rows[0]);

  const terminated = await c.query(`
    SELECT COUNT(*)::int AS cnt FROM terminated_employees
  `);
  console.log('=== terminated_employees ===', terminated.rows[0]);

  // Per Fargona org: active energo users vs orphan users with xp
  for (const org of orgs.rows) {
    const stats = await c.query(
      `
      SELECT
        COUNT(DISTINCT u.id) FILTER (WHERE u.energo_id IS NOT NULL)::int AS active_energo_users,
        COUNT(DISTINCT u.id) FILTER (WHERE u.energo_id IS NULL)::int AS orphan_users,
        COALESCE(SUM(xp.cnt) FILTER (WHERE u.energo_id IS NOT NULL), 0)::int AS xp_on_active,
        COALESCE(SUM(xp.cnt) FILTER (WHERE u.energo_id IS NULL), 0)::int AS xp_on_orphan
      FROM user_organizations uo
      JOIN users u ON u.id = uo."userId"
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt
        FROM user_question_attempts a
        WHERE a.user_id = u.id AND a.is_correct AND a.counts_for_xp
      ) xp ON true
      WHERE uo."organizationId" = $1
        AND u.role IN ('USER', 'MODERATOR')
      `,
      [org.id],
    );
    console.log(`=== ORG ${org.name} ===`, stats.rows[0]);
  }

  // Top orphan XP users (likely old keepers after sync cleared energo_id)
  const topOrphans = await c.query(`
    SELECT
      u.id, u.email, u.first_name, u.last_name, u.login_blocked, u.report_active,
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp_ans,
      (SELECT e.personnel_number FROM nes_employees e WHERE e.user_id = u.id LIMIT 1) AS pn,
      (SELECT e.organization_name FROM nes_employees e WHERE e.user_id = u.id LIMIT 1) AS org_name,
      (SELECT t.energo_id::text FROM terminated_employees t WHERE t.user_id = u.id ORDER BY t.terminated_at DESC LIMIT 1) AS old_energo_id
    FROM users u
    JOIN user_question_attempts a ON a.user_id = u.id
    WHERE u.energo_id IS NULL
      AND u.role IN ('USER', 'MODERATOR')
    GROUP BY u.id
    HAVING COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp) > 0
    ORDER BY xp_ans DESC
    LIMIT 25
  `);
  console.log('=== TOP ORPHAN XP USERS ===');
  console.log(JSON.stringify(topOrphans.rows, null, 2));

  // Suffix mirrors: base vs suffix xp
  const suffix = await c.query(`
    WITH numbered AS (
      SELECT
        e.id, e.user_id, e.personnel_number, e.full_name, e.organization_id, e.organization_name,
        u.energo_id,
        (SELECT COUNT(*)::int FROM user_question_attempts a
          WHERE a.user_id = u.id AND a.is_correct AND a.counts_for_xp) AS xp_ans
      FROM nes_employees e
      JOIN users u ON u.id = e.user_id
    )
    SELECT
      s.personnel_number AS suffix_pn,
      b.personnel_number AS base_pn,
      s.full_name AS suffix_name,
      b.full_name AS base_name,
      s.organization_name,
      s.xp_ans AS suffix_xp,
      b.xp_ans AS base_xp,
      (s.energo_id IS NOT NULL) AS suffix_has_energo,
      (b.energo_id IS NOT NULL) AS base_has_energo,
      s.user_id AS suffix_user,
      b.user_id AS base_user
    FROM numbered s
    JOIN numbered b
      ON b.organization_id = s.organization_id
     AND s.personnel_number ~ '^[0-9]+[1-9]$'
     AND b.personnel_number = left(s.personnel_number, length(s.personnel_number) - 1)
     AND length(b.personnel_number) >= 3
    WHERE s.xp_ans > 0 OR b.xp_ans > 0
    ORDER BY GREATEST(s.xp_ans, b.xp_ans) DESC
    LIMIT 40
  `);
  console.log('=== BASE vs SUFFIX XP ===');
  console.log(JSON.stringify(suffix.rows, null, 2));

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
