/** F.I.O solishtirish (kirill/lotin + dj/zh variantlari). */

const CYRILLIC_TO_LATIN: Record<string, string> = {
  А: 'A', а: 'a', Б: 'B', б: 'b', В: 'V', в: 'v', Г: 'G', г: 'g',
  Д: 'D', д: 'd', Е: 'E', е: 'e', Ё: 'Yo', ё: 'yo', Ж: 'J', ж: 'j',
  З: 'Z', з: 'z', И: 'I', и: 'i', Й: 'Y', й: 'y', К: 'K', к: 'k',
  Л: 'L', л: 'l', М: 'M', м: 'm', Н: 'N', н: 'n', О: 'O', о: 'o',
  П: 'P', п: 'p', Р: 'R', р: 'r', С: 'S', с: 's', Т: 'T', т: 't',
  У: 'U', у: 'u', Ф: 'F', ф: 'f', Х: 'X', х: 'x', Ц: 'S', ц: 's',
  Ч: 'Ch', ч: 'ch', Ш: 'Sh', ш: 'sh', Ъ: '', ъ: '', Ь: '', ь: '',
  Э: 'E', э: 'e', Ю: 'Yu', ю: 'yu', Я: 'Ya', я: 'ya', Ў: 'O', ў: 'o',
  Қ: 'Q', қ: 'q', Ғ: 'G', ғ: 'g', Ҳ: 'H', ҳ: 'h',
};

function clean(value?: string | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function foldPersonNameKey(value: string) {
  const latin = clean(value)
    .toLowerCase()
    .replace(/[А-Яа-яЁёЎўҚқҒғҲҳЪъЬь]/g, (ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
    .replace(/[''`ʻʼ‘’]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return latin.replace(/dzh/g, 'j').replace(/dj/g, 'j').replace(/zh/g, 'j');
}

export function personNamesEquivalent(a: string, b: string) {
  const fa = foldPersonNameKey(a);
  const fb = foldPersonNameKey(b);
  if (!fa || !fb) return false;
  return fa === fb;
}
