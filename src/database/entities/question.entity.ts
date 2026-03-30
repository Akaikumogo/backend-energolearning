import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Level } from './level.entity';
import { Theory } from './theory.entity';
import { User } from './user.entity';
import { QuestionOption } from './question-option.entity';
import { QuestionType } from '../../common/enums/question-type.enum';

@Entity({ name: 'questions' })
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Level, (l) => l.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'level_id' })
  level: Level;

  @Column({ type: 'uuid', name: 'level_id' })
  levelId: string;

  @ManyToOne(() => Theory, (t) => t.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'theory_id' })
  theory: Theory;

  @Column({ type: 'uuid', name: 'theory_id' })
  theoryId: string;

  @Column({ type: 'text', default: QuestionType.SINGLE_CHOICE })
  type: QuestionType;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'int', name: 'order_index', default: 0 })
  orderIndex: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdById: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => QuestionOption, (o) => o.question, { cascade: true })
  options: QuestionOption[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
