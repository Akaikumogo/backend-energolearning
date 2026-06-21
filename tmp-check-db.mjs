import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const roles = await c.query(
  'SELECT role, COUNT(*)::int AS c FROM users GROUP BY role ORDER BY role',
);
console.log('USERS', JSON.stringify(roles.rows));
const content = await c.query(`
  SELECT 'levels' t, COUNT(*)::int c FROM levels
  UNION ALL SELECT 'theories', COUNT(*)::int FROM theories
  UNION ALL SELECT 'questions', COUNT(*)::int FROM questions
  UNION ALL SELECT 'moderators', COUNT(*)::int FROM users WHERE role='MODERATOR'
  UNION ALL SELECT 'nes_employees', COUNT(*)::int FROM nes_employees
`);
console.log('KEEP_CHECK', JSON.stringify(content.rows));
await c.end();
