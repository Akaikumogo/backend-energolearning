import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Organization } from './organization.entity';
import { Level } from './level.entity';
import { ExamAttempt } from './exam-attempt.entity';

/** Xodimning bilim sinovi guvohnomasi. */
@Entity({ name: 'certificates' })
export class Certificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Takrorlanmas raqam, filial prefiksi bilan (masalan BU0001). */
  @Column({ type: 'text', name: 'certificate_number' })
  certificateNumber: string;

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

  @ManyToOne(() => Level, { nullable: true })
  @JoinColumn({ name: 'level_id' })
  level: Level | null;

  @Column({ type: 'uuid', name: 'level_id', nullable: true })
  levelId: string | null;

  // Berilgan paytdagi nusxa — xodim keyin lavozimini o'zgartirsa ham o'zgarmaydi.

  @Column({ type: 'text', name: 'full_name', default: '' })
  fullName: string;

  @Column({ type: 'text', name: 'last_name', default: '' })
  lastName: string;

  @Column({ type: 'text', name: 'first_name', default: '' })
  firstName: string;

  @Column({ type: 'text', name: 'middle_name', default: '' })
  middleName: string;

  @Column({ type: 'text', name: 'position_title', default: '' })
  positionTitle: string;

  @Column({ type: 'text', name: 'branch_name', default: '' })
  branchName: string;

  @Column({ type: 'text', name: 'personnel_number', nullable: true })
  personnelNumber: string | null;

  @ManyToOne(() => ExamAttempt, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'exam_attempt_id' })
  examAttempt: ExamAttempt | null;

  @Column({ type: 'uuid', name: 'exam_attempt_id', nullable: true })
  examAttemptId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'issued_by_user_id' })
  issuedByUser: User | null;

  @Column({ type: 'uuid', name: 'issued_by_user_id', nullable: true })
  issuedByUserId: string | null;

  @Column({ type: 'text', name: 'file_url', nullable: true })
  fileUrl: string | null;

  @Column({ type: 'timestamptz', name: 'issued_at', default: () => 'NOW()' })
  issuedAt: Date;

  /** Keyingi imtihongacha bo'lgan muddat (ExamAttempt.nextExamMonths dan). */
  @Column({ type: 'timestamptz', name: 'valid_until', nullable: true })
  validUntil: Date | null;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'text', name: 'revoke_reason', nullable: true })
  revokeReason: string | null;
}
