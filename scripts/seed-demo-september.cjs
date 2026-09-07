/**
 * DEMO/STAGING September ranking seed (idempotent).
 *
 * Guards (ALL required unless noted):
 *   DEMO_SEED_ENABLED=true
 *   DB host is localhost/127.0.0.1 OR database name matches *_demo / *_staging
 *   NEVER allowed: 192.0.6.7 and other known production hosts
 *   If DB name is plain "elektrolearn" on localhost:
 *     DEMO_SEED_CONFIRM_LOCAL=YES
 *
 * Usage:
 *   DEMO_SEED_ENABLED=true DEMO_SEED_CONFIRM_LOCAL=YES npm run seed:demo
 *   npm run seed:demo -- --verify-only
 *
 * Marks rows in demo_seed_meta. Ranking uses attempt_source=DAILY_PLAN
 * (required by branch-analytics after 2026-07-28).
 */
require('dotenv').config();
const crypto = require('crypto');
const { Client } = require('pg');

const DAILY_GOAL = 10;
const BATCH_KEY = 'september-demo-v1';
const ATTEMPT_SOURCE = 'DAILY_PLAN';
const DEMO_EMAIL_DOMAIN = 'demo.elektrolearn.local';
const EMPLOYEES_PER_BRANCH = 20;

/** Owner-supplied Farg'ona cycle: 98 / 92 / 94 */
const FARGONA_CYCLE = [98, 92, 94];

/**
 * Screenshot-based daily distribution (Kunlik hisobot cards).
 * Farg'ona overridden by FARGONA_CYCLE per day index.
 * Other branches: Sept 03 profile (stable demo baseline).
 */
const BRANCH_DEFS = [
  {
    key: 'fargona',
    name: '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, FARG`ONA MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    match: /farg/i,
    basePercent: 95,
  },
  {
    key: 'jizzax',
    name: '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, JIZZAX MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    match: /jizz/i,
    basePercent: 25.5,
  },
  {
    key: 'andijon',
    name: '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, ANDIJON MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    match: /andi/i,
    basePercent: 16.8,
  },
  {
    key: 'qaraqalpaq',
    name: '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, QARAQALPAQ MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    match: /qaraq|karakal/i,
    basePercent: 14.7,
  },
  {
    key: 'xorazm',
    name: '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, XORAZM MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    match: /xoraz|khorezm/i,
    basePercent: 13.6,
  },
  {
    key: 'buxoro',
    name: '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, BUXORO MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    match: /buxor|bukhar/i,
    basePercent: 12.7,
  },
  {
    key: 'namangan',
    name: '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, NAMANGAN MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    match: /namang/i,
    basePercent: 9.4,
  },
  {
    key: 'navoiy',
    name: '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, NAVOIY MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    match: /navoi/i,
    basePercent: 9.1,
  },
  {
    key: 'samarqand',
    name: '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, SAMARQAND MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    match: /samar/i,
    basePercent: 8.7,
  },
  {
    key: 'qashqadaryo',
    name: '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, QASHQADARYO MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    match: /qashqa|kashka/i,
    basePercent: 7.6,
  },
  {
    key: 'surxondaryo',
    name: '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, SURXONDARYO MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    match: /surxon|surkhan/i,
    basePercent: 3.1,
  },
  {
    key: 'toshkent_shahar',
    name: '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, TOSHKENT SHAHAR MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    match: /toshkent shahar|tashkent city/i,
    basePercent: 1.5,
  },
  {
    key: 'sirdaryo',
    name: '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, SIRDARYO MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    match: /sirdar/i,
    basePercent: 0,
  },
  {
    key: 'toshkent',
    name: '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, TOSHKENT MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    match: /toshkent magistral|tashkent magistral/i,
    basePercent: 0,
  },
  {
    key: 'magistralqurilish',
    name: 'Magistraltarmoqqurilish Filiali',
    match: /magistraltarmoq|magistral.*quril/i,
    basePercent: 0,
  },
];

const BLOCKED_HOSTS = new Set([
  '192.0.6.7',
  '192.0.6.3',
  'elektrolearn-api.uzbekistonmet.uz',
  'cabinetid-api.uzbekistonmet.uz',
]);

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  return crypto.createHash('sha256').update(str).digest().readUInt32LE(0);
}

function assertDemoGuard(databaseUrl) {
  if (process.env.DEMO_SEED_ENABLED !== 'true') {
    throw new Error(
      'REFUSED: set DEMO_SEED_ENABLED=true (demo/staging seed only).',
    );
  }
  const u = new URL(databaseUrl);
  const host = (u.hostname || '').toLowerCase();
  const dbName = (u.pathname || '/').replace(/^\//, '').toLowerCase();

  if (BLOCKED_HOSTS.has(host) || host.endsWith('uzbekistonmet.uz')) {
    throw new Error(
      `REFUSED: host ${host} is blocked (production). Demo seed will not run.`,
    );
  }

  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const isDemoName =
    /(_demo|_staging)$/.test(dbName) ||
    dbName === 'elektrolearn_demo' ||
    dbName.includes('demo');

  if (!isLocal && !isDemoName) {
    throw new Error(
      `REFUSED: non-local host "${host}" requires database name *_demo / *_staging (got "${dbName}").`,
    );
  }

  if (isLocal && !isDemoName) {
    if (process.env.DEMO_SEED_CONFIRM_LOCAL !== 'YES') {
      throw new Error(
        `REFUSED: local DB "${dbName}" is not *_demo. Set DEMO_SEED_CONFIRM_LOCAL=YES to seed this local database (never production).`,
      );
    }
  }

  return { host, dbName, isLocal, isDemoName };
}

function listSeptemberDays(endInclusive = '2026-09-07') {
  const days = [];
  const start = new Date('2026-09-01T00:00:00Z');
  const end = new Date(`${endInclusive}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function targetPercentFor(branchKey, dayIndex) {
  if (branchKey === 'fargona') {
    return FARGONA_CYCLE[dayIndex % FARGONA_CYCLE.length];
  }
  const def = BRANCH_DEFS.find((b) => b.key === branchKey);
  const base = def?.basePercent ?? 0;
  // Tiny deterministic wobble (±0.3) so days aren't identical, still near screenshot.
  const wobble = ((dayIndex * 7 + branchKey.length) % 7) * 0.1 - 0.3;
  return Math.max(0, Math.round((base + wobble) * 10) / 10);
}

/** Distribute plan-correct counts across employees to hit targetCompleted points. */
function distributePlanPoints(employeeCount, targetCompleted, rand) {
  const plan = employeeCount * DAILY_GOAL;
  const target = Math.max(0, Math.min(plan, Math.round(targetCompleted)));
  const counts = Array(employeeCount).fill(0);
  let remaining = target;
  // First fill as many full 10s as possible (deterministic order shuffled by rand)
  const order = [...Array(employeeCount).keys()].sort(
    (a, b) => rand() - 0.5 || a - b,
  );
  for (const i of order) {
    if (remaining <= 0) break;
    const give = Math.min(DAILY_GOAL, remaining);
    counts[i] = give;
    remaining -= give;
  }
  return counts;
}

async function ensureMetaTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS demo_seed_meta (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kind text NOT NULL,
      ref_id uuid NOT NULL,
      batch_key text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (kind, ref_id)
    )
  `);
}

async function track(client, kind, refId) {
  await client.query(
    `INSERT INTO demo_seed_meta (kind, ref_id, batch_key)
     VALUES ($1,$2,$3) ON CONFLICT (kind, ref_id) DO NOTHING`,
    [kind, refId, BATCH_KEY],
  );
}

async function resetDemoDataset(client) {
  console.log('--- RESET previous demo_seed_meta rows ---');
  const kinds = ['attempt', 'nes', 'user_org', 'user', 'org'];
  for (const kind of kinds) {
    const { rows } = await client.query(
      `SELECT ref_id FROM demo_seed_meta WHERE kind=$1`,
      [kind],
    );
    const ids = rows.map((r) => r.ref_id);
    if (!ids.length) {
      console.log(`  ${kind}: 0`);
      continue;
    }
    if (kind === 'attempt') {
      await client.query(
        `DELETE FROM user_question_attempts WHERE id = ANY($1::uuid[])`,
        [ids],
      );
    } else if (kind === 'nes') {
      await client.query(`DELETE FROM nes_employees WHERE id = ANY($1::uuid[])`, [
        ids,
      ]);
    } else if (kind === 'user_org') {
      await client.query(
        `DELETE FROM user_organizations WHERE id = ANY($1::uuid[])`,
        [ids],
      );
    } else if (kind === 'user') {
      await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
    } else if (kind === 'org') {
      await client.query(`DELETE FROM organizations WHERE id = ANY($1::uuid[])`, [
        ids,
      ]);
    }
    await client.query(`DELETE FROM demo_seed_meta WHERE kind=$1`, [kind]);
    console.log(`  ${kind}: ${ids.length} removed`);
  }
}

async function loadQuestionPool(client) {
  const { rows } = await client.query(`
    SELECT q.id AS question_id, o.id AS option_id
    FROM questions q
    JOIN question_options o ON o.question_id = q.id AND o.is_correct = true
    WHERE q.is_active = true
    ORDER BY q.id, o.id
  `);
  if (rows.length < DAILY_GOAL) {
    throw new Error(
      `Need at least ${DAILY_GOAL} active questions with correct options (have ${rows.length}). Run curriculum seed first.`,
    );
  }
  // unique questions
  const byQ = new Map();
  for (const r of rows) {
    if (!byQ.has(r.question_id)) byQ.set(r.question_id, r.option_id);
  }
  const pool = [...byQ.entries()].map(([question_id, option_id]) => ({
    question_id,
    option_id,
  }));
  if (pool.length < DAILY_GOAL) {
    throw new Error(`Need ${DAILY_GOAL} distinct questions, have ${pool.length}`);
  }
  return pool;
}

async function upsertDemoOrg(client, def) {
  const externalId = `demo-seed:${def.key}`;
  const existing = await client.query(
    `SELECT id, name FROM organizations WHERE energo_external_id=$1 OR name=$2 LIMIT 1`,
    [externalId, def.name],
  );
  if (existing.rows[0]) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE organizations
       SET name=$2, energo_external_id=$3, report_active=true, archived_at=NULL, updated_at=now()
       WHERE id=$1`,
      [id, def.name, externalId],
    );
    await track(client, 'org', id);
    return id;
  }
  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO organizations
      (id, name, parent_organization_id, is_default, energo_branch_id, energo_external_id,
       branch_code, archived_at, report_active, created_at, updated_at)
     VALUES ($1,$2,NULL,false,$3,$4,$5,NULL,true,now(),now())`,
    [id, def.name, crypto.randomUUID(), externalId, `DEMO-${def.key.toUpperCase()}`],
  );
  await track(client, 'org', id);
  return id;
}

async function upsertDemoUser(client, orgId, orgName, branchKey, index) {
  const email = `${branchKey}.emp${String(index + 1).padStart(3, '0')}@${DEMO_EMAIL_DOMAIN}`;
  const existing = await client.query(`SELECT id FROM users WHERE email=$1`, [
    email,
  ]);
  let userId;
  let energoId;
  if (existing.rows[0]) {
    userId = existing.rows[0].id;
    energoId = crypto.randomUUID();
    await client.query(
      `UPDATE users SET
         first_name=$2, last_name=$3, role='USER',
         energo_id=COALESCE(energo_id, $4),
         report_active=true, login_blocked=false, updated_at=now()
       WHERE id=$1`,
      [userId, `Demo${index + 1}`, branchKey, energoId],
    );
    const u = await client.query(`SELECT energo_id FROM users WHERE id=$1`, [
      userId,
    ]);
    energoId = u.rows[0].energo_id;
  } else {
    userId = crypto.randomUUID();
    energoId = crypto.randomUUID();
    await client.query(
      `INSERT INTO users
        (id, email, energo_id, password_hash, first_name, last_name, role,
         must_change_password, login_blocked, report_active, created_at, updated_at)
       VALUES ($1,$2,$3,NULL,$4,$5,'USER',false,false,true,now(),now())`,
      [userId, email, energoId, `Demo${index + 1}`, branchKey],
    );
  }
  await track(client, 'user', userId);

  const uo = await client.query(
    `SELECT id FROM user_organizations WHERE "userId"=$1 AND "organizationId"=$2`,
    [userId, orgId],
  );
  let uoId;
  if (uo.rows[0]) {
    uoId = uo.rows[0].id;
  } else {
    uoId = crypto.randomUUID();
    await client.query(
      `INSERT INTO user_organizations (id, "userId", "organizationId", created_at)
       VALUES ($1,$2,$3,now())`,
      [uoId, userId, orgId],
    );
  }
  await track(client, 'user_org', uoId);

  const personnel = `D${branchKey.slice(0, 3).toUpperCase()}${String(index + 1).padStart(4, '0')}`;
  const nes = await client.query(
    `SELECT id FROM nes_employees WHERE user_id=$1 AND organization_id=$2`,
    [userId, orgId],
  );
  let nesId;
  if (nes.rows[0]) {
    nesId = nes.rows[0].id;
    await client.query(
      `UPDATE nes_employees SET
         organization_name=$2, division='Demo Division', post='Demo Engineer',
         full_name=$3, first_name=$4, last_name=$5, login=$6,
         last_synced_at=now(), updated_at=now(), raw_payload=$7::jsonb
       WHERE id=$1`,
      [
        nesId,
        orgName,
        `Demo${index + 1} ${branchKey}`,
        `Demo${index + 1}`,
        branchKey,
        email,
        JSON.stringify({ demo: true, batch: BATCH_KEY }),
      ],
    );
  } else {
    nesId = crypto.randomUUID();
    await client.query(
      `INSERT INTO nes_employees
        (id, personnel_number, user_id, organization_id, organization_name,
         division, post, full_name, last_name, first_name, middle_name,
         modified_at, hired_at, login, initial_password, raw_payload, last_synced_at,
         created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'Demo Division','Demo Engineer',$6,$7,$8,'',
               now(), now(), $9, NULL, $10::jsonb, now(), now(), now())`,
      [
        nesId,
        personnel,
        userId,
        orgId,
        orgName,
        `Demo${index + 1} ${branchKey}`,
        branchKey,
        `Demo${index + 1}`,
        email,
        JSON.stringify({ demo: true, batch: BATCH_KEY }),
      ],
    );
  }
  await track(client, 'nes', nesId);

  return userId;
}

async function insertAttemptsForDay(
  client,
  { userId, orgId, day, correctCount, questionPool, rand },
) {
  if (correctCount <= 0) return 0;
  const pool = [...questionPool];
  // deterministic shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, correctCount);
  let inserted = 0;
  for (let i = 0; i < picked.length; i++) {
    const q = picked[i];
    const hour = 8 + Math.floor(rand() * 8);
    const minute = Math.floor(rand() * 60);
    const second = Math.floor(rand() * 60);
    // Asia/Tashkent = UTC+5 → store as UTC
    const answeredAt = new Date(
      `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}+05:00`,
    );
    const id = crypto.randomUUID();
    try {
      await client.query(
        `INSERT INTO user_question_attempts
          (id, user_id, organization_id, question_id, selected_option_id,
           is_correct, heart_lost, counts_for_xp, attempt_source, answered_at)
         VALUES ($1,$2,$3,$4,$5,true,false,true,$6,$7)`,
        [
          id,
          userId,
          orgId,
          q.question_id,
          q.option_id,
          ATTEMPT_SOURCE,
          answeredAt.toISOString(),
        ],
      );
      await track(client, 'attempt', id);
      inserted++;
    } catch (e) {
      if (e.code === '23505') {
        // unique day constraint — skip
        continue;
      }
      throw e;
    }
  }
  return inserted;
}

async function verify(client, days, orgMap) {
  console.log('\n=== VERIFICATION ===');
  const dbInfo = await client.query(
    `SELECT current_database() AS db, inet_server_addr() AS addr`,
  );
  console.log('database:', dbInfo.rows[0]);

  const users = await client.query(
    `SELECT COUNT(*)::int AS n FROM users u
     JOIN demo_seed_meta m ON m.ref_id=u.id AND m.kind='user'`,
  );
  console.log('demo_users:', users.rows[0].n);

  const attempts = await client.query(
    `SELECT COUNT(*)::int AS n,
            COUNT(*) FILTER (WHERE is_correct)::int AS correct,
            MIN(answered_at)::date AS min_d,
            MAX(answered_at)::date AS max_d
     FROM user_question_attempts a
     JOIN demo_seed_meta m ON m.ref_id=a.id AND m.kind='attempt'`,
  );
  console.log('demo_attempts:', attempts.rows[0]);

  const completedPlans = await client.query(
    `
    SELECT COUNT(*)::int AS completed_user_days
    FROM (
      SELECT a.user_id, (a.answered_at AT TIME ZONE 'Asia/Tashkent')::date AS d,
             COUNT(DISTINCT a.question_id) FILTER (WHERE a.is_correct) AS c
      FROM user_question_attempts a
      JOIN demo_seed_meta m ON m.ref_id=a.id AND m.kind='attempt'
      GROUP BY 1,2
      HAVING COUNT(DISTINCT a.question_id) FILTER (WHERE a.is_correct) >= $1
    ) x
    `,
    [DAILY_GOAL],
  );
  console.log('completed_plan_user_days:', completedPlans.rows[0]);

  const orphans = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM demo_seed_meta m
        LEFT JOIN user_question_attempts a ON a.id=m.ref_id
        WHERE m.kind='attempt' AND a.id IS NULL)::int AS orphan_attempts,
      (SELECT COUNT(*) FROM demo_seed_meta m
        LEFT JOIN users u ON u.id=m.ref_id
        WHERE m.kind='user' AND u.id IS NULL)::int AS orphan_users
  `);
  console.log('orphans:', orphans.rows[0]);

  const lastDay = days[days.length - 1];
  console.log(`\nRanking snapshot for ${lastDay}:`);
  for (const [key, orgId] of Object.entries(orgMap)) {
    const emp = await client.query(
      `SELECT COUNT(*)::int AS n FROM users u
       JOIN user_organizations uo ON uo."userId"=u.id AND uo."organizationId"=$1
       WHERE u.energo_id IS NOT NULL AND u.report_active=true AND u.role IN ('USER','MODERATOR')`,
      [orgId],
    );
    const employees = emp.rows[0].n;
    const plan = employees * DAILY_GOAL;
    const done = await client.query(
      `
      SELECT COALESCE(SUM(LEAST(c, $3)),0)::int AS completed
      FROM (
        SELECT COUNT(DISTINCT a.question_id) FILTER (WHERE a.is_correct)::int AS c
        FROM user_question_attempts a
        JOIN users u ON u.id=a.user_id
        WHERE a.organization_id=$1
          AND (a.answered_at AT TIME ZONE 'Asia/Tashkent')::date = $2::date
          AND (a.attempt_source IS NULL OR a.attempt_source='DAILY_PLAN')
          AND u.energo_id IS NOT NULL
        GROUP BY a.user_id
      ) x
      `,
      [orgId, lastDay, DAILY_GOAL],
    );
    const completed = Number(done.rows[0].completed) || 0;
    const percent = plan > 0 ? Math.round((completed / plan) * 1000) / 10 : 0;
    const target = targetPercentFor(key, days.indexOf(lastDay));
    console.log(
      `  ${key}: actual=${percent}% target≈${target}% (${completed}/${plan}) employees=${employees}`,
    );
  }

  const blocked = BLOCKED_HOSTS.has(
    new URL(process.env.DATABASE_URL).hostname.toLowerCase(),
  );
  console.log('is_production_host:', blocked);
  console.log('NOT production (guard passed):', !blocked);
}

async function main() {
  const verifyOnly = process.argv.includes('--verify-only');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');

  const guard = assertDemoGuard(url);
  console.log('Guard OK:', guard);

  const client = new Client({ connectionString: url });
  await client.connect();
  await ensureMetaTable(client);

  const todayTz = new Date().toLocaleString('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA gives YYYY-MM-DD
  const endDay =
    process.env.DEMO_SEED_END_DATE ||
    (todayTz < '2026-09-01'
      ? '2026-09-07'
      : todayTz > '2026-09-30'
        ? '2026-09-30'
        : todayTz);
  const days = listSeptemberDays(endDay);
  console.log('September days:', days[0], '→', days[days.length - 1], `(${days.length})`);

  if (verifyOnly) {
    const orgMap = {};
    for (const def of BRANCH_DEFS) {
      const r = await client.query(
        `SELECT id FROM organizations WHERE energo_external_id=$1`,
        [`demo-seed:${def.key}`],
      );
      if (r.rows[0]) orgMap[def.key] = r.rows[0].id;
    }
    await verify(client, days, orgMap);
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    await resetDemoDataset(client);
    const questionPool = await loadQuestionPool(client);
    console.log('question_pool:', questionPool.length);

    const orgMap = {};
    const usersByOrg = {};

    console.log('--- CREATE demo orgs/users/nes ---');
    for (const def of BRANCH_DEFS) {
      const orgId = await upsertDemoOrg(client, def);
      orgMap[def.key] = orgId;
      usersByOrg[def.key] = [];
      for (let i = 0; i < EMPLOYEES_PER_BRANCH; i++) {
        const uid = await upsertDemoUser(client, orgId, def.name, def.key, i);
        usersByOrg[def.key].push(uid);
      }
      console.log(`  ${def.key}: org=${orgId} users=${EMPLOYEES_PER_BRANCH}`);
    }

    console.log('--- GENERATE September attempts ---');
    let totalAttempts = 0;
    let totalCorrect = 0;

    for (let di = 0; di < days.length; di++) {
      const day = days[di];
      for (const def of BRANCH_DEFS) {
        const pct = targetPercentFor(def.key, di);
        const employees = usersByOrg[def.key];
        const plan = employees.length * DAILY_GOAL;
        const targetCompleted = Math.round((plan * pct) / 100);
        const rand = mulberry32(hashSeed(`${BATCH_KEY}|${def.key}|${day}`));
        const counts = distributePlanPoints(
          employees.length,
          targetCompleted,
          rand,
        );
        for (let ui = 0; ui < employees.length; ui++) {
          const n = await insertAttemptsForDay(client, {
            userId: employees[ui],
            orgId: orgMap[def.key],
            day,
            correctCount: counts[ui],
            questionPool,
            rand,
          });
          totalAttempts += n;
          totalCorrect += n;
        }
      }
      if (di === 0 || di === days.length - 1 || di % 3 === 0) {
        console.log(`  day ${day} seeded`);
      }
    }

    await client.query('COMMIT');
    console.log('\nSUMMARY');
    console.log('  batch:', BATCH_KEY);
    console.log('  branches:', BRANCH_DEFS.length);
    console.log('  demo_users:', BRANCH_DEFS.length * EMPLOYEES_PER_BRANCH);
    console.log('  attempts_inserted:', totalAttempts);
    console.log('  correct_answers:', totalCorrect);
    console.log('  date_range:', days[0], '→', days[days.length - 1]);
    console.log(
      '  telegram: not sent (use staging bot + DEMO_SEED_TELEGRAM_SEND if needed)',
    );

    await verify(client, days, orgMap);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('\nFAILED:', e.message || e);
  process.exit(1);
});
