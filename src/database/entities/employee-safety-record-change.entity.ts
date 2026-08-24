import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EmployeeSafetyRecord } from './employee-safety-record.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';

export type SafetyChangeAction =
  | 'CREATE'
  | 'UPDATE'
  | 'APPROVE'
  | 'REJECT'
  | 'DELETE';
export type SafetyChangeApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

@Entity({ name: 'employee_safety_record_changes' })
@Index('idx_safety_changes_pending_org', ['organizationId', 'approvalStatus'])
@Index('idx_safety_changes_record', ['recordId'])
export class EmployeeSafetyRecordChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'record_id' })
  recordId: string;

  @ManyToOne(() => EmployeeSafetyRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'record_id' })
  record: EmployeeSafetyRecord;

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

  @Column({ type: 'text', name: 'record_type_code' })
  recordTypeCode: string;

  @Column({ type: 'text', name: 'section_slug' })
  sectionSlug: string;

  @Column({ type: 'text' })
  action: SafetyChangeAction;

  @Column({ type: 'jsonb', name: 'old_data', nullable: true })
  oldData: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'new_data', nullable: true })
  newData: Record<string, unknown> | null;

  @Column({ type: 'uuid', name: 'changed_by' })
  changedBy: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'changed_by' })
  changedByUser: User;

  @CreateDateColumn({ name: 'changed_at' })
  changedAt: Date;

  @Column({ type: 'text', name: 'approval_status', default: 'PENDING' })
  approvalStatus: SafetyChangeApprovalStatus;

  @Column({ type: 'uuid', name: 'reviewed_by', nullable: true })
  reviewedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewedByUser: User | null;

  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'text', name: 'review_note', nullable: true })
  reviewNote: string | null;

  @Column({ type: 'uuid', name: 'notification_id', nullable: true })
  notificationId: string | null;
}
