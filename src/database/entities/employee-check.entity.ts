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
import { EmployeeCheckType } from '../../common/enums/employee-check-type.enum';

@Entity({ name: 'employee_checks' })
@Index('ix_employee_checks_user', ['userId'])
@Index('ix_employee_checks_user_type', ['userId', 'type'])
export class EmployeeCheck {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'text', name: 'type' })
  type: EmployeeCheckType;

  @Column({ type: 'date', name: 'check_date' })
  checkDate: string;

  @Column({ type: 'text', name: 'reason', nullable: true })
  reason: string | null;

  @Column({ type: 'text', name: 'grade', nullable: true })
  grade: string | null;

  @Column({ type: 'date', name: 'next_check_date', nullable: true })
  nextCheckDate: string | null;

  @Column({ type: 'text', name: 'commission_leader_signature', nullable: true })
  commissionLeaderSignature: string | null;

  // Optional fields by type
  @Column({ type: 'text', name: 'qualification_group', nullable: true })
  qualificationGroup: string | null;

  @Column({ type: 'text', name: 'rule_name', nullable: true })
  ruleName: string | null;

  @Column({ type: 'text', name: 'conclusion', nullable: true })
  conclusion: string | null;

  @Column({ type: 'text', name: 'doctor_conclusion', nullable: true })
  doctorConclusion: string | null;

  @Column({ type: 'text', name: 'responsible_signature', nullable: true })
  responsibleSignature: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: User | null;

  @Column({ type: 'uuid', name: 'created_by_user_id', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

