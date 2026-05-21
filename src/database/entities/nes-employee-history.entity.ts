import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NesEmployee } from './nes-employee.entity';

@Entity({ name: 'nes_employee_history' })
export class NesEmployeeHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId: string;

  @ManyToOne(() => NesEmployee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: NesEmployee;

  @Column({ type: 'text', name: 'personnel_number' })
  personnelNumber: string;

  @Column({ type: 'text' })
  event: 'created' | 'updated';

  @Column({ type: 'jsonb' })
  changes: Record<string, { old: unknown; new: unknown }>;

  @Column({ type: 'jsonb', name: 'snapshot' })
  snapshot: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
