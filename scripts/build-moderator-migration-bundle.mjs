/**
 * Production API dan moderator migratsiya JSON yig'adi.
 * Ishlatish:
 *   node scripts/build-moderator-migration-bundle.mjs "C:\path\moderatorlar.xlsx"
 *
 * Env (ixtiyoriy):
 *   ELEKTRO_API=https://elektrolearn-api.uzbekistonmet.uz/api
 *   ELEKTRO_ADMIN_EMAIL / ELEKTRO_ADMIN_PASSWORD
 *   ENERGO_API=https://cabinetid-api.uzbekistonmet.uz
 *   ENERGO_ADMIN_LOGIN / ENERGO_ADMIN_PASSWORD
 */
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const ELEKTRO_API =
  process.env.ELEKTRO_API ?? 'https://elektrolearn-api.uzbekistonmet.uz/api';
const ENERGO_API =
  process.env.ENERGO_API ?? 'https://cabinetid-api.uzbekistonmet.uz';
const ELEKTRO_EMAIL =
  process.env.ELEKTRO_ADMIN_EMAIL ?? 'elektroLearn@admin.com';
const ELEKTRO_PASSWORD = process.env.ELEKTRO_ADMIN_PASSWORD ?? '!Qw3rty';
const ENERGO_LOGIN = process.env.ENERGO_ADMIN_LOGIN ?? 'admin';
const ENERGO_PASSWORD = process.env.ENERGO_ADMIN_PASSWORD ?? 'Q!w3trey';

const excelPath =
  process.argv[2] ??
  String.raw`c:\Users\User\Downloads\moderatorlar-login-parollar (6).xlsx`;

async function request(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      typeof body === 'object' && body?.message
        ? Array.isArray(body.message)
          ? body.message.join(', ')
          : body.message
        : text.slice(0, 300);
    throw new Error(`${res.status} ${url}: ${msg}`);
  }
  return body;
}

async function loginElektro() {
  const res = await request(`${ELEKTRO_API}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ELEKTRO_EMAIL, password: ELEKTRO_PASSWORD }),
  });
  const token = res?.data?.accessToken;
  if (!token) throw new Error('ElektroLearn token olinmadi');
  return token;
}

async function loginEnergo() {
  const res = await request(`${ENERGO_API}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: ENERGO_LOGIN, password: ENERGO_PASSWORD }),
  });
  const token = res?.accessToken;
  if (!token) throw new Error('Energo ID token olinmadi');
  return token;
}

function readExcelRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  return rows
    .slice(1)
    .map((row, i) => ({
      index: i + 1,
      fullName: String(row[2] ?? '').trim(),
      login: String(row[3] ?? '')
        .trim()
        .toLowerCase(),
      password: String(row[4] ?? '').trim(),
      organizationName: String(row[5] ?? '').trim(),
      email: String(row[6] ?? row[3] ?? '')
        .trim()
        .toLowerCase(),
    }))
    .filter((r) => r.fullName || r.login);
}

function normOrg(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/["«»]/g, '');
}

function normName(value) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
    з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu',
    я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
  };
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('');
}

function orgMatches(excelOrg, candidateOrg) {
  const a = normOrg(excelOrg);
  const b = normOrg(candidateOrg);
  if (!a || !b) return true;
  return b.includes(a) || a.includes(b);
}

async function fetchLegacyModerators(token) {
  return request(`${ELEKTRO_API}/admin/migrations/legacy-moderators`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function previewElektroBulk(token, fileBase64) {
  return request(`${ELEKTRO_API}/admin/migrations/legacy-moderators/bulk/preview`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fileBase64 }),
  });
}

async function previewEnergoBulk(token, fileBase64) {
  return request(
    `${ENERGO_API}/admin/migrations/elektrolearn-moderators/preview`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileBase64 }),
    },
  );
}

async function searchEnergoUser(token, search) {
  const qs = new URLSearchParams({
    search,
    status: 'ACTIVE',
    limit: '20',
    page: '1',
  });
  const res = await request(`${ENERGO_API}/admin/users?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res?.items ?? res?.data ?? res?.users ?? [];
}

function pickLegacy(legacyList, row) {
  const hints = new Set([
    row.login,
    row.email,
    row.login.split('@')[0],
  ].filter(Boolean));

  return (
    legacyList.find((u) => hints.has((u.email ?? '').trim().toLowerCase())) ??
    legacyList.find((u) => {
      const parts = row.fullName.trim().split(/\s+/);
      return (
        normName(u.lastName) === normName(parts[0]) &&
        normName(u.firstName) === normName(parts[1])
      );
    }) ??
    null
  );
}

function enrichWithFilial(excelRows, energoMatches, legacyList) {
  return excelRows.map((row) => {
    const energo = energoMatches.find((m) => m.row.index === row.index);
    const legacy = pickLegacy(legacyList, row);
    const filialOk = energo?.energoUser
      ? orgMatches(row.organizationName, energo.energoUser.organizationName)
      : null;

    let confidence = energo?.confidence ?? 'none';
    const reasons = [...(energo?.matchReasons ?? [])];
    if (filialOk === false) {
      confidence = confidence === 'high' ? 'medium' : confidence === 'medium' ? 'low' : confidence;
      reasons.push(`Filial mos emas: Excel="${row.organizationName}", Energo="${energo?.energoUser?.organizationName ?? ''}"`);
    } else if (filialOk === true && row.organizationName) {
      reasons.push('Filial mos');
    }

    return {
      excel: {
        index: row.index,
        fullName: row.fullName,
        login: row.login,
        organizationName: row.organizationName,
        email: row.email,
      },
      legacyModerator: legacy
        ? {
            id: legacy.id,
            email: legacy.email,
            firstName: legacy.firstName,
            lastName: legacy.lastName,
            organizations: (legacy.organizations ?? []).map((o) => ({
              id: o.organizationId ?? o.organization?.id,
              name: o.organization?.name ?? o.name,
            })),
          }
        : null,
      energoId: energo?.energoUser
        ? {
            ...energo.energoUser,
            filialMatch: filialOk,
          }
        : null,
      energoConfidence: confidence,
      energoMatchReasons: reasons,
      energoStep1Ready:
        !!energo?.energoUser &&
        (confidence === 'high' || confidence === 'medium'),
    };
  });
}

function mergeElektroPreview(items, elektroPreview) {
  const byIndex = new Map(
    (elektroPreview?.items ?? []).map((it) => [it.row.index, it]),
  );
  return items.map((item) => {
    const el = byIndex.get(item.excel.index);
    const canAutoMerge = !!(
      item.legacyModerator &&
      el?.target &&
      (el.confidence === 'high' || el.confidence === 'medium') &&
      item.energoStep1Ready !== false
    );
    return {
      ...item,
      elektroLearnTarget: el?.target ?? null,
      elektroConfidence: el?.confidence ?? 'none',
      elektroMatchReasons: el?.matchReasons ?? [],
      canAutoMerge,
      merge: canAutoMerge
        ? {
            sourceUserId: item.legacyModerator.id,
            targetUserId: el.target.id,
            permissionMerge: 'prefer-source',
          }
        : null,
      energoStep1: item.energoId
        ? {
            userId: item.energoId.id,
            applyModeratorRole: item.energoStep1Ready,
          }
        : null,
    };
  });
}

async function main() {
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel topilmadi: ${excelPath}`);
  }

  const buffer = fs.readFileSync(excelPath);
  const fileBase64 = buffer.toString('base64');
  const excelRows = readExcelRows(buffer);

  console.log('ElektroLearn production login...');
  const elektroToken = await loginElektro();

  console.log('Energo ID production login...');
  const energoToken = await loginEnergo();

  console.log('Legacy moderatorlar...');
  const legacyList = await fetchLegacyModerators(elektroToken);
  console.log(`  → ${legacyList.length} ta (energo_id yo'q)`);

  console.log('Energo ID bulk preview...');
  const energoPreview = await previewEnergoBulk(energoToken, fileBase64);

  console.log('ElektroLearn bulk preview...');
  const elektroPreview = await previewElektroBulk(elektroToken, fileBase64);

  let items = enrichWithFilial(
    excelRows,
    energoPreview.matches ?? [],
    legacyList,
  );
  items = mergeElektroPreview(items, elektroPreview);

  const bundle = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      excelFile: path.basename(excelPath),
      elektroApi: ELEKTRO_API,
      energoApi: ENERGO_API,
    },
    summary: {
      excelRows: excelRows.length,
      legacyModeratorsInDb: legacyList.length,
      energoMatched: items.filter((i) => i.energoId).length,
      energoStep1Ready: items.filter((i) => i.energoStep1?.applyModeratorRole).length,
      legacyFound: items.filter((i) => i.legacyModerator).length,
      targetFound: items.filter((i) => i.elektroLearnTarget).length,
      readyToMerge: items.filter((i) => i.canAutoMerge).length,
      needsManual: items.filter((i) => !i.canAutoMerge).length,
      energoPreview: energoPreview.summary,
      elektroPreview: elektroPreview.summary,
    },
    items,
    apply: {
      energoId: {
        endpoint: 'POST /admin/migrations/elektrolearn-moderators/apply',
        onlyUserIds: items
          .filter((i) => i.energoStep1?.applyModeratorRole)
          .map((i) => i.energoId.id),
      },
      elektroLearn: {
        endpoint: 'POST /admin/migrations/legacy-moderators/bulk/from-json',
        merges: items.filter((i) => i.merge).map((i) => i.merge),
      },
    },
  };

  const outPath = path.join(
    path.dirname(excelPath),
    'moderator-migration-bundle.json',
  );
  fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2), 'utf-8');

  console.log('\n✓ JSON yozildi:', outPath);
  console.log('  Excel qatorlar:', bundle.summary.excelRows);
  console.log('  Energo mos:', bundle.summary.energoMatched);
  console.log('  Energo MODERATOR (auto):', bundle.summary.energoStep1Ready);
  console.log('  Eski moderator topildi:', bundle.summary.legacyFound);
  console.log('  Target topildi:', bundle.summary.targetFound);
  console.log('  Birlashtirishga tayyor:', bundle.summary.readyToMerge);
  console.log('  Qo\'lda kerak:', bundle.summary.needsManual);

  const manual = items.filter((i) => !i.canAutoMerge);
  if (manual.length) {
    console.log('\nQo\'lda tekshirish kerak:');
    for (const m of manual) {
      console.log(
        `  #${m.excel.index} ${m.excel.fullName} | legacy=${m.legacyModerator ? '✓' : '—'} energo=${m.energoId?.login ?? '—'} target=${m.elektroLearnTarget?.email ?? '—'}`,
      );
    }
  }
}

main().catch((e) => {
  console.error('XATO:', e.message);
  process.exit(1);
});
