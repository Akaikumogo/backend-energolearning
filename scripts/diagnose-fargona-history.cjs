require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const orgId = '81e1bbcf-b4d1-40b4-852b-a7cd71d7b2d3';

  // All-time attempts for current Fergana members (any org_id on attempt)
  const hist = await c.query(
    `
    SELECT
      MIN(a.answered_at) AS first_ans,
      MAX(a.answered_at) AS last_ans,
      COUNT(*)::int AS attempts,
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp,
      COUNT(DISTINCT a.organization_id)::int AS org_ids
    FROM user_organizations uo
    JOIN users u ON u.id = uo."userId"
    JOIN user_question_attempts a ON a.user_id = u.id
    WHERE uo."organizationId" = $1
    `,
    [orgId],
  );
  console.log('CURRENT_MEMBERS_HISTORY', hist.rows[0]);

  // Orgs where current Fergana members earned XP
  const byOrg = await c.query(
    `
    SELECT left(o.name, 80) AS name, o.id,
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp
    FROM user_organizations uo
    JOIN users u ON u.id = uo."userId"
    JOIN user_question_attempts a ON a.user_id = u.id
    JOIN organizations o ON o.id = a.organization_id
    WHERE uo."organizationId" = $1
      AND a.is_correct AND a.counts_for_xp
    GROUP BY o.id
    ORDER BY xp DESC
    LIMIT 20
    `,
    [orgId],
  );
  console.log('MEMBERS_XP_BY_ATTEMPT_ORG', byOrg.rows);

  // How many Fergana members have ZERO attempts ever
  const zero = await c.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE u.energo_id IS NOT NULL AND u.report_active)::int AS active_rankable,
      COUNT(*) FILTER (
        WHERE u.energo_id IS NOT NULL AND u.report_active
          AND NOT EXISTS (SELECT 1 FROM user_question_attempts a WHERE a.user_id = u.id)
      )::int AS active_never_answered,
      COUNT(*) FILTER (WHERE u.energo_id IS NULL)::int AS orphans
    FROM user_organizations uo
    JOIN users u ON u.id = uo."userId"
    WHERE uo."organizationId" = $1 AND u.role IN ('USER','MODERATOR')
    `,
    [orgId],
  );
  console.log('MEMBER_BREAKDOWN', zero.rows[0]);

  // terminated with Fergana in org name — sample
  const termF = await c.query(`
    SELECT COUNT(*)::int AS cnt,
      COUNT(*) FILTER (WHERE energo_id IS NOT NULL)::int AS with_eid
    FROM terminated_employees
    WHERE organization_name ILIKE '%farg%' OR organization_name ILIKE '%фарг%'
  `);
  console.log('TERMINATED_FARGONA', termF.rows[0]);

  // Can we reattach terminated Fergana users who still exist?
  const reattachable = await c.query(`
    SELECT t.login, t.first_name, t.last_name, t.personnel_number, t.energo_id,
      u.id AS user_id, u.energo_id AS current_eid, u.report_active,
      (SELECT COUNT(*) FROM user_question_attempts a WHERE a.user_id=u.id AND a.is_correct AND a.counts_for_xp)::int AS xp
    FROM terminated_employees t
    JOIN users u ON u.id = t.user_id
    WHERE (t.organization_name ILIKE '%farg%' OR t.organization_name ILIKE '%фарг%')
      AND u.energo_id IS NULL
    ORDER BY xp DESC
    LIMIT 30
  `);
  console.log('TERMINATED_FARGONA_STILL_ORPHAN', reattachable.rows);

  // Total XP ever in DB by month for Fergana org id
  const months = await c.query(
    `
    SELECT to_char(a.answered_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') AS ym,
      COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS xp
    FROM user_question_attempts a
    WHERE a.organization_id = $1
    GROUP BY 1
    ORDER BY 1
    `,
    [orgId],
  );
  console.log('FARGONA_ORG_MONTHS', months.rows);

  // Maybe old org id exists archived?
  const archived = await c.query(`
    SELECT id, name, archived_at IS NOT NULL AS archived,
      (SELECT COUNT(*) FROM user_question_attempts a WHERE a.organization_id=o.id AND a.is_correct AND a.counts_for_xp)::int AS xp
    FROM organizations o
    WHERE name ILIKE '%farg%' OR name ILIKE '%фарг%' OR name ILIKE '%fergan%'
    ORDER BY xp DESC
  `);
  console.log('ALL_FARG_ORGS_ARCHIVED', archived.rows);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
