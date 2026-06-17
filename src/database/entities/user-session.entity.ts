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
import { User } from './user.entity';
import { Organization } from './organization.entity';

@Entity({ name: 'user_sessions' })
@Index('idx_user_sessions_user_online', ['userId', 'isOnline'])
@Index('idx_user_sessions_last_seen', ['lastSeenAt'])
export class UserSession {
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

  @Column({ type: 'timestamptz', name: 'login_at', default: () => 'NOW()' })
  loginAt: Date;

  @Column({ type: 'timestamptz', name: 'logout_at', nullable: true })
  logoutAt: Date | null;

  @Column({ type: 'timestamptz', name: 'last_seen_at', default: () => 'NOW()' })
  lastSeenAt: Date;

  @Column({ type: 'boolean', name: 'is_online', default: true })
  isOnline: boolean;

  @Column({ type: 'text', name: 'ip_address', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', name: 'user_agent', nullable: true })
  userAgent: string | null;

  @Column({ type: 'int', name: 'duration_seconds', default: 0 })
  durationSeconds: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
