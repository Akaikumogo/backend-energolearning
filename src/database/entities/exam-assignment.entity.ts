import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExamAssignmentStatus } from '../../common/enums/exam-assignment-status.enum';
import { Exam } from './exam.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { ExamAttempt } from './exam-attempt.entity';

@Entity({ name: 'exam_assignments' })
export class ExamAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Exam, (e) => e.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exam_id' })
  exam: Exam;

  @Column({ type: 'uuid', name: 'exam_id' })
  examId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @Column({ type: 'timestamptz', name: 'suggested_at' })
  suggestedAt: Date;

  @Column({ type: 'timestamptz', name: 'window_start' })
  windowStart: Date;

  @Column({ type: 'timestamptz', name: 'window_end' })
  windowEnd: Date;

  @Column({ type: 'timestamptz', name: 'scheduled_at', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'text', default: ExamAssignmentStatus.PENDING })
  status: ExamAssignmentStatus;

  @OneToMany(() => ExamAttempt, (a) => a.assignment)
  attempts: ExamAttempt[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

