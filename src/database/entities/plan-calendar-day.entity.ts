import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PlanCalendarDaySource = 'HOLIDAY' | 'ADMIN';

/** Hamma uchun kun sozlamasi. Qator yo'q = avtomatik (shanba/yakshanba dam, qolgani ish kuni). */
@Entity({ name: 'plan_calendar_days' })
export class PlanCalendarDay {
  @PrimaryColumn({ type: 'date' })
  day: string;

  /** null = norma o'zgartirilmagan (dam olish kuni bo'lsa 0, aks holda xodim normasi / 10). */
  @Column({ type: 'int', nullable: true })
  goal: number | null;

  /** null = avtomatik (hafta kuni bo'yicha); true = dam olish; false = ish kuni (shanba bo'lsa ham). */
  @Column({ type: 'boolean', name: 'is_day_off', nullable: true })
  isDayOff: boolean | null;

  @Column({ type: 'text', name: 'holiday_name', nullable: true })
  holidayName: string | null;

  @Column({ type: 'varchar', length: 16, default: 'ADMIN' })
  source: PlanCalendarDaySource;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
