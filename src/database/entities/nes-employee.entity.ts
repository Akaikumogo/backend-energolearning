import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { User } from './user.entity';

@Entity({ name: 'nes_employees' })
export class NesEmployee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true, name: 'personnel_number' })
  personnelNumber: string;

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

  @Column({ type: 'text', name: 'organization_name' })
  organizationName: string;

  @Column({ type: 'text', default: '' })
  division: string;

  @Column({ type: 'text', default: '' })
  post: string;

  @Column({ type: 'text', name: 'full_name', default: '' })
  fullName: string;

  @Column({ type: 'text', name: 'last_name', default: '' })
  lastName: string;

  @Column({ type: 'text', name: 'first_name', default: '' })
  firstName: string;

  @Column({ type: 'text', name: 'middle_name', default: '' })
  middleName: string;

  @Column({ type: 'timestamptz', name: 'modified_at', nullable: true })
  modifiedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'hired_at', nullable: true })
  hiredAt: Date | null;

  @Column({ type: 'text' })
  login: string;

  @Column({ type: 'text', name: 'initial_password', nullable: true })
  initialPassword: string | null;

  @Column({ type: 'jsonb', name: 'raw_payload' })
  rawPayload: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'last_synced_at' })
  lastSyncedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
