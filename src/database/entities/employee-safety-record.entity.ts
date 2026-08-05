import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { SafetyRecordType } from './safety-record-type.entity';
import { User } from './user.entity';

export type SafetyApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

@Entity({ name: 'employee_safety_records' })
@Index('idx_safety_records_user_type', ['userId', 'recordTypeId'])
@Index('idx_safety_records_org', ['organizationId'])
export class EmployeeSafetyRecord {
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

  @Column({ type: 'uuid', name: 'record_type_id' })
  recordTypeId: string;

  @ManyToOne(() => SafetyRecordType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'record_type_id' })
  recordType: SafetyRecordType;

  @Column({ type: 'date', name: 'exam_date', nullable: true })
  examDate: string | null;

  @Column({ type: 'text', name: 'exam_reason', nullable: true })
  examReason: string | null;

  @Column({ type: 'text', nullable: true })
  grade: string | null;

  @Column({ type: 'text', name: 'qualification_group', nullable: true })
  qualificationGroup: string | null;

  @Column({ type: 'date', name: 'next_exam_date', nullable: true })
  nextExamDate: string | null;

  @Column({ type: 'text', name: 'rule_name', nullable: true })
  ruleName: string | null;

  @Column({ type: 'text', name: 'commission_decision', nullable: true })
  commissionDecision: string | null;

  @Column({ type: 'text', name: 'protocol_number', nullable: true })
  protocolNumber: string | null;

  @Column({ type: 'date', name: 'protocol_date', nullable: true })
  protocolDate: string | null;

  @Column({ type: 'text', name: 'doctor_conclusion', nullable: true })
  doctorConclusion: string | null;

  @Column({ type: 'boolean', name: 'is_latest', default: true })
  isLatest: boolean;

  @Column({ type: 'text', name: 'approval_status', default: 'PENDING' })
  approvalStatus: SafetyApprovalStatus;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdByUser: User | null;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updatedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updatedByUser: User | null;

  @Column({ type: 'uuid', name: 'approved_by', nullable: true })
  approvedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedByUser: User | null;

  @Column({ type: 'timestamptz', name: 'approved_at', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
