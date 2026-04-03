import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExamSessionStatus } from '../../common/enums/exam-session-status.enum';
import { ExamAssignment } from './exam-assignment.entity';
import { User } from './user.entity';

@Entity({ name: 'exam_sessions' })
export class ExamSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ExamAssignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment: ExamAssignment;

  @Column({ type: 'uuid', name: 'assignment_id' })
  assignmentId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'text', default: ExamSessionStatus.WAITING_MODERATOR })
  status: ExamSessionStatus;

  @Column({ type: 'text', name: 'otp_hash', nullable: true })
  otpHash: string | null;

  @Column({ type: 'timestamptz', name: 'otp_expires_at', nullable: true })
  otpExpiresAt: Date | null;

  @Column({ type: 'int', name: 'tab_switch_count', default: 0 })
  tabSwitchCount: number;

  @Column({ type: 'text', name: 'rejection_reason', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'uuid', name: 'approved_by_user_id', nullable: true })
  approvedByUserId: string | null;

  /** PT | TB — qaysi bo‘lim hozir faol */
  @Column({ type: 'text', name: 'active_section', nullable: true })
  activeSection: 'PT' | 'TB' | null;

  @Column({ type: 'boolean', name: 'pt_completed', default: false })
  ptCompleted: boolean;

  @Column({ type: 'boolean', name: 'tb_completed', default: false })
  tbCompleted: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
