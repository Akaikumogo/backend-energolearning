const CYRILLIC_TO_LATIN: Record<string, string> = {
  А: 'A',
  а: 'a',
  Б: 'B',
  б: 'b',
  В: 'V',
  в: 'v',
  Г: 'G',
  г: 'g',
  Д: 'D',
  д: 'd',
  Е: 'E',
  е: 'e',
  Ё: 'Yo',
  ё: 'yo',
  Ж: 'J',
  ж: 'j',
  З: 'Z',
  з: 'z',
  И: 'I',
  и: 'i',
  Й: 'Y',
  й: 'y',
  К: 'K',
  к: 'k',
  Л: 'L',
  л: 'l',
  М: 'M',
  м: 'm',
  Н: 'N',
  н: 'n',
  О: 'O',
  о: 'o',
  П: 'P',
  п: 'p',
  Р: 'R',
  р: 'r',
  С: 'S',
  с: 's',
  Т: 'T',
  т: 't',
  У: 'U',
  у: 'u',
  Ф: 'F',
  ф: 'f',
  Х: 'X',
  х: 'x',
  Ц: 'Ts',
  ц: 'ts',
  Ч: 'Ch',
  ч: 'ch',
  Ш: 'Sh',
  ш: 'sh',
  Щ: 'Sh',
  щ: 'sh',
  Ъ: '',
  ъ: '',
  Ы: 'I',
  ы: 'i',
  Ь: '',
  ь: '',
  Э: 'E',
  э: 'e',
  Ю: 'Yu',
  ю: 'yu',
  Я: 'Ya',
  я: 'ya',
  Ў: "O'",
  ў: "o'",
  Қ: 'Q',
  қ: 'q',
  Ғ: "G'",
  ғ: "g'",
  Ҳ: 'H',
  ҳ: 'h',
};

export function latinizeSearchText(text: string): string {
  return text.replace(
    /[А-Яа-яЁёЎўҚқҒғҲҳЪъЬь]/g,
    (char) => CYRILLIC_TO_LATIN[char] ?? char,
  );
}

/** Bitta so'z uchun kirill + lotin variantlari */
export function variantsForSearchToken(token: string): string[] {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return [];
  const variants = new Set<string>([normalized]);
  const latin = latinizeSearchText(normalized).toLowerCase();
  if (latin) variants.add(latin);
  return [...variants];
}

export function splitSearchTokens(raw: string): string[] {
  return raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** @deprecated use splitSearchTokens + variantsForSearchToken */
export function expandSearchTokens(raw: string): string[] {
  return splitSearchTokens(raw).flatMap((t) => variantsForSearchToken(t));
}
