export const ROOM_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'READY',
  'IN_PROGRESS',
  'INTERRUPTED',
  'PENDING_SYNC',
  'SUBMITTED',
  'FINALIZING',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;

export type RoomStatus = (typeof ROOM_STATUSES)[number];

const TRANSITIONS: Record<RoomStatus, RoomStatus[]> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['READY', 'IN_PROGRESS', 'CANCELLED', 'EXPIRED'],
  READY: ['IN_PROGRESS', 'CANCELLED', 'EXPIRED'],
  IN_PROGRESS: ['INTERRUPTED', 'PENDING_SYNC', 'SUBMITTED', 'FINALIZING'],
  INTERRUPTED: ['IN_PROGRESS', 'PENDING_SYNC', 'SUBMITTED'],
  PENDING_SYNC: ['SUBMITTED', 'INTERRUPTED', 'FINALIZING'],
  SUBMITTED: ['FINALIZING', 'COMPLETED'],
  FINALIZING: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export type NextExamRule =
  | { kind: 'months'; months: number }
  | { kind: 'review' }
  | null;

export type GradeThreshold = { minPercent: number; label: string };

export type CategoryPlan = { category: string; count: number };

export type BankQuestion = {
  id: string;
  category: string;
  active: boolean;
};

export type StandardConfig = {
  durationMs: number;
  passPercent: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  maxRecordingMb: number;
  totalQuestions: number;
  categoryPlan: CategoryPlan[];
  nextExamRule: NextExamRule;
  gradeThresholds: GradeThreshold[];
};

export type AnswerKeyQuestion = {
  id: string;
  type: 'SINGLE' | 'MULTIPLE';
  correctOptionIds: string[];
  selectedOptionIds: string[];
};

export type TimerState = {
  status: RoomStatus;
  remainingMs: number;
  lastTickAt: number | null;
  questionIndex: number;
};

export type LocalOp =
  | { kind: 'start'; remainingMs: number; questionIndex: number }
  | { kind: 'answer'; questionId: string; optionIds: string[] }
  | { kind: 'heartbeat'; remainingMs: number; questionIndex: number }
  | { kind: 'interrupt'; remainingMs: number; questionIndex: number }
  | { kind: 'submit' };

export type LocalSession = {
  status: 'IN_PROGRESS' | 'INTERRUPTED' | 'COMPLETED';
  remainingMs: number;
  questionIndex: number;
  answers: Record<string, string[]>;
  completed: boolean;
};

const STALE_MS = 45_000;

export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function canTransition(from: RoomStatus, to: RoomStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RoomStatus, to: RoomStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Xona holati ${from} dan ${to} ga o‘tmaydi`);
  }
}

export function assertAssignee(actorId: string, roomUserId: string): void {
  if (actorId !== roomUserId) {
    throw new Error('Bu xona boshqa xodimga biriktirilgan');
  }
}

export function canRestart(status: RoomStatus, finalized: boolean): boolean {
  if (finalized || status === 'COMPLETED' || status === 'CANCELLED') return false;
  return true;
}

export function examRoomRequired(
  policy: { requiresExamRoom: boolean; cutoffDate: string } | null,
  examDate: string | null,
): boolean {
  if (!policy?.requiresExamRoom) return false;
  if (!examDate) return false;
  return examDate >= policy.cutoffDate;
}

export function validateQuestion(input: {
  prompt: string;
  type: 'SINGLE' | 'MULTIPLE';
  options: { text: string; isCorrect: boolean }[];
}): string[] {
  const errors: string[] = [];
  if (!input.prompt.trim()) errors.push('Savol matni bo‘sh');
  if (input.type !== 'SINGLE' && input.type !== 'MULTIPLE') {
    errors.push('Savol turi noto‘g‘ri');
  }
  if (input.options.length < 2) errors.push('Kamida ikkita variant kerak');
  const correct = input.options.filter((o) => o.isCorrect).length;
  if (input.type === 'SINGLE' && correct !== 1) {
    errors.push('Bitta to‘g‘ri javob belgilang');
  }
  if (input.type === 'MULTIPLE' && correct < 1) {
    errors.push('Kamida bitta to‘g‘ri javob belgilang');
  }
  if (input.options.some((o) => !o.text.trim())) {
    errors.push('Bo‘sh variant bor');
  }
  return errors;
}

export function validateStandard(
  config: StandardConfig,
  pool: BankQuestion[],
): string[] {
  const errors: string[] = [];
  if (config.durationMs <= 0) errors.push('Imtihon vaqti kerak');
  if (config.passPercent < 1 || config.passPercent > 100) {
    errors.push('O‘tish foizi 1–100 oralig‘ida');
  }
  if (config.maxRecordingMb <= 0) errors.push('Yozuv hajmi chegarasi kerak');
  const active = pool.filter((q) => q.active);
  const plan = config.categoryPlan.filter((c) => c.count > 0);
  if (plan.length) {
    for (const row of plan) {
      const have = active.filter((q) => q.category === row.category).length;
      if (have < row.count) {
        errors.push(
          `${row.category}: ${row.count} ta savol kerak, bankda ${have} ta`,
        );
      }
    }
  } else if (active.length < config.totalQuestions || config.totalQuestions < 1) {
    errors.push('Yetarli faol savol yo‘q');
  }
  return errors;
}

export function selectQuestions(
  pool: BankQuestion[],
  config: Pick<
    StandardConfig,
    'categoryPlan' | 'totalQuestions' | 'randomizeQuestions'
  >,
  seedKey: string,
): { id: string; sortOrder: number }[] {
  const random = mulberry32(hashSeed(seedKey));
  const active = pool.filter((q) => q.active);
  const plan = config.categoryPlan.filter((c) => c.count > 0);
  const picked: BankQuestion[] = [];
  if (plan.length) {
    for (const row of plan) {
      const group = active.filter((q) => q.category === row.category);
      const ordered = config.randomizeQuestions
        ? shuffle(group, random)
        : [...group].sort((a, b) => a.id.localeCompare(b.id));
      if (ordered.length < row.count) {
        throw new Error(`${row.category} uchun savol yetarli emas`);
      }
      picked.push(...ordered.slice(0, row.count));
    }
  } else {
    const ordered = config.randomizeQuestions
      ? shuffle(active, random)
      : [...active].sort((a, b) => a.id.localeCompare(b.id));
    if (ordered.length < config.totalQuestions) {
      throw new Error('Savol yetarli emas');
    }
    picked.push(...ordered.slice(0, config.totalQuestions));
  }
  const finalOrder = config.randomizeQuestions ? shuffle(picked, random) : picked;
  return finalOrder.map((q, index) => ({ id: q.id, sortOrder: index }));
}

export function orderOptions<T extends { id: string }>(
  options: T[],
  seedKey: string,
  randomize: boolean,
): string[] {
  const ordered = randomize
    ? shuffle(options, mulberry32(hashSeed(seedKey)))
    : [...options].sort((a, b) => a.id.localeCompare(b.id));
  return ordered.map((o) => o.id);
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

export function gradeAttempt(
  questions: AnswerKeyQuestion[],
  passPercent: number,
  thresholds: GradeThreshold[],
): {
  correctCount: number;
  questionCount: number;
  scorePercent: number;
  passed: boolean;
  gradeLabel: string;
} {
  let correctCount = 0;
  for (const question of questions) {
    const selected = question.selectedOptionIds ?? [];
    const correct = question.correctOptionIds ?? [];
    const ok =
      question.type === 'SINGLE'
        ? selected.length === 1 && correct.length === 1 && selected[0] === correct[0]
        : sameSet(selected, correct);
    if (ok) correctCount += 1;
  }
  const questionCount = questions.length;
  const scorePercent =
    questionCount === 0 ? 0 : Math.round((correctCount / questionCount) * 100);
  const passed = scorePercent >= passPercent;
  const gradeLabel =
    [...thresholds]
      .filter((row) => scorePercent >= row.minPercent)
      .sort((a, b) => b.minPercent - a.minPercent)[0]?.label ??
    (passed ? 'Qoniqarli' : 'Qoniqarsiz');
  return { correctCount, questionCount, scorePercent, passed, gradeLabel };
}

export function nextExamDate(
  examDate: string,
  rule: NextExamRule,
): { date: string | null; requiresReview: boolean } {
  if (!rule || rule.kind === 'review') {
    return { date: null, requiresReview: true };
  }
  if (!Number.isInteger(rule.months) || rule.months < 1) {
    return { date: null, requiresReview: true };
  }
  const [year, month, day] = examDate.split('-').map((part) => Number(part));
  if (!year || !month || !day) return { date: null, requiresReview: true };
  const date = new Date(Date.UTC(year, month - 1 + rule.months, day));
  const iso = date.toISOString().slice(0, 10);
  return { date: iso, requiresReview: false };
}

export function tickTimer(state: TimerState, now: number): TimerState & { expired: boolean } {
  if (state.status !== 'IN_PROGRESS' || state.lastTickAt == null) {
    return { ...state, expired: state.remainingMs <= 0 && state.status === 'IN_PROGRESS' };
  }
  const elapsed = Math.max(0, now - state.lastTickAt);
  const remainingMs = Math.max(0, state.remainingMs - elapsed);
  return {
    ...state,
    remainingMs,
    lastTickAt: now,
    expired: remainingMs <= 0,
  };
}

export function interruptTimer(
  state: TimerState,
  now: number,
  frozenAt?: number,
): TimerState {
  if (state.status === 'COMPLETED') return state;
  const until = frozenAt == null ? now : Math.min(now, frozenAt);
  const ticked =
    state.status === 'IN_PROGRESS' ? tickTimer(state, until) : state;
  return {
    ...ticked,
    status: 'INTERRUPTED',
    lastTickAt: ticked.lastTickAt,
    remainingMs: ticked.remainingMs,
  };
}

export function resumeTimer(state: TimerState, now: number, staleMs = STALE_MS): TimerState {
  if (state.status === 'COMPLETED' || state.status === 'CANCELLED') {
    throw new Error('Tugallangan xona davom ettirilmaydi');
  }
  if (state.status === 'INTERRUPTED') {
    return { ...state, status: 'IN_PROGRESS', lastTickAt: now };
  }
  if (state.status === 'IN_PROGRESS' && state.lastTickAt != null && now - state.lastTickAt > staleMs) {
    return { ...state, lastTickAt: now };
  }
  if (state.status === 'IN_PROGRESS') return tickTimer(state, now);
  return { ...state, status: 'IN_PROGRESS', lastTickAt: now };
}

export function toEmployeeQuestion<T extends { isCorrect?: boolean; explanation?: string | null }>(
  question: T,
): Omit<T, 'isCorrect' | 'explanation'> {
  const copy = { ...question } as T & { isCorrect?: boolean; explanation?: string | null };
  delete copy.isCorrect;
  delete copy.explanation;
  return copy;
}

export function toEmployeeResult(result: {
  examinationName: string;
  examDate: string | null;
  questionCount: number;
  correctCount: number;
  scorePercent: number;
  gradeLabel: string;
  passed: boolean;
  nextExamDate: string | null;
  status: string;
  questions?: unknown;
  correctOptionIds?: unknown;
  notes?: unknown;
}) {
  return {
    examinationName: result.examinationName,
    examDate: result.examDate,
    questionCount: result.questionCount,
    correctCount: result.correctCount,
    scorePercent: result.scorePercent,
    gradeLabel: result.gradeLabel,
    passed: result.passed,
    nextExamDate: result.nextExamDate,
    status: result.status,
  };
}

export function sanitizePathSegment(value: string): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._\-\u0400-\u04FF]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 80);
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'unknown';
  return cleaned;
}

export function buildRecordingRelativePath(input: {
  year: string;
  branch: string;
  month: string;
  section: string;
  employeeName: string;
  login: string;
  roomId: string;
  fileName: string;
}): string {
  if (!/^(screen|camera|mic|system_audio)_\d{3}\.webm$/.test(input.fileName) &&
      input.fileName !== 'events.json' &&
      input.fileName !== 'manifest.json') {
    throw new Error('Fayl nomi ruxsat etilmagan');
  }
  const folder = `${sanitizePathSegment(input.employeeName)}_${sanitizePathSegment(input.login)}_${sanitizePathSegment(input.roomId)}`;
  return [
    'recordings',
    sanitizePathSegment(input.year),
    sanitizePathSegment(input.branch),
    sanitizePathSegment(input.month),
    sanitizePathSegment(input.section),
    folder,
    input.fileName,
  ].join('/');
}

export type RemoteSighting = { name: string; title?: string | null };

export function detectRemoteTools(sightings: RemoteSighting[]): {
  code: string;
  processName: string;
  windowTitle: string | null;
}[] {
  const found: { code: string; processName: string; windowTitle: string | null }[] = [];
  const seen = new Set<string>();
  for (const row of sightings) {
    const name = row.name || '';
    const title = row.title ?? '';
    let code: string | null = null;
    if (/anydesk/i.test(name)) code = 'ANYDESK';
    else if (/zoom/i.test(name)) code = 'ZOOM';
    else if (/telegram/i.test(name)) code = 'TELEGRAM';
    else if (/meet/i.test(title) && /chrome|msedge|firefox|brave/i.test(name)) code = 'GOOGLE_MEET';
    if (!code || seen.has(code)) continue;
    seen.add(code);
    found.push({ code, processName: name, windowTitle: title || null });
  }
  return found;
}

export function recoverLocalSession(ops: LocalOp[]): LocalSession {
  const session: LocalSession = {
    status: 'IN_PROGRESS',
    remainingMs: 0,
    questionIndex: 0,
    answers: {},
    completed: false,
  };
  for (const op of ops) {
    if (session.completed) break;
    if (op.kind === 'start') {
      session.status = 'IN_PROGRESS';
      session.remainingMs = op.remainingMs;
      session.questionIndex = op.questionIndex;
    } else if (op.kind === 'answer') {
      session.answers[op.questionId] = [...op.optionIds];
    } else if (op.kind === 'heartbeat') {
      session.remainingMs = op.remainingMs;
      session.questionIndex = op.questionIndex;
      session.status = 'IN_PROGRESS';
    } else if (op.kind === 'interrupt') {
      session.remainingMs = op.remainingMs;
      session.questionIndex = op.questionIndex;
      session.status = 'INTERRUPTED';
    } else if (op.kind === 'submit') {
      session.status = 'COMPLETED';
      session.completed = true;
    }
  }
  return session;
}

export function beginFinalize(existingResultId: string | null): { duplicate: boolean } {
  return { duplicate: existingResultId != null };
}

export const HEARTBEAT_STALE_MS = STALE_MS;
