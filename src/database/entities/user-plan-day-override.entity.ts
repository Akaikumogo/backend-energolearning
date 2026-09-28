import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Xodimning aniq kun uchun kunlik plan normasi (hamma uchun sozlamadan ustun). */
@Entity({ name: 'user_plan_day_overrides' })
@Unique('uq_user_plan_day', ['userId', 'day'])
export class UserPlanDayOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'date' })
  day: string;

  @Column({ type: 'int' })
  goal: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
