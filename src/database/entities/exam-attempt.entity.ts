import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OralResult } from '../../common/enums/oral-result.enum';
import { ExamAssignment } from './exam-assignment.entity';
import { ExamSession } from './exam-session.entity';
import { User } from './user.entity';
import { ExamAttemptAnswer } from './exam-attempt-answer.entity';

@Entity({ name: 'exam_attempts' })
export class ExamAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ExamAssignment, (a) => a.attempts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment: ExamAssignment;

  @Column({ type: 'uuid', name: 'assignment_id' })
  assignmentId: string;

  @OneToOne(() => ExamSession, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'session_id' })
  session: ExamSession | null;

  /** Yangi jarayon: har attempt bitta sessiyaga bog‘lanadi (legacy qatorlar null) */
  @Column({ type: 'uuid', name: 'session_id', unique: true, nullable: true })
  sessionId: string | null;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'submitted_at', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'int', name: 'score_percent', nullable: true })
  scorePercent: number | null;

  @Column({ type: 'int', name: 'pt_score_percent', nullable: true })
  ptScorePercent: number | null;

  @Column({ type: 'int', name: 'tb_score_percent', nullable: true })
  tbScorePercent: number | null;

  @Column({ type: 'timestamptz', name: 'pt_started_at', nullable: true })
  ptStartedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'pt_submitted_at', nullable: true })
  ptSubmittedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'tb_started_at', nullable: true })
  tbStartedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'tb_submitted_at', nullable: true })
  tbSubmittedAt: Date | null;

  @Column({ type: 'text', name: 'oral_result', nullable: true })
  oralResult: OralResult | null;

  @Column({ type: 'text', name: 'oral_feedback', nullable: true })
  oralFeedback: string | null;

  @Column({ type: 'uuid', name: 'oral_reviewed_by_id', nullable: true })
  oralReviewedById: string | null;

  @Column({ type: 'timestamptz', name: 'oral_reviewed_at', nullable: true })
  oralReviewedAt: Date | null;

  /** Moderator tanlagan keyingi imtihon oralig‘i (oy) */
  @Column({ type: 'int', name: 'next_exam_months', nullable: true })
  nextExamMonths: number | null;

  @Column({ type: 'timestamptz', name: 'finalized_at', nullable: true })
  finalizedAt: Date | null;

  // Stores selected answers and generated question set (no correctness exposed to mods)
  @Column({ type: 'jsonb', nullable: true })
  payload: any | null;

  @OneToMany(() => ExamAttemptAnswer, (x) => x.attempt)
  answers: ExamAttemptAnswer[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
