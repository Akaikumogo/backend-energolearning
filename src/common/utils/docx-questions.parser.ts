import JSZip from 'jszip';
import { latinizeSearchText } from './latinize-search.util';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export type ParsedDocxOption = {
  optionText: string;
  isCorrect: boolean;
  orderIndex: number;
};

export type ParsedDocxQuestion = {
  prompt: string;
  options: ParsedDocxOption[];
  sourceIndex: number;
  warnings: string[];
};

export type ParseDocxQuestionsResult = {
  questions: ParsedDocxQuestion[];
  skipped: string[];
  totalParagraphs: number;
};

const QUESTION_RE =
  /^\s*(\d+)\s*[-–.:]?\s*(?:savol|савол)\s*[.:]?\s*(.*)$/i;
const OPTION_RE =
  /^\s*([a-zа-яёўқғҳaвг]|[абвг])\s*[).]\s*(.*)$/i;
const TEST_HEADER_RE = /^\s*(?:test|тест)\s*[№#]?\s*\d+/i;

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    );
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

function stripTrailingHyphenJoin(text: string): string {
  // Word soft line-break hyphen: "soha- larining" → "sohalarining"
  return text.replace(/(\p{L})-\s+(\p{L})/gu, '$1$2');
}

function cleanText(raw: string, latinize: boolean): string {
  let t = decodeXmlEntities(raw);
  t = t.replace(/\u00ad/g, ''); // soft hyphen
  t = stripTrailingHyphenJoin(t);
  t = normalizeWhitespace(t);
  t = t.replace(/\*+\s*$/g, '').trim();
  if (latinize) t = latinizeSearchText(t);
  return t;
}

function extractParagraphs(xml: string): string[] {
  const paras: string[] = [];
  const paraRe = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  const textRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

  let match: RegExpExecArray | null;
  while ((match = paraRe.exec(xml)) !== null) {
    const block = match[0];
    let text = '';
    let tMatch: RegExpExecArray | null;
    textRe.lastIndex = 0;
    while ((tMatch = textRe.exec(block)) !== null) {
      text += tMatch[1];
    }
    const trimmed = normalizeWhitespace(decodeXmlEntities(text));
    if (trimmed) paras.push(trimmed);
  }

  // Fallback if namespace prefixes differ
  if (paras.length === 0 && xml.includes(W_NS)) {
    // keep empty — rare
  }
  return paras;
}

function isOptionLine(line: string): boolean {
  return OPTION_RE.test(line);
}

function parseOptionLine(
  line: string,
  orderIndex: number,
  latinize: boolean,
): ParsedDocxOption {
  const m = line.match(OPTION_RE);
  const body = m?.[2] ?? line;
  const starred = /\*\s*$/.test(body) || body.includes('*');
  // Prefer end-of-line star as correct marker
  const isCorrect = /\*\s*$/.test(body.trim());
  let optionText = cleanText(body.replace(/\*/g, ''), latinize);
  // If star was mid-text (rare), still mark correct when isCorrect false but starred
  return {
    optionText,
    isCorrect: isCorrect || (starred && /\*\s*$/.test(line.trim())),
    orderIndex,
  };
}

/**
 * DOCX dan test savollarini o'qiydi.
 * Format: `1-savol. ...` + `a) ...` / `b) ...*` (yulduzcha = to'g'ri javob)
 */
export async function parseDocxQuestions(
  buffer: Buffer,
  opts?: { latinize?: boolean },
): Promise<ParseDocxQuestionsResult> {
  const latinize = opts?.latinize !== false;
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('DOCX ichida word/document.xml topilmadi');
  }
  const xml = await docFile.async('string');
  const paragraphs = extractParagraphs(xml);

  const questions: ParsedDocxQuestion[] = [];
  const skipped: string[] = [];

  let currentPromptParts: string[] = [];
  let currentOptions: ParsedDocxOption[] = [];
  let currentSourceIndex = 0;
  let inQuestion = false;

  const flush = () => {
    if (!inQuestion) return;
    const prompt = cleanText(currentPromptParts.join(' '), latinize);
    const warnings: string[] = [];
    if (!prompt) warnings.push('Savol matni bo‘sh');
    if (currentOptions.length < 2) {
      warnings.push(`Variantlar kam (${currentOptions.length})`);
    }
    const correctCount = currentOptions.filter((o) => o.isCorrect).length;
    if (correctCount === 0) warnings.push('To‘g‘ri javob belgilari (*) topilmadi');
    if (correctCount > 1) warnings.push(`${correctCount} ta to‘g‘ri javob belgilangan`);

    if (prompt && currentOptions.length >= 2) {
      // Agar yulduzcha yo‘q bo‘lsa ham saqlaymiz — previewda ko‘rinadi
      questions.push({
        prompt,
        options: currentOptions.map((o, i) => ({ ...o, orderIndex: i })),
        sourceIndex: currentSourceIndex,
        warnings,
      });
    } else {
      skipped.push(
        `Savol #${currentSourceIndex}: ${prompt || '(bo‘sh)'} — ${warnings.join('; ')}`,
      );
    }

    currentPromptParts = [];
    currentOptions = [];
    inQuestion = false;
  };

  for (const raw of paragraphs) {
    if (TEST_HEADER_RE.test(raw)) continue;

    const qMatch = raw.match(QUESTION_RE);
    if (qMatch) {
      flush();
      inQuestion = true;
      currentSourceIndex = Number(qMatch[1]) || questions.length + 1;
      const rest = (qMatch[2] ?? '').trim();
      currentPromptParts = rest ? [rest] : [];
      currentOptions = [];
      continue;
    }

    if (!inQuestion) continue;

    if (isOptionLine(raw)) {
      currentOptions.push(
        parseOptionLine(raw, currentOptions.length, latinize),
      );
      continue;
    }

    // Continuation line: append to last option or prompt
    if (currentOptions.length > 0) {
      const last = currentOptions[currentOptions.length - 1];
      const starred = /\*\s*$/.test(raw.trim());
      const piece = cleanText(raw.replace(/\*/g, ''), latinize);
      if (piece) {
        last.optionText = normalizeWhitespace(`${last.optionText} ${piece}`);
      }
      if (starred) last.isCorrect = true;
    } else {
      currentPromptParts.push(raw);
    }
  }
  flush();

  return {
    questions,
    skipped,
    totalParagraphs: paragraphs.length,
  };
}
