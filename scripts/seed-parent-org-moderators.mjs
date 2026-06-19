/**
 * "O'zbekiston Milliy Elektr Tarmoqlari" AJ — bosh tashkilot uchun moderatorlar.
 *
 * Bajaradigan ishlar:
 * 1) Berilgan org uchun isDefault=true qiladi (asosiy tashkilot).
 * 2) 4 ta yangi moderator yaratadi va parent org'ga biriktiradi.
 *    Parol bo'sh yuboriladi -> server avtomat generatsiya qiladi (Excel exportda).
 * 3) Dilshod O'rinboyev + Shuxrat Dadadjanov ham parent org'ga biriktiriladi.
 *
 * Ishga tushirish (production'da):
 *   SUPERADMIN_PASSWORD=...env... node scripts/seed-parent-org-moderators.mjs
 *
 * Local test uchun:
 *   API_URL=http://localhost:3000/api SUPERADMIN_PASSWORD=!Qw3rty \
 *     node scripts/seed-parent-org-moderators.mjs
 */

// Server ichida ishlaganda localhost ishlatamiz (tezroq + tashqi traffic yo'q)
const API_URL =
  process.env.API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
const EMAIL = process.env.SUPERADMIN_EMAIL || 'elektroLearn@admin.com';
const PASSWORD = process.env.SUPERADMIN_PASSWORD || '';

const PARENT_ORG_ID = '4a6bbe5f-982d-498f-82ac-5f6e05ecfd2b';

// Yangi moderatorlar — phone'lar izoh sifatida saqlanadi (user.phone hozircha yo'q).
const NEW_MODERATORS = [
  { firstName: 'Xusan', lastName: "Bo'riyev", phone: '900924757', email: 'x.boriyev@uzbekistonmet.uz' },
  { firstName: 'Gafur', lastName: 'Raxmatov', phone: '977988988', email: 'g.raxmatov@uzbekistonmet.uz' },
  { firstName: 'Saken', lastName: 'Toktarov', phone: '998707012', email: 's.toktarov@uzbekistonmet.uz' },
  { firstName: 'Jamol', lastName: 'Xolmatov', phone: '998070722', email: 'j.xolmatov@uzbekistonmet.uz' },
];

// Allaqachon mavjud moderatorlar — parent org'ga biriktirish kerak.
const EXISTING_MODERATOR_EMAILS = [
  'dilshodurinboyev272@gmail.com',
  'sh.dadajonov@uzbekistonmet.uz',
];

async function api(path, opts = {}, token) {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${path}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  if (!PASSWORD) {
    console.error('SUPERADMIN_PASSWORD env kerak');
    process.exit(1);
  }

  console.log('1) SuperAdmin login...');
  const login = await api('/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const token = login.data.accessToken;

  console.log('2) Parent org -> isDefault=true');
  try {
    await api(
      `/admin/organizations/${PARENT_ORG_ID}`,
      { method: 'PUT', body: JSON.stringify({ isDefault: true }) },
      token,
    );
    console.log('   OK: parent org asosiy qilib belgilandi');
  } catch (e) {
    console.error('   FAIL:', e.message || e);
  }

  console.log('3) Yangi moderatorlar yaratish...');
  const report = { created: [], skipped: [], failed: [], assigned: [] };

  for (const m of NEW_MODERATORS) {
    try {
      // password bermayapmiz - server avtomat generatsiya qiladi
      const result = await api(
        '/admin/users/moderators',
        {
          method: 'POST',
          body: JSON.stringify({
            email: m.email,
            firstName: m.firstName,
            lastName: m.lastName,
            organizationId: PARENT_ORG_ID,
          }),
        },
        token,
      );
      report.created.push({
        email: m.email,
        phone: m.phone,
        name: `${m.lastName} ${m.firstName}`,
      });
      console.log(`   OK: ${m.lastName} ${m.firstName} -> ${m.email}`);
      if (result?.initialPassword) {
        console.log(`      Parol: ${result.initialPassword}`);
      }
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes('allaqachon mavjud') || msg.includes('409')) {
        report.skipped.push({ email: m.email, name: `${m.lastName} ${m.firstName}` });
        console.log(`   SKIP (mavjud): ${m.email}`);
      } else {
        report.failed.push({ email: m.email, error: msg });
        console.error(`   FAIL: ${m.email}`, msg);
      }
    }
  }

  console.log('4) Mavjud moderatorlarni parent org\'ga biriktirish...');
  // Hamma userlarni olib, email bo'yicha topamiz
  const allUsers = await api('/admin/users?limit=500', {}, token);
  const usersByEmail = new Map(
    (allUsers?.data ?? []).map((u) => [String(u.email).toLowerCase(), u]),
  );

  for (const email of EXISTING_MODERATOR_EMAILS) {
    const u = usersByEmail.get(email.toLowerCase());
    if (!u) {
      report.failed.push({ email, error: 'user topilmadi' });
      console.error(`   FAIL: ${email} topilmadi`);
      continue;
    }
    try {
      await api(
        `/admin/organizations/${PARENT_ORG_ID}/users`,
        {
          method: 'POST',
          body: JSON.stringify({ userId: u.id }),
        },
        token,
      );
      report.assigned.push({ email, id: u.id });
      console.log(`   OK: ${email} -> parent org`);
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes('allaqachon biriktirilgan')) {
        console.log(`   SKIP (allaqachon biriktirilgan): ${email}`);
      } else {
        report.failed.push({ email, error: msg });
        console.error(`   FAIL: ${email}`, msg);
      }
    }
  }

  console.log('\n=== HISOBOT ===');
  console.log(JSON.stringify(report, null, 2));
  console.log(
    '\nParollarni "Moderators" sahifasidagi "Excel export" tugmasi orqali oling.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
