import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { User } from './user.entity';

export type ReportSubmissionEmployeeRow = {
  email: string;
  fullName: string;
  daysCompleted: number;
  monthlyPercent: number;
  extraCorrectTotal: number;
  dayLabels: string[];
};

export type ReportIntegrityStatus = 'ok' | 'tampered' | 'unsigned';

export type ReportSubmissionPayload = {
  orgId: string;
  orgName: string;
  month: string;
  daysInMonth: number;
  dailyGoalCorrect: number;
  employees: ReportSubmissionEmployeeRow[];
  exportId?: string | null;
};

@Entity({ name: 'report_submissions' })
@Index('idx_report_submissions_org_month', ['organizationId', 'month'])
@Index('idx_report_submissions_uploaded_at', ['createdAt'])
export class ReportSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @Column({ type: 'varchar', length: 7 })
  month: string;

  @Column({ type: 'text', name: 'org_name' })
  orgName: string;

  @Column({ type: 'text', name: 'file_name' })
  fileName: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedBy: User | null;

  @Column({ type: 'uuid', name: 'uploaded_by_user_id', nullable: true })
  uploadedByUserId: string | null;

  @Column({ type: 'jsonb' })
  payload: ReportSubmissionPayload;

  @Column({ type: 'int', name: 'employee_count', default: 0 })
  employeeCount: number;

  /** META dagi HMAC (export paytida yoziladi). */
  @Column({ type: 'varchar', length: 128, name: 'content_hash', nullable: true })
  contentHash: string | null;

  /** ok | tampered | unsigned */
  @Column({
    type: 'varchar',
    length: 32,
    name: 'integrity_status',
    default: 'unsigned',
  })
  integrityStatus: ReportIntegrityStatus;

  /** Excel META exportId — bir xil faylni kuzatish uchun. */
  @Column({ type: 'uuid', name: 'export_id', nullable: true })
  exportId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
