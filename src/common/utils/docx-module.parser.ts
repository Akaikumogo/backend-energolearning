import JSZip from 'jszip';
import { latinizeSearchText } from './latinize-search.util';

export type ParsedModuleOption = {
  text: string;
  isCorrect: boolean;
};

export type ParsedModuleQuestion = {
  prompt: string;
  options: ParsedModuleOption[];
};

export type ParsedModuleTheory = {
  title: string;
  content: string;
  questions: ParsedModuleQuestion[];
};

export type ParsedModuleDocx = {
  title: string;
  theories: ParsedModuleTheory[];
  errors: string[];
  totalQuestions: number;
};

const MODULE_RE = /^\[MODULE\]\s*(.+)$/i;
const THEORY_RE = /^\[THEORY\]\s*(.+)$/i;
const QUESTION_RE = /^\[QUESTION\]\s*(.+)$/i;
const OPTION_RE = /^\[OPTION\]\s*(.+)$/i;
const CORRECT_RE = /^\[CORRECT\]\s*(.+)$/i;
const CONTENT_START_RE = /^\[CONTENT\]\s*$/i;
const CONTENT_END_RE = /^\[\/CONTENT\]\s*$/i;

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

function normalize(text: string, latinize: boolean): string {
  let value = decodeXmlEntities(text)
    .replace(/\u00ad/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (latinize) value = latinizeSearchText(value);
  return value;
}

function extractParagraphs(xml: string): string[] {
  const result: string[] = [];
  const paragraphRe = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  const textRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

  let paragraph: RegExpExecArray | null;
  while ((paragraph = paragraphRe.exec(xml)) !== null) {
    let text = '';
    let run: RegExpExecArray | null;
    textRe.lastIndex = 0;
    while ((run = textRe.exec(paragraph[0])) !== null) text += run[1];
    const value = decodeXmlEntities(text)
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
    if (value) result.push(value);
  }
  return result;
}

/**
 * Butun modul uchun qat'iy DOCX shabloni:
 * [MODULE], [THEORY], [CONTENT]...[/CONTENT],
 * [QUESTION], [OPTION], [CORRECT].
 */
export async function parseModuleDocx(
  buffer: Buffer,
  opts?: { latinize?: boolean },
): Promise<ParsedModuleDocx> {
  const latinize = opts?.latinize !== false;
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('DOCX ichida word/document.xml topilmadi');

  const paragraphs = extractParagraphs(await file.async('string'));
  const errors: string[] = [];
  let moduleTitle = '';
  const theories: ParsedModuleTheory[] = [];
  let theory: ParsedModuleTheory | null = null;
  let question: ParsedModuleQuestion | null = null;
  let inContent = false;
  let contentLines: string[] = [];

  const flushQuestion = () => {
    if (!question || !theory) return;
    const questionNo = theory.questions.length + 1;
    if (question.options.length < 2) {
      errors.push(
        `"${theory.title}" ${questionNo}-savol: kamida 2 ta variant kerak`,
      );
    }
    const correctCount = question.options.filter((o) => o.isCorrect).length;
    if (correctCount !== 1) {
      errors.push(
        `"${theory.title}" ${questionNo}-savol: aynan 1 ta [CORRECT] kerak (topildi: ${correctCount})`,
      );
    }
    if (question.options.length > 8) {
      errors.push(`"${theory.title}" ${questionNo}-savol: 8 tadan ko‘p variant`);
    }
    theory.questions.push(question);
    question = null;
  };

  const flushTheory = () => {
    flushQuestion();
    if (!theory) return;
    theory.content = contentLines.join('\n').trim();
    if (theory.questions.length === 0) {
      errors.push(`"${theory.title}" nazariyasida savol yo‘q`);
    }
    theories.push(theory);
    theory = null;
    contentLines = [];
    inContent = false;
  };

  for (const raw of paragraphs) {
    if (CONTENT_END_RE.test(raw)) {
      if (!inContent) errors.push('[/CONTENT] ochilmagan holda ishlatilgan');
      inContent = false;
      continue;
    }

    if (inContent) {
      contentLines.push(normalize(raw, latinize));
      continue;
    }

    const moduleMatch = raw.match(MODULE_RE);
    if (moduleMatch) {
      if (moduleTitle) errors.push('Faylda faqat bitta [MODULE] bo‘lishi kerak');
      moduleTitle = normalize(moduleMatch[1], latinize);
      continue;
    }

    const theoryMatch = raw.match(THEORY_RE);
    if (theoryMatch) {
      flushTheory();
      theory = {
        title: normalize(theoryMatch[1], latinize),
        content: '',
        questions: [],
      };
      continue;
    }

    if (CONTENT_START_RE.test(raw)) {
      if (!theory) errors.push('[CONTENT] dan oldin [THEORY] kerak');
      inContent = true;
      continue;
    }

    const questionMatch = raw.match(QUESTION_RE);
    if (questionMatch) {
      if (!theory) {
        errors.push('[QUESTION] dan oldin [THEORY] kerak');
        continue;
      }
      flushQuestion();
      question = {
        prompt: normalize(questionMatch[1], latinize),
        options: [],
      };
      continue;
    }

    const correctMatch = raw.match(CORRECT_RE);
    if (correctMatch) {
      if (!question) {
        errors.push('[CORRECT] dan oldin [QUESTION] kerak');
        continue;
      }
      question.options.push({
        text: normalize(correctMatch[1], latinize),
        isCorrect: true,
      });
      continue;
    }

    const optionMatch = raw.match(OPTION_RE);
    if (optionMatch) {
      if (!question) {
        errors.push('[OPTION] dan oldin [QUESTION] kerak');
        continue;
      }
      question.options.push({
        text: normalize(optionMatch[1], latinize),
        isCorrect: false,
      });
    }
  }

  if (inContent) errors.push('[CONTENT] uchun [/CONTENT] yopuvchi marker yo‘q');
  flushTheory();

  if (!moduleTitle) errors.push('[MODULE] sarlavhasi topilmadi');
  if (theories.length === 0) errors.push('Kamida bitta [THEORY] kerak');
  if (theories.length > 50) errors.push('Bitta modulda 50 tadan ko‘p nazariya mumkin emas');

  const titleSet = new Set<string>();
  for (const row of theories) {
    const key = row.title.toLocaleLowerCase();
    if (titleSet.has(key)) errors.push(`Nazariya takrorlangan: "${row.title}"`);
    titleSet.add(key);
  }

  const totalQuestions = theories.reduce(
    (sum, row) => sum + row.questions.length,
    0,
  );
  if (totalQuestions > 2000) {
    errors.push('Bitta DOCX da 2000 tadan ko‘p savol mumkin emas');
  }

  return { title: moduleTitle, theories, errors, totalQuestions };
}
