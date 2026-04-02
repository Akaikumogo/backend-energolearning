import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExamAssignment } from './exam-assignment.entity';

@Entity({ name: 'exam_attempts' })
export class ExamAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ExamAssignment, (a) => a.attempts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment: ExamAssignment;

  @Column({ type: 'uuid', name: 'assignment_id' })
  assignmentId: string;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'submitted_at', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'int', name: 'score_percent', nullable: true })
  scorePercent: number | null;

  // Stores selected answers and generated question set (no correctness exposed to mods)
  @Column({ type: 'jsonb', nullable: true })
  payload: any | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

