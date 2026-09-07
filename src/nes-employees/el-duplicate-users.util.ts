/**
 * Dublikat foydalanuvchilarni guruhlash uchun yordamchi.
 * Energo ID da tab № o'zgartirganda (8192 → 81922) ikkita user paydo bo'lishi mumkin.
 * Hech narsani o'zgartirmaydi — faqat guruhlaydi.
 */

export type UserRow = {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  energoId: string | null;
  createdAt: Date;
};

export type DuplicateCluster = {
  keeperId: string;
  memberIds: string[];
};

/** 8192 ↔ 81922 (oxiriga 1–2 raqam). */
function personnelNumbersRelated(a: string, b: string): boolean {
  const x = (a || '').trim();
  const y = (b || '').trim();
  if (!x || !y) return false;
  if (x === y) return true;
  if (!/^\d+$/.test(x) || !/^\d+$/.test(y)) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (!long.startsWith(short)) return false;
  const extra = long.slice(short.length);
  return extra.length >= 1 && extra.length <= 2;
}

/** s.dadadjanov8192 → dadajanov (dj soft) */
function loginNameStem(login: string) {
  const match = (login || '').trim().toLowerCase().match(/^[a-z]\.([a-z]+)\d+/i);
  if (!match?.[1]) return '';
  return match[1].replace(/dzh/g, 'j').replace(/dj/g, 'j').replace(/zh/g, 'j');
}

function loginsRelated(a: string, b: string): boolean {
  const la = (a || '').trim().toLowerCase();
  const lb = (b || '').trim().toLowerCase();
  if (!la || !lb) return false;
  if (la === lb) return true;
  if (la.startsWith(lb) || lb.startsWith(la)) {
    const [short, long] = la.length <= lb.length ? [la, lb] : [lb, la];
    const extra = long.slice(short.length);
    if (/^\d{1,2}$/.test(extra)) return true;
  }
  const stemA = loginNameStem(la);
  const stemB = loginNameStem(lb);
  if (!stemA || stemA !== stemB) return false;
  const numA = la.match(/(\d+)$/)?.[1] ?? '';
  const numB = lb.match(/(\d+)$/)?.[1] ?? '';
  return personnelNumbersRelated(numA, numB);
}

function emailLogin(email: string | null): string {
  if (!email) return '';
  return email.includes('@') ? email.split('@')[0]! : email;
}

function pickKeeper(members: UserRow[]): UserRow {
  return [...members].sort((a, b) => {
    const la = emailLogin(a.email);
    const lb = emailLogin(b.email);
    if (la.length !== lb.length) return la.length - lb.length;
    return la.localeCompare(lb);
  })[0]!;
}

export function clusterElDuplicateUsers(users: UserRow[]): DuplicateCluster[] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id) ?? id;
    if (p !== id) {
      const root = find(p);
      parent.set(id, root);
      return root;
    }
    return id;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const u of users) parent.set(u.id, u.id);

  // 1) Email login prefix bir xil bo'lsa (masalan s.fayziyev8192 / s.fayziyev81922)
  const byLoginPrefix = new Map<string, UserRow[]>();
  for (const u of users) {
    const login = emailLogin(u.email);
    if (!login) continue;
    const match = login.match(/^([a-z]\.[a-z]+)(\d+)$/i);
    if (!match?.[1]) continue;
    const key = match[1].toLowerCase();
    const list = byLoginPrefix.get(key) ?? [];
    list.push(u);
    byLoginPrefix.set(key, list);
  }
  for (const members of byLoginPrefix.values()) {
    if (members.length < 2) continue;
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const a = members[i]!;
        const b = members[j]!;
        if (loginsRelated(emailLogin(a.email), emailLogin(b.email))) {
          union(a.id, b.id);
        }
      }
    }
  }

  // 2) EnergoId bir xil bo'lsa (Energo ID tomonida merge qilingan holda)
  const byEnergoId = new Map<string, UserRow[]>();
  for (const u of users) {
    if (!u.energoId) continue;
    const list = byEnergoId.get(u.energoId) ?? [];
    list.push(u);
    byEnergoId.set(u.energoId, list);
  }
  for (const members of byEnergoId.values()) {
    for (let i = 1; i < members.length; i += 1) {
      union(members[0]!.id, members[i]!.id);
    }
  }

  const buckets = new Map<string, UserRow[]>();
  for (const u of users) {
    const root = find(u.id);
    const list = buckets.get(root) ?? [];
    list.push(u);
    buckets.set(root, list);
  }

  return [...buckets.values()]
    .filter((g) => g.length > 1)
    .map((members) => ({
      keeperId: pickKeeper(members).id,
      memberIds: members.map((m) => m.id),
    }));
}