import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'terminated_employees' })
export class TerminatedEmployee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'uuid', name: 'energo_id', nullable: true })
  energoId: string | null;

  @Column({ type: 'text', name: 'personnel_number', nullable: true })
  personnelNumber: string | null;

  @Column({ type: 'text' })
  login: string;

  @Column({ type: 'text', name: 'first_name', default: '' })
  firstName: string;

  @Column({ type: 'text', name: 'last_name', default: '' })
  lastName: string;

  @Column({ type: 'text', name: 'organization_name', nullable: true })
  organizationName: string | null;

  @Column({ type: 'text', default: '' })
  division: string;

  @Column({ type: 'text', default: '' })
  post: string;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  snapshot: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'terminated_at' })
  terminatedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
