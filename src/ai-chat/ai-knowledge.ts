import { readFileSync } from 'fs';
import { join } from 'path';

type DocChunk = { title: string; text: string; folded: string };

const FOLD: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', ғ: 'g', қ: 'q', ҳ: 'h',
};

const DOCS = [
  {
    file: '608.txt',
    title:
      'Vazirlar Mahkamasi 608-son, 18.10.2022. Elektr energetikasi obyektlarida xodimlar bilan ishlashni tashkil etish qoidalari.',
  },
  {
    file: '609.txt',
    title:
      'Vazirlar Mahkamasi 609-son, 18.10.2022. Elektr stansiyalari va tarmoqlarini texnik ekspluatatsiya qilish qoidalari.',
  },
  {
    file: 'tashakkurnoma.txt',
    title:
      'Tashakkurnoma. O‘zbekiston MET AJ boshqaruvi raisi A. Nazirovdan Xudayarov Muzaffar Burxanovichga.',
  },
];

let cache: DocChunk[] | null = null;

function fold(value: string) {
  return value
    .toLowerCase()
    .replace(/o['’ʻ]/g, 'o')
    .replace(/g['’ʻ]/g, 'g')
    .split('')
    .map((char) => FOLD[char] ?? char)
    .join('');
}

function tokens(value: string) {
  return new Set(fold(value).match(/[a-z0-9]{4,}/g) ?? []);
}

function loadChunks(): DocChunk[] {
  if (cache) return cache;
  const chunks: DocChunk[] = [];
  for (const doc of DOCS) {
    const raw = readFileSync(join(__dirname, 'knowledge', doc.file), 'utf8').replace(
      /\r/g,
      '\n',
    );
    const parts = raw
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 40);
    let buffer = '';
    const push = () => {
      if (!buffer) return;
      chunks.push({ title: doc.title, text: buffer, folded: fold(buffer) });
      buffer = '';
    };
    for (const part of parts) {
      if (`${buffer} ${part}`.trim().length > 900) push();
      buffer = buffer ? `${buffer} ${part}` : part;
    }
    push();
  }
  cache = chunks;
  return chunks;
}

/** Savolga yaqin hujjat bo‘laklari. To‘liq matn har safar yuborilmaydi. */
export function relevantDocumentContext(question: string) {
  const query = tokens(question);
  const ranked = loadChunks()
    .map((chunk) => {
      let score = 0;
      for (const word of query) {
        if (chunk.folded.includes(word)) score += 1;
      }
      return { chunk, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const picked = ranked.length
    ? ranked
    : loadChunks()
        .filter((chunk) => chunk.title.startsWith('Vazirlar'))
        .slice(0, 2)
        .map((chunk) => ({ chunk, score: 0 }));

  const body = picked
    .map((row) => `${row.chunk.title}\n${row.chunk.text}`)
    .join('\n\n');
  return [
    'HUJJATLAR: 608-son (xodimlar bilan ishlash), 609-son (texnik ekspluatatsiya), tashakkurnoma (Xudayarov M.B.). Matn kirillcha bo‘lishi mumkin. Javobni lotincha o‘zbekchada ber.',
    body.slice(0, 2200),
  ].join('\n');
}
