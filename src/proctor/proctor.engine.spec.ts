import {
  assertAssignee,
  beginFinalize,
  buildRecordingRelativePath,
  canRestart,
  detectRemoteTools,
  examRoomRequired,
  gradeAttempt,
  nextExamDate,
  orderOptions,
  recoverLocalSession,
  resumeTimer,
  selectQuestions,
  interruptTimer,
  tickTimer,
  toEmployeeQuestion,
  toEmployeeResult,
  validateQuestion,
  validateStandard,
} from './proctor.engine';

const pool = [
  { id: 'q1', category: 'texnik', active: true },
  { id: 'q2', category: 'texnik', active: true },
  { id: 'q3', category: 'yongin', active: true },
  { id: 'q4', category: 'texnik', active: false },
  { id: 'q5', category: 'yongin', active: true },
];

describe('proctor engine', () => {
  it('validates a standard and reuses one question across selections', () => {
    const errors = validateStandard(
      {
        durationMs: 30 * 60 * 1000,
        passPercent: 70,
        randomizeQuestions: true,
        randomizeOptions: true,
        maxRecordingMb: 500,
        totalQuestions: 2,
        categoryPlan: [
          { category: 'texnik', count: 1 },
          { category: 'yongin', count: 1 },
        ],
        nextExamRule: { kind: 'months', months: 12 },
        gradeThresholds: [],
      },
      pool,
    );
    expect(errors).toEqual([]);
    const first = selectQuestions(
      pool,
      {
        categoryPlan: [{ category: 'texnik', count: 1 }],
        totalQuestions: 1,
        randomizeQuestions: false,
      },
      'room-a',
    );
    const second = selectQuestions(
      pool,
      {
        categoryPlan: [{ category: 'texnik', count: 2 }],
        totalQuestions: 2,
        randomizeQuestions: false,
      },
      'room-b',
    );
    expect(second.map((q) => q.id)).toEqual(expect.arrayContaining(first.map((q) => q.id)));
  });

  it('keeps a randomized snapshot stable for the same seed', () => {
    const config = {
      categoryPlan: [] as { category: string; count: number }[],
      totalQuestions: 3,
      randomizeQuestions: true,
    };
    const a = selectQuestions(pool, config, 'attempt-1');
    const b = selectQuestions(pool, config, 'attempt-1');
    expect(a).toEqual(b);
    const options = orderOptions(
      [{ id: 'o2' }, { id: 'o1' }, { id: 'o3' }],
      'attempt-1:q1',
      true,
    );
    expect(orderOptions([{ id: 'o2' }, { id: 'o1' }, { id: 'o3' }], 'attempt-1:q1', true)).toEqual(
      options,
    );
  });

  it('rejects another employee and hides the answer key', () => {
    expect(() => assertAssignee('user-2', 'user-1')).toThrow(/boshqa xodim/);
    expect(assertAssignee('user-1', 'user-1')).toBeUndefined();
    const hidden = toEmployeeQuestion({
      id: 'q1',
      prompt: 'Savol',
      isCorrect: true,
      explanation: 'maxfiy',
    });
    expect(hidden).toEqual({ id: 'q1', prompt: 'Savol' });
    expect(toEmployeeResult({
      examinationName: 'Yong‘in',
      examDate: '2026-12-02',
      questionCount: 10,
      correctCount: 8,
      scorePercent: 80,
      gradeLabel: 'Qoniqarli',
      passed: true,
      nextExamDate: '2027-12-02',
      status: 'COMPLETED',
      questions: [{ correct: true }],
      correctOptionIds: ['a'],
      notes: 'moderator',
    })).not.toHaveProperty('questions');
  });

  it('freezes the timer across an outage and does not let the client extend it', () => {
    const started = {
      status: 'IN_PROGRESS' as const,
      remainingMs: 60_000,
      lastTickAt: 1_000,
      questionIndex: 3,
    };
    const ticked = tickTimer(started, 11_000);
    expect(ticked.remainingMs).toBe(50_000);
    const frozen = interruptTimer(ticked, 900_000, 11_000);
    expect(frozen.status).toBe('INTERRUPTED');
    expect(frozen.remainingMs).toBe(50_000);
    const resumed = resumeTimer(frozen, 2_000_000);
    expect(resumed.remainingMs).toBe(50_000);
    expect(resumed.questionIndex).toBe(3);
    expect(resumed.status).toBe('IN_PROGRESS');
    const stale = resumeTimer(
      { ...started, lastTickAt: 1_000, remainingMs: 40_000 },
      1_000 + 120_000,
    );
    expect(stale.remainingMs).toBe(40_000);
  });

  it('refuses a second finalize and a restart of a completed room', () => {
    expect(beginFinalize('result-1').duplicate).toBe(true);
    expect(beginFinalize(null).duplicate).toBe(false);
    expect(canRestart('COMPLETED', true)).toBe(false);
    expect(canRestart('INTERRUPTED', false)).toBe(true);
    expect(() =>
      resumeTimer(
        { status: 'COMPLETED', remainingMs: 0, lastTickAt: 1, questionIndex: 0 },
        2,
      ),
    ).toThrow(/davom ettirilmaydi/);
  });

  it('grades and calculates the next date only when a rule exists', () => {
    const graded = gradeAttempt(
      [
        { id: 'a', type: 'SINGLE', correctOptionIds: ['1'], selectedOptionIds: ['1'] },
        { id: 'b', type: 'MULTIPLE', correctOptionIds: ['2', '3'], selectedOptionIds: ['3', '2'] },
        { id: 'c', type: 'SINGLE', correctOptionIds: ['4'], selectedOptionIds: ['5'] },
      ],
      60,
      [
        { minPercent: 85, label: 'A’lo' },
        { minPercent: 60, label: 'Qoniqarli' },
      ],
    );
    expect(graded.correctCount).toBe(2);
    expect(graded.scorePercent).toBe(67);
    expect(graded.passed).toBe(true);
    expect(graded.gradeLabel).toBe('Qoniqarli');
    expect(nextExamDate('2026-12-01', { kind: 'months', months: 12 })).toEqual({
      date: '2027-12-01',
      requiresReview: false,
    });
    expect(nextExamDate('2026-12-01', null)).toEqual({
      date: null,
      requiresReview: true,
    });
  });

  it('requires a room only on or after the configurable cutoff', () => {
    const policy = { requiresExamRoom: true, cutoffDate: '2026-12-01' };
    expect(examRoomRequired(policy, '2026-11-30')).toBe(false);
    expect(examRoomRequired(policy, '2026-12-01')).toBe(true);
    expect(examRoomRequired({ requiresExamRoom: false, cutoffDate: '2026-12-01' }, '2026-12-02')).toBe(
      false,
    );
    expect(examRoomRequired(policy, null)).toBe(false);
  });

  it('rejects a bad question and a path that is not a recording name', () => {
    expect(
      validateQuestion({
        prompt: 'Savol',
        type: 'SINGLE',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
        ],
      }).length,
    ).toBeGreaterThan(0);
    expect(() =>
      buildRecordingRelativePath({
        year: '2026',
        branch: '../etc',
        month: '12',
        section: 'FIRE',
        employeeName: 'Ali Valiyev',
        login: 'ali@met.uz',
        roomId: 'room-1',
        fileName: '../secret.txt',
      }),
    ).toThrow(/Fayl nomi/);
    const path = buildRecordingRelativePath({
      year: '2026',
      branch: 'Toshkent',
      month: '12',
      section: 'FIRE_SAFETY',
      employeeName: 'Ali Valiyev',
      login: 'ali@met.uz',
      roomId: 'room-1',
      fileName: 'screen_001.webm',
    });
    expect(path.startsWith('recordings/2026/')).toBe(true);
    expect(path.includes('..')).toBe(false);
  });

  it('flags remote tools and recovers a local journal without reopening a finished room', () => {
    expect(
      detectRemoteTools([
        { name: 'AnyDesk.exe' },
        { name: 'Zoom.exe' },
        { name: 'Telegram.exe', title: 'Video call' },
        { name: 'chrome.exe', title: 'Meet - imtihon' },
      ]).map((row) => row.code),
    ).toEqual(['ANYDESK', 'ZOOM', 'TELEGRAM', 'GOOGLE_MEET']);
    const recovered = recoverLocalSession([
      { kind: 'start', remainingMs: 1000, questionIndex: 0 },
      { kind: 'answer', questionId: 'q1', optionIds: ['a'] },
      { kind: 'interrupt', remainingMs: 800, questionIndex: 2 },
      { kind: 'answer', questionId: 'q1', optionIds: ['b'] },
      { kind: 'submit' },
      { kind: 'start', remainingMs: 9999, questionIndex: 0 },
    ]);
    expect(recovered.completed).toBe(true);
    expect(recovered.remainingMs).toBe(800);
    expect(recovered.answers.q1).toEqual(['b']);
    expect(recovered.questionIndex).toBe(2);
  });
});
