type PersonnelSource = {
  personnelNumber?: string | null;
  personnel_number?: string | null;
  login?: string | null;
  email?: string | null;
};

/** Login/email oxiridagi tabel raqamini ajratib oladi (masalan e.azizov6109 → 6109). */
export function extractPersonnelNumberFromLogin(
  loginOrEmail?: string | null,
): string | null {
  const value = (loginOrEmail ?? '').trim().toLowerCase();
  if (!value) return null;

  const local = value.includes('@') ? value.split('@')[0] : value;
  const match = local.match(/(\d{3,6})$/);
  return match?.[1] ?? null;
}

/** Energo ID employee obyektidan tabel raqamini aniqlaydi. */
export function resolvePersonnelNumber(source: PersonnelSource): string | null {
  const direct = (source.personnelNumber ?? source.personnel_number)?.trim();
  if (direct) return direct;

  return (
    extractPersonnelNumberFromLogin(source.login) ??
    extractPersonnelNumberFromLogin(source.email)
  );
}
