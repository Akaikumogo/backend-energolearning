import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NesEmployee } from './nes-employee.entity';

@Entity({ name: 'nes_employee_position_history' })
export class NesEmployeePositionHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId: string;

  @ManyToOne(() => NesEmployee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: NesEmployee;

  @Column({ type: 'text', name: 'personnel_number' })
  personnelNumber: string;

  @Column({ type: 'text', name: 'organization_name' })
  organizationName: string;

  @Column({ type: 'text', default: '' })
  division: string;

  @Column({ type: 'text', default: '' })
  post: string;

  @Column({ type: 'timestamptz', name: 'effective_at', nullable: true })
  effectiveAt: Date | null;

  @Column({ type: 'timestamptz', name: 'source_created_at', nullable: true })
  sourceCreatedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'source_updated_at', nullable: true })
  sourceUpdatedAt: Date | null;

  @Column({ type: 'jsonb', name: 'raw_payload' })
  rawPayload: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
