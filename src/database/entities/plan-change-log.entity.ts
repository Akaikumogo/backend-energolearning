import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type PlanChangeKind = 'CALENDAR_DAY' | 'USER_NORM' | 'USER_DAY';
export type PlanChangeAction = 'SET' | 'RESET';

/** Plan o'zgarishlari tarixi (kim, kimning, qaysi kun, eski → yangi). */
@Entity({ name: 'plan_change_logs' })
export class PlanChangeLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'actor_id', nullable: true })
  actorId: string | null;

  /** null = hamma uchun (kalendar kuni). */
  @Column({ type: 'uuid', name: 'target_user_id', nullable: true })
  targetUserId: string | null;

  @Column({ type: 'varchar', length: 16 })
  kind: PlanChangeKind;

  @Column({ type: 'varchar', length: 8 })
  action: PlanChangeAction;

  @Column({ type: 'date', nullable: true })
  day: string | null;

  @Column({ type: 'int', name: 'old_goal', nullable: true })
  oldGoal: number | null;

  @Column({ type: 'int', name: 'new_goal', nullable: true })
  newGoal: number | null;

  @Column({ type: 'jsonb', name: 'old_value', nullable: true })
  oldValue: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'new_value', nullable: true })
  newValue: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
