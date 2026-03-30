import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Organization } from './organization.entity';
import { Level } from './level.entity';

@Entity({ name: 'user_progress' })
export class UserProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
  @JoinColumn({ name: 'current_level_id' })
  currentLevel: Level | null;

  @Column({ type: 'uuid', name: 'current_level_id', nullable: true })
  currentLevelId: string | null;

  @Column({ type: 'int', name: 'hearts_count', default: 5 })
  heartsCount: number;

  @Column({ type: 'timestamptz', name: 'last_heart_regen_at', nullable: true })
  lastHeartRegenAt: Date | null;

  @Column({ type: 'int', name: 'completed_levels_count', default: 0 })
  completedLevelsCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
