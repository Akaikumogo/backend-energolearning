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

  @Column({ type: 'text', name: 'title_1c', nullable: true })
  title1c: string | null;

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

