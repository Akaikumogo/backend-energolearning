/**
 * Rasmdagi xodimlarni productiondagi MAVJUD filiallarga moderator sifatida qo'shadi.
 * Yangi filial YARATMAYDI. Filial ID lari production ro'yxatidan aniq biriktirilgan.
 */
import crypto from 'crypto';

const API_URL =
  process.env.API_URL || 'https://elektrolearn-api.uzbekistonmet.uz/api';
const EMAIL = process.env.SUPERADMIN_EMAIL || 'elektroLearn@admin.com';
const PASSWORD = process.env.SUPERADMIN_PASSWORD || '';
const DELETE_WRONG = process.env.DELETE_WRONG_MODERATORS === '1';

/** Production organizationId mapping (O'zbekiston MET filiallari) */
const ORG_IDS = {
  TOSHKENT_SHAHAR: '0fa4f554-9080-4aea-ac09-703f7f1ced5f',
  TOSHKENT: '2a0939fb-4840-4e2f-a0eb-1dd51e0ffc69',
  ANDIJON: '46f75b25-a7f7-45b6-8525-40c8948ea907',
  NAMANGAN: '108e6c1d-ca89-4880-9f87-4b8621567657',
  FARGONA: 'f0d074e3-29ff-42e9-9710-94e5fa38f825',
  SIRDARYO: '7203e019-3d1f-4d4a-8c93-d494bfa10985',
  JIZZAX: '8ec2a02e-d3d5-4755-9d32-a37e603c9785',
  SAMARQAND: '335e8834-bda8-4fdb-b3ef-ebd7d7e86013',
  QASHQADARYO: '125562cc-12d9-4abb-80ec-bda410d614f1',
  SURXONDARYO: '6f21b5e6-b6a8-4241-ad7f-26004a506e7b',
  NAVOIY: 'eeb19343-9305-4a43-92e6-7f0900ee4b69',
  BUXORO: 'b5faa3c4-6b53-4777-b3d9-61afc14e8533',
  XORAZM: 'd9d6f2a3-4db4-423b-8e82-ae2f15cd6797',
  QARAQALPAQ: '1046c3bd-50ff-42c5-aeb1-c19b195f54bc',
  ENERGO_IT: 'b22aa9d2-145e-4019-960d-a58cda97a5ef',
  MAGISTRAL_QURILISH: 'dd9900c1-73f5-45d9-a627-02a0278fd38f',
  GARAJ: 'e92bd462-0c5b-4f94-a1a7-1e40894769ad',
};

const MODERATORS = [
  { orgId: ORG_IDS.TOSHKENT_SHAHAR, firstName: 'Madina', lastName: 'Rixsiboyeva' },
  { orgId: ORG_IDS.TOSHKENT, firstName: 'Otajon', lastName: 'Ergashev' },
  { orgId: ORG_IDS.ANDIJON, firstName: 'Dilshodbek', lastName: 'Tojiboyev' },
  { orgId: ORG_IDS.ANDIJON, firstName: 'Oyatbek', lastName: 'Voxidov' },
  { orgId: ORG_IDS.NAMANGAN, firstName: 'Voxidjon', lastName: 'Urozov' },
  { orgId: ORG_IDS.NAMANGAN, firstName: 'Erkin', lastName: 'Negmatullayev' },
  { orgId: ORG_IDS.FARGONA, firstName: 'Adxam', lastName: 'Teshaboyev' },
  { orgId: ORG_IDS.SIRDARYO, firstName: 'Ulugbek', lastName: 'Xolmatov' },
  { orgId: ORG_IDS.JIZZAX, firstName: 'Shoxrux', lastName: 'Otaboyev' },
  { orgId: ORG_IDS.JIZZAX, firstName: 'Siroj', lastName: 'Abdullayev' },
  { orgId: ORG_IDS.SAMARQAND, firstName: 'Alisher', lastName: 'Safarov' },
  { orgId: ORG_IDS.SAMARQAND, firstName: 'Sobitjon', lastName: 'Valiboyev' },
  { orgId: ORG_IDS.QASHQADARYO, firstName: 'Muhammad', lastName: 'Omonov' },
  { orgId: ORG_IDS.QASHQADARYO, firstName: "O'giloy", lastName: 'Hazratova' },
  { orgId: ORG_IDS.SURXONDARYO, firstName: 'Shomil', lastName: 'Sandov' },
  { orgId: ORG_IDS.SURXONDARYO, firstName: 'Dildora', lastName: 'Djurayeva' },
  { orgId: ORG_IDS.NAVOIY, firstName: 'Saloxiddin', lastName: 'Boboqandov' },
  { orgId: ORG_IDS.NAVOIY, firstName: 'Azamat', lastName: "Xo'jamurodov" },
  { orgId: ORG_IDS.BUXORO, firstName: 'Erkin', lastName: 'Azizov' },
  { orgId: ORG_IDS.XORAZM, firstName: 'Bekzod', lastName: 'Matyazov' },
  { orgId: ORG_IDS.QARAQALPAQ, firstName: 'Paraxat', lastName: 'Tashimov' },
  { orgId: ORG_IDS.QARAQALPAQ, firstName: 'Amangeldi', lastName: 'Yarilkapov' },
  { orgId: ORG_IDS.ENERGO_IT, firstName: 'Sanjar', lastName: 'Tolipov' },
  { orgId: ORG_IDS.MAGISTRAL_QURILISH, firstName: 'Shaxnoza', lastName: 'Xujamova' },
  { orgId: ORG_IDS.GARAJ, firstName: 'Dilshod', lastName: 'Kayumov' },
];

function genPassword() {
  return crypto.randomBytes(6).toString('base64url').slice(0, 10);
}

function genEmail(firstName, lastName, orgId) {
  const slug = `${firstName}.${lastName}.${orgId.slice(0, 8)}`
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '');
  return `${slug}@moderator.elektrolearn.uz`;
}

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

  const login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const token = login.data.accessToken;

  if (DELETE_WRONG) {
    const mods = await api(
      '/admin/users/moderators?limit=200',
      {},
      token,
    );
    for (const m of mods.data ?? []) {
      if (String(m.email).endsWith('@moderator.elektrolearn.uz')) {
        try {
          await api(`/admin/users/${m.id}`, { method: 'DELETE' }, token);
          console.log('DELETED wrong moderator:', m.email);
        } catch (e) {
          console.log('DELETE fail:', m.email, String(e.message || e));
        }
      }
    }
  }

  const orgs = await api('/admin/organizations', {}, token);
  const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

  const report = { created: [], skipped: [], failed: [] };

  for (const mod of MODERATORS) {
    const orgName = orgMap.get(mod.orgId) ?? mod.orgId;
    const email = genEmail(mod.firstName, mod.lastName, mod.orgId);
    const password = genPassword();

    try {
      await api(
        '/admin/users/moderators',
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            firstName: mod.firstName,
            lastName: mod.lastName,
            organizationId: mod.orgId,
          }),
        },
        token,
      );
      report.created.push({ email, password, org: orgName, ...mod });
      console.log(`OK: ${mod.lastName} -> ${orgName}`);
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes('allaqachon mavjud') || msg.includes('409')) {
        report.skipped.push({ email, org: orgName, ...mod });
        console.log(`SKIP: ${email}`);
      } else {
        report.failed.push({ email, org: orgName, error: msg, ...mod });
        console.error(`FAIL: ${mod.lastName}`, msg);
      }
    }
  }

  console.log('\n=== HISOBOT ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
