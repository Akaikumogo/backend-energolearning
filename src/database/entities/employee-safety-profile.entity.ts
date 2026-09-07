import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

/** Beydj / B-ilova hujjat darajasidagi maydonlar (maxsus ishlar va h.k.). */
@Entity({ name: 'employee_safety_profiles' })
export class EmployeeSafetyProfile {
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text', name: 'special_works', default: 'Йўқ' })
  specialWorks: string;

  @Column({ type: 'text', name: 'special_work_type', default: 'Йўқ' })
  specialWorkType: string;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updatedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updatedByUser: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
