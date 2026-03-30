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

@Entity({ name: 'certificates' })
export class Certificate {
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
  @JoinColumn({ name: 'level_id' })
  level: Level | null;

  @Column({ type: 'uuid', name: 'level_id', nullable: true })
  levelId: string | null;

  @Column({ type: 'text', name: 'file_url', nullable: true })
  fileUrl: string | null;

  @Column({ type: 'timestamptz', name: 'issued_at', default: () => 'NOW()' })
  issuedAt: Date;
}
