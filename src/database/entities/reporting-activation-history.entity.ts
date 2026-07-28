import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { User } from './user.entity';

export type ReportingActivationScope =
  | 'organization'
  | 'division'
  | 'employee';

@Entity({ name: 'reporting_activation_history' })
export class ReportingActivationHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', name: 'scope_type' })
  scopeType: ReportingActivationScope;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization | null;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'text', name: 'division_name', nullable: true })
  divisionName: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId: string | null;

  @Column({ type: 'boolean', name: 'is_active' })
  isActive: boolean;

  @Column({
    type: 'timestamptz',
    name: 'changed_at',
    default: () => 'now()',
  })
  changedAt: Date;

  @Column({ type: 'uuid', name: 'changed_by_user_id', nullable: true })
  changedByUserId: string | null;
}
