import type { TheorySlide } from '../../common/types/theory-slide';
import type { TheoryRole } from '../../common/enums/theory-role.enum';
import type { QuestionType } from '../../common/enums/question-type.enum';

export const CONTENT_EXPORT_VERSION = 1;

export type ContentOptionExport = {
  id: string;
  optionText: string;
  orderIndex: number;
  isCorrect: boolean;
  matchText: string | null;
};

export type ContentQuestionExport = {
  id: string;
  levelId: string;
  theoryId: string;
  type: QuestionType;
  prompt: string;
  orderIndex: number;
  isActive: boolean;
  options: ContentOptionExport[];
};

export type ContentTheoryExport = {
  id: string;
  levelId: string;
  parentTheoryId: string | null;
  title: string;
  orderIndex: number;
  content: string;
  slides: TheorySlide[] | null;
  theoryRole: TheoryRole | null;
};

export type ContentLevelExport = {
  id: string;
  title: string;
  orderIndex: number;
  isActive: boolean;
};

export type ContentExportBundle = {
  version: number;
  exportedAt: string;
  levels: ContentLevelExport[];
  theories: ContentTheoryExport[];
  questions: ContentQuestionExport[];
};
