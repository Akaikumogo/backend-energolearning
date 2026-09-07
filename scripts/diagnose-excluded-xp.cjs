/**
 * Deep diagnose: where XP sits for Fergana / excluded from ranking.
 * Run on server: node scripts/diagnose-excluded-xp.cjs
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const orgs = await c.query(`
    SELECT id, name FROM organizations
    WHERE name ILIKE '%farg%' OR name ILIKE '%фарг%'
  `);
  console.log('ORGS', orgs.rows);

  for (const o of orgs.rows) {
    const byAtt = await c.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp_ans,
        COUNT(DISTINCT a.user_id)::int AS users,
        COUNT(DISTINCT a.user_id) FILTER (
          WHERE u.energo_id IS NOT NULL AND u.report_active
        )::int AS ranking_users,
        COUNT(*) FILTER (
          WHERE a.is_correct AND a.counts_for_xp
            AND u.energo_id IS NOT NULL AND u.report_active
        )::int AS xp_in_ranking,
        COUNT(*) FILTER (
          WHERE a.is_correct AND a.counts_for_xp
            AND (u.energo_id IS NULL OR NOT u.report_active)
        )::int AS xp_excluded
      FROM user_question_attempts a
      JOIN users u ON u.id = a.user_id
      WHERE a.organization_id = $1
      `,
      [o.id],
    );
    console.log('BY_ATTEMPT', o.name.slice(0, 70), byAtt.rows[0]);

    const excl = await c.query(
      `
      SELECT
        CASE
          WHEN u.energo_id IS NULL THEN 'no_energo'
          WHEN u.report_active = false THEN 'report_off'
          ELSE 'other'
        END AS bucket,
        COUNT(DISTINCT u.id)::int AS users,
        COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp_ans
      FROM user_question_attempts a
      JOIN users u ON u.id = a.user_id
      WHERE a.organization_id = $1
        AND a.is_correct AND a.counts_for_xp
        AND (u.energo_id IS NULL OR u.report_active = false)
      GROUP BY 1
      ORDER BY xp_ans DESC
      `,
      [o.id],
    );
    console.log('EXCLUDED_BUCKETS', excl.rows);

    const top = await c.query(
      `
      SELECT u.id, u.email, u.first_name, u.last_name,
        (u.energo_id IS NULL) AS no_eid, u.report_active,
        COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp_ans,
        (
          SELECT t.energo_id::text FROM terminated_employees t
          WHERE t.user_id = u.id ORDER BY t.terminated_at DESC LIMIT 1
        ) AS old_eid,
        (
          SELECT t.personnel_number FROM terminated_employees t
          WHERE t.user_id = u.id ORDER BY t.terminated_at DESC LIMIT 1
        ) AS pn,
        (
          SELECT ne.personnel_number FROM nes_employees ne
          WHERE ne.user_id = u.id LIMIT 1
        ) AS live_pn
      FROM user_question_attempts a
      JOIN users u ON u.id = a.user_id
      WHERE a.organization_id = $1
        AND a.is_correct AND a.counts_for_xp
        AND (u.energo_id IS NULL OR u.report_active = false)
      GROUP BY u.id
      ORDER BY xp_ans DESC
      LIMIT 25
      `,
      [o.id],
    );
    console.log('TOP_EXCLUDED', JSON.stringify(top.rows, null, 2));
  }

  const g = await c.query(`
    SELECT
      COUNT(*) FILTER (
        WHERE a.is_correct AND a.counts_for_xp
          AND u.energo_id IS NOT NULL AND u.report_active
      )::int AS xp_ok,
      COUNT(*) FILTER (
        WHERE a.is_correct AND a.counts_for_xp
          AND (u.energo_id IS NULL OR NOT u.report_active)
      )::int AS xp_bad,
      COUNT(DISTINCT u.id) FILTER (
        WHERE a.is_correct AND a.counts_for_xp
          AND (u.energo_id IS NULL OR NOT u.report_active)
      )::int AS users_bad
    FROM user_question_attempts a
    JOIN users u ON u.id = a.user_id
  `);
  console.log('GLOBAL', g.rows[0]);

  const term = await c.query(`
    SELECT COUNT(*)::int AS cnt,
      COUNT(*) FILTER (WHERE energo_id IS NOT NULL)::int AS with_eid
    FROM terminated_employees
  `);
  console.log('TERMINATED', term.rows[0]);

  // Match excluded users to active users by soft name + same org attempts
  const matchable = await c.query(`
    WITH excluded AS (
      SELECT DISTINCT u.id, u.email, u.first_name, u.last_name, a.organization_id,
        COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp) AS xp_ans
      FROM user_question_attempts a
      JOIN users u ON u.id = a.user_id
      WHERE a.is_correct AND a.counts_for_xp
        AND (u.energo_id IS NULL OR u.report_active = false)
      GROUP BY u.id, u.email, u.first_name, u.last_name, a.organization_id
    )
    SELECT e.email, e.first_name, e.last_name, e.xp_ans, e.organization_id,
      u2.id AS active_id, u2.email AS active_email, u2.energo_id IS NOT NULL AS has_eid
    FROM excluded e
    JOIN users u2 ON lower(trim(u2.first_name)) = lower(trim(e.first_name))
      AND lower(trim(u2.last_name)) = lower(trim(e.last_name))
      AND u2.id <> e.id
      AND u2.energo_id IS NOT NULL
      AND u2.report_active = true
    ORDER BY e.xp_ans DESC
    LIMIT 40
  `);
  console.log('NAME_MATCH_ACTIVE', JSON.stringify(matchable.rows, null, 2));

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
