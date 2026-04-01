import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Organization } from './organization.entity';

@Entity({ name: 'moderator_violations' })
export class ModeratorViolation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'moderator_user_id' })
  moderatorUser: User;

  @Column({ type: 'uuid', name: 'moderator_user_id' })
  moderatorUserId: string;

  @ManyToOne(() => Organization, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization | null;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'text', name: 'action_key' })
  actionKey: string;

  @Column({ type: 'text' })
  method: string;

  @Column({ type: 'text' })
  path: string;

  @Column({ type: 'text', name: 'request_body_preview', nullable: true })
  requestBodyPreview: string | null;

  @Column({ type: 'text', nullable: true })
  ip: string | null;

  @Column({ type: 'text', name: 'user_agent', nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

