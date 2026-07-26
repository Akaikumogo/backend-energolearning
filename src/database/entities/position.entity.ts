import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserPosition } from './user-position.entity';
import { ExamQuestionPosition } from './exam-question-position.entity';
import { LevelPosition } from './level-position.entity';

@Entity({ name: 'positions' })
export class Position {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  title: string;

  @Column({ type: 'int', name: 'employee_count', default: 0 })
  employeeCount: number;

  @Column({ type: 'timestamptz', name: 'last_synced_at', nullable: true })
  lastSyncedAt: Date | null;

  /** manual | energo-id */
  @Column({ type: 'text', default: 'manual' })
  source: string;

  @OneToMany(() => UserPosition, (up) => up.position)
  users: UserPosition[];

  @OneToMany(() => ExamQuestionPosition, (eqp) => eqp.position)
  examQuestionLinks: ExamQuestionPosition[];

  @OneToMany(() => LevelPosition, (lp) => lp.position)
  levelLinks: LevelPosition[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}

