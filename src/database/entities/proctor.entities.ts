import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { User } from './user.entity';

@Entity({ name: 'proctor_questions' })
export class ProctorQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'text', name: 'image_url', nullable: true })
  imageUrl: string | null;

  @Column({ type: 'text' })
  type: 'SINGLE' | 'MULTIPLE';

  @Column({ type: 'text' })
  subject: string;

  @Column({ type: 'text' })
  category: string;

  @Column({ type: 'text', default: 'MEDIUM' })
  difficulty: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  explanation: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity({ name: 'proctor_question_options' })
export class ProctorQuestionOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'question_id' })
  questionId: string;

  @ManyToOne(() => ProctorQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: ProctorQuestion;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'boolean', name: 'is_correct', default: false })
  isCorrect: boolean;

  @Column({ type: 'int', name: 'sort_order', default: 0 })
  sortOrder: number;
}

@Entity({ name: 'proctor_standards' })
export class ProctorStandard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', unique: true })
  code: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'text', default: '' })
  subject: string;

  @Column({ type: 'int', name: 'duration_ms' })
  durationMs: number;

  @Column({ type: 'int', name: 'pass_percent' })
  passPercent: number;

  @Column({ type: 'boolean', name: 'randomize_questions', default: true })
  randomizeQuestions: boolean;

  @Column({ type: 'boolean', name: 'randomize_options', default: true })
  randomizeOptions: boolean;

  @Column({ type: 'int', name: 'max_recording_mb', default: 500 })
  maxRecordingMb: number;

  @Column({ type: 'int', name: 'total_questions', default: 1 })
  totalQuestions: number;

  @Column({ type: 'jsonb', name: 'category_plan', default: () => "'[]'" })
  categoryPlan: { category: string; count: number }[];

  @Column({ type: 'jsonb', name: 'next_exam_rule', nullable: true })
  nextExamRule: { kind: 'months'; months: number } | { kind: 'review' } | null;

  @Column({ type: 'jsonb', name: 'grade_thresholds', default: () => "'[]'" })
  gradeThresholds: { minPercent: number; label: string }[];

  @Column({ type: 'int', name: 'retry_max_attempts', default: 1 })
  retryMaxAttempts: number;

  @Column({ type: 'boolean', name: 'recording_required', default: true })
  recordingRequired: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity({ name: 'proctor_standard_questions' })
@Unique('uq_proctor_standard_question', ['standardId', 'questionId'])
export class ProctorStandardQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'standard_id' })
  standardId: string;

  @Column({ type: 'uuid', name: 'question_id' })
  questionId: string;
}

@Entity({ name: 'proctor_policies' })
export class ProctorPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', name: 'record_type_code', unique: true })
  recordTypeCode: string;

  @Column({ type: 'boolean', name: 'requires_exam_room', default: true })
  requiresExamRoom: boolean;

  @Column({ type: 'date', name: 'cutoff_date', default: '2026-12-01' })
  cutoffDate: string;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity({ name: 'proctor_rooms' })
@Index('idx_proctor_rooms_user_status', ['userId', 'status'])
export class ProctorRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', name: 'safety_record_id' })
  safetyRecordId: string;

  @Column({ type: 'text', name: 'record_type_code' })
  recordTypeCode: string;

  @Column({ type: 'uuid', name: 'standard_id' })
  standardId: string;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'scheduled_at' })
  scheduledAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'text', default: 'DRAFT' })
  status: string;

  @Column({ type: 'int', name: 'attempt_number', default: 0 })
  attemptNumber: number;

  @Column({ type: 'text', name: 'access_token', unique: true })
  accessToken: string;

  @Column({ type: 'text', name: 'access_method', default: 'LINK' })
  accessMethod: string;

  @Column({ type: 'boolean', name: 'recording_required', default: true })
  recordingRequired: boolean;

  @Column({ type: 'int', name: 'max_recording_mb', default: 500 })
  maxRecordingMb: number;

  @Column({ type: 'uuid', name: 'notification_id', nullable: true })
  notificationId: string | null;

  @Column({ type: 'text', name: 'notification_status', default: 'PENDING' })
  notificationStatus: string;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @Column({ type: 'timestamptz', name: 'last_seen_at', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'text', name: 'connection_status', default: 'OFFLINE' })
  connectionStatus: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity({ name: 'proctor_room_moderators' })
@Unique('uq_proctor_room_moderator', ['roomId', 'userId'])
export class ProctorRoomModerator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'room_id' })
  roomId: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;
}

@Entity({ name: 'proctor_attempts' })
@Index('idx_proctor_attempts_room', ['roomId'])
export class ProctorAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'room_id' })
  roomId: string;

  @Column({ type: 'int', name: 'attempt_number' })
  attemptNumber: number;

  @Column({ type: 'text', default: 'IN_PROGRESS' })
  status: string;

  @Column({ type: 'int', name: 'remaining_ms' })
  remainingMs: number;

  @Column({ type: 'int', name: 'duration_ms' })
  durationMs: number;

  @Column({ type: 'int', name: 'question_index', default: 0 })
  questionIndex: number;

  @Column({ type: 'timestamptz', name: 'last_tick_at', nullable: true })
  lastTickAt: Date | null;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'submitted_at', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'interrupted_at', nullable: true })
  interruptedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'superseded_at', nullable: true })
  supersededAt: Date | null;

  @Column({ type: 'text' })
  seed: string;

  @Column({ type: 'jsonb', name: 'media_status', default: () => "'{}'" })
  mediaStatus: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity({ name: 'proctor_attempt_questions' })
export class ProctorAttemptQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'attempt_id' })
  attemptId: string;

  @Column({ type: 'uuid', name: 'question_id' })
  questionId: string;

  @Column({ type: 'int', name: 'sort_order' })
  sortOrder: number;

  @Column({ type: 'text' })
  type: 'SINGLE' | 'MULTIPLE';

  @Column({ type: 'text', name: 'prompt_snapshot' })
  promptSnapshot: string;

  @Column({ type: 'text', name: 'image_url', nullable: true })
  imageUrl: string | null;

  @Column({ type: 'jsonb', name: 'options_snapshot' })
  optionsSnapshot: { id: string; text: string; isCorrect: boolean }[];

  @Column({ type: 'jsonb', name: 'option_order' })
  optionOrder: string[];

  @Column({ type: 'text', nullable: true })
  explanation: string | null;
}

@Entity({ name: 'proctor_answers' })
@Unique('uq_proctor_answer', ['attemptId', 'attemptQuestionId'])
export class ProctorAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'attempt_id' })
  attemptId: string;

  @Column({ type: 'uuid', name: 'attempt_question_id' })
  attemptQuestionId: string;

  @Column({ type: 'jsonb', name: 'selected_option_ids', default: () => "'[]'" })
  selectedOptionIds: string[];

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity({ name: 'proctor_events' })
@Index('idx_proctor_events_attempt_time', ['attemptId', 'occurredAt'])
export class ProctorEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'attempt_id' })
  attemptId: string;

  @Column({ type: 'uuid', name: 'room_id' })
  roomId: string;

  @Column({ type: 'text', name: 'client_event_id', nullable: true })
  clientEventId: string | null;

  @Column({ type: 'text' })
  type: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity({ name: 'proctor_results' })
@Unique('uq_proctor_result_attempt', ['attemptId'])
export class ProctorResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'attempt_id' })
  attemptId: string;

  @Column({ type: 'uuid', name: 'room_id' })
  roomId: string;

  @Column({ type: 'uuid', name: 'safety_record_id' })
  safetyRecordId: string;

  @Column({ type: 'int', name: 'correct_count' })
  correctCount: number;

  @Column({ type: 'int', name: 'question_count' })
  questionCount: number;

  @Column({ type: 'int', name: 'score_percent' })
  scorePercent: number;

  @Column({ type: 'text', name: 'grade_label' })
  gradeLabel: string;

  @Column({ type: 'boolean' })
  passed: boolean;

  @Column({ type: 'date', name: 'next_exam_date', nullable: true })
  nextExamDate: string | null;

  @Column({ type: 'boolean', name: 'requires_review', default: false })
  requiresReview: boolean;

  @Column({ type: 'timestamptz', name: 'finalized_at' })
  finalizedAt: Date;
}

@Entity({ name: 'proctor_recordings' })
export class ProctorRecording {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'attempt_id' })
  attemptId: string;

  @Column({ type: 'text' })
  kind: string;

  @Column({ type: 'int' })
  sequence: number;

  @Column({ type: 'text', name: 'storage_path' })
  storagePath: string;

  @Column({ type: 'text', nullable: true })
  checksum: string | null;

  @Column({ type: 'int', name: 'size_bytes', default: 0 })
  sizeBytes: number;

  @Column({ type: 'int', name: 'duration_ms', default: 0 })
  durationMs: number;

  @Column({ type: 'text', name: 'upload_state', default: 'PENDING' })
  uploadState: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity({ name: 'proctor_upload_jobs' })
export class ProctorUploadJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'recording_id' })
  recordingId: string;

  @Column({ type: 'uuid', name: 'attempt_id' })
  attemptId: string;

  @Column({ type: 'text', default: 'PENDING' })
  state: string;

  @Column({ type: 'int', default: 0 })
  retries: number;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError: string | null;

  @Column({ type: 'int', name: 'checkpoint_bytes', default: 0 })
  checkpointBytes: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity({ name: 'proctor_violations' })
@Index('idx_proctor_violations_room', ['roomId', 'occurredAt'])
export class ProctorViolation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'room_id' })
  roomId: string;

  @Column({ type: 'uuid', name: 'attempt_id', nullable: true })
  attemptId: string | null;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  code: string;

  @Column({ type: 'text', name: 'process_name', default: '' })
  processName: string;

  @Column({ type: 'text', name: 'window_title', nullable: true })
  windowTitle: string | null;

  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt: Date;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;
}
