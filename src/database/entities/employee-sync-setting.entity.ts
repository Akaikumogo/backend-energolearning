import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'employee_sync_settings' })
export class EmployeeSyncSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true, default: 'energo-id' })
  source: string;

  @Column({ type: 'text', name: 'daily_sync_time', default: '23:45' })
  dailySyncTime: string;

  @Column({ type: 'text', default: 'Asia/Tashkent' })
  timezone: string;

  @Column({ type: 'date', name: 'last_run_date', nullable: true })
  lastRunDate: string | null;

  @Column({ type: 'timestamptz', name: 'last_run_at', nullable: true })
  lastRunAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
