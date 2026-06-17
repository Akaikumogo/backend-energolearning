import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Organization } from './organization.entity';

export enum ActivityEventType {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  HEARTBEAT = 'HEARTBEAT',
  MODULE_OPENED = 'MODULE_OPENED',
  THEORY_OPENED = 'THEORY_OPENED',
  QUESTION_ANSWERED = 'QUESTION_ANSWERED',
  TEST_STARTED = 'TEST_STARTED',
  TEST_FINISHED = 'TEST_FINISHED',
  CERTIFICATE_VIEWED = 'CERTIFICATE_VIEWED',
}

@Entity({ name: 'user_activity_events' })
@Index('idx_activity_user_created', ['userId', 'createdAt'])
@Index('idx_activity_org_created', ['organizationId', 'createdAt'])
@Index('idx_activity_type_created', ['eventType', 'createdAt'])
export class UserActivityEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization | null;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'text', name: 'event_type' })
  eventType: ActivityEventType;

  @Column({ type: 'text', name: 'entity_type', nullable: true })
  entityType: string | null;

  @Column({ type: 'uuid', name: 'entity_id', nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
