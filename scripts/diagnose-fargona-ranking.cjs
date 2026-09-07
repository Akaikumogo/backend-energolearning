/**
 * Why is Fergana ranking ~0? Plan denominator vs completions + alt org ids.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const org = (
    await c.query(`
      SELECT id, name, report_active FROM organizations
      WHERE name ILIKE '%farg%' OR name ILIKE '%фарг%'
      LIMIT 1
    `)
  ).rows[0];
  console.log('ORG', org);

  // Ranking-style employee count (energo + report_active)
  const emp = await c.query(
    `
    SELECT COUNT(DISTINCT u.id)::int AS cnt
    FROM users u
    JOIN user_organizations uo ON uo."userId" = u.id
    WHERE uo."organizationId" = $1
      AND u.role IN ('USER','MODERATOR')
      AND u.energo_id IS NOT NULL
      AND u.report_active = true
    `,
    [org.id],
  );
  console.log('RANKING_EMPLOYEES', emp.rows[0]);

  // Today's XP (Asia/Tashkent)
  const today = await c.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp_today,
      COUNT(DISTINCT a.user_id)::int AS users_today
    FROM user_question_attempts a
    JOIN users u ON u.id = a.user_id
    WHERE a.organization_id = $1
      AND (a.answered_at AT TIME ZONE 'Asia/Tashkent')::date
        = (NOW() AT TIME ZONE 'Asia/Tashkent')::date
      AND u.energo_id IS NOT NULL AND u.report_active = true
    `,
    [org.id],
  );
  console.log('TODAY', today.rows[0]);

  // Last 14 days daily totals
  const days = await c.query(
    `
    SELECT (a.answered_at AT TIME ZONE 'Asia/Tashkent')::date AS d,
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp,
      COUNT(DISTINCT a.user_id)::int AS users
    FROM user_question_attempts a
    JOIN users u ON u.id = a.user_id
    WHERE a.organization_id = $1
      AND a.answered_at >= NOW() - INTERVAL '14 days'
      AND u.energo_id IS NOT NULL AND u.report_active = true
    GROUP BY 1
    ORDER BY 1 DESC
    `,
    [org.id],
  );
  console.log('LAST14', days.rows);

  // Same people: XP on ANY org_id for users currently in Fergana
  const anyOrg = await c.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp_all_orgs,
      COUNT(*) FILTER (
        WHERE a.is_correct AND a.counts_for_xp AND a.organization_id = $1
      )::int AS xp_fargona_org,
      COUNT(DISTINCT a.user_id)::int AS users
    FROM user_organizations uo
    JOIN users u ON u.id = uo."userId"
    JOIN user_question_attempts a ON a.user_id = u.id
    WHERE uo."organizationId" = $1
      AND u.role IN ('USER','MODERATOR')
      AND u.energo_id IS NOT NULL
    `,
    [org.id],
  );
  console.log('FARGONA_USERS_XP_ANY_ORG', anyOrg.rows[0]);

  // Duplicate/old org names that might hold Fergana attempts
  const altOrgs = await c.query(`
    SELECT o.id, o.name,
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp
    FROM organizations o
    JOIN user_question_attempts a ON a.organization_id = o.id
    WHERE o.name ILIKE '%farg%' OR o.name ILIKE '%фарг%'
       OR o.name ILIKE '%fergan%'
    GROUP BY o.id
    ORDER BY xp DESC
  `);
  console.log('ALL_FARG_ORGS', altOrgs.rows);

  // Orphans linked to Fergana (user_org) — do they have XP on any org?
  const orphanXp = await c.query(
    `
    SELECT COUNT(DISTINCT u.id)::int AS users,
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp
    FROM user_organizations uo
    JOIN users u ON u.id = uo."userId"
    LEFT JOIN user_question_attempts a ON a.user_id = u.id
    WHERE uo."organizationId" = $1
      AND u.energo_id IS NULL
      AND u.role IN ('USER','MODERATOR')
    `,
    [org.id],
  );
  console.log('FARGONA_ORPHAN_USERS_XP', orphanXp.rows[0]);

  // Compare top branches last 7 days by attempt org
  const topBranches = await c.query(`
    SELECT left(o.name, 70) AS name,
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp7
    FROM user_question_attempts a
    JOIN organizations o ON o.id = a.organization_id
    WHERE a.answered_at >= NOW() - INTERVAL '7 days'
      AND a.is_correct AND a.counts_for_xp
    GROUP BY o.id
    ORDER BY xp7 DESC
    LIMIT 15
  `);
  console.log('TOP_BRANCHES_7D', topBranches.rows);

  // Remaining global orphans without terminated energo_id — self-reg?
  const leftovers = await c.query(`
    SELECT u.email, u.first_name, u.last_name,
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp,
      u.created_at::date AS created,
      EXISTS(SELECT 1 FROM terminated_employees t WHERE t.user_id=u.id) AS in_terminated
    FROM users u
    JOIN user_question_attempts a ON a.user_id=u.id
    WHERE u.energo_id IS NULL AND u.role IN ('USER','MODERATOR')
    GROUP BY u.id
    HAVING COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp) > 0
    ORDER BY xp DESC
  `);
  console.log('LEFTOVER_ORPHANS', leftovers.rows);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
